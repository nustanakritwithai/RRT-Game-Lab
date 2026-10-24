#!/usr/bin/env node
/* Browser regression for RRT Arena (Chromium via Playwright).
 * Usage: node tools/browser_regression.cjs [url-or-file]   (default: ./index.html)
 * Checks duel mode, multi-target tracking (no melee), melee swarm with predictive defense,
 * collision validity, finite state, stable HUD/arena position and no horizontal scroll at
 * 320 / 393 / 1365 px, plus a short real-time run with the normal animation loop.
 */
'use strict';
const path=require('node:path');
const {chromium}=require('playwright');
const target=process.argv[2]||'index.html';
const base=/^https?:/.test(target)?target.replace(/\?.*$/,''):'file://'+path.resolve(target);
const sep=base.includes('?')?'&':'?';
const viewports=[[320,640],[393,852],[1365,900]];
let failures=0;
const check=(ok,msg)=>{console.log((ok?'  ✓ ':'  ✗ ')+msg);if(!ok)failures++;};
const frozen=()=>{function m(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}Math.random=m(7);window.requestAnimationFrame=()=>0;};
const layout=()=>{const r=e=>document.querySelector(e)?.getBoundingClientRect();return {stageTop:Math.round(r('#stage').top),stageH:Math.round(r('#stage').height),
 fighters:[...document.querySelectorAll('.fighter')].map(f=>Math.round(f.getBoundingClientRect().height)),wave:Math.round(r('#multiWaveStats').height),
 scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth};};
const finiteState=s=>[s.blue?.x,s.blue?.y,s.blue?.hp].every(Number.isFinite)&&s.targets.every(t=>Number.isFinite(t.x)&&Number.isFinite(t.y));

async function main(){
 const browser=await chromium.launch();
 for(const [w,h] of viewports){
  console.log(`\n▶ viewport ${w}x${h}`);
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  await ctx.addInitScript(frozen);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  // Duel mode stays the original 1v1 arena.
  await page.goto(base);
  const duel=await page.evaluate(()=>{const d=window.__rrtArenaDebug;document.getElementById('start').click();const l0=null;d.advance(25);const s=d.getState(),v=d.validate();
   return {title:document.title,scenario:s.scenario,bots:s.bots.length,finite:s.bots.every(b=>[b.x,b.y,b.hp].every(Number.isFinite)),plans:s.bots.map(b=>b.planCount),v,phase:s.phase,scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check(/RRT ARENA 06\.6/.test(duel.title),'title shows V0.6.6: '+duel.title);
  check(duel.scenario==='duel'&&duel.bots===2,'duel mode has BLUE and RED');
  check(duel.finite&&duel.v.fightersFree&&duel.v.waypointsClear,'duel: finite state, fighters outside walls, waypoints collision-free');
  check(duel.plans.every(n=>n>0),'duel: both agents planned RRT routes '+duel.plans.join('/'));
  check(duel.scroll<=0,'duel: no horizontal scroll');
  // Multi-target tracking (melee off) must never damage BLUE.
  await page.goto(base+sep+'mode=multi');
  const track=await page.evaluate(()=>{const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;md.setMelee(false);document.getElementById('start').click();d.advance(20);const s=md.getState();return {hp:s.blue.hp,melee:s.melee,finite:true,known:Object.keys(s.tracks).length,v:d.validate(),phase:d.getState().phase};});
  check(!track.melee&&track.hp===120,'tracking mode (melee off) leaves BLUE at 120 HP');
  check(track.v.fightersFree&&track.v.waypointsClear,'tracking mode: collision-valid');
  // Melee swarm with predictive defense: HUD/arena must not move while text changes.
  await page.goto(base+sep+'mode=multi');
  const melee=await page.evaluate(({layoutSrc,finiteSrc})=>{
   const layout=eval(layoutSrc),finiteState=eval(finiteSrc);
   const $=id=>document.getElementById(id),fire=e=>e.dispatchEvent(new Event('change',{bubbles:true}));
   $('multiPreset').value='24';fire($('multiPreset'));
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;$('start').click();
   const l0=layout(),shapes=[];let evade=0,finite=true,valid=true,levels=new Set();
   for(let i=0;i<40&&d.getState().phase==='running';i++){d.advance(.5);const s=md.getState();shapes.push(JSON.stringify(layout()));
    if(s.blueIntent==='swarm_evade')evade++;if(s.forecast)levels.add(s.forecast.level);finite=finite&&finiteState(s);const v=d.validate();valid=valid&&v.fightersFree&&v.waypointsClear;}
   const s=md.getState();
   return {l0,stable:shapes.every(x=>x===JSON.stringify(l0)),evade,finite,valid,levels:[...levels],predictive:s.predictive,preempts:s.preempts,hp:s.blue.hp,time:s.time,
    hasSwitch:!!$('multiPredict'),waveText:$('multiWaveStats').textContent};
  },{layoutSrc:'('+layout.toString()+')',finiteSrc:'('+finiteState.toString()+')'});
  check(melee.hasSwitch&&melee.predictive,'melee: predictive switch present and enabled by default');
  check(melee.preempts>0&&melee.evade>0,`melee: BLUE moved preemptively (${melee.preempts} preempts, levels ${melee.levels.join(',')})`);
  check(melee.finite&&melee.valid,'melee: finite state, no wall overlap, collision-free routes');
  check(melee.stable,'melee: arena top/height, status cards and wave panel did not move '+JSON.stringify(melee.l0));
  check(melee.l0.scroll<=0,'melee: no horizontal scroll');
  // Predictive off restores the V0.6.5 policy (switch is honoured).
  const off=await page.evaluate(()=>{const $=id=>document.getElementById(id);$('multiPredict').checked=false;$('multiPredict').dispatchEvent(new Event('change',{bubbles:true}));$('start').click();window.__rrtArenaDebug.advance(15);const s=window.__rrtMultiDebug.getState();return {predictive:s.predictive,preempts:s.preempts,intent:s.blueIntent};});
  check(!off.predictive&&off.preempts===0&&off.intent!=='swarm_evade','predictive off: no preemptive evasion (baseline policy)');
  check(errors.length===0,'no page errors '+errors.join(' | '));
  await ctx.close();
 }
 // Real animation loop (not frozen): the page must run and end a short match without errors.
 console.log('\n▶ real-time loop 393x852');
 const ctx=await browser.newContext({viewport:{width:393,height:852}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+sep+'mode=multi');await page.click('#start');await page.waitForTimeout(3000);
 const live=await page.evaluate(()=>({t:window.__rrtMultiDebug.getState().time,phase:window.__rrtArenaDebug.getState().phase,hud:document.getElementById('blueHp').textContent}));
 check(live.t>1.5&&live.phase==='running','real-time loop advances ('+live.t.toFixed(2)+' s, '+live.hud+')');
 await page.screenshot({path:path.join(process.env.SHOT_DIR||'.','regression-393-live.png')});
 check(errors.length===0,'no page errors in real-time loop '+errors.join(' | '));
 await ctx.close();await browser.close();
 console.log(failures?`\n${failures} check(s) FAILED`:'\nAll browser checks passed');process.exit(failures?1:0);
}
main().catch(e=>{console.error(e);process.exit(1);});
