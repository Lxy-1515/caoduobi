const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Date,Math});for(const f of ['content','geometry','engine','store'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f+'.js'),'utf8'),context);
const P=context.PixelDodge,C=P.config;
function rng(seed=12345){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function fixture(width=720,random=rng()){const e=new P.Engine(random);e.resize(width,720);e.start(false,'race');Object.assign(e.whiteBall,{x:20,y:20,vx:0,vy:0});return e;}
function place(e,x,y){Object.assign(e.player,{x,y,vx:0,vy:0,steering:false});}
function collect(e,p){place(e,p.x,p.y);e.step(C.step);}
function clearRound(e){for(const p of e.pickups.slice())collect(e,p);}
function separated(e){
 assert.equal(e.pickups.length,e.raceRemaining);
 for(let i=0;i<e.pickups.length;i++){
  const a=e.pickups[i];assert.equal(a.type,'raceOrb');assert.equal(a.life,Infinity);assert.ok(a.r>=90&&a.r<=120);
  assert.ok(a.x>=a.r&&a.x<=e.width-a.r&&a.y>=a.r&&a.y<=e.height-a.r);
  for(const b of e.pickups.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r,'overlap');
 }
}
test('large-circle batches 3/6/9/12/15; only complete rounds advance and pay',()=>{
 const e=fixture(16000);assert.equal(e.raceRound,1);assert.equal(e.completedRounds,0);
 for(let round=1;round<=5;round++){
  const size=round*3;assert.equal(e.pickups.length,size);assert.equal(e.raceBatch,size);separated(e);
  for(const p of e.pickups.slice(0,-1))collect(e,p);
  assert.equal(e.pickups.length,1);assert.equal(e.raceRound,round);assert.equal(e.coins,(round-1)*3);
  collect(e,e.pickups[0]);assert.equal(e.raceRound,round+1);assert.equal(e.completedRounds,round);assert.equal(e.coins,round*3);assert.equal(e.pickups.length,size+3);
  assert.equal(e.state,'running');assert.equal(e.hazards.length,0);
 }
 e.spawnHazard();e.spawnPickup('freeze');e.spawnPickup('coin');assert.equal(e.hazards.length,0);assert.equal(e.pickups.length,18);
 place(e,9,700);for(let i=0;i<1200;i++)e.step(C.step);
 assert.equal(e.pickups.length,18);separated(e);
});
test('original-size random circles do not overlap; capacity stays capped even with constant RNG',()=>{
 for(const random of [rng(8),rng(67),rng(500),()=>0,()=>.5,()=>.99999]){
  const e=fixture(720,random);assert.equal(e.pickups.length,3);separated(e);let iterations=0;
  while(!e.raceBatchCapped&&iterations++<8){clearRound(e);separated(e);}
  assert.equal(e.raceBatchCapped,true);const capped=e.raceBatch;assert.ok(capped>=3&&capped%3===0);
  for(let i=0;i<3;i++){clearRound(e);assert.equal(e.raceBatch,capped);assert.equal(e.pickups.length,capped);separated(e);}
 }
 assert.notDeepEqual(fixture(720,rng(1)).pickups.map(p=>[p.x,p.y]),fixture(720,rng(2)).pickups.map(p=>[p.x,p.y]));
});
test('pickup uses full drawn radius and sweep; circle contact is harmless and gives no per-circle reward',()=>{
 const e=fixture();e.pickups=[{type:'raceOrb',x:300,y:360,r:100,life:Infinity,colorIndex:0},{type:'raceOrb',x:600,y:600,r:90,life:Infinity}];e.raceRemaining=2;
 place(e,190,360);e.step(C.step);assert.equal(e.pickups.length,2);assert.equal(e.coins,0);
 place(e,191,360);e.step(C.step);assert.equal(e.raceRemaining,1);assert.equal(e.raceRound,1);assert.equal(e.coins,0);assert.equal(e.state,'running');
 const f=fixture();f.pickups=[{type:'raceOrb',x:300,y:360,r:90,life:Infinity},{type:'raceOrb',x:600,y:600,r:90,life:Infinity}];f.raceRemaining=2;
 place(f,100,360);f.player.vx=2000;f.step(.15);assert.equal(f.raceRemaining,1);assert.equal(f.coins,0);assert.equal(f.state,'running');
});
test('resize reflows circles at original sizes without overlap or free completed-round rewards',()=>{
 const e=fixture(2600);clearRound(e);clearRound(e);clearRound(e);assert.equal(e.pickups.length,12);
 const round=e.raceRound,reward=e.coins;e.resize(720,720);separated(e);assert.ok(e.pickups.length>0);assert.equal(e.raceRound,round);assert.equal(e.coins,reward);
});
test('timer/pause and partial-round rewards; restart resets round and capacity cap',()=>{
 const e=fixture();clearRound(e);collect(e,e.pickups[0]);place(e,9,700);e.time=29.99;e.pause();e.step(10);assert.equal(e.time,29.99);e.resume();e.step(.005);assert.equal(e.state,'running');e.step(.02);
 assert.equal(e.time,30);assert.equal(e.remainingTime,0);assert.equal(e.result.reason,'timeout');assert.equal(e.result.coins,3);assert.equal(e.result.completedRounds,1);assert.equal(e.result.round,2);assert.equal('grass' in e.result,false);
 e.step(5);assert.equal(e.coins,3);e.recordGhostClear();assert.equal(e.grass,0);
 e.start(false,'race');assert.equal(e.raceRound,1);assert.equal(e.raceBatchCapped,false);assert.equal(e.pickups.length,3);assert.equal(e.coins,0);
 const exact=fixture();place(exact,9,700);for(let i=0;i<3600;i++)exact.step(C.step);assert.equal(exact.state,'ended');assert.equal(exact.time,30);assert.equal(exact.result.coins,0);
});
test('last pickup at deadline or lethal white contact completes a round once without spawning a new batch',()=>{
 for(const collision of [false,true]){
  const e=fixture();const last=e.pickups.at(-1);for(const p of e.pickups.slice(0,-1))collect(e,p);
  place(e,last.x,last.y);if(collision)Object.assign(e.whiteBall,{x:last.x,y:last.y,vx:0,vy:0});else e.time=30-C.step;
  e.step(C.step);assert.equal(e.result.completedRounds,1);assert.equal(e.result.coins,3);assert.equal(e.result.reason,collision?'collision':'timeout');assert.equal(e.raceBatch,3);
 }
});
test('race player and white ball both use 3x speed; race acceleration 2x; all other modes unchanged',()=>{
 for(const mode of ['classic','hard','monochrome','race']){
  const e=new P.Engine(rng());e.resize(10000,720);e.start(false,mode);const factor=mode==='race'?3:1;
  assert.ok(Math.abs(Math.hypot(e.whiteBall.vx,e.whiteBall.vy)-C.playerSpeed*factor)<1e-8);
  Object.assign(e.whiteBall,{x:20,y:20,vx:0,vy:0});e.pickups=[];e.hazardClock=e.powerClock=e.coinClock=1e6;
  e.target(9500,360);e.step(C.step);assert.ok(Math.abs(e.player.vx-C.playerAcceleration*C.step*(mode==='race'?2:1))<1e-8);
  for(let i=0;i<120;i++)e.step(C.step);assert.ok(Math.abs(Math.hypot(e.player.vx,e.player.vy)-C.playerSpeed*factor)<1e-8);
 }
});
test('white remains lethal; switching modes restores original coin/hazard rules',()=>{
 const e=fixture();Object.assign(e.whiteBall,{x:e.player.x,y:e.player.y,vx:10,vy:0});e.step(C.step);assert.equal(e.state,'ended');assert.equal(e.result.reason,'collision');
 e.start(false,'classic');assert.ok(e.pickups.every(p=>p.type==='coin'&&Number.isFinite(p.life)));assert.equal(e.raceBatch,0);e.spawnHazard();assert.equal(e.hazards.length,1);e.time=4;assert.equal(e.grass,2);
 e.start(true,'race');assert.equal(e.gameMode,'classic');assert.equal(e.pickups.length,0);
});
test('settlement pays completed rounds x3; preserves legacy raceBest/save data; prevents duplicate settlement',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>raw=v},s=new P.Store(storage);
 s.settle({id:'old',time:10,coins:2,grass:8,gameMode:'classic'});s.data.raceBest=45;
 const best=s.data.best,grass=JSON.stringify(s.data.grassBest),wallet=s.data.wallet;
 const result={id:'race',time:30,coins:999,completedRounds:3,round:4,gameMode:'race'},settled=s.settle(result);
 assert.equal(settled.bonus,0);assert.equal(settled.reward,9);assert.equal(settled.coins,9);assert.equal(settled.record,true);assert.equal(s.data.wallet,wallet+9);assert.equal(s.data.raceRoundBest,3);assert.equal(s.data.raceBest,45);assert.equal(s.data.best,best);assert.equal(JSON.stringify(s.data.grassBest),grass);assert.equal(s.settle(result),null);
 const restored=new P.Store(storage);assert.equal(restored.data.raceRoundBest,3);assert.equal(restored.data.raceBest,45);assert.equal(restored.settle({...result,id:'less',coins:0,completedRounds:1}).record,false);
 const zero=restored.settle({...result,id:'none',completedRounds:0});assert.equal(zero.reward,0);assert.equal(zero.record,false);assert.equal(restored.settle({...result,id:'missing',completedRounds:undefined}),null);
});

test('race records every removed circle including unfinished batches; resizing is not a collection',()=>{
 const e=fixture(16000);clearRound(e);collect(e,e.pickups[0]);collect(e,e.pickups[0]);
 assert.equal(e.raceCleared,5);assert.equal(e.completedRounds,1);assert.equal(e.coins,3);
 e.resize(720,720);assert.equal(e.raceCleared,5);e.finish('timeout');assert.equal(e.result.clearedOrbs,5);
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>raw=v},s=new P.Store(storage);s.data.raceRoundBest=7;s.data.raceBest=99;
 assert.equal(s.settle(e.result).reward,3);assert.equal(s.data.raceClearBest,5);assert.equal(s.data.raceRoundBest,7);assert.equal(s.data.raceBest,99);
 assert.equal(new P.Store(storage).data.raceClearBest,5);assert.equal(s.settle({...e.result,id:'more',clearedOrbs:6}).record,true);assert.equal(s.settle({...e.result,id:'less',clearedOrbs:4}).record,false);
 e.start(false,'race');assert.equal(e.raceCleared,0);
});
