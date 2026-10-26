'use strict';
// Actual Chromium 2v2 smoke for PeerMesh tactical mode.
// Control: identical fighter stats/RRT, different radio policies only.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const url='file://'+path.resolve(__dirname,'../index.html');
async function run(){
 const browser=await chromium.launch({headless:true});
 try{
  fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
  for(const width of [320,393,1365]){
   const page=await browser.newPage({viewport:{width,height:width===1365?900:852}});
   const errors=[];
   page.on('pageerror',err=>errors.push(String(err)));
   await page.goto(url+'?mode=duel2&dteam=adaptive&seed=311&loss=0');
   await page.waitForFunction(()=>!!window.__rrtDuel2Debug);
   assert.equal(await page.locator('#duel2TeamMode').inputValue(),'adaptive');
   assert.equal(await page.locator('#duel2MeshStatus').isVisible(),true);
   const before=await page.evaluate(()=>window.__rrtDuel2Debug.getState());
   assert.equal(before.fighters.length,4);
   assert.equal(before.peerMesh.active,true);
   assert.ok(before.fighters.every(f=>f.memoryUnique));
   assert.deepEqual(before.peerMesh.agents.map(a=>a.id).sort(),['B1','B2','R1','R2']);
   assert.ok(before.peerMesh.agents.every(a=>a.queued===0));
   await page.locator('#mapSelect').selectOption('open');
   await page.locator('#start').click();
   const last=await page.evaluate(()=>{
    const d=window.__rrtDuel2Debug;
    d.advance(9);
    return d.getState();
   });
   assert.ok(last.time>2,'game advanced');
   assert.equal(last.mode,'adaptive');
   assert.equal(last.peerMesh.active,true);
   assert.ok(last.radio.sent>0,'real PeerMesh transmissions occurred');
   assert.ok(last.radio.delivered>0,'some radio packets delivered');
   assert.ok(last.peerMesh.agents.some(a=>a.sent>0),'private sent counters incremented');
   assert.ok(last.fighters.every(f=>f.receivedBids.every(id=>id[0]===f.id[0])),'never leak opposing team BID');
   assert.ok(last.fighters.every(f=>f.memoryUnique),'personal memories remain distinct');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,'no horizontal scroll '+width+' '+overflow);
   assert.deepEqual(errors,[],'no JS exceptions '+width);
   if(width===393)await page.screenshot({path:path.resolve(__dirname,'../artifacts/peer-mesh-duel2-393.png'),fullPage:true});
   console.log('PEERMESH DUEL2 CHROMIUM PASS',width,
    'sent',last.radio.sent,'delivered',last.radio.delivered,
    'ACKs',last.peerMesh.agents.reduce((n,a)=>n+a.acknowledged,0));
   await page.close();
  }
  const contexts=[
   {name:'independent',q:'',active:false,sentZero:true},
   {name:'cooperative',q:'&dteam=coop',active:false},
   {name:'adaptive',q:'&dteam=adaptive',active:true},
   {name:'adaptive-outage',q:'&dteam=adaptive&loss=100',active:true,sentZero:false,deliveredZero:true}
  ];
  const all=[];
  for(const c of contexts){
   const page=await browser.newPage({viewport:{width:393,height:852}});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(url+'?mode=duel2&seed=83'+c.q);
   const m=await page.evaluate(()=>{
    document.getElementById('mapSelect').value='open';
    document.getElementById('mapSelect').dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('start').click();
    window.__rrtDuel2Debug.advance(14);
    return window.__rrtDuel2Debug.getState();
   });
   assert.equal(m.peerMesh.active,c.active,c.name);
   if(c.sentZero)assert.equal(m.radio.sent,0,c.name+' sends nothing');
   if(c.deliveredZero){
    assert.equal(m.radio.delivered,0,'outage has no ghost delivery');
    assert.equal(m.radio.dropped,m.radio.sent,'outage drops every attempted packet');
    assert.ok(m.peerMesh.agents.every(a=>a.received===0),'no peer evidence delivered');
   }
   assert.ok(m.fighters.every(f=>f.memoryUnique),c.name);
   assert.deepEqual(errors,[],'page errors in '+c.name);
   all.push({case:c.name,radio:m.radio,peerMesh:m.peerMesh});
   await page.close();
  }
  console.log('PEERMESH DUEL2 CONTROLS PASS',
    JSON.stringify(all.map(x=>({mode:x.case,sent:x.radio.sent,delivered:x.radio.delivered,mesh:x.peerMesh.active}))));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
