(function(P){
'use strict';
const C=P.config,TAU=Math.PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
class TwinOrbit {
  constructor(engine){this.engine=engine;this.angle=Math.PI/2;this.previousAngle=this.angle;this.speed=0;this.resize();}
  resize(){
    const e=this.engine;this.x=e.width/2;this.y=e.height/2;
    this.radius=Math.min((C.hazards.large.radius[0]+C.hazards.large.radius[1])/2*C.twin.radiusFactor,Math.max(0,Math.min(e.width,e.height)/2-C.radius-8));
    this.place();for(const b of [e.player,e.whiteBall]){b.px=b.x;b.py=b.y;}this.previousAngle=this.angle;
  }
  target(x,y){
    const p=this.engine.player;if(Math.hypot(x-this.x,y-this.y)<1)return;
    p.direction=null;
    if(Math.hypot(x-p.tx,y-p.ty)>.1){p.tx=x;p.ty=y;this.targetAngle=Math.atan2(y-this.y,x-this.x);p.steering=true;}
  }
  place(){
    const e=this.engine,c=Math.cos(this.angle),s=Math.sin(this.angle),p=e.player,b=e.whiteBall;
    Object.assign(p,{x:this.x+c*this.radius,y:this.y+s*this.radius,vx:-s*this.speed,vy:c*this.speed});
    Object.assign(b,{x:this.x-c*this.radius,y:this.y-s*this.radius,vx:s*this.speed,vy:-c*this.speed});
  }
  advance(dt){
    const p=this.engine.player,b=this.engine.whiteBall;this.previousAngle=this.angle;
    p.px=p.x;p.py=p.y;b.px=b.x;b.py=b.y;
    const error=wrap((this.targetAngle??this.angle)-this.angle);let target=null;
    if(p.direction){
      const tangent=-Math.sin(this.angle)*p.direction.x+Math.cos(this.angle)*p.direction.y;
      target=(Math.abs(tangent)<1e-12?0:tangent)*p.direction.strength*C.playerSpeed;
    }
    else if(p.steering){if(Math.abs(error)<1e-6)p.steering=false;else target=Math.sign(error)*C.playerSpeed;}
    if(target!==null)this.speed+=Math.max(-C.playerAcceleration*dt,Math.min(C.playerAcceleration*dt,target-this.speed));
    const travel=this.radius?this.speed*dt/this.radius:0;this.angle+=travel;
    if(!p.direction&&p.steering&&Math.sign(travel)===Math.sign(error)&&Math.abs(travel)>=Math.abs(error))p.steering=false;
    this.place();
    if(Math.abs(this.angle)>TAU){const shift=Math.trunc(this.angle/TAU)*TAU;this.angle-=shift;this.previousAngle-=shift;}
  }
  hits(body,hazard,options){
    const delta=this.angle-this.previousAngle,bow=this.radius*(1-Math.cos(Math.min(Math.PI,Math.abs(delta))/2));
    const reach=hazard.r*(hazard.type==='fast'?Math.SQRT2:1);
    if(!P.geometry.sweptCircle(body,hazard,body.r+reach+bow))return false;
    const count=Math.max(1,Math.ceil(Math.abs(delta)/.01)),offset=body===this.engine.whiteBall?Math.PI:0;
    for(let i=0;i<count;i++){
      const a=this.previousAngle+delta*i/count+offset,z=this.previousAngle+delta*(i+1)/count+offset,t=i/count,u=(i+1)/count;
      const part={r:body.r,px:this.x+Math.cos(a)*this.radius,py:this.y+Math.sin(a)*this.radius,x:this.x+Math.cos(z)*this.radius,y:this.y+Math.sin(z)*this.radius};
      const from=hazard.previousAngle??hazard.angle??0,to=hazard.angle??0;
      const h={...hazard,px:(hazard.px??hazard.x)+(hazard.x-(hazard.px??hazard.x))*t,py:(hazard.py??hazard.y)+(hazard.y-(hazard.py??hazard.y))*t,x:(hazard.px??hazard.x)+(hazard.x-(hazard.px??hazard.x))*u,y:(hazard.py??hazard.y)+(hazard.y-(hazard.py??hazard.y))*u,previousAngle:from+(to-from)*t,angle:from+(to-from)*u};
      if(P.geometry.hits(part,h,options))return true;
    }
    return false;
  }
}
P.TwinOrbit=TwinOrbit;
})(globalThis.PixelDodge);
