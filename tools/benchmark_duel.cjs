#!/usr/bin/env node
/* Reproducible BLUE vs RED DUEL comparison against untouched RRT Arena v0.6.10.
 * This harness does not alter gameplay, enemy stats, health, weapons, or AI code.
 * Each match opens the exact repository index.html, seeds the built-in RNG,
 * freezes requestAnimationFrame, and advances the published game at 1/60 s.
 *
 * Examples:
 * node tools/benchmark_duel.cjs --seeds 1001-1100 --maps ruins,lanes,open \
 *   --profile default --width 393 --height 852 --jobs 4 --out benchmarks/duel-default.json
 * node tools/benchmark_duel.cjs --seeds 1001-1100 --maps ruins,lanes,open \
 *   --profile balanced --width 393 --height 852 --jobs 4 --out benchmarks/duel-balanced.json
 *
 * Profile 'default' = default BLUE cautious, RED aggressive.
 * Profile 'balanced' changes only the user-visible strategy selectors to balanced for both;
 * their built-in capabilities and agent stats remain unchanged.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const VERSION='RRT ARENA 06.10';
const SOURCE_SHA='28bd90f11a70ebc5f16fc37f9a35c104406237e3';
function parse(argv){
 const opts={seeds:'1001-1020',maps:'ruins,lanes,open',profile:'default',width:393,height:852,jobs:4,out:null,file:'index.html',url:null};
 for(let i=2;i<argv.length;i++){
  if(!argv[i].startsWith('--'))throw Error('Unexpected CLI argument '+argv[i]);
  const key=argv[i++].slice(2);opts[key]=argv[i];
 }
 opts.width=Number(opts.width);opts.height=Number(opts.height);opts.jobs=Number(opts.jobs);
 if(!Number.isInteger(opts.jobs)||opts.jobs<1||opts.jobs>10)throw Error('--jobs must be 1..10');
 if(!['default','balanced'].includes(opts.profile))throw Error('Unknown --profile');
 opts.maps=String(opts.maps).split(',').map(s=>s.trim()).filter(Boolean);
 if(!opts.maps.length||opts.maps.some(m=>!['ruins','lanes','open'].includes(m)))throw Error('Unknown --maps');
 const seeds=[];
 for(const part of String(opts.seeds).split(',')){
  const m=/^(\d+)(?:-(\d+))?$/.exec(part.trim());if(!m)throw Error('Bad seed expression '+part);
  const a=Number(m[1]),b=m[2]===undefined?a:Number(m[2]);
  if(b<a||b-a>2000)throw Error('Bad seed range '+part);
  for(let i=a;i<=b;i++)seeds.push(i);
 }
 opts.seedList=[...new Set(seeds)];
 if(!opts.seedList.length)throw Error('No seeds');
 return opts;
}
function mean(arr,k){if(!arr.length)return null;return Math.round(arr.reduce((n,a)=>n+Number(a[k]||0),0)/arr.length*100)/100;}
function wilson(wins,n){
 if(!n)return [null,null];
 const z=1.96,p=wins/n,z2=z*z,d=1+z2/n;
 const c=(p+z2/(2*n))/d,delta=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/d;
 return [Math.round((c-delta)*1000)/10,Math.round((c+delta)*1000)/10];
}
function rollup(rows){
 const w=rows.filter(r=>r.winner==='blue').length;
 const l=rows.filter(r=>r.winner==='red').length,draw=rows.filter(r=>r.winner==='draw').length;
 return {matches:rows.length,blueWins:w,redWins:l,draws:draw,
  bluePct:Math.round(w/rows.length*1000)/10,redPct:Math.round(l/rows.length*1000)/10,
  drawPct:Math.round(draw/rows.length*1000)/10,blueWilson95: wilson(w,rows.length),
  meanBlueHp:mean(rows,'blueHp'),meanRedHp:mean(rows,'redHp'),
  meanSeconds:mean(rows,'seconds'),meanBluePlans:mean(rows,'bluePlans'),
  meanRedPlans:mean(rows,'redPlans'),
  decidedByKo:rows.filter(r=>r.decidedBy==='KO').length,
  decidedByTimeout:rows.filter(r=>r.decidedBy==='time/HP').length,
  invalid:rows.filter(r=>!r.valid).length};
}
async function runOne(page,url,map,seed,profile){
 const origin=url+(url.includes('?')?'&':'?')+'seed='+seed;
 await page.goto(origin,{waitUntil:'load'});
 const result=await page.evaluate(({map,seed,profile})=>{
  const $=id=>document.getElementById(id),send=(el)=>el.dispatchEvent(new Event('change',{bubbles:true}));
  if(document.title.indexOf('RRT ARENA 06.10')!==0)throw Error('Wrong build '+document.title);
  if(!$('scenarioMode')||$('scenarioMode').value!=='duel')throw Error('not in original Duel mode');
  $('mapSelect').value=map;send($('mapSelect'));
  if(profile==='balanced'){
   $('blueStyle').value='balanced';send($('blueStyle'));
   $('redStyle').value='balanced';send($('redStyle'));
  }else if($('blueStyle').value!=='cautious'||$('redStyle').value!=='aggressive'){
   throw Error('default strategy controls have changed');
  }
  // Reset after applying only existing user controls; no hidden game state mutation.
  $('reset').click();$('start').click();
  const debug=window.__rrtArenaDebug,init=debug.getState();
  if(!init.blueCapabilities?.predictive||!init.blueCapabilities?.rangedDefense||
     !init.blueCapabilities?.keepMoving)throw Error('Unified BLUE features disabled');
  const start=performance.now();
  debug.advance(151);
  const st=debug.getState();
  const valid=st.scenario==='duel'&&st.phase==='ended'&&
   ['blue','red','draw'].includes(st.replay.winner)&&
   st.bots.length===2&&st.bots.every(b=>Number.isFinite(b.hp)&&b.hp>=0&&b.hp<=120)&&
   debug.validate().fightersFree&&debug.validate().waypointsClear;
  const outcome=st.bots.some(b=>b.hp<=0)?'KO':'time/HP';
  return {seed,map,profile,valid,winner:st.replay.winner||'unfinished',
   blueHp:Math.round(st.bots[0].hp*10)/10,redHp:Math.round(st.bots[1].hp*10)/10,
   bluePlans:st.bots[0].planCount,redPlans:st.bots[1].planCount,
   blueStrategy:st.bots[0].strategy,redStrategy:st.bots[1].strategy,
   seconds:Math.round(st.time*10)/10,decidedBy:outcome,
   cpuMs:Math.round(performance.now()-start),
   blueCapabilities:init.blueCapabilities};
 },{map,seed,profile});
 return result;
}
async function main(){
 const opts=parse(process.argv);
 const uri=opts.url||( 'file://'+path.resolve(opts.file));
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const jobs=[];for(const map of opts.maps)for(const seed of opts.seedList)jobs.push({map,seed});
 const results=[];let next=0,failed=0;
 console.error('Benchmark build '+VERSION+' commit '+SOURCE_SHA+'; profile='+opts.profile+
  ', matches='+jobs.length+', viewport='+opts.width+'x'+opts.height+', workers='+opts.jobs);
 async function worker(){
  const context=await browser.newContext({viewport:{width:opts.width,height:opts.height}});
  await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const page=await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror',e=>{console.error('PAGE ERROR '+String(e));failed++;});
  for(;;){
   const n=next++;if(n>=jobs.length)break;
   const job=jobs[n];
   try{
    const row=await runOne(page,uri,job.map,job.seed,opts.profile);
    results.push(row);if(!row.valid){console.error('INVALID '+JSON.stringify(row));failed++;}
    console.error('DONE '+opts.profile+' '+job.map+' seed='+job.seed+
      ' winner='+row.winner+' B='+row.blueHp+' R='+row.redHp+
      ' sec='+row.seconds+' CPU='+row.cpuMs+'ms');
   }catch(e){failed++;console.error('MATCH FAILURE '+job.map+' seed='+job.seed+': '+String(e));}
  }
  await context.close();
 }
 try{await Promise.all(Array.from({length:opts.jobs},worker));}
 finally{await browser.close();}
 results.sort((a,b)=>opts.maps.indexOf(a.map)-opts.maps.indexOf(b.map)||a.seed-b.seed);
 const byMap=Object.fromEntries(opts.maps.map(map=>[map,rollup(results.filter(r=>r.map===map))]));
 const summary={build:VERSION,sourceSha:SOURCE_SHA,scenario:'DUEL 1v1',profile:opts.profile,
  defaultStrategies:{blue:'cautious',red:'aggressive'},
  viewport:[opts.width,opts.height],seeds:opts.seeds,plannedMatches:jobs.length,
  ...rollup(results),byMap,failed};
 const report={summary,results};
 console.log('BENCHMARK_SUMMARY '+JSON.stringify(summary));
 if(opts.out){const output=path.resolve(opts.out);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 if(failed||results.length!==jobs.length||byMap[opts.maps[0]].matches!==opts.seedList.length)
  throw Error('Benchmark failed/incomplete: '+failed+' errors, '+results.length+'/'+jobs.length+' bouts');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
