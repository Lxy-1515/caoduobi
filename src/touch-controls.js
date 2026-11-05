(function(P){
'use strict';
const KEY='pixel-dodge.controls.v1';
class TouchControls {
  constructor({canvas,joystick,thumb,engine,renderer,storage,enabled,onCancel}){
    Object.assign(this,{canvas,joystick,thumb,engine,renderer,storage,enabled,onCancel});
    this.mode='finger';this.chosen=false;this.held=null;this.pointers=new Map();
    try{const saved=JSON.parse(storage.getItem(KEY));if(['finger','crosshair','joystick'].includes(saved?.mode)){this.mode=saved.mode==='crosshair'?'finger':saved.mode;this.chosen=true;}}catch{}
    canvas.addEventListener('pointerdown',e=>this.begin(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerup',e=>this.end(e));
    canvas.addEventListener('pointercancel',e=>{if(this.held?.id===e.pointerId){this.clear();this.onCancel();}else this.end(e);});
    canvas.addEventListener('lostpointercapture',e=>{if(this.held?.id===e.pointerId)this.clear();else this.pointers.delete(e.pointerId);});
  }
  get available(){return matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;}
  get needsChoice(){return this.available&&!this.chosen;}
  get label(){return this.mode==='finger'?'手指控制':'摇杆控制';}
  setMode(mode){
    if(!['finger','joystick'].includes(mode))return false;
    this.clear();this.mode=mode;this.chosen=true;
    try{this.storage.setItem(KEY,JSON.stringify({mode}));}catch{}
    return true;
  }
  begin(event){
    if(!this.enabled()||(this.held&&this.mode!=='joystick')||this.pointers.has(event.pointerId)||event.button!==0||event.pointerType==='mouse')return;
    event.preventDefault();const point={id:event.pointerId,x:event.clientX,y:event.clientY};this.pointers.set(point.id,point);
    this.canvas.setPointerCapture(event.pointerId);
    if(!this.held){this.activate(point);this.move(event);}
  }
  activate(point){
    this.engine.coast();this.held={...point};this.renderer.fingerActive=this.mode==='finger';
    if(this.mode==='joystick'){
      this.joystick.style.left=point.x+'px';this.joystick.style.top=point.y+'px';this.joystick.hidden=false;
      this.thumb.style.transform='translate(0px,0px)';this.renderer.joystickDirection=null;this.engine.steerDirection(0,0,0);
    }
  }
  end(event){
    const owner=this.held?.id===event.pointerId;this.pointers.delete(event.pointerId);
    if(owner){
      const next=this.mode==='joystick'&&this.enabled()?this.pointers.values().next().value:null;
      if(next)this.activate(next);else this.clear();
    }
    if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
  }
  move(event){
    const point=this.pointers.get(event.pointerId);if(!point)return;
    point.x=event.clientX;point.y=event.clientY;
    if(this.held?.id!==event.pointerId){event.preventDefault();return;}
    event.preventDefault();const dx=event.clientX-this.held.x,dy=event.clientY-this.held.y;
    if(this.mode==='finger'){
      const rect=this.canvas.getBoundingClientRect(),scale=this.renderer.viewScale||1;
      this.engine.target((event.clientX-rect.left)/scale,(event.clientY-rect.top)/scale);
    }else{
      const length=Math.hypot(dx,dy),travel=67.5,deadZone=6,scale=length>travel?travel/length:1;
      this.thumb.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
      this.renderer.joystickDirection=length>.01?{x:dx/length,y:dy/length}:null;
      const strength=Math.max(0,Math.min(1,(length-deadZone)/(travel-deadZone)));
      this.engine.steerDirection(strength?dx:0,strength?dy:0,strength);
    }
  }
  clear(){
    const held=this.held,ids=Array.from(this.pointers.keys());this.held=null;this.pointers.clear();this.renderer.fingerActive=false;this.renderer.joystickDirection=null;this.joystick.hidden=true;
    if(held)this.engine.coast();
    for(const id of ids)if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
  }
}
P.TouchControls=TouchControls;
})(globalThis.PixelDodge);
