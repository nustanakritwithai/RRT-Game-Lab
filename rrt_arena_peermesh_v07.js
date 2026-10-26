/* RRT Arena PeerMesh Tactical V0.7.
 * Private per-agent outbox and dedup memory. The common arena simulates only
 * physical radio delivery/loss; there is no shared tactical brain or truth oracle.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaPeerMesh=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const actor=id=>typeof id==='string'&&/^[BR][12]$/.test(id);
const teammates=(a,b)=>actor(a)&&actor(b)&&a!==b&&a[0]===b[0];
const enemy=(a,b)=>actor(b)&&b[0]!==a[0];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const point=p=>p&&finite(p.x)&&finite(p.y);
const types=['SIGHTING','BID','ACK','NACK','NEED_SUPPORT','PM_ACK'];
const rank={PM_ACK:0,NEED_SUPPORT:1,NACK:2,ACK:2,BID:3,SIGHTING:4};
const maxAttempts=3;
 // RTT-sensitive team chat: sighting and urgent self-status deserve delivery
 // receipts; newer BID/ACK/NACK quickly supersede older tactical negotiation.
 const needsAck=type=>type==='SIGHTING'||type==='NEED_SUPPORT';
const counters=()=>({offered:0,suppressed:0,sent:0,retries:0,acknowledged:0,
 duplicates:0,stale:0,received:0,expired:0,invalid:0,supports:0});
function createPeer(id){
 if(!actor(id))throw Error('Invalid peer');
 return {id,nextId:1,pending:new Map(),seen:new Map(),supportHint:null,counters:counters()};
}
function support(self,to,now){
 if(!self||!actor(self.id)||!teammates(self.id,to)||!point(self)||!finite(self.hp)||!finite(now))return null;
 return {type:'NEED_SUPPORT',source:'own_status',sender:self.id,receiver:to,
  x:self.x,y:self.y,hp:Math.max(0,self.hp),seenAt:now,deliverAt:now+.3,expiresAt:now+1.15};
}
function valid(peer,m,now){
 if(!m||!types.includes(m.type)||m.sender!==peer.id||
  !teammates(m.sender,m.receiver)||!finite(now)||!finite(m.seenAt)||
  m.seenAt>now||!finite(m.expiresAt)||m.expiresAt<=now||
  !finite(m.deliverAt)||m.deliverAt>m.expiresAt||m.deliverAt<m.seenAt)return false;
 if(m.type==='PM_ACK')
  return m.source==='own_decision'&&typeof m.replyTo==='string'&&/^pm-[BR][12]-\d+$/.test(m.replyTo);
 if(m.type==='NEED_SUPPORT')
  return m.source==='own_status'&&point(m)&&finite(m.hp)&&m.hp>=0;
 if(!enemy(peer.id,m.targetId))return false;
 if(m.type==='SIGHTING')
  return m.source==='own_sensor'&&m.originId===peer.id&&point(m)&&
   finite(m.confidence)&&m.confidence>=0&&m.confidence<=1;
 if(m.type==='BID')
  return m.source==='own_sensor'&&finite(m.quality)&&m.quality>=0&&m.quality<=1;
 return m.source==='own_decision';
}
const keyFor=m=>m.receiver+':'+m.type+':'+(m.targetId||m.replyTo||'self');
function offer(peer,packet,now){
 if(!valid(peer,packet,now)){
  peer.counters.invalid++;return {accepted:false,reason:'INVALID'};
 }
 const key=keyFor(packet),old=peer.pending.get(key);
 if(old&&packet.type!=='PM_ACK'&&packet.seenAt<=old.message.seenAt+1e-6){
  peer.counters.suppressed++;return {accepted:false,reason:'COALESCED'};
 }
 const msg={...packet,meshId:'pm-'+peer.id+'-'+peer.nextId++};
 peer.pending.set(key,{message:msg,attempts:0,nextAt:now,priority:rank[packet.type]});
 peer.counters.offered++;
 return {accepted:true,id:msg.meshId};
}
function prune(peer,now){
 for(const [key,p] of peer.pending){
  if(p.message.expiresAt<=now){peer.pending.delete(key);peer.counters.expired++;}
 }
 for(const [key,expiry] of peer.seen)if(expiry<=now)peer.seen.delete(key);
 if(peer.supportHint&&peer.supportHint.expiresAt<=now)peer.supportHint=null;
}
function due(peer,now,{receiver=null,inRange=true,maxPackets=3}={}){
 if(!finite(now))return [];
 prune(peer,now);
 if(!inRange||!teammates(peer.id,receiver))return [];
 const options=[...peer.pending.values()].filter(p=>
  p.message.receiver===receiver&&p.nextAt<=now&&p.attempts<maxAttempts);
 options.sort((a,b)=>a.priority-b.priority||
  a.message.seenAt-b.message.seenAt||a.message.meshId.localeCompare(b.message.meshId));
 const packets=[],limit=Math.max(0,Math.min(5,Math.trunc(maxPackets)||0));
 for(const p of options.slice(0,limit)){
  const delay=Math.max(0,p.message.deliverAt-p.message.seenAt);
  const deliverAt=now+delay;
  if(deliverAt>=p.message.expiresAt)continue; // never schedule already expired evidence
  p.attempts++;
  peer.counters.sent++;
  if(p.attempts>1)peer.counters.retries++;
  p.nextAt=needsAck(p.message.type)?
   now+.96*Math.pow(2,p.attempts-1):Infinity;
  packets.push({...p.message,deliverAt});
 }
 // Noncritical negotiations and PM_ACK are best-effort one-shot packets.
 // If a delivery receipt is lost, the source may retry its original SIGHTING.
 for(const [key,p] of peer.pending)if(!needsAck(p.message.type)&&p.nextAt===Infinity)
  peer.pending.delete(key);
 return packets;
}
function receive(peer,packet,now){
 if(!packet||!finite(now)||!teammates(packet.sender,peer.id)||
  packet.receiver!==peer.id||!finite(packet.seenAt)||!finite(packet.deliverAt)||
  packet.deliverAt>now||!finite(packet.expiresAt)||packet.expiresAt<=now){
  peer.counters.stale++;return {deliver:false,reason:'STALE',ack:null};
 }
 if(packet.type==='PM_ACK'){
  if(packet.source!=='own_decision'||typeof packet.replyTo!=='string')
   return {deliver:false,reason:'INVALID_ACK',ack:null};
  for(const [key,p] of peer.pending){
   if(p.message.meshId===packet.replyTo&&p.message.receiver===packet.sender){
    peer.pending.delete(key);peer.counters.acknowledged++;
    return {deliver:false,reason:'ACKED',ack:null};
   }
  }
  return {deliver:false,reason:'UNKNOWN_ACK',ack:null};
 }
 if(typeof packet.meshId!=='string'||!/^pm-[BR][12]-\d+$/.test(packet.meshId)||
  !types.includes(packet.type)||packet.type==='PM_ACK'||
  (packet.type==='SIGHTING'&&
   (packet.source!=='own_sensor'||packet.originId!==packet.sender||
    !enemy(peer.id,packet.targetId)||!point(packet)))||
  (packet.type==='BID'&&(packet.source!=='own_sensor'||!enemy(peer.id,packet.targetId)))||
  (['ACK','NACK'].includes(packet.type)&&
   (packet.source!=='own_decision'||!enemy(peer.id,packet.targetId)))||
  (packet.type==='NEED_SUPPORT'&&(packet.source!=='own_status'||!point(packet)))){
  peer.counters.invalid++;return {deliver:false,reason:'INVALID',ack:null};
 }
 const ack=needsAck(packet.type)?{type:'PM_ACK',source:'own_decision',sender:peer.id,
  receiver:packet.sender,replyTo:packet.meshId,seenAt:now,
  deliverAt:now+.30,expiresAt:now+1.1}:null;
 if((peer.seen.get(packet.meshId)||-Infinity)>now){
  peer.counters.duplicates++;return {deliver:false,reason:'DUPLICATE',ack};
 }
 peer.seen.set(packet.meshId,Math.min(packet.expiresAt,now+4));
 peer.counters.received++;
 if(packet.type==='NEED_SUPPORT'){
  peer.supportHint={x:packet.x,y:packet.y,from:packet.sender,
   expiresAt:Math.min(packet.expiresAt,packet.seenAt+1.15)};
  peer.counters.supports++;
 }
 return {deliver:true,reason:'ACCEPTED',ack};
}
function supportGoal(peer,now,free=()=>false){
 const s=peer?.supportHint;
 return s&&finite(now)&&s.expiresAt>now&&point(s)&&free(s)?{x:s.x,y:s.y}:null;
}
function stats(peer){return {...peer.counters,queued:peer.pending.size,seen:peer.seen.size};}
return Object.freeze({createPeer,support,offer,prune,due,receive,supportGoal,stats});
});
