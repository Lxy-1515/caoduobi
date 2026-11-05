const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){const c=vm.createContext({console,Math,Date});for(const f of ['content','store'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f+'.js'),'utf8'),c);const P=c.PixelDodge;P.audioAssets={sample:'data'};P.shopSounds=[{id:'a',name:'Test A',price:17,sample:'sample'},{id:'b',name:'Test B',price:23,sample:'sample'},{id:'pending',price:null,sample:null}];const disk={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};const store=new P.Store(disk);store.data.wallet=100;return{P,disk,store};}
test('all displayed time is unbounded whole seconds, with correct countdown rounding',()=>{
 const {P}=fixture();for(const [n,value]of [[0,'0 s'],[1.99,'1 s'],[59.99,'59 s'],[60,'60 s'],[65.9,'65 s'],[125.8,'125 s'],[3601.9,'3601 s'],[NaN,'0 s'],[-1,'0 s']])assert.equal(P.formatSeconds(n),value);
 for(const [n,value]of [[0,'0 s'],[.01,'1 s'],[29.1,'30 s'],[30,'30 s'],[61.1,'62 s']])assert.equal(P.formatSeconds(n,true),value);assert.equal(P.formatSeconds(60-1e-12),'60 s');
});
test('sound purchase charges once, preserves old save and equips pickup/clear separately',()=>{
 const {P,disk,store:s}=fixture();s.persist();const legacy=disk.value;assert.equal(s.data.soundOwned,undefined);assert.equal(s.equipSound('collect','a'),false);assert.equal(s.purchaseSound('a').ok,true);assert.equal(s.data.wallet,83);assert.equal(s.purchaseSound('a').owned,true);assert.equal(s.data.wallet,83);assert.equal(s.purchaseSound('b').ok,true);assert.equal(s.equipSound('collect','a'),true);assert.equal(s.equipSound('ghost','b'),true);assert.equal(s.equipSound('music','a'),false);
 const loaded=new P.Store(disk);assert.equal(loaded.status,'ok');assert.equal(loaded.data.wallet,60);assert.equal(loaded.data.soundEquipped.collect,'a');assert.equal(loaded.data.soundEquipped.ghost,'b');assert.equal(loaded.data.equipped.player,'mint');assert.equal(new P.Store({getItem:()=>legacy}).status,'ok');
});
test('unuploaded or unpriced sound never charges or equips, and insufficient credits are preserved',()=>{
 const {P,store:s}=fixture();for(const id of ['pending','unknown'])assert.equal(s.purchaseSound(id).ok,false);assert.equal(s.data.wallet,100);P.shopSounds.push({id:'bad',price:-1,sample:'sample'},{id:'no-file',price:1,sample:'missing'});for(const id of ['bad','no-file'])assert.equal(s.purchaseSound(id).ok,false);s.data.wallet=1;assert.equal(s.purchaseSound('a').ok,false);assert.equal(s.data.wallet,1);
});
test('invalid optional sound ownership is rejected but missing retired sound catalog stays compatible',()=>{
 const {P,disk,store:s}=fixture();s.purchaseSound('a');s.equipSound('collect','a');P.shopSounds=[];assert.equal(new P.Store(disk).status,'ok');const d=JSON.parse(disk.value);d.soundEquipped.collect='not-owned';assert.equal(new P.Store({getItem:()=>JSON.stringify(d)}).status,'corrupt');d.soundEquipped=[];assert.equal(new P.Store({getItem:()=>JSON.stringify(d)}).status,'corrupt');
});
