#!/usr/bin/env node
'use strict';
/* M0-S3: measure P(win) of side A vs side B as a function of team sizes and terrain, using the real
 * team-battle engine. Every seed is played twice with sides swapped (A as BLUE, then A as RED), which
 * cancels the measured BLUE-side bias of the ruins layout. Output feeds the campaign coarse model.
 * Usage: node tools/calibrate_battles.cjs [--pairs=4:4,4:6] [--maps=ruins,lanes,open] [--seeds=2001-2015] [--jobs=4] [--out=...]
 *   Fort study: --mission=control --defender=b --forts=0,1,2  (side B defends the zone with that fort level)
 */
const fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s.slice(2),'true']:[s.slice(2,i),s.slice(i+1)];}));
const P={2:'buddy2',3:'buddy3',4:'group22',5:'group23',6:'group33',8:'squad2222',10:'squad2323',12:'squad3333'};
const pairs=String(args.pairs||'4:4,3:4,4:5,4:6,4:8,6:8,6:12,8:12,2:4').split(',').map(p=>p.split(':').map(Number));
const maps=String(args.maps||'ruins,lanes,open').split(',');
const [s0,s1]=String(args.seeds||'2001-2015').split('-').map(Number);const seeds=[];for(let s=s0;s<=(s1||s0);s++)seeds.push(s);
const forts=String(args.forts||'0').split(',').map(Number),mission=args.mission||'elimination',defenderB=args.defender==='b';
const jobs=Number(args.jobs||4),out=path.resolve(args.out||'benchmarks/v090_map/m0_calibration.json');
const file='file://'+path.resolve(__dirname,'../index.html');
const tasks=[];for(const [a,b] of pairs)for(const map of maps)for(const fort of forts)for(const seed of seeds)for(const aSide of ['blue','red'])tasks.push({a,b,map,fort,seed,aSide});
(async()=>{const browser=await chromium.launch();const rows=[];let next=0;
 async function worker(){const ctx=await browser.newContext({viewport:{width:393,height:852}});await ctx.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const page=await ctx.newPage();
  while(next<tasks.length){const t=tasks[next++];const blue=t.aSide==='blue'?t.a:t.b,red=t.aSide==='blue'?t.b:t.a;
   await page.goto(file+'?mode=duel2&formation='+P[blue]+'&rformation='+P[red]+'&seed='+t.seed+'&dteam=adaptive'+(mission==='control'?'&mission=control':'')+(defenderB?'&defender='+(t.aSide==='blue'?'red':'blue')+'&fort='+t.fort:''));
   const r=await page.evaluate(map=>{const d=window.__rrtDuel2Debug,e=window.__rrtArenaDebug;const sel=document.getElementById('mapSelect');
    if(sel.value!==map){sel.value=map;sel.dispatchEvent(new Event('change',{bubbles:true}));}
    document.getElementById('start').click();let s=d.getState(),safe=true;
    for(let k=0;k<31&&s.phase!=='ended';k++){d.advance(5);s=d.getState();const v=e.validate();safe=safe&&v.fightersFree&&v.waypointsClear;}
    const side=x=>s.fighters.filter(f=>f.team===x);
    return {winner:s.winner,time:s.time,safe,alive:{blue:side('blue').filter(f=>f.hp>0).length,red:side('red').filter(f=>f.hp>0).length},
     n:{blue:side('blue').length,red:side('red').length}};},t.map);
   const other=t.aSide==='blue'?'red':'blue';
   rows.push({...t,...r,aWon:r.winner===t.aSide,bWon:r.winner===other,aLost:t.a-r.alive[t.aSide],bLost:t.b-r.alive[other]});
   process.stderr.write(`${t.a}v${t.b} ${t.map} seed ${t.seed} A=${t.aSide}: ${r.winner}\n`);}
  await ctx.close();}
 await Promise.all(Array.from({length:jobs},worker));await browser.close();
 const table=[];for(const [a,b] of pairs)for(const map of maps)for(const fort of forts){const rr=rows.filter(r=>r.a===a&&r.b===b&&r.map===map&&r.fort===fort);const n=rr.length,w=rr.filter(r=>r.aWon).length,l=rr.filter(r=>r.bWon).length;
  table.push({a,b,map,fort,mission,defender:defenderB?'b':null,n,aWins:w,bWins:l,draws:n-w-l,pA:+(w/n).toFixed(3),meanALost:+(rr.reduce((s,r)=>s+r.aLost,0)/n).toFixed(2),meanBLost:+(rr.reduce((s,r)=>s+r.bLost,0)/n).toFixed(2),unsafe:rr.filter(r=>!r.safe).length});}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({type:'SIMULATION_ONLY',note:'side-swapped per seed; per-side radio not yet modelled',mission,defender:defenderB?'side B defends (fort around its zone anchor)':null,table,rows},null,1)+'\n');
 for(const t of table)console.log(JSON.stringify(t));
})().catch(e=>{console.error(e);process.exit(1);});
