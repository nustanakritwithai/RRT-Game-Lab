/* RRT ARENA V0.9.1 — versioned private tactical policy archive.
 * Pure JSON with strict bounded policy validation; browser storage is called
 * only by the UI adapter and never grants shared decisions or hidden sensors.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaLearningArchive=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=1,KEY='rrt-arena-learning-v091',MAX_SAMPLES=10000,MAX_CHARS=20000;
const STYLES=Object.freeze(['balanced','aggressive','cautious']);
const CONTEXTS=Object.freeze(['contact','under_fire']);
const validId=id=>typeof id==='string'&&/^[BR](?:[1-9]|1[0-2])$/.test(id);
const empty=()=>({version:VERSION,policies:Object.create(null)});
const validStat=s=>s&&Number.isSafeInteger(s.samples)&&s.samples>=0&&
 s.samples<=MAX_SAMPLES&&typeof s.mean==='number'&&Number.isFinite(s.mean)&&
 s.mean>=-1&&s.mean<=1;
function normalize(policy){
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||
  !STYLES.includes(policy.style)||!policy.contexts||typeof policy.contexts!=='object')
  return null;
 const contexts=Object.create(null);let total=0;
 for(const context of CONTEXTS){
  const arms=policy.contexts[context];
  if(!arms||typeof arms!=='object')return null;
  contexts[context]=Object.create(null);
  for(const style of STYLES){
   const item=arms[style];
   if(!validStat(item))return null;
   contexts[context][style]={samples:item.samples,mean:item.mean};
   total+=item.samples;
  }
 }
 return total>0?{style:policy.style,contexts}:null;
}
function snapshot(state){
 if(!state?.enabled)return null;
 const contexts=Object.create(null);
 for(const c of CONTEXTS){
  contexts[c]=Object.create(null);
  for(const style of STYLES){
   const arm=state.contexts?.[c]?.[style];
   if(!arm||!Number.isFinite(arm.mean))return null;
   contexts[c][style]={
    samples:Math.min(MAX_SAMPLES,Math.max(0,Math.floor(arm.samples||0))),
    mean:Math.min(1,Math.max(-1,arm.mean))
   };
  }
 }
 return normalize({style:state.style,contexts});
}
function apply(state,policy){
 if(!state?.enabled)return false;
 const clean=normalize(policy);if(!clean)return false;
 const contexts=Object.create(null);let updates=0,rewardSum=0;
 for(const context of CONTEXTS){
  contexts[context]=Object.create(null);
  for(const style of STYLES){
   const arm=clean.contexts[context][style];
   contexts[context][style]={...arm};
   updates+=arm.samples;rewardSum+=arm.samples*arm.mean;
  }
 }
 state.contexts=contexts;
 state.style=clean.style;state.initialStyle=clean.style;
 state.context=null;state.windowStart=null;
 state.events={shots:0,confirmedHits:0,confirmedDamage:0,receivedDamage:0};
 state.updates=updates;state.windows=updates;
 state.totalReward=rewardSum;state.lastReward=null;
 state.shots=0;state.confirmedHits=0;state.confirmedDamage=0;
 state.receivedDamage=0;state.switches=0;
 return true;
}
function decode(raw){
 const result=empty();
 if(typeof raw!=='string'||raw.length>MAX_CHARS)return result;
 let obj;
 try{obj=JSON.parse(raw);}catch{return result;}
 if(!obj||obj.version!==VERSION||!obj.policies||typeof obj.policies!=='object'||
  Array.isArray(obj.policies))return result;
 for(const [id,policy] of Object.entries(obj.policies)){
  if(!validId(id))continue;
  const cleaned=normalize(policy);
  if(cleaned)result.policies[id]=cleaned;
 }
 return result;
}
function encode(archive){
 const safe=empty();
 for(const [id,policy] of Object.entries(archive?.policies||{})){
  if(!validId(id))continue;
  const cleaned=normalize(policy);
  if(cleaned)safe.policies[id]=cleaned;
 }
 return JSON.stringify(safe);
}
function count(archive){return Object.keys(archive?.policies||{}).filter(validId).length;}
return Object.freeze({KEY,VERSION,MAX_SAMPLES,STYLES,CONTEXTS,validId,empty,
 normalize,snapshot,apply,decode,encode,count});
});
