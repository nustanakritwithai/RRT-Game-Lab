/* RRT Arena V0.8.2 — private, bounded online tactical learning.
 * Three existing tactical strategies, no stat changes or hidden enemy positions.
 * Own observed events provide the only rewards. No radio/shared brain.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaOnlineLearning=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STYLES=Object.freeze(['balanced','aggressive','cautious']);
const CONTEXTS=Object.freeze(['contact','under_fire']);
const WINDOW_SECONDS=3;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const stats=()=>({samples:0,mean:0});
const contextStats=()=>Object.fromEntries(STYLES.map(style=>[style,stats()]));
const events=()=>({shots:0,confirmedHits:0,confirmedDamage:0,receivedDamage:0});
function create(enabled=true){
 return {enabled:enabled===true,style:'balanced',context:null,windowStart:null,
  contexts:{contact:contextStats(),under_fire:contextStats()},events:events(),
  shots:0,confirmedHits:0,confirmedDamage:0,receivedDamage:0,
  updates:0,windows:0,switches:0,totalReward:0,lastReward:null};
}
function recordShot(state){
 if(!state?.enabled||!state.context)return false;
 state.events.shots++;state.shots++;return true;
}
function recordConfirmedHit(state,damage,observed){
 if(!state?.enabled||!state.context||observed!==true||!Number.isFinite(damage)||damage<=0)return false;
 const n=clamp(damage,0,120);
 state.events.confirmedHits++;state.events.confirmedDamage+=n;
 state.confirmedHits++;state.confirmedDamage+=n;
 return true;
}
function recordDamage(state,damage){
 if(!state?.enabled||!state.context||!Number.isFinite(damage)||damage<=0)return false;
 const n=clamp(damage,0,120);
 state.events.receivedDamage+=n;state.receivedDamage+=n;return true;
}
function feedback(state){
 const e=state.events;
 // Shots alone are NOT success. Only personally witnessed impacts and actual
 // personal damage count; intentionally avoids reading global enemy HP/position.
 if(!e.shots&&!e.confirmedHits&&!e.receivedDamage)return null;
 const accuracy=e.confirmedHits/Math.max(1,e.shots);
 return clamp(.55*accuracy+.018*e.confirmedDamage-.030*e.receivedDamage,-1,1);
}
function settle(state,now){
 if(state.windowStart===null||!state.context)return;
 const dt=now-state.windowStart;
 const reward=feedback(state);
 state.windows++;
 if(reward!==null&&dt>=1){
  const item=state.contexts[state.context][state.style];
  item.mean+=(reward-item.mean)/(++item.samples);
  state.updates++;state.totalReward+=reward;state.lastReward=reward;
 }
}
function select(state,context){
 const options=state.contexts[context],count=STYLES.reduce((sum,name)=>sum+options[name].samples,0);
 for(const name of STYLES)if(!options[name].samples)return name;
 // Deterministic UCB: explore first, then favor strategies that actually
 // produced better observed reward. B and R receive identical rules/priors.
 let winner='balanced',best=-Infinity;
 for(const name of STYLES){
  const arm=options[name];
  const ucb=arm.mean+.22*Math.sqrt(Math.log(count+1)/arm.samples);
  if(ucb>best+1e-8){best=ucb;winner=name;}
 }
 return winner;
}
function tick(state,local,now){
 if(!state?.enabled||!Number.isFinite(now)||now<0)
  return {style:'balanced',changed:false,trained:false};
 const next=local?.underFire===true?'under_fire':
  local?.visible===true?'contact':null;
 if(state.windowStart===null){
  if(next){
   state.context=next;state.style=select(state,next);state.windowStart=now;
  }
  return {style:state.style,changed:false,trained:false};
 }
 if(now-state.windowStart<WINDOW_SECONDS)
  return {style:state.style,changed:false,trained:false};
 const prev=state.style,prior=state.updates;
 settle(state,now);
 state.events=events();state.windowStart=next?now:null;state.context=next;
 if(next)state.style=select(state,next);else state.style='balanced';
 if(state.style!==prev)state.switches++;
 return {style:state.style,changed:state.style!==prev,trained:state.updates>prior};
}
function finish(state,now){
 if(!state?.enabled||state.windowStart===null||!Number.isFinite(now))return;
 settle(state,now);
 state.events=events();state.windowStart=null;state.context=null;
}
function summary(state){
 if(!state)return null;
 return {enabled:state.enabled,style:state.style,context:state.context,
  windows:state.windows,updates:state.updates,switches:state.switches,
  shots:state.shots,confirmedHits:state.confirmedHits,
  confirmedDamage:Number(state.confirmedDamage.toFixed(2)),
  receivedDamage:Number(state.receivedDamage.toFixed(2)),
  meanReward:state.updates?Number((state.totalReward/state.updates).toFixed(4)):0,
  lastReward:state.lastReward,
  contexts:Object.fromEntries(CONTEXTS.map(context=>[context,
   Object.fromEntries(STYLES.map(style=>[style,{samples:state.contexts[context][style].samples,
    mean:Number(state.contexts[context][style].mean.toFixed(4))}]))]))};
}
return Object.freeze({STYLES,CONTEXTS,WINDOW_SECONDS,create,recordShot,
 recordConfirmedHit,recordDamage,tick,finish,summary});
});
