/* RRT ARENA V0.6.15 — Duel 2v2 pure policies / first-person P2P radio.
 * Simulation owns collisions and transport; each fighter chooses only from its own
 * observed targets. Radio reports are hints, never a sensor or firing authority.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaDuel2=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const point=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fighter=id=>/^[BR][1-9]\d{0,2}$/.test(String(id));
const blue=id=>fighter(id)&&id[0]==='B';
const red=id=>fighter(id)&&id[0]==='R';
const sameTeam=(a,b)=>fighter(a)&&fighter(b)&&a[0]===b[0]&&a!==b;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Threat priority from each fighter's own observations: visible > remembered.
// Closing speed is RELATIVE range change from that fighter's sensor, not world velocity.
// Significant hysteresis prevents RRT resets for nearly equal targets.
function threatScore(self,track,scale){
 const near=1-clamp(distance(self,track.position)/Math.max(1,scale*.8),0,1);
 const rate=Number.isFinite(track.closingRate)?track.closingRate:0;
 const approaching=.40*clamp(rate/Math.max(1,scale*.28),0,1);
 const departing=.09*clamp(-rate/Math.max(1,scale*.25),0,1);
 const stale=track.status==='remembered'?.55*clamp(track.age/4,0,1):0;
 return near+approaching-departing-stale;
}
function chooseTarget(self,tracks,current=null,{scale=400,switchMargin=.12,
 now=null,lastSwitchAt=-Infinity,minHoldSeconds=0,emergencyMargin=.32}={}){
 if(!point(self))return null;
 const known=(tracks||[]).filter(t=>t&&(red(t.id)||blue(t.id)))
  .filter(t=>point(t.position)&&['visible','remembered'].includes(t.status)&&Number.isFinite(t.age));
 if(!known.length)return null;
 const arena=Math.max(1,Number.isFinite(scale)?scale:400);
 known.sort((a,b)=>(a.status==='visible'?0:1)-(b.status==='visible'?0:1)||
  threatScore(self,b,arena)-threatScore(self,a,arena)||
  a.age-b.age||a.id.localeCompare(b.id));
 const best=known[0],previous=known.find(t=>t.id===current);
 if(previous&&previous.status===best.status){
  const advantage=threatScore(self,best,arena)-threatScore(self,previous,arena);
  // Hold the current visible threat briefly to avoid restarting RRT for a
  // tiny advantage. Unseen/dead previous targets are NOT protected by dwell.
  if(Number.isFinite(now)&&Number.isFinite(lastSwitchAt)&&
     now-lastSwitchAt<Math.max(0,minHoldSeconds)&&
     advantage<Math.max(0,emergencyMargin))return previous.id;
  if(advantage<(Number.isFinite(switchMargin)?Math.max(0,switchMargin):.12))
   return previous.id;
 }
 return best.id;
}
function resolve(bots,elapsed,limit=150){
 const members=(bots||[]).filter(b=>b&&['blue','red'].includes(b.team)&&Number.isFinite(b.hp));
 const sides={blue:members.filter(b=>b.team==='blue'),red:members.filter(b=>b.team==='red')};
 const alive={blue:sides.blue.filter(b=>b.hp>0).length,red:sides.red.filter(b=>b.hp>0).length};
 const hp={blue:sides.blue.reduce((n,b)=>n+Math.max(0,b.hp),0),
           red:sides.red.reduce((n,b)=>n+Math.max(0,b.hp),0)};
 if(!sides.blue.length||!sides.red.length)return null;
 if(!alive.blue&&!alive.red)return {winner:'draw',reason:'double_knockout',alive,hp};
 if(!alive.blue)return {winner:'red',reason:'team_eliminated',alive,hp};
 if(!alive.red)return {winner:'blue',reason:'team_eliminated',alive,hp};
 if(elapsed<limit)return null;
 return {winner:hp.blue>hp.red+.001?'blue':hp.red>hp.blue+.001?'red':'draw',
  reason:'timeout_team_hp',alive,hp};
}
function projectileContact(shot,bots,from,to,radius,hitAt,wallAt=Infinity){
 if(!shot||!point(from)||!point(to)||typeof hitAt!=='function')return null;
 let first=null;
 for(const bot of bots||[]){
  if(!bot||bot.hp<=0||!point(bot)||bot.id===shot.ownerId)continue;
  const t=hitAt(from,to,bot,radius);
  if(!Number.isFinite(t)||t<0||t>1||t>wallAt)continue;
  if(!first||t<first.t-1e-8||Math.abs(t-first.t)<1e-8&&String(bot.id)<String(first.bot.id))
   first={t,bot,friendly:bot.team===shot.team};
 }
 return first;
}
function makeInbox(){return {sightings:Object.create(null)};}
function prune(inbox,now){
 const result=makeInbox();
 for(const [id,v] of Object.entries(inbox?.sightings||{}))
  if(fighter(id)&&v?.expiresAt>now&&v.seenAt<=now&&point(v))result.sightings[id]={...v};
 return result;
}
function sendSightings(radio,from,to,tracks,now,{range=Infinity,latency=.3,ttl=3.5,interval=.65,minDisplacement=16,maxRefreshSeconds=2.25,queueLimit=240}={}){
 const old=radio||{queue:[],lastSent:{}},queue=(old.queue||[]).slice(),lastSent={...(old.lastSent||{})};
 let suppressed=0;
 if(!from||!to||!sameTeam(from.id,to.id)||
  from.hp<=0||to.hp<=0||!point(from)||!point(to)||!Number.isFinite(now)||distance(from,to)>range)
  return {queue,lastSent,suppressed};
 for(const tr of Object.values(tracks||{})){
  if(!tr||!fighter(tr.id)||tr.id[0]===from.id[0]||tr.status!=='visible'||!point(tr)||!Number.isFinite(tr.lastSeen)||
    tr.lastSeen>now||now-tr.lastSeen>ttl)continue;
  const key='D2:'+from.id+'>'+to.id+':'+tr.id;
  const previous=lastSent[key];
  const lastAt=Number.isFinite(previous)?previous:
   previous&&Number.isFinite(previous.at)?previous.at:-Infinity;
  if(now-lastAt<interval)continue;
  // Origin is still the sender's own sensor. A repeat isn't independent
  // evidence. Send a bounded heartbeat so packet loss cannot silence a track.
  const refresh=Math.max(interval,Number.isFinite(maxRefreshSeconds)?maxRefreshSeconds:2.25);
  const movement=Math.max(0,Number.isFinite(minDisplacement)?minDisplacement:16);
  if(previous&&point(previous)&&now-lastAt<refresh&&distance(previous,tr)<movement){
   suppressed++;continue;
  }
  queue.push({type:'SIGHTING',source:'own_sensor',sender:from.id,receiver:to.id,
   originId:from.id,targetId:tr.id,x:tr.x,y:tr.y,confidence:clamp(tr.confidence??1,0,1),
   seenAt:tr.lastSeen,deliverAt:now+Math.max(0,latency),expiresAt:tr.lastSeen+ttl});
  // Stored in the sender-side transport rate book, NOT peer shared memory.
  // Network loss still consumes this transmission, like a real packet.
  lastSent[key]={at:now,x:tr.x,y:tr.y};
 }
 return {queue:queue.slice(-Math.max(240,Math.floor(queueLimit)||240)),lastSent,suppressed};
}
function receive(inbox,messages,owner,now,{ttl=3.5}={}){
 const result=prune(inbox,now);
 if(!fighter(owner)||!Number.isFinite(now))return result;
 for(const m of messages||[]){
  if(!m||m.type!=='SIGHTING'||m.source!=='own_sensor'||!sameTeam(m.sender,owner)||
   m.receiver!==owner||m.originId!==m.sender||!fighter(m.targetId)||m.targetId[0]===owner[0]||
   !point(m)||!Number.isFinite(m.confidence)||m.confidence<0||m.confidence>1||
   !Number.isFinite(m.seenAt)||!Number.isFinite(m.deliverAt)||
   !Number.isFinite(m.expiresAt)||m.deliverAt>now||m.seenAt>now||
   now-m.seenAt>ttl||m.expiresAt<=now)continue;
  const previous=result.sightings[m.targetId];
  if(previous&&previous.seenAt>=m.seenAt)continue;
  result.sightings[m.targetId]={targetId:m.targetId,x:m.x,y:m.y,seenAt:m.seenAt,
   receivedAt:now,expiresAt:Math.min(m.expiresAt,m.seenAt+ttl),
   sender:m.sender,source:'radio',confidence:Math.min(.64,m.confidence*.65)};
 }
 return result;
}
function exploreGoal(inbox,self,now,free=()=>false){
 if(!point(self))return null;
 const choices=Object.values(prune(inbox,now).sightings).filter(e=>free(e));
 if(!choices.length)return null;
 choices.sort((a,b)=>b.seenAt-a.seenAt||distance(self,a)-distance(self,b));
 return {x:choices[0].x,y:choices[0].y};
}
return Object.freeze({chooseTarget,resolve,projectileContact,makeInbox,prune,sendSightings,receive,exploreGoal});
});
