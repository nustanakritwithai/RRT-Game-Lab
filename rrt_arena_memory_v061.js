/* RRT Arena v0.6: bounded, observation-only tactical memory.
 * No DOM, network, hidden opponent state or clock access. All time is passed explicitly.
 */
(function (root, factory) {
 'use strict';
 const api=factory();
 root.RRTArenaMemory=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const copy=p=>({x:p.x,y:p.y});
 const MAX_DANGER=24, MAX_ENCOUNTERS=20, TTL=9;
 function createMemory(inherited=[],knownEncounters=[]){
  return {lastSeen:null,wasVisible:false,hasSeen:false,sightings:0,losses:0,encounters:(Array.isArray(knownEncounters)?knownEncounters:[]).slice(-MAX_ENCOUNTERS).filter(v=>valid(v)&&Number.isFinite(v.strength)).map(v=>({x:clamp(v.x,0,1),y:clamp(v.y,0,1),time:0,strength:clamp(v.strength,0,1)})),danger:inherited.slice(-MAX_DANGER).filter(v=>valid(v)&&Number.isFinite(v.strength)).map(v=>({x:clamp(v.x,0,1),y:clamp(v.y,0,1),time:0,strength:clamp(v.strength,0,1)})),hits:0};
 }
 /** Observations from the owning bot's sensors ONLY: no opponent object is accepted. */
 function updateObservation(memory,observation,now){
  const visible=observation?.visible===true && valid(observation?.position);
  const was=memory.wasVisible;
  if(visible){
   memory.lastSeen={...copy(observation.position),time:now};
   if(!was)memory.sightings++;
   memory.hasSeen=true;
  }else if(was){memory.losses++;}
  memory.wasVisible=visible;
  return {event:visible&&!was?'spotted':!visible&&was?'lost':null,...knowledge(memory,now)};
 }
 function knowledge(memory,now,ttl=TTL){
  if(memory.wasVisible&&memory.lastSeen)return {status:'visible',position:copy(memory.lastSeen),age:0,confidence:1};
  if(!memory.lastSeen)return {status:'unknown',position:null,age:null,confidence:0};
  const age=Math.max(0,now-memory.lastSeen.time);
  if(age>ttl)return {status:'unknown',position:null,age,confidence:0};
  return {status:'remembered',position:copy(memory.lastSeen),age,confidence:clamp(1-age/ttl,0,1)};
 }
 /** A hit teaches danger at one's own location; coordinates are normalized to [0..1]. */
 function rememberDanger(memory,position,now,strength=1){
  if(!valid(position))return false;
  const spot={x:clamp(position.x,0,1),y:clamp(position.y,0,1),time:now,strength:clamp(strength,0,1)};
  const previous=memory.danger.find(v=>Math.hypot(v.x-spot.x,v.y-spot.y)<.07);
  if(previous){previous.x=(previous.x+spot.x)/2;previous.y=(previous.y+spot.y)/2;previous.strength=clamp(previous.strength*.7+spot.strength*.65,0,1);previous.time=now;}
  else memory.danger.push(spot);
  while(memory.danger.length>MAX_DANGER)memory.danger.shift();
  memory.hits++;
  return true;
 }
 function dangerAt(memory,position,now){
  if(!memory||!valid(position))return 0;
  let score=0;
  for(const s of memory.danger){
   const dx=(s.x-position.x),dy=(s.y-position.y),r2=dx*dx+dy*dy;
   // 60 second half-life, 11%-of-map spread. Bounded map-based heat, not true bullet probability.
   score+=s.strength*Math.pow(.5,Math.max(0,now-s.time)/60)*Math.exp(-r2/(2*.105*.105));
  }
  return clamp(score,0,1);
 }
 function preserveLessons(memory,now){
  return memory.danger.map(v=>({...v,strength:v.strength*Math.pow(.5,Math.max(0,now-v.time)/60)*.7})).filter(v=>v.strength>.07).slice(-MAX_DANGER);
 }
 /** Only sensory encounter locations (normalized), not guesses from live enemy state. */
 function rememberEncounter(memory,position,now,strength=.8){
  if(!valid(position))return false;
  const spot={x:clamp(position.x,0,1),y:clamp(position.y,0,1),time:now,strength:clamp(strength,0,1)};
  const old=memory.encounters.find(v=>Math.hypot(v.x-spot.x,v.y-spot.y)<.065);
  if(old){old.x=old.x*.35+spot.x*.65;old.y=old.y*.35+spot.y*.65;old.time=now;old.strength=clamp(Math.max(old.strength*.8,spot.strength),0,1);}
  else memory.encounters.push(spot);
  while(memory.encounters.length>MAX_ENCOUNTERS)memory.encounters.shift();
  return true;
 }
 function preserveEncounters(memory,now){
  return memory.encounters.map(s=>({...s,time:0,strength:clamp(s.strength*.72,0,1)})).filter(s=>s.strength>.12).slice(-MAX_ENCOUNTERS);
 }
 function selectSearchHotspot(memory,index,bounds,free,current,minDistance=22){
  if(!memory.encounters.length)return null;
  // Prefer recent evidence while rotating possible areas instead of endless camping.
  const spots=memory.encounters.slice().reverse();
  for(let i=0;i<spots.length;i++){
   const n=(index+i)%spots.length,s=spots[n];
   const point={x:s.x*bounds.w,y:s.y*bounds.h};
   if(valid(current)&&Math.hypot(point.x-current.x,point.y-current.y)<minDistance)continue;
   if(free(point))return {point,index:(n+1)%spots.length};
  }
  return null;
 }
 function selectPatrolGoal(team,visit,bounds,free){
  // Fixed sectors provide an investigation direction without knowing the enemy's live location.
  const blue=[[.85,.20],[.64,.20],[.72,.46],[.80,.78],[.38,.32],[.48,.72],[.14,.20],[.55,.47]];
  const red=[[.15,.80],[.38,.78],[.27,.48],[.17,.24],[.65,.72],[.51,.28],[.84,.80],[.45,.52]];
  const path=team==='red'?red:blue;
  for(let i=0;i<path.length;i++){
   const p=path[(visit+i)%path.length],q={x:p[0]*bounds.w,y:p[1]*bounds.h};
   if(free(q))return {point:q,index:(visit+i+1)%path.length};
  }
  return null;
 }
 return Object.freeze({createMemory,updateObservation,knowledge,rememberDanger,dangerAt,preserveLessons,selectPatrolGoal,rememberEncounter,preserveEncounters,selectSearchHotspot,MAX_ENCOUNTERS,MAX_DANGER,TTL});
});
