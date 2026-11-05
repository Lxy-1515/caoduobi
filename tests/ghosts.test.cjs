const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = vm.createContext({ console, Math });
for (const name of ['content','geometry','render']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8'), context);
const P = context.PixelDodge;
function renderer() { const r=Object.create(P.Renderer.prototype);r.reset();r.clock=0;return r; }
const ghost=(x,y=100,type='normal',extra={})=>({x,y,type,r:20,angle:0,spin:1,age:0,color:'#2789ef',...extra});
const engine=(x=600,y=600)=>({state:'running',effects:{freeze:0},hazards:[],player:{x,y,px:x,py:y,r:9}});
const inkPatch=(left,top,width,height)=>({left,top,width,height,step:1,alpha:new Uint8Array(width*height).fill(1)});

test('home spatial pruning matches exact retained geometry while reducing distant pair checks',()=>{
  const r=renderer(),items=[];for(let y=0;y<18;y++)for(let x=0;x<28;x++)items.push(ghost(x*42+40,y*42+40,['normal','fast','split'][items.length%3],{r:14,angle:items.length*.17}));
  items.push(...items.slice(0,20).map(g=>({...g,x:g.x+3,angle:g.angle+.4})));
  const original=P.geometry.overlapDepth;let calls=0;P.geometry.overlapDepth=(...args)=>{calls++;return original(...args);};
  try{const plain=r.pruneGhosts(items),plainCalls=calls;calls=0;const spatial=r.pruneGhosts(items,true),spatialCalls=calls;assert.deepEqual(spatial,plain);assert.ok(spatialCalls<plainCalls/10,JSON.stringify({plainCalls,spatialCalls}));}
  finally{P.geometry.overlapDepth=original;}
});
test('home text rejects whole distance samples without backfilling or affecting gameplay',()=>{
  const r=renderer(),e=engine(),h=ghost(292,100,'fast',{px:100,py:100,spawn:0,spin:0});
  r.titleMaskEnabled=true;r.textPatches=[inkPatch(174,90,36,20)];e.hazards=[h];
  r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.deepEqual(Array.from(r.obstacleGhosts,g=>g.x),[292]);assert.equal(r.ghostShards.length,0);
  h.x=388;r.updateGhosts(e,P.skins.hazard[0],.01);assert.deepEqual(Array.from(r.obstacleGhosts,g=>g.x),[292,388]);
  r.titleMaskEnabled=false;r.obstacleGhosts=[ghost(196)];e.hazards=[];r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
});
test('black and white ball trails keep all samples across menu and caption ink',()=>{
  const r=renderer(),points=[];r.titleMaskEnabled=true;r.textPatches=[inkPatch(180,90,30,20)];
  for(const x of [100,150,196,250,280])r.history(points,{x,y:100},.01,.5);
  assert.deepEqual(Array.from(points,p=>p.x),[100,150,196,250,280]);assert.ok(points.every(p=>!p.breakBefore));
  const fast=[];r.history(fast,{x:100,y:100},.01,.5);r.history(fast,{x:280,y:100},.01,.5);assert.equal(fast.length,2);assert.ok(fast.every(p=>!p.breakBefore));
  r.titleMaskEnabled=false;r.history(points,{x:196,y:100},.01,.5);assert.equal(points.at(-1).x,196);
});
test('text protection tests glyph ink and ghost outlines, not text boxes or hollow interiors',()=>{
  const r=renderer();r.titleMaskEnabled=true;
  const patch=inkPatch(80,80,40,40);patch.alpha.fill(0);patch.alpha[20*40+20]=1;r.textPatches=[patch];
  assert.equal(r.textBlocks(ghost(100.5,100.5)),false,'text inside a hollow circle does not touch its outline');
  assert.equal(r.textBlocks(ghost(119,100.5)),true,'outline touches the actual ink');
  assert.equal(r.textBlocks(ghost(100.5,130)),false,'no extra ten-pixel padding');
  assert.equal(r.textCrosses({x:81,y:81},{x:119,y:81},0),false,'empty part of text bounds remains available');
  assert.equal(r.textCrosses({x:81,y:100.5},{x:119,y:100.5},0),true);
  for(const type of ['fast','split','child']){
    assert.equal(r.textBlocks(ghost(100.5,100.5,type)),false,'polygon hollow interior remains available');
    assert.equal(r.textBlocks(ghost(100.5,118,type)),true,'polygon outline touches ink');
  }
});
test('uncollected power discs reject copies only beyond their outline width',()=>{
  for(const type of ['invincible','magnet','freeze','pulse','nova']) {
    for(const ghostType of ['normal','fast','child']) {
      const radius=type==='coin'?7.08:18.65,stroke=ghostType==='child'?2.4:3;
      // Child's right-facing tip provides an exact circle-to-vertex boundary.
      const angle=ghostType==='child'?Math.PI/2:0;
      for(const extra of [0,.01]) {
        const r=renderer(),e=engine();e.pickups=[{type,x:196+20+radius-stroke-extra,y:100,life:10}];
        e.hazards=[ghost(196,100,ghostType,{px:100,py:100,spawn:0,spin:0,angle})];
        r.updateGhosts(e,P.skins.hazard[0],.01);
        assert.equal(r.obstacleGhosts.length,extra?0:1,`${type}/${ghostType}: depth ${stroke+extra}`);
      }
    }
  }
});
test('blocked distance samples are skipped, not deferred; collected pickups stop blocking',()=>{
  const r=renderer(),e=engine(),h=ghost(292,100,'normal',{px:100,py:100,spawn:0,spin:0});
  e.hazards=[h];e.pickups=[{type:'coin',x:196,y:100,life:10}];
  r.updateGhosts(e,P.skins.hazard[0],.01);assert.deepEqual(Array.from(r.obstacleGhosts,g=>g.x),[292]);
  e.pickups[0].life=0;h.x=388;r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.deepEqual(Array.from(r.obstacleGhosts,g=>g.x),[292,388]);
  r.obstacleGhosts=[ghost(196)];r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
});
test('pickup blocking follows rotated geometry and removes existing overlapping copies',()=>{
  const r=renderer(),e=engine();e.pickups=[{type:'coin',x:127,y:100,life:10}];
  r.obstacleGhosts=[ghost(100,100,'fast',{spin:Math.PI/4})];
  r.updateGhosts(e,P.skins.hazard[0],.001);assert.equal(r.obstacleGhosts.length,1);
  r.updateGhosts(e,P.skins.hazard[0],1);assert.equal(r.obstacleGhosts.length,0);
  e.pickups=[{type:'coin',x:117,y:87,life:10}];r.obstacleGhosts=[ghost(100,100,'split',{spin:0})];
  r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
});
test('overlap of exactly stroke width survives; deeper overlap deletes the older copy',()=>{
  const r=renderer(),old=ghost(100),touch=ghost(137),deep=ghost(136);
  assert.equal(r.pruneGhosts([old,touch]).length,2);
  const kept=r.pruneGhosts([old,deep]);assert.equal(kept.length,1);assert.equal(kept[0],deep);
  const inner=ghost(100,100,'normal',{r:8});assert.equal(r.pruneGhosts([old,inner])[0],inner);
});
test('overlap respects triangle empty corners and square rotation',()=>{
  const tri=ghost(100,100,'split'),small=ghost(117,87,'normal',{r:3});
  assert.equal(P.geometry.overlapDepth(tri,small),0);
  const square=ghost(100,100,'fast'),circle=ghost(127,100,'normal',{r:7});
  assert.equal(P.geometry.overlapDepth(square,circle),0);
  square.angle=Math.PI/4;assert.ok(P.geometry.overlapDepth(square,circle)>3);
});
test('rotation-triggered overlap keeps newer copy; position, size and color are preserved',()=>{
  const r=renderer(),e=engine(),old=ghost(100,100,'fast',{spin:Math.PI/4}),newer=ghost(127,100,'normal',{r:7,spin:0});
  r.obstacleGhosts=[old,newer];r.updateGhosts(e,P.skins.hazard[0],1);
  assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0],newer);
  assert.equal(newer.x,127);assert.equal(newer.y,100);assert.equal(newer.r,7);assert.equal(newer.color,'#2789ef');
});
test('player touch clears ghosts, including frozen ghosts and fast crossings, without ending game',()=>{
  for(const type of ['normal','fast','split','child']) {
    const r=renderer(),e=engine(200,100);e.effects.freeze=3;r.ghostPlayerPrevious={x:0,y:100};r.obstacleGhosts=[ghost(100,100,type)];
    r.updateGhosts(e,P.skins.hazard[0],.02);assert.equal(r.obstacleGhosts.length,0);assert.equal(e.state,'running');
  }
});
test('copies spawn every 96 units and expire after four seconds; pause preserves them',()=>{
  const r=renderer(),e=engine(),h=ghost(100);h.spawn=0;h.colorIndex=1;e.hazards=[h];
  r.updateGhosts(e,P.skins.hazard[0],.01);h.x=195;r.clock=10;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0);
  h.x=196;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
  e.hazards=[];const copy=r.obstacleGhosts[0];e.state='paused';r.updateGhosts(e,P.skins.hazard[0],0);assert.equal(copy.age,0);
  e.state='running';r.updateGhosts(e,P.skins.hazard[0],3.99);assert.equal(r.obstacleGhosts.length,1);
  r.updateGhosts(e,P.skins.hazard[0],.02);assert.equal(r.obstacleGhosts.length,0);
});
test('distance sampling fills large steps and preserves remainder independently of speed and frame size',()=>{
  function sample(moves,dt) {
    const r=renderer(),e=engine(),h=ghost(100,100,'fast',{r:10,spawn:0,spin:2});e.hazards=[h];
    r.updateGhosts(e,P.skins.hazard[0],.01);
    for(const distance of moves){h.x+=distance;h.angle+=2*dt;r.updateGhosts(e,P.skins.hazard[0],dt);}
    return r.obstacleGhosts;
  }
  for(const [moves,dt] of [[[310,74],.01],[[48,48,48,48,48,48,48,48],.1]]) {
    const copies=sample(moves,dt);
    assert.deepEqual(Array.from(copies,g=>g.x),[196,292,388,484]);
    assert.ok(copies.every(g=>g.y===100 && g.r===10 && g.spin===2));
    assert.ok(copies.every(g=>Math.abs(g.angle-2*dt*moves.length)<1e-8));
  }
});
test('stationary, frozen and waiting obstacles emit nothing; thaw retains distance remainder',()=>{
  const r=renderer(),e=engine(),h=ghost(100,100,'normal',{spawn:0});e.hazards=[h];
  r.updateGhosts(e,P.skins.hazard[0],.01);h.x+=48;r.updateGhosts(e,P.skins.hazard[0],.01);
  r.clock=10;r.updateGhosts(e,P.skins.hazard[0],1);assert.equal(r.obstacleGhosts.length,0);
  e.effects.freeze=3;r.updateGhosts(e,P.skins.hazard[0],1);assert.equal(r.obstacleGhosts.length,0);
  e.effects.freeze=0;h.x+=48;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
  for(const type of ['large','normal']) {
    const rr=renderer(),ee=engine(),hh=ghost(100,100,type,{spawn:type==='normal'?1:0});ee.hazards=[hh];
    rr.updateGhosts(ee,P.skins.hazard[0],.01);hh.x+=200;rr.updateGhosts(ee,P.skins.hazard[0],1);
    assert.equal(rr.obstacleGhosts.length,0);
  }
});
test('distance accumulates along diagonal segments and split children start independent trails',()=>{
  const r=renderer(),e=engine(),h=ghost(100,100,'child',{r:12,spawn:0});e.hazards=[h];
  r.updateGhosts(e,P.skins.hazard[0],.01);
  h.x+=28.8;h.y+=38.4;r.updateGhosts(e,P.skins.hazard[0],.01);
  h.x+=28.8;h.y+=38.4;r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,1);assert.ok(Math.abs(r.obstacleGhosts[0].x-157.6)<1e-8);
  assert.ok(Math.abs(r.obstacleGhosts[0].y-176.8)<1e-8);
  const child=ghost(300,100,'child',{r:12,spawn:0});e.hazards=[child];r.updateGhosts(e,P.skins.hazard[0],.01);
  child.x+=95;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);
  child.x++;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,2);
});
test('global clear preserves player and white trails even while frozen',()=>{
  const r=renderer(),e=engine();r.obstacleGhosts=[ghost(100),ghost(200)];r.trail=[{x:5,y:5,age:0}];r.whiteTrail=[{x:10,y:10,age:0}];
  e.ghostClearVersion=1;e.ghostClearRequests=[{version:1,x:600,y:600,radius:Infinity}];e.effects.freeze=3;r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,0);assert.equal(r.trail.length,1);assert.equal(r.whiteTrail.length,1);
});
test('freeze clears copies only when its visible expanding wave reaches them',()=>{
  const r=renderer(),e=engine(600,600);e.time=0;e.effects.freeze=3;e.ghostClearVersion=1;
  e.ghostClearRequests=[{version:1,type:'freeze',x:100,y:100,radius:Infinity,startedAt:0}];
  r.obstacleGhosts=[ghost(150),ghost(400)];r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,2);assert.equal(r.freezeWaves[0].radius,0);
  e.time=.03;r.updateGhosts(e,P.skins.hazard[0],.03);
  assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0].x,400);assert.ok(Math.abs(r.freezeWaves[0].radius-48)<1e-8);
  e.state='paused';r.updateGhosts(e,P.skins.hazard[0],0);assert.ok(Math.abs(r.freezeWaves[0].radius-48)<1e-8);assert.equal(r.obstacleGhosts.length,1);
  e.state='running';e.time=.2;r.updateGhosts(e,P.skins.hazard[0],.17);assert.equal(r.obstacleGhosts.length,0);assert.equal(r.freezeWaves[0].radius,320);
});
test('shield clears copies at its current radius without clearing distant copies',()=>{
  const r=renderer(),e=engine(360,360);e.effects.invincible=3;e.shieldRadius=40;
  r.obstacleGhosts=[ghost(410,360),ghost(450,360)];r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0].x,450);
});
test('pickup events create no floating labels for any pickup type',()=>{
  const r=renderer();for(const type of Object.keys(P.items))r.event({kind:'collect',type,x:100,y:100,px:100,py:100});
  assert.equal('labels' in r,false);assert.equal(r.rings.length,0,'clear waves now use engine geometry');
});
test('magnet continuously clears ghosts entering its range, including edge contact',()=>{
  const r=renderer(),e=engine(360,360);e.effects.magnet=7;e.effects.freeze=3;e.magnetRadius=180;
  r.obstacleGhosts=[ghost(550,360),ghost(600,360)];r.updateGhosts(e,P.skins.hazard[0],.01);
  assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0].x,600);
  e.player.x=430;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0);
});
test('pulse only clears its own radius and invincibility only clears touching copies',()=>{
  for(const radius of [P.config.pulseRange,P.config.radius]){
    const r=renderer(),e=engine(360,360),near=ghost(360+radius+10,360),far=ghost(360+radius+30,360);
    e.ghostClearVersion=1;e.ghostClearRequests=[{version:1,x:360,y:360,radius}];r.obstacleGhosts=[near,far];
    r.updateGhosts(e,P.skins.hazard[0],.01);
    assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0],far);
  }
});

