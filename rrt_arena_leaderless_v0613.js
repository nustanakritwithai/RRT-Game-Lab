/* RRT Arena V0.6.13 — Symmetric leaderless target negotiation and radio fault transport.
 * No shared task leader, enemy registry, perception, long-term memory or global orders.
 * BLUE tactics use only individually visible target tracks and actually received bids.
 * World transport alone checks radio range and simulates loss/delay; it never chooses targets.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaLeaderless=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const targetId=id=>typeof id==='string'&&/^(?:T\d{1,3}|[BR][1-9]\d{0,2})$/.test(id);
 const validAgent=id=>/^[BR][1-9]\d{0,2}$/.test(String(id));
 const teammates=(a,b)=>validAgent(a)&&validAgent(b)&&a!==b&&a[0]===b[0];
 const emptyInbox=()=>({bids:{},responses:{}});
 function prune(inbox,now){
  const bids={},responses={};
  for(const [id,v] of Object.entries(inbox?.bids||{}))
   if(validAgent(id)&&targetId(v.targetId)&&Number.isFinite(v.expiresAt)&&v.expiresAt>now&&v.seenAt<=now)
    bids[id]={...v};
  for(const [id,v] of Object.entries(inbox?.responses||{}))
   if(validAgent(id)&&targetId(v.targetId)&&Number.isFinite(v.expiresAt)&&v.expiresAt>now&&v.seenAt<=now)
    responses[id]={...v};
  return {bids,responses};
 }
 function receive(inbox,messages,owner,now){
  const next=prune(inbox,now);
  if(!validAgent(owner)||!Number.isFinite(now))return next;
  for(const m of messages||[]){
   if(!m||m.receiver!==owner||!validAgent(m.sender)||m.sender===owner||
    !teammates(m.sender,owner)||!targetId(m.targetId)||!Number.isFinite(m.seenAt)||!Number.isFinite(m.deliverAt)||
    !Number.isFinite(m.expiresAt)||m.seenAt>now||m.deliverAt>now||m.expiresAt<=now)continue;
   if(m.type==='BID'){
    if(m.source!=='own_sensor'||!Number.isFinite(m.quality)||m.quality<0||m.quality>1)continue;
    const old=next.bids[m.sender];
    if(old&&old.seenAt>m.seenAt)continue;
    next.bids[m.sender]={type:'BID',sender:m.sender,targetId:m.targetId,
     quality:m.quality,seenAt:m.seenAt,receivedAt:now,expiresAt:m.expiresAt};
   }else if(m.type==='ACK'||m.type==='NACK'){
    if(m.source!=='own_decision')continue;
    const old=next.responses[m.sender];
    if(old&&old.seenAt>m.seenAt)continue;
    next.responses[m.sender]={type:m.type,sender:m.sender,targetId:m.targetId,
     seenAt:m.seenAt,receivedAt:now,expiresAt:m.expiresAt};
   }
  }
  return next;
 }
 // Keep each candidate's tactical bid tied to that agent's own direct sighting.
 function bidQuality(self,track,scale=400){
  if(!finite(self)||!finite(track)||track.status!=='visible')return 0;
  const d=distance(self,track),range=Math.max(1,scale*.8);
  const position=.6*(1-clamp(d/range,0,1));
  const health=.1*clamp((self.hp??120)/(self.maxHp??120),0,1);
  const ammo=.1*clamp((self.ammo??10)/(self.maxAmmo??10),0,1);
  const reload=self.reload>0?-.10:0;
  return Math.round(clamp(.2+position+health+ammo+reload,0,1)*10000)/10000;
 }
 function sendBid(radio,from,to,tracks,selectedId,now,{range=Infinity,latency=.3,interval=.4,ttl=1.3,scale=400,
  stableInterval=null,qualityDelta=.06,queueLimit=240}={}){
  const original=radio||{queue:[],lastSent:{}},queue=(original.queue||[]).slice(),lastSent={...(original.lastSent||{})};
  const local=tracks?.[selectedId];
  if(!finite(from)||!finite(to)||!teammates(from.id,to.id)||
   !Number.isFinite(now)||!targetId(selectedId)||!finite(local)||local.status!=='visible'||
   from.hp<=0||to.hp<=0||distance(from,to)>range)return {queue,lastSent};
  const key='BID:'+from.id+'>'+to.id;
  const quality=bidQuality(from,local,scale),prior=lastSent[key];
  const previousAt=Number.isFinite(prior)?prior:
   prior&&Number.isFinite(prior.at)?prior.at:-Infinity;
  // Duplex two-agent Duel uses event-based updates: changed target/quality
  // can refresh after the original minimum interval. Stable BID packets
  // refresh before TTL expiry and cannot create extra independent evidence.
  const stable=Number.isFinite(stableInterval)&&prior&&
   prior.targetId===selectedId&&Number.isFinite(prior.quality)&&
   Math.abs(prior.quality-quality)<Math.max(0,Number.isFinite(qualityDelta)?qualityDelta:.06);
  const gate=stable?Math.max(interval,stableInterval):interval;
  if(now-previousAt<gate)return {queue,lastSent};
  queue.push({type:'BID',sender:from.id,receiver:to.id,targetId:selectedId,
   quality,source:'own_sensor',seenAt:now,
   deliverAt:now+Math.max(0,latency),expiresAt:now+Math.max(0,ttl)});
  // Legacy modes retain their numeric lastSent book and unchanged timing.
  lastSent[key]=Number.isFinite(stableInterval)?{at:now,targetId:selectedId,quality}:now;
  return {queue:queue.slice(-Math.max(240,Math.floor(queueLimit)||240)),lastSent};
 }
 function sendResponse(radio,from,to,target,kind,now,{range=Infinity,latency=.3,ttl=1.3,interval=.9,queueLimit=240}={}){
  const old=radio||{queue:[],lastSent:{}},queue=(old.queue||[]).slice(),lastSent={...(old.lastSent||{})};
  if(!finite(from)||!finite(to)||!teammates(from.id,to.id)||!targetId(target)||!['ACK','NACK'].includes(kind)||!Number.isFinite(now)||
   from.hp<=0||to.hp<=0||distance(from,to)>range)return {queue,lastSent};
  const key=kind+':'+from.id+'>'+to.id+':'+target;
  if(now-(lastSent[key]??-Infinity)<interval)return {queue,lastSent};
  queue.push({type:kind,source:'own_decision',sender:from.id,receiver:to.id,targetId:target,
   seenAt:now,deliverAt:now+Math.max(0,latency),expiresAt:now+Math.max(0,ttl)});
  lastSent[key]=now;
  return {queue:queue.slice(-Math.max(240,Math.floor(queueLimit)||240)),lastSent};
 }
 function negotiate(self,localTracks,chosenId,inbox,now,{scale=400,criticalDistance=20,maxExtraDistance=.25,margin=.025}={}){
  const result={targetId:chosenId||null,changed:false,reason:'no_conflict',type:null,peerId:null};
  const chosen=localTracks?.[chosenId];
  if(!finite(self)||!chosenId||!finite(chosen)||chosen.status!=='visible'||!Number.isFinite(now))return result;
  const peer=Object.values(prune(inbox,now).bids)
   .filter(b=>b.targetId===chosenId&&teammates(b.sender,self.id))
   // Local, received BID comparison only: never global enemy truth or a commander.
   // Compare all peers, not the first packet that happened to arrive.
   .sort((a,b)=>b.quality-a.quality||b.seenAt-a.seenAt||
    Number(a.sender.slice(1))-Number(b.sender.slice(1)))[0];
  if(!peer)return result;
  result.peerId=peer.sender;
  const localBid=bidQuality(self,chosen,scale);
  if(localBid>peer.quality+margin)return {...result,reason:'self_preferred'};
  const equal=Math.abs(localBid-peer.quality)<=margin;
  if(equal&&String(self.id)<String(peer.sender))return {...result,reason:'tie_local'};
  if(distance(self,chosen)<=criticalDistance)return {...result,reason:'immediate_threat',type:'NACK'};
  if(!equal&&peer.quality<localBid+margin)return {...result,reason:'self_preferred'};
  const maxDist=distance(self,chosen)+scale*maxExtraDistance;
  const alternatives=Object.values(localTracks||{}).filter(t=>finite(t)&&targetId(t.id)&&
    t.id!==chosenId&&t.status==='visible'&&distance(self,t)<=maxDist);
  alternatives.sort((a,b)=>distance(self,a)-distance(self,b)||String(a.id).localeCompare(String(b.id)));
  if(!alternatives.length)return {...result,reason:'no_safe_alternative',type:'NACK'};
  return {targetId:alternatives[0].id,changed:true,reason:'negotiated_yield',
   type:'ACK',peerId:peer.sender,previousTargetId:chosenId,localBid,peerBid:peer.quality};
 }
 /* Network is a dumb transport: no priority, no visibility or target selection.
  * The named 'radio' RNG is independent from world/enemy/B1/B2 streams.
  * Rate-limits remain consumed for dropped packets, like real transmissions.
  */
 function applyNetwork(previous,candidate,{loss=0,delay=0,rand=Math.random,queueLimit=240}={}){
  const old=previous||{queue:[],lastSent:{}},next=candidate||old;
  const earlier=old.queue||[],candidateQueue=next.queue||[];
  const retained=candidateQueue.filter(m=>earlier.includes(m));
  const outgoing=candidateQueue.filter(m=>!earlier.includes(m));
  const pct=clamp(Number(loss)||0,0,1),lag=Math.max(0,Number(delay)||0);
  let dropped=0;
  for(const msg of outgoing){
   if(pct>0&&rand()<pct){dropped++;continue;}
   retained.push({...msg,deliverAt:msg.deliverAt+lag});
  }
  return {radio:{queue:retained.slice(-Math.max(240,Math.floor(queueLimit)||240)),lastSent:{...(next.lastSent||{})}},
   sent:outgoing.length,dropped,queued:outgoing.length-dropped};
 }
 return Object.freeze({emptyInbox,prune,receive,bidQuality,sendBid,sendResponse,negotiate,applyNetwork});
});
