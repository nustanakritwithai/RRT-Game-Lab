/* RRT Arena v0.6.1: memory-guided sampler.
 * Sampling is informed by observations, historical observations and the current goal.
 * A nonzero global sample share is deliberately preserved to explore detours.
 * Does not read actual enemy state, collisions, DOM, timers, or network.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaGuided=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const coin=rng=>clamp(rng(),0,0.999999999999);
 const project=(p,w,h,pad)=>({x:clamp(p.x,pad,w-pad),y:clamp(p.y,pad,h-pad)});
 function sample(options,rng=Math.random){
  const {start,goal,lastSeen,lastSeenAge=0,confidence=0,previousEncounters=[],width,height,step=30,pad=15,focus=75,goalBias=15,failures=0}=options;
  if(!finite(start)||!finite(goal)||!(width>2*pad&&height>2*pad))throw new Error('sample: invalid bounds or endpoints');
  const boundary=p=>project(p,width,height,pad);
  // Goal bias remains independently adjustable, even with focused sampling off.
  if(coin(rng)<clamp(goalBias,0,100)/100)return {point:boundary(goal),mode:'goal'};
  const guiding=clamp(focus,0,100)/100*.88*(1-.12*clamp(failures,0,4));
  const global=()=>({point:{x:pad+coin(rng)*(width-2*pad),y:pad+coin(rng)*(height-2*pad)},mode:'global'});
  if(coin(rng)>=guiding)return global();
  const memories=(Array.isArray(previousEncounters)?previousEncounters:[]).filter(e=>finite(e)&&e.x>=0&&e.x<=1&&e.y>=0&&e.y<=1&&e.strength>0);
  const haveObservation=finite(lastSeen);
  const observedProbability=haveObservation?(.36+.18*clamp(confidence,0,1)):0;
  const historyProbability=memories.length?(haveObservation?.15:.37):0;
  let branch=coin(rng);
  if(branch<observedProbability){
   // One probable region, widening as the *known* observation becomes stale.
   // This is an uncertainty heuristic, not an oracle or a reachable-set proof.
   const age=clamp(lastSeenAge,0,9), radius=Math.min(Math.min(width,height)*.38,Math.max(step*1.7,step*1.7+age*Math.min(width,height)*.033));
   const angle=coin(rng)*Math.PI*2,length=Math.sqrt(coin(rng))*radius;
   return {point:boundary({x:lastSeen.x+Math.cos(angle)*length,y:lastSeen.y+Math.sin(angle)*length}),mode:'memory'};
  }
  branch-=observedProbability;
  if(branch<historyProbability){
    // Known encounter sites from prior observations; they are hypotheses, not live target coordinates.
    const total=memories.reduce((n,e)=>n+e.strength,0);
    let r=coin(rng)*total,e=memories[memories.length-1];
    for(const cand of memories){r-=cand.strength;if(r<=0){e=cand;break;}}
    const radius=step*1.6+Math.min(width,height)*(.10+(1-e.strength)*.13);
    const angle=coin(rng)*2*Math.PI,length=Math.sqrt(coin(rng))*radius;
    return {point:boundary({x:e.x*width+Math.cos(angle)*length,y:e.y*height+Math.sin(angle)*length}),mode:'history'};
  }
  // Goal corridor: mostly forward along the selected target, but with sideways
  // variance. This biases the tree without forbidding important backtracking.
  const t=.045+.955*coin(rng),dx=goal.x-start.x,dy=goal.y-start.y,L=Math.hypot(dx,dy);
  const spread=step*1.35+Math.min(Math.min(width,height)*.22,L*.12);
  const transverse=(coin(rng)*2-1)*spread;
  const perpX=L>1?-dy/L:0,perpY=L>1?dx/L:1;
  return {point:boundary({x:start.x+dx*t+perpX*transverse,y:start.y+dy*t+perpY*transverse}),mode:'corridor'};
 }
 return Object.freeze({sample});
});