test('all visible removals shatter but only body and item clears sound',()=>{
  for(const reason of ['expiry','overlap','pickup','text','capacity','nova','pulse','freeze']){
    const r=renderer(),e=engine(),g=ghost(100,100,'normal',{spin:0});r.obstacleGhosts=[g];
    if(reason==='expiry')g.age=3.99;
    if(reason==='overlap')r.obstacleGhosts.push(ghost(110,100,'normal',{spin:0}));
    if(reason==='pickup')e.pickups=[{type:'coin',x:100,y:100,life:10}];
    if(reason==='text'){r.titleMaskEnabled=true;r.textPatches=[inkPatch(118,99,2,2)];}
    if(reason==='capacity')for(let i=0;i<700;i++)r.obstacleGhosts.push(ghost(1000+i*50,100,'normal',{spin:0}));
    if(['nova','pulse','freeze'].includes(reason)){e.time=.1;e.ghostClearVersion=1;e.ghostClearRequests=[{version:1,type:reason,x:100,y:100,radius:reason==='pulse'?287:Infinity,startedAt:0}];}
    if(reason==='nova'||reason==='pulse')e.clearWaves=[{type:reason,x:100,y:100,radius:160}];
    r.updateGhosts(e,P.skins.hazard[0],.02);
    assert.equal(r.obstacleGhosts.includes(g),false,reason);assert.equal(r.ghostShards.length,4,reason);assert.equal(r.ghostTouchCount,['nova','pulse','freeze'].includes(reason)?1:0,reason);
  }
});

