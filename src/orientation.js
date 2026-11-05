(function(P){
'use strict';
class MobileLandscape {
  constructor(dialog,button,skip){
    this.dialog=dialog;this.button=button;this.pending=false;this.dismissed=false;
    this.coarse=matchMedia('(pointer: coarse)');
    button.addEventListener('click',()=>this.request());
    skip.addEventListener('click',()=>this.dismiss());
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.dismiss();});
    this.coarse.addEventListener?.('change',()=>this.update());
    document.addEventListener('fullscreenchange',()=>this.update());
  }
  get isPhone(){return this.coarse.matches&&Math.min(innerWidth,innerHeight)<=600;}
  dismiss(){this.dismissed=true;if(this.dialog.open)this.dialog.close();}
  update(){
    if(this.isPhone&&innerHeight>innerWidth&&!this.dismissed){
      if(!this.dialog.open)this.dialog.showModal();
    }else if(this.dialog.open)this.dismiss();
  }
  attempt(action,onLate=()=>{}){
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>finish(false),1000);
      try{Promise.resolve(action()).then(()=>{if(settled){try{onLate();}catch{}}else finish(true);},()=>finish(false));}catch{finish(false);}
    });
  }
  async request(){
    this.dismiss();
    if(!this.isPhone)return true;
    if(this.pending)return false;
    this.pending=true;this.button.disabled=true;
    try{
      // An explicit, optional request. Never gate game startup on these APIs.
      if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
        const full=await this.attempt(()=>document.documentElement.requestFullscreen({navigationUI:'hide'}),()=>{document.exitFullscreen?.()?.catch?.(()=>{});});
        if(!full)return false;
      }
      if(innerHeight>innerWidth&&window.screen.orientation?.lock){
        await this.attempt(()=>window.screen.orientation.lock('landscape'),()=>window.screen.orientation.unlock?.());
      }
    }catch{return false;}finally{
      this.pending=false;this.button.disabled=false;
    }
    return innerWidth>=innerHeight;
  }
}
P.MobileLandscape=MobileLandscape;
})(globalThis.PixelDodge);
