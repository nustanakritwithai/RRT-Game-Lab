/* RRT Arena V0.6.11 — cooperative team tactical advisor (no replacement BLUE).
 * Targets are bounded observation tracks, never hidden enemy world positions.
 * Known teammate locations are only used for friendly-fire geometry.
 * All output positions must be passed through original BLUE RRT/collision logic.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaCoop=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function knownTrack(t,now,{ttl=3.5}={}){
  if(!finite(t))return false;
  if(t.status==='visible')return true;
  return t.status==='memory'&&t.confidence>.20&&Number.isFinite(t.lastSeen)&&now>=t.lastSeen&&now-t.lastSeen<=ttl;
 }
 function deconflictFocus(self,tracks,chosenId,peerFocus,{now=0,scale=400,maxExtraDistance=.25,criticalDistance=null,ttl=3.5}={}){
  const base=tracks?.[chosenId];
  const initial={targetId:chosenId||null,changed:false,reason:'hold',evaluated:0};
  if(!finite(self)||!chosenId||!peerFocus||chosenId!==peerFocus||!knownTrack(base,now,{ttl}))return initial;
  const d0=distance(self,base);
  if(d0<=(criticalDistance===null?scale*.10:criticalDistance))return {...initial,reason:'immediate_threat'};
  const candidates=Object.values(tracks||[]).filter(t=>knownTrack(t,now,{ttl})&&t.id&&t.id!==chosenId)
   .filter(t=>base.status!=='visible'||t.status==='visible')
   .filter(t=>distance(self,t)<=d0+scale*maxExtraDistance);
  if(!candidates.length)return {...initial,reason:'no_safe_alternative'};
  candidates.sort((a,b)=>{
   const byStatus=(b.status==='visible'?1:0)-(a.status==='visible'?1:0);
   return byStatus||distance(self,a)-distance(self,b)||String(a.id).localeCompare(String(b.id));
  });
  return {targetId:candidates[0].id,changed:true,reason:'split_focus',evaluated:candidates.length};
 }
 function segmentCircleTime(a,b,c,r){
  if(!finite(a)||!finite(b)||!finite(c))return Infinity;
  const dx=b.x-a.x,dy=b.y-a.y,fx=a.x-c.x,fy=a.y-c.y,A=dx*dx+dy*dy,C=fx*fx+fy*fy-r*r;
  if(C<=0)return 0;if(A<1e-12)return Infinity;
  const B=2*(fx*dx+fy*dy),disc=B*B-4*A*C;if(disc<0)return Infinity;
  const t=(-B-Math.sqrt(disc))/(2*A);
  return t>=0&&t<=1?t:Infinity;
 }
 function safeFireLine(self,aim,teammates,{radius=12,aim:accuracy=.96}={}){
  if(!finite(self)||!finite(aim)||distance(self,aim)<1e-8)
   return {clear:false,blockerId:null,hitFraction:null,reason:'no_visible_aim'};
  let nearest=Infinity,blocker=null;
  for(const mate of teammates||[]){
   if(!finite(mate)||mate.hp<=0||mate.active===false||mate.id===self.id)continue;
   const error=clamp((1-clamp(accuracy,0,1))*.35,0,.30),cone=Math.tan(error)*distance(self,mate);
   const t=segmentCircleTime(self,aim,mate,Math.max(0,radius)+cone);
   if(t<nearest){nearest=t;blocker=mate.id||'ally';}
  }
  return {clear:nearest===Infinity,blockerId:blocker,hitFraction:nearest===Infinity?null:nearest,reason:nearest===Infinity?'clear':'ally_in_line'};
 }
 function findClearLane(self,aim,teammates,{
  width=800,height=550,scale=400,radius=10,ownRange=220,
  free=null,direct=null,canSee=null,dangerAt=null
 }={}){
  if(!finite(self)||!finite(aim)||typeof free!=='function'||typeof direct!=='function'||typeof canSee!=='function')return null;
  if(safeFireLine(self,aim,teammates,{radius:radius*.95,aim:self.aim}).clear)return null;
  const bearing=Math.atan2(aim.y-self.y,aim.x-self.x);
  let best=null,evaluated=0,bestCost=Infinity;
  for(const f of [.12,.19,.28])for(const offset of [.55,-.55,.95,-.95,1.40,-1.40,1.9,-1.9,2.4,-2.4]){
   const a=bearing+offset,step=scale*f;
   const q={x:self.x+Math.cos(a)*step,y:self.y+Math.sin(a)*step};
   if(q.x<radius+2||q.y<radius+2||q.x>width-radius-2||q.y>height-radius-2)continue;
   if(distance(self,q)<radius*1.4||!free(q)||!direct(self,q)||!canSee(q,aim))continue;
   if(distance(q,aim)>ownRange|| (teammates||[]).some(t=>t.hp>0&&t.id!==self.id&&finite(t)&&distance(t,q)<radius*2.25))continue;
   if(!safeFireLine(q,aim,teammates,{radius:radius*.95,aim:self.aim}).clear)continue;
   evaluated++;
   const cost=distance(self,q)+Math.abs(distance(q,aim)-ownRange*.80)*.16+
    (typeof dangerAt==='function'?Math.max(0,dangerAt(q))*scale*.38:0);
   if(cost<bestCost){bestCost=cost;best=q;}
  }
  return best?{goal:best,cost:bestCost,evaluated,reason:'clear_team_fire_lane'}:null;
 }
 return Object.freeze({distance,knownTrack,deconflictFocus,safeFireLine,findClearLane,segmentCircleTime});
});