test('body sweep and following shield or magnet removals produce one contact signal per visible copy',()=>{
  for(const type of ['body','invincible','magnet','shield-pickup']){
    const r=renderer(),e=engine(100,100);r.obstacleGhosts=[ghost(type==='magnet'?260:150,100,'normal',{spin:0})];
    if(type==='body'){e.player.x=200;r.ghostPlayerPrevious={x:0,y:100};}
    if(type==='invincible'){e.effects.invincible=3;e.shieldRadius=40;}
    if(type==='magnet'){e.effects.magnet=7;e.magnetRadius=180;}
    if(type==='shield-pickup'){r.obstacleGhosts[0].x=110;e.ghostClearVersion=1;e.ghostClearRequests=[{version:1,type:'invincible',x:100,y:100,radius:9}];}
    r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0,type);assert.equal(r.ghostShards.length,4,type);assert.equal(r.ghostTouchCount,1,type);
    e.state='paused';const before=JSON.stringify(r.ghostShards);r.updateGhosts(e,P.skins.hazard[0],0);assert.equal(r.ghostTouchCount,0);assert.equal(JSON.stringify(r.ghostShards),before);
    e.state='running';r.updateGhosts(e,P.skins.hazard[0],.4);assert.equal(r.ghostShards.length,0);
  }
});

