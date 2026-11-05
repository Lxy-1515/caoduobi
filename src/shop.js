(function(P){
'use strict';
class Shop {
  constructor({grid,store,audio,ads,onChange,toast}){Object.assign(this,{grid,store,audio,ads,onChange,toast});this.adPending=false;this.group=null;}
  render(group){
    this.group=group;const scroll=this.grid.scrollTop;this.grid.replaceChildren();
    if(group==='collision'){
      const items=P.shopSounds.length?P.shopSounds:Array.from({length:3},(_,i)=>({id:'pending-'+i,name:'音效 '+(i+1),price:null,sample:null}));
      for(const item of items)this.sound(item);
    }else if(group==='music'){for(const item of P.shopMusic)this.music(item);}
    else for(const skin of P.skins[group]||[])this.skin(group,skin);
    this.grid.scrollTop=scroll;
  }
  card(name){const card=document.createElement('article');card.className='skin-card';const title=document.createElement('h2');title.textContent=name;card.append(title);this.grid.append(card);return card;}
  button(card,label,action){const button=document.createElement('button');button.className='secondary';button.textContent=label;button.addEventListener('click',action);card.append(button);return button;}
  changed(group){this.onChange();this.render(group);document.getElementById('tab-'+group).focus({preventScroll:true});}
  skin(group,skin){
    const owned=this.store.data.owned[group].includes(skin.id),equipped=this.store.data.equipped[group]===skin.id,card=this.card(skin.name);card.classList.toggle('is-equipped',equipped);
    const preview=document.createElement('div');preview.className='skin-preview';const canvas=document.createElement('canvas');canvas.width=220;canvas.height=160;canvas.setAttribute('aria-label',skin.name+'外观预览');preview.append(canvas);card.append(preview);P.Renderer.preview(canvas,group,skin);
    const button=this.button(card,owned?'装备':skin.price+'积分购买',()=>{
      if(owned)this.store.equip(group,skin.id);else{const result=this.store.purchase(group,skin.id);if(!result.ok){this.toast(result.reason);return;}}
      this.changed(group);
    });button.dataset.skin=skin.id;button.disabled=equipped||(!owned&&this.store.data.wallet<skin.price);button.setAttribute('aria-pressed',String(equipped));
  }
  async unlockAd(group,item,button){
    if(this.adPending||this.ads?.busy)return;
    this.adPending=true;button.disabled=true;button.textContent='广告加载中…';this.audio.stopPreview();
    try{
      const result=await this.ads.unlock(group,item.id);
      if(result.ok){this.onChange();this.toast('已获得'+item.name);}else this.toast(result.reason);
    }catch{this.toast('广告暂时无法播放，请稍后重试');}
    finally{
      this.adPending=false;
      // Navigation may have changed the category while the platform was loading.
      if(this.grid.isConnected)this.render(this.group);
    }
  }
  sound(item){
    const available=P.soundAvailable(item),owned=this.store.ownsSound(item.id),card=this.card(item.name);card.classList.add('sound-card');
    const preview=this.button(card,'',()=>this.audio.previewSound(item.id));preview.className='sound-audition';preview.setAttribute('aria-label','试听'+item.name);preview.innerHTML='<svg><use href="#i-sound"/></svg>';preview.disabled=!item.sample||!P.audioAssets?.[item.sample];
    if(!owned){const ad=item.acquisition==='rewardedAd',buy=this.button(card,ad?'看1个广告获取':available?item.price+'积分购买':item.sample&&P.audioAssets?.[item.sample]?'待定价':'待上传',()=>{if(ad){this.unlockAd('collision',item,buy);return;}const result=this.store.purchaseSound(item.id);if(result.ok)this.changed('collision');else this.toast(result.reason);});buy.dataset.sound=item.id;buy.disabled=!available||(ad?this.adPending||this.ads?.busy:this.store.data.wallet<item.price);}
    else{
      const actions=document.createElement('div');actions.className='sound-equip-actions';card.append(actions);
      for(const [kind,label]of [['collect','装备拾取音'],['ghost','装备消除音']]){
        const selected=this.store.equippedSound(kind)===item.id,button=this.button(actions,label,()=>{if(this.store.equipSound(kind,item.id))this.changed('collision');});button.dataset.soundSlot=kind;button.dataset.sound=item.id;button.disabled=selected||!available;button.setAttribute('aria-pressed',String(selected));
      }
    }
  }
  music(item){
    const available=P.soundAvailable(item),owned=this.store.ownsMusic(item.id),selected=this.store.equippedMusic()===item.id,card=this.card(item.name);card.classList.add('sound-card','music-card');card.classList.toggle('is-equipped',selected);
    const preview=this.button(card,'',()=>this.audio.previewMusic(item.id));preview.className='sound-audition';preview.setAttribute('aria-label','试听'+item.name);preview.innerHTML='<svg><use href="#i-sound"/></svg>';preview.disabled=!available;
    const ad=item.acquisition==='rewardedAd',button=this.button(card,owned?'装备':ad?'看1个广告获取':item.price+'积分购买',()=>{if(!owned&&ad){this.unlockAd('music',item,button);return;}if(owned){if(this.store.equipMusic(item.id))this.changed('music');}else{const result=this.store.purchaseMusic(item.id);if(result.ok)this.changed('music');else this.toast(result.reason);}});button.dataset.music=item.id;button.disabled=!available||selected||(!owned&&(ad?this.adPending||this.ads?.busy:this.store.data.wallet<item.price));button.setAttribute('aria-pressed',String(selected));
  }

}
P.Shop=Shop;
})(globalThis.PixelDodge);
