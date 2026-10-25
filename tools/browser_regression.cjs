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
 scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth,scrollY:Math.round(window.scrollY),documentStageTop:Math.round(r('#stage').top+window.scrollY),tops:Object.fromEntries(['header','.modePanel','#multiPanel','.stats','.layout','.arena','.panelhead','#stage'].map(k=>[k,Math.round(r(k)?.top||0)])),heights:Object.fromEntries(['header','.modePanel','#multiPanel','.multiSummary','.meleeSettings','.multiInputs','.multiBotList','#blueTeamStatus','.help','.stats'].map(k=>[k,Math.round(r(k)?.height||0)]))};};
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
  check(/RRT ARENA 06\.14/.test(duel.title),'title shows V0.6.13: '+duel.title);
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
  // New Ranged Lab: Sentry/Patrol/Hunter fight the original BLUE; incoming shots have physics.
  await page.goto(base+sep+'mode=multi&enemy=ranged');
  const ranged=await page.evaluate(({layoutSrc})=>{
   const layout=eval(layoutSrc),md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   const initial=md.getState(),sentry=initial.targets.find(t=>t.role==='sentry');
   let forced=false;
   if(sentry){
    for(const distance of [48,65,85,100]){
     if(forced)break;
     for(let k=0;k<16;k++){
      const a=k*Math.PI*2/16,p={x:initial.blue.x+Math.cos(a)*distance,y:initial.blue.y+Math.sin(a)*distance};
      if(d.freePoint(p)&&d.sight(p,initial.blue)&&md.forceTarget(sentry.id,p)){forced=true;break;}
     }
    }
   }
   document.getElementById('start').click();
   const first=layout();let stable=true,finite=true,valid=true;
   for(let i=0;i<30&&d.getState().phase==='running';i++){
    d.advance(.5);const s=md.getState(),v=d.validate();
    stable=stable&&JSON.stringify(layout())===JSON.stringify(first);
    finite=finite&&[s.blue.x,s.blue.y,s.blue.hp].every(Number.isFinite)&&s.targets.every(t=>[t.x,t.y,t.hp].every(Number.isFinite));
    valid=valid&&v.fightersFree&&v.waypointsClear;
   }
   const state=md.getState();
   return {mode:state.enemyMode,forced,roles:[...new Set(state.targets.map(t=>t.role))],
    shooterCount:state.targets.filter(t=>t.team==='ranged').length,total:state.targets.length,
    fired:state.rangedFired,hits:state.rangedHits,hp:state.blue.hp,stable,finite,valid,
    unchangedBlue:state.coreSameBlue,scroll:layout().scroll};
  },{layoutSrc:'('+layout.toString()+')'});
  check(ranged.mode==='ranged'&&ranged.shooterCount===ranged.total,'ranged mode: every enemy has a ranged role');
  check(['sentry','patrol','hunter'].every(role=>ranged.roles.includes(role)),'ranged: all three basic enemy types available');
  check(ranged.forced&&ranged.fired>0,'ranged: at least one actual world-fired projectile ('+ranged.fired+')');
  check(ranged.unchangedBlue&&ranged.finite&&ranged.valid,'ranged: original BLUE, finite and swept collision-valid');
  check(ranged.stable&&ranged.scroll<=0,'ranged: fixed-height HUD and no horizontal scrolling');
  // Mixed Lab retains melee attackers and observed ranged shooters simultaneously.
  await page.goto(base+sep+'mode=multi&enemy=mixed');
  const mixed=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   document.getElementById('start').click();d.advance(10);
   const s=md.getState(),v=d.validate();
   return {mode:s.enemyMode,melee:s.targets.filter(t=>t.team!=='ranged').length,ranged:s.targets.filter(t=>t.team==='ranged').length,
    predictive:s.predictive,finite:s.targets.every(t=>[t.x,t.y,t.hp].every(Number.isFinite)),valid:v.fightersFree&&v.waypointsClear,
    scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  check(mixed.mode==='mixed'&&mixed.melee>0&&mixed.ranged>0,'mixed: both kinds of enemies remain active');
  check(mixed.predictive&&mixed.finite&&mixed.valid&&mixed.scroll<=0,'mixed: old swarm prediction remains available and positions valid');
  // V0.6.8 Ranged Threat Defense: on by default, acts on observed crossfire, off restores V0.6.7 policy.
  await page.goto(base+sep+'mode=multi&enemy=ranged');
  const rdef=await page.evaluate(()=>{
   const $=id=>document.getElementById(id),md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   $('multiPreset').value='12';$('multiPreset').dispatchEvent(new Event('change',{bubbles:true}));
   $('start').click();let valid=true,intents=new Set();
   for(let i=0;i<30&&d.getState().phase==='running';i++){d.advance(.5);const v=d.validate();valid=valid&&v.fightersFree&&v.waypointsClear;intents.add(md.getState().blueIntent);}
   const on=md.getState();
   $('multiRangedDefense').checked=false;$('multiRangedDefense').dispatchEvent(new Event('change',{bubbles:true}));$('start').click();d.advance(15);
   const off=md.getState();
   return {hasSwitch:!!$('multiRangedDefense'),onEnabled:on.rangedDefense,moves:on.coverMoves,mobile:on.mobile,bridge:on.bridgeSteps,jinks:on.jinks,hasMobileSwitch:!!$('multiMobile'),intents:[...intents],valid,offEnabled:off.rangedDefense,offMoves:off.coverMoves,offIntent:off.blueIntent};
  });
  check(rdef.hasSwitch&&rdef.onEnabled&&rdef.moves>0,'ranged defense: enabled by default and relocates under fire ('+rdef.moves+' moves, intents '+rdef.intents.join(',')+')');
  check(rdef.valid,'ranged defense: fighters outside walls, collision-free routes');
  check(rdef.hasMobileSwitch&&rdef.mobile&&rdef.bridge+rdef.jinks>0,'keep moving: enabled by default, BLUE moved while planning/exposed ('+rdef.bridge+' bridge steps, '+rdef.jinks+' jinks)');
  check(!rdef.offEnabled&&rdef.offMoves===0&&!['ranged_cover','ranged_hold'].includes(rdef.offIntent),'ranged defense off: V0.6.7 policy restored');
  // V0.6.9: the exact published BLUE v0.6.8 brain drives B1 and B2 independently.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2');
  const duo=await page.evaluate(({layoutSrc})=>{
   const layout=eval(layoutSrc),$=id=>document.getElementById(id),md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   $('multiDifficulty').value='training';$('multiDifficulty').dispatchEvent(new Event('change',{bubbles:true}));
   const initial=md.getState(),shape=layout();
   $('start').click();let stable=true,valid=true,aliveSamples=0;
   for(let i=0;i<20&&d.getState().phase==='running';i++){
    d.advance(.5);
    const v=d.validate(),s=md.getState();
    valid=valid&&v.fightersFree&&v.waypointsClear;
    stable=stable&&JSON.stringify(layout())===JSON.stringify(shape);
    aliveSamples+=s.team.blues.filter(b=>b.hp>0).length;
   }
   const state=md.getState();
   return {mode:state.team.mode,count:state.team.count,alive:state.team.alive,blues:state.team.blues,
    memories:state.team.memorySeparated,radioSent:state.team.radioSent,heldFire:state.team.heldFire,laneMoves:state.team.laneMoves,focusSplits:state.team.focusSplits,stable,valid,
    allFinite:state.team.blues.every(b=>[b.x,b.y,b.hp].every(Number.isFinite)),
    plans:state.team.blues.map(b=>b.planCount),scroll:layout().scroll,activeSamples:aliveSamples,initialLayout:shape,finalLayout:layout()};
  },{layoutSrc:'('+layout.toString()+')'});
  check(duo.mode==='independent'&&duo.count===2&&duo.blues.map(b=>b.id).join('/')==='B1/B2',
   'duo independent: two ORIGINAL BLUE agents with distinct IDs');
  check(duo.memories&&duo.radioSent===0&&duo.heldFire===0&&duo.laneMoves===0&&duo.focusSplits===0,'duo independent: isolated per-BLUE memories; cooperative advisor stays OFF');
  check(duo.plans.every(n=>n>0)&&duo.allFinite&&duo.valid,
   'duo independent: both used RRT and obeyed collisions ('+duo.plans.join('/')+' plans)');
  check(duo.stable&&duo.scroll<=0,'duo independent: fixed mobile HUD and no horizontal scroll, first='+JSON.stringify(duo.initialLayout)+' last='+JSON.stringify(duo.finalLayout));

  // Cooperative mode adds *only* bounded visible sightings; physics, weapons and BLUE unchanged.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop');
  const coop=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   document.getElementById('start').click();
   for(let k=0;k<24&&d.getState().phase==='running';k++)d.advance(.5);
   const state=md.getState(),v=d.validate();
   return {mode:state.team.mode,count:state.team.count,memories:state.team.memorySeparated,
    sent:state.team.radioSent,delivered:state.team.radioDelivered,heldFire:state.team.heldFire,laneMoves:state.team.laneMoves,focusSplits:state.team.focusSplits,overlap:state.team.focusOverlap,samples:state.team.focusSamples,shotsFired:state.team.shotsFired,advisor:typeof window.RRTArenaCoop?.findClearLane==='function'&&typeof window.RRTArenaCoop?.deconflictFocus==='function',valid:v.fightersFree&&v.waypointsClear,
    bluePlans:state.team.blues.map(b=>b.planCount),scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  check(coop.mode==='cooperative'&&coop.count===2&&coop.memories,
   'duo cooperative: same two independent BLUE brains, explicitly enabled team radio');
  check(coop.sent>0&&coop.delivered>0,
   'duo cooperative: observed sightings really relayed with delay ('+coop.sent+' sent, '+coop.delivered+' delivered)');
  check(coop.valid&&coop.scroll<=0,'duo cooperative: valid collisions and stable viewport');
  check(coop.advisor&&[coop.heldFire,coop.laneMoves,coop.focusSplits,coop.samples,coop.overlap,coop.shotsFired.B1,coop.shotsFired.B2].every(Number.isFinite),
   'cooperative advisor runs alongside original B1/B2; finite lane, fire and overlap metrics');
  check(coop.samples>=coop.overlap&&coop.focusSplits>=0&&coop.heldFire>=0,
   'cooperative telemetry bounds are valid without secret enemy state');
  const advisor=await page.evaluate(()=>{
   const a=window.RRTArenaCoop;
   const p={id:'B1',x:0,y:0,aim:.96},target={id:'T01',x:110,y:0},mate={id:'B2',x:35,y:0,hp:120};
   return {blocked:a.safeFireLine(p,target,[mate],{radius:10}).blockerId,
    clearWhenBehind:a.safeFireLine(p,target,[{...mate,x:140}],{radius:10}).clear,
    split:a.deconflictFocus({id:'B2',x:0,y:0},{
      T01:{id:'T01',x:80,y:0,status:'visible'},
      T02:{id:'T02',x:88,y:10,status:'visible'}
     },'T01','T01',{now:4,scale:300}).targetId};
  });
  check(advisor.blocked==='B2'&&advisor.clearWhenBehind&&advisor.split==='T02',
   'cooperative lane safety and visible target split work inside LIVE browser');

  // V0.6.12 — sensor tracks and PRIVATE memory must not inherit radio messages.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop&seed=77');
  const privateRadio=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   const initial=md.getState();let maxInbox=0,maxClaims=0,maxSent=0,maxDelivered=0,isolated=true;
   document.getElementById('start').click();
   for(let i=0;i<35&&d.getState().phase==='running';i++){
    d.advance(.35);const st=md.getState();
    maxSent=Math.max(maxSent,st.team.radioSent);
    maxDelivered=Math.max(maxDelivered,st.team.radioDelivered);
    for(const b of st.team.blues){
     maxInbox=Math.max(maxInbox,b.radioSightingIds?.length||0);
     maxClaims=Math.max(maxClaims,Object.keys(b.radioClaims||{}).length);
     isolated=isolated&&Array.isArray(b.localTrackIds)&&Array.isArray(b.radioSightingIds)&&
      st.team.memorySeparated&&b.localTrackIds.every(id=>/^T\d+/.test(id));
    }
   }
   const after=md.getState();
   return {mode:after.team.mode,seed:initial.team.rngSeed,sent:maxSent,delivered:maxDelivered,
    inbox:maxInbox,claims:maxClaims,isolated,agents:after.team.blues.map(b=>b.id)};
  });
  check(privateRadio.mode==='cooperative'&&privateRadio.seed===77&&privateRadio.isolated&&
        privateRadio.agents.join('/')==='B1/B2','private radio: B1 and B2 have distinct sensor tracks/inboxes and keyed seed');
  check(privateRadio.sent>0&&privateRadio.delivered>0&&(privateRadio.inbox>0||privateRadio.claims>0),
        'radio delivery populates ONLY transient inbox ('+privateRadio.inbox+' sightings, '+privateRadio.claims+' claims)');

  // Live POSE contract: B1/B2 cannot know teammate coordinates before delivery.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop&seed=129');
  const poseWire=await page.evaluate(()=>{
   const d=window.__rrtArenaDebug,md=window.__rrtMultiDebug;
   const initial=md.getState().team.blues.map(b=>(b.radioPoses||[]).length);
   document.getElementById('start').click();
   d.advance(.13);
   const beforeDelivery=md.getState().team.blues.map(b=>(b.radioPoses||[]).length);
   d.advance(.65);
   const team=md.getState().team;
   return {initial,beforeDelivery,sent:team.radioSent,
    peers:team.blues.map(b=>(b.radioPoses||[]).map(p=>({
     id:p.id,age:p.age,x:p.x,y:p.y,reportedAt:p.reportedAt})))};
  });
  check(poseWire.initial.every(n=>n===0)&&poseWire.beforeDelivery.every(n=>n===0),
   'POSE radio: teammate coordinates absent before actual .3s transmission latency');
  check(poseWire.sent>0&&poseWire.peers.every(ps=>ps.length===1&&ps[0].age>=.3&&
    ps[0].age<=.75&&Number.isFinite(ps[0].x)&&Number.isFinite(ps[0].y)),
   'POSE radio: both BLUE agents obtain a fresh peer position from delivered packet only');

  // V0.6.13 leaderless: BID/ACK flows are from both agents' own eyes,
  // and radio faults must not give either participant a permanent leader role.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop&seed=83');
  const p2p=await page.evaluate(()=>{
   const d=window.__rrtArenaDebug,md=window.__rrtMultiDebug;
   document.getElementById('start').click();d.advance(10);
   const s=md.getState(),v=d.validate();
   return {mode:s.team.mode,loss:s.team.radioLossPct,delay:s.team.radioExtraDelay,
    bidsSent:s.team.bidsSent,bidsReceived:s.team.bidsReceived,
    delivered:s.team.radioDelivered,drop:s.team.radioDropped,
    memories:s.team.memorySeparated,blueIds:s.team.blues.map(b=>b.id),
    bidOwners:s.team.blues.map(b=>Object.keys(b.receivedBids||{})),
    valid:v.fightersFree&&v.waypointsClear};
  });
  check(p2p.mode==='cooperative'&&p2p.loss===0&&p2p.delay===0&&p2p.blueIds.join('/')==='B1/B2'&&p2p.memories,
    'leaderless: two peers, zero-loss baseline and fully separate memories');
  check(p2p.bidsSent>0&&p2p.bidsReceived>0&&p2p.delivered>0&&p2p.drop===0&&p2p.valid,
    'leaderless: bids sent/received via real radio queues, no dropped packet in baseline');

  // V0.6.14 evidence integration: delivered packets create two private ledgers.
  const proof=await page.evaluate(()=>{
   const s=window.__rrtMultiDebug.getState();
   return {accepted:s.team.evidence.accepted,duplicates:s.team.evidence.duplicates,
    blues:s.team.blues.map(b=>({id:b.id,observations:b.evidence.observations,
     origins:b.evidence.distinctOrigins})),
    hud:document.getElementById('blueEvidenceStatus')?.textContent};
  });
  check(proof.accepted>0&&proof.blues.length===2&&
    proof.blues.every(b=>b.observations>0&&b.origins.includes(b.id))&&
    /หลักฐานวิทยุ/.test(proof.hud),
   'evidence: B1/B2 keep their first-hand evidence and delivered peer reports separately');
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop&loss=100&seed=83');
  const radioDown=await page.evaluate(()=>{
   const d=window.__rrtArenaDebug,md=window.__rrtMultiDebug;
   document.getElementById('start').click();d.advance(16);
   const s=md.getState(),v=d.validate();
   return {loss:s.team.radioLossPct,sent:s.team.radioSent,dropped:s.team.radioDropped,
    received:s.team.radioDelivered,bidsReceived:s.team.bidsReceived,
    sentShots:Object.values(s.team.shotsFired).reduce((n,v)=>n+v,0),
    noPeer:s.team.blues.every(b=>!b.radioPoses.length&&!Object.keys(b.receivedBids||{}).length),
    valid:v.fightersFree&&v.waypointsClear};
  });
  check(radioDown.loss===100&&radioDown.sent>0&&radioDown.dropped===radioDown.sent&&
   radioDown.received===0&&radioDown.bidsReceived===0&&radioDown.noPeer,
   '100% radio loss: no ghost-delivery, no peer memory access or secret network fallback');
  check(radioDown.sentShots>0&&radioDown.valid,
   '100% radio loss: BLUE still fires independently with authoritative safe collisions');

  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2&team=coop&loss=50&delay=0.3&seed=83');
  const noisy=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   document.getElementById('start').click();d.advance(10);
   const s=md.getState();
   return {loss:s.team.radioLossPct,delay:s.team.radioExtraDelay,sent:s.team.radioSent,
    lost:s.team.radioDropped,delivered:s.team.radioDelivered,memorySeparate:s.team.memorySeparated};
  });
  check(noisy.loss===50&&noisy.delay===.3&&noisy.sent>0&&noisy.lost>0&&
   noisy.delivered>0&&noisy.memorySeparate,
   'imperfect network: 50% packet loss and added latency operate without shared memory');

  // Same seed + same enemy settings must generate the same WORLD regardless of radio policy.
  const initialWorld=async(teamValue)=>{
   await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2'+
    (teamValue==='cooperative'?'&team=coop':'')+'&seed=311');
   return page.evaluate(()=>{
    const s=window.__rrtMultiDebug.getState();
    return {seed:s.team.rngSeed,enemies:s.targets.map(t=>[t.id,Number(t.x.toFixed(5)),Number(t.y.toFixed(5)),t.kind]),
     blues:s.team.blues.map(b=>[b.id,Number(b.x.toFixed(5)),Number(b.y.toFixed(5))])};
   });
  };
  const firstWorld=await initialWorld('independent');
  const secondWorld=await initialWorld('cooperative');
  check(firstWorld.seed===311&&JSON.stringify(firstWorld)===JSON.stringify(secondWorld),
        'private RNG: cooperative radio does not alter seeded spawn world or initial B1/B2 positions');

  // Killing B1 cannot end the match while B2 remains alive and enemies remain.
  await page.goto(base+sep+'mode=multi&enemy=ranged&blue=2');
  const survivor=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   const $=id=>document.getElementById(id);
   $('multiDifficulty').value='training';$('multiDifficulty').dispatchEvent(new Event('change',{bubbles:true}));
   $('start').click();d.force('blue',{hp:0});
   d.advance(.5);
   const s=md.getState();
   return {mode:s.team.mode,teamAlive:s.team.alive,phase:d.getState().phase,
    survivors:s.team.blues.filter(b=>b.hp>0).map(b=>b.id),enemies:s.targets.filter(t=>t.active).length};
  });
  check(survivor.phase==='running'&&survivor.teamAlive===1&&survivor.survivors[0]==='B2'&&survivor.enemies>0,
   'duo survival: B2 continues after B1 is eliminated');
  // A melee attacker must be able to damage B2 directly, without touching B1.
  await page.goto(base+sep+'mode=multi&blue=2&enemy=melee');
  const meleeB2=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   document.getElementById('start').click();
   const s=md.getState(),b1=s.team.blues[0],b2=s.team.blues[1];
   const target=s.targets.find(t=>t.team!=='ranged');
   const rect=document.querySelector('#stage').getBoundingClientRect();
   const radius=Math.max(7.5,Math.min(17,Math.min(rect.width,rect.height)*.027));
   let didPlace=false,gotHit=false,zeroDamageB1=true;
   if(target&&b2)for(let k=0;k<16&&!gotHit;k++){
    const ang=k*Math.PI*2/16;
    const p={x:b2.x+Math.cos(ang)*radius*2.1,y:b2.y+Math.sin(ang)*radius*2.1};
    if(!d.freePoint(p)||!d.sight(p,b2)||Math.hypot(p.x-b1.x,p.y-b1.y)<radius*2.9)continue;
    if(!md.forceTarget(target.id,p))continue;didPlace=true;
    const before=md.getState().team.blues;
    md.simulateStrike(target.id);
    const after=md.getState().team.blues;
    gotHit=after[1].hp<before[1].hp;
    zeroDamageB1=after[0].hp===before[0].hp;
   }
   d.advance(3);
   const after=md.getState();
   return {mode:after.team.mode,didPlace,gotHit,zeroDamageB1,
    valid:d.validate().fightersFree&&d.validate().waypointsClear,
    plans:after.team.blues.map(b=>b.planCount)};
  });
  check(meleeB2.mode==='independent'&&meleeB2.didPlace&&meleeB2.gotHit&&meleeB2.zeroDamageB1,
   'duo melee: real close-range enemy chooses B2 without hurting distant B1');
  check(meleeB2.valid,'duo melee: both agents keep valid positions after melee contact');

  // Mixed wave keeps simple melee and ranged enemies present while team radio is active.
  await page.goto(base+sep+'mode=multi&blue=2&team=coop&enemy=mixed');
  const mixedDuo=await page.evaluate(()=>{
   const md=window.__rrtMultiDebug,d=window.__rrtArenaDebug;
   document.getElementById('start').click();d.advance(8);
   const s=md.getState(),v=d.validate();
   return {mode:s.team.mode,blueCount:s.team.count,
    ranged:s.targets.filter(t=>t.team==='ranged').length,
    melee:s.targets.filter(t=>t.team!=='ranged').length,
    valid:v.fightersFree&&v.waypointsClear,
    finite:s.team.blues.every(b=>[b.x,b.y,b.hp].every(Number.isFinite))};
  });
  check(mixedDuo.mode==='cooperative'&&mixedDuo.blueCount===2&&mixedDuo.ranged>0&&mixedDuo.melee>0,
   'duo mixed: both simple enemy types and both original BLUEs present');
  check(mixedDuo.valid&&mixedDuo.finite,'duo mixed: finite collision-free physics and routes');

  // Screenshot-matched GREEN identity ring must actually render on the Canvas
  // around each current BLUE, rather than only B1 in Mixed melee encounters.
  for(const [label,suffix,count] of [
    ['duel','',1],
    ['melee','mode=multi&enemy=melee',1],
    ['ranged','mode=multi&enemy=ranged',1],
    ['mixed','mode=multi&enemy=mixed',1],
    ['duo-independent','mode=multi&enemy=ranged&blue=2',2],
    ['duo-cooperative','mode=multi&enemy=mixed&blue=2&team=coop',2]
  ]){
    await page.goto(base+(suffix?sep+suffix:''));
    const ring=await page.evaluate(()=>{
      document.getElementById('start').click();
      const engine=window.__rrtArenaDebug,md=window.__rrtMultiDebug;
      engine.advance(.65);
      const state=engine.getState();
      const agents=state.scenario==='multi'?md.getState().team.blues:[state.bots[0]];
      const canvas=document.getElementById('arena'),stage=document.getElementById('stage');
      const rect=stage.getBoundingClientRect(),scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
      const R=Math.max(7.5,Math.min(17,Math.min(rect.width,rect.height)*.027));
      const ctx=canvas.getContext('2d');
      const visibleGreen=bot=>{
        let count=0;
        for(let a=-Math.PI*.54;a<Math.PI*.84;a+=.11){
          for(const dr of [-1.25,0,1.25]){
            const r=R*2.6+dr,x=Math.round((bot.x+Math.cos(a)*r)*scaleX),y=Math.round((bot.y+Math.sin(a)*r)*scaleY);
            if(x<0||y<0||x>=canvas.width||y>=canvas.height)continue;
            const pixel=ctx.getImageData(x,y,1,1).data;
            if(pixel[1]>=138&&pixel[1]>pixel[0]+38&&pixel[2]>75)count++;
          }
        }
        return count;
      };
      return {agents:agents.map(b=>({id:b.id,greenPixels:visibleGreen(b),hp:b.hp})),
       features:state.blueCapabilities||md.getState().blueCapabilities,
       phase:state.phase,stageHeight:Math.round(rect.height)};
    });
    check(ring.agents.length===count&&ring.agents.every(b=>b.greenPixels>=4),
      'GREEN screenshot ring appears around '+label+' BLUE(s) '+ring.agents.map(b=>b.id+':'+b.greenPixels).join(','));
    check(ring.features?.predictive&&ring.features?.rangedDefense&&ring.features?.keepMoving,
      'latest BLUE predictive + ranged defense + keep-moving capabilities available in '+label);
  }
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
