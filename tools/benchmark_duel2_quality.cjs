#!/usr/bin/env node
'use strict';
// Seed-paired 2v2 combat QA. Exploratory simulation, NOT measured AI superiority.
// No changes to HP, speed, damage, ammunition or fire frequency.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const seeds=[83,311,511,713];
const conditions=[
 {name:'independent',query:''},
 {name:'cooperative',query:'&dteam=coop'},
 {name:'radio_outage',query:'&dteam=coop&loss=100'}
];
const file='file://'+path.resolve(__dirname,'../index.html');
const output=path.resolve(__dirname,'../benchmarks/duel2-v0617.json');
const sum=(items,key)=>items.reduce((n,a)=>n+(a[key]||0),0);
async function run(){
 const browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:393,height:852}});
 // Use harness stepping, not real time, so the seeded world is reproducible.
 await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(String(err)));
 const rows=[];
 try{
  for(const condition of conditions)for(const seed of seeds){
   await page.goto(file+'?mode=duel2&seed='+seed+condition.query);
   const data=await page.evaluate(()=>{
    const d=window.__rrtDuel2Debug,engine=window.__rrtArenaDebug;
    const selector=document.getElementById('mapSelect');
    selector.value='open';selector.dispatchEvent(new Event('change',{bubbles:true}));
    const initial=d.getState(),reference=initial.fighters[0]?.stats;
    const parity=initial.fighters.length===4&&initial.fighters.every(f=>
     JSON.stringify(f.stats)===JSON.stringify(reference));
    document.getElementById('start').click();
    let frames=[];
    for(let i=0;i<5;i++){
     d.advance(5);
     const state=d.getState(),valid=engine.validate();
     frames.push({time:state.time,
      shots:state.fighters.reduce((n,f)=>n+f.shots,0),
      blueHp:state.fighters.filter(f=>f.team==='blue').reduce((n,f)=>n+f.hp,0),
      redHp:state.fighters.filter(f=>f.team==='red').reduce((n,f)=>n+f.hp,0),
      positionsValid:valid.fightersFree&&valid.waypointsClear});
     if(state.phase==='ended')break;
    }
    const last=d.getState();
    return {mode:last.mode,radioLoss:last.packetLoss,sourceVersion:initial.version,
     parity,complete:last.phase==='ended',winner:last.winner,duration:last.time,
     shotsBlue:last.fighters.filter(b=>b.team==='blue').reduce((n,b)=>n+b.shots,0),
     shotsRed:last.fighters.filter(b=>b.team==='red').reduce((n,b)=>n+b.shots,0),
     plans:last.fighters.reduce((n,b)=>n+b.planCount,0),
     blueHp:last.fighters.filter(b=>b.team==='blue').reduce((n,b)=>n+b.hp,0),
     redHp:last.fighters.filter(b=>b.team==='red').reduce((n,b)=>n+b.hp,0),
     friendlyBlocks:last.blockedFriendly,heldFire:last.heldFire,
     targetSwitches:last.targetSwitches,focusOverlap:last.focusOverlap,focusOverlapSamples:last.focusOverlapSamples,\n     suppressedSightings:last.suppressedSightings,
     laneMoves:last.laneMoves,
     sent:last.radio.sent,delivered:last.radio.delivered,dropped:last.radio.dropped,
     evidenceAccepted:last.radio.evidenceAccepted,conflicts:last.radio.conflicts,
     noCrossTeamBids:last.fighters.every(b=>b.receivedBids.every(id=>id[0]===b.id[0])),
     samples:frames};
   });
   const row={seed,condition:condition.name,...data};rows.push(row);
   console.log(condition.name+' seed '+seed+': shots '+row.shotsBlue+'/'+row.shotsRed+
    ' plans '+row.plans+' HP '+Math.round(row.blueHp)+'/'+Math.round(row.redHp)+
    ' radio '+row.delivered+'/'+row.sent+' conflicts '+row.conflicts+
    ' lane moves '+row.laneMoves);
  }
 }finally{await context.close();await browser.close();}
 const invalid=rows.filter(r=>!r.parity||!r.noCrossTeamBids||
  r.samples.some(v=>!v.positionsValid)||r.plans===0||
  r.condition==='independent'&&(r.sent!==0||r.delivered!==0)||
  r.condition==='radio_outage'&&(r.delivered!==0||r.dropped!==r.sent));
 const groups=conditions.map(c=>{
  const rr=rows.filter(r=>r.condition===c.name);
  return {mode:c.name,matches:rr.length,blueWins:rr.filter(r=>r.winner==='blue').length,
   redWins:rr.filter(r=>r.winner==='red').length,draws:rr.filter(r=>r.winner==='draw').length,
   unfinished:rr.filter(r=>!r.complete).length,
   averageBlueShots:sum(rr,'shotsBlue')/rr.length,averageRedShots:sum(rr,'shotsRed')/rr.length,
   averageLaneMoves:sum(rr,'laneMoves')/rr.length,
   averageFriendlyBlocks:sum(rr,'friendlyBlocks')/rr.length,
   averageTargetSwitches:sum(rr,'targetSwitches')/rr.length,
   averageSuppressedSightings:sum(rr,'suppressedSightings')/rr.length,
   focusOverlapPercent:sum(rr,'focusOverlapSamples')?100*sum(rr,'focusOverlap')/sum(rr,'focusOverlapSamples'):null,
   averageRadioSent:sum(rr,'sent')/rr.length,
   accepted:sum(rr,'evidenceAccepted'),conflicts:sum(rr,'conflicts')};
 });
 const report={type:'simulation-only',version:'0.6.17',seedCount:seeds.length,
  seedPolicy:'paired deterministic world, independent named random streams',
  viewport:[393,852],horizonSeconds:25,
  caveat:'Smoke sample only; no causal or general win-rate claim. Unfinished matches are NOT losses.',
  groups,rows,errors,invalidCount:invalid.length};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log('Exploratory paired summaries:',JSON.stringify(groups));
 console.log('Saved:',output,'invalid:',invalid.length,'browser errors:',errors.length);
 if(invalid.length||errors.length){console.error('Invariant violations:',JSON.stringify(invalid.slice(0,3)));process.exitCode=1;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
