'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const F=require('./rrt_arena_fort_v090.js');
const B={w:800,h:500};
const overlap=(a,b,m=0)=>a.x<b.x+b.w+m&&b.x<a.x+a.w+m&&a.y<b.y+b.h+m&&b.y<a.y+a.h+m;
test('level 0 builds nothing',()=>assert.deepEqual(F.fortWalls(0,'blue',B,[]),[]));
test('level 1 and 2 add walls on the defender side only',()=>{
 for(const side of ['blue','red'])for(const level of [1,2]){const ws=F.fortWalls(level,side,B,[]);assert.ok(ws.length>0);
  for(const w of ws){const cx=w.x+w.w/2;assert.ok(side==='blue'?cx<B.w*.5:cx>B.w*.5,side+' wall on wrong half');}}
});
test('level 2 is a superset of level 1',()=>{const a=F.fortWalls(1,'blue',B,[]),b=F.fortWalls(2,'blue',B,[]);assert.ok(b.length>a.length);
 for(const w of a)assert.ok(b.some(v=>v.x===w.x&&v.y===w.y&&v.w===w.w&&v.h===w.h));});
test('red fort is the mirror image of the blue fort',()=>{
 const blue=F.fortWalls(2,'blue',B,[]),red=F.fortWalls(2,'red',B,[]);assert.equal(blue.length,red.length);
 for(const w of blue)assert.ok(red.some(v=>Math.abs(v.x-(B.w-w.x-w.w))<1e-6&&Math.abs(v.y-w.y)<1e-6&&v.w===w.w&&v.h===w.h));
});
test('fort walls either attach to a map wall or keep a full corridor of clearance, and stay in bounds',()=>{
 const existing=[{x:180,y:150,w:60,h:200}];
 for(const level of [1,2]){const ws=F.fortWalls(level,'blue',B,existing,{clearance:20});
  for(const w of ws){assert.ok(overlap(w,existing[0],0)||!overlap(w,existing[0],20),'narrow gap');assert.ok(w.x>=0&&w.y>=0&&w.x+w.w<=B.w&&w.y+w.h<=B.h);}}
});
test('fort walls leave the anchor itself free (zone and gaps stay reachable)',()=>{
 const a=F.anchorFor('blue',B,[]);for(const w of F.fortWalls(2,'blue',B,[]))assert.ok(!(a.x>=w.x&&a.x<=w.x+w.w&&a.y>=w.y&&a.y<=w.y+w.h));
});
test('anchor moves vertically to avoid map walls and stays deterministic',()=>{
 const existing=[{x:150,y:200,w:120,h:100}];const a=F.anchorFor('blue',B,existing),b=F.anchorFor('blue',B,existing);
 assert.deepEqual(a,b);assert.ok(!(a.x>=130&&a.x<=290&&a.y>=180&&a.y<=320));
});
test('invalid inputs are rejected safely',()=>{assert.deepEqual(F.fortWalls(3,'blue',B,[]),F.fortWalls(2,'blue',B,[]));assert.deepEqual(F.fortWalls(1,'green',B,[]),[]);});
test('anchor is never placed inside a map wall, even on a crowded small arena',()=>{
 const Bs={w:371,h:364};
 const ruins=[[.23,.12,.10,.27],[.47,.05,.11,.23],[.64,.33,.10,.22],[.33,.48,.18,.10],[.12,.60,.15,.105],[.55,.71,.17,.12],[.78,.69,.09,.12]].map(([x,y,w,h])=>({x:x*Bs.w,y:y*Bs.h,w:w*Bs.w,h:h*Bs.h}));
 for(const side of ['blue','red']){const a=F.anchorFor(side,Bs,ruins,{clearance:21.6});
  assert.ok(!ruins.some(e=>a.x>=e.x-10&&a.x<=e.x+e.w+10&&a.y>=e.y-10&&a.y<=e.y+e.h+10),side+' anchor too close to a wall '+JSON.stringify(a));}
});
