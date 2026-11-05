(function(P) {
'use strict';
const $=id=>document.getElementById(id);
let storage;
try{storage=window.localStorage;}catch{storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};}
const store=new P.Store(storage),engine=new P.Engine(),background=new P.Engine();
const gameRenderer=new P.Renderer($('game')),backgroundRenderer=new P.Renderer($('game'));
let renderer=backgroundRenderer,backgroundStarted=false;
const audio=new P.Audio(storage),transition=new P.Transition();
const rewardedAds=new P.RewardedAds({store,onActivity:()=>syncAudioActivity()});
const modePreviews=new P.ModePreview($('mode-screen'));
const achievements=new P.AchievementProgress(store),achievementsView=new P.AchievementsView(document.querySelector('.achievement-grid'),achievements);
achievements.syncPurchases();
const leaderboards=new P.Leaderboards(),rankingView=new P.RankingView($('ranking-dialog'),leaderboards);
const title=new P.Title(document.querySelector('.wordmark'),document.querySelector('.title-disc'),document.querySelector('.title-caption'));
const homeMask=new P.HomeMask($('game'),title);backgroundRenderer.homeMask=homeMask;
const landscape=new P.MobileLandscape($('orientation-dialog'),$('orientation-enter'),$('orientation-skip'));
let starting=false;
const pauseDialog=$('pause-dialog'),resultDialog=$('result-dialog'),reviveDialog=$('revive-dialog'),guideDialog=$('guide-dialog'),settingsDialog=$('settings-dialog'),controlDialog=$('control-dialog');
const resultView=new P.ResultPresentation({dialog:resultDialog,total:$('result-total'),score:$('result-time'),title:$('result-title'),onTick:()=>audio.effect('collect',{merge:false}),onScoreTick:()=>audio.countGhost(),onOpen:()=>placeToast(),reduced:gameRenderer.reduced});
let mode='menu',shopFrom='menu',group='player',lastResult=null,shownResult=null,settingsFrom='menu',reviveOffer=null,reviveLoading=false,soundedResult=null;
let accumulator=0,lastTime=performance.now(),hudClock=0,toastTimer=0,toastAnimation=null,focused=true;
const controls=new P.TouchControls({canvas:$('game'),joystick:$('touch-joystick'),thumb:$('joystick-thumb'),engine,renderer:gameRenderer,storage,enabled:()=>mode==='play'&&engine.state==='running'&&!transition.running,onCancel:()=>pause()});
const format=P.formatSeconds;
function syncAudioActivity(){audio.setActive(focused&&!document.hidden&&!rewardedAds.busy&&mode!=='exit'&&!(mode==='play'&&(engine.state==='paused'||reviveOffer)));}
function placeToast(parent=document.querySelector('dialog[open]')||document.body){const el=$('toast');if(el.parentNode!==parent)parent.append(el);const notices=$('achievement-notices');if(notices.parentNode!==parent)parent.append(notices);return el;}
function showAchievement(name){
  if(mode==='exit')return;
  const el=document.createElement('div');el.className='achievement-notice';el.textContent=name;placeToast();$('achievement-notices').append(el);
  const still=gameRenderer.reduced,animation=el.animate([{opacity:0,transform:still?'none':'translateY(8px)'},{opacity:1,transform:'none',offset:.1},{opacity:1,transform:'none',offset:.8},{opacity:0,transform:still?'none':'translateY(-16px)'}],{duration:2600,easing:'ease-out'});animation.onfinish=()=>el.remove();
}
achievements.onAward=def=>showAchievement(def.name);
function toast(message,duration=2600,control=false){
  const el=placeToast();el.classList.toggle('control-toast',control);
  el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,duration);
  toastAnimation?.cancel();
  toastAnimation=el.animate?.([{opacity:0,transform:'translate(-50%,8px)'},{opacity:1,transform:'translate(-50%,0)'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:180,easing:'ease-out'})||null;
}
function layoutTitle(){
  const rect=$('game').getBoundingClientRect();
  if(title.resize(rect.width,rect.height,backgroundRenderer.viewScale))backgroundRenderer.titleClip=title.trailClip;
  backgroundRenderer.textRectsDirty=true;
}
function clearNavigationObstacles(){
  for(const [world,view]of [[engine,gameRenderer],[background,backgroundRenderer]]){
    world.hazards=[];world.events=[];world.clearWaves=[];world.hazardClock=P.config.generation.firstHazard;
    view.obstacleGhosts=[];view.ghostShards=[];view.ghostSamples=new WeakMap();view.ghostPlayerPrevious=null;view.particles=[];view.rings=[];view.freezeWaves=[];
  }
}
function syncSave(){
  $('shop-wallet').textContent=store.data.wallet.toLocaleString();audio.setSoundEquipment(store.data.soundEquipped);audio.setMusicEquipment(store.equippedMusic());
  for(const id of P.rankingMetric.modes)$(id+'-best').textContent=P.rankingMetric.recordLabel(id)+' '+P.rankingMetric.display(id,P.rankingMetric.recordOf(store.data,id));
  const warning=$('save-warning');warning.hidden=store.status==='ok';$('reset-save').hidden=store.status!=='corrupt';
  warning.querySelector('span').textContent=store.status==='corrupt'?'原存档异常，已保留原数据；当前进度仅临时有效。':'浏览器无法保存进度；当前进度仅临时有效。';
}
function syncEffects(){
  for(const name of Object.keys(engine.effects)){
    const el=$('effect-'+name),value=engine.effects[name];
    const color=engine.gameMode==='monochrome'?'#111111':P.items[name].color;
    if(el.dataset.color!==color){el.dataset.color=color;el.style.color=color;P.Renderer.icon(el.querySelector('canvas'),name,color);}
    el.hidden=value<=0||mode!=='play'||engine.state==='ended';
    el.querySelector('.effect-fill').style.transform='scaleX('+Math.max(0,Math.min(1,value/P.config.durations[name]))+')';
    el.setAttribute('aria-valuenow',value.toFixed(2));
  }
}
function syncHud(){
  const racing=engine.gameMode==='race',survival=['twin','trial'].includes(engine.gameMode);
  $('hud-label').textContent=racing?'竞速模式-剩余时间':P.modeNames[engine.gameMode]+(survival?'-存活时间':'-草！值');$('hud-time').textContent=racing?format(engine.remainingTime,true):survival?format(engine.time):engine.grass;
  $('hud-coins').parentElement.hidden=engine.gameMode==='twin';
  $('hud-coins').previousElementSibling.textContent=racing?'轮次':'积分';
  $('hud-coins').textContent=racing?engine.raceRound:engine.coins;$('pause-button').disabled=engine.state!=='running';
  $('shield-stock').hidden=mode!=='play'||engine.gameMode!=='hard';$('shield-count').textContent=engine.shieldStock;
  $('shield-stock').setAttribute('aria-label','储存护盾 '+engine.shieldStock+' 个');syncEffects();
}
function screen(next){
  if(next!=='play')$('achievement-notices').replaceChildren();
  if(next!=='shop')audio.stopPreview();
  if(next!=='play')resultView.cancel();
  mode=next;document.body.dataset.screen=next;renderer=next==='play'?gameRenderer:backgroundRenderer;
  if(next==='play'){renderer.monochrome=false;transition.reset();}
  $('menu-overlay').hidden=next!=='menu';$('mode-screen').hidden=next!=='modes';$('shop-screen').hidden=next!=='shop';
  $('achievements-screen').hidden=next!=='achievements';
  $('shield-stock').hidden=next!=='play'||engine.gameMode!=='hard';
  $('game-hud').hidden=next!=='play';$('exit-screen').hidden=next!=='exit';
  if(next==='menu')layoutTitle();
  syncEffects();
}
function closeDialogs(){if($('ranking-dialog').open)rankingView.close();resultView.cancel();reviveOffer=null;reviveLoading=false;placeToast(document.body);for(const d of [pauseDialog,resultDialog,reviveDialog,guideDialog,settingsDialog,controlDialog])if(d.open)d.close();}
function cancelDrag(){controls.clear();}
function showMenu(){
  closeDialogs();cancelDrag();engine.state='menu';
  if(!backgroundStarted){
    background.start(true);background.hazardClock=.1;backgroundStarted=true;
    for(let i=0;i<8;i++){background.spawnHazard();const h=background.hazards.at(-1);h.spawn=0;h.x=background.width*(.08+.84*Math.random());h.y=background.height*(.08+.84*Math.random());h.px=h.x;h.py=h.y;}
    background.player.x=background.width*.24;background.player.y=background.height*.65;background.player.vx=110;background.player.vy=-55;
  }
  if(landscape.coarse.matches){
    background.coast();const p=background.player,speed=Math.hypot(p.vx,p.vy)||1;
    if(!p.vx&&!p.vy){p.vx=1;p.vy=0;}
    p.vx=p.vx/speed*P.config.playerSpeed;p.vy=p.vy/speed*P.config.playerSpeed;
  }
  background.resume();accumulator=0;screen('menu');document.body.classList.remove('returning-home');backgroundRenderer.monochrome=true;syncSave();syncAudioActivity();
}
function menu(){
  if(transition.running)return;
  resultView.cancel();
  const returnFocus=mode==='achievements'?'achievements-open':'start-button';
  clearNavigationObstacles();cancelDrag();engine.state='menu';mode='menu';renderer=backgroundRenderer;background.resume();accumulator=0;
  $('menu-overlay').hidden=false;layoutTitle();document.body.classList.add('returning-home');syncAudioActivity();
  transition.toHome(showMenu,()=>$(returnFocus).focus({preventScroll:true}));
}
async function start(gameMode=engine.gameMode){
  if(transition.running||starting)return;
  starting=true;
  try{
  closeDialogs();cancelDrag();engine.start(false,gameMode);gameRenderer.reset();screen('play');achievements.begin(engine);shownResult=null;lastResult=null;soundedResult=null;accumulator=0;
  syncAudioActivity();
  syncHud();$('game').focus({preventScroll:true});
  }finally{starting=false;}
}
function pause(show=true){
  if(mode!=='play'||engine.state!=='running')return;
  engine.pause();cancelDrag();accumulator=0;syncHud();syncAudioActivity();if(show&&!pauseDialog.open){pauseDialog.showModal();placeToast();}
}
function resume(){placeToast(document.body);pauseDialog.close();engine.resume();accumulator=0;lastTime=performance.now();syncHud();syncAudioActivity();$('game').focus({preventScroll:true});}
function result(){
  if(!engine.result||shownResult===engine.result.id)return;
  if(soundedResult!==engine.result){soundedResult=engine.result;if(['collision','trail'].includes(engine.result.reason))audio.effect('end');}
  if(reviveOffer)return;
  if(engine.canRevive()){
    reviveOffer=engine.result;cancelDrag();syncHud();syncAudioActivity();if(pauseDialog.open)pauseDialog.close();
    $('revive-watch').disabled=false;$('revive-watch').textContent='看广告复活';$('revive-skip').disabled=false;reviveDialog.showModal();placeToast();return;
  }
  settleResult();
}
function settleResult(){
  if(!engine.result||shownResult===engine.result.id)return;
  achievements.observe(engine);shownResult=engine.result.id;lastResult=store.settle(engine.result);cancelDrag();syncSave();syncHud();if(!lastResult)return;
  syncAudioActivity();
  leaderboards.submit(engine.result);
  const racing=engine.gameMode==='race',survival=['twin','trial'].includes(engine.gameMode);
  $('result-score-label').textContent=P.modeNames[engine.gameMode]+(racing?'-消除个数':survival?'-存活时间':'-草！值');
  $('result-total').setAttribute('aria-label',String(lastResult.reward));
  $('result-save').textContent='余额 '+store.data.wallet+' 积分';
  if(pauseDialog.open)pauseDialog.close();
  resultView.begin(lastResult.reward,racing||survival?null:engine.result.grass);
  if(racing)$('result-time').textContent=engine.result.clearedOrbs;
  if(survival)$('result-time').textContent=format(engine.result.time);
}
function skipRevive(){
  if(reviveLoading||!reviveOffer)return;
  reviveOffer=null;reviveDialog.close();placeToast(document.body);settleResult();syncAudioActivity();
}
async function watchRevive(){
  if(reviveLoading||!reviveOffer||!engine.canRevive())return;
  const offer=reviveOffer;reviveLoading=true;$('revive-watch').disabled=true;$('revive-watch').textContent='广告加载中…';$('revive-skip').disabled=true;
  try{
    const response=await rewardedAds.play();
    if(mode!=='play'||reviveOffer!==offer||engine.result!==offer)return;
    if(!response.ok){toast(response.reason);return;}
    if(!engine.revive())return;
    reviveOffer=null;reviveDialog.close();placeToast(document.body);cancelDrag();accumulator=0;lastTime=performance.now();gameRenderer.ghostPlayerPrevious=null;
    if(!focused||document.hidden){engine.pause();pauseDialog.showModal();placeToast();}else $('game').focus({preventScroll:true});
    syncHud();syncAudioActivity();
  }finally{
    reviveLoading=false;
    if(reviveOffer===offer){$('revive-watch').disabled=false;$('revive-watch').textContent='看广告复活';$('revive-skip').disabled=false;}
  }
}
function leaveRun(){
  if(mode!=='play'||engine.state!=='paused')return;
  engine.finish('quit');shownResult=engine.result.id;store.settle(engine.result);lastResult=null;
  closeDialogs();cancelDrag();engine.events=[];syncSave();navigate(()=>showModes(engine.gameMode));syncAudioActivity();
}
function navigate(action){
  if(transition.running)return;
  clearNavigationObstacles();backgroundRenderer.monochrome=false;transition.toPage(action);
}
function selectMode(id,focus=false){
  for(const tab of document.querySelectorAll('[data-mode]')){
    const selected=tab.dataset.mode===id;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    $(tab.getAttribute('aria-controls')).hidden=!selected;
    if(selected&&focus){tab.focus({preventScroll:true});tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
  }
  modePreviews.show(id);
}
function showModes(selected='classic'){if(controlDialog.open)controlDialog.close();placeToast(document.body);screen('modes');$('mode-list').scrollTop=0;selectMode(selected,true);}
function beginPlay(){navigate(()=>{if(controls.needsChoice){screen('controls');controlDialog.showModal();}else showModes();});}
function syncControls(){
  $('control-toggle').hidden=!controls.available;$('control-toggle').setAttribute('aria-label','控制方式：'+controls.label);
  $('control-toggle').title='切换控制方式（当前'+controls.label+'）';$('control-icon').setAttribute('href',controls.mode==='finger'?'#i-finger':'#i-joystick');
}
function openShop(){
  shopFrom=lastResult&&engine.state==='ended'?'result':'menu';closeDialogs();group='player';screen('shop');renderShop();$('shop-list').scrollTop=0;$('skin-grid').scrollTop=0;$('shop-back').focus({preventScroll:true});
}
function closeShop(){
  if(shopFrom==='result'){screen('play');$('result-save').textContent='余额 '+store.data.wallet+' 积分';resultDialog.showModal();placeToast();}
  else menu();syncSave();
}
const shopView=new P.Shop({grid:$('skin-grid'),store,audio,ads:rewardedAds,onChange:()=>{achievements.syncPurchases();syncSave();},toast});
function renderShop(){
  syncSave();document.querySelectorAll('[data-group]').forEach(tab=>{const selected=tab.dataset.group===group;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
  $('skin-grid').setAttribute('aria-labelledby','tab-'+group);shopView.render(group);
}
function selectShop(groupId,focus=false){
  audio.stopPreview();group=groupId;renderShop();$('skin-grid').scrollTop=0;
  if(focus){$('tab-'+group).focus({preventScroll:true});$('tab-'+group).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
}
function resultModes(){closeDialogs();lastResult=null;navigate(showModes);syncAudioActivity();}

function openGuide(){screen('guide');guideDialog.showModal();placeToast();}
function closeGuide(){menu();}
function syncAudio(){for(const key of ['music','sound'])$(key+'-toggle').setAttribute('aria-pressed',String(audio.settings[key]));}
function openSettings(){settingsFrom='menu';screen('settings');syncAudio();syncControls();settingsDialog.showModal();placeToast();}
function openPauseSettings(){settingsFrom='pause';pauseDialog.close();syncAudio();syncControls();settingsDialog.showModal();placeToast();}
function closeSettings(){
  if(settingsFrom==='pause'){settingsDialog.close();pauseDialog.showModal();placeToast(pauseDialog);$('pause-settings').focus({preventScroll:true});}
  else menu();
}
function exitGame(){
  closeDialogs();engine.pause();background.pause();cancelDrag();screen('exit');audio.setActive(false);
  $('exit-back').focus({preventScroll:true});window.close();
}
function resize(){
  cancelDrag();
  if(mode==='play'&&engine.state==='running')pause();
  const rect=$('game').getBoundingClientRect();gameRenderer.resize(rect.width,rect.height);backgroundRenderer.resize(rect.width,rect.height);
  engine.resize(renderer.width,renderer.height);background.resize(renderer.width,renderer.height);
  layoutTitle();
  gameRenderer.reset();backgroundRenderer.reset();accumulator=0;
  backgroundRenderer.textRectsDirty=true;
  resultView.alignTitle();
}
function measureHomeText(){homeMask.refresh(backgroundRenderer.viewScale);backgroundRenderer.textRectsDirty=false;}

document.fonts?.ready.then(()=>{layoutTitle();resultView.alignTitle();});
function active(){return mode==='play'?engine:background;}
function point(event){const r=$('game').getBoundingClientRect();return{x:(event.clientX-r.left)*renderer.width/r.width,y:(event.clientY-r.top)*renderer.height/r.height};}
const canvas=$('game');
const unlockAudio=()=>{if(!audio.ctx||audio.ctx.state!=='running')audio.unlock();};
for(const type of ['pointerdown','pointerup','click','keydown'])document.addEventListener(type,unlockAudio,{capture:true,passive:true});
// Capture before dynamic purchase buttons are replaced; play after handlers so
// toggling sound off is silent and toggling it on confirms the new setting.
const buttonClicks=new WeakSet();
document.addEventListener('click',event=>{
  const button=event.target.closest?.('button,[role="button"],[role="tab"]');
  if(!button||button.matches(':disabled,[aria-disabled="true"]')||button.closest('[hidden],[inert]')||transition.running)return;
  buttonClicks.add(event);
},{capture:true});
document.addEventListener('click',event=>{if(buttonClicks.has(event)&&focused&&!document.hidden)audio.effect('click');});
document.addEventListener('pointermove',event=>{
  if(mode==='menu'&&landscape.coarse.matches)return;
  if(event.pointerType!=='mouse'||controls.held||!['menu','play'].includes(mode)||active().state!=='running'||transition.running)return;
  const p=point(event);active().target(p.x,p.y);
});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
window.addEventListener('resize',()=>{resize();landscape.update();});
window.addEventListener('blur',()=>{focused=false;pause();audio.setActive(false);audio.clearClicks();});
window.addEventListener('focus',()=>{focused=true;lastTime=performance.now();syncAudioActivity();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();audio.clearClicks();}syncAudioActivity();lastTime=performance.now();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();if(mode==='play')pause();else if(mode!=='menu'&&mode!=='exit')menu();}});
pauseDialog.addEventListener('cancel',event=>{event.preventDefault();resume();});
resultDialog.addEventListener('cancel',event=>{event.preventDefault();menu();});
reviveDialog.addEventListener('cancel',event=>{event.preventDefault();skipRevive();});
$('revive-watch').addEventListener('click',watchRevive);$('revive-skip').addEventListener('click',skipRevive);
guideDialog.addEventListener('cancel',event=>{event.preventDefault();closeGuide();});
settingsDialog.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
controlDialog.addEventListener('cancel',event=>{event.preventDefault();menu();});
$('start-button').addEventListener('click',beginPlay);
$('classic-start').addEventListener('click',()=>start('classic'));$('hard-start').addEventListener('click',()=>start('hard'));$('again-button').addEventListener('click',()=>start());
$('monochrome-start').addEventListener('click',()=>start('monochrome'));
$('race-start').addEventListener('click',()=>start('race'));
$('twin-start').addEventListener('click',()=>start('twin'));$('trial-start').addEventListener('click',()=>start('trial'));
$('mode-back').addEventListener('click',menu);
for(const button of document.querySelectorAll('[data-leaderboard]'))button.addEventListener('click',()=>rankingView.open(button.dataset.leaderboard,button));
$('achievements-open').addEventListener('click',()=>navigate(()=>{screen('achievements');achievementsView.render();document.querySelector('.achievements-content').scrollTop=0;$('achievements-back').focus({preventScroll:true});}));
$('achievements-back').addEventListener('click',menu);
$('shop-open').addEventListener('click',()=>navigate(openShop));
$('guide-open').addEventListener('click',()=>navigate(openGuide));
$('settings-open').addEventListener('click',()=>navigate(openSettings));
$('settings-close').addEventListener('click',closeSettings);
$('pause-settings').addEventListener('click',openPauseSettings);
$('control-toggle').addEventListener('click',()=>{controls.setMode(controls.mode==='finger'?'joystick':'finger');syncControls();toast('当前控制方式：'+controls.label,3000,true);});
for(const kind of ['finger','joystick'])$('choose-'+kind).addEventListener('click',()=>{controls.setMode(kind);syncControls();showModes();toast('可在设置中切换',3000,true);});
for(const key of ['music','sound'])$(key+'-toggle').addEventListener('click',()=>{audio.toggle(key);syncAudio();});
$('exit-button').addEventListener('click',exitGame);$('exit-back').addEventListener('click',menu);
$('pause-button').addEventListener('click',()=>pause());$('resume-button').addEventListener('click',resume);
$('end-button').addEventListener('click',leaveRun);
$('result-modes').addEventListener('click',resultModes);$('result-menu').addEventListener('click',menu);$('result-shop').addEventListener('click',openShop);$('shop-back').addEventListener('click',closeShop);
$('guide-close').addEventListener('click',closeGuide);
document.querySelectorAll('[data-mode]').forEach(tab=>{
  tab.addEventListener('click',()=>selectMode(tab.dataset.mode));
  tab.addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=Array.from(document.querySelectorAll('[data-mode]')),index=tabs.indexOf(tab);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;
    selectMode(tabs[next].dataset.mode,true);audio.effect('click');
  });
});
document.querySelectorAll('[data-group]').forEach(tab=>{
  tab.addEventListener('click',()=>selectShop(tab.dataset.group));
  tab.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
    event.preventDefault();const groups=Array.from(document.querySelectorAll('[data-group]'),el=>el.dataset.group),index=groups.indexOf(group);
    const next=event.key==='Home'?groups[0]:event.key==='End'?groups.at(-1):groups[(index+(event.key==='ArrowDown'?1:-1)+groups.length)%groups.length];selectShop(next,true);audio.effect('click');
  }});
});
$('reset-save').addEventListener('click',()=>{pause();if(confirm('重置异常存档？原数据将被替换，无法恢复。')){store.reset();syncSave();if(mode==='shop')renderShop();}});
const guideQuotes={coin:'买东西去吧，孩子',invincible:'可以浪了',magnet:'重要的是听声音',freeze:'我救不了你',pulse:'也就困难有用',nova:'清了我玩啥'};
for(const [type,def] of Object.entries(P.items)){
  const row=document.createElement('div');row.className='guide-row';row.innerHTML='<canvas class="shape-icon" width="40" height="40" aria-hidden="true"></canvas><div><strong>'+def.name+'</strong><p>“'+guideQuotes[type]+'”</p></div>';
  $('guide-items').append(row);P.Renderer.icon(row.querySelector('canvas'),type);
}
  for (const [type,name,quote] of [['normal','圆','哦'],['fast','快速正方形','确实快'],['split','分裂三角形','确实分裂'],['whiteBall','白草！球','怎么冻不住']]) {
    const row=document.createElement('div');row.className='guide-row';
    row.innerHTML='<canvas class="shape-icon" width="44" height="44" aria-hidden="true"></canvas><div><strong>'+name+'</strong><p>“'+quote+'”</p></div>';
    $('guide-hazards').append(row);P.Renderer.obstacleIcon(row.querySelector('canvas'),type);
  }
  for (const type of ['invincible', 'magnet', 'freeze']) {
    const el = document.createElement('div'); el.id = 'effect-' + type; el.className = 'effect-meter'; el.style.color = P.items[type].color;
    el.setAttribute('role','progressbar'); el.setAttribute('aria-label',P.items[type].name+'剩余时间'); el.setAttribute('aria-valuemin','0'); el.setAttribute('aria-valuemax',P.config.durations[type]);
    el.innerHTML = '<canvas width="32" height="32" aria-hidden="true"></canvas><span class="effect-track" aria-hidden="true"><i class="effect-fill"></i></span>';
    el.hidden = true; $('effect-strip').append(el); P.Renderer.icon(el.querySelector('canvas'),type);
  }

