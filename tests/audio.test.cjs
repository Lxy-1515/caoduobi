const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Param {constructor(){this.value=0;}setValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}cancelScheduledValues(){}}
class Node {constructor(){this.gain=new Param();}connect(){}disconnect(){this.disconnected=true;}}
class Source extends Node {start(...args){this.startArgs=args;}stop(){this.stopped=true;this.onended?.();}}
class Context {
 constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.sources=[];this.decodeCalls=0;}
 createGain(){return new Node();}
 createDynamicsCompressor(){const n=new Node();for(const k of ['threshold','knee','ratio','attack','release'])n[k]=new Param();return n;}
 createBufferSource(){const n=new Source();this.sources.push(n);return n;}
 decodeAudioData(bytes){this.decodeCalls++;return Promise.resolve({duration:new Uint8Array(bytes)[0]===1?62:new Uint8Array(bytes)[0]===2?.24:.081});}
 resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}
}
function fixture(saved=null,Type=Context){
 const disk={value:saved},storage={getItem:()=>disk.value,setItem:(k,v)=>disk.value=v};
 const c=vm.createContext({window:{AudioContext:Type},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,console});
 c.PixelDodge={audioAssets:{music:'AQ==',collect:'Ag==',ghost:'Aw==',end:'BQ==',click:'BA=='}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/audio.js'),'utf8'),c);
 return {a:new c.PixelDodge.Audio(storage),disk,P:c.PixelDodge};
}
test('music decodes once, loops with a single source, pauses without losing position, toggles preserve playhead',async()=>{
 const {a}=fixture();assert.equal(a.ctx,undefined);a.unlock();await a.ready;assert.equal(a.ctx.decodeCalls,4);
 const initial=a.musicSource;assert.equal(initial.loop,true);assert.equal(initial.loopEnd,62);
 for(let i=0;i<50;i++){a.tick();a.unlock();}assert.equal(a.musicSource,initial);assert.equal(a.ctx.decodeCalls,4);
 a.ctx.currentTime=12.5;a.setActive(false);assert.equal(a.ctx.state,'suspended');assert.equal(a.musicPosition,12.5);assert.equal(a.musicSource,null);
 a.tick();assert.equal(a.musicSource,null);a.setActive(true);await Promise.resolve();assert.notEqual(a.musicSource,initial);
 a.toggle('music');assert.equal(a.musicSource,null);assert.equal(a.musicOffset,12.5);assert.equal(initial.stopped,true);
 a.ctx.currentTime=17;a.toggle('music');assert.notEqual(a.musicSource,initial);assert.equal(a.musicSource.startArgs[1],12.5);
});
test('saved mute persists and delayed decoding cannot start music after mute or deactivation',async()=>{
 const {a,disk}=fixture('{"music":false,"sound":false}');a.unlock();await a.ready;assert.equal(a.musicSource,null);assert.equal(a.playSample('ghost',1),null);
 a.toggle('music');assert.equal(a.musicSource.loop,true);assert.equal(JSON.parse(disk.value).sound,false);
 const pending=[];class Slow extends Context {decodeAudioData(b){return new Promise(resolve=>pending.push(()=>resolve({duration:62})));}}
 const {a:b}=fixture(null,Slow);b.unlock();b.settings.music=false;b.setActive(false);for(const resolve of pending)resolve();await b.ready;assert.equal(b.musicSource,null);assert.equal(b.ctx.state,'suspended');
});
test('pickup/ghost use selected sample buffers, merge dense events while every started overlap finishes even on pause/mute',async()=>{
 const {a}=fixture();a.unlock();await a.ready;
 a.effect('ghost');assert.equal(a.voices.size,1);const ghost=[...a.voices][0];assert.equal(ghost.source.buffer,a.buffers.ghost);
 for(let i=0;i<100;i++)a.effect('ghost');assert.equal(a.voices.size,1);
 a.ctx.currentTime=.071;a.effect('ghost');assert.equal(a.voices.size,2);
 a.ctx.currentTime=.142;a.effect('ghost');assert.equal([...a.voices].filter(v=>v.name==='ghost').length,3);
 for(let i=0;i<12;i++){a.ctx.currentTime+=.04;a.effect('collect');assert.ok([...a.voices].every(v=>!v.source.stopped));}
 assert.equal([...a.voices].at(-1).source.buffer,a.buffers.collect);
 const started=[...a.voices],count=started.length;a.setActive(false);assert.equal(a.voices.size,count);assert.equal(a.ctx.state,'running');const position=a.musicPosition;a.ctx.currentTime+=1;assert.equal(a.musicPosition,position);a.effect('collect');assert.equal(a.voices.size,count);
 a.setActive(true);a.toggle('sound');assert.equal(a.voices.size,count);a.effect('ghost');assert.equal(a.voices.size,count);assert.equal(a.soundGain.gain.value,.60);assert.ok(started.every(v=>!v.source.stopped));a.setActive(false);for(const v of started)v.source.onended();assert.equal(a.voices.size,0);assert.equal(a.ctx.state,'suspended');assert.ok(started.every(v=>v.source.disconnected&&v.gain.disconnected));
});

test('each result grass digit starts a bubble without gameplay merging, preserving mute and natural overlapping tails',async()=>{
 const {a}=fixture();a.unlock();await a.ready;const before=a.ctx.sources.length;
 for(let i=0;i<40;i++){a.ctx.currentTime+=.016;assert.ok(a.countGhost());assert.ok([...a.voices].every(v=>!v.source.stopped));}
 assert.equal(a.ctx.sources.length-before,40);assert.ok([...a.voices].every(v=>v.source.buffer===a.buffers.ghost));
 const count=a.ctx.sources.length;a.settings.sound=false;assert.equal(a.countGhost(),null);assert.equal(a.ctx.sources.length,count);a.settings.sound=true;a.setActive(false);assert.equal(a.countGhost(),null);assert.equal(a.ctx.sources.length,count);
});

test('result pickup ticks bypass burst merging while keeping gameplay merging and mute without stealing voices',async()=>{
 const {a}=fixture();a.unlock();await a.ready;a.effect('collect');const before=a.ctx.sources.length;
 for(let i=0;i<20;i++){a.ctx.currentTime+=.016;a.effect('collect',{merge:false});assert.ok([...a.voices].every(v=>!v.source.stopped));}
 assert.equal(a.ctx.sources.length-before,20);const count=a.ctx.sources.length;a.effect('collect');assert.equal(a.ctx.sources.length,count);
 a.settings.sound=false;a.effect('collect',{merge:false});assert.equal(a.ctx.sources.length,count);a.settings.sound=true;a.setActive(false);a.effect('collect',{merge:false});assert.equal(a.ctx.sources.length,count);
});

test('blocked autoplay exposes a recoverable gesture state and respects mute/deactivation',async()=>{
 class Blocked extends Context {resume(){return this.allow?super.resume():Promise.reject(Error('NotAllowedError'));}}
 const {a}=fixture(null,Blocked);a.unlock();await a.ready;
 assert.equal(a.musicSource,null);assert.equal(a.needsGesture,true);
 a.settings.music=false;assert.equal(a.needsGesture,false);a.settings.music=true;
 a.setActive(false);assert.equal(a.needsGesture,false);a.active=true;a.ctx.allow=true;
 a.unlock();await Promise.resolve();assert.equal(a.needsGesture,false);assert.equal(a.musicSource.loop,true);
});

test('first UI click decodes once on its own clock; paused clicks never resume music and overlapping clicks finish naturally',async()=>{
 const {a}=fixture();a.unlock();await a.ready;a.ctx.currentTime=12.5;a.setActive(false);
 const position=a.musicPosition,source=await a.effect('click');assert.ok(source);assert.equal(source.buffer,a.clickBuffer);
 assert.notEqual(a.clickCtx,a.ctx);assert.equal(a.ctx.state,'suspended');assert.equal(a.musicPosition,position);assert.equal(a.clickCtx.decodeCalls,1);
 for(let i=0;i<20;i++)await a.effect('click');assert.equal(a.clickVoices.size,21);assert.ok([...a.clickVoices].every(v=>!v.stopped));assert.equal(a.clickCtx.decodeCalls,1);
 a.settings.sound=false;assert.equal(await a.effect('click'),null);a.sync();assert.equal(a.clickVoices.size,21);
 a.settings.sound=true;assert.ok(await a.effect('click'));a.clearClicks();assert.equal(a.clickCtx.state,'running');assert.equal(a.clickVoices.size,22);const started=[...a.clickVoices];assert.ok(started.every(v=>!v.stopped));for(const source of started)source.onended();assert.equal(a.clickCtx.state,'suspended');assert.equal(a.clickVoices.size,0);assert.ok(started.every(v=>v.disconnected));
});

test('muting or losing focus while first click decodes cancels it rather than replaying later',async()=>{
 const pending=[];class Slow extends Context {decodeAudioData(){return new Promise(resolve=>pending.push(()=>resolve({duration:.3})));}}
 const {a}=fixture(null,Slow);const click=a.effect('click');a.clearClicks();pending.shift()();assert.equal(await click,null);assert.equal(a.clickVoices.size,0);
 a.settings.sound=false;assert.equal(await a.effect('click'),null);a.settings.sound=true;assert.ok(await a.effect('click'));
});


test('separate sound equipment selects pickup and clear samples and never steals selected sample voices',async()=>{
 const {a,P}=fixture();a.unlock();await a.ready;P.shopSounds=[{id:'test-pickup',sample:'ghost'},{id:'test-clear',sample:'collect'}];a.setSoundEquipment({collect:'test-pickup',ghost:'test-clear'});
 a.effect('collect');assert.equal(a.ctx.sources.at(-1).buffer,a.buffers.ghost);const pop=a.countGhost();assert.equal(pop.buffer,a.buffers.collect);for(let i=0;i<10;i++)a.countGhost();assert.equal([...a.voices].filter(v=>v.name==='ghost').length,11);assert.ok([...a.voices].every(v=>!v.source.stopped));
 a.setSoundEquipment({collect:'missing',ghost:'missing'});assert.equal(a.playSample('collect',1).buffer,a.buffers.collect);assert.equal(a.countGhost().buffer,a.buffers.ghost);
});

test('preview tails survive next preview, navigation, mute and inactivity; only pending requests cancel',async()=>{
 const {a,P}=fixture();P.shopSounds=[{id:'test-preview',sample:'ghost'}];const source=await a.previewSound('test-preview');assert.equal(source.buffer,a.buffers.ghost);a.stopPreview();assert.equal(source.stopped,undefined);
 const pending=a.previewSound('test-preview');a.stopPreview();assert.equal(await pending,null);const second=await a.previewSound('test-preview');a.setActive(false);assert.equal(second.stopped,undefined);assert.equal(source.stopped,undefined);assert.equal(a.voices.size,2);assert.equal(await a.previewSound('test-preview'),null);
 a.setActive(true);a.toggle('sound');assert.equal(await a.previewSound('test-preview'),null);
});

test('missing upload cannot preview or initialize audio',async()=>{
 const {a,P}=fixture();P.shopSounds=[{id:'pending',sample:null}];assert.equal(await a.previewSound('pending'),null);assert.equal(await a.previewSound('unknown'),null);assert.equal(a.ctx,undefined);
});


test('game-end plays the uploaded sample instead of synthesizing notes and obeys mute/activity',async()=>{
 const {a}=fixture();a.unlock();await a.ready;const source=a.effect('end');assert.ok(source);assert.equal(source.buffer,a.buffers.end);assert.equal(source.loop,undefined);assert.ok([...a.voices].some(v=>v.name==='end'));
 a.settings.sound=false;const count=a.ctx.sources.length;assert.equal(a.effect('end'),undefined);assert.equal(a.ctx.sources.length,count);a.settings.sound=true;a.setActive(false);assert.equal(source.stopped,undefined);assert.equal(a.effect('end'),undefined);assert.equal(a.ctx.sources.length,count);
});

test('same equipped sample has identical gain for pickups, clears, both result counters and audition',async()=>{const {a,P}=fixture();P.shopSounds=[{id:'shared',sample:'collect'}];a.setSoundEquipment({collect:'shared',ghost:'shared'});a.unlock();await a.ready;a.effect('collect',{merge:false});a.effect('ghost',{merge:false});a.countGhost();await a.previewSound('shared');const voices=[...a.voices];assert.equal(voices.length,4);for(const v of voices){assert.equal(v.source.buffer,a.buffers.collect);assert.equal(v.gain.gain.value,.65);assert.equal(v.source.stopped,undefined);}});
test('music equipment switches loops from zero, pauses at its own position and audition ducks only background music',async()=>{const {a,P}=fixture();P.shopMusic=[{id:'default-music',sample:'music'},{id:'a',sample:'collect'},{id:'b',sample:'ghost'}];a.unlock();await a.ready;const original=a.musicSource;a.setMusicEquipment('a');assert.equal(original.stopped,true);assert.equal(a.musicSource.buffer,a.buffers.collect);assert.equal(a.musicSource.loop,true);a.ctx.currentTime=.1;a.setActive(false);assert.equal(a.musicPosition,.1);a.ctx.currentTime=2;a.setActive(true);await Promise.resolve();assert.equal(a.musicSource.startArgs[1],.1);a.settings.sound=false;const preview=await a.previewMusic('b');assert.equal(preview.buffer,a.buffers.ghost);assert.equal(a.musicGain.gain.value,0);a.stopPreview();assert.equal(preview.stopped,true);assert.equal(a.musicGain.gain.value,.30);a.setMusicEquipment('b');assert.equal(a.musicSource.buffer,a.buffers.ghost);assert.equal(a.musicSource.startArgs[1],0);a.toggle('music');assert.equal(await a.previewMusic('a'),null);assert.equal(a.musicSource,null);});
