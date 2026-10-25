'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./rrt_arena_duel_v0615.js');
const bot=(id,team,hp=120,x=0,y=0)=>({id,team,hp,x,y});
const roster=()=>[bot('B1','blue'),bot('R1','red'),bot('B2','blue'),bot('R2','red')];
const visible=(id,x,y)=>({id,status:'visible',position:{x,y},age:0});
const sight=(overrides={})=>({type:'SIGHTING',source:'own_sensor',sender:'B1',receiver:'B2',originId:'B1',
 targetId:'R1',seenAt:1,deliverAt:1.3,expiresAt:4.5,x:100,y:200,confidence:1,...overrides});
test('one fighter chooses from its own visible tracks, never a hidden world registry',()=>{
 assert.equal(D.chooseTarget({x:0,y:0},[visible('R2',90,0),visible('R1',40,0)]),'R1');
 assert.equal(D.chooseTarget({x:0,y:0},[{id:'R1',status:'unknown',position:{x:1,y:1},age:0}]),null);
});
test('visibility wins over closer but stale memory and prior selection is sticky',()=>{
 const tracks=[visible('R1',100,0),visible('R2',105,0)];
 assert.equal(D.chooseTarget({x:0,y:0},tracks,'R2'),'R2');
 assert.equal(D.chooseTarget({x:0,y:0},[visible('R1',100,0),{id:'R2',status:'remembered',position:{x:3,y:1},age:.5}],'R2'),'R1');
});
test('dead target omitted by caller reassigns from another actually perceived enemy',()=>{
 assert.equal(D.chooseTarget({x:10,y:10},[visible('R2',20,10)],'R1'),'R2');
});
test('won only when all hostile team members have been eliminated',()=>{
 const a=roster();a[1].hp=0;
 assert.equal(D.resolve(a,20),null);
 a[3].hp=0;assert.equal(D.resolve(a,21).winner,'blue');
});
test('2 BLUE deaths produce RED victory and simultaneous death draws',()=>{
 const a=roster();a[0].hp=0;a[2].hp=0;assert.equal(D.resolve(a,3).winner,'red');
 a[1].hp=a[3].hp=0;assert.equal(D.resolve(a,3).winner,'draw');
});
test('timeout judges surviving total HP, not only B1 vs R1',()=>{
 const a=roster();a[0].hp=20;a[1].hp=80;a[2].hp=120;a[3].hp=35;
 assert.equal(D.resolve(a,149),null);assert.equal(D.resolve(a,150).winner,'blue');
 a[2].hp=95;assert.equal(D.resolve(a,150).winner,'draw');
});
test('friendly fighter is swept bullet blocker without taking damage from helper',()=>{
 const fighters=[bot('B1','blue',120,0,0),bot('B2','blue',120,30,0),bot('R1','red',120,70,0)];
 const hit=D.projectileContact({ownerId:'B1',team:'blue'},fighters,{x:0,y:0},{x:100,y:0},5,
  (from,to,p,r)=>p.x/100,Infinity);
 assert.equal(hit.bot.id,'B2');assert.equal(hit.friendly,true);
});
test('shot collision picks nearest live target and respects walls',()=>{
 const fighters=[bot('B1','blue',120,0,0),bot('R2','red',120,60,0),bot('R1','red',120,25,0)];
 assert.equal(D.projectileContact({ownerId:'B1',team:'blue'},fighters,{x:0,y:0},{x:100,y:0},5,(a,b,p)=>p.x/100).bot.id,'R1');
 assert.equal(D.projectileContact({ownerId:'B1',team:'blue'},fighters,{x:0,y:0},{x:100,y:0},5,(a,b,p)=>p.x/100,.20),null);
});
test('radio sender transmits only first-hand visible RED tracks in range',()=>{
 const from=bot('B1','blue',120,0,0),to=bot('B2','blue',120,15,0);
 const radio=D.sendSightings({queue:[],lastSent:{}},from,to,{
 R1:{id:'R1',x:100,y:200,status:'visible',lastSeen:1,confidence:1},
 R2:{id:'R2',x:200,y:200,status:'memory',lastSeen:1}},2,{range:30});
 assert.equal(radio.queue.length,1);assert.equal(radio.queue[0].targetId,'R1');
 assert.equal(radio.queue[0].sender,'B1');assert.equal(radio.queue[0].originId,'B1');
});
test('radio range and rate limit reject invalid transmissions',()=>{
 const from=bot('B1','blue',120,0,0),to=bot('B2','blue',120,99,0);
 const tracks={R1:{id:'R1',x:40,y:20,status:'visible',lastSeen:1,confidence:1}};
 const dropped=D.sendSightings(null,from,to,tracks,1,{range:20});
 assert.equal(dropped.queue.length,0);
 const first=D.sendSightings(null,from,{...to,x:15},tracks,1,{range:20});
 const again=D.sendSightings(first,from,{...to,x:15},tracks,1.3,{range:20});
 assert.equal(again.queue.length,1);
});
test('received radio location stays in receiver inbox only after actual delivery',()=>{
 assert.equal(Object.keys(D.receive(D.makeInbox(),[sight()], 'B2',1.2).sightings).length,0);
 const delivered=D.receive(D.makeInbox(),[sight()],'B2',1.5);
 assert.equal(delivered.sightings.R1.source,'radio');
 assert.equal(delivered.sightings.R1.x,100);
 assert.deepEqual(D.exploreGoal(delivered,{x:0,y:0},1.5,()=>true),{x:100,y:200});
});
test('wrong receiver, spoofed origin, relay source and expired reports rejected',()=>{
 for(const o of [{receiver:'B1'},{originId:'B2'},{source:'relay'},{expiresAt:1.1},{targetId:'T1'}]){
  assert.equal(Object.keys(D.receive(D.makeInbox(),[sight(o)],'B2',2).sightings).length,0);
 }
});
test('100% radio loss modeled by no delivery cannot fabricate knowledge',()=>{
 assert.equal(D.exploreGoal(D.makeInbox(),{x:10,y:10},2,()=>true),null);
 const a=D.receive(D.makeInbox(),[],'B1',2);
 assert.equal(Object.keys(a.sightings).length,0);
});
test('older radio reports do not overwrite newer first-hand radio report',()=>{
 const newer=D.receive(D.makeInbox(),[sight({seenAt:2,deliverAt:2.3,expiresAt:5.5})],'B2',3);
 const older=D.receive(newer,[sight({seenAt:1.5,deliverAt:1.8,x:4})],'B2',3);
 assert.equal(older.sightings.R1.x,100);
});
test('expired inbox entries are pruned and no longer provide search goals',()=>{
 const state=D.receive(D.makeInbox(),[sight()],'B2',2);
 assert.equal(D.exploreGoal(state,{x:0,y:0},5,()=>true),null);
});
