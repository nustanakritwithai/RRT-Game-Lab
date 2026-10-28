/* RRT ARENA V0.9 — strategic-map fortification for team battles.
 * Pure geometry: a fort level (0-2) becomes short extra wall pieces on a ring around the defender's
 * anchor — attacker-facing first, then flanks — each placed only where it fits with clearance, so it
 * works on dense layouts and small (phone) arenas. Mirror-symmetric for BLUE/RED; gaps stay open.
 * Walls are ordinary world geometry: sight, bullets and RRT treat them like any other wall.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaFort=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PIECES_PER_LEVEL=Object.freeze([0,2,4]);
 // Angles (degrees) measured from the direction the attacker comes from; order = placement priority.
 const ANGLES=Object.freeze([28,-28,0,62,-62,95,-95,135,-135]);
 const RADII=Object.freeze([.13,.16,.19,.10,.22]);
 const LENGTH=.11,THICK=.03;
 const ANCHOR_X=.27,ANCHOR_XS=Object.freeze([.27,.22,.32,.18,.36]),ANCHOR_YS=Object.freeze([.5,.44,.56,.38,.62,.32,.68,.26,.74]);
 const overlap=(a,b,m)=>a.x<b.x+b.w+m&&b.x<a.x+a.w+m&&a.y<b.y+b.h+m&&b.y<a.y+a.h+m;
 // A piece may attach to (touch/overlap) a wall, extending that cover, or keep a full corridor of
 // clearance from it — never leave a gap narrower than the clearance that fighters could not pass.
 const compatible=(r,e,clearance)=>overlap(r,e,0)||!overlap(r,e,clearance);
 const inside=(r,B)=>r.x>=0&&r.y>=0&&r.x+r.w<=B.w&&r.y+r.h<=B.h;
 const anchorPoint=(side,ax,ay,B)=>({x:(side==='blue'?ax:1-ax)*B.w,y:ay*B.h});
 function pieceRect(anchor,side,deg,radius,S){
  const a=deg*Math.PI/180,dirX=side==='blue'?1:-1; // attacker comes from +x for BLUE, -x for RED
  const cx=anchor.x+dirX*Math.cos(a)*radius*S,cy=anchor.y+Math.sin(a)*radius*S;
  const vertical=Math.abs(Math.cos(a))>=.55,len=LENGTH*S,th=THICK*S;
  const w=vertical?th:len,h=vertical?len:th;
  return {x:cx-w/2,y:cy-h/2,w,h};
 }
 function place(anchor,side,B,existing,clearance,count){
  const S=Math.min(B.w,B.h),placed=[];
  for(const deg of ANGLES){
   if(placed.length>=count)break;
   for(const r of RADII){
    const rect=pieceRect(anchor,side,deg,r,S);
    const zone={x:anchor.x-S*.06,y:anchor.y-S*.06,w:S*.12,h:S*.12};
    if(!inside(rect,B)||overlap(rect,zone,0)||!existing.every(e=>compatible(rect,e,clearance))||placed.some(p=>overlap(rect,p,clearance)))continue;
    placed.push(rect);break;
   }
  }
  return placed;
 }
 /** Defender anchor: a clear point on the defender's side where the most level-2 pieces fit;
   * ties go to the earliest (most central) candidate, so the choice is deterministic. */
 function anchorSearch(side,B,existing,clearance){
  const S=Math.min(B.w,B.h),margin=Math.max(clearance,S*.04);let best=null,roomiest=null;
  const room=pt=>existing.reduce((m,e)=>Math.min(m,Math.hypot(Math.max(e.x-pt.x,0,pt.x-e.x-e.w),Math.max(e.y-pt.y,0,pt.y-e.y-e.h))),Infinity);
  for(const ax of ANCHOR_XS)for(const ay of ANCHOR_YS){
   const pt=anchorPoint(side,ax,ay,B),space=room(pt);
   if(!roomiest||space>roomiest.space)roomiest={pt,space,fit:0};
   if(space<margin)continue;
   const fit=place(pt,side,B,existing,clearance,PIECES_PER_LEVEL[2]).length;
   if(!best||fit>best.fit)best={pt,fit};
  }
  // Fallback: the candidate farthest from every wall (never a point inside a wall).
  return best||roomiest;
 }
 function anchorFor(side,B,existing=[],{clearance=0}={}){
  const b=anchorSearch(side,B,existing,clearance);
  return b?b.pt:anchorPoint(side,ANCHOR_X,.5,B);
 }
 function fortWalls(level,side,B,existing=[],{clearance=0}={}){
  if(!['blue','red'].includes(side)||!(level>0))return [];
  const lv=Math.min(2,level|0),anchor=anchorFor(side,B,existing,{clearance});
  return place(anchor,side,B,existing,clearance,PIECES_PER_LEVEL[lv])
   .map((r,i)=>({...r,id:'fort-'+side+'-'+i,fort:side,manual:false}));
 }
 return Object.freeze({PIECES_PER_LEVEL,anchorFor,fortWalls});
});
