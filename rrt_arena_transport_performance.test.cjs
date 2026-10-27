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
 assert.equal(batch.radio.queue.length,300);
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