test('new valid samples inside a magnet shatter and count once; spacing continues outside range',()=>{
  for(const mode of ['classic','monochrome']){
    const r=renderer(),e=engine(360,360);e.gameMode=mode;e.effects.magnet=7;e.magnetRadius=180;
    let cleared=0;e.recordGhostClear=()=>cleared++;
    const h=ghost(424,360,'fast',{spawn:0,spin:0});e.hazards=[h];r.updateGhosts(e,P.skins.hazard[0],.01);
    h.x=520;r.updateGhosts(e,P.skins.hazard[0],.01);
    assert.equal(r.obstacleGhosts.length,0);assert.equal(r.ghostShards.length,4);assert.equal(r.ghostTouchCount,1);assert.equal(cleared,1);
    r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.ghostTouchCount,0);assert.equal(cleared,1);
    h.x=616;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);assert.equal(r.obstacleGhosts[0].x,616);assert.equal(r.ghostTouchCount,0);
  }
});

test('multiple new magnet samples clear individually; rejected or out-of-range samples stay silent',()=>{
  const r=renderer(),e=engine(360,360);e.effects.magnet=7;e.magnetRadius=180;let cleared=0;e.recordGhostClear=()=>cleared++;
  const h=ghost(100,360,'normal',{spawn:0,spin:0});e.hazards=[h];r.updateGhosts(e,P.skins.hazard[0],.01);
  h.x=484;r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0);assert.equal(r.ghostTouchCount,4);assert.equal(r.ghostShards.length,16);assert.equal(cleared,4);
  for(const x of [560,560.01]){
    const rr=renderer(),ee=engine(360,360);ee.effects.magnet=7;ee.magnetRadius=180;ee.hazards=[ghost(x,360,'normal',{px:x-96,spawn:0,spin:0})];
    rr.updateGhosts(ee,P.skins.hazard[0],.01);assert.equal(rr.ghostTouchCount,x===560?1:0);assert.equal(rr.obstacleGhosts.length,x===560?0:1);
  }
  const rr=renderer(),ee=engine(360,360);ee.effects.magnet=7;ee.magnetRadius=180;
  ee.hazards=[ghost(520,360,'normal',{px:424,spawn:0,spin:0})];ee.pickups=[{type:'coin',x:520,y:360,life:10}];
  rr.updateGhosts(ee,P.skins.hazard[0],.01);assert.equal(rr.obstacleGhosts.length,0);assert.equal(rr.ghostShards.length,0);assert.equal(rr.ghostTouchCount,0);
});

