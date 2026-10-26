'use strict';
/* TDD: failures on V0.6.16 show that nearest-first target selection and fixed-interval
 * sightings do not react to locally measured closing threats or skip redundant packets.
 */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('./rrt_arena_duel_v0615.js');
const me={id:'B1',x:0,y:0,team:'blue',hp:120};
const peer={id:'B2',x:10,y:0,team:'blue',hp:120};
const red={id:'R1',x:90,y:0,team:'red',hp:120};
const sight=(id,x,y,closingRate=0,status='visible',age=0)=>({
 id,status,position:{x,y},closingRate,age
});
const tracks=(x=100,y=20,at=1)=>({R1:{id:'R1',x,y,status:'visible',lastSeen:at,confidence:1}});
const args={range:100,interval:.65,ttl:3.5,minDisplacement:18,maxRefreshSeconds:2.25};
test('V0.6.17: urgent closing opponent can outrank a closer receding opponent',()=>{
 const seen=[sight('R1',62,0,-30),sight('R2',88,0,150)];
 assert.equal(D.chooseTarget(me,seen,null,{scale:400}),'R2');
});
test('target switching still requires a meaningful advantage; no jitter on near equal candidates',()=>{
 assert.equal(D.chooseTarget(me,[sight('R1',90,0,0),sight('R2',85,0,2)],'R1',{scale:400}),'R1');
});
test('unknown and stale remembered locations never override a real visible target',()=>{
 const old=sight('R1',5,0,0,'remembered',.8);
 const now=sight('R2',110,0,0);
 assert.equal(D.chooseTarget(me,[old,now],null,{scale:400}),'R2');
});
test('recent remembered target takes priority over very old near trace',()=>{
 const stale=sight('R1',15,0,0,'remembered',7);
 const recent=sight('R2',90,0,0,'remembered',.2);
 assert.equal(D.chooseTarget(me,[stale,recent],null,{scale:400}),'R2');
});
test('nonfinite closing telemetry does not poison target sorting',()=>{
 const result=D.chooseTarget(me,[sight('R1',50,0,Infinity),sight('R2',100,0,NaN)],null,{scale:400});
 assert.equal(result,'R1');
});
test('visible target fallback nearest policy remains when closing rate unavailable',()=>{
 assert.equal(D.chooseTarget(me,[sight('R1',70,0),sight('R2',110,0)],null,{scale:400}),'R1');
});
test('unchanged sighting over minimum interval is suppressed until bounded heartbeat',()=>{
 const first=D.sendSightings(null,me,peer,tracks(100,20,1),1,args);
 const unchanged=D.sendSightings(first,me,peer,tracks(100,20,1.8),1.8,args);
 assert.equal(first.queue.length,1);assert.equal(unchanged.queue.length,1);
 assert.equal(unchanged.suppressed,1);
 const heartbeat=D.sendSightings(unchanged,me,peer,tracks(100,20,3.5),3.5,args);
 assert.equal(heartbeat.queue.length,2,'freshness refresh must be sent before 3.5s TTL expires');
});
test('position delta crossing minimum displacement sends updated evidence',()=>{
 const first=D.sendSightings(null,me,peer,tracks(100,20,1),1,args);
 const moved=D.sendSightings(first,me,peer,tracks(125,20,1.9),1.9,args);
 assert.equal(moved.queue.length,2);assert.equal(moved.queue[1].x,125);
 assert.equal(moved.suppressed,0);
});
test('small position noise is treated as same evidence, not another witness',()=>{
 const first=D.sendSightings(null,me,peer,tracks(100,20,1),1,args);
 const small=D.sendSightings(first,me,peer,tracks(103,21,1.9),1.9,args);
 assert.equal(small.queue.length,1);assert.equal(small.suppressed,1);
});
test('sighting from different target ID is never hidden by previous target dedup',()=>{
 const first=D.sendSightings(null,me,peer,tracks(100,20,1),1,args);
 const second=D.sendSightings(first,me,peer,{R1:tracks(100,20,1.8).R1,
  R2:{id:'R2',x:160,y:10,status:'visible',lastSeen:1.8,confidence:1}},1.8,args);
 assert.equal(second.queue.length,2);assert.deepEqual(second.queue.map(x=>x.targetId),['R1','R2']);
});
test('RED R1→R2 uses identical redundant radio gate',()=>{
 const source={id:'R1',x:0,y:0,team:'red',hp:120},dest={id:'R2',x:10,y:0,team:'red',hp:120};
 const one=D.sendSightings(null,source,dest,{B1:{id:'B1',x:100,y:20,status:'visible',lastSeen:1}},1,args);
 const two=D.sendSightings(one,source,dest,{B1:{id:'B1',x:100,y:20,status:'visible',lastSeen:1.8}},1.8,args);
 assert.equal(one.queue.length,1);assert.equal(two.queue.length,1);assert.equal(two.suppressed,1);
});
test('suppression may not skip a fresh first sighting if packet loss consumed an earlier send',()=>{
 const first=D.sendSightings(null,me,peer,tracks(100,20,1),1,args);
 assert.equal(first.queue.length,1);
 const again=D.sendSightings({...first,queue:[]},me,peer,tracks(100,20,3.5),3.5,args);
 assert.equal(again.queue.length,1,'periodic retransmission after loss must recover delivery');
});
test('existing tactical move, damage, ammo and source visibility rules remain unchanged',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
 const sensing=source.slice(source.indexOf('function senseDuel2World(){'),source.indexOf('function duel2Shoot(bot){'));
 assert.match(sensing,/duel2Core\.chooseTarget\(bot,candidates,previous,\{scale:S\}\)/);
 assert.match(sensing,/closingRate/);
 assert.match(sensing,/duel2Core\.sendSightings/);
 const shooting=source.slice(source.indexOf('function duel2Shoot(bot){'),source.indexOf('function duel2Projectiles(dt){'));
 assert.match(shooting,/bot\.duelVisible\?\.\[bot\.duelTargetId\]/);
 assert.doesNotMatch(shooting,/duelInbox|radioInbox|team\.radio/);
});
test('research telemetry records target switches, overlaps and skipped redundant packets per mode',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
 const report=src.slice(src.indexOf('window.__rrtDuel2Debug={'),src.indexOf('window.__rrtMultiDebug={'));
 for(const name of ['targetSwitches','focusOverlapSamples','suppressedSightings'])
  assert.match(report,new RegExp(name));
});

