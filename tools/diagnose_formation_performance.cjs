#!/usr/bin/env node
'use strict';
// CPU/render profiling is an EXPERIMENT on the existing unmodified combat engine.
// "wallMs" measures browser CPU work, NOT physical-device FPS or combat superiority.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base='file://'+path.resolve(__dirname,'../index.html');
const output=path.resolve(__dirname,'../benchmarks/formation-performance-v080.json');
const cases=[
 {formation:'group33',mode:'independent'}, {formation:'group33',mode:'adaptive'},
 {formation:'squad2222',mode:'independent'}, {formation:'squad2222',mode:'adaptive'},
 {formation:'squad3333',mode:'independent'}, {formation:'squad3333',mode:'adaptive'},
 {formation:'squad3333',mode:'adaptive',learn:true}
];
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
const percent=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor((a.length-1)*p))]:0;
const round=n=>Math.round(n*100)/100;
function stateMetrics(state){
 return {time:round(state.time),phase:state.phase,
  alive:state.fighters.filter(x=>x.hp>0).length,
  totalPlans:state.fighters.reduce((n,x)=>n+x.planCount,0),
  sent:state.radio.sent,delivered:state.radio.delivered,
  retries:state.peerMesh?.agents?.reduce((n,x)=>n+(x.retries||0),0)||0,
  focusSwitches:state.targetSwitches,blockedFriendly:state.blockedFriendly};
}
async function prepare(page,c){
 await page.goto(base+'?mode=duel2&formation='+c.formation+'&dteam='+
  (c.mode==='adaptive'?'adaptive':'independent')+'&seed=83'+(c.learn?'&learn=1':''));
 await page.evaluate(()=>{
  const el=document.getElementById('mapSelect');el.value='open';
  el.dispatchEvent(new Event('change',{bubbles:true}));
  document.getElementById('start').click();
 });
}
async function cpuCase(browser,c){
 const context=await browser.newContext({viewport:{width:393,height:852}});
 await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await prepare(page,c);
  await page.evaluate(()=>window.__rrtDuel2Debug.advance(8));
  const before=await page.evaluate(()=>window.__rrtDuel2Debug.getState());
  const session=await context.newCDPSession(page);
  await session.send('Profiler.enable');await session.send('Profiler.start');
  const timed=await page.evaluate(()=>{
   const begin=performance.now();
   window.__rrtDuel2Debug.advance(4);
   return {wallMs:performance.now()-begin,state:window.__rrtDuel2Debug.getState()};
  });
  const {profile}=await session.send('Profiler.stop');
  const nodeById=new Map((profile.nodes||[]).map(n=>[n.id,n.callFrame]));
  const functions=new Map();
  for(let i=0;i<(profile.samples||[]).length;i++){
   const n=nodeById.get(profile.samples[i]),ms=(profile.timeDeltas?.[i]||1000)/1000;
   const key=(n?.functionName||'(anonymous)')+' @ '+(n?.url||'inline').split('/').pop()+':'+(n?.lineNumber||0);
   functions.set(key,(functions.get(key)||0)+ms);
  }
  await session.detach();
  const delta=Math.max(0.0001,timed.state.time-before.time);
  const perFrame=timed.wallMs/(delta*60);
  return {formation:c.formation,mode:c.mode,learn:!!c.learn,kind:'CPU_STEPPING',
   simulatedSeconds:round(delta),wallMs:round(timed.wallMs),msPerSimFrame:round(perFrame),
   benchmarkBudgetMs:16.67,source:'Chromium CI runner, synthetic 60Hz simulation',
   before:stateMetrics(before),after:stateMetrics(timed.state),
   cpuHotspots:[...functions].sort((a,b)=>b[1]-a[1]).slice(0,16).map(([name,ms])=>({name,ms:round(ms)})),
   pageErrors:errors};
 }finally{await context.close();}
}
async function framesCase(browser,c,lowDetail){
 const context=await browser.newContext({viewport:{width:393,height:852}});
 await context.addInitScript(()=>{
  window.__formationPerf={capturing:false,frames:[],lastTs:null};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=(fn)=>raf((ts)=>{
   const t=performance.now();
   fn(ts);
   const p=window.__formationPerf;
   if(p?.capturing) {
    const interval=p.lastTs===null?0:ts-p.lastTs;p.lastTs=ts;
    p.frames.push({callbackMs:performance.now()-t,intervalMs:interval});
   }
  });
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(base+'?mode=duel2&formation='+c.formation+
   '&dteam='+(c.mode==='adaptive'?'adaptive':'independent')+'&seed=83'+(c.learn?'&learn=1':''));
  const start=await page.evaluate(lowDetail=>{
   const el=document.getElementById('mapSelect');el.value='open';
   el.dispatchEvent(new Event('change',{bubbles:true}));
   if(lowDetail)for(const id of ['showTree','showPath','showMemory','showThreat']){
    const ctrl=document.getElementById(id);if(ctrl)ctrl.checked=false;
   }
   const perf=window.__formationPerf;perf.capturing=true;perf.lastTs=null;perf.frames.length=0;
   document.getElementById('start').click();return window.__rrtDuel2Debug.getState();
  },lowDetail);
  await page.waitForTimeout(3400);
  const sample=await page.evaluate(()=>{
   const p=window.__formationPerf;p.capturing=false;
   return {frames:p.frames,state:window.__rrtDuel2Debug.getState()};
  });
  const arr=sample.frames,callbacks=arr.map(x=>x.callbackMs),intervals=arr.map(x=>x.intervalMs).filter(x=>x>0);
  return {formation:c.formation,mode:c.mode,learn:!!c.learn,kind:'LIVE_CANVAS_FRAMES',lowDetail,
   observedWallSeconds:3.4,frames:arr.length,approxFramesPerSecond:round(arr.length/3.4),
   meanCallbackMs:round(mean(callbacks)),p95CallbackMs:round(percent(callbacks,.95)),
   p95FrameIntervalMs:round(percent(intervals,.95)),
   slowCallbacksOver16_7:callbacks.filter(x=>x>16.7).length,
   slowIntervalsOver33_3:intervals.filter(x=>x>33.3).length,
   gameSecondsAdvanced:round(sample.state.time-start.time),
   before:stateMetrics(start),after:stateMetrics(sample.state),pageErrors:errors};
 }finally{await context.close();}
}
async function main(){
 const browser=await chromium.launch({headless:true}),rows=[];
 try{
  for(const c of cases){
   const v=await cpuCase(browser,c);rows.push(v);
   console.log('CPU '+c.formation+' '+c.mode+' learn='+!!c.learn+' '+v.msPerSimFrame+'ms/frame; hot='+v.cpuHotspots.slice(0,5).map(t=>t.name+':'+t.ms).join(', '));
   assert.deepEqual(v.pageErrors,[]);
  }
  for(const c of [
   {formation:'group33',mode:'adaptive'},{formation:'squad2222',mode:'adaptive'},
   {formation:'squad3333',mode:'adaptive'},
   {formation:'squad3333',mode:'adaptive',learn:true}]){
   for(const lowDetail of [false,true]){
    const v=await framesCase(browser,c,lowDetail);rows.push(v);
    console.log('FRAME '+c.formation+' '+c.mode+' learn='+!!c.learn+' lowDetail='+lowDetail+' fps='+v.approxFramesPerSecond+
     ' callback p95='+v.p95CallbackMs+'ms intervals p95='+v.p95FrameIntervalMs+'ms');
    assert.deepEqual(v.pageErrors,[]);
   }
  }
 }finally{await browser.close();}
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify({
  type:'CHROMIUM_CI_PERFORMANCE_DIAGNOSTIC',
  warning:'CI CPU/GPU are not Android device; relative signal only, no true phone FPS measured.',
  seed:83,viewport:[393,852],rows
 },null,2)+'\n');
 console.log('RESULT '+output+' rows='+rows.length);
}
main().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
