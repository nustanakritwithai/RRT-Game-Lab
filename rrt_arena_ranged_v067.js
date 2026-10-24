/* RRT Arena V0.6.7 — BASIC ranged enemy bots, not a new BLUE agent.
 * Designed to be inserted after BLUE V0.6.6 settles. Dependencies: none.
 * Perception is the ONLY place permitted to inspect real BLUE coordinates.
 * All other decisions receive the sanitized observation, never BLUE ground truth.
 * Projectiles are world-physics objects, not instantaneous damage/raycast hits.
 */
(function(root,factory){'use strict';
 const api=factory();
 root.RRTArenaRanged=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ROLES=Object.freeze(['sentry','patrol','hunter']);
 const DIFFICULTIES=Object.freeze({
  training:Object.freeze({walkSpeed:.080,bulletSpeed:1.06,damage:5.5,accuracy:.71,
   fireInterval:1.75,reloadSeconds:2.30,magazine:5,rangeFraction:.46}),
  balanced:Object.freeze({walkSpeed:.125,bulletSpeed:1.20,damage:7.5,accuracy:.79,
   fireInterval:1.42,reloadSeconds:2.10,magazine:6,rangeFraction:.51}),
  hard:Object.freeze({walkSpeed:.160,bulletSpeed:1.34,damage:9,accuracy:.86,
   fireInterval:1.22,reloadSeconds:1.90,magazine:7,rangeFraction:.55})
 });
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const valid=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const norm=(x,y)=>{const d=Math.hypot(x,y);return d>1e-9?{x:x/d,y:y/d}:{x:1,y:0};};
 function statsFor(level){return DIFFICULTIES[level]||DIFFICULTIES.balanced;}
 function createRangedBot(params={}){
  const role=ROLES.includes(params.role)?params.role:'sentry',difficulty=DIFFICULTIES[params.difficulty]?params.difficulty:'balanced';
  const stats=statsFor(difficulty);
  // The explicit last spread permits test fixtures to override state fields.
  return {id:params.id||'R01',team:'ranged',role,difficulty,
   x:Number.isFinite(params.x)?params.x:0,y:Number.isFinite(params.y)?params.y:0,
   hp:42,maxHp:42,active:true,ammo:stats.magazine,readyAt:0,reloadUntil:0,
   heading:0,track:null,waypoints:[],waypointIndex:0,...params,role,difficulty,team:'ranged'};
 }
 function angleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
 /** Sensor updates are the sole world-truth ingress. Memory is copied verbatim
  * from a previous visible observation; hidden positions are NOT estimated from truth.
  */
 function observeBlue(bot,blue,now,{range=350,fov=Math.PI*2,canSee,ttl=5}={}){
  if(!valid(bot)||!Number.isFinite(now))return {status:'unknown'};
  const living=blue&&valid(blue)&&blue.active!==false&&!(blue.hp<=0);
  const d=living?distance(bot,blue):Infinity;
  const aim=living?Math.atan2(blue.y-bot.y,blue.x-bot.x):0;
  const inView=living&&d<=range&&
   (fov>=Math.PI*2-.001||Math.abs(angleDelta(aim,bot.heading||0))<=Math.max(0,fov)/2);
  if(inView&&typeof canSee==='function'&&canSee(bot,blue)){
   return {status:'visible',x:blue.x,y:blue.y,lastSeen:now,confidence:1};
  }
  const old=bot.track,age=old&&Number.isFinite(old.lastSeen)?now-old.lastSeen:Infinity;
  if(valid(old)&&age>=0&&age<ttl){
   return {status:'memory',x:old.x,y:old.y,lastSeen:old.lastSeen,confidence:clamp(1-age/ttl,0,1)};
  }
  return {status:'unknown'};
 }
 function contactPoint(obs){return obs&&['visible','memory'].includes(obs.status)&&valid(obs)?{x:obs.x,y:obs.y}:null;}
 function planBasicBot(bot,obs,now,world={}){
  const o=contactPoint(obs),visible=obs?.status==='visible';
  if(!bot?.active||bot.hp<=0)return {kind:'inactive',goal:null,fire:false};
  const scale=Math.max(80,world.scale||400),range=statsFor(bot.difficulty).rangeFraction*scale;
  const d=o?distance(bot,o):Infinity;
  const canFire=visible&&d<=range;
  // SENTRY: no position change, no memory pursuit, no tactical planning.
  if(bot.role==='sentry')return {kind:canFire?'fire':'hold',goal:null,fire:canFire};
  // PATROL: follows deterministic waypoints, stops to fire at visible targets.
  if(bot.role==='patrol'&&canFire)return {kind:'fire',goal:null,fire:true};
  if(bot.role==='hunter'){
   if(o){
    if(!visible)return {kind:'investigate',goal:o,fire:false};
    if(d<scale*.105){
     const away=norm(bot.x-o.x,bot.y-o.y);
     return {kind:'backoff',goal:{x:bot.x+away.x*scale*.20,y:bot.y+away.y*scale*.20},fire:canFire};
    }
    if(d>range*.87)return {kind:'advance',goal:o,fire:canFire};
    return {kind:'fire',goal:null,fire:canFire};
   }
  }
  const waypoints=(Array.isArray(bot.waypoints)?bot.waypoints:[]).filter(valid);
  if(waypoints.length){
   let idx=clamp(Math.trunc(bot.waypointIndex||0),0,waypoints.length-1);
   if(distance(bot,waypoints[idx])<Math.max(12,world.radius||10))idx=(idx+1)%waypoints.length;
   return {kind:'patrol',goal:{x:waypoints[idx].x,y:waypoints[idx].y},waypointIndex:idx,fire:false};
  }
  return {kind:'hold',goal:null,fire:false};
 }
 /** Simple local steering. Refuse movement if swept collision queries aren't
  * provided by the original game. Never bypass obstacles or teleport.
  */
 function moveBasicBot(bot,intent,dt,world={}){
  if(!bot||!bot.active||bot.hp<=0||bot.role==='sentry'||!valid(intent?.goal)||!(dt>0))return bot;
  if(typeof world.isFree!=='function'||typeof world.pathClear!=='function')return bot;
  const width=world.width||960,height=world.height||600,radius=world.radius||10,scale=world.scale||400;
  const speed=statsFor(bot.difficulty).walkSpeed*scale;
  const goal=intent.goal,delta={x:goal.x-bot.x,y:goal.y-bot.y},dist=distance(bot,goal);
  if(dist<.001)return bot;
  const step=Math.min(speed*Math.min(dt,.15),dist),base=Math.atan2(delta.y,delta.x);
  const rotations=[0,.38,-.38,.78,-.78,1.16,-1.16,1.65,-1.65,Math.PI];
  for(const angle of rotations){
   const direction=base+angle,travel=angle===0?step:step*.83;
   const next={x:bot.x+Math.cos(direction)*travel,y:bot.y+Math.sin(direction)*travel};
   if(next.x<radius||next.x>width-radius||next.y<radius||next.y>height-radius)continue;
   if(!world.isFree(next)||!world.pathClear(bot,next))continue;
   return {...bot,x:next.x,y:next.y,heading:direction,waypointIndex:intent.waypointIndex??bot.waypointIndex};
  }
  return bot;
 }
 /** Fire requires fresh visible observation AND world LOS recheck.
  * The bullet is only spawned here: damage must be applied by world physics.
  */
 function tryFire(bot,obs,now,world={}){
  const none={bot,shot:null};
  if(!bot||!bot.active||bot.hp<=0||!Number.isFinite(now))return none;
  const spec=statsFor(bot.difficulty),scale=world.scale||400;
  if(bot.reloadUntil>now)return none;
  let current=bot;
  if(bot.reloadUntil>0&&bot.reloadUntil<=now)current={...current,ammo:spec.magazine,reloadUntil:0};
  if(current.ammo<=0){
   return {bot:{...current,reloadUntil:now+spec.reloadSeconds},shot:null};
  }
  if(obs?.status!=='visible'||!valid(obs)||typeof world.canSee!=='function')
   return {bot:current,shot:null};
  if(now<(current.readyAt||0)||distance(current,obs)>spec.rangeFraction*scale)
   return {bot:current,shot:null};
  if(!world.canSee(current,obs))return {bot:current,shot:null};
  const random=typeof world.rng==='function'?world.rng():.5;
  const theta=Math.atan2(obs.y-current.y,obs.x-current.x)+(clamp(random,0,1)*2-1)*(1-spec.accuracy)*.47;
  const muzzle=(world.radius||10)*1.1;
  const bulletSpeed=spec.bulletSpeed*scale;
  return {
   bot:{...current,ammo:current.ammo-1,readyAt:now+spec.fireInterval},
   shot:{ownerId:current.id,team:'ranged',
    x:current.x+Math.cos(theta)*muzzle,y:current.y+Math.sin(theta)*muzzle,
    vx:Math.cos(theta)*bulletSpeed,vy:Math.sin(theta)*bulletSpeed,
    radius:2,damage:spec.damage,ttl:1.8}
  };
 }
 function segmentRectTime(a,b,r){
  const minX=r.x,maxX=r.x+r.w,minY=r.y,maxY=r.y+r.h;
  const dx=b.x-a.x,dy=b.y-a.y;
  let low=0,high=1;
  for(const [s,v,lo,hi] of [[a.x,dx,minX,maxX],[a.y,dy,minY,maxY]]){
   if(Math.abs(v)<1e-12){if(s<lo||s>hi)return Infinity;continue;}
   const enter=(lo-s)/v,exit=(hi-s)/v;
   low=Math.max(low,Math.min(enter,exit));high=Math.min(high,Math.max(enter,exit));
   if(low>high)return Infinity;
  }
  return low<=1&&high>=0?Math.max(0,low):Infinity;
 }
 function segmentCircleTime(a,b,c,r){
  const dx=b.x-a.x,dy=b.y-a.y,fx=a.x-c.x,fy=a.y-c.y;
  const A=dx*dx+dy*dy,C=fx*fx+fy*fy-r*r;
  if(C<=0)return 0;
  if(A<1e-12)return Infinity;
  const B=2*(fx*dx+fy*dy),disc=B*B-4*A*C;
  if(disc<0)return Infinity;
  const hit=(-B-Math.sqrt(disc))/(2*A);
  return hit>=0&&hit<=1?hit:Infinity;
 }
 /** Only the world engine calls this, with real obstacles and fighters.
  * For tie times, wall wins; no projectile passes through a wall or a fighter.
  */
 function advanceProjectile(shot,dt,world={}){
  const none={projectile:shot,impact:null};
  if(!shot||!(dt>0))return none;
  if(!(shot.ttl>0))return {projectile:null,impact:null};
  const seconds=Math.min(dt,shot.ttl),from={x:shot.x,y:shot.y};
  const to={x:from.x+(shot.vx||0)*seconds,y:from.y+(shot.vy||0)*seconds};
  const rad=shot.radius||2;
  let first=Infinity,hit=null;
  for(const w of world.walls||[]){
   const r={x:w.x-rad,y:w.y-rad,w:w.w+rad*2,h:w.h+rad*2};
   const t=segmentRectTime(from,to,r);
   if(t<first){first=t;hit={type:'wall',point:{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}};}
  }
  for(const target of world.targets||[]){
   if(target.active===false||target.id===shot.ownerId||!valid(target))continue;
   const t=segmentCircleTime(from,to,target,(target.radius||10)+rad);
   if(t<first-1e-9){
    first=t;hit={type:'target',targetId:target.id,damage:shot.damage,point:{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}};
   }
  }
  if(hit)return {projectile:null,impact:hit};
  if(to.x<0||to.y<0||to.x>(world.width||960)||to.y>(world.height||600)||dt>=shot.ttl)
   return {projectile:null,impact:null};
  return {projectile:{...shot,x:to.x,y:to.y,ttl:shot.ttl-dt},impact:null};
 }
 return Object.freeze({ROLES,DIFFICULTIES,statsFor,distance,createRangedBot,
  observeBlue,planBasicBot,moveBasicBot,tryFire,advanceProjectile,
  segmentRectTime,segmentCircleTime});
});
