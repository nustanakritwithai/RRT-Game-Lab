/* RRT Arena v0.6.2 — deterministic tactical positioning.
 * Input consists ONLY of this bot's own state and a currently VISIBLE observation.
 * Collision/line of sight/danger are injected query functions, never hidden world state.
 * Returns a target for RRT, not an instantaneous teleport or AI-model decision.
 */
(function(root,factory){
 'use strict'; const api=factory(); root.RRTArenaTactics=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PI=Math.PI, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const valid=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const STRATEGIES=['aggressive','balanced','cautious'];
 function preferredRange(style,preferred,range){
   const f=style==='aggressive'?.83:style==='cautious'?1.14:1;
   return clamp(preferred*f,Math.min(30,range*.5),range*.83);
 }
 function plan(input){
   const {self,enemy,bounds,free,canSee,canTravel,dangerAt,history=[],strategy='balanced',side=1,now=0,scale=320}=input||{};
   if(!valid(self)||!valid(enemy)||!bounds||!(bounds.w>0&&bounds.h>0)||
      !(self.range>0&&self.preferred>0)||typeof free!=='function'||typeof canSee!=='function'||typeof canTravel!=='function')return null;
   const style=STRATEGIES.includes(strategy)?strategy:'balanced';
   const d=distance(self,enemy),desired=preferredRange(style,self.preferred,self.range),
     danger=(p)=>typeof dangerAt==='function'?clamp(dangerAt(p),0,1):0;
   if(d<1)return null;
   const ux=(self.x-enemy.x)/d,uy=(self.y-enemy.y)/d;
   const a0=Math.atan2(uy,ux),dir=side>=0?1:-1;
   let mode=d<desired*.68?'kite':d>desired*1.30?'pressure':'orbit';
   if(style==='cautious'&&d<desired*.95)mode='kite';
   const minTravel=Math.max(scale*.075,17),radius=Math.max(minTravel*.9,desired);
   const targets=[];
   // Tangent moves produce actual lateral displacement even when already in firing range.
   const tang={x:-uy,y:ux};
   for(const sideSign of [dir,-dir])for(const n of [1,1.6,2.25]){
     const stride=Math.max(minTravel*1.65,scale*.17)*n;
     const push=mode==='pressure'?-Math.min(stride*.38,Math.max(0,d-desired)):mode==='kite'?Math.min(stride*.38,Math.max(0,desired-d)):0;
     targets.push({x:self.x+sideSign*tang.x*stride+ux*push,y:self.y+sideSign*tang.y*stride+uy*push,turn:sideSign,kind:'orbit'});
   }
   // Target-relative orbit angles; large offsets are flanks and smaller offsets are strafes.
   for(const sign of [dir,-dir])for(const angle of [.38,.72,1.10,1.48])for(const factor of [.92,1.12]){
     const a=a0+sign*angle,r=radius*factor;
     targets.push({x:enemy.x+Math.cos(a)*r,y:enemy.y+Math.sin(a)*r,turn:sign,kind:angle>=1.10?'flank':'orbit'});
   }
   // Push or kite along offset radials, avoiding blindly rushing straight into a firing lane.
   for(const sign of [dir,-dir])for(const angle of [.20,.44,.66]){
     const a=a0+sign*angle,r=mode==='pressure'?desired*.83:desired*1.12;
     targets.push({x:enemy.x+Math.cos(a)*r,y:enemy.y+Math.sin(a)*r,turn:sign,kind:mode});
   }
   let best=null,second=null,considered=0;
   for(const raw of targets){
     const p={x:raw.x,y:raw.y},travel=distance(self,p),fd=distance(p,enemy);
     if(p.x<0||p.x>bounds.w||p.y<0||p.y>bounds.h||!free(p)||fd<self.range*.19||travel<minTravel)continue;
     // Distances beyond firing range are a poor offensive destination.
     const los=canSee(p,enemy),direct=canTravel(self,p),heat=danger(p);
     let penalty=travel*.33+Math.abs(fd-desired)*.56 + (los?0:scale*.62) +
       (fd>self.range*.96?(fd-self.range*.96)*2.6:0)+
       (direct?0:scale*.20+travel*.28)+heat*scale*(style==='cautious'?.78:.48);
     // A change of angle is useful, but keeping a firing line dominates gratuitous detours.
     penalty-=scale*(raw.kind==='flank'?.045:mode==='orbit'?.040:.035);
     penalty+=(raw.turn===dir?0:scale*.022);
     // Avoid endlessly selecting the same destination or circling at one fixed corner.
     for(const h of history.slice(-8)){
       if(!valid(h))continue;
       const age=Math.max(0,now-(Number.isFinite(h.time)?h.time:0));
       if(age>15)continue;
       const sep=distance(p,h),memoryRadius=scale*.22;
       penalty+=scale*.95*Math.max(0,1-sep/memoryRadius)*Math.max(.10,1-age/15);
     }
     considered++;
     const candidate={goal:p,kind:mode==='orbit'?(raw.kind==='flank'?'flank':'orbit'):mode,
       score:Math.round(penalty*10)/10,range:Math.round(fd),move:Math.round(travel),lineOfFire:los,directPath:direct,danger:Math.round(heat*100),evaluated:0};
     if(!best||candidate.score<best.score){second=best;best=candidate;}else if(!second||candidate.score<second.score)second=candidate;
   }
   if(!best)return null;
   best.evaluated=considered;
   const names={orbit:'เปลี่ยนมุมยิงขณะเคลื่อนที่',flank:'อ้อมเข้าด้านข้าง',pressure:'กดดันและเข้าระยะเหมาะสม',kite:'ถอยรักษาระยะพร้อมยิง'};
   best.reason=names[best.kind]+' · เป้าหมาย '+best.range+'px · เดิน '+best.move+'px · เสี่ยง '+best.danger+'%'+(best.directPath?'':' · ใช้ RRT หาเส้นทางอ้อม');
   return best;
 }
 return Object.freeze({plan,preferredRange});
});