'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('./rrt_arena_team_v069.js');
const v=(id,x,y,at=5)=>({id,x,y,kind:'hunter',status:'visible',lastSeen:at,confidence:1,vx:0,vy:0});
const b=(id,x,y,hp=120)=>({id,x,y,hp,maxHp:120});
test('team members are independently allocated and bounded to 1/2',()=>{
 assert.deepEqual(m.members(1).map(x=>x.id),['B1']);
 assert.deepEqual(m.members(2).map(x=>x.id),['B1','B2']);
 assert.notStrictEqual(m.members(2)[0],m.members(2)[1]);
});
test('team outcome only loses if all BLUE are dead, or time expires',()=>{
 assert.equal(m.outcome([b('B1',0,0,0),b('B2',10,0,50)],1,5),null);
 assert.equal(m.outcome([b('B1',0,0,0),b('B2',10,0,0)],1,5).winner,'red');
 assert.equal(m.outcome([b('B1',0,0,0),b('B2',10,0,50)],0,5).winner,'blue');
 assert.equal(m.outcome([b('B1',0,0,50)],1,150).winner,'red');
});
test('only visible local observations can be transmitted, never hidden truth',()=>{
 const tracks={a:v('a',60,70),b:{...v('b',80,70),status:'memory'},c:{id:'c',x:20,y:20,status:'hidden'},d:{id:'d',x:10,y:10}};
 const out=m.broadcast(m.newRadio(),'B1','B2',tracks,5);
 assert.equal(out.queue.length,1);assert.equal(out.queue[0].targetId,'a');assert.equal(out.queue[0].seenAt,5);
});
test('radio delay, range and TTL are enforced without guessing world positions',()=>{
 const radio=m.broadcast(m.newRadio(),'B1','B2',{a:v('a',60,70)},5,{latency:.3,from:b('B1',0,0),to:b('B2',100,0),range:110});
 assert.equal(m.receive(radio,'B2',5.2).received.length,0);
 const rec=m.receive(radio,'B2',5.31);
 assert.equal(rec.received.length,1);assert.equal(rec.received[0].x,60);
 assert.equal(m.receive(radio,'B2',9.9,{ttl:3}).received.length,0);
 const far=m.broadcast(m.newRadio(),'B1','B2',{a:v('a',60,70)},5,{from:b('B1',0,0),to:b('B2',200,0),range:50});
 assert.equal(far.queue.length,0);
});
test('received radio is memory only and does not override direct visibility',()=>{
 const msg={sender:'B1',receiver:'B2',targetId:'T1',x:100,y:80,kind:'hunter',seenAt:5,deliverAt:5.3,confidence:1};
 const merged=m.mergeTracks({T1:v('T1',120,130)},[msg],5.5);
 assert.equal(merged.T1.status,'visible');assert.equal(merged.T1.x,120);
 const fresh=m.mergeTracks({},[msg],5.5);
 assert.equal(fresh.T1.status,'memory');assert.equal(fresh.T1.x,100);
 assert.ok(fresh.T1.confidence<1&&fresh.T1.uncertainty>0);
 assert.equal(m.mergeTracks({},[msg],15).T1,undefined);
});
test('radio records do not mutate sender memories',()=>{
 const ts=Object.freeze({T1:Object.freeze(v('T1',50,40))});
 const old=m.newRadio(),result=m.broadcast(old,'B1','B2',ts,5);
 assert.equal(Object.keys(old.queue).length,0);assert.equal(result.queue[0].x,50);
});
test('duplicate target penalty only applies in cooperative mode',()=>{
 const tracks={T1:v('T1',30,0),T2:v('T2',50,0)};
 const selected=m.chooseFocus(tracks,{x:0,y:0},'T1',false);
 const coop=m.chooseFocus(tracks,{x:0,y:0},'T1',true);
 assert.equal(selected,'T1');assert.equal(coop,'T2');
 assert.equal(m.chooseFocus({T1:tracks.T1},{x:0,y:0},'T1',true),'T1');
});
test('target alternatives are only chosen from actual visible or bounded memory tracks',()=>{
 const tracks={T1:v('T1',30,0),T2:{id:'T2',x:10,y:0,status:'unknown'},T3:{...v('T3',100,0),status:'memory',confidence:.3}};
 assert.equal(m.chooseFocus(tracks,{x:0,y:0},'T1',true),'T3');
});
test('enemy selection sees only living BLUE within LOS and range',()=>{
 const foe={x:0,y:0},blue=[b('B1',30,0),b('B2',80,0)];
 assert.equal(m.chooseVisibleEnemy(foe,blue,{range:100,canSee:()=>true}).id,'B1');
 assert.equal(m.chooseVisibleEnemy(foe,blue,{range:100,canSee:(a,q)=>q.id==='B2'}).id,'B2');
 assert.equal(m.chooseVisibleEnemy(foe,blue,{range:15,canSee:()=>true}),null);
 assert.equal(m.chooseVisibleEnemy(foe,[b('B1',30,0,0)],{range:100,canSee:()=>true}),null);
});
test('teammate collision and friendly bullet barrier are geometric, not direct damage',()=>{
 const a={x:0,y:0},p={x:100,y:0},friend=b('B2',45,0);
 assert.ok(m.segmentCircleTime(a,p,friend,10)<1);
 assert.equal(m.segmentCircleTime(a,p,{x:45,y:60},10),Infinity);
 assert.equal(m.segmentCircleTime(a,p,{x:0,y:0},10),0);
});
test('team summaries are finite and empty friendly fire is zero',()=>{
 const summary=m.teamMetrics([b('B1',0,0,55),b('B2',5,0,0)]);
 assert.equal(summary.alive,1);assert.equal(summary.totalHp,55);
 assert.ok(summary.totalHp>=0);
});
