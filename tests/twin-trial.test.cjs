const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console,Date,Math});for(const file of ['content','store','geometry','twin-orbit','engine'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file+'.js'),'utf8'),c);
const P=c.PixelDodge,C=P.config,close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function game(mode){const e=new P.Engine(()=>.5);e.start(false,mode);e.hazardClock=10000;return e;}
function symmetric(e){const o=e.orbit,p=e.player,b=e.whiteBall;close(Math.hypot(p.x-o.x,p.y-o.y),o.radius);close(Math.hypot(b.x-o.x,b.y-o.y),o.radius);close(p.x+b.x,2*o.x);close(p.y+b.y,2*o.y);}
function obstacle(type,body){return{type,x:body.x,y:body.y,px:body.x,py:body.y,r:type==='large'?105:15,vx:0,vy:0,angle:0,previousAngle:0,spin:0,spawn:0,dead:false};}

test('twin has a fixed 210-radius centered track, opposed black/white, no starting or later pickups',()=>{
 const e=game('twin');assert.equal(e.gameMode,'twin');assert.equal(e.orbit.radius,210);assert.equal(e.pickups.length,0);assert.equal(e.whiteBalls.length,1);symmetric(e);
 for(const type of Object.keys(P.items)){e.spawnPickup(type);e.collect({type,x:0,y:0});}assert.equal(e.pickups.length,0);assert.equal(e.coins,0);assert.ok(Object.values(e.effects).every(x=>x===0));
 e.steerDirection(1,0);for(let i=0;i<1800;i++){e.step(C.step);symmetric(e);}assert.equal(e.pickups.length,0);assert.equal(e.hazards.length,0);
 e.hazardClock=0;e.step(C.step);assert.equal(e.hazards.length,1);assert.ok(['normal','fast','split'].includes(e.hazards[0].type));assert.equal(e.pickups.length,0);
});

test('twin joystick follows the local tangent at all angles, retains analog speed and release inertia',()=>{
 for(let i=0;i<8;i++)for(const sign of [-1,1]){
  const e=game('twin'),o=e.orbit;o.angle=i*Math.PI/4;o.place();const dx=-Math.sin(o.angle)*sign,dy=Math.cos(o.angle)*sign;
  e.steerDirection(dx,dy,.5);e.step(C.step);close(o.speed,sign*C.playerAcceleration*C.step);
  assert.ok((e.player.x-e.player.px)*dx+(e.player.y-e.player.py)*dy>0,'movement agrees with screen-space joystick');
  for(let j=0;j<100;j++){e.steerDirection(-Math.sin(o.angle)*sign,Math.cos(o.angle)*sign,.5);e.step(C.step);}close(o.speed,sign*252);symmetric(e);
 }
 const e=game('twin');for(let i=0;i<120;i++){e.steerDirection(-Math.sin(e.orbit.angle),Math.cos(e.orbit.angle),.5);e.step(C.step);}close(e.orbit.speed,252);e.coast();for(let i=0;i<60;i++)e.step(C.step);close(e.orbit.speed,252);
 e.steerDirection(0,0,0);for(let i=0;i<60;i++)e.step(C.step);close(e.orbit.speed,0);
 for(let i=0;i<120;i++){e.steerDirection(Math.sin(e.orbit.angle),-Math.cos(e.orbit.angle));e.step(C.step);}close(e.orbit.speed,-504);close(e.player.vx,-e.whiteBall.vx);close(e.player.vy,-e.whiteBall.vy);symmetric(e);
});

test('twin radial joystick push does not invent a tangential direction; bottom right push moves right',()=>{
 for(let i=0;i<8;i++){
  const e=game('twin'),o=e.orbit;o.angle=i*Math.PI/4;o.place();e.steerDirection(Math.cos(o.angle),Math.sin(o.angle));e.step(C.step);close(o.speed,0);symmetric(e);
 }
 const e=game('twin');e.steerDirection(1,0);e.step(C.step);assert.ok(e.player.x>e.player.px);assert.ok(e.orbit.speed<0);
});

