/* RRT Game Lab — Multiple Target Observation & Planning Core (v0.7 experimental).
 * Dependency-free UMD so Node unit tests and browser demo execute identical logic.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.MultiTargetCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const WIDTH=960,HEIGHT=600,TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const between=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  function random(seed){let s=(seed>>>0)||1;return function(){s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
  function sampleDisk(rng,ctr,rad){const theta=rng()*TAU, rr=Math.sqrt(rng())*rad;return {x:ctr.x+Math.cos(theta)*rr,y:ctr.y+Math.sin(theta)*rr};}
  function inRect(p,r,rect){return p.x>=rect.x-r&&p.x<=rect.x+rect.w+r&&p.y>=rect.y-r&&p.y<=rect.y+rect.h+r;}
  function freePoint(p,obstacles,r=0,w=WIDTH,h=HEIGHT){return p.x>=r&&p.x<=w-r&&p.y>=r&&p.y<=h-r&&!obstacles.some(o=>inRect(p,r,o));}
  function segmentHitsRect(a,b,box,r=0){
    const minX=box.x-r,maxX=box.x+box.w+r,minY=box.y-r,maxY=box.y+box.h+r;
    const dx=b.x-a.x,dy=b.y-a.y;
    let lo=0,hi=1;
    for(const [start,d,min,max] of [[a.x,dx,minX,maxX],[a.y,dy,minY,maxY]]){
      if(Math.abs(d)<1e-9){if(start<min||start>max)return false;continue;}
      const ta=(min-start)/d,tb=(max-start)/d,enter=Math.min(ta,tb),leave=Math.max(ta,tb);
      lo=Math.max(lo,enter);hi=Math.min(hi,leave);
      if(lo>hi)return false;
    }
    return hi>=0&&lo<=1;
  }
  function segmentClear(a,b,obstacles,r=0,w=WIDTH,h=HEIGHT){return freePoint(a,obstacles,r,w,h)&&freePoint(b,obstacles,r,w,h)&&!obstacles.some(o=>segmentHitsRect(a,b,o,r));}
  function visible(observer,target,obstacles,{range=350,fov=TAU,heading=null,margin=2}={}){
    const d=dist(observer,target);
    if(d>range)return false;
    if(heading!==null&&fov<TAU-0.001){const v=Math.atan2(target.y-observer.y,target.x-observer.x);if(Math.abs(angleDiff(v,heading))>fov/2)return false;}
    return segmentClear(observer,target,obstacles,margin);
  }
  function predict(track,now,rangeLimit=85){
    let elapsed=Math.max(0,now-track.lastSeen);
    let dx=clamp((track.vx||0)*elapsed,-rangeLimit,rangeLimit),dy=clamp((track.vy||0)*elapsed,-rangeLimit,rangeLimit);
    return {x:clamp(track.x+dx,12,WIDTH-12),y:clamp(track.y+dy,12,HEIGHT-12)};
  }
  /* Observe is the only entrypoint that reads ground-truth target coordinates.
     The tracker returns only sanitized, sensor-derived records to the planner. */
  function observe(observer,targets,obstacles,previous,now,{range=350,fov=TAU,ttl=7}={}){
    const out={}; const seen=[];
    for(const t of targets){
      if(!t.active)continue;
      const prior=previous[t.id];
      const isVisible=visible(observer,t,obstacles,{range,fov,heading:observer.heading??null});
      if(isVisible){
        const gap=prior?now-prior.lastSeen:0;
        const v=prior&&gap>0.1&&gap<2 ? {vx:clamp((t.x-prior.x)/gap,-85,85),vy:clamp((t.y-prior.y)/gap,-85,85)} : {vx:prior?.vx||0,vy:prior?.vy||0};
        out[t.id]={id:t.id,x:t.x,y:t.y,vx:v.vx,vy:v.vy,kind:t.kind,status:'visible',confidence:1,lastSeen:now,firstSeen:prior?.firstSeen??now,uncertainty:0};
        seen.push(t.id);
      } else if(prior&&now-prior.lastSeen<ttl){
        const elapsed=Math.max(0,now-prior.lastSeen),pos=predict(prior,now);
        out[t.id]={id:t.id,x:prior.x,y:prior.y,vx:prior.vx,vy:prior.vy,kind:prior.kind,status:'memory',confidence:clamp(1-elapsed/ttl,0,1),lastSeen:prior.lastSeen,firstSeen:prior.firstSeen,uncertainty:Math.min(155,10+elapsed*23),predicted:pos};
      }
    }
    return {tracks:out,visibleIds:seen,knownCount:Object.keys(out).length};
  }
  function rankTarget(tracks,observer,mode='nearest',focus=null){
    const list=Object.values(tracks||{}); if(!list.length)return null;
    let best=null,high=-1e8;
    for(const t of list){
      const p=t.status==='memory'?(t.predicted||t):t;
      const d=dist(observer,p);
      let score=0;
      if(mode==='nearest')score=380-d;
      else if(mode==='visible')score=(t.status==='visible'?220:0)+160*t.confidence-0.28*d;
      else if(mode==='runner')score=(t.kind==='flee'?160:0)+(t.status==='visible'?70:0)+90*t.confidence-0.4*d;
      else if(mode==='memory')score=(t.status==='memory'?185:0)+70*t.confidence-0.2*d;
      else score=380-d;
      if(t.id===focus)score+=45;
      if(score>high){high=score;best=t;}
    }
    return best;
  }
  function steer(from,to,step){const d=dist(from,to);return d<=step?{x:to.x,y:to.y}:between(from,to,step/d);}
  function smooth(path,obstacles,r){
    if(path.length<3)return path.slice();
    let out=[path[0]],i=0;
    while(i<path.length-1){let next=i+1;for(let j=path.length-1;j>i+1;j--){if(segmentClear(path[i],path[j],obstacles,r)){next=j;break;}}
      out.push(path[next]);i=next;
    }
    return out;
  }
  function rrt(start,goal,obstacles,{seed=1,iterations=600,step=34,goalBias=.14,guided=.45,radius=10,worldWidth=WIDTH,worldHeight=HEIGHT}={}){
    const rng=random(seed),nodes=[{x:start.x,y:start.y,parent:-1}],counts={goal:0,corridor:0,global:0},s={iterations:0,nodes:1,found:false,sampling:counts};
    if(!freePoint(start,obstacles,radius,worldWidth,worldHeight)||!freePoint(goal,obstacles,radius,worldWidth,worldHeight))return {path:[],nodes,stats:s};
    if(segmentClear(start,goal,obstacles,radius,worldWidth,worldHeight))return {path:[start,goal],nodes:[nodes[0],{x:goal.x,y:goal.y,parent:0}],stats:{...s,found:true,nodes:2}};
    let end=-1;
    for(let k=0;k<iterations;k++){
      let sample,rv=rng();
      if(rv<goalBias){sample=goal;counts.goal++;}
      else if(rv<goalBias+guided){let ctr=between(start,goal,rng());sample=sampleDisk(rng,ctr,40+dist(start,goal)*.19);counts.corridor++;}
      else {sample={x:rng()*worldWidth,y:rng()*worldHeight};counts.global++;}
      s.iterations++;
      if(!freePoint(sample,obstacles,0,worldWidth,worldHeight))continue;
      let idx=0,nearest=Infinity;
      for(let i=0;i<nodes.length;i++){const d=(nodes[i].x-sample.x)**2+(nodes[i].y-sample.y)**2;if(d<nearest){nearest=d;idx=i;}}
      const p=steer(nodes[idx],sample,step);
      if(!segmentClear(nodes[idx],p,obstacles,radius,worldWidth,worldHeight))continue;
      nodes.push({x:p.x,y:p.y,parent:idx});
      if(dist(p,goal)<step*1.55&&segmentClear(p,goal,obstacles,radius,worldWidth,worldHeight)){nodes.push({x:goal.x,y:goal.y,parent:nodes.length-1});end=nodes.length-1;break;}
    }
    s.nodes=nodes.length;
    if(end<0)return {path:[],nodes,stats:s};
    const path=[];let cur=end;
    while(cur>=0){path.push({x:nodes[cur].x,y:nodes[cur].y});cur=nodes[cur].parent;}
    path.reverse(); s.found=true;
    return {path:smooth(path,obstacles,radius),nodes,stats:s};
  }
  /* Safe local-avoidance for simple target bots, no expensive planning loop. */
  function moveToward(point,desired,obstacles,distance,radius=10,w=WIDTH,h=HEIGHT){
    if(distance<=0||dist(point,desired)<0.001)return {x:point.x,y:point.y};
    const base=Math.atan2(desired.y-point.y,desired.x-point.x);
    const max=Math.min(distance,dist(point,desired));
    const angles=[0,.38,-.38,.76,-.76,1.22,-1.22,1.8,-1.8,2.42,-2.42,Math.PI];
    for(const ang of angles){const theta=base+ang,step=ang===0?max:distance*.78;const to={x:point.x+Math.cos(theta)*step,y:point.y+Math.sin(theta)*step};
      if(segmentClear(point,to,obstacles,radius,w,h))return to;
    }
    return {x:point.x,y:point.y};
  }
  return {WIDTH,HEIGHT,TAU,clamp,dist,between,random,sampleDisk,freePoint,segmentHitsRect,segmentClear,visible,predict,observe,rankTarget,steer,smooth,rrt,moveToward};
});
