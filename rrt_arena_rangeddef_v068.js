/* RRT Arena V0.6.8 — Ranged Threat Defense for the ORIGINAL BLUE agent.
 * Pure functions: no DOM, no timers, no randomness, no world truth.
 * Inputs are BLUE's own tracks (visible + remembered shooters), the public weapon range of
 * the selected difficulty and map geometry queries supplied by the caller. The chosen goal
 * is still routed by Memory-Guided RRT; all movement stays collision-checked in the game.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaRangedDefense=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TAU=Math.PI*2;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const SHOOTER_KINDS=Object.freeze(['sentry','patrol','hunter']);

 /** Known shooters from tracks only. A remembered shooter stays at its last seen position
   * (no hidden extrapolation) and fades out after memoryHorizon seconds. */
 function perceiveShooters(tracks,now,{memoryHorizon=6,kinds=SHOOTER_KINDS}={}){
  const out=[];
  for(const t of Object.values(tracks||{})){
   if(!finite(t)||!kinds.includes(t.kind))continue;
   if(t.status==='visible'){out.push({id:t.id,x:t.x,y:t.y,kind:t.kind,status:'visible',confidence:1});continue;}
   if(t.status!=='memory')continue;
   const age=Math.max(0,now-(Number.isFinite(t.lastSeen)?t.lastSeen:-Infinity));
   if(!(age<=memoryHorizon))continue;
   out.push({id:t.id,x:t.x,y:t.y,kind:t.kind,status:'memory',confidence:clamp((Number.isFinite(t.confidence)?t.confidence:1)*(1-age/(memoryHorizon*1.25)),0,1)});
  }
  return out;
 }
 /** Which known shooters could hit a point: within their weapon range and with line of sight. */
 function exposure(point,shooters,{range=200,canSee=()=>true}={}){
  let count=0,weight=0;const ids=[];
  for(const s of shooters||[]){
   if(!finite(s)||dist(s,point)>range||!canSee(s,point))continue;
   count++;ids.push(s.id);weight+=(s.status==='memory'?.7:1)*clamp(Number.isFinite(s.confidence)?s.confidence:1,0,1);
  }
  return {count,weight,ids};
 }
 /** Seconds-weighted exposure while travelling a straight leg (sampled). */
 function routeExposure(from,to,shooters,{range=200,canSee=()=>true,speed=150,samples=6}={}){
  if(!finite(from)||!finite(to)||!shooters?.length||!(speed>0))return 0;
  const len=dist(from,to),k=Math.max(1,samples|0);let total=0;
  for(let i=1;i<=k;i++){const q={x:from.x+(to.x-from.x)*i/k,y:from.y+(to.y-from.y)*i/k};total+=exposure(q,shooters,{range,canSee}).weight*(len/k)/speed;}
  return total;
 }
 /** Pick where to stand: hidden from every shooter except (optionally) the focus target,
   * ideally in the standoff band (inside BLUE's range, outside the enemy's), reached by a
   * route that spends little time in sight. */
 function chooseFirePosition(self,shooters,{focus=null,width=800,height=500,scale=400,radius=9,range=200,ownRange=216,speed=150,
  canSee=()=>true,free=()=>true,direct=()=>true,history=[]}={}){
  if(!finite(self)||!shooters?.length)return null;
  const cands=[];
  for(const f of [.08,.15,.24,.34])for(let i=0;i<16;i++){const a=i*TAU/16;cands.push({x:self.x+Math.cos(a)*scale*f,y:self.y+Math.sin(a)*scale*f});}
  if(finite(focus)){
   const band=[Math.min(ownRange*.95,Math.max(range*1.06,ownRange*.85)),ownRange*.78,ownRange*.62];
   for(const r of band)for(let i=0;i<16;i++){const a=i*TAU/16;cands.push({x:focus.x+Math.cos(a)*r,y:focus.y+Math.sin(a)*r});}
  }
  const recent=Array.isArray(history)?history.slice(-6):[];
  let best=null,evaluated=0;
  for(const p of cands){
   if(p.x<radius*2||p.y<radius*2||p.x>width-radius*2||p.y>height-radius*2||!free(p))continue;
   evaluated++;
   const ex=exposure(p,shooters,{range,canSee});
   const focusExposed=!!focus&&ex.ids.includes(focus.id);
   const others=ex.ids.filter(id=>!focus||id!==focus.id).length;
   const otherWeight=ex.weight-(focusExposed?(focus.status==='memory'?.7:1)*clamp(focus.confidence??1,0,1):0);
   const canHit=finite(focus)&&dist(p,focus)<=ownRange&&canSee(p,focus);
   const standoff=canHit&&!focusExposed;
   const path=routeExposure(self,p,shooters,{range,canSee,speed});
   const straight=!!direct(self,p);
   const edge=Math.min(p.x,width-p.x,p.y,height-p.y);
   const edgePenalty=Math.max(0,scale*.08-edge)/(scale*.08);
   const repeat=recent.reduce((v,h)=>v+(finite(h)?Math.max(0,1-dist(p,h)/(scale*.1)):0),0)*.4;
   const score=-4*otherWeight-2*path-(straight?0:1.5)+(canHit?1.5:0)+(standoff?1.5:0)-.5*dist(self,p)/scale-.6*edgePenalty-repeat;
   if(!best||score>best.score)best={goal:p,score,others,exposure:ex.count,pathExposure:path,canHit,standoff,direct:straight};
  }
  return best?{...best,evaluated}:null;
 }
 /** Is BLUE's current spot untenable? Shooters other than the engaged target always count;
   * the engaged one counts while reloading or badly hurt. */
 function assess(self,shooters,{range=200,canSee=()=>true,focusId=null,reloading=false,hpFraction=1}={}){
  const ex=exposure(self,shooters,{range,canSee});
  const others=ex.ids.filter(id=>id!==focusId).length;
  const act=others>=1||(ex.count>=1&&(reloading||hpFraction<.35));
  return {count:ex.count,others,weight:ex.weight,ids:ex.ids,act};
 }
 /** Hysteresis: act on a fresh threat, keep a cover route whose remaining leg stays hidden,
   * re-route when that leg becomes exposed. */
 function decide({enabled=true,assessment=null,now=0,lastAt=-Infinity,moving=false,routeExposure:routeEx=0,cooldown=.8}={}){
  if(!enabled)return {act:false,reason:'disabled',label:''};
  if(!assessment?.act)return {act:false,reason:'safe',label:''};
  if(moving){
   if(routeEx>.5&&now-lastAt>=.6)return {act:true,reason:'route_exposed',label:'เส้นทางถูกเล็ง → เปลี่ยนจุดกำบัง'};
   return {act:false,reason:'hold_route',label:'กำลังไปจุดกำบัง'};
  }
  if(now-lastAt<cooldown)return {act:false,reason:'cooldown',label:'ถูกเล็ง'};
  return {act:true,reason:'exposed',label:'ถูกเล็งจาก '+(assessment.count||1)+' ตัว → หาที่กำบัง'};
 }
 return Object.freeze({SHOOTER_KINDS,perceiveShooters,exposure,routeExposure,chooseFirePosition,assess,decide});
});
