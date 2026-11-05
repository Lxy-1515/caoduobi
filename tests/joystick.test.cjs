const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Math,Date});
for(const name of ['content','geometry','engine'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8'),context);
const {Engine,config:C}=context.PixelDodge;
function game(mode='classic'){
 const e=new Engine(()=>.5);e.resize(4000,2000);e.start(false,mode);e.hazards=[];e.pickups=[];e.effects.invincible=1e6;e.hazardClock=e.coinClock=e.powerClock=e.extraFreezeClock=1e6;return e;
}
test('held joystick direction stays independent of old targets, keeps each mode speed and acceleration',()=>{
 for(const mode of ['classic','hard','monochrome','race']){
  const e=game(mode),p=e.player,racing=mode==='race';p.tx=p.x+1;p.ty=p.y;
  e.steerDirection(3,4);assert.equal(p.direction.x,.6);assert.equal(p.direction.y,.8);
  let previous={vx:0,vy:0};
  for(let i=0;i<120;i++){
   e.step(C.step);const speed=Math.hypot(p.vx,p.vy),change=Math.hypot(p.vx-previous.vx,p.vy-previous.vy);
   assert.ok(speed<=C.playerSpeed*(racing?3:1)+1e-8);assert.ok(change<=C.playerAcceleration*(racing?2:1)*C.step+1e-8);
   previous={vx:p.vx,vy:p.vy};
  }
  assert.ok(Math.abs(Math.hypot(p.vx,p.vy)-C.playerSpeed*(racing?3:1))<1e-8);assert.ok(Math.abs(p.vx/p.vy-.75)<1e-8);
  assert.ok(p.direction);assert.ok(p.x>p.tx+100,'passing the old mouse target cannot cancel joystick input');
 }
});
test('coast/release and pause preserve inertia; reset and resize discard the directional input',()=>{
 const e=game();e.steerDirection(1,0);for(let i=0;i<20;i++)e.step(C.step);
 const vx=e.player.vx;e.steerDirection(0,0);assert.equal(e.player.direction,null);e.step(C.step);assert.equal(e.player.vx,vx);
 e.steerDirection(0,1);e.coast();e.step(C.step);assert.equal(e.player.vx,vx);assert.equal(e.player.vy,0);
 e.steerDirection(0,1);e.pause();const y=e.player.y;e.step(.5);assert.equal(e.player.y,y);
 e.resize(3000,2000);assert.equal(e.player.direction,null);e.start();assert.equal(e.player.direction,null);
});
test('held joystick strength controls speed in every mode and never creeps to full speed',()=>{
 for(const mode of ['classic','hard','monochrome','race'])for(const strength of [.1,.25,.5,.75,1]){
  const e=game(mode);e.resize(10000,10000);const p=e.player,max=C.playerSpeed*(mode==='race'?3:1),acc=C.playerAcceleration*(mode==='race'?2:1);e.steerDirection(3,4,strength);let previous={vx:0,vy:0};
  for(let i=0;i<300;i++){e.step(C.step);assert.ok(Math.hypot(p.vx-previous.vx,p.vy-previous.vy)<=acc*C.step+1e-8);previous={vx:p.vx,vy:p.vy};}
  assert.ok(Math.abs(Math.hypot(p.vx,p.vy)-max*strength)<1e-8,JSON.stringify({mode,strength,speed:Math.hypot(p.vx,p.vy)}));
 }
});
test('reducing push and held center decelerate smoothly; releasing keeps the actual speed',()=>{
 for(const mode of ['classic','hard','monochrome','race']){
  const e=game(mode);e.resize(10000,10000);const p=e.player,max=C.playerSpeed*(mode==='race'?3:1);e.steerDirection(1,0);for(let i=0;i<120;i++)e.step(C.step);e.steerDirection(1,0,.5);e.step(C.step);assert.ok(p.vx<max&&p.vx>max*.5);
  for(let i=0;i<120;i++)e.step(C.step);assert.ok(Math.abs(p.vx-max*.5)<1e-8);e.coast();for(let i=0;i<20;i++)e.step(C.step);assert.ok(Math.abs(p.vx-max*.5)<1e-8);
  e.steerDirection(0,0,0);e.step(C.step);assert.ok(p.vx<max*.5&&p.vx>0);for(let i=0;i<120;i++)e.step(C.step);assert.equal(p.vx,0);assert.equal(p.vy,0);assert.equal(p.direction.strength,0);
 }
});
test('direction remains available at a wall, can reverse immediately, and mouse target restores original steering',()=>{
 const e=game(),p=e.player;p.x=p.r+.1;p.vx=-504;e.steerDirection(-1,0);e.step(C.step);
 assert.ok(p.x>=p.r);assert.ok(p.vx>0);assert.equal(p.direction.x,-1);
 e.steerDirection(1,0);e.step(C.step);assert.ok(p.vx>0);
 e.target(p.x+100,p.y+100);assert.equal(p.direction,null);assert.equal(p.steering,true);assert.equal(p.tx,p.x+100);
 e.steerDirection(Infinity,1);assert.equal(p.direction,null);assert.ok(Number.isFinite(p.vx));
});
