const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const c=vm.createContext({Math,Date,console});for(const name of ['content','geometry','engine','render'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8'),c);const P=c.PixelDodge,G=P.geometry;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);
function game(mode='classic'){const e=new P.Engine();e.start(false,mode);e.hazards=[];e.pickups=[];e.events=[];e.hazardClock=e.coinClock=e.powerClock=e.extraFreezeClock=1e6;e.effects.invincible=1000;Object.assign(e.whiteBall,{x:20,y:20,vx:0,vy:0});Object.assign(e.player,{x:300,y:300,px:300,py:300,vx:0,vy:0,steering:false});return e;}
test('all score fragments spawn regular 3–6 shapes and stable random palette colors at existing size/lifetime',()=>{
 let seed=123;const e=new P.Engine(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;});e.start();e.pickups=[];for(let i=0;i<300;i++)e.spawnPickup('coin');
 assert.deepEqual([...new Set(e.pickups.map(p=>p.sides))].sort(),[3,4,5,6]);assert.equal(new Set(e.pickups.map(p=>p.color)).size,6);
 for(const p of e.pickups){assert.equal(p.r,8);assert.equal(p.life,9);assert.ok(P.coinStyle.colors.includes(p.color));const b=G.coinBody(p),v=G.polygon(b.type,b.r);close(b.r,7.08);assert.equal(v.length,p.sides);for(let i=0;i<v.length;i++){close(Math.hypot(v[i].x,v[i].y),7.08);close(Math.hypot(v[i].x-v[(i+1)%v.length].x,v[i].y-v[(i+1)%v.length].y),2*7.08*Math.sin(Math.PI/p.sides));}}
});
test('every opening and restart coin independently randomizes shape, color and angle in all coin modes',()=>{
 let seed=8765;const e=new P.Engine(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;});const looks=[],sides=new Set(),colors=new Set(),angles=new Set();
 for(const mode of ['classic','hard','monochrome'])for(let round=0;round<12;round++){
  e.start(false,mode);assert.equal(e.pickups.length,3);for(const coin of e.pickups){assert.ok([3,4,5,6].includes(coin.sides));assert.ok(P.coinStyle.colors.includes(coin.color));assert.ok(coin.angle>=0&&coin.angle<2*Math.PI);close(G.coinBody(coin).angle,coin.angle);sides.add(coin.sides);colors.add(coin.color);angles.add(coin.angle);looks.push([coin.sides,coin.color,coin.angle]);}
 }
 assert.equal(sides.size,4);assert.equal(colors.size,6);assert.equal(angles.size,108);assert.notDeepEqual(looks.slice(0,3),looks.slice(3,6));
 // Independent random draws may legitimately repeat; do not force a preset trio.
 const same=new P.Engine(()=>.25);same.start();for(const coin of same.pickups){assert.equal(coin.sides,4);assert.equal(coin.color,P.coinStyle.colors[1]);close(coin.angle,Math.PI/2);}
});
test('same fragment shape/color/angle survive simulation, magnet movement and resize without rerolling',()=>{
 const e=game();e.spawnPickup('coin');const p=e.pickups[0];Object.assign(p,{x:400,y:300});const look=JSON.stringify([p.sides,p.color,p.angle]);e.effects.magnet=7;e.magnetRadius=180;e.step(.01);assert.ok(p.x<400);e.resize(1440,720);assert.equal(JSON.stringify([p.sides,p.color,p.angle]),look);close(G.coinBody(p).r,7.08);
});

test('permanent invisible coin assist attracts only nearby fragments without granting a magnet effect',()=>{
 for(const mode of ['classic','hard','monochrome']){
  const e=game(mode);e.effects.invincible=0;
  const near={type:'coin',x:325,y:300,r:8,life:9,sides:5,angle:.3,color:'#2789ef'},far={...near,x:329},boundary={...near,x:328};
  const power={type:'freeze',x:325,y:300,r:13,life:10};e.pickups=[near,far,boundary,power];
  const look=JSON.stringify([near.sides,near.color,near.angle]);e.step(.01);
  close(near.x,321.2);assert.equal(far.x,329);assert.equal(boundary.x,328);assert.equal(power.x,325);assert.equal(e.coins,0);
  assert.equal(e.effects.magnet,0);assert.equal(e.magnetRadius,9);assert.equal(e.ghostClearVersion,0);assert.equal(JSON.stringify([near.sides,near.color,near.angle]),look);
  for(let i=0;i<8;i++)e.step(P.config.step);assert.equal(e.coins,1);assert.ok(!e.pickups.includes(near));assert.ok(e.pickups.includes(far));
  const r=Object.create(P.Renderer.prototype);r.reset();r.clock=0;
  r.obstacleGhosts=[{type:'normal',x:300,y:325,r:4,age:0,angle:0,spin:0,colorIndex:0}];r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,1,'hidden pickup range never clears trails');assert.equal(r.ghostTouchCount,0);assert.equal(e.clearedGhosts,0);
 }
});

