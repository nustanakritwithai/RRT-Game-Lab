'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('./rrt_arena_private_radio_v0612.js');
const sight=(id,x=40,y=50,t=10)=>({id,x,y,kind:'hunter',status:'visible',lastSeen:t,confidence:1});
const msg=(id='T01')=>({sender:'B1',receiver:'B2',targetId:id,type:'SIGHTING',x:40,y:50,
 kind:'hunter',seenAt:10,deliverAt:10.3,confidence:1});
test('each BLUE owns an independent inbox and radio does not mutate a private memory',()=>{
 const private1={danger:[{x:.4,y:.2}],encounters:[]};
 const private2={danger:[],encounters:[]};
 const a=m.makeInbox(),b=m.makeInbox();
 const data=m.ingest(b,[msg()],10.31,{owner:'B2',ttl:3.5});
 assert.notStrictEqual(a,b);assert.equal(a.sightings.T01,undefined);
 assert.equal(data.sightings.T01.x,40);
 assert.deepEqual(private1,{danger:[{x:.4,y:.2}],encounters:[]});
 assert.deepEqual(private2,{danger:[],encounters:[]});
 assert.notStrictEqual(data,b);
});
test('messages are ignored before delivery and after expiry; local observations remain strictly local',()=>{
 const empty=m.makeInbox();
 assert.equal(m.ingest(empty,[msg()],10.29,{owner:'B2'}).sightings.T01,undefined);
 const got=m.ingest(empty,[msg()],10.3,{owner:'B2'});
 assert.ok(got.sightings.T01);
 assert.equal(m.prune(got,13.51,{ttl:3.5}).sightings.T01,undefined);
 assert.equal(m.ingest(empty,[msg()],14,{owner:'B2'}).sightings.T01,undefined);
 assert.equal(m.ingest(empty,[msg()],10.31,{owner:'B1'}).sightings.T01,undefined);
});
test('only valid observed target position is accepted; forged hidden-target, future, NaN or stale reports are rejected',()=>{
 const invalid=[
  {...msg(),x:NaN},{...msg(),y:Infinity},{...msg(),seenAt:11},
  {...msg(),type:'UNKNOWN'},{...msg(),source:'world_truth'}
 ];
 for(const v of invalid)assert.equal(m.ingest(m.makeInbox(),[v],10.5,{owner:'B2'}).sightings.T01,undefined);
});
test('focus claims use delivered radio messages, never shared coordinator data',()=>{
 const a=m.makeInbox();
 const claim={type:'TARGET_CLAIM',sender:'B1',receiver:'B2',targetId:'T03',
  seenAt:10,deliverAt:10.3,expiresAt:12.5};
 const early=m.ingest(a,[claim],10.29,{owner:'B2'});
 assert.equal(m.peerClaim(early,'B1',10.29),null);
 const delivered=m.ingest(a,[claim],10.31,{owner:'B2'});
 assert.equal(m.peerClaim(delivered,'B1',10.31),'T03');
 assert.equal(m.peerClaim(m.prune(delivered,12.51),'B1',12.51),null);
});
test('a claim is sent only for sender-local *visible* targets, respects radio range and rate limit',()=>{
 const radio={queue:[],lastSent:{}},a={id:'B1',x:0,y:0},b={id:'B2',x:70,y:0};
 const tracks={T01:sight('T01')};
 const sent=m.sendClaim(radio,a,b,tracks,'T01',10,{range:100,latency:.3});
 assert.equal(sent.queue.length,1);assert.equal(sent.queue[0].type,'TARGET_CLAIM');
 assert.equal(m.sendClaim(sent,a,b,tracks,'T01',10.1,{range:100}).queue.length,1);
 assert.equal(m.sendClaim(radio,a,b,{T01:{...sight('T01'),status:'memory'}},'T01',10,{range:100}).queue.length,0);
 assert.equal(m.sendClaim(radio,a,{...b,x:200},tracks,'T01',10,{range:100}).queue.length,0);
});
test('inbox reported coordinates are an EXPLORE GOAL only, not an attack coordinate',()=>{
 const b=m.ingest(m.makeInbox(),[msg()],10.4,{owner:'B2'});
 assert.deepEqual(m.radioExploreGoal(b,{x:10,y:10},10.4,{ttl:3.5,free:()=>true}),{x:40,y:50});
 assert.equal(m.radioExploreGoal(m.prune(b,14),{x:10,y:10},14,{free:()=>true}),null);
 assert.equal(m.radioExploreGoal(b,{x:10,y:10},10.4,{free:()=>false}),null);
});
test('separate RNG streams keep world/enemy/B1/B2/radio independent of agent action count',()=>{
 const a=m.createStreams(1001),b=m.createStreams(1001);
 const w1=Array.from({length:8},()=>a.next('world'));
 for(let i=0;i<50;i++)a.next('B2');
 const e1=Array.from({length:9},()=>a.next('enemy'));
 const w2=Array.from({length:8},()=>b.next('world'));
 const e2=Array.from({length:9},()=>b.next('enemy'));
 assert.deepEqual(w1,w2);assert.deepEqual(e1,e2);
 assert.notDeepEqual(Array.from({length:5},()=>b.next('B1')),Array.from({length:5},()=>b.next('B2')));
 const old=Array.from({length:5},()=>a.next('radio'));
 a.reseed(1001);assert.deepEqual(old,Array.from({length:5},()=>a.next('radio')));
});
test('RNG never changes Math.random at module-import time and accepts stable string seed names',()=>{
 const old=Math.random;
 m.createStreams(42).next('world');
 assert.strictEqual(Math.random,old);
 assert.equal(m.createStreams(123).next('world'),m.createStreams(123).next('world'));
});

test('teammate coordinates for tactical decisions must arrive as RADIO POSE messages',()=>{
 const a={id:'B1',x:120,y:90,hp:120},b={id:'B2',x:130,y:160,hp:120};
 const sent=m.sendPose({queue:[],lastSent:{}},a,b,10,{latency:.25,range:200});
 assert.equal(sent.queue.length,1);assert.equal(sent.queue[0].type,'POSE');
 assert.equal(m.peerPositions(m.ingest(m.makeInbox(),sent.queue,10.2,{owner:'B2'}),10.2).length,0);
 const arrived=m.ingest(m.makeInbox(),sent.queue,10.26,{owner:'B2'});
 assert.deepEqual(m.peerPositions(arrived,10.26).map(v=>v.id),['B1']);
 assert.deepEqual(m.peerPositions(arrived,10.26).map(v=>({x:v.x,y:v.y})),[{x:120,y:90}]);
 assert.equal(m.peerPositions(m.prune(arrived,10.85),10.85).length,0);
 assert.equal(m.sendPose({queue:[],lastSent:{}},a,{...b,x:400},10,{range:200}).queue.length,0);
});
test('radio POSE is not from hidden world state; malformed sender/origin is rejected',()=>{
 const pose={type:'POSE',sender:'B1',receiver:'B2',x:200,y:100,seenAt:10,deliverAt:10.2,source:'world_truth'};
 assert.equal(m.ingest(m.makeInbox(),[pose],10.3,{owner:'B2'}).poses.B1,undefined);
 assert.equal(m.ingest(m.makeInbox(),[{...pose,source:'own_position',x:NaN}],10.3,{owner:'B2'}).poses.B1,undefined);
 assert.equal(m.ingest(m.makeInbox(),[{...pose,source:'own_position',deliverAt:11}],10.3,{owner:'B2'}).poses.B1,undefined);
});
