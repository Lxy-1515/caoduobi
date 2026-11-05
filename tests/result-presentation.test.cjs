const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({PixelDodge:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/result-presentation.js'),'utf8'),c);
function fixture(reduced=false){const actions=[],dialog={open:false,showModal(){this.open=true;actions.push('open');},animate(frames,options){actions.push({frames,options});return{cancel(){}};}},total={textContent:'',animate(){return{cancel(){}};}},score={textContent:''},ticks=[],scoreTicks=[];const view=new c.PixelDodge.ResultPresentation({dialog,total,score,reduced,onTick:()=>ticks.push(+total.textContent),onScoreTick:()=>scoreTicks.push(+score.textContent),onOpen:()=>actions.push('ready')});return{view,dialog,total,score,ticks,scoreTicks,actions};}
test('end stays visible for half second, then panel enters from below with score still zero',()=>{
 const f=fixture();f.view.begin(8);assert.equal(f.total.textContent,'0');f.view.update(.49);assert.equal(f.dialog.open,false);f.view.update(.011);assert.equal(f.dialog.open,true);assert.equal(f.total.textContent,'0');assert.match(f.actions[2].frames[0].transform,/50vh/);f.view.update(.35);assert.equal(f.ticks.length,0);f.view.update(.011);f.view.update(.016);assert.equal(f.total.textContent,'1');assert.deepEqual(f.ticks,[1]);
});
test('small values tick one by one, large values finish in bounded jumps, one cue per displayed change',()=>{
 for(const target of [0,1,5,8,9,15,17,10000,1000000000]){const f=fixture(true);f.view.begin(target);f.view.update(.5);for(let i=0;i<100;i++)f.view.update(.02);assert.equal(+f.total.textContent,target);assert.equal(f.ticks.length,Math.min(target,30));assert.equal(new Set(f.ticks).size,f.ticks.length);assert.ok(f.ticks.every((v,i)=>v>0&&(!i||v>f.ticks[i-1])));if(target<=30)assert.deepEqual(f.ticks,Array.from({length:target},(_,i)=>i+1));}
});
test('inactive time cannot advance delay/count, cancel and restart cannot leak old audio or rewards',()=>{
 const f=fixture();f.view.begin(50);f.view.update(0);assert.equal(f.dialog.open,false);f.view.cancel();f.view.update(5);assert.equal(f.dialog.open,false);assert.equal(f.ticks.length,0);assert.equal(f.total.textContent,'50');f.view.begin(3);f.view.update(.5);f.view.update(.36);f.view.update(.016);assert.equal(f.total.textContent,'1');f.view.cancel();const ticks=f.ticks.length;f.view.update(10);assert.equal(f.ticks.length,ticks);assert.equal(f.total.textContent,'3');
});

test('grass caps at 42 evenly spaced jumps and the first point starts on its final frame',()=>{
 const f=fixture(true);f.view.begin(7,73);assert.equal(f.score.textContent,'0');assert.equal(f.total.textContent,'0');f.view.update(.5);
 let duration=0;while(f.view.phase==='grass'&&duration<3){duration+=.01;f.view.update(.01);if(f.view.phase==='grass')assert.equal(f.ticks.length,0);}
 assert.deepEqual(f.scoreTicks,Array.from({length:42},(_,i)=>Math.round(73*(i+1)/42)));assert.ok(duration<=3);assert.equal(f.view.phase,'count');assert.deepEqual(f.ticks,[1]);
});

test('zero grass moves directly to points, race skips grass, slow frames never burst catch-up audio',()=>{
 const zero=fixture(true);zero.view.begin(1,0);zero.view.update(.5);zero.view.update(.02);assert.equal(zero.view.phase,'idle');assert.equal(zero.scoreTicks.length,0);assert.deepEqual(zero.ticks,[1]);
 const race=fixture(true);race.score.textContent='4';race.view.begin(5);race.view.update(.5);race.view.update(.016);assert.equal(race.score.textContent,'4');assert.equal(race.scoreTicks.length,0);assert.deepEqual(race.ticks,[1]);
 const slow=fixture(true);slow.view.begin(1,999);slow.view.update(.5);slow.view.update(.5);assert.equal(slow.scoreTicks.length,1);assert.ok(slow.scoreTicks[0]>1);slow.view.update(2.45);assert.equal(slow.scoreTicks.length,2);assert.equal(slow.score.textContent,'999');slow.view.cancel();const cues=slow.scoreTicks.length;slow.view.update(9);assert.equal(slow.scoreTicks.length,cues);slow.view.begin(1,2);assert.equal(slow.score.textContent,'0');slow.view.update(.5);slow.view.update(0);assert.equal(slow.scoreTicks.length,cues);
});

test('small grass stays +1, large counters finish inside 3/2 seconds with sample-sized cadence',()=>{
 for(const target of [1,5,30,42,43,999,1000000000]){
  const f=fixture(true);let time=0;const grassTimes=[],coinTimes=[];f.view.onScoreTick=()=>{f.scoreTicks.push(+f.score.textContent);grassTimes.push(time);};f.view.onTick=()=>{f.ticks.push(+f.total.textContent);coinTimes.push(time);};f.view.begin(target,target);f.view.update(.5);
  for(let i=0;i<700&&f.view.phase!=='idle';i++){time+=.01;f.view.update(.01);}
  assert.equal(+f.score.textContent,target);assert.equal(+f.total.textContent,target);assert.equal(f.scoreTicks.length,Math.min(target,42));assert.equal(f.ticks.length,Math.min(target,30));assert.ok(grassTimes.at(-1)<=3+1e-8);assert.ok(coinTimes.at(-1)-coinTimes[0]<2);assert.equal(coinTimes[0],grassTimes.at(-1));
  for(let i=1;i<grassTimes.length;i++)assert.ok(grassTimes[i]-grassTimes[i-1]>=.059);for(let i=1;i<coinTimes.length;i++)assert.ok(coinTimes[i]-coinTimes[i-1]>=.059);
  if(target<=42)assert.deepEqual(f.scoreTicks,Array.from({length:target},(_,i)=>i+1));
  if(target===1){assert.ok(grassTimes.at(-1)<.04);assert.equal(coinTimes.at(-1)-coinTimes[0],0);}
  if(target===5){assert.ok(grassTimes.at(-1)<.45);assert.ok(coinTimes.at(-1)-coinTimes[0]<1.05);}
 }
});
