/* Multi-target sensor + priority extension for the EXISTING RRT Arena V0.6.3 BLUE agent.
 * Pure functions: no DOM, no API key; plan/move/shoot/tactics/defense stay in v0.6.3 engine.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaMulti=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  function observe(observer,targets,previous,now,{canSee=()=>true,range=500,ttl=8,fov=Math.PI*2,heading=null}={}){
    const tracks={};const visible=[];
    for(const b of targets){
      if(!b.active)continue;
      const prior=previous?.[b.id];
      const d=distance(observer,b);
      const ang=Math.atan2(b.y-observer.y,b.x-observer.x);
      const inView=d<=range&&(!Number.isFinite(heading)||fov>=2*Math.PI-.001||Math.abs(angleDiff(ang,heading))<=fov/2);
      // The ONLY location at which world-truth target coordinates may enter track memory.
      if(inView&&canSee(observer,b)){
        const elapsed=prior?now-prior.lastSeen:0;
        const v=prior&&prior.status==='visible'&&elapsed>.04&&elapsed<1.6?{vx:clamp((b.x-prior.x)/elapsed,-140,140),vy:clamp((b.y-prior.y)/elapsed,-140,140)}:{vx:prior?.vx??0,vy:prior?.vy??0};
        tracks[b.id]={id:b.id,x:b.x,y:b.y,vx:v.vx,vy:v.vy,kind:b.kind,lastSeen:now,firstSeen:prior?.firstSeen??now,status:'visible',confidence:1,uncertainty:0};
        visible.push(b.id);
      } else if(prior&&now-prior.lastSeen<ttl){
        const age=Math.max(0,now-prior.lastSeen);
        tracks[b.id]={...prior,status:'memory',confidence:clamp(1-age/ttl,0,1),uncertainty:Math.min(160,12+age*23)};
      }
    }
    return {tracks,visibleIds:visible,knownCount:Object.keys(tracks).length};
  }
  function targetPosition(track,now,{width=960,height=600,lead=.72}={}){
    if(!track)return null;
    if(track.status==='visible')return {x:track.x,y:track.y};
    const age=Math.max(0,now-track.lastSeen),duration=Math.min(age,lead);
    return {x:clamp(track.x+clamp((track.vx||0)*duration,-65,65),12,width-12),y:clamp(track.y+clamp((track.vy||0)*duration,-65,65),12,height-12)};
  }
  function rank(tracks,agent,now,{priority='visible',current=null,width=960,height=600}={}){
    const candidates=Object.values(tracks||{});if(!candidates.length)return null;
    let best=null,score=-Infinity;
    for(const t of candidates){const p=targetPosition(t,now,{width,height});const d=distance(agent,p);let s=0;
      if(priority==='nearest')s=360-d+(t.status==='visible'?55:0);
      else if(priority==='runner')s=(t.kind==='flee'?175:0)+(t.status==='visible'?100:0)+95*t.confidence-.30*d;
      else if(priority==='memory')s=(t.status==='memory'?195:0)+85*t.confidence-.25*d;
      else s=(t.status==='visible'?240:0)+110*t.confidence-.24*d;
      // Hysteresis prevents the advanced BLUE agent from resetting its RRT tree every frame.
      if(t.id===current)s+=60;
      if(s>score){score=s;best=t;}
    }
    return best;
  }
  return Object.freeze({observe,targetPosition,rank,clamp,distance});
});