test('hard magnet retains new trails and paused/frozen obstacles do not fabricate shatters',()=>{
  const r=renderer(),e=engine(360,360);e.gameMode='hard';e.effects.magnet=7;e.magnetRadius=180;e.hazards=[ghost(520,360,'normal',{px:424,spawn:0,spin:0})];
  r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,1);assert.equal(r.ghostShards.length,0);assert.equal(r.ghostTouchCount,0);
  for(const paused of [false,true]){
    const rr=renderer(),ee=engine(360,360);ee.effects.magnet=7;ee.magnetRadius=180;ee.hazards=[ghost(520,360,'normal',{px:424,spawn:0,spin:0})];
    if(paused)ee.state='paused';else ee.effects.freeze=3;
    rr.updateGhosts(ee,P.skins.hazard[0],paused?0:.01);assert.equal(rr.ghostShards.length,0);assert.equal(rr.ghostTouchCount,0);
  }
});

test('rejected samples never flash or sound, reduced motion keeps a brief bounded shatter',()=>{
  const r=renderer(),e=engine();e.pickups=[{type:'coin',x:196,y:100,life:10}];e.hazards=[ghost(196,100,'normal',{px:100,py:100,spawn:0})];
  r.updateGhosts(e,P.skins.hazard[0],.01);assert.equal(r.obstacleGhosts.length,0);assert.equal(r.ghostShards.length,0);assert.equal(r.ghostTouchCount,0);
  r.reduced=true;e.hazards=[];e.pickups=[];r.obstacleGhosts=[ghost(300,100,'normal',{age:3.99})];r.updateGhosts(e,P.skins.hazard[0],.02);
  assert.equal(r.ghostShards.length,2);assert.ok(r.ghostShards.every(s=>s.life===.18&&Math.hypot(s.vx,s.vy)<6.01));
});

test('removal uses bubble sample, merges dense triggers and respects switches',()=>{
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/audio.js'),'utf8'),context);
  const audio=new P.Audio({getItem:()=>null}),calls=[];audio.ctx={currentTime:1};audio.unlock=()=>{};audio.playSample=(...args)=>{calls.push(args);return {};};
  audio.effect('collect');assert.equal(calls[0][0],'collect');audio.effect('ghost');assert.equal(calls.length,2);assert.equal(calls[1][0],'ghost');
  audio.ctx.currentTime+=.02;audio.effect('ghost');assert.equal(calls.length,2);
  audio.ctx.currentTime+=.1;audio.effect('ghost');assert.equal(calls.length,3);
  audio.ctx.currentTime+=1;audio.settings.sound=false;audio.effect('ghost');assert.equal(calls.length,3);
  audio.settings.sound=true;audio.active=false;audio.effect('ghost');assert.equal(calls.length,3);
});
