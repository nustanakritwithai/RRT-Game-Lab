#!/usr/bin/env node
'use strict';
// Browser persists training across page reloads at a same-origin localhost.
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const pageHtml=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const KEY='rrt-arena-learning-v091';
async function run(){
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/index.html')||req.url==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   return res.end(pageHtml);
  }
  res.writeHead(404);res.end('Not found');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:393,height:852}});
  await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const url=origin+'/index.html?mode=duel2&formation=buddy2&dteam=adaptive&seed=83&learn=1&persist=1';
  await page.goto(url);
  const saved=await page.evaluate(()=>{
   const d=window.__rrtDuel2Debug;
   const map=document.getElementById('mapSelect');
   map.value='open';map.dispatchEvent(new Event('change',{bubbles:true}));
   let s=d.getState();
   if(!s.preserveLearningEnabled)throw Error('archive flag missing');
   document.getElementById('start').click();
   d.advance(18);
   s=d.getState();
   for(const f of s.fighters.filter(f=>f.team==='red'))d.forceHp(f.id,0);
   d.advance(.3);
   return {state:d.getState(),raw:window.localStorage.getItem('rrt-arena-learning-v091'),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  assert.equal(saved.state.phase,'ended','must complete match to persist trained policy');
  assert.equal(saved.overflow<=0,true,'mobile screen stable');
  assert.ok(saved.raw&&saved.raw.length>30,'saved JSON in localStorage on game end');
  const archive=JSON.parse(saved.raw);
  assert.equal(archive.version,1);
  const ids=Object.keys(archive.policies);
  assert.ok(ids.length>0,'learned fighters are persisted');
  assert.ok(ids.every(id=>/^[BR](?:[1-9]|1[0-2])$/.test(id)));
  assert.ok(!saved.raw.includes('"duelVisible"'),'no private world positions stored');
  await page.reload();
  const restored=await page.evaluate(()=>{
   const s=window.__rrtDuel2Debug.getState();
   return {fighters:s.fighters,enabled:s.preserveLearningEnabled,
    checkbox:document.getElementById('duel2PersistLearning').checked};
  });
  assert.equal(restored.enabled,true);
  assert.equal(restored.checkbox,true);
  const learned=restored.fighters.filter(f=>f.restoredLearning);
  assert.ok(learned.length>0,'own experience loaded after reload');
  for(const b of learned){
   assert.ok(archive.policies[b.id]);
   const expected=archive.policies[b.id];
   assert.equal(b.learning.style,expected.style);
   for(const key of ['contact','under_fire'])for(const style of ['balanced','aggressive','cautious']){
    const observed=b.learning.contexts[key][style],prior=expected.contexts[key][style];
    assert.equal(observed.samples,prior.samples);
    assert.ok(Math.abs(observed.mean-prior.mean)<.00006,'published summary rounds means to 4 decimals');
   }
  }
  const cleared=await page.evaluate(()=>{
   document.getElementById('duel2ClearTraining').click();
   return {raw:window.localStorage.getItem('rrt-arena-learning-v091'),
    fighters:window.__rrtDuel2Debug.getState().fighters};
  });
  assert.equal(cleared.raw,null,'explicit clear removes profile');
  assert.ok(cleared.fighters.every(f=>!f.restoredLearning),'clear also resets current tactical policy');
  await page.goto(origin+'/index.html?mode=duel2&formation=buddy2&dteam=independent&seed=83&learn=1');
  const off=await page.evaluate(()=>({
   flag:window.__rrtDuel2Debug.getState().preserveLearningEnabled,
   checkbox:document.getElementById('duel2PersistLearning').checked,
   fighters:window.__rrtDuel2Debug.getState().fighters
  }));
  assert.equal(off.flag,false);assert.equal(off.checkbox,false);
  assert.ok(off.fighters.every(f=>!f.restoredLearning));
  assert.deepEqual(errors,[]);
  console.log('PASS v0.9.1 persist/localStorage end-match, reload, clear, OFF, mobile 393px');
  console.log('Saved fighters '+ids.join(',')+' / restored '+learned.length);
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
