(function(P){
'use strict';
class AchievementsView{
 constructor(grid,progress,random=Math.random){this.grid=grid;this.progress=progress;this.random=random;this.hues=new Map();}
 render(){
  this.progress.syncPurchases();const fragment=document.createDocumentFragment();
  for(const item of P.achievementCatalog){
   const count=this.progress.count(item.id),card=document.createElement('li');card.className='achievement-card';card.dataset.achievement=item.id;card.dataset.complete=String(count>0);
   const title=document.createElement('h2');title.textContent=item.name;const condition=document.createElement('p');condition.textContent=item.condition;card.append(title,condition);
   if(item.repeat){const times=document.createElement('strong');times.className='achievement-count';times.textContent='×'+count;times.setAttribute('aria-label','完成'+count+'次');card.append(times);}
   card.setAttribute('aria-label',item.name+'，'+item.condition+'，'+(count?'已完成':'未完成'));
   if(count){const previous=this.hues.get(item.id),raw=Math.floor(this.random()*360),hue=previous===undefined?raw:(previous+30+Math.floor(this.random()*300))%360;this.hues.set(item.id,hue);card.style.backgroundColor='hsl('+hue+' 72% 87%)';}
   fragment.append(card);
  }
  this.grid.replaceChildren(fragment);
 }
}
P.AchievementsView=AchievementsView;
})(globalThis.PixelDodge);
