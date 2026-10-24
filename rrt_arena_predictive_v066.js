/* RRT Arena V0.6.6 — observation-only predictive swarm defense.
 * An advisory module for the ORIGINAL BLUE currentIntent/chooseGoal/RRT pipeline.
 * Accepts ONLY tracks returned from RRTArenaMulti.observe; no ground-truth targets.
 * Pure/deterministic: it cannot move the player, fire, change HP or query the world.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaPredictive=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const defaults={now:0,scale:400,width:800,height:500,radius:10,enemySpeed:54,blueSpeed:154,memoryTTL:3.5};
 const options=o=>({...defaults,...(o||{})});
 function buildThreatMap(self,tracks,config={}){
  if(!finite(self))return [];
  const o=options(config),scale=Math.max(40,o.scale),speed=Math.max(1,o.enemySpeed);
  const out=[];
  for(const t of Object.values(tracks||{})){
   if(!finite(t)||!(t.status==='visible'||t.status==='memory'))continue;
   const memory=t.status==='memory',age=memory?o.now-t.lastSeen:0;
   if(memory&&(!Number.isFinite(t.lastSeen)||age<0||age>o.memoryTTL||!(t.confidence>0)))continue;
   const conf=memory?clamp(t.confidence,0,1)*Math.max(0,1-age/o.memoryTTL):1;
   if(conf<=.02)continue;
   // Velocities are observations; cap them and cap extrapolation by a fixed
   // proportion of the arena, rather than treating memory as live telemetry.
   const vx=clamp(Number.isFinite(t.vx)?t.vx:0,-speed*1.55,speed*1.55);
   const vy=clamp(Number.isFinite(t.vy)?t.vy:0,-speed*1.55,speed*1.55);
   const shift=(component,dt)=>clamp(component*Math.max(0,dt),-scale*.18,scale*.18);
   const x=clamp(t.x+shift(vx,age),o.radius,o.width-o.radius);
   const y=clamp(t.y+shift(vy,age),o.radius,o.height-o.radius);
   const d=distance(self,{x,y}),ux=(self.x-x)/Math.max(1,d),uy=(self.y-y)/Math.max(1,d);
   const observedClosing=Math.max(0,vx*ux+vy*uy);
   // This is an ETA heuristic, NOT an enemy future-position oracle.
   const closing=Math.max(speed*.65,Math.min(speed*1.15,observedClosing));
   const eta=Math.max(0,(d-o.radius*2.42)/Math.max(1,closing));
   const lead=clamp(eta*.45,.25,1.35);
   const forecast={x:clamp(x+shift(vx,lead),o.radius,o.width-o.radius),
                   y:clamp(y+shift(vy,lead),o.radius,o.height-o.radius)};
   out.push({id:t.id||'',status:t.status,x,y,vx,vy,age,confidence:conf,
    weight:memory?conf*.55:1,uncertainty:memory?Math.min(scale*.3,12+age*speed*.65):0,
    distance:d,eta,forecast});
  }
  out.sort((a,b)=>a.eta-b.eta||String(a.id).localeCompare(String(b.id)));
  return out;
 }
 function assessEncirclement(self,tracks,config={}){
  const o=options(config),threats=buildThreatMap(self,tracks,o);
  const inbound=threats.filter(t=>t.eta<=3.8&&t.distance<o.scale*.57&&t.weight>.14);
  const near=inbound.filter(t=>t.eta<=2.8&&t.distance<o.scale*.39);
  const sectors=new Set(inbound.filter(t=>t.weight>.32).map(t=>Math.floor(
   (Math.atan2(t.y-self.y,t.x-self.x)+Math.PI)/(Math.PI/2))%4));
  const visible=inbound.filter(t=>t.status==='visible').length;
  const surround=inbound.length>=3&&sectors.size>=3;
  const rush=near.length>=3||(inbound.length>=4&&near.length>=2);
  return {alert:visible>0&&(rush||(surround&&near.length>=2)),threatCount:inbound.length,
   imminentCount:near.length,visibleCount:visible,sectors:sectors.size,surround,
   earliestEta:threats.length?threats[0].eta:Infinity,knownThreats:threats.length};
 }
 function choosePredictiveEscape(self,tracks,config={}){
  if(!finite(self))return null;
  const o=options(config),threats=buildThreatMap(self,tracks,o);
  if(!threats.length)return null;
  const free=typeof o.free==='function'?o.free:()=>true;
  const direct=typeof o.direct==='function'?o.direct:()=>true;
  const sweep=typeof o.sweep==='function'?o.sweep:null;
  const history=Array.isArray(o.history)?o.history.slice(-8):[];
  const scale=Math.max(40,o.scale);
  // Use all observed bearings, not just the nearest opponent.
  let ax=0,ay=0;
  for(const t of threats){const d=Math.max(1,t.distance),w=t.weight/(1+t.eta*.26);
   ax+=(self.x-t.x)/d*w;ay+=(self.y-t.y)/d*w;}
  const origin=Math.atan2(ay,ax);
  const countOpen=p=>{
   let n=0;
   for(let j=0;j<12;j++){
    const a=j*2*Math.PI/12,p1={x:p.x+Math.cos(a)*scale*.065,y:p.y+Math.sin(a)*scale*.065},
     p2={x:p.x+Math.cos(a)*scale*.14,y:p.y+Math.sin(a)*scale*.14};
    if(!free(p1)||!free(p2))continue;
    if(sweep&&(!sweep(p,p1)||!sweep(p1,p2)))continue;
    n++;
   }
   return n;
  };
  let best=null,checked=0;
  for(const fraction of [.19,.29,.39,.46])for(let i=0;i<24;i++){
   const angle=origin+i*Math.PI*2/24,travel=scale*fraction;
   const p={x:self.x+Math.cos(angle)*travel,y:self.y+Math.sin(angle)*travel};
   if(p.x<o.radius*2||p.y<o.radius*2||p.x>o.width-o.radius*2||p.y>o.height-o.radius*2||!free(p))continue;
   const open=countOpen(p);if(open<3)continue; // Penalize pockets and dead ends.
   const ds=threats.map(t=>{
    const arrival=travel/Math.max(1,o.blueSpeed);
    const predicted={x:clamp(t.x+t.vx*Math.min(arrival,1.7),o.radius,o.width-o.radius),
      y:clamp(t.y+t.vy*Math.min(arrival,1.7),o.radius,o.height-o.radius)};
    return {d:Math.min(distance(p,t.forecast),distance(p,predicted))-t.uncertainty*.17,weight:t.weight};
   }).sort((a,b)=>a.d-b.d);
   if(ds[0].d<o.radius*2.4)continue;
   const lane=direct(self,p);
   let hazard=0;
   for(const item of ds){const closeness=Math.max(0,(scale*.31-item.d)/(scale*.31));
    hazard+=item.weight*closeness*closeness;}
   // Compare obstacles and reachable openness without using world-truth positions.
   const nearest=clamp(ds[0].d,0,scale*.45),
     second=clamp(ds[1]?.d??scale*.45,0,scale*.45);
   const edge=Math.min(p.x,o.width-p.x,p.y,o.height-p.y);
   const edgePenalty=Math.max(0,scale*.14-edge)*2.3;
   const repeats=history.reduce((sum,h)=>finite(h)?sum+Math.max(0,scale*.19-distance(p,h))*1.65:sum,0);
   const score=nearest*1.45+second*.43+open*scale*.037-hazard*scale*.64-
     travel*.26-edgePenalty-repeats-(lane?0:scale*.13);
   checked++;
   if(!best||score>best.score)best={goal:p,score,openDirections:open,direct:lane,requiresRRT:true,
    nearest:ds[0].d};
  }
  return best?{...best,evaluated:checked,knownThreats:threats.length}:null;
 }
 return Object.freeze({buildThreatMap,assessEncirclement,choosePredictiveEscape});
});
