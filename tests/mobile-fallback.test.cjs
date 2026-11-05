const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture({full,lock,phone=true,portrait=true}={}){
 const handlers={},button={disabled:false,addEventListener:(k,fn)=>handlers.enter=fn},skip={addEventListener:(k,fn)=>handlers.skip=fn},dialog={open:false,addEventListener:(k,fn)=>handlers.cancel=fn,showModal(){this.open=true;},close(){this.open=false;}};
 const counts={full:0,lock:0,unlock:0,exit:0},document={addEventListener(){},documentElement:{},exitFullscreen(){counts.exit++;return Promise.resolve();}};
 if(full)document.documentElement.requestFullscreen=()=>{counts.full++;return full();};
 const orientation={unlock(){counts.unlock++;}};if(lock)orientation.lock=()=>{counts.lock++;return lock();};
 const c=vm.createContext({PixelDodge:{},document,window:{screen:{orientation}},innerWidth:portrait?390:844,innerHeight:portrait?844:390,matchMedia:()=>({matches:phone,addEventListener(){}}),setTimeout:fn=>setTimeout(fn,15),clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/orientation.js'),'utf8'),c);
 const flow=new c.PixelDodge.MobileLandscape(dialog,button,skip);return{flow,dialog,button,counts,handlers,c,document};
}
test('portrait suggestion is dismissible, never requests APIs automatically or returns on resize',()=>{
 const a=fixture({full:()=>Promise.resolve(),lock:()=>Promise.resolve()});a.flow.update();assert.equal(a.dialog.open,true);assert.equal(a.counts.full,0);a.handlers.skip();assert.equal(a.dialog.open,false);a.flow.update();assert.equal(a.dialog.open,false);assert.equal(a.counts.lock,0);
 const b=fixture();b.flow.update();b.handlers.cancel({preventDefault(){}});assert.equal(b.dialog.open,false);b.flow.update();assert.equal(b.dialog.open,false);
});
test('manual landscape closes suggestion and does not show it again after rotating back',()=>{
 const a=fixture();a.flow.update();a.c.innerWidth=844;a.c.innerHeight=390;a.flow.update();assert.equal(a.dialog.open,false);a.c.innerWidth=390;a.c.innerHeight=844;a.flow.update();assert.equal(a.dialog.open,false);
});
test('unsupported and rejected orientation APIs finish with portrait accessible and buttons usable',async()=>{
 for(const options of [{},{lock:()=>Promise.reject(Error('portrait locked'))},{full:()=>Promise.reject(Error('denied')),lock:()=>Promise.resolve()},{full:()=>{throw Error('sync denial');}}]){
  const a=fixture(options);a.flow.update();assert.equal(await a.flow.request(),false);assert.equal(a.dialog.open,false);assert.equal(a.button.disabled,false);assert.equal(a.flow.pending,false);a.flow.update();assert.equal(a.dialog.open,false);
 }
});
test('hanging fullscreen and orientation cannot hold the UI, pending state times out',async()=>{
 for(const options of [{full:()=>new Promise(()=>{}),lock:()=>Promise.resolve()},{full:()=>Promise.resolve(),lock:()=>new Promise(()=>{})}]){
  const a=fixture(options);a.flow.update();const pending=a.flow.request();assert.equal(a.dialog.open,false);assert.equal(a.flow.pending,true);assert.equal(await pending,false);assert.equal(a.flow.pending,false);assert.equal(a.button.disabled,false);
 }
});
test('late lock/fullscreen completion is undone instead of changing orientation during play',async()=>{
 let complete;const a=fixture({lock:()=>new Promise(resolve=>complete=resolve)});await a.flow.request();complete();await new Promise(setImmediate);assert.equal(a.counts.unlock,1);
 const b=fixture({full:()=>new Promise(resolve=>complete=resolve)});await b.flow.request();complete();await new Promise(setImmediate);assert.equal(b.counts.exit,1);assert.equal(b.counts.lock,0);
});
test('desktop ignores phone prompt and APIs; explicit successful phone request resolves',async()=>{
 const a=fixture({phone:false,full:()=>{throw Error('desktop request');}});a.flow.update();assert.equal(a.dialog.open,false);assert.equal(await a.flow.request(),true);assert.equal(a.counts.full,0);
 const b=fixture({lock:()=>{b.c.innerWidth=844;b.c.innerHeight=390;return Promise.resolve();}});assert.equal(await b.flow.request(),true);assert.equal(b.flow.pending,false);
});
