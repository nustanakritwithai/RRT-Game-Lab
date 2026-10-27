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
   assert.equal(await page.evaluate(()=>document.getElementById('report').classList.contains('open')),true,'turn report opens');
   await page.waitForFunction(()=>!__rrtCampaignDebug.playing(),null,{timeout:20000});
   if(shots)await page.screenshot({path:path.join(shots,`campaign_${c.width}_report.png`)});
   await page.tap('#rClose');
   assert.equal((await page.evaluate(()=>__rrtCampaignDebug.view())).turn,1);
   // Play to the end with BLUE orders from the same AI (entered through the page's order hook).
   for(let t=1;t<40;t++){const v=await page.evaluate(()=>__rrtCampaignDebug.view());if(v.winner)break;
    for(const o of AI.decideOrders(v,'network',t))assert.equal(await page.evaluate(o=>__rrtCampaignDebug.order(o),o),true,JSON.stringify(o));
    await page.evaluate(()=>{__rrtCampaignDebug.endTurn();__rrtCampaignDebug.skip();});
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
 }finally{await browser.close();}
 console.log(`campaign browser smoke: ${n}/${cases.length} passed`);
})().catch(e=>{console.error(e);process.exit(1);});
