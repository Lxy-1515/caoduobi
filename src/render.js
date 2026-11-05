(function (P) {
  'use strict';
  const C = P.config, TAU = Math.PI * 2;
  const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); };
  function contour(ctx, type, radius, inset = 0) {
    const vertices = P.geometry.polygon(type, radius, inset);
    ctx.beginPath();
    if (vertices) { ctx.moveTo(vertices[0].x, vertices[0].y); vertices.slice(1).forEach(v => ctx.lineTo(v.x, v.y)); ctx.closePath(); }
    else ctx.arc(0, 0, Math.max(0, radius - inset), 0, TAU);
  }
  function trail(ctx, points, head, color, shade, width, exclusion = 0) {
    if (points.length < 2) return;
    ctx.save();
    if (exclusion) {
      // Clip out the complete visible shape so trails never fill hollow interiors.
      ctx.beginPath(); ctx.rect(-2000, -2000, 4000, 4000);
      const vertices = P.geometry.polygon(head.type, head.r), c = Math.cos(head.angle || 0), s = Math.sin(head.angle || 0);
      if (vertices) { vertices.forEach((v, i) => { const x = head.x + v.x*c-v.y*s, y = head.y+v.x*s+v.y*c; if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.closePath(); }
      else { ctx.moveTo(head.x+head.r,head.y); ctx.arc(head.x,head.y,head.r,0,TAU); }
      ctx.clip('evenodd');
    }
    const left = [], right = [];
    points.forEach((p,i) => {
      const before = points[Math.max(0,i-1)], after = points[Math.min(points.length-1,i+1)];
      const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy)||1, half=width*.5*i/(points.length-1);
      left.push({x:p.x-dy/length*half,y:p.y+dx/length*half}); right.push({x:p.x+dy/length*half,y:p.y-dx/length*half});
    });
    const edge=left.concat(right.reverse()), first=points[0], last=points[points.length-1];
    const gradient=ctx.createLinearGradient(first.x,first.y,last.x+.001,last.y);
    gradient.addColorStop(0,shade+'00'); gradient.addColorStop(.35,shade+'50'); gradient.addColorStop(1,color+'cc');
    ctx.fillStyle=gradient; ctx.beginPath(); ctx.moveTo(edge[0].x,edge[0].y);
    for(let i=1;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function actor(ctx, x, y, skin, scale = 1) { ctx.fillStyle = skin.color; circle(ctx, x, y, C.radius * scale); ctx.fill(); }
  function whiteActor(ctx, x, y) {
    actor(ctx, x, y, P.whiteBallStyle);
    ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = .8; circle(ctx, x, y, C.radius-.4); ctx.stroke();
  }
  function hazard(ctx, h, skin, frozen = false) {
    const color = skin.palette[(h.colorIndex || 0) % skin.palette.length];
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.angle || 0);
    ctx.globalAlpha = h.spawn > 0 ? .3 : 1;
    ctx.lineWidth = h.type === 'child' ? 2.4 : 3;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = skin.monochrome ? 0 : 13;
    contour(ctx, h.type, h.r, h.type === 'large' ? 0 : ctx.lineWidth / 2);
    if (h.type === 'large') ctx.fill(); else ctx.stroke();
    ctx.shadowBlur = 0;
    if (!skin.monochrome && h.type !== 'large') { ctx.globalAlpha *= .7; ctx.lineWidth = .8; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.globalAlpha = h.spawn > 0 ? .3 : 1; }
    if (frozen) { ctx.strokeStyle = skin.monochrome ? '#111111' : '#2285ad'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); contour(ctx, h.type, h.r + 5); ctx.stroke(); }
    ctx.restore();
  }
  const ghostLife = 4;
  const ghostStroke = ghost => ghost.type === 'child' ? 2.4 : 3;
  // Visible pickup bounds: power disc includes its 1.3px outline;
  // Score fragments share their filled polygon with collection and avoidance.
  const pickupBody = item => item.type==='coin'?P.geometry.coinBody(item):({ x:item.x, y:item.y, r:item.type === 'raceOrb' ? item.r : 18.65 });
  function obstacleGhost(ctx, ghost) {
    if (ghost.age >= ghostLife) return;
    ctx.save(); ctx.translate(ghost.x, ghost.y); ctx.rotate(ghost.angle);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ghost.color; ctx.lineWidth = ghostStroke(ghost);
    ctx.shadowColor = ghost.color; ctx.shadowBlur = ghost.monochrome ? 0 : 10;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    contour(ctx, ghost.type, ghost.r, ctx.lineWidth / 2); ctx.stroke();
    if (!ghost.monochrome) { ctx.shadowBlur = 0; ctx.lineWidth = .7; ctx.globalAlpha = .65; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    ctx.restore();
  }
  function coin(ctx,item,scale=1){
    const body=P.geometry.coinBody(item);ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle);ctx.scale(scale,scale);
    ctx.fillStyle=item.color||P.coinStyle.colors[0];contour(ctx,body.type,body.r);ctx.fill();ctx.restore();
  }
  function symbol(ctx, type, x, y, scale = 1, color = P.items[type].color) {
    if(type==='coin'){coin(ctx,{x,y,sides:5,color:P.coinStyle.colors[0]},scale/1.2);return;}
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    ctx.beginPath();
    if (type === 'invincible') { ctx.moveTo(0, -8); ctx.quadraticCurveTo(4, -5, 7, -5); ctx.lineTo(6, 2); ctx.quadraticCurveTo(4, 6, 0, 9); ctx.quadraticCurveTo(-4, 6, -6, 2); ctx.lineTo(-7, -5); ctx.quadraticCurveTo(-4, -5, 0, -8); }
    else if (type === 'magnet') { ctx.moveTo(-6, -7); ctx.lineTo(-6, 1); ctx.bezierCurveTo(-6, 10, 6, 10, 6, 1); ctx.lineTo(6, -7); ctx.moveTo(-6, -3); ctx.lineTo(-3, -3); ctx.moveTo(3, -3); ctx.lineTo(6, -3); }
    else if (type === 'freeze') {
      for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * TAU / 6); ctx.moveTo(0, 0); ctx.lineTo(0, -9); ctx.moveTo(-3, -5); ctx.lineTo(0, -7); ctx.lineTo(3, -5); ctx.restore(); }
    } else if (type === 'pulse') { ctx.arc(0, 0, 3, 0, TAU); ctx.moveTo(9 * Math.cos(-.7), 9 * Math.sin(-.7)); ctx.arc(0, 0, 9, -.7, .7); ctx.moveTo(9 * Math.cos(Math.PI-.7), 9 * Math.sin(Math.PI-.7)); ctx.arc(0, 0, 9, Math.PI - .7, Math.PI + .7); }
    else { ctx.arc(0, 0, 4, 0, TAU); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7); ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); } }
    ctx.stroke(); ctx.restore();
  }
  function pickup(ctx, item, clock = 0, reduced = false, monochrome = false) {
    ctx.save(); ctx.globalAlpha = item.life < 2 && !reduced ? .55 + .45 * Math.abs(Math.sin(clock * 5)) : 1;
    if(item.type==='coin'){coin(ctx,monochrome?{...item,color:'#111111'}:item);ctx.restore();return;}
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = monochrome ? '#111111' : P.items[item.type].color + '75'; ctx.lineWidth = 1.3;
    circle(ctx, item.x, item.y, 18); ctx.fill(); ctx.stroke();
    symbol(ctx, item.type, item.x, item.y, 1, monochrome ? '#111111' : P.items[item.type].color); ctx.restore();
  }
  function staticContext(canvas) {
    const w = Number(canvas.dataset.logicalWidth || canvas.width), h = Number(canvas.dataset.logicalHeight || canvas.height);
    canvas.dataset.logicalWidth = w; canvas.dataset.logicalHeight = h;
    canvas.width = w * 2; canvas.height = h * 2;
    const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); return { ctx, w, h };
  }
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
      this.resize(C.size,C.size);
      this.clock = 0; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; this.reset();
    }
    resize(viewWidth, viewHeight) {
      const scale = Math.min(viewWidth, viewHeight) / C.size, ratio = Math.min(2, window.devicePixelRatio || 1);
      this.viewScale = scale;
      this.width = viewWidth / scale; this.height = viewHeight / scale;
      this.canvas.width = Math.round(viewWidth * ratio); this.canvas.height = Math.round(viewHeight * ratio);
      this.ctx.setTransform(scale * ratio,0,0,scale * ratio,0,0); this.ctx.imageSmoothingEnabled = true;
    }
    reset() { this.fingerActive = false; this.joystickDirection = null; this.particles = []; this.ghostShards = []; this.ghostTouchCount = 0; this.rings = []; this.freezeWaves = []; this.trail = []; this.whiteTrail = []; this.whiteTrails = new WeakMap(); this.obstacleGhosts = []; this.ghostSamples = new WeakMap(); this.ghostPlayerPrevious = null; this.ghostClearVersion = 0; }
    textInkHit(bounds,test) {
      if(!this.titleMaskEnabled)return false;
      for(const p of this.textPatches||[]){
        const x0=Math.max(0,Math.floor((bounds.left-p.left)/p.step)),x1=Math.min(p.width-1,Math.ceil((bounds.right-p.left)/p.step));
        const y0=Math.max(0,Math.floor((bounds.top-p.top)/p.step)),y1=Math.min(p.height-1,Math.ceil((bounds.bottom-p.top)/p.step));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
          if(p.alpha[y*p.width+x]&&test(p.left+(x+.5)*p.step,p.top+(y+.5)*p.step,p.step*.7072))return true;
      }
      return false;
    }
    textBlocks(body) {
      if(this.titleMaskEnabled&&this.homeMask)return this.homeMask.blocks(body);
      const half=ghostStroke(body)/2,radius=Math.max(0,body.r-half);
      const vertices=P.geometry.polygon(body.type,body.r,half),c=Math.cos(body.angle||0),s=Math.sin(body.angle||0);
      const reach=body.r*(body.type==='fast'?Math.SQRT2:1);
      return this.textInkHit({left:body.x-reach,right:body.x+reach,top:body.y-reach,bottom:body.y+reach},(x,y,pixel)=>{
        if(!vertices)return Math.abs(Math.hypot(x-body.x,y-body.y)-radius)<=half+pixel;
        const dx=x-body.x,dy=y-body.y,px=dx*c+dy*s,py=-dx*s+dy*c;
        return vertices.some((a,i)=>{const b=vertices[(i+1)%vertices.length],vx=b.x-a.x,vy=b.y-a.y;
          const t=Math.max(0,Math.min(1,((px-a.x)*vx+(py-a.y)*vy)/(vx*vx+vy*vy||1)));
          return Math.hypot(px-a.x-t*vx,py-a.y-t*vy)<=half+pixel;
        });
      });
    }
    textCrosses(a,b,padding=this.reduced?3.5:8.5) {
      const dx=b.x-a.x,dy=b.y-a.y;
      return this.textInkHit({left:Math.min(a.x,b.x)-padding,right:Math.max(a.x,b.x)+padding,top:Math.min(a.y,b.y)-padding,bottom:Math.max(a.y,b.y)+padding},(x,y,pixel)=>{
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
        return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=padding+pixel;
      });
    }
    shatterGhost(ghost) {
      const count=this.reduced?2:4,life=this.reduced?.18:.32;
      const vertices=P.geometry.polygon(ghost.type,ghost.r,ghostStroke(ghost)/2),rotation=ghost.angle||0,c=Math.cos(rotation),s=Math.sin(rotation);
      for(let i=0;i<count;i++){
        const t=(i+.3+Math.random()*.4)/count,angle=t*TAU;
        let x=Math.cos(angle)*(ghost.r-1.5),y=Math.sin(angle)*(ghost.r-1.5),tangent=angle+Math.PI/2;
        if(vertices){const edge=t*vertices.length,index=Math.floor(edge),a=vertices[index],b=vertices[(index+1)%vertices.length],f=edge-index;x=a.x+(b.x-a.x)*f;y=a.y+(b.y-a.y)*f;tangent=Math.atan2(b.y-a.y,b.x-a.x);}
        const dx=x*c-y*s,dy=x*s+y*c,length=Math.hypot(dx,dy)||1,speed=this.reduced?6:18+Math.random()*18;
        this.ghostShards.push({x:ghost.x+dx,y:ghost.y+dy,vx:dx/length*speed,vy:dy/length*speed,angle:tangent+rotation,spin:this.reduced?0:(Math.random()-.5)*5,length:3+Math.random()*3,life,maxLife:life,colorIndex:ghost.colorIndex||0});
      }
    }
    pruneGhosts(ghosts,spatial=false) {
      const kept = [],cells=spatial?new Map():null;
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const old = ghosts[i],slots=[],candidates=new Set();
        if(cells){const reach=old.r*(old.type==='fast'?Math.SQRT2:1);
          for(let y=Math.floor((old.y-reach)/96);y<=Math.floor((old.y+reach)/96);y++)for(let x=Math.floor((old.x-reach)/96);x<=Math.floor((old.x+reach)/96);x++){
            const key=x+','+y;slots.push(key);for(const other of cells.get(key)||[])candidates.add(other);
          }
        }
        if (!(cells?[...candidates]:kept).some(newer => P.geometry.overlapDepth(old, newer) > Math.max(ghostStroke(old), ghostStroke(newer)) + 1e-6)){
          kept.push(old);if(cells)for(const key of slots){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(old);}
        }
      }
      return kept.reverse();
    }
    updateGhosts(engine, skin, dt) {
      const harmful = engine.gameMode === 'hard' && !engine.attract;
      this.ghostTouchCount=0;
      if(engine.gameMode==='twin'||engine.gameMode==='trial'){
        this.obstacleGhosts.length=0;this.ghostShards.length=0;this.ghostPlayerPrevious=null;return;
      }
      for(const shard of this.ghostShards){shard.life-=dt;shard.x+=shard.vx*dt;shard.y+=shard.vy*dt;shard.angle+=shard.spin*dt;}
      this.ghostShards=this.ghostShards.filter(shard=>shard.life>0);
      // Normally only existing copies shatter. Valid newborn copies immediately
      // hit by an active magnet join this set after ordinary spawn filtering.
      const visibleBefore=this.obstacleGhosts.slice(),removalCandidates=new Set(visibleBefore),touched=new Set(),expired=new Set(visibleBefore.filter(g=>g.age+dt>=ghostLife));
      const finishRemoval=()=>{
        const kept=new Set(this.obstacleGhosts);
        for(const ghost of removalCandidates)if(!kept.has(ghost)){
          this.shatterGhost(ghost);
          // Only deliberate body/item clears make a sound. Replacement,
          // text/pickup avoidance, capacity pruning and expiry stay silent.
          if(touched.has(ghost)&&!expired.has(ghost))this.ghostTouchCount++;
          if(touched.has(ghost)&&!expired.has(ghost))engine.recordGhostClear?.();
        }
        this.ghostShards=this.ghostShards.slice(-3200);
      };
      const requests = (engine.ghostClearRequests || []).filter(request => request.version > this.ghostClearVersion);
      this.ghostClearVersion = engine.ghostClearVersion || 0;
      this.freezeWaves = this.freezeWaves.filter(wave => !wave.completed);
      for (const request of requests) if (request.type === 'freeze') {
        const { x,y } = request;
        const width = engine.width || C.size, height = engine.height || C.size;
        const limit = Math.max(Math.hypot(x,y),Math.hypot(width-x,y),Math.hypot(x,height-y),Math.hypot(width-x,height-y));
        this.freezeWaves.push({ ...request, limit, radius:0 });
      }
      for (const wave of this.freezeWaves) {
        wave.radius = Math.min(wave.limit, Math.max(0,(engine.time ?? this.clock)-(wave.startedAt ?? 0))*C.freezeWaveSpeed);
        wave.completed = wave.radius >= wave.limit;
      }
      // The same wave radius drives rendering and removal; distant copies cannot
      // disappear before the visible front reaches their actual contour.
      const clears = requests.filter(request => !['freeze','pulse','nova'].includes(request.type) && !(harmful && request.type === 'magnet')).concat(harmful ? [] : this.freezeWaves,engine.clearWaves||[]);
      const outsideClears = ghost => {
        const request=clears.find(request=>!Number.isFinite(request.radius)||P.geometry.hits(
          {x:request.x,y:request.y,r:request.radius},{...ghost,previousAngle:ghost.angle},{playerInset:0,hazardInset:0}
        ));
        if(request)touched.add(ghost);
        return !request;
      };
      this.obstacleGhosts = this.obstacleGhosts.filter(g=>!expired.has(g)).filter(outsideClears);
      const player = engine.player, previous = this.ghostPlayerPrevious || { x: player.px ?? player.x, y: player.py ?? player.y };
      this.ghostPlayerPrevious = { x: player.x, y: player.y };
      for (const ghost of this.obstacleGhosts) {
        ghost.previousAngle = ghost.angle;
        ghost.age += dt;
        if (engine.effects.freeze <= 0) ghost.angle += ghost.spin * dt;
      }
      this.obstacleGhosts = this.obstacleGhosts.filter(ghost => ghost.age < ghostLife && !this.textBlocks(ghost));
      if (dt <= 0 || engine.state !== 'running') {finishRemoval();return;}
      for (const h of engine.hazards) {
        if (h.dead || h.type === 'large') continue;
        const last = this.ghostSamples.get(h) || { x: h.px ?? h.x, y: h.py ?? h.y, distance: 0 };
        if (engine.effects.freeze > 0 || h.spawn > 0) {
          this.ghostSamples.set(h, { x: h.x, y: h.y, distance: last.distance });
          continue;
        }
        const dx = h.x - last.x, dy = h.y - last.y, distance = Math.hypot(dx, dy);
        let remainder = last.distance + distance;
        // Sample every crossed distance mark, including multiple marks in a frame.
        // Retain partial travel rather than resetting the spacing at frame boundaries.
        if (distance > 0) for (let offset = C.ghostSpacing - last.distance; offset <= distance + 1e-8; offset += C.ghostSpacing) {
          const fraction = Math.min(1, offset / distance), age = dt * (1 - fraction);
          if (age < ghostLife) this.obstacleGhosts.push({ x: last.x + dx * fraction, y: last.y + dy * fraction,
            r: h.r, type: h.type, angle: h.angle || 0, previousAngle: h.angle || 0,
            spin: h.spin || 0, colorIndex: h.colorIndex || 0, color: skin.palette[(h.colorIndex || 0) % skin.palette.length], age });
          remainder -= C.ghostSpacing;
        }
        this.ghostSamples.set(h, { x: h.x, y: h.y, distance: Math.max(0, remainder) });
      }
      // Pickups take priority over copies, including coins pulled by the magnet
      // and existing copies that rotate into a pickup. Rejected samples still
      // consume their distance mark; collecting the item never backfills them.
      const pickupBodies = (engine.pickups || []).filter(item => item.life > 0).map(pickupBody);
      this.obstacleGhosts = this.pruneGhosts(this.obstacleGhosts.filter(ghost =>
        !this.textBlocks(ghost) && !pickupBodies.some(item => P.geometry.overlapDepth(ghost,item) > ghostStroke(ghost) + 1e-6)
      ).slice(-700),engine.attract);
      // Classic uses frame sweeps; hard mode calls this on every physics step
      // so bends in the player's path and rotating copies cannot be skipped.
      const sweptPlayer = { ...player, px: previous.x, py: previous.y };
      const magnetRadius=!harmful&&engine.effects.magnet>0?(engine.magnetRadius||player.r):0;
      const clearRadius = Math.max(player.r, engine.effects.invincible > 0 ? (engine.shieldRadius || player.r) : player.r, magnetRadius);
      const clearBody = { ...sweptPlayer, r: clearRadius };
      if(magnetRadius)for(const ghost of this.obstacleGhosts){
        if(!removalCandidates.has(ghost)&&P.geometry.hits({...sweptPlayer,r:magnetRadius},ghost,{playerInset:0,hazardInset:0}))removalCandidates.add(ghost);
      }
      this.obstacleGhosts = this.obstacleGhosts.filter(ghost => {
        if(!outsideClears(ghost))return false;
        if(harmful && engine.effects.invincible <= 0){
          const hit=P.geometry.hits(sweptPlayer,ghost);
          engine.trackNearMiss?.(ghost,P.geometry.hits(sweptPlayer,ghost,{playerInset:1e-6,hazardInset:0}),hit);
          if(hit){
            engine.takeHit('trail');
            if(engine.effects.invincible>0){touched.add(ghost);return false;}
          }
          return true;
        }
        if(!P.geometry.hits(clearBody,ghost,{playerInset:0,hazardInset:0}))return true;
        // Contact with the body OR its moving shield/magnet plays the same cue.
        touched.add(ghost);
        return false;
      });
      finishRemoval();
    }
    event(event) {
      const color = event.color || (event.kind === 'collect' ? P.items[event.type]?.color || '#797979' : '#797979');
      if (!this.reduced) for (let i = 0; i < (event.kind === 'end' ? 20 : 5); i++) {
        const angle = Math.random() * TAU, speed = 35 + Math.random() * 110;
        this.particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .5, color });
      }
      this.particles = this.particles.slice(-300);
    }
    history(points, entity, dt, lifetime) {
      if (dt > 0) {
        points.forEach(p => p.age += dt);
        while (points.length && points[0].age > lifetime) points.shift();
        const last = points[points.length - 1];
        if (!last || Math.hypot(last.x - entity.x, last.y - entity.y) > .5) points.push({ x: entity.x, y: entity.y, age: 0 });
        if (points.length > 64) points.shift();
      }
      return points;
    }
    draw(engine, save, dt, ghostsUpdated = false) {
      if(engine.attract&&this.homeMask){this.drawHome(engine,save,dt);return;}
      this.clock += dt;
      const blackWorld = !engine.attract && engine.gameMode === 'monochrome';
      const ctx = this.ctx, playerSkin = engine.attract || blackWorld || engine.gameMode==='twin' ? P.skins.player[0] : P.skin('player', save.equipped.player);
      const blackStyle = {color:'#111111',shade:'#111111'};
      const trailSkin = blackWorld ? blackStyle : playerSkin;
      const opponentSkin = P.whiteBallStyle;
      const hazardSkin = this.monochrome || blackWorld ? { palette:['#111111'], monochrome:true } : P.skin('hazard', save.equipped.hazard);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, this.width, this.height);
      if(engine.orbit){const o=engine.orbit;ctx.save();ctx.strokeStyle='#969da3';ctx.lineWidth=1.4;ctx.setLineDash([16,16]);circle(ctx,o.x,o.y,o.radius);ctx.stroke();ctx.restore();}
      for (const e of engine.events.splice(0)) this.event(e.type==='raceOrb'?{...e,color:hazardSkin.palette[(e.colorIndex||0)%hazardSkin.palette.length]}:e);
      for (const item of engine.pickups) {
        if(item.type==='raceOrb')hazard(ctx,{...item,type:'large'},hazardSkin);
        else pickup(ctx, item, this.clock, this.reduced, blackWorld);
      }
      if(!ghostsUpdated)this.updateGhosts(engine, hazardSkin, dt);
      const clipTrails=(obstacle=false)=>{
        if(!this.titleMaskEnabled)return;
        if(this.titleClip)ctx.clip(this.titleClip,'evenodd');
        // Safety for outward drifting fragments; generation is rejected above.
        if(obstacle&&this.textClip)ctx.clip(this.textClip,'evenodd');
      };
      const drawObstacles = skin => {
        ctx.save();clipTrails(true);
        ctx.lineCap='round';ctx.lineWidth=1.5;
        for(const shard of this.ghostShards){
          const color=skin.palette[shard.colorIndex%skin.palette.length],dx=Math.cos(shard.angle)*shard.length/2,dy=Math.sin(shard.angle)*shard.length/2;
          ctx.globalAlpha=Math.min(1,shard.life/shard.maxLife)*.8;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=skin.monochrome?0:4;
          ctx.beginPath();ctx.moveTo(shard.x-dx,shard.y-dy);ctx.lineTo(shard.x+dx,shard.y+dy);ctx.stroke();
        }
        ctx.globalAlpha=1;ctx.shadowBlur=0;
        for (const ghost of this.obstacleGhosts) obstacleGhost(ctx,{...ghost,monochrome:!!skin.monochrome,color:skin.palette[(ghost.colorIndex||0)%skin.palette.length]});
        ctx.restore();
        for (const h of engine.hazards) if(!h.dead) hazard(ctx,h,skin,engine.effects.freeze>0);
      };
      drawObstacles(hazardSkin);
      for(const white of engine.gameMode==='trial'?engine.whiteBalls:[engine.whiteBall])if(white){
        let history=this.whiteTrail;
        if(white!==engine.whiteBall){history=this.whiteTrails.get(white);if(!history){history=[];this.whiteTrails.set(white,history);}}
        this.history(history, white, dt, .5);
        ctx.save();clipTrails();
        trail(ctx, history, white, opponentSkin.color, opponentSkin.shade, this.reduced ? 7 : 17);
        ctx.restore();
        whiteActor(ctx, white.x, white.y);
      }
      const p = engine.player;
      this.history(this.trail, p, dt, .5);ctx.save();clipTrails();trail(ctx, this.trail, p, trailSkin.color, trailSkin.shade, this.reduced ? 7 : 17);ctx.restore();
      if (!engine.orbit&&!this.fingerActive && !p.direction && p.steering && engine.state === 'running' && !engine.attract) { ctx.strokeStyle = '#b7b7b7'; ctx.lineWidth = 1; circle(ctx, p.tx, p.ty, 3); ctx.stroke(); }
      if (engine.magnetRadius > C.radius+.01) { ctx.strokeStyle = blackWorld ? '#11111180' : '#9252d880'; ctx.lineWidth = 1.5; circle(ctx, p.x, p.y, engine.magnetRadius); ctx.stroke(); }
      if (engine.shieldRadius > C.radius+.01) { ctx.strokeStyle = blackWorld ? '#111111' : P.items.invincible.color; ctx.lineWidth = 2; circle(ctx, p.x, p.y, engine.shieldRadius-1); ctx.stroke(); }
      ctx.save(); ctx.globalAlpha = engine.state === 'ended' ? .35 : 1; actor(ctx, p.x, p.y, playerSkin); ctx.restore();
      for (const part of this.particles) { part.life -= dt; part.x += part.vx * dt; part.y += part.vy * dt; ctx.globalAlpha = Math.max(0, part.life * 2); ctx.fillStyle = blackWorld ? '#111111' : part.color; circle(ctx, part.x, part.y, 1.8); ctx.fill(); }
      this.particles = this.particles.filter(p => p.life > 0); ctx.globalAlpha = 1;
      for (const ring of this.rings) {ring.life-=dt;ctx.globalAlpha=Math.max(0,ring.life/.55);ctx.strokeStyle=blackWorld?'#111111':ring.color;ctx.lineWidth=2;circle(ctx,ring.x,ring.y,this.reduced?ring.max:ring.max*(1-ring.life/.55));ctx.stroke();}
      this.rings=this.rings.filter(r=>r.life>0);ctx.globalAlpha=1;
      for (const wave of [...this.freezeWaves,...(engine.clearWaves||[])]) {
        const progress = wave.radius / (wave.limit || 1);
        ctx.globalAlpha = (this.reduced ? .4 : .8)*(1-.55*progress);
        ctx.strokeStyle = blackWorld ? '#111111' : P.items[wave.type||'freeze'].color; ctx.lineWidth = 3;
        circle(ctx,wave.x,wave.y,wave.radius);ctx.stroke();
        ctx.globalAlpha *= .2; ctx.lineWidth = 10;
        circle(ctx,wave.x,wave.y,Math.max(0,wave.radius-6));ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (this.joystickDirection && engine.state === 'running' && !engine.attract) {
        // Show the stick's direction immediately, independently of movement inertia.
        const direction=this.joystickDirection,scale=this.viewScale||1,distance=p.r+6/scale;
        ctx.save();ctx.shadowBlur=0;ctx.fillStyle='#111111';
        circle(ctx,p.x+direction.x*distance,p.y+direction.y*distance,2/scale);ctx.fill();ctx.restore();
      }
    }
    drawHome(engine,save,dt){
      this.clock+=dt;const ctx=this.ctx,skin=this.monochrome?{palette:['#111111'],monochrome:true}:P.skin('hazard',save.equipped.hazard);
      engine.events.length=0;this.updateGhosts(engine,skin,dt);
      if(!this.homeTrails){this.homeTrails=document.createElement('canvas');this.homeTrailCtx=this.homeTrails.getContext('2d');}
      const surface=this.homeTrails,t=this.homeTrailCtx;
      if(surface.width!==this.canvas.width||surface.height!==this.canvas.height){surface.width=this.canvas.width;surface.height=this.canvas.height;}
      const ratio=surface.width/this.width;t.setTransform(1,0,0,1,0,0);t.clearRect(0,0,surface.width,surface.height);t.setTransform(ratio,0,0,ratio,0,0);
      for(const ghost of this.obstacleGhosts)obstacleGhost(t,{...ghost,monochrome:!!skin.monochrome,color:skin.palette[(ghost.colorIndex||0)%skin.palette.length]});
      t.save();t.lineCap='round';t.lineWidth=1.5;
      for(const shard of this.ghostShards){const dx=Math.cos(shard.angle)*shard.length/2,dy=Math.sin(shard.angle)*shard.length/2;t.globalAlpha=Math.min(1,shard.life/shard.maxLife)*.8;t.strokeStyle=skin.palette[shard.colorIndex%skin.palette.length];t.beginPath();t.moveTo(shard.x-dx,shard.y-dy);t.lineTo(shard.x+dx,shard.y+dy);t.stroke();}t.restore();
      const p=engine.player,b=engine.whiteBall;
      this.history(this.trail,p,dt,.5);this.history(this.whiteTrail,b,dt,.5);
      if(this.titleMaskEnabled)this.homeMask.erase(t);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,this.width,this.height);ctx.drawImage(surface,0,0,this.width,this.height);
      t.setTransform(1,0,0,1,0,0);t.clearRect(0,0,surface.width,surface.height);t.setTransform(ratio,0,0,ratio,0,0);
      const disc=this.homeMask.disc,s=this.viewScale,masked=this.titleMaskEnabled&&disc;
      const shapes=masked?[{circle:disc},...this.homeMask.hoverShapes()]:[];
      const shapePath=(c,shape)=>{
        if(shape.circle){const d=shape.circle;c.moveTo((d.x+d.r)/s,d.y/s);c.arc(d.x/s,d.y/s,d.r/s,0,TAU);c.closePath();}
        else{const radius=shape.h/2,x=shape.x/s,y=shape.y/s,r=radius/s;c.moveTo(x+r,y+2*r);c.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5);c.arc((shape.x+shape.w-radius)/s,y+r,r,-Math.PI/2,Math.PI/2);c.closePath();}
      };
      // Clip outside each shape separately so overlapping black zones form a union.
      const blackClip=(c,inside)=>{if(inside){c.beginPath();for(const shape of shapes)shapePath(c,shape);c.clip();}else for(const shape of shapes){c.beginPath();c.rect(-20,-20,this.width+40,this.height+40);shapePath(c,shape);c.clip('evenodd');}};
      // Ball trails are the explicit exception to the obstacle no-trail zone.
      // A dark source inside the DOM difference disc stays visibly light.
      const dark=P.skins.player[0],width=this.reduced?7:17;
      if(masked){
        t.save();blackClip(t,false);trail(t,this.whiteTrail,b,P.whiteBallStyle.color,P.whiteBallStyle.shade,width);t.restore();
        t.save();blackClip(t,true);trail(t,this.whiteTrail,b,dark.color,dark.shade,width);t.restore();
      }else trail(t,this.whiteTrail,b,P.whiteBallStyle.color,P.whiteBallStyle.shade,width);
      trail(t,this.trail,p,dark.color,dark.shade,width);
      if(this.titleMaskEnabled)this.homeMask.erase(t,false);
      ctx.drawImage(surface,0,0,this.width,this.height);
      for(const h of engine.hazards)if(!h.dead)hazard(ctx,h,skin,engine.effects.freeze>0);
      if(masked){
        ctx.save();blackClip(ctx,false);whiteActor(ctx,b.x,b.y);ctx.restore();
        ctx.save();blackClip(ctx,true);actor(ctx,b.x,b.y,dark);ctx.restore();
      }else whiteActor(ctx,b.x,b.y);
      actor(ctx,p.x,p.y,dark);
    }
    static modePreview(canvas,scene){
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const ratio=Math.min(globalThis.devicePixelRatio||1,2),w=rect.width,h=rect.height,scale=Math.min(w,h)/scene.size;
      canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
      const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
      ctx.translate((w-scene.size*scale)/2,(h-scene.size*scale)/2);ctx.scale(scale,scale);
      const skin=scene.monochrome?{palette:['#111111'],monochrome:true}:P.skins.hazard[0],player=scene.monochrome?{color:'#111111',shade:'#111111'}:P.skins.player[0];
      if(scene.orbit){ctx.save();ctx.strokeStyle='#969da3';ctx.lineWidth=1.4;ctx.setLineDash([16,16]);circle(ctx,scene.orbit.x,scene.orbit.y,scene.orbit.radius);ctx.stroke();ctx.restore();}
      for(const orb of scene.orbs)hazard(ctx,orb,skin);
      for(const item of scene.pickups)pickup(ctx,item,0,true,scene.monochrome);
      for(const ghost of scene.ghosts)obstacleGhost(ctx,{...ghost,monochrome:scene.monochrome,color:skin.palette[ghost.colorIndex%skin.palette.length]});
      for(const h of scene.hazards)hazard(ctx,h,skin,h.frozen);
      for(const white of scene.whites){trail(ctx,white.trail,white,P.whiteBallStyle.color,P.whiteBallStyle.shade,17);whiteActor(ctx,white.x,white.y);}
      trail(ctx,scene.player.trail,scene.player,player.color,player.shade,17);actor(ctx,scene.player.x,scene.player.y,player);
    }
    static icon(canvas, type, color) { const { ctx,w,h } = staticContext(canvas); symbol(ctx, type, w / 2, h / 2, 1.25, color); }
    static preview(canvas, group, skin) {
      const { ctx,w,h } = staticContext(canvas);
      if (group === 'player') {
        const head = { x: w * (w > 100 ? .6 : .5), y: h / 2 };
        if (w > 100) trail(ctx, Array.from({ length: 36 }, (_, k) => ({ x: head.x - (36 - k) * 3, y: head.y + Math.sin(k / 20) * 12 })), head, skin.color, skin.shade, 28);
        actor(ctx, head.x, head.y, skin, w > 100 ? 2.4 : 1.25);
      } else ['normal','large','fast','split'].forEach((type, i) => hazard(ctx, { x: w * (.27 + .46 * (i % 2)), y: h * (.3 + .44 * Math.floor(i / 2)), r: [18,27,12,23][i], type, colorIndex: i, angle: type === 'fast' ? .2 : 0 }, skin));
    }
    static obstacleIcon(canvas, type) {
      const { ctx,w,h } = staticContext(canvas);
      if (type === 'whiteBall') whiteActor(ctx,w/2,h/2);
      else hazard(ctx, { x:w/2,y:h/2,r:type==='large'?17:type==='fast'?10:15,type,colorIndex:['normal','large','fast','split'].indexOf(type),angle:0 }, P.skins.hazard[0]);
    }
    static logo(canvas) {
      const { ctx,w,h } = staticContext(canvas); ctx.fillStyle = '#171717'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 94px Arial, sans-serif'; ctx.fillText('DODGE', w/2, h/2 + 3);
    }
  }
  P.Renderer = Renderer;
})(globalThis.PixelDodge);
