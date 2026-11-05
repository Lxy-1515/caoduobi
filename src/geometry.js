(function (P) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Radius is a circle radius, a square half-side, or a triangle circumradius.
  // Constant edge inset: triangle circumradius shrinks by twice its edge inset.
  function polygon(type, radius, inset = 0) {
    if(/^coin[3-6]$/.test(type)){
      const sides=+type.at(-1),r=Math.max(0,radius-inset/Math.cos(Math.PI/sides));
      return Array.from({length:sides},(_,i)=>{const a=-Math.PI/2+i*Math.PI*2/sides;return{x:Math.cos(a)*r,y:Math.sin(a)*r};});
    }
    if (type === 'fast') {
      const r = Math.max(0, radius - inset);
      return [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
    }
    if (type === 'split' || type === 'child') {
      const r = Math.max(0, radius - 2 * inset);
      return [{ x: 0, y: -r }, { x: Math.sqrt(3) * r / 2, y: r / 2 }, { x: -Math.sqrt(3) * r / 2, y: r / 2 }];
    }
    return null;
  }
  function pointSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
  }
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function segments(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0;
    return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
  }
  function inside(p, vertices) { return vertices.every((v, i) => cross(v, vertices[(i + 1) % vertices.length], p) >= -1e-9); }
  function relative(a, b) {
    return [{ x: (a.px ?? a.x) - (b.px ?? b.x), y: (a.py ?? a.y) - (b.py ?? b.y) }, { x: a.x - b.x, y: a.y - b.y }];
  }
  function sweptCircle(a, b, radius) {
    const [from, to] = relative(a, b);
    return pointSegment({ x: 0, y: 0 }, from, to) <= radius * radius;
  }
  function hits(player, hazard, { playerInset = P.config.playerInset, hazardInset = P.config.hazardInset } = {}) {
    const radius = Math.max(0, player.r - playerInset);
    const vertices = polygon(hazard.type, hazard.r, hazardInset);
    if (!vertices) return sweptCircle(player, hazard, radius + Math.max(0, hazard.r - hazardInset));
    if (!sweptCircle(player, hazard, radius + Math.max(...vertices.map(v => Math.hypot(v.x, v.y))))) return false;
    const [from, to] = relative(player, hazard);
    const startAngle = hazard.previousAngle ?? hazard.angle ?? 0, endAngle = hazard.angle ?? 0;
    if (Math.abs(endAngle - startAngle) > 1e-10) {
      // Conservative advancement uses an upper bound on relative linear + angular
      // motion. Each step stays within proven empty space, even during rotation.
      const angular = Math.abs(endAngle - startAngle);
      const bound = Math.hypot(to.x - from.x, to.y - from.y) + angular * Math.max(...vertices.map(v => Math.hypot(v.x, v.y)));
      let t = 0;
      for (let i = 0; i < 160; i++) {
        const angle = startAngle + (endAngle - startAngle) * t, c = Math.cos(angle), s = Math.sin(angle);
        const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
        const local = { x: x * c + y * s, y: -x * s + y * c };
        if (inside(local, vertices)) return true;
        const gap = Math.sqrt(Math.min(...vertices.map((v, j) => pointSegment(local, v, vertices[(j + 1) % vertices.length])))) - radius;
        if (gap <= 1e-6) return true;
        if (t >= 1 || gap > bound * (1 - t) + 1e-6) return false;
        t = Math.min(1, t + Math.max(1e-8, gap / (bound || 1) * .95));
      }
      return false;
    }
    const c = Math.cos(endAngle), s = Math.sin(endAngle);
    for (const v of [from, to]) { const x = v.x; v.x = x * c + v.y * s; v.y = -x * s + v.y * c; }
    if (inside(from, vertices) || inside(to, vertices)) return true;
    // A moving circle hits a polygon exactly when its center segment comes within
    // its radius of a polygon edge. No bounding-circle approximation or tunnelling.
    return vertices.some((v, i) => segments(from, to, v, vertices[(i + 1) % vertices.length]) <= radius * radius);
  }
  function overlapDepth(a, b) {
    const distance = Math.hypot(a.x-b.x, a.y-b.y);
    const bound = h => h.r * (h.type === 'fast' ? Math.SQRT2 : 1);
    if (distance >= bound(a) + bound(b)) return 0;
    const world = h => {
      const vertices = polygon(h.type, h.r), c = Math.cos(h.angle || 0), s = Math.sin(h.angle || 0);
      return vertices?.map(v => ({ x:h.x+v.x*c-v.y*s, y:h.y+v.x*s+v.y*c }));
    };
    const av = world(a), bv = world(b);
    if (!av && !bv) return a.r + b.r - distance;
    const axes = [];
    for (const vertices of [av,bv]) if (vertices) vertices.forEach((v,i) => {
      const next=vertices[(i+1)%vertices.length], dx=next.x-v.x, dy=next.y-v.y, length=Math.hypot(dx,dy);
      axes.push({x:-dy/length,y:dx/length});
    });
    if (!av || !bv) {
      const circle = av ? b : a, vertices = av || bv;
      const nearest=vertices.reduce((best,v)=>Math.hypot(v.x-circle.x,v.y-circle.y)<Math.hypot(best.x-circle.x,best.y-circle.y)?v:best);
      const dx=nearest.x-circle.x,dy=nearest.y-circle.y,length=Math.hypot(dx,dy);
      if(length>1e-9) axes.push({x:dx/length,y:dy/length});
    }
    const project=(h,vertices,axis)=>{
      if(!vertices){const center=h.x*axis.x+h.y*axis.y;return [center-h.r,center+h.r];}
      const values=vertices.map(v=>v.x*axis.x+v.y*axis.y);return [Math.min(...values),Math.max(...values)];
    };
    let depth=Infinity;
    for(const axis of axes){
      const [amin,amax]=project(a,av,axis),[bmin,bmax]=project(b,bv,axis);
      // This also handles complete containment, not only intersecting edges.
      const penetration=Math.min(amax-bmin,bmax-amin);
      if(penetration<=0)return 0;
      depth=Math.min(depth,penetration);
    }
    return depth;
  }
  function coinBody(item){
    const sides=Number.isInteger(item.sides)&&item.sides>=3&&item.sides<=6?item.sides:5;
    return{type:'coin'+sides,x:item.x,y:item.y,px:item.px,py:item.py,angle:item.angle||0,r:P.coinStyle.radius};
  }
  P.geometry = { polygon, hits, sweptCircle, overlapDepth, coinBody };
})(globalThis.PixelDodge);
