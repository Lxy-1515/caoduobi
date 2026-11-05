const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PIXEL_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'qa/tmp'),{recursive:true});process.env.TEMP=process.env.TMP=path.join(root,'qa/tmp');
const close=(a,b)=>assert.ok(Math.abs(a-b)<.02,`${a} != ${b}`);
async function ready(page,screen){await page.waitForFunction(s=>document.body.dataset.screen===s&&!document.body.classList.contains('transitioning'),screen);}
async function state(page){return page.evaluate(()=>{const r=document.getElementById('touch-joystick').getBoundingClientRect();return{hidden:document.getElementById('touch-joystick').hidden,x:r.x+r.width/2,y:r.y+r.height/2,held:control.held?.id,count:control.pointers.size,strength:scene.e.player.direction?.strength,marker:scene.r.joystickDirection};});}
(async()=>{const browser=await chromium.launch({...(process.env.PIXEL_BROWSER_CHANNEL?{channel:process.env.PIXEL_BROWSER_CHANNEL}:{}),headless:true}),report=[];try{
 for(const entry of ['index.html','play.html'])for(const viewport of [{width:390,height:844},{width:360,height:640}]){
  console.log(`Handoff ${entry} ${viewport.width}x${viewport.height}`);const context=await browser.newContext({viewport,hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('pixel-dodge.controls.v1',JSON.stringify({mode:'joystick'})));await page.goto(pathToFileURL(path.join(root,entry)).href);
  await page.evaluate(()=>{const begin=PixelDodge.TouchControls.prototype.begin;PixelDodge.TouchControls.prototype.begin=function(...args){window.control=this;return begin.apply(this,args);};const draw=PixelDodge.Renderer.prototype.draw;PixelDodge.Renderer.prototype.draw=function(e,...args){if(!e.attract)window.scene={e,r:this};return draw.call(this,e,...args);};});
  if(await page.locator('#orientation-dialog').isVisible())await page.locator('#orientation-skip').click();await page.locator('#start-button').click();await ready(page,'modes');
  const client=await context.newCDPSession(page),points=new Map();
  const send=(type,values)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:values.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
  const press=async(id,x,y)=>{points.set(id,[id,x,y]);await send('touchStart',Array.from(points.values()));};
  const move=async(id,x,y)=>{points.set(id,[id,x,y]);await send('touchMove',Array.from(points.values()));};
  const lift=async id=>{await send('touchEnd',[points.get(id)]);points.delete(id);};
  for(const mode of ['classic','twin']){
   await page.locator('#mode-tab-'+mode).click();await page.locator('#'+mode+'-start').click();await page.waitForFunction(m=>window.scene?.e.gameMode===m,mode);await page.evaluate(()=>{const e=scene.e;e.hazardClock=e.coinClock=e.powerClock=1e6;e.hazards=[];e.effects.invincible=1e6;});
   await press(1,70,viewport.height*.6);await move(1,100,viewport.height*.6);await press(2,viewport.width*.7,viewport.height*.65);await move(2,viewport.width*.75,viewport.height*.7);await press(3,150,viewport.height*.8);let s=await state(page);close(s.x,70);assert.equal(s.count,3);const owner=s.held;
   await lift(1);s=await state(page);assert.equal(s.hidden,false);assert.notEqual(s.held,owner);assert.equal(s.count,2);close(s.x,viewport.width*.75);close(s.y,viewport.height*.7);assert.equal(s.strength,0);assert.equal(s.marker,null);
   await move(2,viewport.width*.75-36.75,viewport.height*.7);s=await state(page);close(s.strength,.5);assert.ok(s.marker.x<0);await lift(2);s=await state(page);close(s.x,150);close(s.y,viewport.height*.8);assert.equal(s.count,1);assert.equal(s.strength,0);await lift(3);s=await state(page);assert.equal(s.hidden,true);assert.equal(s.count,0);
   // Pause discards all contacts. A held old waiter cannot reappear after resume.
   await press(8,70,viewport.height*.6);await press(9,viewport.width*.7,viewport.height*.65);await page.keyboard.press('Escape');s=await state(page);assert.equal(s.hidden,true);assert.equal(s.count,0);await lift(8);await page.locator('#resume-button').click();await move(9,viewport.width*.75,viewport.height*.7);assert.equal((await state(page)).hidden,true);await press(10,150,viewport.height*.8);assert.equal((await state(page)).hidden,false);await lift(10);await lift(9);assert.equal((await state(page)).count,0);
   await page.locator('#pause-button').click();await page.locator('#end-button').click();await ready(page,'modes');report.push({entry,viewport,mode,latestPosition:true,threeContacts:true,repeatedHandoff:true,pauseClearsWaiters:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 fs.writeFileSync(path.join(root,'qa/joystick-handoff-browser-report.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),report},null,2));console.log('PASS: portrait phone native multi-touch handoff and pause cleanup in classic/twin, both entries');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
