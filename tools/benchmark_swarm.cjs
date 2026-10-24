#!/usr/bin/env node
/* RRT Arena seeded swarm benchmark (test harness only).
 * Loads index.html?mode=multi in headless Chromium, replaces Math.random with a seeded
 * PRNG *inside the harness*, freezes requestAnimationFrame so only fixed 1/60 s steps
 * advance the match, then plays one full melee wave per seed.
 *
 * Usage:
 *   node tools/benchmark_swarm.cjs --seeds 1-30 --count 24 --difficulty balanced \
 *     --kite on --predictive on [--file index.html] [--jobs 4] [--out result.json]
 *
 * Same seed + same flags + same viewport => same match. Enemy stats and BLUE stats are
 * never modified by the harness; it only toggles the strategy switches exposed in the UI.
 */
'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');

function args(argv){
  const o={seeds:'1-10',count:24,difficulty:'balanced',kite:'on',predictive:'on',file:'index.html',jobs:4,out:null,width:1365,height:900,label:null};
  for(let i=2;i<argv.length;i++){const k=argv[i].replace(/^--/,'');o[k]=argv[++i];}
  o.count=Number(o.count);o.jobs=Number(o.jobs);o.width=Number(o.width);o.height=Number(o.height);
  return o;
}
function seedList(spec){
  const out=[];for(const part of String(spec).split(',')){const [a,b]=part.split('-').map(Number);if(Number.isFinite(b))for(let s=a;s<=b;s++)out.push(s);else out.push(a);}
  return out;
}
// Harness-only deterministic PRNG and frozen animation clock.
const initScript=()=>{
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  window.__reseed=seed=>{Math.random=mulberry32(seed>>>0);};
  window.__reseed(1);
  window.requestAnimationFrame=()=>0;
};
async function runOne(page,url,opts,seed){
  await page.goto(url);
  return page.evaluate(async({seed,opts})=>{
    const $=id=>document.getElementById(id);
    const fire=(el,type='change')=>el.dispatchEvent(new Event(type,{bubbles:true}));
    const setCheck=(id,on)=>{const el=$(id);if(!el)return on===false;if(el.checked!==on){el.checked=on;fire(el);}return true;};
    $('multiMelee').checked=true;fire($('multiMelee'));
    $('multiDifficulty').value=opts.difficulty;fire($('multiDifficulty'));
    $('multiPreset').value=String(opts.count);fire($('multiPreset'));
    setCheck('multiKite',opts.kite==='on');
    const hasPredictive=setCheck('multiPredict',opts.predictive==='on');
    window.__reseed(seed);
    $('reset').click();
    $('start').click();
    const dbg=window.__rrtArenaDebug,md=window.__rrtMultiDebug;
    const t0=performance.now();
    for(let s=0;s<160&&dbg.getState().phase==='running';s++)dbg.advance(1);
    const st=md.getState(),last=st.waveHistory[st.waveHistory.length-1]||null;
    return {seed,winner:last?.winner??'unfinished',hp:Math.max(0,Math.round(st.blue.hp*10)/10),seconds:last?.seconds??st.time,
      kills:st.eliminated,alive:st.targets.filter(t=>t.active).length,meleeHits:st.meleeHits,damageTaken:Math.round(st.damageTaken*10)/10,
      kites:st.kites,microMoves:st.microMoves,planFailures:st.planFailures??null,predictive:st.predictive??null,
      hasPredictiveSwitch:hasPredictive,wallClockMs:Math.round(performance.now()-t0),title:document.title};
  },{seed,opts});
}
async function main(){
  const o=args(process.argv);const seeds=seedList(o.seeds);
  const file=path.resolve(o.file);const url='file://'+file+'?mode=multi';
  const browser=await chromium.launch();const results=[];let next=0;
  async function worker(){
    const ctx=await browser.newContext({viewport:{width:o.width,height:o.height}});
    await ctx.addInitScript(initScript);const page=await ctx.newPage();
    while(next<seeds.length){const seed=seeds[next++];const r=await runOne(page,url,o,seed);results.push(r);
      process.stderr.write(`seed ${seed}: ${r.winner} hp=${r.hp} t=${r.seconds} alive=${r.alive} hits=${r.meleeHits} fail=${r.planFailures}\n`);}
    await ctx.close();
  }
  await Promise.all(Array.from({length:Math.max(1,o.jobs)},worker));
  await browser.close();
  results.sort((a,b)=>a.seed-b.seed);
  const wins=results.filter(r=>r.winner==='blue').length,n=results.length,p=wins/n;
  // Wilson 95% interval for the win rate.
  const z=1.96,den=1+z*z/n,centre=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  const mean=k=>Math.round(10*results.reduce((s,r)=>s+(r[k]||0),0)/n)/10;
  const summary={label:o.label,file:path.basename(file),viewport:`${o.width}x${o.height}`,count:o.count,difficulty:o.difficulty,kite:o.kite,predictive:o.predictive,
    seeds:o.seeds,matches:n,wins,winRate:Math.round(1000*p)/10,wilson95:[Math.round(1000*(centre-half))/10,Math.round(1000*(centre+half))/10],
    meanHp:mean('hp'),meanSeconds:mean('seconds'),meanAlive:mean('alive'),meanMeleeHits:mean('meleeHits'),meanPlanFailures:results[0]?.planFailures==null?null:mean('planFailures')};
  const report={summary,results};
  console.log(JSON.stringify(summary));
  if(o.out)fs.writeFileSync(o.out,JSON.stringify(report,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