test('pointer/finger target follows the shortest angular direction then coasts beyond a stationary target',()=>{
 const e=game('twin'),o=e.orbit;e.target(o.x+o.radius,o.y);e.step(C.step);assert.ok(o.speed<0);
 for(let i=0;i<200&&e.player.steering;i++)e.step(C.step);assert.equal(e.player.steering,false);const speed=o.speed,angle=o.angle;e.step(.05);close(o.speed,speed);assert.ok(o.angle!==angle);symmetric(e);
 o.angle=Math.PI-.01;o.place();o.speed=0;e.target(o.x+Math.cos(-Math.PI+.1)*o.radius,o.y+Math.sin(-Math.PI+.1)*o.radius);e.step(C.step);assert.ok(o.speed>0);
});

test('twin pause and resize keep the orbit centered and symmetric; switching mode restores free movement',()=>{
 const e=game('twin');e.steerDirection(1,0);e.step(.1);e.pause();const angle=e.orbit.angle,time=e.time;e.step(20);assert.equal(e.orbit.angle,angle);assert.equal(e.time,time);
 e.resize(1440,720);assert.equal(e.orbit.x,720);assert.equal(e.orbit.y,360);assert.equal(e.orbit.radius,210);symmetric(e);e.resize(320,240);assert.ok(e.orbit.radius+9<120);symmetric(e);
 e.start(false,'classic');assert.equal(e.orbit,null);assert.equal(e.whiteBalls.length,1);assert.equal(e.pickups.length,3);
});

test('twin white destroys all real obstacle shapes before splitting; black contact ends without destroying',()=>{
 for(const type of ['normal','fast','split','child','large']){
  const white=game('twin');white.hazards=[obstacle(type,white.whiteBall)];white.step(C.step);assert.equal(white.state,'running',type);assert.equal(white.hazards.length,0,type);assert.equal(white.events.filter(x=>x.kind==='destroy').length,1,type);assert.equal(white.events.filter(x=>x.kind==='split').length,0);
  const black=game('twin');black.hazards=[obstacle(type,black.player)];black.step(C.step);assert.equal(black.state,'ended',type);assert.ok(black.hazards.length>0,type);assert.equal(black.events.filter(x=>x.kind==='destroy').length,0,type);
 }
});

test('twin collision follows the swept arc and does not treat its interior chord as movement',()=>{
 const e=game('twin'),o=e.orbit,start=o.angle;o.speed=504;o.advance(.5);const mid=(start+o.angle)/2;
 const on={type:'normal',r:.2,x:o.x+Math.cos(mid)*o.radius,y:o.y+Math.sin(mid)*o.radius};assert.equal(o.hits(e.whiteBall,{...on,x:2*o.x-on.x,y:2*o.y-on.y},{playerInset:0,hazardInset:0}),true);
 const chord={type:'normal',r:.2,x:(e.player.x+e.player.px)/2,y:(e.player.y+e.player.py)/2};assert.equal(P.geometry.hits(e.player,chord,{playerInset:0,hazardInset:0}),true);assert.equal(o.hits(e.player,chord,{playerInset:0,hazardInset:0}),false);
});

test('trial starts with three separated safe random white balls and three normally styled coins',()=>{
 const e=game('trial');assert.equal(e.whiteBalls.length,3);assert.equal(e.whiteBall,e.whiteBalls[0]);assert.equal(e.pickups.length,3);assert.ok(e.pickups.every(x=>x.type==='coin'&&x.sides>=3&&x.color&&Number.isFinite(x.angle)));
 for(const [i,b]of e.whiteBalls.entries()){assert.ok(Math.hypot(b.x-e.player.x,b.y-e.player.y)>=150);close(Math.hypot(b.vx,b.vy),504);assert.ok(e.whiteBalls.slice(i+1).every(q=>Math.hypot(q.x-b.x,q.y-b.y)>42));}
});

