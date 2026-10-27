'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('./rrt_arena_leaderless_v0613.js');
const bot=(id,x,y=20,hp=120)=>({id,x,y,hp,maxHp:120,ammo:8,maxAmmo:10,reload:0});
const tr=(id,x,y=20,status='visible')=>({id,x,y,status,confidence:1,lastSeen:10,kind:'hunter'});
const fresh=(from='B1',to='B2',target='T01',quality=.85,now=10)=>({
 type:'BID',sender:from,receiver:to,targetId:target,quality,source:'own_sensor',
 seenAt:now,deliverAt:now+.3,expiresAt:now+1.3
});
test('all BLUE agents own independent, non-shared transient negotiation inboxes',()=>{
 const a=L.emptyInbox(),b=L.emptyInbox();
 const updated=L.receive(b,[fresh()], 'B2',10.31);
 assert.deepEqual(a,{bids:{},responses:{}});
 assert.notStrictEqual(a,b);assert.equal(a.bids.B1,undefined);
 assert.equal(updated.bids.B1.targetId,'T01');
 assert.deepEqual(b,{bids:{},responses:{}});
});
test('leaderless BID is local observed target only; range, cooldown and precision enforced',()=>{
 const radio={queue:[],lastSent:{}},a=bot('B1',0),b=bot('B2',50);
 const sight={T01:tr('T01',65)};
 const sent=L.sendBid(radio,a,b,sight,'T01',10,{range:200,latency:.3});
 assert.equal(sent.queue.length,1);assert.equal(sent.queue[0].type,'BID');
 assert.ok(sent.queue[0].quality<=1&&sent.queue[0].quality>=0);
 assert.equal(sent.queue[0].source,'own_sensor');
 assert.equal(L.sendBid(sent,a,b,sight,'T01',10.1,{range:200}).queue.length,1);
 assert.equal(L.sendBid(radio,a,b,{T01:tr('T01',65,20,'memory')},'T01',10,{range:200}).queue.length,0);
 assert.equal(L.sendBid(radio,a,bot('B2',1000),sight,'T01',10,{range:200}).queue.length,0);
 assert.equal(L.sendBid(radio,a,b,sight,'T09',10,{range:200}).queue.length,0);
});
test('BID and ACK must be actually delivered and expire rather than becoming memory',()=>{
 const msg=fresh();
 assert.equal(L.receive(L.emptyInbox(),[msg],'B2',10.29).bids.B1,undefined);
 const r=L.receive(L.emptyInbox(),[msg],'B2',10.31);
 assert.equal(r.bids.B1.targetId,'T01');
 assert.equal(L.prune(r,11.31).bids.B1,undefined);
 assert.equal(L.receive(r,[],11.31).bids.B1,undefined);
 const ack=L.sendResponse({queue:[],lastSent:{}},bot('B2',0),bot('B1',55),'T01','ACK',10.4,{range:100});
 assert.equal(ack.queue.length,1);assert.equal(ack.queue[0].type,'ACK');
 assert.equal(L.receive(L.emptyInbox(),ack.queue,'B1',10.5).responses.B2,undefined);
 assert.equal(L.receive(L.emptyInbox(),ack.queue,'B1',10.8).responses.B2.type,'ACK');
});
test('malformed, forged and future packets do not enter negotiated state',()=>{
 const invalid=[
  {...fresh(),source:'world_truth'}, {...fresh(),quality:NaN},
  {...fresh(),quality:11}, {...fresh(),quality:-1},
  {...fresh(),sender:'RED'}, {...fresh(),receiver:'B1'},
  {...fresh(),seenAt:12}, {...fresh(),deliverAt:12},
  {...fresh(),expiresAt:10.1},
  {...fresh(),targetId:'secret'},
  {...fresh(),type:'SIGHTING'}
 ];
 for(const msg of invalid){
  const result=L.receive(L.emptyInbox(),[msg],'B2',10.4);
  assert.equal(result.bids.B1,undefined,'invalid packet '+JSON.stringify(msg));
 }
});
test('B1 can yield to stronger B2; B2 can yield to stronger B1: no designated leader',()=>{
 const tracks={T01:tr('T01',80),T02:tr('T02',90,33)};
 const b1=bot('B1',0),b2=bot('B2',30);
 const inboxForB1=L.receive(L.emptyInbox(),[fresh('B2','B1','T01',.99)],'B1',10.4);
 const inboxForB2=L.receive(L.emptyInbox(),[fresh('B1','B2','T01',.99)],'B2',10.4);
 const d1=L.negotiate(b1,tracks,'T01',inboxForB1,10.4,{scale:360,criticalDistance:12});
 const d2=L.negotiate(b2,tracks,'T01',inboxForB2,10.4,{scale:360,criticalDistance:12});
 assert.equal(d1.changed,true);assert.equal(d1.targetId,'T02');
 assert.equal(d2.changed,true);assert.equal(d2.targetId,'T02');
 assert.equal(d1.type,'ACK');assert.equal(d2.type,'ACK');
});
test('stronger local BID stays, critical danger overrides collaboration and hidden target cannot replace sight',()=>{
 const b=bot('B1',30),tracks={T01:tr('T01',48),T02:tr('T02',60)};
 const weak=L.receive(L.emptyInbox(),[fresh('B2','B1','T01',.05)],'B1',10.4);
 assert.equal(L.negotiate(b,tracks,'T01',weak,10.4,{scale:360,criticalDistance:5}).changed,false);
 const high=L.receive(L.emptyInbox(),[fresh('B2','B1','T01',.99)],'B1',10.4);
 assert.equal(L.negotiate(b,tracks,'T01',high,10.4,{scale:360,criticalDistance:25}).reason,'immediate_threat');
 assert.equal(L.negotiate(b,{...tracks,T02:tr('T02',60,20,'memory')},'T01',high,10.4,{scale:360,criticalDistance:5}).changed,false);
 assert.equal(L.negotiate(b,tracks,'T01',L.prune(high,20),20,{scale:360,criticalDistance:5}).changed,false);
});
test('equal BID is deterministic, not a hard-coded B1 leader: low id wins exact tie only',()=>{
 const tracks={T01:tr('T01',100),T02:tr('T02',105)};
 const x=bot('B1',0),y=bot('B2',0);
 const score=L.bidQuality(x,tracks.T01,500);
 const inbox1=L.receive(L.emptyInbox(),[fresh('B2','B1','T01',score)],'B1',10.4);
 const inbox2=L.receive(L.emptyInbox(),[fresh('B1','B2','T01',score)],'B2',10.4);
 assert.equal(L.negotiate(x,tracks,'T01',inbox1,10.4,{scale:500,criticalDistance:10}).changed,false);
 assert.equal(L.negotiate(y,tracks,'T01',inbox2,10.4,{scale:500,criticalDistance:10}).changed,true);
});
test('network delivery faults affect only new outgoing packets; 100% loss means no delivered coordination',()=>{
 const radio={queue:[],lastSent:{}},a=bot('B1',0),b=bot('B2',40);
 const candidate=L.sendBid(radio,a,b,{T01:tr('T01',80)},'T01',10);
 const dropped=L.applyNetwork(radio,candidate,{loss:1,rand:()=>0,delay:0});
 assert.equal(dropped.sent,1);assert.equal(dropped.dropped,1);assert.equal(dropped.radio.queue.length,0);
 assert.equal(Object.keys(dropped.radio.lastSent).length,1);
 assert.equal(candidate.queue.length,1,'caller not mutated');
 const delayed=L.applyNetwork(radio,candidate,{loss:0,rand:()=>0,delay:.9});
 assert.equal(delayed.dropped,0);assert.equal(delayed.radio.queue.length,1);
 assert.ok(delayed.radio.queue[0].deliverAt>=11.2);
 assert.equal(L.receive(L.emptyInbox(),delayed.radio.queue,'B2',10.7).bids.B1,undefined);
 const normal=L.applyNetwork(radio,candidate,{loss:0,rand:()=>.99,delay:0});
 assert.equal(normal.radio.queue[0].deliverAt,10.3);
});
test('network fault uses separate supplied random stream only for newly added messages',()=>{
 const previous={queue:[{type:'POSE',sender:'B1',receiver:'B2',seenAt:1}],lastSent:{}};
 const candidate={queue:[previous.queue[0],{type:'BID',sender:'B2',receiver:'B1',seenAt:1.2,deliverAt:1.5}],lastSent:{}};
 const r=L.applyNetwork(previous,candidate,{loss:.5,rand:()=>0});
 assert.strictEqual(r.radio.queue[0],previous.queue[0]);
 assert.equal(r.radio.queue.length,1);
 assert.equal(r.sent,1);
});


test('multi-peer leaderless conflict arbitration is deterministic regardless of packet arrival order',()=>{
 const self=bot('B5',0),tracks={R1:tr('R1',110),R2:tr('R2',115)};
 const packets=[
  fresh('B2','B5','R1',.10,10),
  fresh('B3','B5','R1',.99,10),
  fresh('B4','B5','R1',.75,10)
 ];
 const left=L.receive(L.emptyInbox(),packets,'B5',10.4);
 const right=L.receive(L.emptyInbox(),packets.slice().reverse(),'B5',10.4);
 const choose=inbox=>L.negotiate(self,tracks,'R1',inbox,10.4,
  {scale:400,criticalDistance:12});
 const a=choose(left),b=choose(right);
 assert.deepEqual(a,b,'peer-packet arrival must not decide tactical priority');
 assert.equal(a.peerId,'B3','choose strongest current peer BID, not first received');
 assert.equal(a.changed,true);
 assert.equal(a.targetId,'R2','alternative still requires own direct visible track');
 assert.equal(choose(L.emptyInbox()).changed,false);
});
