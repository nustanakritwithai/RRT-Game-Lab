/* RRT Arena V0.6.5 — pure, observation-only melee wave and ranged kiting helpers.
 * No hidden target positions are accepted by threat/escape planners: callers pass tracks.
 * Agent remains the original BLUE; this is a small utility module, not a replacement agent.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaMelee=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const difficulties=Object.freeze({
  training:{speed:.105,damage:2.2,cooldown:1.65},
  balanced:{speed:.135,damage:3.6,cooldown:1.28},
  hard:{speed:.170,damage:5.5,cooldown:.96}
 });
 function statsFor(level){return difficulties[level]||difficulties.balanced;}
 function inReach(attacker,defender,{radius=10,canSee=()=>true}={}){
  return !!attacker&&!!defender&&distance(attacker,defender)<=radius*2.42&&!!canSee(attacker,defender);
 }
 function strike(attacker,defender,now,{radius=10,canSee=()=>true,difficulty='balanced'}={}){
  if(!attacker?.active||!defender||defender.hp<=0||!Number.isFinite(now))return {hit:false};
  if(now<(attacker.nextAttackAt||0)||!inReach(attacker,defender,{radius,canSee}))return {hit:false};
  const config=statsFor(difficulty);
  return {hit:true,damage:config.damage,nextAttackAt:now+config.cooldown,contact:true};
 }
 function visibleThreats(tracks){return Object.values(tracks||{}).filter(t=>t&&t.status==='visible'&&Number.isFinite(t.x)&&Number.isFinite(t.y)).map(t=>({id:t.id,x:t.x,y:t.y}));}
 function assessThreat(self,tracks,{scale=400,ammo=6}={}){
  const threats=visibleThreats(tracks),ds=threats.map(t=>distance(self,t)).sort((a,b)=>a-b);
  const nearest=ds[0]??Infinity,near=ds.filter(d=>d<scale*.31).length;
  const critical=nearest<scale*.095,pressure=nearest<scale*.20||near>=3;
  return {visible:threats.length,nearest,near,critical,pressure,kite:critical||pressure||(ammo<=0&&nearest<scale*.34)};
 }
 function chooseEscape(self,tracks,{width=800,height=500,scale=400,radius=9,free=()=>true,direct=()=>true,history=[]}={}){
  const threats=visibleThreats(tracks);if(!threats.length)return null;
  const candidates=[];const nearest=threats.reduce((p,t)=>distance(self,t)<distance(self,p)?t:p,threats[0]);
  const away=Math.atan2(self.y-nearest.y,self.x-nearest.x);
  for(const frac of [.18,.31,.43])for(let i=0;i<20;i++){
   const angle=away+2*Math.PI*i/20,step=scale*frac;
   const p={x:self.x+Math.cos(angle)*step,y:self.y+Math.sin(angle)*step};
   if(p.x<radius*2||p.x>width-radius*2||p.y<radius*2||p.y>height-radius*2||!free(p))continue;
   const all=threats.map(t=>distance(t,p)).sort((a,b)=>a-b);
   const nearScore=Math.min(all[0],scale*.40)*2.7 + (all[1]===undefined?scale*.34:Math.min(all[1],scale*.46))*.64;
   const lane=direct(self,p)?scale*.12:-scale*.07;
   const edge=Math.min(p.x,width-p.x,p.y,height-p.y);
   const edgePenalty=Math.max(0,scale*.13-edge)*2.6;
   const repeated=history.slice(-5).reduce((v,h)=>v+Math.max(0,scale*.16-distance(p,h))*2,0);
   const travelPenalty=step*.30;
   const score=nearScore+lane-edgePenalty-repeated-travelPenalty;
   candidates.push({point:p,score,nearDist:all[0],direct:direct(self,p)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0];return best?{goal:best.point,score:best.score,evaluated:candidates.length,distance:best.nearDist,direct:best.direct}:null;
 }
 /** Emergency local avoidance during a close-quarters breach, before the slower RRT replan.
   * Only visible threat tracks are used; movement is a swept, collision-tested tiny step.
   * Returns null when there is no urgent threat or no safer move.
   */
 function microStep(self,tracks,dt,{scale=400,speed=.385,radius=10,free=()=>true,blocked=()=>false}={}){
  const threats=visibleThreats(tracks);if(!threats.length||dt<=0)return null;
  const ds=threats.map(t=>distance(self,t)).sort((a,b)=>a-b);
  const nearest=ds[0],close=ds.filter(d=>d<scale*.22).length;
  if(nearest>scale*.145&&(nearest>scale*.20||close<3))return null;
  const step=Math.min(scale*.035,Math.max(0,dt)*speed*scale);
  if(step<.001)return null;
  const score=p=>{
   const sorted=threats.map(t=>distance(p,t)).sort((a,b)=>a-b);
   const d0=Math.min(sorted[0],scale*.23);
   const d1=Math.min(sorted[1]??scale*.23,scale*.23);
   return 2.3*d0+.42*d1;
  };
  const current=score(self);let best=null,bestScore=current+.06;
  for(let j=0;j<16;j++){
   const a=2*Math.PI*j/16;
   const p={x:self.x+Math.cos(a)*step,y:self.y+Math.sin(a)*step};
   if(!free(p)||blocked(self,p)||threats.some(t=>distance(p,t)<radius*1.85))continue;
   const s=score(p);
   if(s>bestScore){best=p;bestScore=s;}
  }
  return best;
 }
 function waveOutcome({blueHp,alive,total,seconds,limit=150}={}){
  if(!(total>0))return null;
  if(blueHp<=0)return {winner:'red',reason:'BLUE ถูกโจมตีจน HP หมด'};
  if(alive<=0)return {winner:'blue',reason:'BLUE กำจัดบอตประชิดได้ครบทั้งหมด'};
  if(seconds>=limit)return {winner:'red',reason:'หมดเวลาทดลอง ยังเหลือบอตประชิด'};
  return null;
 }
 return Object.freeze({statsFor,inReach,strike,visibleThreats,assessThreat,chooseEscape,microStep,waveOutcome});
});
