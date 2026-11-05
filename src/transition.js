(function(P){
'use strict';
class Transition {
  constructor(){this.running=false;this.pageOpacity=0;this.homeOpacity=1;}
  reset(home=false){this.running=false;this.pageOpacity=home?0:1;this.homeOpacity=home?1:0;}
  begin(target,change,done){
    if(this.running)return false;
    this.target=target;this.done=done;this.change=change;this.elapsed=0;this.running=true;
    this.fadeDuration=matchMedia('(prefers-reduced-motion: reduce)').matches?.12:.4;
    if(target==='page')change();
    return true;
  }
  toPage(change,done){return this.begin('page',change,done);}
  toHome(change,done){return this.begin('home',change,done);}
  draw(dt){
    if(!this.running)return;
    this.elapsed+=dt;const progress=Math.min(1,this.elapsed/this.fadeDuration);
    this.pageOpacity=this.target==='page'?progress:1-progress;this.homeOpacity=1-this.pageOpacity;
    if(progress===1){this.running=false;if(this.target==='home')this.change();this.done?.();}
  }
}
P.Transition=Transition;
})(globalThis.PixelDodge);
