#!/usr/bin/env node
'use strict';
// Seed-paired full-match browser simulation. No military field data or real AI superiority claims.
// This deliberately observes 150 simulated seconds, rather than 25-second smoke outcomes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{
 const i=s.indexOf('=');return i<0?[s.slice(2),'true']:[s.slice(2,i),s.slice(i+1)];
}));
const presets={buddy2:2,buddy3:3,group22:4,group23:5,group33:6,
 squad2222:8,squad2323:10,squad3333:12};
const modes={independent:'',cooperative:'&dteam=coop',adaptive:'&dteam=adaptive',
 cooperative_outage:'&dteam=coop&loss=100',adaptive_outage:'&dteam=adaptive&loss=100'};
const parseCsv=(v,fallback)=>String(v??fallback).split(',').map(x=>x.trim()).filter(Boolean);
const seeds=parseCsv(args.seeds,'83').map(Number);
const formations=parseCsv(args.formations,'buddy2,group23');
const conditions=parseCsv(args.modes,'independent,adaptive');
const output=path.resolve(args.out||'benchmarks/formation-fullmatch-v08.json');
assert.ok(seeds.length&&seeds.every(x=>Number.isInteger(x)&&x>=0&&x<=999999999));
assert.ok(formations.length&&formations.every(x=>presets[x]));
assert.ok(conditions.length&&conditions.every(x=>Object.hasOwn(modes,x)));
const file='file://'+path.resolve(__dirname,'../index.html');
const sum=(a,k)=>a.reduce((v,r)=>v+(r[k]||0),0);
async function run(){
 const browser=await chromium.launch();
 const rows=[],failures=[];
 const started=Date.now();
 try{
  for(const formation of formations)for(const seed of seeds)for(const mode of conditions){
   const context=await browser.newContext({viewport:{width:393,height:852}});
   await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   const before=Date.now();
   try{
    await page.goto(file+'?mode=duel2&formation='+formation+'&seed='+seed+modes[mode]);
    const row=await page.evaluate(({formation,seed,mode,expected})=>{
     const d=window.__rrtDuel2Debug,engine=window.__rrtArenaDebug;
     const map=document.getElementById('mapSelect');
     map.value='open';map.dispatchEvent(new Event('change',{bubbles:true}));
     const initial=d.getState(),reference=initial.fighters[0]?.stats;
     const parity=initial.fighters.length===2*expected&&initial.fighters.every(b=>
      JSON.stringify(b.stats)===JSON.stringify(reference));
     document.getElementById('start').click();
     const frames=[];let safe=true,last=d.getState();
     // The published game completes at elimination or 150s, with fixed 60fps stepping.
     // Break early on elimination; never infer a winner from a partial run.
     for(let k=0;k<31&&last.phase!=='ended';k++){
      d.advance(k===30?.5:5);
      last=d.getState();
      const valid=engine.validate();
      safe=safe&&valid.fightersFree&&valid.waypointsClear;
      frames.push({time:Number(last.time.toFixed(2)),
       fightersFree:valid.fightersFree,waypointsClear:valid.waypointsClear,
       blueHp:last.fighters.filter(b=>b.team==='blue')
       .reduce((n,b)=>n+b.hp,0),redHp:last.fighters.filter(b=>b.team==='red')
       .reduce((n,b)=>n+b.hp,0),plans:last.fighters.reduce((n,b)=>n+b.planCount,0),
       radioSent:last.radio.sent});
     }
     const blue=last.fighters.filter(b=>b.team==='blue'),red=last.fighters.filter(b=>b.team==='red');
     const bh=blue.reduce((n,b)=>n+b.hp,0),rh=red.reduce((n,b)=>n+b.hp,0);
     const bs=blue.reduce((n,b)=>n+b.shots,0),rs=red.reduce((n,b)=>n+b.shots,0);
     const startHp=expected*120;
     return {formation,seed,mode,parity,ended:last.phase==='ended',duration:last.time,
      winner:last.winner,termination:last.phase==='ended'?
       last.time>=149.9?'timeout':'elimination':null,
      blueHp:bh,redHp:rh,blueAlive:blue.filter(b=>b.hp>0).length,
      redAlive:red.filter(b=>b.hp>0).length,
      shotsBlue:bs,shotsRed:rs,
      blueDamagePerShot:bs?(startHp-rh)/bs:null,
      redDamagePerShot:rs?(startHp-bh)/rs:null,
      plans:blue.concat(red).reduce((n,b)=>n+b.planCount,0),
      targetSwitches:last.targetSwitches,focusOverlap:last.focusOverlap,
      focusSamples:last.focusOverlapSamples,heldFire:last.heldFire,
      blockedFriendly:last.blockedFriendly,laneMoves:last.laneMoves,
      sent:last.radio.sent,delivered:last.radio.delivered,dropped:last.radio.dropped,
      meshRetries:(last.peerMesh?.agents||[]).reduce((n,b)=>n+(b.retries||0),0),
      meshAcks:(last.peerMesh?.agents||[]).reduce((n,b)=>n+(b.acknowledged||0),0),
      evidenceAccepted:last.radio.evidenceAccepted,evidenceConflicts:last.radio.conflicts,
      noCrossTeamBids:last.fighters.every(b=>b.receivedBids.every(id=>id[0]===b.id[0])),
      ownMemories:last.fighters.every(b=>b.memoryCount===expected&&b.memoryUnique),
      safe,frames};
    },{formation,seed,mode,expected:presets[formation]});
    row.wallclockMs=Date.now()-before;
    row.pageErrors=errors.slice();
    const wrong=!row.parity||!row.ended||!row.safe||!row.ownMemories||!row.noCrossTeamBids||
     errors.length>0||row.duration>150.6||!Number.isFinite(row.blueHp)||!Number.isFinite(row.redHp)||
     mode==='independent'&&(row.sent!==0||row.delivered!==0)||
     mode.endsWith('_outage')&&(row.delivered!==0||row.dropped!==row.sent);
    if(wrong)failures.push({formation,seed,mode,
     reason:'failed fairness / end-of-match / collision / radio invariant',row});
    rows.push(row);
    console.log((wrong?'FAIL ':'PASS ')+formation+' '+mode+' seed='+seed+
     ' '+row.termination+' '+row.winner+' @ '+row.duration.toFixed(2)+'s'+
     ' HP='+row.blueHp.toFixed(1)+'/'+row.redHp.toFixed(1)+
     ' radio='+row.delivered+'/'+row.sent+
     ' runMs='+row.wallclockMs);
   }catch(e){
    failures.push({formation,seed,mode,error:String(e?.stack||e)});
    console.error('FAIL '+formation+' '+mode+' seed='+seed,String(e?.stack||e));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 const groups=[];
 for(const formation of formations)for(const mode of conditions){
  const rr=rows.filter(r=>r.formation===formation&&r.mode===mode);
  if(!rr.length)continue;
  groups.push({formation,mode,n:rr.length,blueWins:rr.filter(r=>r.winner==='blue').length,
   redWins:rr.filter(r=>r.winner==='red').length,draws:rr.filter(r=>r.winner==='draw').length,
   timeouts:rr.filter(r=>r.termination==='timeout').length,
   unfinished:rr.filter(r=>!r.ended).length,
   meanBlueHp:sum(rr,'blueHp')/rr.length,meanRedHp:sum(rr,'redHp')/rr.length,
   meanBlueDamagePerShot:sum(rr,'blueDamagePerShot')/rr.length,
   meanRedDamagePerShot:sum(rr,'redDamagePerShot')/rr.length,
   meanTargetSwitches:sum(rr,'targetSwitches')/rr.length,
   focusOverlapPercent:sum(rr,'focusSamples')?100*sum(rr,'focusOverlap')/sum(rr,'focusSamples'):null,
   meanRadioSent:sum(rr,'sent')/rr.length,meanMeshRetries:sum(rr,'meshRetries')/rr.length});
 }
 const report={type:'SIMULATION_ONLY',head:process.env.GITHUB_SHA||null,
  seeds,formations,conditions,horizonSeconds:150,viewport:[393,852],
  pairedBy:'same seed and formation across independent/cooperative/adaptive conditions',
  sideSwap:false,sampleSizeWarning:'Small pilot, no statistical power, no measured win-rate superiority.',
  aggregationNote:'Damage per shot = simulated opponent HP lost / shots fired, not a precision hit estimate.',
  runMs:Date.now()-started,groups,rows,failures};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log('Full-match pilot:',JSON.stringify(groups));
 console.log('Written:',output,'rows:',rows.length,'failures:',failures.length,'elapsedMs:',report.runMs);
 if(failures.length||rows.length!==formations.length*seeds.length*conditions.length)process.exitCode=1;
}
run().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
