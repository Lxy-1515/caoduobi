const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({Math,Date,console,navigator:{maxTouchPoints:1},matchMedia:()=>({matches:false})});
for(const name of ['content','geometry','engine','transition','touch-controls','title'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8'),c);
const P=c.PixelDodge;
function controls(saved=null,blocked=false){
 const handlers={},captures=new Set(),canvas={addEventListener:(type,fn)=>handlers[type]=fn,setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),getBoundingClientRect:()=>({left:0,top:0})};
 const engine=new P.Engine();engine.start();const renderer={viewScale:.5},joystick={style:{},hidden:true},thumb={style:{}},disk={value:saved};let cancelled=0;
 const control=new P.TouchControls({canvas,joystick,thumb,engine,renderer,storage:{getItem(){if(blocked)throw Error();return disk.value;},setItem(k,v){if(blocked)throw Error();disk.value=v;}},enabled:()=>engine.state==='running',onCancel:()=>cancelled++});
 const event=(pointerId=1,x=100,y=150,pointerType='touch')=>({pointerId,clientX:x,clientY:y,pointerType,button:0,preventDefault(){}});
 return {control,engine,renderer,joystick,thumb,disk,handlers,event,captures,get cancelled(){return cancelled;}};
}
test('finger targets the absolute touch position immediately, has no cursor, releases without braking',()=>{
 const a=controls();assert.equal(a.control.mode,'finger');assert.equal(a.control.needsChoice,true);
 const x=a.engine.player.x;a.control.begin(a.event());assert.equal(a.engine.player.tx,200);assert.equal(a.engine.player.ty,300);assert.equal(a.engine.player.x,x);assert.equal(a.renderer.fingerActive,true);assert.equal(a.joystick.hidden,true);
 a.control.move(a.event(1,130,170));assert.equal(a.engine.player.tx,260);assert.equal(a.engine.player.ty,340);assert.equal(a.renderer.touchCursor,undefined);
 a.engine.player.vx=120;a.handlers.pointerup(a.event());assert.equal(a.renderer.fingerActive,false);assert.equal(a.engine.player.vx,120);
 a.engine.player.x=500;a.engine.player.y=480;a.control.begin(a.event(2,300,250));assert.equal(a.engine.player.tx,600);assert.equal(a.engine.player.ty,500);
});
test('one pointer owns either control; ignored pointer release/cancel cannot remove it; switch clears and persists',()=>{
 const a=controls();a.control.begin(a.event());a.control.begin(a.event(2,400,400));assert.equal(a.control.held.id,1);
 a.handlers.pointerup(a.event(2));a.handlers.pointercancel(a.event(2));assert.equal(a.control.held.id,1);assert.equal(a.cancelled,0);
 a.control.setMode('joystick');assert.equal(a.control.held,null);assert.equal(a.renderer.fingerActive,false);assert.equal(a.control.needsChoice,false);assert.equal(JSON.parse(a.disk.value).mode,'joystick');
 a.control.begin(a.event());a.control.move(a.event(1,200,150));assert.equal(a.engine.player.direction.x,1);assert.equal(a.thumb.style.transform,'translate(67.5px,0px)');assert.equal(a.joystick.hidden,false);
 a.handlers.pointercancel(a.event());assert.equal(a.cancelled,1);assert.equal(a.engine.player.direction,null);assert.equal(a.renderer.joystickDirection,null);assert.equal(a.joystick.hidden,true);
});
test('saved control reloads; corrupt/blocked saves remain usable; mouse and paused input never create touch UI',()=>{
 assert.equal(controls('{"mode":"joystick"}').control.needsChoice,false);assert.equal(controls('{"mode":"crosshair"}').control.mode,'finger');assert.equal(controls('{"mode":"crosshair"}').control.chosen,true);assert.equal(controls('{bad').control.mode,'finger');
 const a=controls(null,true);assert.equal(a.control.setMode('joystick'),true);assert.equal(a.control.chosen,true);assert.equal(a.control.setMode('invalid'),false);
 a.control.begin(a.event(1,100,100,'mouse'));assert.equal(a.control.held,null);a.engine.pause();a.control.begin(a.event());assert.equal(a.control.held,null);
});
test('joystick passes push magnitude including held neutral; release clears it without changing velocity',()=>{
 const a=controls('{"mode":"joystick"}');a.control.begin(a.event());assert.equal(a.engine.player.direction.strength,0);
 for(const [offset,strength]of [[3,0],[6,0],[21.375,.25],[36.75,.5],[52.125,.75],[67.5,1],[180,1]]){a.control.move(a.event(1,100+offset,150));assert.equal(a.engine.player.direction.strength,strength);if(strength)assert.equal(a.engine.player.direction.x,1);}
 a.engine.player.vx=250;a.control.move(a.event(1,100,150));assert.equal(a.engine.player.direction.strength,0);assert.equal(a.engine.player.vx,250);a.handlers.pointerup(a.event());assert.equal(a.engine.player.direction,null);assert.equal(a.engine.player.vx,250);
});
test('fade has no canvas dependency, changes pages once and completes in existing fade duration',()=>{
 const fx=new P.Transition();let changes=0,done=0;assert.equal(fx.toPage(()=>changes++,()=>done++),true);assert.equal(changes,1);assert.equal(fx.toHome(()=>changes++),false);
 fx.draw(.2);assert.equal(fx.pageOpacity,.5);assert.equal(fx.homeOpacity,.5);fx.draw(.2);assert.equal(done,1);assert.equal(fx.running,false);
 fx.toHome(()=>changes++);fx.draw(.2);assert.equal(changes,1);fx.draw(.2);assert.equal(changes,2);assert.equal(fx.homeOpacity,1);fx.draw(10);assert.equal(changes,2);
});
test('hidden title resize never replaces valid lettering with zero geometry',()=>{
 const element={style:{width:'300px'},replaceChildren(){throw Error('hidden title was rebuilt');}},title=new P.Title(element,{getBoundingClientRect:()=>({x:0,y:0,width:0,height:0})});
 title.bounds={width:300,height:200};assert.equal(title.resize(844,390,.5),false);assert.equal(element.style.width,'300px');assert.equal(title.bounds.width,300);
});


test('joystick transfers to the still-held finger at its latest position without another press',()=>{
 const a=controls('{"mode":"joystick"}');a.control.begin(a.event(1,100,150));a.control.move(a.event(1,140,150));
 a.control.begin(a.event(2,400,300));a.control.move(a.event(2,450,320));assert.equal(a.control.held.id,1);assert.equal(a.joystick.style.left,'100px');assert.equal(a.captures.size,2);
 a.engine.player.vx=250;a.handlers.pointerup(a.event(1,140,150));assert.equal(a.control.held.id,2);assert.equal(a.joystick.hidden,false);assert.equal(a.joystick.style.left,'450px');assert.equal(a.joystick.style.top,'320px');assert.equal(a.thumb.style.transform,'translate(0px,0px)');assert.equal(a.engine.player.direction.strength,0);assert.equal(a.engine.player.vx,250);assert.equal(a.renderer.joystickDirection,null);assert.equal(a.captures.has(1),false);
 a.handlers.lostpointercapture(a.event(1));assert.equal(a.control.held.id,2);a.control.move(a.event(2,486.75,320));assert.equal(a.engine.player.direction.x,1);assert.equal(a.engine.player.direction.strength,.5);
 a.handlers.pointerup(a.event(2));assert.equal(a.control.held,null);assert.equal(a.joystick.hidden,true);assert.equal(a.control.pointers.size,0);assert.equal(a.captures.size,0);assert.equal(a.engine.player.vx,250);
});

test('several waiting fingers transfer in press order; lifted or cancelled waiters never take over',()=>{
 const a=controls('{"mode":"joystick"}');for(let id=1;id<=4;id++)a.control.begin(a.event(id,id*100,150));
 a.handlers.pointerup(a.event(2));a.handlers.pointercancel(a.event(3));assert.equal(a.control.held.id,1);assert.equal(a.cancelled,0);a.handlers.pointerup(a.event(1));assert.equal(a.control.held.id,4);a.control.begin(a.event(5,500,200));a.control.begin(a.event(6,600,200));a.handlers.pointerup(a.event(4));assert.equal(a.control.held.id,5);a.handlers.pointerup(a.event(5));assert.equal(a.control.held.id,6);a.handlers.pointerup(a.event(6));assert.equal(a.joystick.hidden,true);
});

test('pause, switching controls and capture/cancel cleanup discard every waiting contact',()=>{
 for(const reason of ['pause','switch','cancel','capture']){
  const a=controls('{"mode":"joystick"}');a.control.begin(a.event(1));a.control.begin(a.event(2,400,300));
  if(reason==='pause'){a.engine.pause();a.control.clear();}else if(reason==='switch')a.control.setMode('finger');else if(reason==='cancel')a.handlers.pointercancel(a.event(1));else a.handlers.lostpointercapture(a.event(1));
  assert.equal(a.control.held,null);assert.equal(a.control.pointers.size,0);assert.equal(a.captures.size,0);assert.equal(a.joystick.hidden,true);a.handlers.pointerup(a.event(1));a.control.move(a.event(2,450,350));assert.equal(a.joystick.hidden,true);assert.equal(a.engine.player.direction,null);
 }
});

test('finger mode retains its single owner and does not hand over or create a wheel',()=>{
 const a=controls();a.control.begin(a.event(1));a.control.begin(a.event(2,400,300));assert.equal(a.control.pointers.size,1);a.handlers.pointerup(a.event(1));assert.equal(a.control.held,null);a.control.move(a.event(2,420,320));assert.equal(a.control.held,null);assert.equal(a.joystick.hidden,true);
});
