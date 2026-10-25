'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('./rrt_arena_evidence_v0614.js');
const msg=(o={})=>({type:'SIGHTING',source:'own_sensor',receiver:'B1',sender:'B2',
 originId:'B2',messageId:'m1',observationId:'obs1',targetId:'T1',
 x:100,y:200,confidence:.8,observedAt:1,deliverAt:1.3,expiresAt:4.5,...o});
function insert(ledger,packet,now=2){return E.ingest(ledger,packet,'B1',now);}
test('a firsthand packet is accepted into private ledger',()=>{
 const r=insert(E.emptyLedger(),msg());
 assert.equal(r.status,'ACCEPTED');assert.equal(Object.keys(r.ledger.observations).length,1);
 assert.equal(r.ledger.observations['B2:obs1'].kind,'radio');
});
test('retransmitted message does not become a second vote',()=>{
 const a=insert(E.emptyLedger(),msg());
 assert.equal(insert(a.ledger,msg()).status,'DUPLICATE_MESSAGE');
 assert.equal(E.evaluate(a.ledger,'T1',2).independentSources,1);
});
test('two different message IDs from the same observation count once',()=>{
 const a=insert(E.emptyLedger(),msg());
 const b=insert(a.ledger,msg({messageId:'m2'}));
 assert.equal(b.status,'DUPLICATE_EVIDENCE');
 assert.equal(E.evaluate(b.ledger,'T1',2).status,'UNKNOWN');
});
test('relay claims are quarantined rather than counted as independent',()=>{
 const a=insert(E.emptyLedger(),msg());
 const b=insert(a.ledger,msg({sender:'B3',originId:'B2',messageId:'m2'}));
 assert.equal(b.status,'UNVERIFIED_ORIGIN');
 assert.equal(E.evaluate(b.ledger,'T1',2).independentSources,1);
});
test('two independent simultaneous conflicting sightings stay CONFLICT',()=>{
 let a=insert(E.emptyLedger(),msg());
 a=insert(a.ledger,msg({sender:'B3',originId:'B3',observationId:'obs2',messageId:'m2',x:200}));
 assert.equal(E.evaluate(a.ledger,'T1',2).status,'CONFLICT');
});
test('two independent spatially compatible sightings are corroborated, not verified',()=>{
 let a=insert(E.emptyLedger(),msg());
 a=insert(a.ledger,msg({sender:'B3',originId:'B3',observationId:'obs2',messageId:'m2',x:105}));
 const result=E.evaluate(a.ledger,'T1',2);
 assert.equal(result.status,'CORROBORATED');
 assert.equal(result.independentSources,2);
 assert.equal(result.estimate.x,102.5);
});
test('temporal mismatches are UNKNOWN, not falsely voted as conflict',()=>{
 let a=insert(E.emptyLedger(),msg({expiresAt:7}),4);
 a=insert(a.ledger,msg({sender:'B3',originId:'B3',observationId:'obs2',messageId:'m2',
  x:150,observedAt:3,deliverAt:3.1,expiresAt:7}),4);
 assert.equal(E.evaluate(a.ledger,'T1',4).reason,'TEMPORAL_MISMATCH');
});
test('impossible displacement beyond speed bound still conflicts',()=>{
 let a=insert(E.emptyLedger(),msg({expiresAt:7}),4);
 a=insert(a.ledger,msg({sender:'B3',originId:'B3',observationId:'obs2',messageId:'m2',
  x:900,observedAt:3,deliverAt:3.1,expiresAt:7}),4);
 assert.equal(E.evaluate(a.ledger,'T1',4).status,'CONFLICT');
});
test('expired evidence is not authoritative and is pruned',()=>{
 const a=insert(E.emptyLedger(),msg());
 assert.equal(E.evaluate(a.ledger,'T1',6).reason,'NO_EVIDENCE');
 assert.equal(Object.keys(E.prune(a.ledger,6).observations).length,0);
});
test('future observations and not-yet-delivered packets cannot be accepted',()=>{
 assert.equal(insert(E.emptyLedger(),msg({observedAt:5})).status,'INVALID');
 assert.equal(insert(E.emptyLedger(),msg({deliverAt:3})).status,'INVALID');
});
test('wrong receiver and own-loop packet are not received',()=>{
 assert.equal(insert(E.emptyLedger(),msg({receiver:'B3'})).status,'INVALID');
 assert.equal(insert(E.emptyLedger(),msg({sender:'B1',originId:'B1'})).status,'INVALID');
});
test('implausible confidence, nan position, and unsupported source are invalid',()=>{
 for(const overrides of [{confidence:1.1},{confidence:-.1},{x:NaN},{source:'relay'},{targetId:'other'}])
  assert.equal(insert(E.emptyLedger(),msg(overrides)).status,'INVALID');
});
test('conflicting replay of the same origin observation cannot rewrite coordinates',()=>{
 const a=insert(E.emptyLedger(),msg());
 const b=insert(a.ledger,msg({messageId:'m2',x:200}));
 assert.equal(b.status,'CONFLICTING_REPLAY');
 assert.equal(b.ledger.observations['B2:obs1'].x,100);
});
test('direct BLUE observation is independent of received radio',()=>{
 const own=E.ingestLocal(E.emptyLedger(),{id:'T1',status:'visible',x:102,y:201,lastSeen:1.1},'B1',2);
 assert.equal(own.status,'ACCEPTED');
 const peer=insert(own.ledger,msg());
 assert.equal(E.evaluate(peer.ledger,'T1',2).status,'CORROBORATED');
});
test('own track must be visible; radio cannot masquerade as local sensor',()=>{
 assert.equal(E.ingestLocal(E.emptyLedger(),{id:'T1',status:'memory',x:100,y:100},'B1',2).status,'INVALID');
 assert.equal(E.ingestLocal(E.emptyLedger(),{id:'T1',status:'visible',x:100,y:100},'B1',2).status,'ACCEPTED');
});
test('native ARENA SIGHTING can be normalized after transport arrival',()=>{
 const sight={sender:'B2',receiver:'B1',targetId:'T1',x:100,y:200,confidence:1,
  seenAt:1,deliverAt:1.3};
 const packet=E.fromSighting(sight);
 assert.equal(packet.originId,'B2');assert.equal(packet.expiresAt,4.5);
 assert.equal(insert(E.emptyLedger(),packet).status,'ACCEPTED');
 assert.equal(insert(E.emptyLedger(),E.fromSighting({...sight,source:'relay'})).status,'INVALID');
});
test('no evidence, and a single source, always preserve UNKNOWN',()=>{
 assert.equal(E.evaluate(E.emptyLedger(),'T1',2).status,'UNKNOWN');
 let a=insert(E.emptyLedger(),msg());
 a=insert(a.ledger,msg({messageId:'m2',observationId:'obs2',observedAt:1.2,deliverAt:1.4}));
 assert.equal(E.evaluate(a.ledger,'T1',2).status,'UNKNOWN');
});

test('RED firsthand SIGHTING of BLUE B1 is accepted by RED R2 evidence ledger',()=>{
 const wire=E.fromSighting({type:'SIGHTING',source:'own_sensor',
  sender:'R1',receiver:'R2',targetId:'B1',x:100,y:200,
  confidence:1,seenAt:1,deliverAt:1.3,expiresAt:4.5});
 assert.ok(wire);
 const r=E.ingest(E.emptyLedger(),wire,'R2',1.5);
 assert.equal(r.status,'ACCEPTED');
 assert.equal(E.evaluate(r.ledger,'B1',1.5).status,'UNKNOWN');
 assert.equal(E.ingest(E.emptyLedger(),wire,'B2',1.5).status,'INVALID');
});
