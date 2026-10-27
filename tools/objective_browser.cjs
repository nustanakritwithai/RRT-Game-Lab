#!/usr/bin/env node
'use strict';
// RRT ARENA v0.9 objective smoke in real Chromium. No claim of real-world tactics.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const base='file://'+path.resolve(__dirname,'../index.html');
const cases=[
 {formation:'buddy2',mission:'control',width:320,map:'open'},
 {formation:'buddy3',mission:'control',width:393,map:'ruins'},
 {formation:'group23',mission:'control',width:393,map:'open'},
 {formation:'squad2222',mission:'control',width:393,map:'open'},
 {formation:'squad3333',mission:'control',width:393,map:'open'},
 {formation:'buddy2',mission:'elimination',width:393,map:'open'}
];
(async()=>{
 const browser=await chromium.launch({headless:true});
 let checked=0;
 try{
  for(const test of cases){
   const context=await browser.newContext({
    viewport:{width:test.width,height:test.width===320?720:852}
   });
   await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'?mode=duel2&formation='+test.formation+
    '&mission='+test.mission+'&dteam=adaptive&seed=83');
   const result=await page.evaluate(({mission,map})=>{
    const d=window.__rrtDuel2Debug;
    const choose=document.getElementById('mapSelect');
    choose.value=map;choose.dispatchEvent(new Event('change',{bubbles:true}));
    const start=d.getState();
    const missionDiv=document.getElementById('duel2ObjectiveStatus');
    const missionSelect=document.getElementById('duel2Objective');
    let placed=null;
    if(mission==='control')placed=d.forcePosition('B1',start.objective.point);
    document.getElementById('start').click();
    d.advance(.25);
    const end=d.getState();
    const scoreText=missionDiv.textContent;
    const goalText=missionSelect.value;
    const safe=window.__rrtArenaDebug.validate();
    return {start,end,safe,placed,scoreText,goalText,
     visible:!missionDiv.hidden,
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     height:document.getElementById('stage').getBoundingClientRect().height};
   },{mission:test.mission,map:test.map});
   const s=result.end;
   assert.deepEqual(errors,[],'page errors '+JSON.stringify(test)+' '+errors.join(' | '));
   assert.equal(s.fighters.length,2*(test.formation==='buddy2'?2:
    test.formation==='buddy3'?3:test.formation==='group23'?5:
    test.formation==='squad2222'?8:12));
   assert.ok(s.fighters.every(b=>b.stats.hp===120&&b.stats.ammo===6),
    'same original stats for B and R');
   assert.ok(result.safe.fightersFree&&result.safe.waypointsClear,'safe physical positions');
   assert.ok(result.overflow<=0&&result.height>200,'mobile layout');
   assert.equal(result.goalText,test.mission);
   if(test.mission==='control'){
    assert.equal(result.visible,true,'scoreboard visible');
    assert.equal(result.placed,true,'can set up deterministic capture fixture');
    assert.equal(s.objective.mode,'control');
    assert.ok(s.objective.scores.blue>0,'Blue occupancy accumulates score');
    assert.ok(s.objective.scores.blue<=s.objective.targetSeconds);
    assert.equal(s.objective.scores.red,0,'Red scores only when physically present');
    assert.match(result.scoreText,/ยึดจุด A/);
   }else{
    assert.equal(result.visible,false,'legacy elimination has no zone HUD');
    assert.equal(s.objective,null,'elimination has no objective state');
   }
   checked++;
   console.log('PASS '+test.formation+' '+test.mission+' '+test.width+'px'+
    ' B='+s.objective?.scores.blue);
   await context.close();
  }
  console.log('Control mission Chromium smoke '+checked+'/'+cases.length+' PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
