/* RRT Arena V0.6.6 — Predictive Anti-Encirclement for the ORIGINAL BLUE agent.
 * Pure functions: no DOM, no timers, no randomness, no access to world truth.
 * Callers pass BLUE's own observation tracks (visible + bounded last-seen memory)
 * from RRTArenaMulti.observe, plus collision/line queries; the goal chosen here is
 * still routed by Memory-Guided RRT and every movement stays collision-checked.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaSwarm=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TAU=Math.PI*2;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const wrap=a=>((a%TAU)+TAU)%TAU;
 const LEVELS=Object.freeze({watch:.22,danger:.42,critical:.72});

 /** Threat estimates from tracks only. Visible tracks are exact observations; memory tracks
   * are used only while younger than memoryHorizon, dead-reckoned from the last sighting. */
 function perceive(tracks,now,{memoryHorizon=2.4,maxLead=.9,maxShift=65,width=Infinity,height=Infinity}={}){
  const out=[];
  for(const t of Object.values(tracks||{})){
   if(!finite(t)||(t.status!=='visible'&&t.status!=='memory'))continue;
   const base={id:t.id,vx:Number.isFinite(t.vx)?t.vx:0,vy:Number.isFinite(t.vy)?t.vy:0,status:t.status,uncertainty:Math.max(0,t.uncertainty||0)};
   if(t.status==='visible'){out.push({...base,x:t.x,y:t.y,age:0,confidence:1});continue;}
   const age=Math.max(0,now-(Number.isFinite(t.lastSeen)?t.lastSeen:-Infinity));
   if(!(age<=memoryHorizon))continue;
   const lead=Math.min(age,maxLead);
   const x=clamp(t.x+clamp(base.vx*lead,-maxShift,maxShift),0,width),y=clamp(t.y+clamp(base.vy*lead,-maxShift,maxShift),0,height);
   out.push({...base,x,y,age,confidence:clamp((Number.isFinite(t.confidence)?t.confidence:1)*(1-age/memoryHorizon),0,1)});
  }
  return out;
 }
 /** Approximate seconds until a melee bot can strike. Uses the larger of the nominal speed
   * and the observed closing speed; remembered bots are treated pessimistically. */
 function timeToContact(self,threat,{speed=0,reach=24}={}){
  const d=dist(self,threat),memory=threat.status==='memory';
  const gap=Math.max(0,d-reach-(memory?(threat.uncertainty||0)*.5:0));
  const confidence=clamp(Number.isFinite(threat.confidence)?threat.confidence:1,0,1)*(memory?.85:1);
  if(gap<=0)return {seconds:0,closing:speed,confidence};
  const ux=d>1e-9?(self.x-threat.x)/d:0,uy=d>1e-9?(self.y-threat.y)/d:0;
  const observed=(threat.vx||0)*ux+(threat.vy||0)*uy;
  const closing=Math.max(speed||0,observed);
  return {seconds:closing>1e-9?gap/closing:Infinity,closing,confidence};
 }
 /** Polar threat map: which escape directions are closing within the forecast horizon. */
 function threatMap(self,threats,{speed=0,reach=24,horizon=2.6,sectors=32,open=null}={}){
  const n=Math.max(8,sectors|0),closed=new Array(n).fill(false),pressureBy=new Array(n).fill(0);
  const contacts=[];let soonest=Infinity,pressure=0;
  for(const t of threats||[]){
   if(!finite(t))continue;
   const c=timeToContact(self,t,{speed,reach});
   soonest=Math.min(soonest,c.seconds);
   if(!(c.seconds<horizon))continue;
   const d=Math.max(1,dist(self,t)),angle=Math.atan2(t.y-self.y,t.x-self.x);
   const weight=c.confidence*clamp(1-c.seconds/horizon,.05,1);
   pressure+=weight;
   // Directions BLUE cannot run through without passing within this bot's reach.
   const half=clamp(Math.atan((reach*1.5+(t.uncertainty||0)*.5)/d)+.30,.30,1.30)*(.6+.4*c.confidence);
   contacts.push({id:t.id,angle,seconds:c.seconds,weight});
   for(let i=0;i<n;i++){
    const a=i*TAU/n,diff=Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)));
    if(diff<=half){closed[i]=true;pressureBy[i]+=weight;}
    else pressureBy[i]+=weight*Math.max(0,Math.cos(diff))*.35;
   }
  }
  // Walls/arena edges can close a direction too (caller supplies a collision ray test).
  if(typeof open==='function')for(let i=0;i<n;i++)if(!open(i*TAU/n))closed[i]=true;
  // Largest run of open sectors on the circular ring = best escape gap.
  let bestStart=-1,bestLen=0;
  if(closed.every(v=>!v)){bestStart=0;bestLen=n;}
  else for(let i=0;i<n;i++){
   if(closed[i]||!closed[(i-1+n)%n])continue;
   let len=0;while(len<n&&!closed[(i+len)%n])len++;
   if(len>bestLen){bestLen=len;bestStart=i;}
  }
  let gap;
  if(bestLen>0)gap={angle:wrap((bestStart+(bestLen-1)/2)*TAU/n),width:bestLen*TAU/n};
  else{let k=0;for(let i=1;i<n;i++)if(pressureBy[i]<pressureBy[k])k=i;gap={angle:k*TAU/n,width:0};}
  const inbound=contacts.length;
  let risk=0;
  if(inbound){
   const closedShare=1-gap.width/TAU;
   const urgency=clamp(1-soonest/horizon,0,1);
   const crowd=clamp(inbound/3,0,1);
   risk=clamp(closedShare*(.55+.45*urgency)*(.45+.55*crowd),0,1);
  }
  const level=!inbound?'clear':risk>=LEVELS.critical?'critical':risk>=LEVELS.danger?'danger':risk>=LEVELS.watch?'watch':'clear';
  return {level,risk,inbound,soonest,pressure,gap,contacts,sectors:pressureBy};
 }
 /** Minimum time advantage (seconds) BLUE keeps over every threat along a route.
   * Negative => some bot can reach a point of the route before BLUE passes it. */
 function routeMargin(self,path,threats,{selfSpeed=150,enemySpeed=50,reach=24,scale=400}={}){
  if(!Array.isArray(path)||!path.length||!threats?.length||!(selfSpeed>0))return Infinity;
  let margin=Infinity,from=self,travelled=0;
  const step=Math.max(4,scale*.04);
  for(const to of path){
   if(!finite(to))continue;
   const len=dist(from,to),k=Math.max(1,Math.ceil(len/step));
   for(let j=1;j<=k;j++){
    const q={x:from.x+(to.x-from.x)*j/k,y:from.y+(to.y-from.y)*j/k},tBlue=(travelled+len*j/k)/selfSpeed;
    for(const t of threats){
     const gap=Math.max(0,dist(t,q)-reach-(t.status==='memory'?(t.uncertainty||0)*.5:0));
     const tEnemy=enemySpeed>0?gap/enemySpeed:Infinity;
     margin=Math.min(margin,tEnemy-tBlue);
    }
   }
   travelled+=len;from=to;
  }
  return margin;
 }
 /** Score escape destinations by race margin along the corridor, openness at arrival
   * (dead-end avoidance), arena edges and alignment with the open gap of the threat map. */
 function chooseCorridor(self,threats,{width=800,height=500,scale=400,radius=9,selfSpeed=150,enemySpeed=50,reach=24,horizon=2.6,
  free=()=>true,direct=()=>true,history=[],dangerAt=null,map=null}={}){
  if(!finite(self)||!threats?.length)return null;
  const m=map||threatMap(self,threats,{speed:enemySpeed,reach,horizon});
  const angles=[];for(let i=0;i<24;i++)angles.push(i*TAU/24);angles.push(m.gap.angle);
  const ray=scale*.16,probe=[];for(let i=0;i<8;i++)probe.push(i*TAU/8);
  const recent=Array.isArray(history)?history.slice(-6):[];
  const cfg={selfSpeed,enemySpeed,reach,scale};
  let best=null,evaluated=0;
  for(const angle of angles)for(const frac of [.14,.24,.36]){
   const p={x:self.x+Math.cos(angle)*scale*frac,y:self.y+Math.sin(angle)*scale*frac};
   if(p.x<radius*2||p.y<radius*2||p.x>width-radius*2||p.y>height-radius*2||!free(p))continue;
   evaluated++;
   const straight=!!direct(self,p);
   const margin=routeMargin(self,[p],threats,cfg);
   const travel=dist(self,p)/selfSpeed;
   let endMargin=Infinity;
   for(const t of threats)endMargin=Math.min(endMargin,Math.max(0,dist(t,p)-reach)/enemySpeed-travel);
   let exits=0;
   for(const a of probe){const q={x:p.x+Math.cos(a)*ray,y:p.y+Math.sin(a)*ray};if(q.x>radius&&q.y>radius&&q.x<width-radius&&q.y<height-radius&&free(q)&&direct(p,q))exits++;}
   const openness=exits/probe.length;
   const edge=Math.min(p.x,width-p.x,p.y,height-p.y);
   const edgePenalty=Math.max(0,scale*.12-edge)/(scale*.12);
   const repeat=recent.reduce((v,h)=>v+(finite(h)?Math.max(0,1-dist(p,h)/(scale*.14)):0),0)*.45;
   const heat=typeof dangerAt==='function'?clamp(dangerAt(p)||0,0,1):0;
   const align=m.gap.width>0?Math.cos(angle-m.gap.angle)*.35:0;
   const score=2.2*clamp(margin,-2,2)+1.0*clamp(endMargin,-2,3)+2.5*openness-(openness<.5?1:0)
    -1.2*edgePenalty-(straight?0:2)-repeat-heat*.8+align-.15*frac;
   if(!best||score>best.score)best={goal:p,score,margin,endMargin,openness,direct:straight,angle:wrap(angle)};
  }
  return best?{...best,evaluated,gap:m.gap,level:m.level}:null;
 }
 /** Hysteresis policy: act on predicted encirclement before contact, keep a safe evasive
   * route instead of replanning every frame, and re-route when the corridor is being cut. */
 function decide({enabled=true,map=null,now=0,lastAt=-Infinity,evading=false,routeMargin:margin=Infinity,cooldown=.6}={}){
  if(!enabled)return {act:false,reason:'disabled',label:''};
  if(!map||map.level==='clear'||map.level==='watch'){
   if(evading&&margin<0&&now-lastAt>=.25&&map&&map.inbound)return {act:true,reason:'route_cut',label:'ทางหนีไม่ปลอดภัย → เปลี่ยนมุมหลบ'};
   return {act:false,reason:'clear',label:''};
  }
  if(evading){
   if(margin<.1&&now-lastAt>=.25)return {act:true,reason:'route_cut',label:'ทางหนีไม่ปลอดภัย → เปลี่ยนมุมหลบ'};
   return {act:false,reason:'hold_route',label:'เสี่ยงถูกล้อม · ทางหนียังปลอดภัย'};
  }
  if(now-lastAt<cooldown&&map.level!=='critical')return {act:false,reason:'cooldown',label:'เสี่ยงถูกล้อม'};
  return {act:true,reason:'encircle_risk',label:map.level==='critical'?'เสี่ยงถูกล้อมสูง → เปลี่ยนมุมหลบ':'เสี่ยงถูกล้อม → หลบล่วงหน้า'};
 }
 return Object.freeze({LEVELS,perceive,timeToContact,threatMap,routeMargin,chooseCorridor,decide});
});
