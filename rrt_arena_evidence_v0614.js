/* RRT ARENA V0.6.14 — local evidence provenance, NOT a truth oracle.
 * The simulation transport delivers messages; this module never reads World State.
 * Corroboration means independent origin claims agree, not that the claim is true.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaEvidence=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const pos=p=>!!p&&finite(p.x)&&finite(p.y);
const actor=id=>typeof id==='string'&&/^B\d{1,3}$/.test(id);
const target=id=>typeof id==='string'&&/^(?:T|R)\d{1,3}$/.test(id);
const token=id=>typeof id==='string'&&id.length>0&&id.length<=128&&/^[\w:.-]+$/.test(id);
const dict=()=>Object.create(null);
const emptyLedger=()=>({observations:dict(),seenMessages:dict()});
function prune(ledger,now){
 const state=emptyLedger();
 if(!finite(now))return state;
 for(const [k,v] of Object.entries(ledger?.observations||{}))
  if(v&&finite(v.expiresAt)&&v.expiresAt>now&&finite(v.observedAt)&&v.observedAt<=now)state.observations[k]=v;
 for(const [k,v] of Object.entries(ledger?.seenMessages||{}))
  if(finite(v)&&v>now)state.seenMessages[k]=v;
 return state;
}
function bound(map,limit){
 const pairs=Object.entries(map);
 if(pairs.length<=limit)return map;
 const keep=pairs.sort((a,b)=>a[1].expiresAt-b[1].expiresAt).slice(-limit);
 const result=dict();for(const [key,value] of keep)result[key]=value;return result;
}
function store(ledger,m,owner,now,isLocal){
 const state=prune(ledger,now);
 if(!actor(owner)||!finite(now)||!m||!actor(m.sender)||!actor(m.originId)||
    !target(m.targetId)||!token(m.messageId)||!token(m.observationId)||
    !pos(m)||!finite(m.observedAt)||m.observedAt>now||
    !finite(m.expiresAt)||m.expiresAt<=now||!finite(m.confidence)||
    m.confidence<0||m.confidence>1||m.source!=='own_sensor')
  return {ledger:state,status:'INVALID'};
 if(isLocal){
  if(m.sender!==owner||m.originId!==owner)return {ledger:state,status:'INVALID'};
 }else if(m.receiver!==owner||m.sender===owner||m.originId!==m.sender||
          !finite(m.deliverAt)||m.deliverAt>now||m.deliverAt<m.observedAt){
  // A relayed or forged-origin packet never counts as another independent witness.
  return {ledger:state,status:m.originId!==m.sender?'UNVERIFIED_ORIGIN':'INVALID'};
 }
 if(Object.hasOwn(state.seenMessages,m.messageId))
  return {ledger:state,status:'DUPLICATE_MESSAGE'};
 state.seenMessages[m.messageId]=m.expiresAt;
 const key=m.originId+':'+m.observationId;
 const old=state.observations[key];
 if(old){
  const same=old.targetId===m.targetId&&old.x===m.x&&old.y===m.y&&
             old.observedAt===m.observedAt;
  return {ledger:state,status:same?'DUPLICATE_EVIDENCE':'CONFLICTING_REPLAY'};
 }
 state.observations[key]={originId:m.originId,observationId:m.observationId,
  targetId:m.targetId,x:m.x,y:m.y,confidence:m.confidence,observedAt:m.observedAt,
  expiresAt:m.expiresAt,receivedFrom:m.sender,kind:isLocal?'own_sensor':'radio'};
 state.observations=bound(state.observations,512);
 state.seenMessages=bound(state.seenMessages,768);
 return {ledger:state,status:'ACCEPTED'};
}
function ingest(ledger,message,owner,now){return store(ledger,message,owner,now,false);}
function fingerprint(sender,targetId,observedAt,x,y){
 return sender+'-'+targetId+'-'+Math.round(observedAt*1000)+'-'+Math.round(x*10)+'-'+Math.round(y*10);
}
function ingestLocal(ledger,track,owner,now,{ttl=3.5}={}){
 const state=prune(ledger,now);
 if(!actor(owner)||!pos(track)||!target(track.id)||track.status!=='visible'||
    !finite(now)||!finite(ttl)||ttl<=0)return {ledger:state,status:'INVALID'};
 const at=finite(track.lastSeen)?track.lastSeen:now;
 const observationId=fingerprint(owner,track.id,at,track.x,track.y);
 return store(state,{source:'own_sensor',sender:owner,originId:owner,
  targetId:track.id,observationId,messageId:'local-'+observationId,x:track.x,y:track.y,
  confidence:finite(track.confidence)?Math.max(0,Math.min(1,track.confidence)):1,
  observedAt:at,expiresAt:at+ttl},owner,now,true);
}
function fromSighting(m,{ttl=3.5}={}){
 if(!m||!actor(m.sender)||!target(m.targetId)||!pos(m)||!finite(m.seenAt))return null;
 // The current ARENA sends only direct first-hand SIGHTING reports.
 // No identity authentication exists beyond the simulated radio transport.
 const id=fingerprint(m.sender,m.targetId,m.seenAt,m.x,m.y);
 return {source:m.source||'own_sensor',sender:m.sender,receiver:m.receiver,
  originId:m.sender,observationId:id,messageId:'radio-'+id,
  targetId:m.targetId,x:m.x,y:m.y,confidence:finite(m.confidence)?m.confidence:1,
  observedAt:m.seenAt,deliverAt:m.deliverAt,
  expiresAt:Math.min(finite(m.expiresAt)?m.expiresAt:Infinity,m.seenAt+ttl)};
}
function evaluate(ledger,targetId,now,{maxDistance=24,maxSpeed=80,maxSkew=.8}={}){
 const observations=Object.values(prune(ledger,now).observations)
  .filter(e=>e.targetId===targetId);
 const latest=new Map();
 for(const e of observations){
  const old=latest.get(e.originId);
  if(!old||e.observedAt>old.observedAt)latest.set(e.originId,e);
 }
 const sources=[...latest.values()].sort((a,b)=>b.observedAt-a.observedAt||
  a.originId.localeCompare(b.originId));
 if(!sources.length)return {status:'UNKNOWN',reason:'NO_EVIDENCE',independentSources:0};
 if(sources.length<2)return {status:'UNKNOWN',reason:'SINGLE_ORIGIN',independentSources:1,candidate:sources[0]};
 const anchor=sources[0];
 const disagree=sources.some(e=>Math.hypot(anchor.x-e.x,anchor.y-e.y)>
  Math.max(0,maxDistance)+Math.max(0,maxSpeed)*Math.abs(anchor.observedAt-e.observedAt));
 if(disagree)return {status:'CONFLICT',reason:'SPATIAL_DISAGREEMENT',independentSources:sources.length,candidates:sources};
 if(sources.some(e=>Math.abs(anchor.observedAt-e.observedAt)>maxSkew))
  return {status:'UNKNOWN',reason:'TEMPORAL_MISMATCH',independentSources:sources.length,candidates:sources};
 return {status:'CORROBORATED',reason:'INDEPENDENT_AGREEMENT',independentSources:sources.length,
  estimate:{x:sources.reduce((n,e)=>n+e.x,0)/sources.length,
   y:sources.reduce((n,e)=>n+e.y,0)/sources.length},candidates:sources};
}
return Object.freeze({emptyLedger,prune,ingest,ingestLocal,fromSighting,evaluate});
});
