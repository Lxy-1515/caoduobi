(function(P){
'use strict';
const fail=(code,message)=>Object.assign(new Error(message||code),{code});
class RewardedAds{
 constructor({store,host=globalThis,config=P.platformConfig,onActivity=()=>{}}){Object.assign(this,{store,host,config,onActivity});this.busy=false;}
 async unlock(group,id){
  const item=(group==='music'?P.shopMusic:group==='collision'?P.shopSounds:[])?.find(s=>s.id===id);
  if(!P.soundAvailable(item)||item.acquisition!=='rewardedAd')return{ok:false,reason:'商品无法通过广告获取'};
  if(group==='music'?this.store.ownsMusic(id):this.store.ownsSound(id))return{ok:true,owned:true};
  const result=await this.play();return result.ok?this.store.grantAdItem(group,id):result;
 }
 async play(){
  if(this.busy)return{ok:false,reason:'请先完成当前广告'};
  if(typeof this.host.tap?.createRewardedVideoAd!=='function')return{ok:false,reason:'请在 TapTap 游戏中观看广告获取'};
  const adUnitId=this.config?.rewardedVideoAdUnitId?.trim();
  if(!adUnitId)return{ok:false,reason:'广告暂未开放，请稍后再试'};
  this.busy=true;this.onActivity(true);
  try{
   const completed=await this.watch(adUnitId);
   return completed?{ok:true}:{ok:false,reason:'请完整观看广告后再获取奖励'};
  }catch(e){return{ok:false,reason:String(e.code)==='timeout'?'广告响应超时，请稍后重试':'广告暂时无法播放，请稍后重试'};}
  finally{this.busy=false;this.onActivity(false);}
 }
 watch(adUnitId){
  return new Promise((resolve,reject)=>{
   let ad,finished=false,showStarted=false,timer;
   const cleanup=()=>{this.host.clearTimeout(timer);try{ad?.offClose?.(onClose);ad?.offError?.(onError);ad?.destroy?.();}catch{}};
   const done=(value,error)=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve(value);};
   const onClose=res=>{if(showStarted)done(res?.isEnded===true);};
   const onError=e=>done(false,fail(e?.errCode||'ad',e?.errMsg));
   const arm=ms=>{this.host.clearTimeout(timer);timer=this.host.setTimeout(()=>done(false,fail('timeout')),ms);};
   try{
    // A separate instance isolates late callbacks from a prior product's watch.
    ad=this.host.tap.createRewardedVideoAd({adUnitId,multiton:true});
    if(!ad||!['onClose','onError','load','show'].every(k=>typeof ad[k]==='function'))throw fail('unsupported');
    ad.onClose(onClose);ad.onError(onError);arm(15000);
    Promise.resolve(ad.load()).then(()=>{
     if(finished)return;showStarted=true;return Promise.resolve(ad.show()).then(()=>{if(!finished)arm(180000);});
    }).catch(e=>done(false,e));
   }catch(e){done(false,e);}
  });
 }
}
P.RewardedAds=RewardedAds;
})(globalThis.PixelDodge);
