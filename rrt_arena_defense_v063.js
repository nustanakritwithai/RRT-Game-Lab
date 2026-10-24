/* RRT Arena v0.6.3: defensive relocation after suspected position exposure.
 * This pure module receives ONLY an agent's observations, self state and
 * caller-provided collision/sight/heat queries. It never reads opponent state.
 */
(function(root,factory){
 'use strict';const api=factory();root.RRTArenaDefense=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const valid=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const EXPOSURE_TTL=7.2;
 function assess(input={}){
  const {enabled=true,hasEvidence=false,exposureAge=Infinity,stationaryFor=0,moving=false,
   underFire=false,reloading=false,hpFraction=1,ammo=6,opponentHpFraction=null,
   visible=false,hasKnownPosition=false}=input;
  if(!enabled||!hasEvidence||!hasKnownPosition||!Number.isFinite(exposureAge)||exposureAge>EXPOSURE_TTL)
   return {relocate:false,reason:'no_recent_evidence',urgency:0};
  const urgent=underFire||reloading||hpFraction<.32||ammo===0;
  // An in-flight escape route should be completed, except if it has stalled under fire.
  if(moving&&!(underFire&&stationaryFor>2.0))return {relocate:false,reason:'already_moving',urgency:0};
  // Brief finishing window for a very weak opponent. Never indefinitely camp here.
  const finish=visible&&Number.isFinite(opponentHpFraction)&&opponentHpFraction<.17&&hpFraction>.56&&ammo>=2&&!underFire&&!reloading;
  if(finish&&stationaryFor<1.5)return {relocate:false,reason:'brief_finish_window',urgency:0};
  if(!urgent&&stationaryFor<.68)return {relocate:false,reason:'reposition_cooldown',urgency:0};
  return {relocate:true,reason:underFire?'under_fire':reloading?'reload_exposed':visible?'visible_to_opponent':'last_known_position',urgency:urgent?2:1};
 }
 function plan(input={}){
  const {self,enemy,bounds,free,canSee,canTravel,dangerAt,history=[],style='balanced',scale=320,
   now=0,side=1,lastDamageAge=Infinity,visible=true}=input;
  if(!valid(self)||!valid(enemy)||!bounds||!(bounds.w>0&&bounds.h>0)||
   typeof free!=='function'||typeof canSee!=='function'||typeof canTravel!=='function')return null;
  const d=dist(self,enemy);if(d<1)return null;
  const desired=clamp(self.preferred||scale*.3,scale*.14,scale*.48);
  const ux=(self.x-enemy.x)/d,uy=(self.y-enemy.y)/d;
  const sideDirection=side<0?-1:1;
  const angles=[];
  // Lateral-first, followed by corner escape, then global fallback directions.
  for(const v of [Math.PI/2,-Math.PI/2,Math.PI*.72,-Math.PI*.72,Math.PI*.30,-Math.PI*.30,Math.PI,0])angles.push(v*sideDirection);
  const base=Math.atan2(uy,ux);let candidates=[];
  for(const a of angles)for(const factor of [.15,.235,.33]){
   const r=scale*factor,ang=base+a;
   candidates.push({x:self.x+r*Math.cos(ang),y:self.y+r*Math.sin(ang)});
  }
  // Opponent-relative cover and lateral destinations, not a direct rush at the threat.
  for(const delta of [.60,1.05,1.48,-.60,-1.05,-1.48]){
   const a=base+delta*sideDirection;
   candidates.push({x:enemy.x+Math.cos(a)*desired*1.1,y:enemy.y+Math.sin(a)*desired*1.1});
  }
  const seenHistory=Array.isArray(history)?history.slice(-10):[];
  let best=null,alternative=null,checked=0;
  for(const point of candidates){
   if(point.x<0||point.x>bounds.w||point.y<0||point.y>bounds.h||!free(point))continue;
   const move=dist(self,point),separation=dist(point,enemy);
   if(move<scale*.085||separation<scale*.14)continue;
   const sight=canSee(enemy,point),direct=canTravel(self,point);
   const heat=typeof dangerAt==='function'?clamp(dangerAt(point),0,1):0;
   const rangeError=Math.abs(separation-desired);
   const closePenalty=Math.max(0,scale*.20-separation)*1.6;
   let score=move*.30+rangeError*.18+closePenalty+
     (sight?scale*(visible?.99:.58):0)+heat*scale*(style==='cautious'?.96:.73)+
     (direct?0:scale*.19);
   // A lateral movement frustrates a known firing angle without claiming to know enemy intent.
   const tangent=Math.abs((point.x-self.x)*uy+(point.y-self.y)*ux)/Math.max(1,move);
   score+=scale*.13*tangent;
   for(const h of seenHistory){
    if(!valid(h))continue;const age=Math.max(0,now-(Number.isFinite(h.time)?h.time:0));if(age>23)continue;
    score+=scale*1.25*Math.max(0,1-dist(point,h)/(scale*.26))*(1-age/23);
   }
   if(lastDamageAge<3&&sight)score+=scale*.35;
   checked++;
   const option={goal:point,score,covered:!sight,directPath:direct,danger:Math.round(heat*100),move:Math.round(move),evaluated:0};
   if(!best||score<best.score){alternative=best;best=option;}
   else if(!alternative||score<alternative.score)alternative=option;
  }
  if(!best)return null;
  return {goal:{...best.goal},kind:best.covered?'break-sight':'rotate',
   covered:best.covered,directPath:best.directPath,danger:best.danger,move:best.move,evaluated:checked,
   reason:best.covered?'ย้ายเพื่อหลุดแนวยิงและตัดตำแหน่งที่ถูกเปิดเผย':'หามุมใหม่เมื่อศัตรูรู้ตำแหน่ง · หาจุดหลบเต็มรูปแบบไม่ได้'};
 }
 return Object.freeze({assess,plan,EXPOSURE_TTL});
});
