/* RRT Arena V0.6.12 — Private Radio Inbox and Reproducible Random Streams.
 * Pure, offline-safe. Radio payload never modifies PrivateMemory or LocalPerception.
 * SIGHTING / TARGET_CLAIM must be delivered first; all messages expire.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaPrivateRadio=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const clone=v=>({...v});
 function makeInbox(){return {sightings:{},claims:{},poses:{}};}
 function prune(inbox,now,{ttl=3.5}={}){
  const sightings={},claims={},poses={};
  for(const [id,m] of Object.entries(inbox?.sightings||{})){
   if(Number.isFinite(m.seenAt)&&m.seenAt<=now&&now-m.seenAt<=ttl&&
      Number.isFinite(m.expiresAt)&&m.expiresAt>=now&&finite(m))sightings[id]=clone(m);
  }
  for(const [id,m] of Object.entries(inbox?.claims||{})){
   if(Number.isFinite(m.seenAt)&&m.seenAt<=now&&now-m.seenAt<=ttl&&
      Number.isFinite(m.expiresAt)&&m.expiresAt>=now)claims[id]=clone(m);
  }
  for(const [id,m] of Object.entries(inbox?.poses||{})){
   if(Number.isFinite(m.seenAt)&&m.seenAt<=now&&
      Number.isFinite(m.expiresAt)&&m.expiresAt>=now&&finite(m))poses[id]=clone(m);
  }
  return {sightings,claims,poses};
 }
 function ingest(inbox,messages,now,{owner=null,ttl=3.5}={}){
  const state=prune(inbox,now,{ttl});
  for(const m of messages||[]){
   if(!m||m.receiver!==owner||!['B1','B2'].includes(m.sender)||m.sender===owner||
    !Number.isFinite(m.seenAt)||!Number.isFinite(m.deliverAt)||
    now<m.deliverAt||m.seenAt>now||now-m.seenAt>ttl)continue;
   const type=m.type||'SIGHTING';
   // POSE is a first-person radio packet describing the sender's own position.
   // It MUST be received before it may affect teammate tactical decisions.
   if(type==='POSE'){
    const expiresAt=Math.min(Number.isFinite(m.expiresAt)?m.expiresAt:Infinity,m.seenAt+.75);
    if(m.source!=='own_position'||!finite(m)||expiresAt<now||
       (m.sender!== 'B1'&&m.sender!=='B2'))continue;
    const old=state.poses[m.sender];
    if(old&&old.seenAt>m.seenAt)continue;
    state.poses[m.sender]={id:m.sender,x:m.x,y:m.y,hp:Number.isFinite(m.hp)?Math.max(0,m.hp):120,
      source:'radio',seenAt:m.seenAt,receivedAt:now,expiresAt};
    continue;
   }
   if(typeof m.targetId!=='string'||!/^T\d{1,3}$/.test(m.targetId))continue;
   if(type==='TARGET_CLAIM'){
    const expiresAt=Math.min(Number.isFinite(m.expiresAt)?m.expiresAt:Infinity,m.seenAt+ttl);
    if(expiresAt<now)continue;
    const existing=state.claims[m.sender];
    if(existing&&existing.seenAt>m.seenAt)continue;
    state.claims[m.sender]={sender:m.sender,targetId:m.targetId,seenAt:m.seenAt,expiresAt};
   }else if(type==='SIGHTING'&&finite(m)&&
    (m.source===undefined||m.source==='own_sensor')){
    const existing=state.sightings[m.targetId];
    if(existing&&existing.seenAt>m.seenAt)continue;
    state.sightings[m.targetId]={targetId:m.targetId,x:m.x,y:m.y,
     kind:m.kind||null,sender:m.sender,source:'radio',
     seenAt:m.seenAt,receivedAt:now,expiresAt:m.seenAt+ttl,
     confidence:Math.min(.64,Math.max(.05,(m.confidence??1)*.65))};
   }
  }
  return state;
 }
 function peerClaim(inbox,peer,now){
  const c=inbox?.claims?.[peer];
  return c&&c.expiresAt>=now&&c.seenAt<=now?c.targetId:null;
 }
 function sendClaim(radio,from,to,tracks,targetId,now,{range=Infinity,latency=.30,interval=.65,ttl=3.5}={}){
  const src=radio||{queue:[],lastSent:{}},queue=(src.queue||[]).slice(),lastSent={...(src.lastSent||{})};
  const t=tracks?.[targetId];
  if(!finite(from)||!finite(to)||!from.id||!to.id||from.id===to.id||
    !Number.isFinite(now)||!/^T\d{1,3}$/.test(String(targetId))||
    !finite(t)||t.status!=='visible'||distance(from,to)>range)return {queue,lastSent};
  const key='claim:'+from.id+'>'+to.id+':'+targetId;
  if(now-(lastSent[key]??-Infinity)<interval)return {queue,lastSent};
  queue.push({type:'TARGET_CLAIM',sender:from.id,receiver:to.id,
   targetId,seenAt:now,deliverAt:now+Math.max(0,latency),expiresAt:now+ttl});
  lastSent[key]=now;
  return {queue:queue.slice(-240),lastSent};
 }
 function sendPose(radio,from,to,now,{range=Infinity,latency=.30,interval=.25,ttl=.75}={}){
  const src=radio||{queue:[],lastSent:{}},queue=(src.queue||[]).slice(),lastSent={...(src.lastSent||{})};
  if(!finite(from)||!finite(to)||!['B1','B2'].includes(from.id)||!['B1','B2'].includes(to.id)||
   from.id===to.id||from.hp<=0||to.hp<=0||!Number.isFinite(now)||distance(from,to)>range)
   return {queue,lastSent};
  const key='pose:'+from.id+'>'+to.id;
  if(now-(lastSent[key]??-Infinity)<interval)return {queue,lastSent};
  queue.push({type:'POSE',source:'own_position',sender:from.id,receiver:to.id,
   x:from.x,y:from.y,hp:from.hp,seenAt:now,deliverAt:now+Math.max(0,latency),
   expiresAt:now+Math.max(0,ttl)});
  lastSent[key]=now;
  return {queue:queue.slice(-240),lastSent};
 }
 function peerPositions(inbox,now){
  return Object.values(inbox?.poses||{}).filter(m=>finite(m)&&m.seenAt<=now&&m.expiresAt>=now)
   .map(m=>({id:m.id,x:m.x,y:m.y,hp:m.hp,reportedAt:m.seenAt,age:Math.max(0,now-m.seenAt)}))
   .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 }
 function radioExploreGoal(inbox,self,now,{ttl=3.5,free=()=>false}={}){
  if(!finite(self))return null;
  const active=Object.values(inbox?.sightings||{}).filter(m=>
   finite(m)&&m.seenAt<=now&&now-m.seenAt<=ttl&&m.expiresAt>=now&&free(m));
  if(!active.length)return null;
  active.sort((a,b)=>b.seenAt-a.seenAt||distance(self,a)-distance(self,b)||String(a.targetId).localeCompare(String(b.targetId)));
  return {x:active[0].x,y:active[0].y};
 }
 function createStreams(seed=null,entropy=Math.random){
  let base=null,states={};
  const hash=name=>{
   let h=2166136261>>>0;
   for(let i=0;i<name.length;i++){h^=name.charCodeAt(i);h=Math.imul(h,16777619);}
   return h>>>0;
  };
  const reseed=value=>{
   base=(Number.isFinite(value)?Number(value)>>>0:Math.floor(entropy()*4294967296)>>>0);
   states={};return base;
  };
  const next=name=>{
   const key=String(name);
   if(!Object.prototype.hasOwnProperty.call(states,key))states[key]=(base^hash(key)^0x9E3779B9)>>>0;
   let a=states[key]=states[key]+0x6D2B79F5|0;
   let t=Math.imul(a^a>>>15,1|a);
   t=t+Math.imul(t^t>>>7,61|t)^t;
   return ((t^t>>>14)>>>0)/4294967296;
  };
  reseed(seed);
  return Object.freeze({next,reseed,getSeed:()=>base});
 }
 return Object.freeze({makeInbox,prune,ingest,peerClaim,sendClaim,sendPose,peerPositions,radioExploreGoal,createStreams});
});
