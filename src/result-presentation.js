(function(P){
'use strict';
// Continuous attacks with overlapping tails, never faster audio playback.
const cadence={grass:{budget:3,interval:.07,lead:0,tail:3584/44100},points:{budget:2,interval:.06,lead:0,tail:.24}};
function countPlan(target,timing){
  const limit=Math.floor((timing.budget-timing.tail-timing.lead)/timing.interval)+1;
  return{...timing,target,steps:Math.min(target,limit),step:0,elapsed:0};
}
function advanceCount(count,dt,display){
  if(!count.steps)return true;
  count.elapsed+=dt;
  const step=Math.min(count.steps,Math.max(0,1+Math.floor((count.elapsed-count.lead+1e-8)/count.interval)));
  if(step>count.step){count.step=step;display(Math.round(count.target*step/count.steps));}
  return count.step===count.steps;
}
class ResultPresentation {
  constructor({dialog,total,score=null,title=null,onTick,onScoreTick,onOpen,reduced=false}){Object.assign(this,{dialog,total,score,title,onTick,onScoreTick,onOpen,reduced});this.phase='idle';this.target=0;this.scoreTarget=null;}
  cancel(){
    this.phase='idle';this.entry?.cancel();this.entry=null;
    this.total.textContent=String(this.target);
    if(this.score&&this.scoreTarget!==null)this.score.textContent=String(this.scoreTarget);
  }
  begin(reward,score=null){
    this.cancel();this.target=Math.max(0,Math.floor(reward));this.total.textContent='0';this.elapsed=0;this.step=0;this.value=0;this.coinCount=countPlan(this.target,cadence.points);this.steps=this.coinCount.steps;this.phase='delay';
    this.scoreTarget=score===null?null:Math.max(0,Math.floor(score));this.scoreValue=0;
    this.grassCount=score===null?null:countPlan(this.scoreTarget,cadence.grass);
    if(this.score&&this.scoreTarget!==null)this.score.textContent='0';
  }
  alignTitle(){
    const span=this.title?.firstElementChild;if(!span||!this.dialog.open)return;
    const style=getComputedStyle(span),ctx=this.titleMetrics||(this.titleMetrics=document.createElement('canvas').getContext('2d'));
    ctx.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');ctx.fontKerning=style.fontKerning;ctx.textAlign='left';
    const m=ctx.measureText(span.textContent),offset=(m.width+(m.actualBoundingBoxLeft||0)-(m.actualBoundingBoxRight??m.width))/2;
    span.style.transform='translateX('+offset+'px)';
  }
  startCounting(){
    this.elapsed=0;this.phase=this.scoreTarget===null?'count':'grass';
  }
  update(dt){
    if(this.phase==='idle'||dt<=0)return;
    this.elapsed+=dt;
    if(this.phase==='delay'){
      if(this.elapsed<.5)return;this.elapsed=0;this.dialog.showModal();this.alignTitle();this.onOpen?.();
      const duration=this.reduced?0:360;
      this.entry=this.dialog.animate?.([{transform:'translateY(calc(50vh + 50%))',opacity:0},{transform:'translateY(0)',opacity:1}],{duration,easing:'cubic-bezier(.16,1,.3,1)'})||null;
      if(duration)this.phase='enter';else this.startCounting();return;
    }
    if(this.phase==='enter'){if(this.elapsed<.36)return;this.startCounting();return;}
    let countDt=dt;
    if(this.phase==='grass'){
      // Missed schedule slots become one visible jump, never a burst of audio.
      if(!advanceCount(this.grassCount,dt,value=>{this.scoreValue=value;this.score.textContent=String(value);this.onScoreTick?.();}))return;
      this.phase='count';this.elapsed=0;countDt=0;
    }
    if(advanceCount(this.coinCount,countDt,value=>{this.step=this.coinCount.step;this.value=value;this.total.textContent=String(value);this.onTick?.();}))this.phase='idle';
  }
}
P.ResultPresentation=ResultPresentation;
})(globalThis.PixelDodge);
