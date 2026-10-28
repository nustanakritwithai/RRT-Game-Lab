#!/usr/bin/env node
'use strict';
// RRT ARENA V0.9 strategic map (campaign.html) smoke in real Chromium at phone sizes:
// tap-to-order, a full game to the end, playback, save/load replay, fixed layout heights, no page errors.
// Usage: node tools/campaign_browser.cjs [--shots=DIR]
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const AI=require('../rrt_arena_campaign_ai_v090.js');
const base='file://'+path.resolve(__dirname,'../campaign.html');
const shots=(process.argv.find(a=>a.startsWith('--shots='))||'').slice(8);
if(shots)require('node:fs').mkdirSync(shots,{recursive:true});
const cases=[{width:320,height:640,map:'nova9',seed:7,ai:'assault'},{width:393,height:852,map:'nova9',seed:12,ai:'fortress'},
 {width:412,height:915,map:'frontlineBasin',seed:5,ai:'network'}];
(async()=>{
 const browser=await chromium.launch();let n=0;
 try{
  for(const c of cases){
   const ctx=await browser.newContext({viewport:{width:c.width,height:c.height},hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(base+'?map='+c.map+'&seed='+c.seed+'&ai='+c.ai);
   // Tap a sector card on its name strip (the lower half holds unit tokens, which select that unit).
   const tapSector=async id=>{const el=page.locator(`[data-sector="${id}"] rect.body`),bb=await el.boundingBox();await page.touchscreen.tap(bb.x+bb.width/2,bb.y+bb.height*.15);};
   const box=async()=>page.evaluate(()=>({map:document.getElementById('map').getBoundingClientRect().height,sheet:document.getElementById('sheet').getBoundingClientRect().height,
    scrollW:document.documentElement.scrollWidth,w:innerWidth}));
   const b0=await box();assert.ok(b0.scrollW<=b0.w,'no horizontal scroll '+JSON.stringify(b0));
   // Real taps: own unit's sector selects it, an adjacent sector orders a move.
   const v0=await page.evaluate(()=>__rrtCampaignDebug.view());
   const u=v0.ownUnits[0],to=v0.edges.find(e=>e.includes(u.sector)).find(x=>x!==u.sector);
   await tapSector(u.sector);
   assert.equal((await page.evaluate(()=>__rrtCampaignDebug.draft())).selected,u.id);
   const b1=await box();assert.equal(b1.map,b0.map);assert.equal(b1.sheet,b0.sheet,'sheet height fixed when a unit is selected');
   if(shots)await page.screenshot({path:path.join(shots,`campaign_${c.width}_selected.png`)});
   await tapSector(to);
   assert.deepEqual((await page.evaluate(()=>__rrtCampaignDebug.draft())).orders,[{unit:u.id,type:'move',to}]);
   assert.equal(await page.locator('line.arrow').count(),1,'order arrow drawn');
   // A non-adjacent tap is refused with a visible reason.
   const far=v0.sectors.find(s=>s.id!==u.sector&&!v0.edges.some(e=>e.includes(u.sector)&&e.includes(s.id)));
   const u2=v0.ownUnits[1];await tapSector(u2.sector);
   if(far&&!v0.edges.some(e=>e.includes(u2.sector)&&e.includes(far.id))){await tapSector(far.id);
    assert.match(await page.textContent('#notice'),/ติดกัน/);}
   await page.tap('#bEnd');
   // Each battle asks: watch the real battle or take the quick result.
   while(await page.evaluate(()=>document.getElementById('battle').classList.contains('open')))await page.tap('#bQuick');
   assert.equal(await page.evaluate(()=>document.getElementById('report').classList.contains('open')),true,'turn report opens');
   await page.waitForFunction(()=>!__rrtCampaignDebug.playing(),null,{timeout:20000});
   if(shots)await page.screenshot({path:path.join(shots,`campaign_${c.width}_report.png`)});
   await page.tap('#rClose');
   assert.equal((await page.evaluate(()=>__rrtCampaignDebug.view())).turn,1);
   // Play to the end with BLUE orders from the same AI (entered through the page's order hook).
   for(let t=1;t<40;t++){const v=await page.evaluate(()=>__rrtCampaignDebug.view());if(v.winner)break;
    for(const o of AI.decideOrders(v,'network',t))assert.equal(await page.evaluate(o=>__rrtCampaignDebug.order(o),o),true,JSON.stringify(o));
    await page.evaluate(()=>{__rrtCampaignDebug.endTurn();if(__rrtCampaignDebug.inTurn())__rrtCampaignDebug.quickAll();__rrtCampaignDebug.skip();});
    const r=await page.evaluate(()=>__rrtCampaignDebug.report());
    for(const b of r.battles)assert.equal(b.abstract,true);}
   const end=await page.evaluate(()=>__rrtCampaignDebug.view());assert.ok(end.winner,'game finished');
   assert.equal(await page.isDisabled('#bEnd'),true);
   if(shots)await page.screenshot({path:path.join(shots,`campaign_${c.width}_end.png`)});
   // Save -> reload page (autosave resume) and explicit load replay to the identical BLUE view.
   const save=await page.evaluate(()=>__rrtCampaignDebug.save());
   await page.goto(base);const resumed=await page.evaluate(()=>__rrtCampaignDebug.view());assert.deepEqual(resumed,end,'autosave resume');
   await page.evaluate(()=>__rrtCampaignDebug.start({template:'nova9',personality:'assault',seed:1}));
   await page.evaluate(s=>__rrtCampaignDebug.load(s),save);assert.deepEqual(await page.evaluate(()=>__rrtCampaignDebug.view()),end,'load replay');
   const bEnd=await box();assert.ok(bEnd.scrollW<=bEnd.w);assert.equal(bEnd.sheet,b0.sheet);
   assert.deepEqual(errors,[]);
   console.log(`ok ${c.width}x${c.height} ${c.map} seed ${c.seed}: ${end.turn} turns, winner ${end.winner}, VP ${end.vp}:${end.opponentVp}, map ${Math.round(b0.map)}px sheet ${Math.round(b0.sheet)}px`);
   n++;await ctx.close();
  }
  // Real battle end to end: Control A rush, watch it in the embedded arena (x4), result back to the map.
  {const ctx=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'?map=nova9&seed=7&ai=assault');await page.evaluate(()=>localStorage.setItem('rrt-campaign-speed','4'));
   const rush=async()=>{const v=await page.evaluate(()=>__rrtCampaignDebug.view());
    for(const u of v.ownUnits)assert.equal(await page.evaluate(o=>__rrtCampaignDebug.order(o),{unit:u.id,type:'move',to:'C2'}),true);};
   await rush();await page.tap('#bEnd');
   assert.equal(await page.evaluate(()=>document.getElementById('battle').classList.contains('open')),true,'battle choice shown');
   const plan=await page.evaluate(()=>__rrtCampaignDebug.battle());
   assert.match(plan.title,/ชิงเขต/);assert.equal(plan.params.map.endsWith('Fair'),true);assert.ok(plan.slots.blue.every(id=>/^P\d+$/.test(id)));
   if(shots)await page.screenshot({path:path.join(shots,'campaign_393_battle_choice.png')});
   const t0=Date.now();await page.tap('#bWatch');assert.equal(await page.evaluate(()=>__rrtCampaignDebug.arenaOpen()),true);
   const frame=await (await page.waitForSelector('#aFrame')).contentFrame();await frame.waitForLoadState();
   await frame.waitForFunction(()=>window.__rrtDuel2Debug&&window.__rrtDuel2Debug.getState().phase==='running',null,{timeout:20000});
   const inside=await frame.evaluate(()=>{const s=__rrtDuel2Debug.getState();return {n:s.fighters.length,map:document.getElementById('mapSelect').value,speed:document.getElementById('speed').value};});
   assert.equal(inside.n,plan.slots.blue.length+plan.slots.red.length);assert.equal(inside.map,plan.params.map);assert.equal(inside.speed,'4');
   if(shots)await page.screenshot({path:path.join(shots,'campaign_393_real_battle.png')});
   await page.waitForSelector('#aDone:not([hidden])',{timeout:150000});
   if(shots)await page.screenshot({path:path.join(shots,'campaign_393_real_battle_end.png')});
   const secs=((Date.now()-t0)/1000).toFixed(1);await page.tap('#aBack');
   while(await page.evaluate(()=>document.getElementById('battle').classList.contains('open')))await page.tap('#bQuick');
   await page.waitForFunction(()=>!__rrtCampaignDebug.playing(),null,{timeout:20000});
   const rep=await page.evaluate(()=>__rrtCampaignDebug.report());
   assert.equal(rep.battles[0].source,'real');assert.equal(rep.battles[0].abstract,false);
   if(shots)await page.screenshot({path:path.join(shots,'campaign_393_real_report.png')});
   // The real result is in the save: a reload replays to the same view.
   const after=await page.evaluate(()=>__rrtCampaignDebug.view());await page.goto(base);
   assert.deepEqual(await page.evaluate(()=>__rrtCampaignDebug.view()),after,'real result survives reload');
   // Reload in the middle of a turn: the battle that was waiting is offered again.
   await page.evaluate(()=>__rrtCampaignDebug.start({template:'nova9',personality:'assault',seed:7}));await rush();await page.tap('#bEnd');
   const waiting=(await page.evaluate(()=>__rrtCampaignDebug.battle())).title;await page.goto(base);
   assert.equal(await page.evaluate(()=>__rrtCampaignDebug.inTurn()),true,'unfinished turn resumed');
   assert.equal((await page.evaluate(()=>__rrtCampaignDebug.battle())).title,waiting);
   assert.deepEqual(errors,[]);
   console.log(`ok real battle: ${rep.battles[0].name} ${rep.battles[0].mine}v${rep.battles[0].theirs} ${rep.battles[0].outcome} in ${secs}s at x4, mid-turn resume ok`);
   await ctx.close();}
 }finally{await browser.close();}
 console.log(`campaign browser smoke: ${n}/${cases.length} passed`);
})().catch(e=>{console.error(e);process.exit(1);});
