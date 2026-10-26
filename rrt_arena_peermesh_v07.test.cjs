'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('./rrt_arena_peermesh_v07.js');
const pos=(id,x=10,y=10)=>({id,x,y,hp:120});
const sight=(now=1)=>({type:'SIGHTING',source:'own_sensor',sender:'B1',receiver:'B2',
 originId:'B1',targetId:'R1',x:100,y:150,seenAt:now,deliverAt:now+.3,expiresAt:now+2,confidence:1});
test('each fighter has its own private PeerMesh state; no common leader or truth table',()=>{
 const a=M.createPeer('B1'),b=M.createPeer('B2'),r=M.createPeer('R1');
 assert.notStrictEqual(a.pending,b.pending);
 assert.notStrictEqual(a.seen,b.seen);
 assert.equal(M.offer(a,sight(1),1).accepted,true);
 assert.equal(M.stats(b).queued,0);
 assert.equal(M.offer(r,sight(1),1).accepted,false,'cannot fake different sender');
 assert.equal(M.offer(a,{...sight(),receiver:'R1'},1).accepted,false,'cross-team leak');
});
test('urgent self status precedes BID and SIGHTING, no enemy knowledge in SUPPORT',()=>{
 const a=M.createPeer('B1');
 M.offer(a,sight(1),1);
 M.offer(a,{type:'BID',source:'own_sensor',sender:'B1',receiver:'B2',targetId:'R1',
  quality:.7,seenAt:1,deliverAt:1.3,expiresAt:2.4},1);
 M.offer(a,M.support(pos('B1',15,20),'B2',1),1);
 const out=M.due(a,1,{receiver:'B2',inRange:true,maxPackets:3});
 assert.deepEqual(out.map(p=>p.type),['NEED_SUPPORT','BID','SIGHTING']);
 assert.equal(out[0].targetId,undefined);
 assert.equal(out[0].x,15);
});
test('dropped first packet is retried with backoff; real ACK stops retries',()=>{
 const a=M.createPeer('B1'),b=M.createPeer('B2');
 assert.equal(M.offer(a,sight(1),1).accepted,true);
 const [first]=M.due(a,1,{receiver:'B2',inRange:true});
 assert.equal(M.due(a,1.1,{receiver:'B2',inRange:true}).length,0);
 const later=M.due(a,1.5,{receiver:'B2',inRange:true});
 assert.equal(later.length,1);
 assert.equal(later[0].meshId,first.meshId,'retransmits same observation');
 const received=M.receive(b,later[0],1.6);
 assert.equal(received.deliver,true);
 assert.equal(received.ack.type,'PM_ACK');
 M.offer(b,received.ack,1.6);
 const [ack]=M.due(b,1.6,{receiver:'B1',inRange:true});
 assert.equal(ack.type,'PM_ACK');
 assert.equal(M.receive(a,ack,1.7).reason,'ACKED');
 assert.equal(M.due(a,2,{receiver:'B2',inRange:true}).length,0);
 assert.equal(M.stats(a).acknowledged,1);
 assert.equal(M.stats(a).retries,1);
});
test('duplicate delivery does not become an independent second sighting',()=>{
 const a=M.createPeer('B1'),b=M.createPeer('B2');
 M.offer(a,sight(1),1);
 const [p]=M.due(a,1,{receiver:'B2',inRange:true});
 assert.equal(M.receive(b,p,1.2).deliver,true);
 const duplicate=M.receive(b,p,1.3);
 assert.equal(duplicate.deliver,false);
 assert.equal(duplicate.reason,'DUPLICATE');
 assert.equal(duplicate.ack.replyTo,p.meshId);
 assert.equal(M.stats(b).duplicates,1);
});
test('no range = no sent mark; stale packets expire, drop and no ghost knowledge',()=>{
 const a=M.createPeer('B1'),b=M.createPeer('B2');
 M.offer(a,sight(1),1);
 assert.deepEqual(M.due(a,1,{receiver:'B2',inRange:false}),[]);
 assert.equal(M.stats(a).sent,0);
 const [packet]=M.due(a,1.1,{receiver:'B2',inRange:true});
 assert.equal(M.receive(b,packet,3.2).deliver,false);
 assert.equal(M.stats(b).stale,1);
 assert.deepEqual(M.due(a,4,{receiver:'B2',inRange:true}),[]);
});
test('sender-side coalescing favors newer sightings; ACK budget is bounded',()=>{
 const a=M.createPeer('B1');
 assert.equal(M.offer(a,sight(1),1).accepted,true);
 assert.equal(M.offer(a,sight(1),1).accepted,false);
 assert.equal(M.offer(a,{...sight(1.2),x:120},1.2).accepted,true);
 const [p]=M.due(a,1.2,{receiver:'B2',inRange:true});
 assert.equal(p.x,120);
 assert.equal(M.stats(a).suppressed,1);
 for(let k=0;k<20;k++)M.due(a,1.7+k*.42,{receiver:'B2',inRange:true});
 assert.ok(M.stats(a).sent<=3,'max 3 real attempts');
 assert.ok(M.stats(a).queued===0,'TTL removes unacknowledged stale sighting');
});
test('received SUPPORT is only a short-lived voluntary search hint, not a sighting',()=>{
 const a=M.createPeer('B1'),b=M.createPeer('B2');
 M.offer(a,M.support(pos('B1',80,50),'B2',1),1);
 const [p]=M.due(a,1,{receiver:'B2',inRange:true});
 const rec=M.receive(b,p,1.2);
 assert.equal(rec.deliver,true);
 assert.deepEqual(M.supportGoal(b,1.2,()=>true),{x:80,y:50});
 assert.equal(M.supportGoal(b,3,()=>true),null);
 assert.equal(M.supportGoal(b,1.3,()=>false),null);
});
test('SIGHTING has finite TTL and cannot be emitted if not first-hand',()=>{
 const a=M.createPeer('B1');
 assert.equal(M.offer(a,{...sight(),source:'radio'},1).accepted,false);
 assert.equal(M.offer(a,{...sight(),originId:'R1'},1).accepted,false);
 assert.equal(M.offer(a,{...sight(),seenAt:9,expiresAt:12},1).accepted,false);
 assert.equal(M.stats(a).sent,0);
});
test('browser entrypoint includes the same PeerMesh policy and symmetric tactical selection',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const js=fs.readFileSync('rrt_arena_peermesh_v07.js','utf8').trim();
 assert.ok(html.includes(js),'inline browser policy must match tested module exactly');
 assert.match(html,/value="adaptive"/);
 assert.match(html,/dteam=adaptive|teamParams\.get\('dteam'\)==='adaptive'/);
 assert.match(html,/meshCore\.receive/);
 assert.match(html,/meshCore\.due/);
 assert.match(html,/bot\.peerMesh=meshCore\.createPeer/);
 assert.match(html,/team\.mode==='cooperative'\|\|team\.mode==='adaptive'/);
 assert.match(html,/bot\.duelVisible\?\.\[bot\.duelTargetId\]/,'shoot only locally visible');
});