P.Renderer.icon($('shield-stock-icon'),'invincible','#111111');
resize();syncAudio();showMenu();backgroundRenderer.monochrome=true;syncHud();$('boot').remove();landscape.update();
if(audio.settings.music)audio.unlock();
function frame(now){
  const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
  transition.draw(document.hidden?0:dt);
  $('menu-overlay').hidden=mode!=='menu'&&transition.homeOpacity<=0;
  document.documentElement.style.setProperty('--page-opacity',transition.pageOpacity);
  document.documentElement.style.setProperty('--home-opacity',transition.homeOpacity);
  const homeTextVisible=mode!=='play'&&transition.homeOpacity>0;
  if(homeTextVisible&&(!backgroundRenderer.titleMaskEnabled||backgroundRenderer.textRectsDirty))measureHomeText();
  backgroundRenderer.titleMaskEnabled=homeTextVisible;
  document.body.classList.toggle('transitioning',transition.running);
  const current=active(),enabled=mode!=='exit'&&!document.hidden&&focused&&!rewardedAds.busy;
  const fixedGhosts=mode==='play'&&current.state==='running';
  let ghostTouches=0;
  if(enabled&&current.state==='running'){
    accumulator=Math.min(accumulator+dt,.1);
    while(accumulator>=P.config.step&&current.state==='running'){
      current.step(P.config.step);
      if(fixedGhosts){renderer.updateGhosts(current,P.skin('hazard',store.data.equipped.hazard),P.config.step);ghostTouches+=renderer.ghostTouchCount;achievements.observe(current,{deferEnd:true});}
      accumulator-=P.config.step;
    }
  }else accumulator=0;
  if(enabled&&mode==='play'&&current.state==='ended')result();
  if(enabled){
    if(mode==='play')for(const event of current.events){if(event.kind==='collect')audio.effect(event.kind);else if(event.kind==='destroy')audio.effect('ghost');}
    renderer.draw(current,store.data,current.state==='paused'||reviveOffer?0:dt,fixedGhosts);
    if(mode==='play'&&(fixedGhosts?ghostTouches:renderer.ghostTouchCount)>0)audio.effect('ghost');
  }
  resultView.update(enabled?dt:0);
  audio.tick();hudClock+=dt;if(hudClock>.08){syncHud();hudClock=0;}else syncEffects();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})(globalThis.PixelDodge);
