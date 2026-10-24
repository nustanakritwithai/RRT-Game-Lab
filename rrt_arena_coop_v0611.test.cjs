'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('./rrt_arena_coop_v0611.js');
const self={id:'B2',x:0,y:0,range:180,hp:120,aim:.96};
const mate={id:'B1',x:45,y:0,hp:120};
const v=(id,x,y,status='visible',at=8)=>({id,x,y,status,lastSeen:at,confidence:status==='visible'?1:.45,kind:'hunter'});
test('cooperation keeps current target if ally focuses another',()=>{
 const ts={T1:v('T1',80,0),T2:v('T2',90,5)};
 const d=c.deconflictFocus(self,ts,'T1','T2',{now:8,scale:300});
 assert.equal(d.targetId,'T1');assert.equal(d.changed,false);
});
test('cooperative deconfliction prefers a separate VISIBLE target nearby',()=>{
 const ts={T1:v('T1',80,0),T2:v('T2',95,18)};
 const d=c.deconflictFocus(self,ts,'T1','T1',{now:8,scale:300});
 assert.equal(d.targetId,'T2');assert.equal(d.changed,true);
});
test('cooperation never diverts from a visible target to radio MEMORY or stale enemy',()=>{
 const ts={T1:v('T1',80,0),T2:v('T2',94,0,'memory',7),T3:v('T3',62,10,'memory',-100)};
 const d=c.deconflictFocus(self,ts,'T1','T1',{now:8,scale:300});
 assert.equal(d.targetId,'T1');assert.equal(d.changed,false);
});
test('cooperation retains a critical near threat rather than splitting fire',()=>{
 const ts={T1:v('T1',15,0),T2:v('T2',95,12)};
 const d=c.deconflictFocus(self,ts,'T1','T1',{now:8,scale:300,criticalDistance:25});
 assert.equal(d.targetId,'T1');
});
test('cooperation does not chase too-distant alternative just for distinct focus',()=>{
 const ts={T1:v('T1',80,0),T2:v('T2',290,0)};
 const d=c.deconflictFocus(self,ts,'T1','T1',{now:8,scale:300,maxExtraDistance:.25});
 assert.equal(d.targetId,'T1');
});
test('cooperation refuses to use a hidden or fabricated target as alternative',()=>{
 const ts={T1:v('T1',80,0),T2:{id:'T2',x:83,y:0,status:'unknown'},T3:{id:'T3',x:65,y:0}};
 const d=c.deconflictFocus(self,ts,'T1','T1',{now:8,scale:300});
 assert.equal(d.targetId,'T1');
});
test('cooperative scoring is deterministic and does not mutate observed tracks',()=>{
 const ts=Object.freeze({T1:Object.freeze(v('T1',80,0)),T2:Object.freeze(v('T2',95,18))});
 assert.deepEqual(c.deconflictFocus(self,ts,'T1','T1',{now:8}),c.deconflictFocus(self,ts,'T1','T1',{now:8}));
});
test('friendly fire lane stops a bullet before observed target, not afterward',()=>{
 const aim={x:110,y:0};
 const blocked=c.safeFireLine(self,aim,[mate],{radius:12,aim:.96});
 assert.equal(blocked.clear,false);assert.equal(blocked.blockerId,'B1');
 const behind=c.safeFireLine(self,aim,[{id:'B1',x:150,y:0,hp:120}],{radius:12});
 assert.equal(behind.clear,true);
});
test('only living teammates can block a firing lane',()=>{
 assert.equal(c.safeFireLine(self,{x:110,y:0},[{...mate,hp:0}],{radius:12}).clear,true);
 assert.equal(c.safeFireLine(self,{x:110,y:0},[{...self}],{radius:12}).clear,true);
});
test('lateral near-line teammate also blocks a cone of imperfect aim',()=>{
 const result=c.safeFireLine(self,{x:110,y:0},[{id:'B1',x:45,y:8,hp:120}],{radius:10,aim:.89});
 assert.equal(result.clear,false);
 assert.equal(c.safeFireLine(self,{x:110,y:0},[{id:'B1',x:45,y:42,hp:120}],{radius:10}).clear,true);
});
test('safe fire fails closed without a currently observed aim point',()=>{
 assert.equal(c.safeFireLine(self,null,[mate]).clear,false);
 assert.equal(c.safeFireLine(self,{x:NaN,y:0},[mate]).clear,false);
});
test('flank advisor finds a clear lateral fire lane without teleporting',()=>{
 const aim={x:130,y:0};
 const r=c.findClearLane(self,aim,[mate],{width:300,height:230,scale:230,radius:9,ownRange:160,
  free:q=>q.x>=9&&q.y>-115&&q.y<115,direct:()=>true,canSee:()=>true});
 assert.ok(r&&r.goal);assert.ok(Math.abs(r.goal.y)>12);
 assert.ok(c.safeFireLine(r.goal,aim,[mate],{radius:9}).clear);
 assert.ok(c.distance(self,r.goal)<100);
});
test('flank advisor refuses to invent paths without swept collision callbacks',()=>{
 assert.equal(c.findClearLane(self,{x:130,y:0},[mate],{width:300,height:230,scale:230,radius:9,ownRange:160}),null);
});
test('flank advisor refuses blocked wall and blocked shot lanes',()=>{
 assert.equal(c.findClearLane(self,{x:130,y:0},[mate],{width:300,height:230,scale:230,radius:9,ownRange:160,
  free:()=>true,direct:()=>false,canSee:()=>true}),null);
 assert.equal(c.findClearLane(self,{x:130,y:0},[mate],{width:300,height:230,scale:230,radius:9,ownRange:160,
  free:()=>true,direct:()=>true,canSee:()=>false}),null);
});
test('flank advisor avoids occupying teammate space even when geometry says free',()=>{
 const aim={x:135,y:0};
 const r=c.findClearLane(self,aim,[{id:'B1',x:22,y:0,hp:120}],{width:300,height:230,scale:230,radius:10,ownRange:170,
  free:()=>true,direct:()=>true,canSee:()=>true});
 assert.ok(r);assert.ok(c.distance(r.goal,{x:22,y:0})>=20);
});
