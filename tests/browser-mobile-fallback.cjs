const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PIXEL_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'qa/tmp'),{recursive:true});process.env.TEMP=process.env.TMP=path.join(root,'qa/tmp');
async function ready(page,screen){await page.waitForFunction(s=>document.body.dataset.screen===s&&!document.body.classList.contains('transitioning'),screen);}
async function safe(page){await page.evaluate(()=>{const e=scenes.game.e;e.hazards=[];if(e.gameMode!=='race')e.pickups=[];e.effects.invincible=1000;e.hazardClock=e.coinClock=e.powerClock=e.extraFreezeClock=1e6;Object.assign(e.whiteBall,{x:20,y:20,vx:0,vy:0});});}
async function run(page,mode){await page.locator('#mode-tab-'+mode).click();await page.locator('#'+mode+'-start').click();await page.waitForFunction(m=>scenes.game?.e.state==='running'&&scenes.game.e.gameMode===m,mode,{timeout:1800});await safe(page);assert.equal(await page.locator('#game-tip').count(),0);const t=await page.evaluate(()=>scenes.game.e.time);await page.waitForTimeout(80);assert.ok(await page.evaluate(t=>scenes.game.e.time>t,t));}
async function back(page){await page.locator('#pause-button').click();await page.locator('#end-button').click();await ready(page,'modes');await page.locator('#mode-back').click();await ready(page,'menu');}
(async()=>{const browser=await chromium.launch({...(process.env.PIXEL_BROWSER_CHANNEL?{channel:process.env.PIXEL_BROWSER_CHANNEL}:{}),headless:true}),report=[];
 try{for(const entry of ['index.html','play.html'])for(const scenario of ['skip','rejected','lock-hangs','fullscreen-hangs','unsupported']){
  console.log(`Portrait ${entry} ${scenario}`);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(scenario=>{
   window.requests={full:0,lock:0,unlock:0,exit:0};window.toastRuns=[];
   if(scenario!=='skip')localStorage.setItem('pixel-dodge.controls.v1',JSON.stringify({mode:'finger'}));
   Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:scenario==='unsupported'?undefined:()=>{requests.full++;return scenario==='fullscreen-hangs'?new Promise(resolve=>window.lateFull=resolve):Promise.resolve();}});
   Object.defineProperty(document,'exitFullscreen',{configurable:true,value:()=>{requests.exit++;return Promise.resolve();}});
   Object.defineProperty(screen.orientation,'lock',{configurable:true,value:scenario==='unsupported'?undefined:()=>{requests.lock++;return scenario==='lock-hangs'?new Promise(resolve=>window.lateLock=resolve):Promise.reject(new DOMException('Portrait lock enabled','NotSupportedError'));}});
   Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>requests.unlock++});
   const animate=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.id==='toast')toastRuns.push({text:this.textContent,time:performance.now()});return animate.apply(this,args);};
  },scenario);
  await page.goto(pathToFileURL(path.join(root,entry)).href);
  await page.evaluate(()=>{window.scenes={};const draw=PixelDodge.Renderer.prototype.draw;PixelDodge.Renderer.prototype.draw=function(e,...args){scenes[e.attract?'home':'game']={e,r:this};return draw.call(this,e,...args);};const request=PixelDodge.MobileLandscape.prototype.request;PixelDodge.MobileLandscape.prototype.request=function(){window.orientationFlow=this;return request.call(this);};});await page.waitForFunction(()=>scenes.home);
  assert.equal(await page.locator('#orientation-dialog').isVisible(),true);assert.equal(await page.locator('#orientation-dialog h2').count(),0);assert.equal(await page.locator('#orientation-message').textContent(),'横屏游玩，视野更开阔。');assert.deepEqual(await page.evaluate(()=>requests),{full:0,lock:0,unlock:0,exit:0});
  if(scenario==='skip'){await page.screenshot({path:path.join(root,`qa/portrait-optional-${entry==='index.html'?'index':'play'}.png`)});await page.locator('#orientation-skip').click();}else await page.locator('#orientation-enter').click();
  assert.equal(await page.locator('#orientation-dialog').isVisible(),false);
  await page.locator('#start-button').click();await ready(page,scenario==='skip'?'controls':'modes');
  if(scenario==='skip'){await page.locator('#choose-finger').click();await ready(page,'modes');assert.equal(await page.evaluate(()=>toastRuns.length),1);}
  await run(page,'classic');assert.equal(await page.evaluate(()=>innerWidth<innerHeight),true);
  const client=await context.newCDPSession(page),send=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
  await send('touchStart',[[1,280,560]]);assert.ok(await page.evaluate(()=>Math.abs(scenes.game.e.player.tx-280/scenes.game.r.viewScale)<.01&&scenes.game.r.fingerActive));await send('touchMove',[[1,240,520]]);await send('touchEnd');assert.equal(await page.evaluate(()=>scenes.game.r.fingerActive),false);
  if(scenario==='skip'){
   assert.equal(await page.evaluate(()=>toastRuns.length),1);await page.locator('#pause-button').click();await page.locator('#pause-settings').click();assert.equal(await page.evaluate(()=>toastRuns.length),1);
   await page.locator('#control-toggle').click();assert.equal(await page.evaluate(()=>toastRuns.length),2);assert.equal(await page.locator('#toast').evaluate(el=>getComputedStyle(el).animationName),'none');
   await page.locator('#music-toggle').click();await page.locator('#music-toggle').click();await page.locator('#settings-close').click();await page.locator('#pause-settings').click();await page.locator('#sound-toggle').click();await page.locator('#sound-toggle').click();await page.locator('#settings-close').click();await page.locator('#resume-button').click();assert.equal(await page.evaluate(()=>toastRuns.length),2);
   const remaining=await page.evaluate(()=>3000-(performance.now()-toastRuns[1].time));if(remaining>180)await page.waitForTimeout(remaining-140);assert.equal(await page.locator('#toast').isVisible(),true);await page.waitForFunction(()=>document.getElementById('toast').hidden,null,{timeout:700});assert.equal(await page.evaluate(()=>toastRuns.length),2);
   await send('touchStart',[[2,120,550]]);await send('touchMove',[[2,155,530]]);assert.equal(await page.locator('#touch-joystick').isVisible(),true);await send('touchEnd');
   await page.screenshot({path:path.join(root,`qa/portrait-game-${entry==='index.html'?'index':'play'}.png`)});
   await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>scenes.game.e.state==='paused');assert.equal(await page.locator('#orientation-dialog').isVisible(),false);await page.locator('#resume-button').click();await page.waitForFunction(()=>scenes.game.e.state==='running');await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>scenes.game.e.state==='paused');assert.equal(await page.locator('#orientation-dialog').isVisible(),false);await page.locator('#resume-button').click();await safe(page);
   await back(page);for(const mode of ['hard','monochrome','race']){await page.locator('#start-button').click();await ready(page,'modes');await run(page,mode);await back(page);}assert.equal(await page.evaluate(()=>requests.full+requests.lock),0);
  }else{
   await page.waitForFunction(()=>orientationFlow.pending===false,null,{timeout:1600});assert.equal(await page.locator('#orientation-enter').isDisabled(),false);assert.equal(await page.locator('#orientation-dialog').isVisible(),false);
   if(scenario==='lock-hangs'){await page.evaluate(()=>lateLock());await page.waitForFunction(()=>requests.unlock===1);}
   if(scenario==='fullscreen-hangs'){await page.evaluate(()=>lateFull());await page.waitForFunction(()=>requests.exit===1);}
   await back(page);
  }
  assert.deepEqual(errors,[]);report.push({entry,scenario,portraitPlayable:true,finger:true,optionalPrompt:true,noBottomTip:true,toast:scenario==='skip'?'no replay, 3s deadline retained across dialogs, new notice works':null,requests:await page.evaluate(()=>requests),errors});await context.close();
 }
 for(const entry of ['index.html','play.html']){
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();await page.goto(pathToFileURL(path.join(root,entry)).href);await page.evaluate(()=>{window.scenes={};const draw=PixelDodge.Renderer.prototype.draw;PixelDodge.Renderer.prototype.draw=function(e,...args){scenes[e.attract?'home':'game']={e,r:this};return draw.call(this,e,...args);};});assert.equal(await page.locator('#orientation-dialog').isVisible(),false);
  for(const mode of ['classic','hard','monochrome','race']){await page.locator('#start-button').click();await ready(page,'modes');await run(page,mode);await back(page);}report.push({entry,desktop:true,allModesNoBottomTip:true});await context.close();
 }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(root,'qa/mobile-fallback-browser-report.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),report,limitations:'Isolated Edge with native CDP touch and mocked unavailable/rejected/hanging orientation APIs. No physical OS portrait-lock or TapTap test.'},null,2));console.log('Portrait fallback, optional directions, no blocked startup, late API cleanup, toast animation/deadline and all-mode footer removal passed in both entries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
