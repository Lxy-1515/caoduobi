const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ console, Date, Math });
for (const file of ['content', 'store', 'geometry', 'engine']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file + '.js'), 'utf8'), context);
const { Engine, Store, config, geometry } = context.PixelDodge;
const memory = () => ({ value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } });
const game = () => { const e = new Engine(() => .5); e.start(); e.pickups = []; e.hazardClock = 100; e.coinClock = 100; e.powerClock = 100; return e; };
const hazard = (e, x, type = 'normal') => ({ x, y: e.player.y, px: x, py: e.player.y, vx: 0, vy: 0, r: 15, type, spawn: 0, warning: null, dead: false });
test('settlement survives reload and cannot award twice; purchases never double-charge', () => {
  const disk = memory(), s = new Store(disk);
  const result = { id: 'run-a', coins: 50, time: 51 };
  assert.equal(s.settle(result).reward, 60); assert.equal(s.data.wallet, 60);
  assert.equal(s.settle(result), null);
  const loaded = new Store(disk); assert.equal(loaded.settle(result), null);
  assert.equal(loaded.purchase('player', 'sun').ok, true); assert.equal(loaded.data.wallet, 20);
  loaded.purchase('player', 'sun'); assert.equal(loaded.data.wallet, 20);
  assert.equal(loaded.purchase('hazard', 'white').ok, false);
  assert.equal(loaded.equip('player', 'sun'), true); assert.equal(loaded.equip('player', 'rose'), false);
  assert.equal(new Store(disk).data.equipped.player, 'sun');
});
test('corrupt saves are preserved, unavailable storage gives explicit volatile mode', () => {
  const disk = memory(); disk.value = '{broken'; const s = new Store(disk);
  assert.equal(s.status, 'corrupt'); s.settle({ id: 'x', coins: 3, time: 10 }); assert.equal(disk.value, '{broken');
  s.reset(); assert.equal(s.status, 'ok'); assert.equal(new Store(disk).data.wallet, 0);
  const bad = new Store({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  bad.settle({ id: 'x', coins: 2, time: 0 }); assert.equal(bad.status, 'volatile'); assert.equal(bad.data.wallet, 2);
});
test('grass records are separate per mode and preserve legacy time records and wallet rewards',()=>{
 const disk=memory(),s=new Store(disk);s.data.best=90;
 let receipt=s.settle({id:'grass-a',coins:2,time:10,grass:20,gameMode:'classic'});assert.equal(receipt.record,true);assert.equal(receipt.reward,4);assert.equal(s.data.best,90);
 receipt=s.settle({id:'grass-b',coins:0,time:50,grass:19,gameMode:'classic'});assert.equal(receipt.record,false);
 receipt=s.settle({id:'grass-c',coins:0,time:2,grass:1,gameMode:'hard'});assert.equal(receipt.record,true);
 const restored=new Store(disk);assert.equal(restored.data.grassBest.classic,20);assert.equal(restored.data.grassBest.hard,1);assert.equal(restored.data.best,90);
});
test('invalid balances and unowned equipment cannot enter a save', () => {
  const disk = memory(), s = new Store(disk); s.persist(); const data = JSON.parse(disk.value);
  data.wallet = -4; disk.value = JSON.stringify(data); assert.equal(new Store(disk).status, 'corrupt');
  data.wallet = 10; data.equipped.player = 'rose'; disk.value = JSON.stringify(data); assert.equal(new Store(disk).status, 'corrupt');
});
test('pickup invincibility takes priority over same-step collision; expiration restores death', () => {
  const e = game(); e.hazards.push(hazard(e, 360)); e.pickups.push({ type: 'invincible', x: 360, y: 360, r: 12, life: 10 });
  e.step(config.step); assert.equal(e.state, 'running'); assert.equal(e.hazards.length, 0); assert.ok(e.effects.invincible > 3.9);
  e.effects.invincible = .001; e.hazards.push(hazard(e, 360)); e.step(config.step); assert.equal(e.state, 'ended');
});
test('freeze pauses movement, rotation, splitting and spawning but does not remove collision', () => {
  const e = game(), h = hazard(e, 460, 'split'); h.vx = -40; h.angle = .4; h.spin = 2; e.hazards.push(h);
  e.collect({ type: 'freeze', x: 360, y: 360 }); e.hazardClock = .1; e.step(.2);
  assert.equal(h.x, 460); assert.equal(h.angle, .4); assert.equal(e.hazards.length, 1); assert.equal(e.hazardClock, .1);
  h.x = 360; e.step(.01); assert.equal(e.state, 'ended');
});
test('split is immediate without warning, children rotate and inherit color, clear prevents split', () => {
  const e = game(), h = hazard(e, 480, 'split'); h.vx = -30; e.hazards.push(h);
  h.colorIndex = 3; h.angle = .5; h.spin = .8;
  e.step(.01);
  assert.equal(e.hazards.length, 4); assert.ok(e.hazards.every(h => h.type === 'child'));
  assert.ok(e.hazards.every(h => h.colorIndex === 3 && Math.abs(h.spin) > 0));
  for (let i = 0; i < 30; i++) e.step(config.step);
  assert.equal(e.hazards.length, 4);
  e.collect({ type: 'nova', x: 360, y: 360 }); e.step(.01); assert.ok(e.hazards.length>0,'wave has not reached the children');e.step(.15);assert.equal(e.hazards.length,0);
  e.hazards.push(hazard(e, 480, 'split')); e.collect({ type: 'pulse', x: 360, y: 360 }); e.step(.15); assert.equal(e.hazards.length, 0);
});
test('local pulse and global clear have distinct ranges and leave pickups alone', () => {
  const e = game(); e.hazards = [hazard(e, 400), hazard(e, 700)]; e.pickups = [{ type: 'coin', x: 50, y: 50, life: 9, r: 8 }];
  assert.ok(Math.abs(Math.PI * config.pulseRange ** 2 / config.size ** 2 - .5) < 1e-12);
  e.collect({ type: 'pulse', x: 360, y: 360 });assert.equal(e.hazards.length,2);e.step(.02);assert.equal(e.hazards.length,1);e.step(.2);assert.equal(e.hazards.length,1);
  e.collect({ type: 'nova', x: 360, y: 360 });assert.equal(e.hazards.length,1);e.step(.21);assert.equal(e.hazards.length,0);assert.equal(e.pickups.length,1);
});

test('four split directions plus the incoming trail form five equally spaced rays',()=>{
  const e=game(),h=hazard(e,480,'split');h.vx=-120;h.vy=0;e.hazards=[h];e.step(.01);
  assert.equal(e.hazards.length,4);
  const angles=[0,...e.hazards.map(child=>(Math.atan2(child.vy,child.vx)+Math.PI*2)%(Math.PI*2))].sort((a,b)=>a-b);
  for(let i=0;i<5;i++)assert.ok(Math.abs(((angles[(i+1)%5]-angles[i]+Math.PI*2)%(Math.PI*2))-Math.PI*2/5)<1e-8);
  for(const child of e.hazards)assert.ok(Math.abs(Math.hypot(child.vx,child.vy)-144)<1e-8);
});
test('distant triangles split after 360 travelled units, with no travel during freeze',()=>{
  const e=game();e.effects.invincible=100;
  const h={...hazard(e,100,'split'),y:60,py:60,vx:120,distance:359};e.hazards=[h];
  e.effects.freeze=1;e.step(.5);assert.equal(h.distance,359);assert.equal(e.hazards.length,1);
  e.effects.freeze=0;e.step(1/120);assert.equal(e.hazards.length,4);assert.ok(e.hazards.every(h=>h.type==='child'));
  for(let i=0;i<60;i++)e.step(1/120);assert.equal(e.hazards.length,4);
});
test('splitting waits for capacity for all four children, never exceeding hazard limit',()=>{
  const e=game();e.attract=true;
  e.hazards=Array.from({length:68},()=>({...hazard(e,30),y:30,py:30}));
  const h=e.hazards[0];h.type='split';h.distance=360;h.vx=1;
  e.step(.01);assert.equal(e.hazards.filter(h=>h.type==='child').length,0);
  e.hazards.pop();e.step(.01);assert.equal(e.hazards.length,70);assert.equal(e.hazards.filter(h=>h.type==='child').length,4);
});
test('attract mode is invulnerable and never spawns pickups, coins or results',()=>{
  const e=new Engine(()=>.5);e.start(true);e.hazards=[hazard(e,e.player.x)];e.whiteBall.x=e.player.x;e.whiteBall.y=e.player.y;
  for(let i=0;i<1200;i++)e.step(config.step);
  e.collect({type:'coin'});e.finish('quit');
  assert.equal(e.state,'running');assert.equal(e.pickups.length,0);assert.equal(e.coins,0);assert.equal(e.result,null);assert.ok(e.hazards.length>0);
});
test('rectangular worlds preserve circle size, use full boundaries and place pickups inside',()=>{
  for(const [width,height] of [[1440,720],[720,1560]]){
    const e=game();e.resize(width,height);e.start(true);e.player.x=width-10;e.player.y=height-10;e.player.vx=200;e.player.vy=200;
    e.whiteBall.x=width-10;e.whiteBall.y=height-10;e.step(.1);
    assert.ok(e.player.x<=width-9&&e.player.y<=height-9);assert.ok(e.player.vx<0&&e.player.vy<0);
    assert.ok(e.whiteBall.x<=width-9&&e.whiteBall.y<=height-9);assert.equal(e.player.r,9);
    e.attract=false;e.spawnPickup('coin');assert.ok(e.pickups[0].x<=width-45&&e.pickups[0].y<=height-45);
  }
});
test('effects refresh instead of stacking; magnet attracts only fragments; fragments stay in-run', () => {
  const e = game(); e.collect({ type: 'invincible', x: 0, y: 0 }); e.effects.invincible = 2;
  e.collect({ type: 'invincible', x: 0, y: 0 }); assert.equal(e.effects.invincible, 4);
  e.collect({ type: 'magnet', x: 0, y: 0 });
  e.pickups = [{ type: 'coin', x: 450, y: 360, life: 9, r: 8 }, { type: 'freeze', x: 450, y: 360, life: 10, r: 12 }];
  e.step(.1); assert.equal(e.pickups[0].x,450); e.updateMagnet(.15);
  e.step(.1); assert.ok(e.pickups[0].x < 450); assert.equal(e.pickups[1].x, 450);
  e.collect({ type: 'coin', x: 0, y: 0 }); assert.equal(e.coins, 1); assert.equal(e.result, null);
});
test('pause freezes all simulation; finish is idempotent; swept collision catches fast crossing', () => {
  const e = game(); e.pause(); const time = e.time; e.step(1); assert.equal(e.time, time); e.resume();
  const h = hazard(e, 250); h.vx = 24000; e.hazards.push(h); e.step(.01); assert.equal(e.state, 'ended');
  const result = e.result; e.finish('quit'); assert.equal(e.result, result); e.step(2); assert.equal(e.time, result.time);
});
test('sustained simulation bounds entities and effects queues', () => {
  let seed = 43; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const e = new Engine(random); e.start();
  for (let i = 0; i < 24000; i++) {
    e.effects.invincible = 2; e.target(360 + Math.cos(i / 90) * 260, 360 + Math.sin(i / 130) * 260); e.step(1 / 60);
    assert.ok(e.hazards.length <= config.hazardLimit); assert.ok(e.pickups.length <= config.coinLimit + config.powerLimit); assert.ok(e.events.length <= 160);
  }
  assert.equal(e.state, 'running'); assert.ok(e.time > 390);
});

test('acceleration and maximum speed are bounded; a still cursor is crossed without stopping', () => {
  const e = game(); e.target(500, 360);
  let previous = 0;
  for (let i = 0; i < 85; i++) {
    e.step(config.step); const speed = Math.hypot(e.player.vx, e.player.vy);
    assert.ok(speed <= config.playerSpeed + 1e-8);
    assert.ok(speed - previous <= config.playerAcceleration * config.step + 1e-8); previous = speed;
  }
  assert.ok(e.player.x > 500); assert.equal(e.player.steering, false);
  const vx = e.player.vx, start = e.player.x;
  for (let i = 0; i < 20; i++) e.step(config.step);
  assert.equal(e.player.vx, vx); assert.ok(e.player.x > start);
  e.target(300, 300); const oldV = { x: e.player.vx, y: e.player.vy }; e.step(config.step);
  assert.equal(e.player.steering, true); assert.ok(Math.hypot(e.player.vx-oldV.x,e.player.vy-oldV.y) <= config.playerAcceleration*config.step+1e-8);
});
test('coasting bounces at field edges without changing speed, pause preserves velocity', () => {
  const e = game(); e.player.x = 710; e.player.vx = 300; e.step(.01);
  assert.equal(e.player.vx, -300); assert.ok(e.player.x <= 711); e.pause(); e.step(1); assert.equal(e.player.vx, -300); e.resume(); e.step(.01); assert.equal(e.player.vx, -300);
});
const shapeHit = (type, x, y, extra = {}, player = {}) => geometry.hits({x,y,px:x,py:y,r:9,...player}, {x:0,y:0,px:0,py:0,r:20,type,angle:0,...extra});
test('circles have 3px obstacle inset plus 2px player inset', () => {
  assert.equal(shapeHit('normal', 25, 0), false); assert.equal(shapeHit('normal', 23, 0), true);
  assert.equal(shapeHit('large', 25, 0), false); assert.equal(shapeHit('large', 23, 0), true);
});
test('triangle empty corners never use circular hitboxes, and edges are inset', () => {
  assert.equal(shapeHit('split', 17, -13), false);
  assert.equal(shapeHit('split', 0, -20), true);
  assert.equal(shapeHit('split', 0, 15), false);
  assert.equal(shapeHit('split', 0, 13), true);
});
test('square corners are collidable, sides have forgiving inset', () => {
  assert.equal(shapeHit('fast', 20, 20), true);
  assert.equal(shapeHit('fast', 25, 0), false);
  assert.equal(shapeHit('fast', 23, 0), true);
});
test('rotated triangle and square collision track the visible orientation', () => {
  assert.equal(shapeHit('fast', 28, 0), false);
  assert.equal(shapeHit('fast', 28, 0, {angle:Math.PI/4}), true);
  assert.equal(shapeHit('split', 0, 20), false);
  assert.equal(shapeHit('split', 0, 20, {angle:Math.PI}), true);
});
test('swept polygons catch fast crossing and rotation between clear endpoints', () => {
  for (const type of ['fast','split','child']) {
    assert.equal(shapeHit(type, 100, 0, {}, {px:-100,py:0}), true);
    assert.equal(shapeHit(type, 100, 60, {}, {px:-100,py:60}), false);
  }
  assert.equal(shapeHit('fast', 28, 0, {previousAngle:0, angle:Math.PI/2}), true);
  assert.equal(shapeHit('fast', 33, 0, {previousAngle:0, angle:Math.PI/2}), false);
});
test('normal, fast and split share equal weight; disabled large never spawns', () => {
  for (const time of [0,60,180]) {
    const e = game(), count = {normal:0,large:0,fast:0,split:0}; e.time = time;
    for (let i=0;i<3000;i++) { let first=true; e.random=()=>{if(first){first=false;return (i+.5)/3000;}return .5;}; e.hazards=[]; e.spawnHazard(); count[e.hazards[0].type]++; }
    assert.deepEqual(count, {normal:1000,large:0,fast:1000,split:1000});
  }
  assert.equal(config.generation.firstPower,3); assert.ok(config.generation.powerInterval[1] < 6); assert.equal(config.powerLimit,5);
  for(const [roll,type] of [[.2,'normal'],[.4,'fast'],[.6,'fast'],[.99,'split']]) {
    const initial=game();initial.random=()=>roll;initial.spawnHazard();assert.equal(initial.hazards[0].type,type);
  }
});

test('exactly one white ball starts immediately, keeps maximum speed and survives every item', () => {
  const e=game(),ball=e.whiteBall;
  assert.equal(ball.r,e.player.r);assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-config.playerSpeed)<1e-8);
  for(const type of ['coin','invincible','magnet','freeze','pulse','nova']) {
    e.collect({type,x:ball.x,y:ball.y});assert.equal(e.whiteBall,ball);assert.ok(!e.hazards.includes(ball));
  }
  const x=ball.x,y=ball.y;e.step(.1);assert.ok(Math.hypot(ball.x-x,ball.y-y)>0);assert.ok(e.effects.freeze>0);
  assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-config.playerSpeed)<1e-8);
  e.effects.invincible=1000;
  for(let i=0;i<1200;i++){e.step(config.step);assert.ok(ball.x>=ball.r && ball.x<=720-ball.r);assert.ok(ball.y>=ball.r && ball.y<=720-ball.r);}
  assert.equal(e.whiteBall,ball);assert.ok(Math.abs(Math.hypot(ball.vx,ball.vy)-config.playerSpeed)<1e-8);
  e.start();assert.notEqual(e.whiteBall,ball);assert.equal(e.hazards.length,0);assert.ok(Math.hypot(e.whiteBall.x-e.player.x,e.whiteBall.y-e.player.y)>=150);
});
test('white ball collision kills normally; invincibility protects player without destroying ball', () => {
  for(const protectedPlayer of [false,true]){
    const e=game(),ball=e.whiteBall;ball.x=ball.px=330;ball.y=ball.py=360;ball.vx=config.playerSpeed;ball.vy=0;
    e.effects.invincible=protectedPlayer?4:0;e.step(.1);
    assert.equal(e.state,protectedPlayer?'running':'ended');assert.equal(e.whiteBall,ball);
  }
});
test('white ball rebounds at walls and pauses only with game pause', () => {
  const e=game(),b=e.whiteBall;e.effects.invincible=10;b.x=710;b.y=100;b.vx=config.playerSpeed;b.vy=0;
  e.step(.02);assert.ok(b.vx<0);assert.ok(b.x<711);const x=b.x;e.pause();e.step(1);assert.equal(b.x,x);
});
test('ability pickups request ghost clearing within their own ranges', () => {
  const e=game();e.collect({type:'coin',x:0,y:0});e.collect({type:'magnet',x:0,y:0});assert.equal(e.ghostClearVersion,0);
  for(const type of ['invincible','freeze','pulse','nova'])e.collect({type,x:0,y:0});
  assert.equal(e.ghostClearVersion,2);
  assert.deepEqual(Array.from(e.ghostClearRequests,r=>r.radius),[config.radius,Infinity]);
  assert.equal(e.clearWaves[0].limit,config.pulseRange);assert.equal(e.clearWaves[1].limit,Math.hypot(360,360));
  assert.ok(e.clearWaves.every(w=>w.radius===0));
});
test('shield retains radius 40 independently of large obstacles, refreshes smoothly and shrinks to player',()=>{
  const e=game();e.collect({type:'invincible',x:360,y:360});
  assert.equal(e.shieldRadius,config.radius);e.step(.08);
  assert.ok(e.shieldRadius>config.radius && e.shieldRadius<config.shieldRadius);
  e.step(.08);assert.equal(e.shieldRadius,40);assert.equal(config.hazards.large.radius[1],120);
  e.effects.invincible=.18;e.step(.09);const half=e.shieldRadius;
  assert.ok(half>config.radius && half<config.shieldRadius);
  e.collect({type:'invincible',x:360,y:360});assert.equal(e.shieldRadius,half);e.step(.01);assert.ok(e.shieldRadius>half);
  e.effects.invincible=.18;e.step(.18);assert.equal(e.shieldRadius,config.radius);
});
test('shield uses the animated radius to break hazards and pauses with simulation',()=>{
  const e=game();e.collect({type:'invincible',x:360,y:360});e.step(.16);
  const near=360+config.shieldRadius+6,far=360+config.shieldRadius+25;
  e.hazards=[hazard(e,near),hazard(e,far)];e.step(config.step);
  assert.equal(e.hazards.length,1);assert.equal(e.hazards[0].x,far);
  const radius=e.shieldRadius;e.pause();e.step(.5);assert.equal(e.shieldRadius,radius);
});
test('magnet grows and retracts from the player, refreshes smoothly and uses current range',()=>{
  const e=game();e.collect({type:'magnet',x:360,y:360});assert.equal(e.magnetRadius,9);
  e.updateMagnet(.125);assert.ok(e.magnetRadius>9&&e.magnetRadius<180);
  e.updateMagnet(.125);assert.equal(e.magnetRadius,180);
  e.effects.magnet=.3;e.updateMagnet(.15);const half=e.magnetRadius;assert.ok(half>9&&half<180);
  e.collect({type:'magnet',x:360,y:360});assert.equal(e.magnetRadius,half);e.updateMagnet(.01);assert.ok(e.magnetRadius>half);
  e.effects.magnet=.3;e.updateMagnet(.3);assert.equal(e.magnetRadius,9);
  e.pause();e.step(.5);assert.equal(e.magnetRadius,9);
});
test('large obstacles have triple the former diameter without changing the shield',()=>{
  assert.deepEqual(Array.from(config.hazards.large.radius),[90,120]);
  assert.equal(config.shieldRadius,40);
});
