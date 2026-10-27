'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const leaderless=require('./rrt_arena_leaderless_v0613.js');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const flush=html.slice(html.indexOf('function flushDuel2PeerMesh(){'),
 html.indexOf("const multiActive=",html.indexOf('function flushDuel2PeerMesh(){')));
const network=(blocks,batched)=>{
 const makeRand=()=>{
  let i=0;return()=>((i++*11)%17)/17;
 };
 const rand=makeRand(),opts={loss:.35,delay:.3,rand,queueLimit:300};
 let radio={queue:[],lastSent:{}},sent=0,dropped=0;
 if(batched){
  const outgoing=blocks.flat();
  const result=leaderless.applyNetwork(radio,{
   queue:radio.queue.concat(outgoing),lastSent:{...radio.lastSent}
  },opts);
  radio=result.radio;sent+=result.sent;dropped+=result.dropped;
 }else for(const block of blocks){
  const result=leaderless.applyNetwork(radio,{
   queue:radio.queue.concat(block),lastSent:{...radio.lastSent}
  },opts);
  radio=result.radio;sent+=result.sent;dropped+=result.dropped;
 }
 return {radio,sent,dropped};
};
test('batched P2P transport equals sequential delivery/loss/ordering for fixed RNG',()=>{
 const blocks=Array.from({length:24},(_,g)=>
  Array.from({length:14},(_,p)=>({
   sender:'B'+(1+g%12),receiver:'B'+(1+(g+1)%12),
   type:'SIGHTING',source:'own_sensor',targetId:'R1',
   expiresAt:5,seenAt:1,deliverAt:1.3,seq:g*14+p
  })));
 const legacy=network(blocks,false),batch=network(blocks,true);
 assert.deepEqual(batch,legacy);
 assert.equal(batch.sent,24*14);
 assert.ok(batch.dropped>0);
 assert.equal(batch.radio.queue.length,Math.min(300,batch.sent-batch.dropped));
});
test('adaptive sender emits only new P2P packets using the shared rate-limit book',()=>{
 assert.match(html,/const rateBook=adaptive&&sourceBot\?sourceBot\.duelRadioLastSent/);
 assert.match(html,/const packetSource=adaptive\?\{queue:\[\],lastSent:rateBook\}:before/);
 assert.match(html,/if\(sourceBot\)sourceBot\.duelRadioLastSent=attempted\.lastSent\|\|rateBook/);
 assert.match(html,/const newPackets=attempted\.queue\|\|\[\]/);
 assert.match(html,/team\.radio=\{queue:before\.queue,lastSent:/);
 assert.doesNotMatch(html,/newPackets=\(attempted\.queue\|\|\[\]\)\.filter/);
});
test('outgoing-only packet builders preserve payloads and rate-limit history',()=>{
 const duel=require('./rrt_arena_duel_v0615.js');
 const prev={queue:[{type:'SIGHTING',sender:'B1',receiver:'B2',old:true}],
  lastSent:{'BID:B1>B2':{at:0,targetId:'R1',quality:.31}}};
 const from={id:'B1',team:'blue',hp:120,maxHp:120,ammo:6,maxAmmo:6,x:0,y:0};
 const to={id:'B2',team:'blue',hp:120,x:10,y:0};
 const tracks={R1:{id:'R1',x:120,y:40,status:'visible',confidence:1,lastSeen:1}};
 const fullSight=duel.sendSightings(prev,from,to,tracks,1,{range:50});
 const onlySight=duel.sendSightings({queue:[],lastSent:prev.lastSent},from,to,tracks,1,{range:50});
 assert.deepEqual(fullSight.queue.filter(x=>!x.old),onlySight.queue);
 assert.deepEqual(fullSight.lastSent,onlySight.lastSent);
 const visible={R1:{id:'R1',x:120,y:40,status:'visible'}};
 const fullBid=leaderless.sendBid(prev,from,to,visible,'R1',1,{range:50});
 const onlyBid=leaderless.sendBid({queue:[],lastSent:prev.lastSent},from,to,visible,'R1',1,{range:50});
 assert.deepEqual(fullBid.queue.filter(x=>!x.old),onlyBid.queue);
 assert.deepEqual(fullBid.lastSent,onlyBid.lastSent);
});
test('adaptive transport must apply packet loss once per communication tick',()=>{
 assert.ok(flush.startsWith('function flushDuel2PeerMesh(){'));
 assert.match(flush,/const pendingPackets=\[\]/);
 assert.match(flush,/pendingPackets\.push\(\.\.\.packets\)/);
 assert.match(flush,/if\(!pendingPackets\.length\)return;/);
 assert.match(flush,/leaderless\.applyNetwork\(before,attempted/);
 assert.equal((flush.match(/leaderless\.applyNetwork\(/g)||[]).length,1);
 // No central tactical commander or shared visibility is introduced.
 assert.doesNotMatch(flush,/duelVisible|duelBrains|duelTargetId|worldTruth|commander/);
});

test('sender-local rate books preserve global radio throttle per source',()=>{
 const duel=require('./rrt_arena_duel_v0615.js');
 const from=(id)=>({id,team:'blue',hp:120,maxHp:120,ammo:6,maxAmmo:6,x:id==='B1'?0:15,y:0});
 const peer=from('B3'),tracks={R1:{id:'R1',x:100,y:50,status:'visible',lastSeen:1,confidence:1}};
 let global={queue:[],lastSent:{}},local=Object.create(null);
 for(const bot of [from('B1'),from('B2'),from('B1'),from('B2')]){
  const now=bot.id==='B1'?2:2.2;
  const result=duel.sendSightings(global,bot,peer,tracks,now,{range:50});
  global=result;
  const ownBook=bot.id==='B1'?local:(global.__other||Object.create(null));
  const individual=duel.sendSightings({queue:[],lastSent:ownBook},bot,peer,tracks,now,{range:50});
  if(bot.id==='B1')local=individual.lastSent;else global.__other=individual.lastSent;
 }
 for(const [key,value] of Object.entries(global.lastSent)){
  const owner=key.startsWith('D2:B1>')?local:global.__other;
  assert.deepEqual(value,owner[key],'same rate state for '+key);
 }
});
