'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const guided=require('./rrt_arena_guided_v061.js');
const base={width:800,height:530,pad:15,step:30,start:{x:90,y:250},goal:{x:700,y:250},focus:85,goalBias:15,failures:0};
function seeded(seed){let x=seed>>>0;return ()=>((x=(1664525*x+1013904223)>>>0)/4294967296);}

test('zero guidance reproduces global sampling plus goal bias, with bounded points',()=>{
 const rng=seeded(7);let modes={};for(let i=0;i<3000;i++){const o=guided.sample({...base,focus:0},rng);modes[o.mode]=(modes[o.mode]||0)+1;assert.ok(o.point.x>=15&&o.point.x<=785);assert.ok(o.point.y>=15&&o.point.y<=515);}
 assert.ok(modes.global>2000);assert.ok(modes.goal>200);assert.equal(modes.corridor,undefined);
});
test('goal-only bias is precise, no phantom memory',()=>{
 const out=guided.sample({...base,goalBias:100},()=>0);assert.equal(out.mode,'goal');assert.deepEqual(out.point,base.goal);
});
test('memory guidance visits remembered opponent neighborhood and corridor much more than backward hemisphere',()=>{
 const rand=seeded(41),lastSeen={x:700,y:170};let guidedCount=0,backward=0,global=0,nearMemory=0;
 for(let i=0;i<15000;i++){
  const o=guided.sample({...base,goalBias:15,focus:85,lastSeen,lastSeenAge:1,confidence:.9},rand);
  if(o.mode==='global')global++;
  else if(o.mode==='memory'){nearMemory++;guidedCount++;assert.ok(Math.hypot(o.point.x-lastSeen.x,o.point.y-lastSeen.y)<140);}
  else if(o.mode==='corridor'){guidedCount++;}
  if(o.point.x<base.start.x)backward++;
 }
 assert.ok(guidedCount>7900,`guided=${guidedCount}`);assert.ok(nearMemory>1500);assert.ok(backward<1500,`behind=${backward}`);assert.ok(global>1700,`global reserve=${global}`);
});
test('uncertainty expands remembered region; only actual observations or saved events permitted',()=>{
 const fresh=[];const stale=[];const r1=seeded(11),r2=seeded(11);
 for(let i=0;i<1000;i++){
  const a=guided.sample({...base,focus:100,goalBias:0,lastSeen:{x:400,y:250},lastSeenAge:0,confidence:1},r1);
  const b=guided.sample({...base,focus:100,goalBias:0,lastSeen:{x:400,y:250},lastSeenAge:7,confidence:.2},r2);
  if(a.mode==='memory')fresh.push(Math.hypot(a.point.x-400,a.point.y-250));
  if(b.mode==='memory')stale.push(Math.hypot(b.point.x-400,b.point.y-250));
 }
 assert.ok(fresh.length>100 && stale.length>100);
 assert.ok(stale.reduce((a,b)=>a+b,0)/stale.length>fresh.reduce((a,b)=>a+b,0)/fresh.length*1.5);
});
test('saved previous-round sighting is useful only when passed explicitly',()=>{
 const rng=seeded(4);let old=0;
 for(let i=0;i<3000;i++){
  const o=guided.sample({...base,focus:90,goalBias:0,previousEncounters:[{x:.82,y:.3,strength:.9}]},rng);
  if(o.mode==='history'){old++;assert.ok(o.point.x>=15&&o.point.x<=785);}
 }
 assert.ok(old>200);
 let sources=new Set();const r2=seeded(4);
 for(let i=0;i<300;i++){sources.add(guided.sample({...base,focus:90,goalBias:0,previousEncounters:[]},r2).mode);}
 assert.equal(sources.has('history'),false);
});
test('failed planning increases fallback to global sampling',()=>{
 const r1=seeded(71),r2=seeded(71);let a=0,b=0;
 for(let i=0;i<4000;i++){
  if(guided.sample({...base,goalBias:0,focus:100,failures:0},r1).mode==='global')a++;
  if(guided.sample({...base,goalBias:0,focus:100,failures:4},r2).mode==='global')b++;
 }
 assert.ok(b>a*2,`${a} vs ${b}`);
});
test('coordinates always clamped, handles finite degenerate/corner cases',()=>{
 const rng=seeded(13);
 for(let i=0;i<1500;i++){
  const o=guided.sample({...base,start:{x:15,y:16},goal:{x:18,y:21},lastSeen:{x:790,y:540},lastSeenAge:14,focus:100,goalBias:0},rng);
  assert.ok(Number.isFinite(o.point.x)&&Number.isFinite(o.point.y));assert.ok(o.point.x>=15&&o.point.x<=785&&o.point.y>=15&&o.point.y<=515);
 }
});
