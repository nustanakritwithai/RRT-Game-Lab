#!/usr/bin/env node
'use strict';
// Headless Chromium verification of scaled buddy/group/squad SIMULATION.
// Does not run a live weapon system or claim real-world combat performance.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
const base='file://'+path.resolve(__dirname,'../index.html');
const presets=[
 ['buddy2',2,1,1],['buddy3',3,1,1],
 ['group22',4,2,1],['group23',5,2,1],['group33',6,2,1],
 ['squad2222',8,4,2],['squad2323',10,4,2],['squad3333',12,4,2]
];
(async()=>{
 const browser=await chromium.launch();
 let checked=0;
 try{
  for(const [code,count,teams,groups] of presets){
   for(const width of code==='squad3333'?[393,1365]:['buddy2','group23','squad2222'].includes(code)?[320,393]:[393]){
    const context=await browser.newContext({viewport:{width,height:width===1365?900:852}});
    await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'?mode=duel2&formation='+code+'&seed=83');
    const report=await page.evaluate(()=>{
     const d=window.__rrtDuel2Debug,arena=window.__rrtArenaDebug,
       start=d.getState(),stage=document.getElementById('stage');
     document.getElementById('mapSelect').value='open';
     document.getElementById('mapSelect').dispatchEvent(new Event('change',{bubbles:true}));
     document.getElementById('start').click();
     d.advance(1.3);
     const end=d.getState();
     return {start,end,valid:arena.validate(),
      scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      stageSize:stage.getBoundingClientRect().height};
    });
    const {end,valid}=report,blues=end.fighters.filter(f=>f.team==='blue'),
      reds=end.fighters.filter(f=>f.team==='red');
    assert.deepEqual(errors,[],'browser errors '+code+': '+errors.join('; '));
    assert.equal(report.start.fighters.length,2*count,'initial actors '+code);
    assert.equal(end.fighters.length,2*count,'alive + eliminated slots '+code);
    assert.equal(blues.length,count);
    assert.equal(reds.length,count);
    assert.equal(end.formation,code);
    assert.equal(end.organization.blue.length,groups);
    assert.equal(end.organization.red.length,groups);
    assert.equal(end.organization.blue.reduce((n,g)=>n+g.teams.length,0),teams);
    assert.equal(end.organization.red.reduce((n,g)=>n+g.teams.length,0),teams);
    assert.ok(end.fighters.every(f=>f.memoryCount===count&&f.memoryUnique),'private memories '+code);
    assert.ok(end.fighters.every(f=>f.peers.every(id=>id[0]===f.id[0])&&f.peers.length<=6),
     'bounded peer graph and no cross-side links '+code);
    assert.ok(end.fighters.every(f=>f.teamId&&f.groupId),'every fighter has group membership '+code);
    assert.ok(end.fighters.every(f=>[f.x,f.y,f.hp,f.ammo].every(Number.isFinite)),'finite state '+code);
    assert.ok(end.fighters.every(f=>JSON.stringify(f.stats)===JSON.stringify(end.fighters[0].stats)),
     'exact same AI/weapon stats '+code);
    assert.ok(valid.fightersFree&&valid.waypointsClear,'collision safety '+code);
    assert.ok(report.scroll<=0,'no mobile sideways scroll '+code);
    assert.ok(report.stageSize>200,'stable play area '+code);
    console.log('PASS '+code+' '+count+'v'+count+' '+width+'px');
    checked++;
    await context.close();
   }
  }
  for(const condition of [
   {code:'group23',mode:'cooperative',loss:0},
   {code:'squad2323',mode:'cooperative',loss:100},
   {code:'group23',mode:'adaptive',loss:0},
   {code:'squad2323',mode:'adaptive',loss:100}
  ]){
   const context=await browser.newContext({viewport:{width:393,height:852}});
   await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'?mode=duel2&formation='+condition.code+
    '&dteam='+(condition.mode==='adaptive'?'adaptive':'coop')+'&loss='+condition.loss+'&seed=311');
   const report=await page.evaluate(()=>{
    const d=window.__rrtDuel2Debug;
    document.getElementById('mapSelect').value='open';
    document.getElementById('mapSelect').dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('start').click();d.advance(4);
    return d.getState();
   });
   assert.deepEqual(errors,[],'page error '+condition.code+errors);
   assert.equal(report.mode,condition.mode);
   if(condition.mode==='adaptive'){
    assert.equal(report.peerMesh.active,true,'adaptive PeerMesh active');
    assert.ok(report.peerMesh.agents.every(p=>Number.isFinite(p.offered)&&p.queued>=0),
     'private per-agent PeerMesh outboxes');
   }
   assert.ok(report.radio.sent>0,'transmitted real direct-sensor message '+condition.code);
   if(condition.loss===100){
    assert.equal(report.radio.delivered,0,'no received packets under complete outage');
    assert.ok(report.fighters.every(b=>b.received.length===0&&b.receivedBids.length===0),
     'no invented shared observations');
   }else{
    assert.ok(report.radio.delivered>0,'some direct peer packets arrived');
    assert.ok(report.fighters.every(b=>b.receivedBids.every(id=>id[0]===b.id[0])),
     'no cross-side received BID');
   }
   console.log('PASS '+condition.code+' '+condition.mode+' P2P with '+condition.loss+'% loss');
   checked++;
   await context.close();
  }
  console.log('Formation Chromium verification: '+checked+' scenarios passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