test('coin assist pauses with simulation, coexists with timed magnet and leaves race orbs stationary',()=>{
 const e=game(),coin={type:'coin',x:325,y:300,r:8,life:9,sides:4,angle:0};e.pickups=[coin];
 e.pause();e.step(1);assert.equal(coin.x,325);e.resume();e.step(.01);assert.ok(coin.x<325);
 coin.x=400;e.effects.magnet=7;e.magnetRadius=180;e.step(.01);assert.ok(coin.x<400);
 e.effects.magnet=0;e.magnetRadius=9;coin.x=325;e.step(.01);assert.ok(coin.x<325,'assist continues after the timed effect ends');
 const race=game('race'),orb={type:'raceOrb',x:325,y:300,r:1,life:Infinity};race.pickups=[orb];race.step(.01);assert.equal(orb.x,325);assert.equal(orb.y,300);
});

test('a full-speed near miss pulls the fragment into the swept pickup exactly once',()=>{
 for(const mode of ['classic','hard','monochrome'])for(const sides of [3,4,5,6]){
  const e=game(mode);e.effects.invincible=0;Object.assign(e.player,{x:260,y:300,vx:P.config.playerSpeed,vy:0});
  e.pickups=[{type:'coin',x:300,y:320,r:8,life:9,sides,angle:.3,color:'#2789ef'}];
  // Twenty units off the movement line is beyond body+fragment reach.
  assert.equal(G.hits({x:360,y:300,px:260,py:300,r:9},G.coinBody(e.pickups[0]),{playerInset:0,hazardInset:0}),false);
  for(let i=0;i<24;i++)e.step(P.config.step);
  assert.equal(e.coins,1,mode+'/'+sides);assert.equal(e.pickups.length,0);assert.equal(e.events.filter(v=>v.type==='coin').length,1);
 }
});
test('collection uses filled polygon edges rather than the empty circumcircle corners',()=>{
 const b=G.coinBody({x:300,y:300,sides:3,angle:0});const p={r:1,x:306,y:295,px:306,py:295};assert.equal(G.sweptCircle(p,b,1+b.r),true);assert.equal(G.hits(p,b,{playerInset:0,hazardInset:0}),false);
 assert.equal(G.hits({...p,x:300,y:292,px:300,py:292},b,{playerInset:0,hazardInset:0}),true);
 for(const sides of [3,4,5,6]){const coin=G.coinBody({x:300,y:300,sides,angle:.7});assert.equal(G.hits({x:400,y:300,px:200,py:300,r:1},coin,{playerInset:0,hazardInset:0}),true);}
});
test('fast swept pickup awards exactly one point and retains selected feedback color in all coin modes',()=>{
 for(const mode of ['classic','hard','monochrome'])for(const sides of [3,4,5,6]){
  const e=game(mode);Object.assign(e.player,{x:260,y:300,vx:504,vy:0});e.pickups=[{type:'coin',x:300,y:300,r:8,life:9,sides,angle:.3,color:'#2789ef'}];e.step(.16);assert.equal(e.coins,1);assert.equal(e.pickups.length,0);const event=e.events.find(v=>v.type==='coin');assert.equal(event.color,'#2789ef');e.step(.01);assert.equal(e.coins,1);
 }
 const e=game('race');const count=e.pickups.length;e.spawnPickup('coin');assert.equal(e.pickups.length,count);assert.equal(e.gameMode,'race');
});
test('fragment polygon avoids a ghost only when the actual shape penetrates its outline',()=>{
 const r=Object.create(P.Renderer.prototype);r.reset();r.clock=0;
 const coin={type:'coin',x:120,y:100,r:8,life:9,sides:4,angle:Math.PI/4};
 const base={type:'normal',x:100,y:100,r:16,angle:0,spin:0,age:0,colorIndex:0};
 // Rotated square extent is 7.08/sqrt(2), so 20 units apart overlaps by ~1.
 assert.ok(G.overlapDepth(base,G.coinBody(coin))<3);
 const e={state:'running',effects:{freeze:0},hazards:[],pickups:[coin],player:{x:600,y:600,px:600,py:600,r:9}};r.obstacleGhosts=[{...base}];r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
 coin.x=117;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0);
});
