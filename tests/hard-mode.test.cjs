const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Math,Date});
for(const file of ['content','geometry','engine','render'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file+'.js'),'utf8'),context);
const P=context.PixelDodge;
function fixture(mode='hard'){
 const e=new P.Engine(()=>.5);e.start(false,mode);e.pickups=[];e.hazards=[];e.hazardClock=e.coinClock=e.powerClock=100;
 Object.assign(e.player,{x:300,y:300,px:300,py:300,vx:0,vy:0,steering:false});
 Object.assign(e.whiteBall,{x:30,y:30,px:30,py:30});
 const r=Object.create(P.Renderer.prototype);r.reset();r.clock=0;
 return {e,r};
}
const ghost=(x=300,y=300,type='normal',extra={})=>({x,y,type,r:20,angle:0,previousAngle:0,spin:0,age:0,color:'#2789ef',...extra});
const update=(e,r,dt=P.config.step)=>r.updateGhosts(e,P.skins.hazard[0],dt);
test('mode-specific magnet/pulse weights transfer entirely while other weights and cadence stay unchanged',()=>{
 for(const mode of ['hard','classic','monochrome']){
  const counts={invincible:0,magnet:0,freeze:0,pulse:0,nova:0};
  const {e}=fixture(mode);
  e.extraFreezeClock=1000;
  for(let i=0;i<4000;i++){
   e.random=()=> (i+.5)/4000;e.powerClock=0;e.pickups=[];e.step(P.config.step);
   assert.equal(e.state,'running');assert.equal(e.pickups.length,1);counts[e.pickups[0].type]++;
   assert.ok(e.powerClock>=3&&e.powerClock<=5);
  }
  assert.deepEqual(counts,{invincible:1000,magnet:mode==='hard'?0:1880,freeze:800,pulse:mode==='hard'?1880:0,nova:320});
  assert.equal(P.config.pickups.weights.magnet,.25);assert.equal(P.config.pickups.weights.pulse,.22);
 }
});
test('hard adds freezes independently without blocking or consuming original slots',()=>{
 const {e}=fixture();e.random=()=>.5;e.powerClock=1;e.extraFreezeClock=0;
 e.pickups=Array.from({length:5},()=>({type:'nova',x:600,y:600,r:13,life:10}));
 e.step(P.config.step);assert.equal(e.pickups.length,6);assert.equal(e.pickups.at(-1).type,'freeze');assert.equal(e.pickups.at(-1).extraFreeze,true);
 assert.ok(Math.abs(e.powerClock-(1-P.config.step))<1e-9);assert.ok(Math.abs(e.extraFreezeClock-(4/.6-P.config.step))<1e-9);
 e.pickups=e.pickups.filter(i=>i.extraFreeze);e.powerClock=0;e.step(P.config.step);
 assert.equal(e.pickups.length,2);assert.equal(e.pickups.filter(i=>!i.extraFreeze).length,1,'normal draw still happens');
 e.pickups=Array.from({length:3},()=>({type:'freeze',extraFreeze:true,x:600,y:600,r:13,life:10}));e.extraFreezeClock=0;e.powerClock=100;
 e.step(P.config.step);assert.equal(e.pickups.length,3,'bonus pool is bounded');
 const clock=e.extraFreezeClock;e.pause();e.step(1);assert.equal(e.extraFreezeClock,clock);e.start(false,'hard');assert.ok(Math.abs(e.extraFreezeClock-5)<1e-9);
 for(const mode of ['classic','monochrome']){e.start(false,mode);e.extraFreezeClock=0;e.powerClock=100;e.step(P.config.step);assert.equal(e.pickups.filter(i=>i.extraFreeze).length,0);}
});
test('additional freeze cadence supplies three times the original expected freeze rate',()=>{
 const {e}=fixture();e.random=()=>.5;e.extraFreezeClock=0;e.powerClock=e.hazardClock=e.coinClock=1e6;e.effects.invincible=1e6;
 let extra=0;e.spawnPickup=(type,bonus)=>{assert.equal(type,'freeze');assert.equal(bonus,true);extra++;};
 for(let i=0;i<120*200;i++)e.step(P.config.step);
 assert.ok(extra>=30&&extra<=31,`200 seconds supplies about 30 bonus freezes, got ${extra}`);
});
test('hard copies kill with swept true geometry; classic and monochrome clear safely',()=>{
 for(const mode of ['hard','classic','monochrome'])for(const type of ['normal','fast','split','child']){
  const {e,r}=fixture(mode);r.obstacleGhosts=[ghost(300,300,type)];r.ghostPlayerPrevious={x:220,y:300};e.player.x=380;
  update(e,r);assert.equal(e.state,mode==='hard'?'ended':'running');
  assert.equal(r.obstacleGhosts.length,mode==='hard'?1:0);
  if(mode==='hard'){assert.equal(e.result.reason,'trail');assert.equal(r.ghostTouchCount,0);}
 }
});
test('hard copies preserve polygon corners, edge insets and rotational collision',()=>{
 const {e,r}=fixture();e.player.px=e.player.x=321;e.player.py=e.player.y=285;r.obstacleGhosts=[ghost(300,300,'split')];
 update(e,r);assert.equal(e.state,'running','empty corner is safe');
 e.player.px=e.player.x=325;e.player.py=e.player.y=300;r.ghostPlayerPrevious=null;r.obstacleGhosts=[ghost()];update(e,r);assert.equal(e.state,'running','slight visual overlap is safe');
 e.player.px=e.player.x=323;r.ghostPlayerPrevious=null;update(e,r);assert.equal(e.state,'ended');
 const rotating=fixture();rotating.e.player.px=rotating.e.player.x=327;rotating.r.obstacleGhosts=[ghost(300,300,'fast',{spin:Math.PI*60})];
 update(rotating.e,rotating.r);assert.equal(rotating.e.state,'ended','square corner rotates into player');
});
test('hard freeze wave is visible but never clears copies; magnet attracts without clearing',()=>{
 for(const type of ['freeze','magnet'])for(const mode of ['hard','classic','monochrome']){
  const {e,r}=fixture(mode);r.obstacleGhosts=[ghost(400,300)];e.collect({type,x:300,y:300});e.time=.2;e.magnetRadius=180;
  update(e,r);assert.equal(r.obstacleGhosts.length,mode==='hard'?1:0,mode+'/'+type);
  if(type==='freeze')assert.ok(r.freezeWaves[0].radius>0,'wave still visible');
  if(type==='magnet'){
   e.pickups=[{type:'coin',x:450,y:300,r:8,life:9}];e.step(P.config.step);assert.ok(e.pickups[0].x<450,'attraction retained');
  }
 }
});
test('frozen hard copies remain lethal, stop spinning, expire, and pause freezes them',()=>{
 const {e,r}=fixture();e.effects.freeze=3;r.obstacleGhosts=[ghost(400,300,'fast',{spin:1})];e.pause();
 update(e,r,0);assert.equal(r.obstacleGhosts[0].age,0);assert.equal(r.obstacleGhosts[0].angle,0);
 e.resume();update(e,r);assert.equal(r.obstacleGhosts[0].angle,0);assert.ok(r.obstacleGhosts[0].age>0);
 e.player.x=400;update(e,r);assert.equal(e.state,'ended');
 const expired=fixture();expired.e.effects.freeze=3;expired.r.obstacleGhosts=[ghost(300,300,'normal',{age:3.999})];update(expired.e,expired.r);
 assert.equal(expired.e.state,'running');assert.equal(expired.r.obstacleGhosts.length,0);assert.equal(expired.r.ghostShards.length,4);
});
test('shield and instant clears still protect hard runs, including pickup on contact',()=>{
 for(const type of ['invincible','pulse','nova']){
  const {e,r}=fixture();r.obstacleGhosts=[ghost()];e.pickups=[{type,x:300,y:300,r:13,life:10}];
  e.step(P.config.step);update(e,r);assert.equal(e.state,'running');assert.equal(r.obstacleGhosts.length,0);assert.equal(r.ghostShards.length,4);
 }
 const {e,r}=fixture();e.effects.invincible=2;e.shieldRadius=40;r.obstacleGhosts=[ghost(350,300)];update(e,r);
 assert.equal(e.state,'running');assert.equal(r.obstacleGhosts.length,0);assert.equal(r.ghostTouchCount,1);
});
test('hard mode ignores magnet clearing even alongside a smaller shield',()=>{
 const {e,r}=fixture();e.effects.invincible=2;e.shieldRadius=40;e.effects.magnet=5;e.magnetRadius=180;
 r.obstacleGhosts=[ghost(420,300)];update(e,r);assert.equal(r.obstacleGhosts.length,1);
 e.effects.invincible=0;e.player.x=420;update(e,r);assert.equal(e.state,'ended');
});
test('mode belongs to the run, does not leak into classic or attract, and default stays classic',()=>{
 const {e}=fixture();assert.equal(e.gameMode,'hard');e.start(false,e.gameMode);assert.equal(e.gameMode,'hard');
 e.start();assert.equal(e.gameMode,'classic');e.start(true,'hard');assert.equal(e.gameMode,'classic');
 assert.equal(e.attract,true);assert.equal(e.pickups.length,0);
 e.start(false,'monochrome');assert.equal(e.gameMode,'monochrome');e.start(false,e.gameMode);assert.equal(e.gameMode,'monochrome');
 e.start(true,'monochrome');assert.equal(e.gameMode,'classic');
});
