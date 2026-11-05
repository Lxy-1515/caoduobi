(function(P){
'use strict';
const catalog=Object.freeze([
 {id:'lucky',name:'草！好运！',condition:'与死亡擦肩而过',repeat:true},
 {id:'ten-shields',name:'真有你的！',condition:'困难模式拿到十个护盾',repeat:true},
 {id:'survivor',name:'有两下子！',condition:'生存模式存活60s',repeat:true},
 {id:'monochrome',name:'眼睛坏了？',condition:'进入黑白世界'},
 {id:'collector',name:'我钱多！',condition:'购买商城所有物品'},
 {id:'thousand-grass',name:'超越测试者',condition:'经典模式达到一千草！值',repeat:true},
 {id:'early-end',name:'上炕都费劲',condition:'开局就结束',repeat:true},
 {id:'steel',name:'耳机党已碎',condition:'购买钢管音效'},
 {id:'trial-minute',name:'王德发你真牛',condition:'无尽试炼存活60s',repeat:true}
].map(Object.freeze));
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
class AchievementProgress{
 constructor(store,{onAward=()=>{}}={}){this.store=store;this.onAward=onAward;this.runId=null;this.runAwards=new Set();this.nearMisses=0;}
 count(id){return count(this.store.data.achievements?.[id]);}
 award(id,amount=1){
  const def=catalog.find(a=>a.id===id);if(!def||!Number.isSafeInteger(amount)||amount<1)return false;
  const old=this.count(id),next=def.repeat?Math.min(Number.MAX_SAFE_INTEGER,old+amount):1;if(next===old)return false;
  const values=Object.fromEntries(catalog.map(a=>[a.id,this.count(a.id)]));values[id]=next;
  this.store.data.achievements=values;this.store.persist();
  this.onAward(def,next-old);
  return true;
 }
 once(id){if(this.runAwards.has(id))return;this.runAwards.add(id);this.award(id);}
 begin(engine){
  if(engine.attract||!engine.id)return;
  this.runId=engine.id;this.runAwards.clear();this.nearMisses=0;
  if(engine.gameMode==='monochrome')this.award('monochrome');
 }
 observe(engine,{deferEnd=false}={}){
  if(engine.attract||!engine.id)return;
  if(this.runId!==engine.id)this.begin(engine);
  const stats=engine.achievementStats||{},near=count(stats.nearMisses);
  const survived=engine.state!=='ended'||!['collision','trail'].includes(engine.result?.reason);
  if(survived&&near>this.nearMisses)this.award('lucky',near-this.nearMisses);this.nearMisses=near;
  if(engine.gameMode==='hard'&&Math.max(engine.shieldStock,stats.maxShieldStock||0)>=10)this.once('ten-shields');
  if(['twin','trial'].includes(engine.gameMode)&&engine.time+1e-9>=60)this.once('survivor');
  if(engine.gameMode==='trial'&&engine.time+1e-9>=60)this.once('trial-minute');
  if(engine.gameMode==='classic'&&engine.grass>=1000)this.once('thousand-grass');
  const r=engine.result;if(!r||r.reason==='quit'||deferEnd)return;
  const early=['classic','hard','monochrome'].includes(r.gameMode)?r.grass<2:r.gameMode==='race'?r.completedRounds<1:r.gameMode==='twin'?r.time<=10+1e-9:r.gameMode==='trial'&&r.time<=3+1e-9;
  if(early)this.once('early-end');
 }
 syncPurchases(){
  const store=this.store;
  if(store.ownsSound('shop-sound-5'))this.award('steel');
  const skins=Object.entries(P.skins).every(([group,items])=>items.every(item=>store.data.owned[group]?.includes(item.id)));
  const sounds=P.shopSounds.filter(P.soundAvailable).every(item=>store.ownsSound(item.id));
  const music=P.shopMusic.filter(P.soundAvailable).every(item=>store.ownsMusic(item.id));
  if(skins&&sounds&&music)this.award('collector');
 }
}
P.achievementCatalog=catalog;P.AchievementProgress=AchievementProgress;
})(globalThis.PixelDodge);
