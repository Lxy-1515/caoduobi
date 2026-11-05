(function (P) {
  'use strict';
  const C = P.config, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let counter = 0;
  class Engine {
    constructor(random = Math.random) { this.random = random; this.width = this.height = C.size; this.attract = false; this.gameMode = 'classic'; this.state = 'menu'; this.reset(); }
    reset() {
      this.achievementStats={nearMisses:0,maxShieldStock:0};this.nearMissContacts=new WeakSet();this.revives=0;
      this.time = 0; this.coins = 0; this.hazards = []; this.pickups = []; this.events = []; this.result = null;
      this.clearedGhosts = 0; this.shieldStock = 0; this.clearWaves = []; this.raceBatch = 0; this.raceRound = 1;
      this.raceCleared = 0; this.raceRemaining = 0; this.raceBatchCapped = false;
      const x = this.width / 2, y = this.height / 2;
      this.player = { x, y, px:x, py:y, tx:x, ty:y, vx: 0, vy: 0, steering: false, direction: null, r: C.radius };
      // Separate from the spawn/clear list: exactly one persistent opponent per run.
      this.whiteBall = { type: 'whiteBall', x: 100, y: 100, px: 100, py: 100, r: C.radius, vx: C.playerSpeed * .8, vy: C.playerSpeed * .6 };
      this.whiteBalls=[this.whiteBall];this.orbit=null;this.trialNextBall=C.trial.ballInterval;
      this.ghostClearVersion = 0;
      this.ghostClearRequests = [];
      this.effects = { invincible: 0, magnet: 0, freeze: 0 };
      this.shieldRadius = C.radius;
      this.magnetRadius = C.radius;
      this.hazardClock = C.generation.firstHazard; this.coinClock = C.generation.coinInterval; this.powerClock = C.generation.firstPower;
      this.extraFreezeClock = C.generation.firstPower / (C.pickups.weights.freeze * C.pickups.hardFreezeExtraFactor);
    }
    resize(width, height) {
      const sx = width / this.width, sy = height / this.height;
      this.width = width; this.height = height;
      for (const body of [this.player, ...(this.gameMode==='trial'?this.whiteBalls:[this.whiteBall]), ...this.hazards, ...this.pickups]) {
        body.x *= sx; body.y *= sy; body.px = body.x; body.py = body.y;
      }
      const p = this.player;
      p.x = clamp(p.x,p.r,width-p.r); p.y = clamp(p.y,p.r,height-p.r);
      p.tx = p.x; p.ty = p.y; p.px = p.x; p.py = p.y; this.coast();
      this.whiteBall.x = clamp(this.whiteBall.x,this.whiteBall.r,width-this.whiteBall.r);
      this.whiteBall.y = clamp(this.whiteBall.y,this.whiteBall.r,height-this.whiteBall.r);
      if(this.orbit)this.orbit.resize();
      if(this.gameMode==='trial')for(const b of this.whiteBalls){b.x=clamp(b.x,b.r,width-b.r);b.y=clamp(b.y,b.r,height-b.r);b.px=b.x;b.py=b.y;}
      if(this.gameMode==='race'&&this.pickups.length){
        const old=this.pickups;
        const invalid=old.some((a,i)=>a.x<a.r||a.x>width-a.r||a.y<a.r||a.y>height-a.r||old.slice(i+1).some(b=>Math.hypot(a.x-b.x,a.y-b.y)<a.r+b.r));
        if(invalid){
          let count=old.length,layout=this.raceLayout(count,old);
          while(!layout&&count>0)layout=this.raceLayout(--count,old);
          this.pickups=layout||[];this.raceRemaining=this.pickups.length;
          if(count<old.length){this.raceBatch=Math.max(C.race.batchStep,Math.min(this.raceBatch,Math.ceil(count/C.race.batchStep)*C.race.batchStep));this.raceBatchCapped=true;}
        }
      }
    }
    start(attract = false, gameMode = 'classic') {
      this.attract = attract;
      this.gameMode = !attract && ['hard','monochrome','race','twin','trial'].includes(gameMode) ? gameMode : 'classic';
      this.reset(); this.state = 'running';
      this.id = `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`;
      const b = this.whiteBall, position = this.startPosition(b.r, 150), angle = this.range(0, Math.PI * 2);
      const whiteSpeed=C.playerSpeed*(this.gameMode==='race'?C.race.speedFactor:1);
      Object.assign(b, position, {px:position.x,py:position.y,vx:Math.cos(angle)*whiteSpeed,vy:Math.sin(angle)*whiteSpeed});
      if(this.gameMode==='twin')this.orbit=new P.TwinOrbit(this);
      if(this.gameMode==='trial'){this.whiteBalls=[];for(let i=0;i<C.trial.initialBalls;i++)this.spawnTrialWhiteBall();}
      if(this.gameMode==='race')this.spawnRaceBatch();
      else if (!attract&&this.gameMode!=='twin') for (let i=0;i<3;i++) {
        const point=this.startPosition(C.pickups.coinRadius,60,[...this.whiteBalls,...this.pickups]);
        this.pickups.push(this.randomizeCoin({type:'coin',...point,r:C.pickups.coinRadius,life:C.pickups.coinLife}));
      }
    }
    spawnTrialWhiteBall(){
      if(this.gameMode!=='trial')return;
      const point=this.startPosition(C.radius,150,this.whiteBalls),angle=this.range(0,Math.PI*2);
      this.whiteBalls.push({type:'whiteBall',...point,px:point.x,py:point.y,r:C.radius,vx:Math.cos(angle)*C.playerSpeed,vy:Math.sin(angle)*C.playerSpeed});
      this.whiteBall=this.whiteBalls[0];
    }
    spawnRaceBatch() {
      const next=this.raceBatch+(this.raceBatchCapped?0:C.race.batchStep);
      let count=next,layout=this.raceLayout(count);
      if(!layout){
        this.raceBatchCapped=true;count=Math.max(C.race.batchStep,this.raceBatch);
        layout=this.raceLayout(count);
        while(!layout&&count>C.race.batchStep)layout=this.raceLayout(count-=C.race.batchStep);
      }
      this.pickups=layout||[];this.raceBatch=count;this.raceRemaining=this.pickups.length;
    }
    raceLayout(count,bodies=null) {
      const [minRadius,maxRadius]=C.hazards.large.radius;
      if(count*Math.PI*minRadius*minRadius>this.width*this.height)return null;
      for(let restart=0;restart<48;restart++){
        const radii=(bodies?bodies.slice(0,count).map(b=>b.r):Array.from({length:count},()=>this.range(minRadius,maxRadius))).sort((a,b)=>b-a),layout=[];
        for(let i=0;i<count;i++){
          const r=radii[i];if(2*r>this.width||2*r>this.height)break;
          let point=null;
          for(let attempt=0;attempt<96;attempt++){
            // Random offsets spread even a constant RNG; no fixed placement grid.
            const u=(this.random()+attempt*.61803398875+restart*.41421356237+i*.73205080757)%1;
            const v=(this.random()+attempt*.41421356237+restart*.73205080757+i*.61803398875)%1;
            const x=r+u*(this.width-2*r),y=r+v*(this.height-2*r);
            if(Math.hypot(x-this.player.x,y-this.player.y)<r+this.player.r+8)continue;
            if(layout.some(p=>Math.hypot(p.x-x,p.y-y)<p.r+r+2))continue;
            point={type:'raceOrb',x,y,r,life:Infinity,colorIndex:Math.floor(this.random()*60)};break;
          }
          if(!point)break;
          layout.push(point);
        }
        if(layout.length===count)return layout;
      }
      return null;
    }
    get remainingTime() { return Math.max(0,C.race.seconds-this.time); }
    get completedRounds() { return this.gameMode==='race'?this.raceRound-1:0; }
    startPosition(radius, clearance, avoid=[]) {
      const margin=Math.max(45,radius+8), valid=q=>Math.hypot(q.x-this.player.x,q.y-this.player.y)>=clearance && avoid.every(a=>Math.hypot(q.x-a.x,q.y-a.y)>radius+a.r+24);
      for(let i=0;i<32;i++){const q={x:this.range(margin,this.width-margin),y:this.range(margin,this.height-margin)};if(valid(q))return q;}
      // A bounded grid fallback also handles deterministic/random-stub tests.
      for(let y=margin;y<=this.height-margin;y+=50)for(let x=margin;x<=this.width-margin;x+=50){const q={x,y};if(valid(q))return q;}
      return {x:margin,y:margin};
    }
    get grass() { return this.gameMode==='race'?0:Math.floor((this.time+1e-9)/2) + this.clearedGhosts; }
    recordGhostClear() { if(!this.attract&&this.gameMode!=='race'&&this.state==='running')this.clearedGhosts++; }
    requestGhostClear(type,radius) {
      this.ghostClearRequests.push({version:++this.ghostClearVersion,type,x:this.player.x,y:this.player.y,radius,startedAt:this.time});
      this.ghostClearRequests=this.ghostClearRequests.slice(-64);
    }
    activateShield() { this.effects.invincible=C.durations.invincible;this.requestGhostClear('invincible',this.player.r); }
    trackNearMiss(body,visible,hit) {
      if(this.attract||this.state!=='running'||this.effects.invincible>0||hit){this.nearMissContacts.delete(body);return;}
      if(visible)this.nearMissContacts.add(body);
      else if(this.nearMissContacts.has(body)){this.nearMissContacts.delete(body);this.achievementStats.nearMisses++;}
    }
    takeHit(reason='collision') {
      if(this.attract||this.effects.invincible>0||this.state!=='running')return false;
      if(this.gameMode==='hard'&&this.shieldStock>0){this.shieldStock--;this.activateShield();return false;}
      this.finish(reason);return true;
    }
    target(x, y) {
      if(this.orbit){this.orbit.target(x,y);return;}
      this.player.direction = null;
      const p = this.player, tx = clamp(x, p.r, this.width - p.r), ty = clamp(y, p.r, this.height - p.r);
      if (Math.hypot(tx - p.tx, ty - p.ty) > .1) { p.tx = tx; p.ty = ty; p.aimX = tx - p.x; p.aimY = ty - p.y; p.steering = true; }
    }
    steerDirection(x, y, strength = 1) {
      const length = Math.hypot(x, y);
      if (!Number.isFinite(length) || !Number.isFinite(strength)) { this.coast(); return; }
      strength=clamp(strength,0,1);
      if(length<1e-6&&strength>0){this.coast();return;}
      this.player.direction = { x:strength&&length?x/length:0, y:strength&&length?y/length:0, strength }; this.player.steering = true;
    }
    coast() { this.player.steering = false; this.player.direction = null; }
    pause() { if (this.state === 'running') this.state = 'paused'; }
    resume() { if (this.state === 'paused') this.state = 'running'; }
    canRevive(){return !this.attract&&this.state==='ended'&&this.revives===0&&['collision','trail'].includes(this.result?.reason);}
    revive(){
      if(!this.canRevive())return false;
      this.revives++;this.result=null;this.events=[];this.nearMissContacts=new WeakSet();
      const p=this.player;p.vx=p.vy=0;p.px=p.tx=p.x;p.py=p.ty=p.y;this.coast();
      if(this.orbit)this.orbit.speed=0;
      this.state='running';this.activateShield();return true;
    }
    finish(reason = 'collision') {
      if (this.attract) return;
      if (this.state !== 'running' && this.state !== 'paused') return;
      this.state = 'ended'; this.result = { id: this.id, coins: this.coins, time: this.time, ...(this.gameMode==='race'?{round:this.raceRound,completedRounds:this.completedRounds,clearedOrbs:this.raceCleared}:['twin','trial'].includes(this.gameMode)?{}:{grass:this.grass}), gameMode:this.gameMode, reason };
      this.emit({ kind: 'end', x: this.player.x, y: this.player.y });
    }
    emit(event) { if (this.events.length < 160) this.events.push(event); }
    range(a, b) { return a + (b - a) * this.random(); }
    clear(radius) {
      for (const h of this.hazards) if (!h.dead && Math.hypot(h.x - this.player.x, h.y - this.player.y) <= radius + h.r) {
        h.dead = true; this.emit({ kind: 'destroy', x: h.x, y: h.y });
      }
    }
    launchClearWave(type) {
      const {x,y}=this.player;
      const limit=type==='pulse'?C.pulseRange:Math.max(Math.hypot(x,y),Math.hypot(this.width-x,y),Math.hypot(x,this.height-y),Math.hypot(this.width-x,this.height-y));
      this.clearWaves.push({type,x,y,limit,radius:0,startedAt:this.time,completed:false});
    }
    advanceClearWaves() {
      this.clearWaves=this.clearWaves.filter(w=>!w.completed);
      for(const w of this.clearWaves){
        w.radius=Math.min(w.limit,Math.max(0,this.time-w.startedAt)*C.freezeWaveSpeed);
        for(const h of this.hazards)if(!h.dead&&P.geometry.hits({x:w.x,y:w.y,r:w.radius},h,{playerInset:0,hazardInset:0})){
          h.dead=true;this.emit({kind:'destroy',x:h.x,y:h.y});
        }
        w.completed=w.radius>=w.limit;
      }
    }
    collect(item) {
      if (this.attract||this.gameMode==='twin'||(this.gameMode==='trial'&&item.type!=='coin')) return;
      const type = item.type;
      if(type==='raceOrb'){
        if(this.gameMode!=='race'||this.raceRemaining<=0)return;
        this.raceCleared++;
        if(--this.raceRemaining===0){this.raceRound++;this.coins=this.completedRounds*C.race.roundReward;}
      }
      if(type==='freeze')this.requestGhostClear(type,Infinity);
      if (type === 'coin') this.coins++;
      else if(type==='invincible'){if(this.gameMode==='hard'){this.shieldStock++;this.achievementStats.maxShieldStock=Math.max(this.achievementStats.maxShieldStock,this.shieldStock);}else this.activateShield();}
      else if (type in C.durations) this.effects[type] = C.durations[type];
      else if (type === 'pulse'||type==='nova') this.launchClearWave(type);
      this.emit({ kind: 'collect', type, colorIndex:item.colorIndex, ...(type==='coin'?{color:item.color||P.coinStyle.colors[0]}:{}), x: item.x, y: item.y, px: this.player.x, py: this.player.y });
    }
    updateShield(dt) {
      this.updateRange('shieldRadius',C.shieldRadius,this.effects.invincible,C.shieldExpandSeconds,C.shieldShrinkSeconds,dt);
    }
    updateMagnet(dt) {
      this.updateRange('magnetRadius',C.magnetRange,this.effects.magnet,C.rangeExpandSeconds,C.rangeShrinkSeconds,dt);
    }
    updateRange(field,max,remaining,expand,shrink,dt) {
      const growing=remaining>shrink,target=growing?max:C.radius,change=(max-C.radius)*dt/(growing?expand:shrink);
      this[field]+=clamp(target-this[field],-change,change);
    }
    advanceWhiteBall(dt,b=this.whiteBall) {
      const p = this.player, lo = b.r, right = this.width - b.r, bottom = this.height - b.r;
      b.px = b.x; b.py = b.y;
      let remaining = dt, elapsed = 0;
      while (remaining > 1e-10) {
        const tx = b.vx > 0 ? (right-b.x)/b.vx : b.vx < 0 ? (lo-b.x)/b.vx : Infinity;
        const ty = b.vy > 0 ? (bottom-b.y)/b.vy : b.vy < 0 ? (lo-b.y)/b.vy : Infinity;
        const travel = Math.max(0, Math.min(remaining, tx, ty)), x = b.x, y = b.y;
        b.x = clamp(b.x+b.vx*travel, lo, right); b.y = clamp(b.y+b.vy*travel, lo, bottom);
        const start = elapsed / dt, end = (elapsed+travel) / dt;
        const segmentPlayer = { px: p.px+(p.x-p.px)*start, py: p.py+(p.y-p.py)*start, x: p.px+(p.x-p.px)*end, y: p.py+(p.y-p.py)*end };
        const segmentBall={px:x,py:y,x:b.x,y:b.y},hit=P.geometry.sweptCircle(segmentPlayer,segmentBall,p.r-C.playerInset+b.r-C.hazardInset);
        this.trackNearMiss(b,P.geometry.sweptCircle(segmentPlayer,segmentBall,p.r+b.r-1e-6),hit);
        if(this.effects.invincible<=0&&hit)this.takeHit();
        elapsed += travel; remaining -= travel;
        if (tx <= travel+1e-10) b.vx *= -1;
        if (ty <= travel+1e-10) b.vy *= -1;
      }
    }
    randomizeCoin(item){
      return Object.assign(item,{sides:3+Math.min(3,Math.floor(this.random()*4)),color:P.coinStyle.colors[Math.min(P.coinStyle.colors.length-1,Math.floor(this.random()*P.coinStyle.colors.length))],angle:this.range(0,Math.PI*2)});
    }
    spawnPickup(type, extraFreeze = false) {
      if (this.attract || ['race','twin'].includes(this.gameMode)||(this.gameMode==='trial'&&type!=='coin')) return;
      const item={ type, extraFreeze, x: this.range(45, this.width-45), y: this.range(45, this.height-45), r: type === 'coin' ? C.pickups.coinRadius : C.pickups.powerRadius, life: type === 'coin' ? C.pickups.coinLife : C.pickups.powerLife };
      if(type==='coin')this.randomizeCoin(item);
      this.pickups.push(item);
    }
    spawnHazard() {
      if (['race','trial'].includes(this.gameMode) || this.hazards.length >= C.hazardLimit) return;
      const H = C.hazards, eligible = Object.entries(H).filter(([, props]) => props.weight > 0 && this.time >= props.after);
      let roll = this.random() * eligible.reduce((sum, [, props]) => sum + props.weight, 0), type = eligible[eligible.length - 1][0];
      for (const [name, props] of eligible) { roll -= props.weight; if (roll < 0) { type = name; break; } }
      const props = H[type];
      const r = this.range(...props.radius), side = Math.floor(this.random() * 4), coordinate = this.range(35, (side % 2 ? this.height : this.width)-35);
      const [x, y] = side === 0 ? [coordinate, -r - 8] : side === 1 ? [this.width + r + 8, coordinate] : side === 2 ? [coordinate, this.height + r + 8] : [-r - 8, coordinate];
      const angle = Math.atan2(this.player.y - y, this.player.x - x) + this.range(-.16, .16);
      const speed = this.range(...props.speed) * (1 + (C.generation.maxSpeedFactor - 1) * Math.min(1, this.time / C.generation.rampSeconds));
      const rotation = this.range(0, Math.PI * 2), spin = (type === 'fast' ? 1.2 : type === 'split' ? .8 : 0) * (this.random() < .5 ? -1 : 1);
      this.hazards.push({ type, x, y, px: x, py: y, r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        angle: rotation, previousAngle: rotation, spin, colorIndex: Math.floor(this.random() * 60), spawn: C.generation.entryWarning, dead: false });
    }
    step(dt) {
      if (this.state !== 'running') return;
      const racing=this.gameMode==='race',twin=this.gameMode==='twin',trial=this.gameMode==='trial';
      if(racing){
        dt=Math.min(dt,this.remainingTime);
        if(this.remainingTime<=1e-9){this.time=C.race.seconds;this.finish('timeout');return;}
      }
      this.time += dt;
      for (const key in this.effects) this.effects[key] = Math.max(0, this.effects[key] - dt);
      const p = this.player; p.px = p.x; p.py = p.y;
      if(twin)this.orbit.advance(dt);
      else {
      const direction = p.direction, dx = direction ? direction.x : p.tx - p.x, dy = direction ? direction.y : p.ty - p.y, distance = Math.hypot(dx, dy);
      if (direction || (p.steering && distance > .01)) {
        const speed=C.playerSpeed*(racing?C.race.speedFactor:1)*(direction?.strength??1);
        const ax = (direction?direction.x:dx/distance) * speed - p.vx, ay = (direction?direction.y:dy/distance) * speed - p.vy;
        const delta = Math.hypot(ax, ay), amount = Math.min(delta, C.playerAcceleration * (racing?C.race.accelerationFactor:1) * dt);
        if (delta > 0) { p.vx += ax / delta * amount; p.vy += ay / delta * amount; }
      } else if (distance <= .01) p.steering = false;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // Cross the target plane once, then coast; never brake or orbit a still cursor.
      if (!direction && p.steering && p.aimX * (p.tx - p.x) + p.aimY * (p.ty - p.y) <= 0) p.steering = false;
      const lo = p.r, right = this.width - p.r, bottom = this.height - p.r;
      if (p.x < lo || p.x > right) { p.x = clamp(p.x < lo ? 2 * lo - p.x : 2 * right - p.x, lo, right); p.vx *= -1; p.steering = false; }
      if (p.y < lo || p.y > bottom) { p.y = clamp(p.y < lo ? 2 * lo - p.y : 2 * bottom - p.y, lo, bottom); p.vy *= -1; p.steering = false; }
      }
      // Pickups resolve before harmful collisions so a shield or pulse can save this step.
      for (const item of this.pickups) {
        item.life -= dt; item.px = item.x; item.py = item.y;
        const d = Math.hypot(p.x - item.x, p.y - item.y);
        // A permanent, hidden close-range pickup assist is independent of
        // the timed magnet effect, its visible radius and ghost clearing.
        const coinRange=Math.max(C.coinAssistRange,this.effects.magnet>0?this.magnetRadius:0);
        if (!this.attract && item.type === 'coin' && d < coinRange && d > .01) {
          const move = Math.min(d, C.magnetSpeed * dt); item.x += (p.x - item.x) / d * move; item.y += (p.y - item.y) / d * move;
        }
        const touched=item.type==='coin'?P.geometry.hits(p,P.geometry.coinBody(item),{playerInset:0,hazardInset:0}):P.geometry.sweptCircle(p,item,p.r+item.r);
        if (item.life > 0 && touched) { this.collect(item); item.life = -1; }
      }
      this.pickups = this.pickups.filter(i => i.life > 0);
      this.updateShield(dt);
      this.updateMagnet(dt);
      if(trial){for(const b of this.whiteBalls){this.advanceWhiteBall(dt,b);if(this.state!=='running')break;}}
      else if(!twin)this.advanceWhiteBall(dt);
      if (this.state !== 'running') return;
      if(trial){
        while(this.time+1e-9>=this.trialNextBall){this.spawnTrialWhiteBall();this.trialNextBall+=C.trial.ballInterval;}
        this.advanceCoinSpawns(dt);return;
      }
      if(racing){
        if(this.remainingTime<=1e-9){this.time=C.race.seconds;this.finish('timeout');return;}
        if(!this.pickups.length)this.spawnRaceBatch();
        return;
      }
      const frozen = this.effects.freeze > 0, children = [];
      let liveCount = this.hazards.filter(h => !h.dead).length;
      for (const h of this.hazards) {
        h.px = h.x; h.py = h.y; h.previousAngle = h.angle ?? 0;
        if (h.dead || frozen) continue;
        if (h.spawn > 0) { h.spawn = Math.max(0, h.spawn - dt); continue; }
        h.x += h.vx * dt; h.y += h.vy * dt; h.angle = h.previousAngle + (h.spin || 0) * dt;
        if(twin&&this.orbit.hits(this.whiteBall,h,{playerInset:0,hazardInset:0})){h.dead=true;this.emit({kind:'destroy',x:h.x,y:h.y});continue;}
        h.distance = (h.distance || 0) + Math.hypot(h.vx * dt, h.vy * dt);
        if (h.type === 'split' && (Math.hypot(p.x - h.x, p.y - h.y) <= C.splitRange || h.distance >= C.splitDistance) && liveCount + 3 <= C.hazardLimit) {
              h.dead = true; liveCount += 3;
              const angle = Math.atan2(h.vy, h.vx), speed = Math.hypot(h.vx, h.vy) * C.generation.childSpeedFactor;
              for (const offset of C.generation.childAngles) children.push({ type: 'child', x: h.x, y: h.y, px: h.x, py: h.y, r: C.generation.childRadius, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
                angle: h.angle, previousAngle: h.angle, spin: offset < 0 ? -1.5 : 1.5, colorIndex: h.colorIndex, spawn: 0, dead: false });
              this.emit({ kind: 'split', x: h.x, y: h.y });
        }
      }
      this.hazards.push(...children);
      if(twin)for(const h of children)if(this.orbit.hits(this.whiteBall,h,{playerInset:0,hazardInset:0})){h.dead=true;this.emit({kind:'destroy',x:h.x,y:h.y});}
      this.advanceClearWaves();
      for (const h of this.hazards) {
        if (h.dead || h.spawn > 0 || this.attract) continue;
        const collisionBody = this.effects.invincible > 0 ? { ...p, r: this.shieldRadius } : p;
        const hit=twin?this.orbit.hits(p,h):P.geometry.hits(collisionBody,h);
        this.trackNearMiss(h,twin?this.orbit.hits(p,h,{playerInset:1e-6,hazardInset:0}):P.geometry.hits(p,h,{playerInset:1e-6,hazardInset:0}),hit);
        if (hit) {
          if (this.effects.invincible > 0) { h.dead = true; this.emit({ kind: 'destroy', x: h.x, y: h.y }); }
          else { if(this.takeHit())break; h.dead=true;this.emit({kind:'destroy',x:h.x,y:h.y}); }
        }
      }
      this.hazards = this.hazards.filter(h => !h.dead && h.x > -130 && h.x < this.width+130 && h.y > -130 && h.y < this.height+130);
      if (this.state !== 'running') return;
      if (!frozen) {
        this.hazardClock -= dt;
        if (this.hazardClock <= 0) { this.spawnHazard(); this.hazardClock = C.generation.intervalStart - (C.generation.intervalStart - C.generation.intervalEnd) * Math.min(1, this.time / C.generation.rampSeconds); }
      }
      if (this.attract||twin) return;
      this.advanceCoinSpawns(dt);
      this.powerClock -= dt;
      if (this.powerClock <= 0) {
        if (this.pickups.filter(i => i.type !== 'coin' && !i.extraFreeze).length < C.powerLimit) {
          const r = this.random(); let sum = 0, selected = 'nova';
          // Transfer the entire source weight; never mutate the shared base
          // pool or the independent bonus-freeze cadence.
          const weights = { ...C.pickups.weights };
          if(this.gameMode==='hard'){weights.pulse+=weights.magnet;weights.magnet=0;}
          else {weights.magnet+=weights.pulse;weights.pulse=0;}
          for (const [type, weight] of Object.entries(weights)) { sum += weight; if (r < sum) { selected = type; break; } }
          this.spawnPickup(selected);
        }
        this.powerClock = this.range(...C.generation.powerInterval);
      }
      // Bonus freezes have their own cadence and capacity. They must never
      // replace a normal pickup or consume a slot in the original power pool.
      if (this.gameMode === 'hard') {
        this.extraFreezeClock -= dt;
        if (this.extraFreezeClock <= 0) {
          if (this.pickups.filter(i => i.extraFreeze).length < C.pickups.extraFreezeLimit) this.spawnPickup('freeze', true);
          const extraRate = C.pickups.weights.freeze * C.pickups.hardFreezeExtraFactor;
          this.extraFreezeClock += this.range(...C.generation.powerInterval) / extraRate;
        }
      }
    }
    advanceCoinSpawns(dt){
      this.coinClock -= dt;
      if (this.coinClock <= 0) {
        if (this.pickups.filter(i => i.type === 'coin').length < C.coinLimit) this.spawnPickup('coin');
        this.coinClock = C.generation.coinInterval;
      }
    }
  }
  P.Engine = Engine;
})(globalThis.PixelDodge);
