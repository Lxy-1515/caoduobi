(function(P) {
  'use strict';
  const EFFECT_LEVEL=.65;
  class Audio {
    constructor(storage) {
      this.storage=storage;this.settings={music:true,sound:true};this.active=true;
      this.buffers={};this.voices=new Set();this.musicSource=null;this.musicOffset=0;this.loadErrors=[];
      this.ready=Promise.resolve();
      this.clickVoices=new Set();this.clickEpoch=0;this.previewEpoch=0;this.soundEquipment={};this.musicKey='music';this.musicPreview=null;
      try {const saved=JSON.parse(storage.getItem('pixel-dodge.audio.v1'));for(const key of ['music','sound'])if(typeof saved?.[key]==='boolean')this.settings[key]=saved[key];} catch {}
    }
    unlock() {
      try {
        if(!this.ctx) {
          this.ctx=new (window.AudioContext||window.webkitAudioContext)();
          this.ctx.onstatechange=()=>this.tick();
          this.master=this.ctx.createDynamicsCompressor();
          this.master.threshold.value=-5;this.master.knee.value=4;this.master.ratio.value=12;this.master.attack.value=.002;this.master.release.value=.08;
          this.master.connect(this.ctx.destination);
          this.musicGain=this.ctx.createGain();this.musicGain.connect(this.master);
          this.soundGain=this.ctx.createGain();this.soundGain.connect(this.master);
          this.uiGain=this.ctx.createGain();this.uiGain.connect(this.master);
          this.musicGain.gain.value=this.soundGain.gain.value=this.uiGain.gain.value=0;
          this.ready=Promise.all(Object.entries(P.audioAssets||{}).filter(([key])=>key!=='click').map(async([key,base64])=>{
            try {
              const raw=atob(base64),bytes=new Uint8Array(raw.length);
              for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
              this.buffers[key]=await this.ctx.decodeAudioData(bytes.buffer);
              if(key===this.musicKey)this.tick();
            } catch {this.loadErrors.push(key);}
          }));
        }
        if(this.active&&this.ctx.state==='suspended')this.ctx.resume().then(()=>this.tick()).catch(()=>{});
        this.sync();
      } catch {}
    }
    sync() {
      if(!this.ctx)return;
      const t=this.ctx.currentTime;
      this.musicGain.gain.setTargetAtTime(this.settings.music&&this.active&&!this.musicPreview ? .30 : 0,t,.025);
      // Gates apply to new events; already-started effects retain their full tail.
      this.soundGain.gain.setTargetAtTime(.60,t,.012);
      this.uiGain.gain.setTargetAtTime(.12,t,.012);
      if(!this.settings.music||!this.active)this.stopMusic();
      if(!this.settings.sound)this.clearClicks();
      this.tick();
    }
    toggle(key) {
      this.settings[key]=!this.settings[key];if(!this.settings[key]){if(key==='music')this.stopPreview();else this.previewEpoch++;}
      try {this.storage.setItem('pixel-dodge.audio.v1',JSON.stringify(this.settings));} catch {}
      this.unlock();
    }
    tone(frequency,time,length,gain,bus,type='sine') {
      const osc=this.ctx.createOscillator(),env=this.ctx.createGain();osc.type=type;osc.frequency.value=frequency;
      env.gain.setValueAtTime(0,time);env.gain.linearRampToValueAtTime(gain,time+.02);env.gain.exponentialRampToValueAtTime(.0001,time+length);
      osc.connect(env);env.connect(bus);const voice={source:osc,gain:env,name:'tone'};this.voices.add(voice);
      osc.onended=()=>{this.voices.delete(voice);osc.disconnect();env.disconnect();this.suspendWhenIdle();};osc.start(time);osc.stop(time+length+.05);
    }
    setMusicEquipment(id){
      const key=P.shopMusic?.find(item=>item.id===id)?.sample||'music';if(key===this.musicKey)return;
      this.stopPreview();this.stopMusic();this.musicKey=key;this.musicOffset=0;this.tick();
    }
    stopMusicPreview(){
      const source=this.musicPreview;if(!source)return;this.musicPreview=null;
      try{source.stop();}catch{}this.sync();
    }
    previewMusic(id){
      const item=P.shopMusic?.find(s=>s.id===id);if(!item||!P.audioAssets?.[item.sample]||!this.settings.music||!this.active)return Promise.resolve(null);
      this.stopPreview();this.unlock();const epoch=this.previewEpoch;
      return this.ready.then(()=>{
        if(epoch!==this.previewEpoch||!this.active||!this.settings.music||this.ctx.state!=='running'||!this.buffers[item.sample])return null;
        const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.buffers[item.sample];source.connect(gain);gain.gain.value=.30;gain.connect(this.master);
        this.musicPreview=source;source.onended=()=>{source.disconnect();gain.disconnect();if(this.musicPreview===source){this.musicPreview=null;this.sync();}};this.sync();source.start();return source;
      }).catch(()=>null);
    }
    setSoundEquipment(equipment){this.soundEquipment={...(equipment||{})};}
    soundKey(name){const item=P.shopSounds?.find(s=>s.id===this.soundEquipment[name]);return item&&this.buffers[item.sample]?item.sample:name;}
    // Navigation cancels only requests that have not started decoding/playback.
    stopPreview(){this.previewEpoch++;this.stopMusicPreview();}
    previewSound(id){
      const item=P.shopSounds?.find(s=>s.id===id);if(!item?.sample||!P.audioAssets?.[item.sample]||!this.settings.sound||!this.active)return Promise.resolve(null);
      this.stopPreview();this.unlock();const epoch=this.previewEpoch;
      return this.ready.then(()=>epoch===this.previewEpoch&&this.active&&this.settings.sound?this.playSample('preview',EFFECT_LEVEL,item.sample):null).catch(()=>null);
    }
    playSample(name,level,key=this.soundKey(name)) {
      const buffer=this.buffers[key];
      if(!buffer||!this.settings.sound||!this.active||this.ctx.state!=='running')return null;
      const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),t=this.ctx.currentTime;
      source.buffer=buffer;source.connect(gain);gain.connect(this.soundGain);
      gain.gain.setValueAtTime(level,t);
      const voice={source,gain,name};this.voices.add(voice);
      source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect();this.suspendWhenIdle();};
      source.start(t);return source;
    }
    suspendWhenIdle() {
      // Pause music immediately, but let effects use this clock until they end.
      if(!this.active&&!this.voices.size&&this.ctx?.state==='running')this.ctx.suspend().catch(()=>{});
    }
    playClick() {
      if(!this.settings.sound)return Promise.resolve(null);
      const epoch=this.clickEpoch,requested=Date.now();
      try {
        // UI audio has its own clock: pause-menu clicks must not advance music.
        if(!this.clickCtx){
          this.clickCtx=new (window.AudioContext||window.webkitAudioContext)();
          this.clickGain=this.clickCtx.createGain();this.clickGain.gain.value=.55;this.clickGain.connect(this.clickCtx.destination);
          const raw=atob(P.audioAssets.click),bytes=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
          this.clickReady=this.clickCtx.decodeAudioData(bytes.buffer).then(buffer=>this.clickBuffer=buffer);
        }
        const resume=this.clickCtx.state==='suspended'?this.clickCtx.resume():Promise.resolve();
        return Promise.all([this.clickReady,resume]).then(()=>{
          if(!this.settings.sound||epoch!==this.clickEpoch||Date.now()-requested>500||this.clickCtx.state!=='running')return null;
          const source=this.clickCtx.createBufferSource();source.buffer=this.clickBuffer;source.connect(this.clickGain);
          this.clickVoices.add(source);source.onended=()=>{this.clickVoices.delete(source);source.disconnect();if(!this.clickVoices.size)this.clickCtx.suspend().catch(()=>{});};source.start();return source;
        }).catch(()=>null);
      }catch{return Promise.resolve(null);}
    }
    clearClicks() {
      this.clickEpoch++;
      if(!this.clickVoices.size)this.clickCtx?.suspend().catch(()=>{});
    }
    countGhost() {
      // Result digits are discrete visible events, not gameplay bursts. Reuse
      // the selected sample without merging two separate digits or truncating tails.
      this.unlock();if(!this.ctx)return null;return this.playSample('ghost',EFFECT_LEVEL);
    }
    effect(kind='click',{merge=true}={}) {
      if(kind==='click')return this.playClick();
      this.unlock();if(!this.ctx||!this.settings.sound||!this.active)return;
      const t=this.ctx.currentTime;
      if(kind==='end')return this.playSample('end',.75);
      if(kind==='ghost'||kind==='collect') {
        const field=kind==='ghost'?'lastGhostSound':'lastCollectSound',gap=kind==='ghost'?.07:.035;
        if(merge&&t-(this[field]??-Infinity)<gap)return;
        const source=this.playSample(kind,EFFECT_LEVEL);
        if(source)this[field]=t;
        return;
      }
      const notes=[261.63,392,523.25];
      notes.forEach((f,i)=>this.tone(f,t+i*.045,.25,.4,this.uiGain,'triangle'));
    }
    get musicPosition() {
      const duration=this.buffers[this.musicKey]?.duration;
      return duration?(this.musicOffset+(this.musicSource?this.ctx.currentTime-this.musicStartedAt:0))%duration:0;
    }
    get needsGesture() {
      return !!(this.active&&this.settings.music&&this.buffers[this.musicKey]&&this.ctx?.state==='suspended');
    }
    stopMusic() {
      if(!this.musicSource)return;
      this.musicOffset=this.musicPosition;
      const source=this.musicSource;this.musicSource=null;
      try {source.stop();} catch {}
    }
    tick() {
      if(!this.ctx||this.ctx.state!=='running'||!this.active||!this.settings.music||this.musicSource||!this.buffers[this.musicKey])return;
      const source=this.ctx.createBufferSource();source.buffer=this.buffers[this.musicKey];source.loop=true;source.loopStart=0;source.loopEnd=source.buffer.duration;
      source.connect(this.musicGain);this.musicSource=source;this.musicStartedAt=this.ctx.currentTime;
      source.onended=()=>{source.disconnect();if(this.musicSource===source)this.musicSource=null;};
      source.start(0,this.musicOffset);
    }
    setActive(active) {
      this.active=active;if(!active)this.stopPreview();this.sync();
      if(!active)this.suspendWhenIdle();
      else if(this.ctx)this.ctx.resume().then(()=>this.tick()).catch(()=>{});
    }
  }
  P.Audio=Audio;
})(globalThis.PixelDodge);
