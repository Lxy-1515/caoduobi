(function (P) {
  'use strict';
  const KEY = 'pixel-dodge.save.v1';
  const fresh = () => ({ version: 1, wallet: 0, best: 0, runs: 0, owned: { player: ['mint'], hazard: ['ember'] }, equipped: { player: 'mint', hazard: 'ember' }, settled: [] });
  function valid(d) {
    if (!d || d.version !== 1 || !Number.isSafeInteger(d.wallet) || d.wallet < 0 || d.wallet > 1e9 || !Number.isFinite(d.best) || d.best < 0 || d.best > 1e8 || !Number.isSafeInteger(d.runs) || d.runs < 0) return false;
    if (!Array.isArray(d.settled) || d.settled.length > 32 || !d.settled.every(x => typeof x === 'string' && x.length <= 120)) return false;
    if(d.soundOwned!==undefined&&(!Array.isArray(d.soundOwned)||!d.soundOwned.every(id=>typeof id==='string'&&id.length>0&&id.length<=120)))return false;
    if(d.soundEquipped!==undefined&&(!d.soundEquipped||typeof d.soundEquipped!=='object'||Array.isArray(d.soundEquipped)||!['collect','ghost'].every(kind=>d.soundEquipped[kind]==null||(d.soundOwned?.includes(d.soundEquipped[kind])||P.shopSounds.some(s=>s.default&&s.id===d.soundEquipped[kind])))))return false;
    if(d.musicOwned!==undefined&&(!Array.isArray(d.musicOwned)||!d.musicOwned.every(id=>typeof id==='string'&&id.length>0&&id.length<=120)))return false;
    if(d.musicEquipped!=null&&(typeof d.musicEquipped!=='string'||!(d.musicOwned?.includes(d.musicEquipped)||P.shopMusic?.some(s=>s.default&&s.id===d.musicEquipped))))return false;
    return ['player', 'hazard'].every(group => Array.isArray(d.owned?.[group]) && d.owned[group].includes(P.skins[group][0].id) && d.owned[group].every(id => P.skins[group].some(s => s.id === id)) && d.owned[group].includes(d.equipped?.[group]));
  }
  class Store {
    constructor(storage) {
      this.storage = storage; this.data = fresh(); this.status = 'ok';
      try {
        const raw = storage.getItem(KEY);
        if (raw !== null) {
          try { const d = JSON.parse(raw); if (!valid(d)) throw Error('invalid'); this.data = d; }
          catch { this.status = 'corrupt'; }
        }
      } catch { this.status = 'volatile'; }
    }
    persist() {
      if (this.status === 'corrupt') return false;
      try { this.storage.setItem(KEY, JSON.stringify(this.data)); this.status = 'ok'; return true; }
      catch { this.status = 'volatile'; return false; }
    }
    settle(result) {
      if (!result || this.data.settled.includes(result.id)) return null;
      if (typeof result.id !== 'string' || !Number.isFinite(result.time) || result.time < 0 || !Number.isSafeInteger(result.coins) || result.coins < 0) return null;
      const racing=result.gameMode==='race';
      if(racing&&(!Number.isSafeInteger(result.completedRounds)||result.completedRounds<0))return null;
      if(racing&&result.clearedOrbs!==undefined&&(!Number.isSafeInteger(result.clearedOrbs)||result.clearedOrbs<0))return null;
      const survival=['twin','trial'].includes(result.gameMode);
      const coins=racing?result.completedRounds*P.config.race.roundReward:result.gameMode==='twin'?0:result.coins;
      if(!Number.isSafeInteger(coins))return null;
      const bonus = racing?0:Math.floor((result.time+(survival?1e-9:0)) / (result.gameMode==='twin'?P.config.twin.rewardSeconds:result.gameMode==='trial'?P.config.trial.rewardSeconds:5)), reward = coins + bonus;
      const hasGrass=Number.isSafeInteger(result.grass)&&result.grass>=0,mode=P.modeNames[result.gameMode]?result.gameMode:'classic';
      const oldGrass=this.data.grassBest&&typeof this.data.grassBest==='object'?this.data.grassBest:{};
      const previous=Number.isSafeInteger(oldGrass[mode])&&oldGrass[mode]>=0?oldGrass[mode]:0;
      // Old raceBest stored collected coins; keep it intact and track rounds separately.
      const raceRoundBest=Number.isSafeInteger(this.data.raceRoundBest)&&this.data.raceRoundBest>=0?this.data.raceRoundBest:0;
      const oldSurvival=this.data.survivalBest&&typeof this.data.survivalBest==='object'?this.data.survivalBest:{};
      const survivalPrevious=Number.isFinite(oldSurvival[mode])&&oldSurvival[mode]>=0?oldSurvival[mode]:0;
      const raceClearBest=Number.isSafeInteger(this.data.raceClearBest)&&this.data.raceClearBest>=0?this.data.raceClearBest:0;
      const record = racing?(result.clearedOrbs!==undefined?result.clearedOrbs>raceClearBest:result.completedRounds>raceRoundBest):survival?result.time>survivalPrevious:hasGrass ? result.grass>previous : result.time > this.data.best;
      if(racing){this.data.raceRoundBest=Math.max(raceRoundBest,result.completedRounds);if(result.clearedOrbs!==undefined)this.data.raceClearBest=Math.max(raceClearBest,result.clearedOrbs);}
      else if(survival)this.data.survivalBest={...oldSurvival,[mode]:Math.max(survivalPrevious,result.time)};
      else if(hasGrass)this.data.grassBest={...oldGrass,[mode]:Math.max(previous,result.grass)};
      this.data.wallet = Math.min(1e9, this.data.wallet + reward);
      if(!racing&&!survival)this.data.best = Math.max(this.data.best, result.time); this.data.runs++;
      this.data.settled = [...this.data.settled.slice(-31), result.id];
      this.persist(); return { coins, bonus, reward, record, time: result.time };
    }
    purchase(group, id) {
      const skin = P.skins[group]?.find(s => s.id === id);
      if (!skin) return { ok: false, reason: '外观不存在' };
      if (this.data.owned[group].includes(id)) return { ok: true, owned: true };
      if (this.data.wallet < skin.price) return { ok: false, reason: `还差 ${skin.price - this.data.wallet} 积分` };
      this.data.wallet -= skin.price; this.data.owned[group].push(id); this.data.equipped[group] = id; this.persist();
      return { ok: true, owned: false };
    }
    equip(group, id) {
      if (!this.data.owned[group]?.includes(id)) return false;
      this.data.equipped[group] = id; this.persist(); return true;
    }
    ownsSound(id){return !!(P.shopSounds.some(s=>s.id===id&&s.default)||this.data.soundOwned?.includes(id));}
    equippedSound(kind){const id=this.data.soundEquipped?.[kind];return P.shopSounds.some(s=>s.id===id)&&this.ownsSound(id)?id:kind==='collect'?'default-collect':'default-ghost';}
    ownsMusic(id){return !!(P.shopMusic?.some(s=>s.id===id&&s.default)||this.data.musicOwned?.includes(id));}
    equippedMusic(){const id=this.data.musicEquipped;return P.shopMusic?.some(s=>s.id===id)&&this.ownsMusic(id)?id:'default-music';}
    purchaseMusic(id){
      const item=P.shopMusic?.find(s=>s.id===id);if(!P.soundAvailable(item))return{ok:false,reason:'音乐尚未上架'};
      if(this.ownsMusic(id))return{ok:true,owned:true};
      if(item.acquisition==='rewardedAd')return{ok:false,reason:'请完整观看1个广告获取'};
      if(this.data.wallet<item.price)return{ok:false,reason:`还差 ${item.price-this.data.wallet} 积分`};
      this.data.wallet-=item.price;this.data.musicOwned=[...(this.data.musicOwned||[]),id];this.persist();return{ok:true,owned:false};
    }
    equipMusic(id){
      if(!this.ownsMusic(id)||!P.soundAvailable(P.shopMusic?.find(s=>s.id===id)))return false;
      this.data.musicEquipped=id;this.persist();return true;
    }
    purchaseSound(id){
      const item=P.shopSounds.find(s=>s.id===id);
      if(!P.soundAvailable(item))return{ok:false,reason:'音效尚未上架'};
      if(this.ownsSound(id))return{ok:true,owned:true};
      if(item.acquisition==='rewardedAd')return{ok:false,reason:'请完整观看1个广告获取'};
      if(this.data.wallet<item.price)return{ok:false,reason:`还差 ${item.price-this.data.wallet} 积分`};
      this.data.wallet-=item.price;this.data.soundOwned=[...(this.data.soundOwned||[]),id];this.persist();return{ok:true,owned:false};
    }
    grantAdItem(group,id){
      const item=(group==='music'?P.shopMusic:group==='collision'?P.shopSounds:[])?.find(s=>s.id===id);
      if(!P.soundAvailable(item)||item.acquisition!=='rewardedAd')return{ok:false,reason:'商品无法通过广告获取'};
      const owned=group==='music'?this.ownsMusic(id):this.ownsSound(id);
      if(owned)return{ok:true,owned:true};
      const field=group==='music'?'musicOwned':'soundOwned';this.data[field]=[...(this.data[field]||[]),id];this.persist();return{ok:true,owned:false};
    }
    equipSound(kind,id){
      if(!['collect','ghost'].includes(kind)||!this.ownsSound(id)||!P.soundAvailable(P.shopSounds.find(s=>s.id===id)))return false;
      this.data.soundEquipped={...this.data.soundEquipped,[kind]:id};this.persist();return true;
    }
    reset() { this.data = fresh(); this.status = 'ok'; return this.persist(); }
  }
  P.Store = Store;
})(globalThis.PixelDodge);
