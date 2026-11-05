const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PIXEL_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'qa/tmp'),{recursive:true});process.env.TEMP=process.env.TMP=path.join(root,'qa/tmp');
async function hook(page){await page.evaluate(()=>{
 window.scenes={};const draw=PixelDodge.Renderer.prototype.draw;PixelDodge.Renderer.prototype.draw=function(e,...args){scenes[e.attract?'home':'game']={e,r:this};return draw.call(this,e,...args);};
 const fade=PixelDodge.Transition.prototype.draw;PixelDodge.Transition.prototype.draw=function(dt){window.fx=this;return fade.call(this,dt);};
 const tick=PixelDodge.Audio.prototype.tick;PixelDodge.Audio.prototype.tick=function(...args){window.audio=this;return tick.apply(this,args);};
 document.getElementById('game').addEventListener('pointerdown',()=>{if(scenes.game)window.touchOrigin={x:scenes.game.e.player.x,y:scenes.game.e.player.y};},true);
});await page.waitForFunction(()=>window.scenes.home&&window.fx);}
async function ready(page,mode){await page.waitForFunction(m=>document.body.dataset.screen===m&&!document.body.classList.contains('transitioning'),mode);}
async function titleSize(page){return page.locator('.wordmark').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,paths:el.querySelectorAll('path').length}));}
async function seedObstacles(page){await page.evaluate(()=>{
 const {e,r}=scenes.home;window.homeWhite=e.whiteBall;window.homePlayer=e.player;
 e.hazardClock=1e6;e.hazards=[{type:'normal',x:80,y:160,px:80,py:160,r:15,spawn:0,vx:0,vy:0,angle:0,spin:0,colorIndex:0}];
 r.obstacleGhosts=[{type:'normal',x:120,y:160,r:15,age:0,angle:0,spin:0,colorIndex:0}];
});}
async function assertCleared(page){const state=await page.evaluate(()=>({hazards:scenes.home.e.hazards.length,ghosts:scenes.home.r.obstacleGhosts.length,shards:scenes.home.r.ghostShards.length,white:scenes.home.e.whiteBall===homeWhite,player:scenes.home.e.player===homePlayer}));assert.deepEqual(state,{hazards:0,ghosts:0,shards:0,white:true,player:true});return state;}
(async()=>{const browser=await chromium.launch({...(process.env.PIXEL_BROWSER_CHANNEL?{channel:process.env.PIXEL_BROWSER_CHANNEL}:{}),headless:true}),report=[];
 try{for(const entry of ['index.html','play.html'])for(const device of [{viewport:{width:1440,height:900},touch:false},{viewport:{width:844,height:390},touch:true},{viewport:{width:740,height:360},touch:true},{viewport:{width:1180,height:820},touch:true}]){
  console.log(`${entry} ${device.viewport.width} touch=${device.touch}`);
  const context=await browser.newContext({viewport:device.viewport,hasTouch:device.touch,isMobile:device.touch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,entry)).href);await hook(page);
  const initialTitle=await titleSize(page);assert.ok(initialTitle.width>100&&initialTitle.paths>=6);assert.equal(await page.locator('#transition-canvas').count(),0);
  let homeAuto=null;
  if(device.touch){
   const before=await page.evaluate(()=>{const p=scenes.home.e.player;return{x:p.x,y:p.y,vx:p.vx,vy:p.vy,speed:Math.hypot(p.vx,p.vy),steering:p.steering};});assert.ok(Math.abs(before.speed-504)<.01);assert.equal(before.steering,false);
   await page.mouse.move(100,100);await page.waitForTimeout(100);homeAuto=await page.evaluate(()=>{const p=scenes.home.e.player;return{x:p.x,y:p.y,speed:Math.hypot(p.vx,p.vy),steering:p.steering,wheel:document.getElementById('touch-joystick').hidden};});assert.ok(Math.hypot(homeAuto.x-before.x,homeAuto.y-before.y)>10);assert.ok(Math.abs(homeAuto.speed-504)<.01);assert.equal(homeAuto.steering,false);assert.equal(homeAuto.wheel,true);
   assert.equal(await page.evaluate(()=>{const e=scenes.home.e,p=e.player;Object.assign(p,{x:e.width-p.r-.1,y:e.height*.5,vx:504,vy:0,steering:false});e.step(.01);return p.vx<0&&Math.abs(Math.hypot(p.vx,p.vy)-504)<.01;}),true);
  }
  await seedObstacles(page);await page.locator('#start-button').click();
  await page.waitForFunction(()=>fx.elapsed>.1&&fx.running);const mid=await page.evaluate(()=>({duration:fx.fadeDuration,home:fx.homeOpacity,page:fx.pageOpacity,filter:getComputedStyle(document.getElementById('game')).filter,canvas:document.querySelectorAll('canvas').length}));
  assert.equal(mid.duration,.4);assert.ok(mid.home>0&&mid.home<1&&mid.page>0&&mid.page<1);assert.equal(mid.filter,'none');await assertCleared(page);
  let chosen='finger';
  if(device.touch){
   await ready(page,'controls');assert.equal(await page.locator('#control-dialog').isVisible(),true);assert.equal(await page.locator('.control-choice').count(),2);assert.equal(await page.locator('.control-preview[role="img"]').count(),2);
   assert.ok((await page.locator('#choose-finger').innerText()).includes('手指控制草！球'));assert.ok((await page.locator('#choose-joystick').innerText()).includes('摇杆控制草！球'));
   await page.screenshot({path:path.join(root,`qa/control-choice-${entry==='index.html'?'index':'play'}-${device.viewport.width}.png`)});
   chosen=device.viewport.width===1180?'joystick':'finger';await page.locator('#choose-'+chosen).click();await ready(page,'modes');
   assert.equal(await page.locator('#toast').textContent(),'可在设置中切换');assert.equal(await page.locator('#toast').isVisible(),true);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pixel-dodge.controls.v1')).mode),chosen);
   if(device.viewport.width===844){await page.waitForTimeout(2700);assert.equal(await page.locator('#toast').isVisible(),true);await page.waitForFunction(()=>document.getElementById('toast').hidden,null,{timeout:1000});}
  }else{await ready(page,'modes');assert.equal(await page.locator('#control-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('pixel-dodge.controls.v1')),null);}
  await page.locator('#classic-start').click();await page.waitForFunction(()=>scenes.game?.e.state==='running');
  await page.evaluate(()=>{const e=scenes.game.e;e.hazards=[];e.pickups=[];e.hazardClock=e.coinClock=e.powerClock=e.extraFreezeClock=1e6;e.effects.invincible=1000;Object.assign(e.player,{vx:0,vy:0,steering:false,direction:null});Object.assign(e.whiteBall,{x:20,y:20,vx:0,vy:0});});
  if(device.touch){
   const client=await context.newCDPSession(page),send=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
   await send('touchStart',[[1,170,250]]);
   if(chosen==='finger'){
    const spawned=await page.evaluate(()=>({x:scenes.game.e.player.tx,y:scenes.game.e.player.ty,scale:scenes.game.r.viewScale,active:scenes.game.r.fingerActive,cursor:scenes.game.r.touchCursor??null,wheel:document.getElementById('touch-joystick').hidden}));assert.ok(Math.abs(spawned.x-170/spawned.scale)<.01);assert.ok(Math.abs(spawned.y-250/spawned.scale)<.01);assert.equal(spawned.active,true);assert.equal(spawned.cursor,null);assert.equal(spawned.wheel,true);
    await send('touchMove',[[1,210,225]]);const moved=await page.evaluate(()=>({x:scenes.game.e.player.tx,y:scenes.game.e.player.ty,scale:scenes.game.r.viewScale}));assert.ok(Math.abs(moved.x-210/moved.scale)<.01);assert.ok(Math.abs(moved.y-225/moved.scale)<.01);
    await page.screenshot({path:path.join(root,`qa/finger-control-${entry==='index.html'?'index':'play'}-${device.viewport.width}.png`)});
   }else{await send('touchMove',[[1,220,220]]);assert.equal(await page.locator('#touch-joystick').isVisible(),true);assert.equal(await page.evaluate(()=>scenes.game.r.fingerActive),false);}
   await page.waitForFunction(()=>Math.hypot(scenes.game.e.player.vx,scenes.game.e.player.vy)>20);await send('touchEnd');assert.equal(await page.evaluate(()=>scenes.game.r.fingerActive),false);assert.equal(await page.locator('#touch-joystick').isVisible(),false);
   if(chosen==='finger'){await send('touchStart',[[2,550,260]]);const target=await page.evaluate(()=>({x:scenes.game.e.player.tx,y:scenes.game.e.player.ty,scale:scenes.game.r.viewScale}));assert.ok(Math.abs(target.x-550/target.scale)<.01);assert.ok(Math.abs(target.y-260/target.scale)<.01);await send('touchEnd');}
  }
  await page.locator('#pause-button').click();
  try{await page.waitForFunction(()=>scenes.game.e.state==='paused'&&audio.ctx.state==='suspended');}
  catch(error){console.error('Pause diagnostics',await page.evaluate(()=>({screen:document.body.dataset.screen,state:scenes.game.e.state,dialog:document.getElementById('pause-dialog').open,audio:audio.ctx?.state,focus:document.hasFocus(),hidden:document.hidden})));throw error;}
  const paused=await page.evaluate(()=>{const e=scenes.game.e;e.hazards=[{type:'normal',x:100,y:200,px:100,py:200,r:16,vx:10,vy:0,spawn:0,colorIndex:0}];window.pausedWhite=e.whiteBall;window.pausedHazard=e.hazards[0];return{time:e.time,freeze:e.effects.freeze,invincible:e.effects.invincible,music:audio.musicPosition};});
  await page.locator('#pause-settings').click();assert.equal(await page.locator('#settings-dialog').isVisible(),true);assert.equal(await page.locator('#pause-dialog').isVisible(),false);
  assert.equal(await page.locator('#control-toggle').isVisible(),device.touch);
  if(device.touch){
   await page.locator('#control-toggle').click();chosen=chosen==='finger'?'joystick':'finger';assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pixel-dodge.controls.v1')).mode),chosen);
   assert.equal(await page.locator('#control-icon').getAttribute('href'),chosen==='finger'?'#i-finger':'#i-joystick');assert.match(await page.locator('#toast').textContent(),/当前控制方式/);
   const rect=await page.locator('#toast').boundingBox();assert.ok(rect.y>device.viewport.height*.5&&rect.y+rect.height<device.viewport.height);
   await page.screenshot({path:path.join(root,`qa/pause-settings-${entry==='index.html'?'index':'play'}-${device.viewport.width}.png`)});
   if(device.viewport.width===844){await page.waitForTimeout(2700);assert.equal(await page.locator('#toast').isVisible(),true);await page.waitForFunction(()=>document.getElementById('toast').hidden,null,{timeout:1000});}
  }else{await page.locator('#music-toggle').click();await page.locator('#music-toggle').click();}
  assert.deepEqual(await page.evaluate(()=>({time:scenes.game.e.time,freeze:scenes.game.e.effects.freeze,invincible:scenes.game.e.effects.invincible,music:audio.musicPosition})),paused);
  assert.equal(await page.evaluate(()=>scenes.game.e.whiteBall===pausedWhite&&scenes.game.e.hazards[0]===pausedHazard),true,'paused settings cannot clear or replace game entities');
  await page.locator('#settings-close').click();assert.equal(await page.locator('#pause-dialog').isVisible(),true);assert.equal(await page.evaluate(()=>scenes.game.e.state),'paused');
  await page.locator('#pause-settings').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#pause-dialog').isVisible(),true);
  await page.locator('#resume-button').click();await page.waitForFunction(()=>scenes.game.e.state==='running');
  if(device.touch&&device.viewport.width!==844)assert.equal(await page.locator('#toast').isVisible(),true,'control notice keeps its remaining lifetime after closing dialogs and resuming');
  await page.evaluate(()=>scenes.game.e.finish('collision'));await page.waitForFunction(()=>document.getElementById('result-dialog').open);
  await seedObstacles(page);await page.locator('#result-menu').click();await page.waitForFunction(()=>fx.running&&fx.target==='home');await assertCleared(page);await ready(page,'menu');
  const returnedTitle=await titleSize(page);assert.ok(returnedTitle.width>100&&returnedTitle.height>80&&returnedTitle.paths===initialTitle.paths);assert.ok(Math.abs(returnedTitle.width-initialTitle.width)<1);
  if(device.touch)assert.ok(await page.evaluate(()=>Math.abs(Math.hypot(scenes.home.e.player.vx,scenes.home.e.player.vy)-504)<.01&&!scenes.home.e.player.steering));
  await page.screenshot({path:path.join(root,`qa/returned-title-${entry==='index.html'?'index':'play'}-${device.viewport.width}.png`)});
  for(const [open,back,target]of [['#achievements-open','#achievements-back','achievements'],['#shop-open','#shop-back','shop'],['#guide-open','#guide-close','guide'],['#settings-open','#settings-close','settings']]){
   await seedObstacles(page);await page.locator(open).click();await ready(page,target);await assertCleared(page);await seedObstacles(page);await page.locator(back).click();await ready(page,'menu');await assertCleared(page);assert.ok((await titleSize(page)).width>100);
  }
  const saveBefore=await page.evaluate(()=>localStorage.getItem('pixel-dodge.save.v1'));await page.reload();await hook(page);await page.locator('#start-button').click();await ready(page,'modes');assert.equal(await page.locator('#control-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('pixel-dodge.save.v1')),saveBefore);
  assert.deepEqual(errors,[]);report.push({entry,device,homeAuto,mid,initialTitle,returnedTitle,chosen,firstChoice:device.touch,pausedSettings:true,savePreserved:true,errors});await context.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(root,'qa/controls-navigation-browser-report.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),report,limitations:'Isolated Edge; native CDP canvas touch, phone/tablet emulation, no physical-device TapTap performance measurement.'},null,2));console.log('Fade/clear, title return, first choice, both controls, persistence, 3s notices and pause settings passed in both entries and desktop/mobile/tablet.');
})().catch(e=>{console.error(e);process.exitCode=1;});
