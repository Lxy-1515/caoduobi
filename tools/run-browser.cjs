// Explicit opt-in; publishing never starts tests.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),suites=["browser-mode-cards.cjs", "browser-revive.cjs", "browser-rewarded-ads.cjs", "browser-achievements.cjs", "browser-mobile-fallback.cjs", "browser-controls-navigation.cjs", "browser-joystick-handoff.cjs"],chosen=process.argv.slice(2);
if(!chosen.length){console.log('Choose a suite, e.g. npm run test:browser -- browser-revive.cjs\n'+suites.join('\n'));process.exit(0);}
if(chosen.some(s=>!suites.includes(s))){console.error('Unknown suite; choose from the documented list.');process.exit(1);}
fs.mkdirSync(path.join(root,'qa/tmp'),{recursive:true});let failed=false;
for(const suite of chosen){const r=spawnSync(process.execPath,[path.join(root,'tests',suite)],{cwd:root,stdio:'inherit',timeout:600000,env:process.env});if(r.status!==0){failed=true;console.error(suite+' failed or timed out'+(r.error?': '+r.error.message:''));}}
process.exitCode=failed?1:0;
