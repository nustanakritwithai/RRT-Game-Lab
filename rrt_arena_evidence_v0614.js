/* RRT Arena V0.6.14 — per-agent evidence ledger. No world-state reads. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.RRTArenaEvidence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function emptyLedger(){return {observations:{},seenMessages:{}};}
function ingest(ledger,message,owner,now){
 const state={observations:{...(ledger?.observations||{})},seenMessages:{...(ledger?.seenMessages||{})}};
 if(!validId(owner)||!finite(now)||!message||message.receiver!==owner||!validId(message.sender)||message.sender===owner||
 !validId(message.messageId)||!validId(message.originId)||!validId(message.observationId)||!validId(message.targetId)||
 !finite(message.observedAt)||message.observedAt>now||!finite(message.expiresAt)||message.expiresAt<=now||
 !finite(message.x)||!finite(message.y)||!finite(message.confidence)||message.confidence<0||message.confidence>1)
 return {ledger:state,status:'INVALID'};
 if(state.seenMessages[message.messageId])return {ledger:state,status:'DUPLICATE_MESSAGE'};
 state.seenMessages[message.messageId]=message.expiresAt;
 const key=message.originId+':'+message.observationId;
 if(state.observations[key])return {ledger:state,status:'DUPLICATE_EVIDENCE'};
 state.observations[key]={originId:message.originId,observationId:message.observationId,targetId:message.targetId,
 x:message.x,y:message.y,confidence:message.confidence,observedAt:message.observedAt,expiresAt:message.expiresAt,receivedFrom:message.sender};
 return {ledger:state,status:'ACCEPTED'};
}
function prune(ledger,now){
 const state=emptyLedger();
 for(const [k,v] of Object.entries(ledger?.observations||{}))if(v.expiresAt>now)state.observations[k]=v;
 for(const [k,v] of Object.entries(ledger?.seenMessages||{}))if(v>now)state.seenMessages[k]=v;
 return state;
}
function evaluate(ledger,targetId,now,{maxDistance=25}={}){
 const evidence=Object.values(prune(ledger,now).observations).filter(e=>e.targetId===targetId);
 if(!evidence.length)return {status:'UNKNOWN',reason:'NO_EVIDENCE',independentSources:0};
 const latestByOrigin=new Map();
 for(const e of evidence){const old=latestByOrigin.get(e.originId);if(!old||e.observedAt>old.observedAt)latestByOrigin.set(e.originId,e);}
 const sources=[...latestByOrigin.values()].sort((a,b)=>b.observedAt-a.observedAt);
 if(sources.length<2)return {status:'UNKNOWN',reason:'SINGLE_ORIGIN',independentSources:sources.length,candidate:sources[0]};
 const base=sources[0],consistent=sources.every(e=>Math.hypot(e.x-base.x,e.y-base.y)<=maxDistance);
 if(!consistent)return {status:'CONFLICT',reason:'INDEPENDENT_DISAGREEMENT',independentSources:sources.length,candidates:sources};
 return {status:'CORROBORATED',reason:'INDEPENDENT_AGREEMENT',independentSources:sources.length,
 estimate:{x:sources.reduce((s,e)=>s+e.x,0)/sources.length,y:sources.reduce((s,e)=>s+e.y,0)/sources.length}};
}
return Object.freeze({emptyLedger,ingest,prune,evaluate});
});