const L=require('./rrt_arena_leaderless_v0613.js');
test('target-lock dwell prevents oscillation between minor near-equal visible threats',()=>{
 const seen=[sight('R1',140,0,0),sight('R2',100,0,0)];
 assert.equal(D.chooseTarget(me,seen,'R1',{scale:400,now:1,lastSwitchAt:.8,minHoldSeconds:1,emergencyMargin:.4}),'R1');
 assert.equal(D.chooseTarget(me,seen,'R1',{scale:400,now:2.1,lastSwitchAt:.8,minHoldSeconds:1,emergencyMargin:.4}),'R2');
});
test('urgent closing threat can override target lock before dwell completes',()=>{
 const seen=[sight('R1',100,0,-30),sight('R2',130,0,240)];
 assert.equal(D.chooseTarget(me,seen,'R1',{scale:400,now:1,lastSwitchAt:.8,minHoldSeconds:1,emergencyMargin:.3}),'R2');
});
test('target lock never retains a lost or dead previous target',()=>{
 const absent=[sight('R2',100,0,0)];
 assert.equal(D.chooseTarget(me,absent,'R1',{scale:400,now:1,lastSwitchAt:.9,minHoldSeconds:1}),'R2');
 const memory=[sight('R1',30,0,0,'remembered',1),sight('R2',110,0,0,'visible',0)];
 assert.equal(D.chooseTarget(me,memory,'R1',{scale:400,now:1,lastSwitchAt:.9,minHoldSeconds:1}),'R2');
});
test('unchanged BID proposal rate-limits to stable interval but periodically refreshes',()=>{
 const from={id:'B1',x:0,y:0,hp:120,maxHp:120,ammo:6,maxAmmo:6,reload:0};
 const to={id:'B2',x:10,y:0,hp:120};
 const seen={R1:{id:'R1',x:80,y:0,status:'visible'}};
 const opts={range:150,scale:400,interval:.4,stableInterval:.95,qualityDelta:.06,ttl:1.3};
 const one=L.sendBid(null,from,to,seen,'R1',1,opts);
 const two=L.sendBid(one,from,to,seen,'R1',1.6,opts);
 assert.equal(one.queue.length,1);assert.equal(two.queue.length,1);
 const three=L.sendBid(two,from,to,seen,'R1',2.0,opts);
 assert.equal(three.queue.length,2,'BID must refresh before TTL expiry');
});
test('new target immediately updates BID after regular minimum interval',()=>{
 const from={id:'B1',x:0,y:0,hp:120,ammo:6},to={id:'B2',x:20,y:0,hp:120};
 const seen={R1:{id:'R1',x:80,y:0,status:'visible'},R2:{id:'R2',x:90,y:0,status:'visible'}};
 const opts={range:150,scale:400,interval:.4,stableInterval:.95,qualityDelta:.06};
 const one=L.sendBid(null,from,to,seen,'R1',1,opts);
 const two=L.sendBid(one,from,to,seen,'R2',1.5,opts);
 assert.equal(two.queue.length,2);assert.equal(two.queue[1].targetId,'R2');
});
test('meaningful local bid-quality change bypasses stable-message throttle',()=>{
 const from={id:'B1',x:0,y:0,hp:120,ammo:6},to={id:'B2',x:20,y:0,hp:120};
 const opts={range:200,scale:400,interval:.4,stableInterval:.95,qualityDelta:.04};
 const old=L.sendBid(null,from,to,{R1:{id:'R1',x:80,y:0,status:'visible'}},'R1',1,opts);
 const updated=L.sendBid(old,from,to,{R1:{id:'R1',x:160,y:0,status:'visible'}},'R1',1.5,opts);
 assert.equal(updated.queue.length,2);
});
test('RED R1/R2 stable BID throttles symmetrically and carries no cross-team messages',()=>{
 const from={id:'R1',x:0,y:0,hp:120,ammo:6},to={id:'R2',x:20,y:0,hp:120};
 const seen={B1:{id:'B1',x:70,y:0,status:'visible'}};
 const opts={range:150,scale:400,interval:.4,stableInterval:.95,qualityDelta:.06};
 const one=L.sendBid(null,from,to,seen,'B1',1,opts);
 const two=L.sendBid(one,from,to,seen,'B1',1.5,opts);
 assert.equal(one.queue.length,1);assert.equal(two.queue.length,1);
 assert.equal(one.queue[0].sender,'R1');assert.equal(one.queue[0].receiver,'R2');
});
test('stable BID and sighting throttles are only enabled for Duel2; legacy radio unchanged',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
 const duel=src.slice(src.indexOf('function senseDuel2World(){'),src.indexOf('function duel2Shoot(bot){'));
 assert.match(duel,/stableInterval:\.95/);
 assert.match(duel,/minHoldSeconds:1/);
 const multi=src.slice(src.indexOf('function senseMultiWorld(){'),src.indexOf('function multiProjectiles(dt){'));
 assert.doesNotMatch(multi,/stableInterval/);
});
