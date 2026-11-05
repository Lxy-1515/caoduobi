const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Date,Math});for(const f of ['content','geometry','engine','render'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f+'.js'),'utf8'),context);
const P=context.PixelDodge,C=P.config;
const ghost=(x,y=100,extra={})=>({type:'normal',x,y,r:20,angle:0,spin:0,age:0,colorIndex:0,...extra});
const hazard=(x,y=100)=>({...ghost(x,y),px:x,py:y,previousAngle:0,vx:0,vy:0,spawn:0,dead:false});
function fixture(mode='classic'){
 const e=new P.Engine(()=>.5);e.start(false,mode);e.pickups=[];e.hazardClock=e.powerClock=e.coinClock=e.extraFreezeClock=1e6;
 Object.assign(e.player,{x:100,y:100,px:100,py:100,vx:0,vy:0,steering:false});Object.assign(e.whiteBall,{x:30,y:650,px:30,py:650,vx:0,vy:0});
 const r=Object.create(P.Renderer.prototype);r.reset();r.clock=0;return {e,r};
}
function step(e,r,dt){e.step(dt);r.updateGhosts(e,P.skins.hazard[0],e.state==='paused'?0:dt);}
test('pulse/nova share freeze speed, visible reach, pause and true local/global limits in all modes',()=>{
 for(const mode of ['classic','hard','monochrome'])for(const type of ['pulse','nova']){
  const {e,r}=fixture(mode);e.hazards=[hazard(200),hazard(500)];r.obstacleGhosts=[ghost(200),ghost(500)];e.collect({type,x:100,y:100});
  assert.equal(e.hazards.length,2);assert.equal(e.clearWaves[0].radius,0);step(e,r,.04);
  assert.equal(e.clearWaves[0].radius,64);assert.equal(e.hazards.length,2);assert.equal(r.obstacleGhosts.length,2);
  step(e,r,.01);assert.ok(Math.abs(e.clearWaves[0].radius-80)<1e-9);assert.equal(e.hazards.length,1);assert.equal(r.obstacleGhosts.length,1);assert.equal(e.grass,1);assert.equal(r.ghostTouchCount,1);
  e.pause();const before=JSON.stringify(e.clearWaves);step(e,r,1);assert.equal(JSON.stringify(e.clearWaves),before);e.resume();
  step(e,r,.2);assert.equal(e.hazards.length,type==='pulse'?1:0);assert.equal(r.obstacleGhosts.length,type==='pulse'?1:0);assert.equal(e.clearedGhosts,type==='pulse'?1:2);
  assert.equal(e.events.filter(ev=>ev.kind==='destroy').length,type==='pulse'?1:2);assert.ok(e.clearWaves[0].radius<=e.clearWaves[0].limit);
 }
});
test('grass counts active removals once, excludes expiry and automatic removals, and snapshots at finish',()=>{
 for(const reason of ['body','shield','magnet','freeze','pulse','nova','expiry','overlap','pickup','capacity']){
  const {e,r}=fixture();e.time=6;r.obstacleGhosts=[ghost(200)];
  if(reason==='body'){e.player.x=200;r.ghostPlayerPrevious={x:100,y:100};}
  if(reason==='shield'){e.player.x=e.player.px=150;e.effects.invincible=4;e.shieldRadius=40;}
  if(reason==='magnet'){e.effects.magnet=5;e.magnetRadius=180;}
  if(['freeze','pulse','nova'].includes(reason)){e.collect({type:reason,x:100,y:100});e.time+=.1;e.advanceClearWaves();}
  if(reason==='expiry')r.obstacleGhosts[0].age=3.999;
  if(reason==='overlap')r.obstacleGhosts.push(ghost(210));
  if(reason==='pickup')e.pickups=[{type:'coin',x:200,y:100,r:8,life:9}];
  if(reason==='capacity')for(let i=0;i<700;i++)r.obstacleGhosts.push(ghost(1000+i*50));
  r.updateGhosts(e,P.skins.hazard[0],.01);
  const active=['body','shield','magnet','freeze','pulse','nova'].includes(reason);
  assert.equal(e.clearedGhosts,active?1:0,reason);assert.equal(e.grass,active?4:3,reason);assert.equal(r.ghostTouchCount,active?1:0,reason);
  r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(e.clearedGhosts,active?1:0,'never count twice');
  e.finish('quit');assert.equal(e.result.grass,e.grass);assert.equal(e.result.gameMode,'classic');
 }
 const {e}=fixture();e.time=1.999;assert.equal(e.grass,0);e.time=2;assert.equal(e.grass,1);e.pause();e.step(10);assert.equal(e.grass,1);
 const timed=fixture();for(let i=0;i<240;i++)timed.e.step(C.step);assert.equal(timed.e.grass,1,'exactly 240 physics steps award one point');
});
test('hard shields store and consume only one charge on hazard, white ball or lethal trail',()=>{
 for(const source of ['hazard','white','trail']){
  const {e,r}=fixture('hard');for(let i=0;i<2;i++)e.collect({type:'invincible',x:100,y:100});
  assert.equal(e.shieldStock,2);assert.equal(e.effects.invincible,0);assert.equal(e.ghostClearRequests.length,0);
  step(e,r,.01);assert.equal(e.shieldStock,2);assert.equal(e.effects.invincible,0);
  if(source==='hazard')e.hazards=[hazard(100),hazard(105)];
  if(source==='white')Object.assign(e.whiteBall,{x:100,y:100,px:100,py:100});
  if(source==='trail')r.obstacleGhosts=[ghost(100)];
  step(e,r,C.step);assert.equal(e.state,'running',source);assert.equal(e.shieldStock,1,source);assert.equal(e.effects.invincible,4,source);
  assert.equal(e.whiteBall.type,'whiteBall');assert.equal(e.clearedGhosts,source==='trail'?1:0);
  step(e,r,C.step);assert.equal(e.shieldStock,1,'active shield never consumes again');
  e.finish('quit');assert.equal(e.state,'ended');assert.equal(e.shieldStock,1,'manual quit is not a rescue');
  e.start(false,'hard');assert.equal(e.shieldStock,0);assert.equal(e.clearedGhosts,0);
 }
});
test('no reserve means death; other modes still activate shields immediately; stock works on pickup collision',()=>{
 const {e,r}=fixture('hard');e.hazards=[hazard(100)];step(e,r,C.step);assert.equal(e.state,'ended');
 for(const mode of ['classic','monochrome']){const {e}=fixture(mode);e.collect({type:'invincible',x:100,y:100});assert.equal(e.effects.invincible,4);assert.equal(e.shieldStock,0);}
 const f=fixture('hard');f.e.hazards=[hazard(100)];f.e.pickups=[{type:'invincible',x:100,y:100,r:13,life:10}];step(f.e,f.r,C.step);
 assert.equal(f.e.state,'running');assert.equal(f.e.shieldStock,0);assert.equal(f.e.effects.invincible,4);
 f.e.effects.invincible=2;f.e.collect({type:'invincible',x:100,y:100});assert.equal(f.e.effects.invincible,2,'pickup stores without refreshing an active shield');assert.equal(f.e.shieldStock,1);
});
test('opening coins and opponent are random, bounded, separated and safe even with constant random',()=>{
 let seed=731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},starts=new Set(),directions=new Set();
 for(const [width,height]of [[720,720],[1560,720],[720,1560]])for(let i=0;i<30;i++){
  const e=new P.Engine(random);e.resize(width,height);e.start();const b=e.whiteBall;
  assert.equal(e.pickups.length,3);assert.equal(e.pickups.filter(p=>p.type==='coin').length,3);assert.ok(Math.hypot(b.x-e.player.x,b.y-e.player.y)>=150);assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-C.playerSpeed)<1e-8);
  for(const item of [b,...e.pickups]){assert.ok(item.x>=item.r&&item.x<=width-item.r);assert.ok(item.y>=item.r&&item.y<=height-item.r);}
  for(let j=0;j<3;j++){const coin=e.pickups[j];assert.ok(Math.hypot(coin.x-e.player.x,coin.y-e.player.y)>=60);for(const a of [b,...e.pickups.slice(0,j)])assert.ok(Math.hypot(coin.x-a.x,coin.y-a.y)>coin.r+a.r+24);}
  starts.add(b.x+','+b.y);directions.add(b.vx+','+b.vy);
 }
 assert.equal(starts.size,90);assert.equal(directions.size,90);
 for(const value of [0,.5,1]){const e=new P.Engine(()=>value);e.start();assert.equal(e.pickups.length,3);assert.equal(new Set(e.pickups.map(p=>p.x+','+p.y)).size,3);}
});
