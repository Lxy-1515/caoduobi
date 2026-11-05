// Test-only Tap protocol fixture. Never imported by the game or build.
async function install(p,{automatic=false}={}){
 await p.addInitScript(automatic=>{window.testAds=[];window.tap={createRewardedVideoAd(options){const a={options,shown:false,destroyed:false,close:null,error:null,onClose(fn){this.close=fn;this.staleClose=fn;},offClose(){this.close=null;},onError(fn){this.error=fn;},offError(){this.error=null;},load(){return Promise.resolve();},show(){this.shown=true;if(automatic)setTimeout(()=>this.close?.({isEnded:true}),10);return Promise.resolve();},destroy(){this.destroyed=true;}};testAds.push(a);return a;}};},automatic);
}
async function configure(p){await p.evaluate(()=>{const play=PixelDodge.RewardedAds.prototype.play;PixelDodge.RewardedAds.prototype.play=function(...args){this.config={...this.config,rewardedVideoAdUnitId:'isolated-test-only'};window.testAdService=this;return play.apply(this,args);};});}
module.exports={install,configure};
