#!/usr/bin/env node
'use strict';
/* M0-S2: wall-clock cost of one full headless team battle (fixed 1/60 s steps, no rendering),
 * at normal speed and under Chromium CPU throttling (default 4x, a rough mid-range-phone proxy).
 * Usage: node tools/measure_battle_runtime.cjs [--throttle=4] [--seeds=1001-1005] [--out=file.json]
 */
const fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s.slice(2),'true']:[s.slice(2,i),s.slice(i+1)];}));
const seeds=(args.seeds||'1001-1005').split('-').map(Number);const list=[];for(let s=seeds[0];s<=(seeds[1]??seeds[0]);s++)list.push(s);
const sizes=(args.formations||'group22,group33,squad2222,squad3333').split(',');
const throttles=[1,Number(args.throttle||4)];
const file='file://'+path.resolve(__dirname,'../index.html');
(async()=>{const browser=await chromium.launch();const rows=[];
 for(const rate of throttles)for(const formation of sizes)for(const seed of list){
  const ctx=await browser.newContext({viewport:{width:393,height:852}});await ctx.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const page=await ctx.newPage();const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  await page.goto(file+'?mode=duel2&formation='+formation+'&seed='+seed+'&dteam=adaptive');
  const r=await page.evaluate(()=>{const d=window.__rrtDuel2Debug;document.getElementById('start').click();const t0=performance.now();let s=d.getState();
   for(let k=0;k<31&&s.phase!=='ended';k++){d.advance(5);s=d.getState();}return {ms:performance.now()-t0,simSeconds:s.time};});
  rows.push({rate,formation,seed,...r});process.stderr.write(`x${rate} ${formation} seed ${seed}: ${(r.ms/1000).toFixed(2)} s for ${r.simSeconds.toFixed(0)} s sim\n`);await ctx.close();}
 await browser.close();
 const summary=[];for(const rate of throttles)for(const formation of sizes){const rr=rows.filter(r=>r.rate===rate&&r.formation===formation);
  const ms=rr.map(r=>r.ms).sort((a,b)=>a-b);summary.push({throttle:rate,formation,meanSeconds:+(ms.reduce((a,b)=>a+b,0)/ms.length/1000).toFixed(2),maxSeconds:+(ms[ms.length-1]/1000).toFixed(2),meanSimSeconds:+(rr.reduce((a,r)=>a+r.simSeconds,0)/rr.length).toFixed(1)});}
 for(const s of summary)console.log(JSON.stringify(s));
 if(args.out){fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(args.out,JSON.stringify({type:'SIMULATION_RUNTIME',note:'CPU throttling is a rough proxy, not a real-device measurement',summary,rows},null,1)+'\n');}
})().catch(e=>{console.error(e);process.exit(1);});