test('trial adds exactly one ball at each 5s boundary, pause freezes it and restart returns to three',()=>{
 const e=game('trial');e.effects.invincible=1000;e.time=4.99;e.step(.009);assert.equal(e.whiteBalls.length,3);e.step(.001);assert.equal(e.whiteBalls.length,4);e.pause();e.step(60);assert.equal(e.whiteBalls.length,4);e.resume();e.time=9.99;e.step(.01);assert.equal(e.whiteBalls.length,5);e.time=14.99;e.step(.01);assert.equal(e.whiteBalls.length,6);e.start(false,'trial');assert.equal(e.whiteBalls.length,3);assert.equal(e.time,0);
});

test('trial generates/collects coins and their assist, blocks ordinary obstacles and abilities',()=>{
 const e=game('trial');e.effects.invincible=100;e.coinClock=e.powerClock=e.hazardClock=0;for(const t of ['invincible','freeze','magnet','pulse','nova'])e.spawnPickup(t);e.spawnHazard();e.step(C.step);assert.equal(e.hazards.length,0);assert.ok(e.pickups.length>=3&&e.pickups.every(x=>x.type==='coin'));
 e.collect({type:'coin',x:0,y:0});assert.equal(e.coins,1);const p=e.player,item={type:'coin',x:p.x+25,y:p.y,r:8,sides:4,angle:0,life:9,color:'#ff0000'};e.pickups=[item];e.step(C.step);assert.ok(item.x<p.x+25);
 e.effects.invincible=0;e.collect({type:'invincible'});assert.equal(e.effects.invincible,0);
});

test('every trial white ball can kill by swept contact, independently of the legacy first-ball alias',()=>{
 for(let index=0;index<3;index++){
  const e=game('trial');for(const b of e.whiteBalls)Object.assign(b,{x:20,y:20,vx:0,vy:0});Object.assign(e.whiteBalls[index],{x:e.player.x-50,y:e.player.y,vx:12000});e.step(C.step);assert.equal(e.state,'ended');assert.equal(e.whiteBalls.length,3);assert.equal(e.result.gameMode,'trial');assert.equal('grass'in e.result,false);
 }
});

test('new modes pay twin time/2 or trial coins+time/3 once and store independent survival records',()=>{
 const disk={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}},s=new P.Store(disk);s.data.best=99;s.data.grassBest={classic:50};s.data.owned.player.push('iris');s.data.equipped.player='iris';
 const a={id:'twin-a',gameMode:'twin',coins:0,time:13.9};assert.equal(s.settle(a).reward,6);assert.equal(s.settle(a),null);
 const b={id:'trial-a',gameMode:'trial',coins:7,time:13.9};assert.equal(s.settle(b).reward,11);assert.equal(s.data.wallet,17);assert.equal(s.data.survivalBest.twin,13.9);assert.equal(s.data.survivalBest.trial,13.9);assert.equal(s.data.best,99);assert.equal(s.data.grassBest.classic,50);
 const loaded=new P.Store(disk);assert.equal(loaded.data.equipped.player,'iris');assert.equal(loaded.settle(b),null);assert.equal(loaded.settle({id:'trial-short',gameMode:'trial',coins:0,time:5}).record,false);assert.equal(loaded.data.survivalBest.trial,13.9);
});

test('fixed-step rounding cannot lose a reward at the exact 2s or 3s threshold',()=>{
 const disk={getItem(){return null;},setItem(){}},s=new P.Store(disk);
 for(const [mode,period]of [['twin',2],['trial',3]]){
  assert.equal(s.settle({id:mode+'-before',gameMode:mode,coins:0,time:period-.000001}).reward,0);
  assert.equal(s.settle({id:mode+'-exact',gameMode:mode,coins:0,time:period-1e-12}).reward,1);
  assert.equal(s.settle({id:mode+'-double',gameMode:mode,coins:0,time:2*period-1e-12}).reward,2);
 }
});
