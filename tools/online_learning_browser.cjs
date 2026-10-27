#!/usr/bin/env node
'use strict';
// Browser-only opt-in online learning validation. SIMULATION, not proven superiority.
const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const base='file://'+path.resolve(__dirname,'../index.html');
async function run(){
 const browser=await chromium.launch(),reports=[];
 try{
  const cases=[
   {formation:'buddy2',mode:'independent',seconds:18,learn:1},
   {formation:'group23',mode:'adaptive',seconds:17,learn:1},
   {formation:'squad2222',mode:'adaptive',seconds:17,learn:1},
   {formation:'squad3333',mode:'adaptive',seconds:17,learn:1},
   {formation:'squad3333',mode:'adaptive',seconds:8,learn:0}
  ];
  for(const c of cases){
   const ctx=await browser.newContext({viewport:{width:393,height:852}});
   await ctx.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',err=>errors.push(String(err)));
   await page.goto(base+'?mode=duel2&formation='+c.formation+
    '&dteam='+(c.mode==='adaptive'?'adaptive':'independent')+
    '&seed=83&learn='+c.learn);
   const start=await page.evaluate(()=>{
    const map=document.getElementById('mapSelect');
    map.value='open';map.dispatchEvent(new Event('change',{bubbles:true}));
    return window.__rrtDuel2Debug.getState();
   });
   assert.equal(start.learningEnabled,c.learn===1,'learning toggle must match URL');
   const chosen=await page.evaluate(()=>document.getElementById('blueStyle').value);
   assert.ok(start.fighters.every(f=>f.learning===null||f.learning.style===chosen),
    'initial learned tactic must match the existing player-selected tactic');
   const begun=Date.now();
   const result=await page.evaluate(seconds=>{
    const api=window.__rrtDuel2Debug;
    document.getElementById('start').click();
    api.advance(seconds);
    return {state:api.getState(),valid:window.__rrtArenaDebug.validate(),
     status:document.getElementById('duel2LearningStatus').textContent,
     visible:!document.getElementById('duel2LearningStatus').hidden,
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   },c.seconds);
   const s=result.state,learning=s.fighters.map(b=>b.learning);
   assert.deepEqual(errors,[],c.formation+' JS errors '+errors);
   assert.ok(result.valid.fightersFree&&result.valid.waypointsClear,'collision-free game');
   assert.equal(result.overflow<=0,true,'mobile horizontal layout stable');
   assert.ok(s.fighters.every(b=>[b.hp,b.ammo,b.x,b.y].every(Number.isFinite)));
   assert.ok(s.fighters.every(b=>JSON.stringify(b.stats)===JSON.stringify(s.fighters[0].stats)),'symmetric hardware');
   if(c.learn){
    assert.equal(result.visible,true,'live learning HUD');
    assert.match(result.status,/เรียนรู้จริง/);
    assert.ok(learning.every(l=>l&&l.enabled),'all fighters own personal learner');
    assert.ok(learning.every(l=>['balanced','aggressive','cautious'].includes(l.style)));
    assert.ok(learning.every(l=>Number.isFinite(l.meanReward)&&l.updates<=l.windows));
    assert.ok(learning.some(l=>l.updates>0),c.formation+' must actually receive feedback and update in-match');
    assert.ok(learning.some(l=>l.switches>0),c.formation+' must experiment with alternative policies');
   }else{
    assert.ok(learning.every(x=>x===null),'disabled branch never learns');
    assert.equal(result.visible,false);
   }
   const report={...c,timeMs:Date.now()-begun,updates:learning.reduce((n,l)=>n+(l?.updates||0),0),
    switches:learning.reduce((n,l)=>n+(l?.switches||0),0),
    observedHits:learning.reduce((n,l)=>n+(l?.confirmedHits||0),0),
    damageReceived:learning.reduce((n,l)=>n+(l?.receivedDamage||0),0),
    plans:s.fighters.reduce((n,b)=>n+b.planCount,0),radio:s.radio.sent,
    gameTime:s.time,phase:s.phase};
   reports.push(report);
   console.log('PASS online '+JSON.stringify(report));
   await ctx.close();
  }
 }finally{await browser.close();}
 const file=path.resolve(__dirname,'../benchmarks/online-learning-v082-smoke.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({
  type:'SIMULATION_ONLY',notes:'Short smoke, not a verified win-rate improvement.',
  viewport:[393,852],seed:83,reports
 },null,2)+'\n');
 console.log('Online in-fight tactical learning browser smoke passed '+reports.length+'/'+reports.length);
}
run().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
