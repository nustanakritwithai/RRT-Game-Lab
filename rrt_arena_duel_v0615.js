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
const fighter=id=>/^(?:B|R)[12]$/.test(String(id));
const blue=id=>id==='B1'||id==='B2';
const red=id=>id==='R1'||id==='R2';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function chooseTarget(self,tracks,current=null){
 if(!point(self))return null;
 const known=(tracks||[]).filter(t=>t&&red(t.id)||t&&blue(t.id))
  .filter(t=>point(t.position)&&['visible','remembered'].includes(t.status)&&Number.isFinite(t.age));
 if(!known.length)return null;
 known.sort((a,b)=>(a.status==='visible'?0:1)-(b.status==='visible'?0:1)||
  distance(self,a.position)-distance(self,b.position)||a.age-b.age||a.id.localeCompare(b.id));
 const best=known[0],previous=known.find(t=>t.id===current);
 if(previous&&previous.status===best.status&&
    distance(self,previous.position)<=distance(self,best.position)*1.18+4)return previous.id;
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
  if(red(id)&&v?.expiresAt>now&&v.seenAt<=now&&point(v))result.sightings[id]={...v};
 return result;
}
function sendSightings(radio,from,to,tracks,now,{range=Infinity,latency=.3,ttl=3.5,interval=.65}={}){
 const old=radio||{queue:[],lastSent:{}},queue=(old.queue||[]).slice(),lastSent={...(old.lastSent||{})};
 if(!from||!to||!blue(from.id)||!blue(to.id)||from.id===to.id||
  from.hp<=0||to.hp<=0||!point(from)||!point(to)||!Number.isFinite(now)||distance(from,to)>range)
  return {queue,lastSent};
 for(const tr of Object.values(tracks||{})){
  if(!tr||!red(tr.id)||tr.status!=='visible'||!point(tr)||!Number.isFinite(tr.lastSeen)||
    tr.lastSeen>now||now-tr.lastSeen>ttl)continue;
  const key='D2:'+from.id+'>'+to.id+':'+tr.id;
  if(now-(lastSent[key]??-Infinity)<interval)continue;
  queue.push({type:'SIGHTING',source:'own_sensor',sender:from.id,receiver:to.id,
   originId:from.id,targetId:tr.id,x:tr.x,y:tr.y,confidence:clamp(tr.confidence??1,0,1),
   seenAt:tr.lastSeen,deliverAt:now+Math.max(0,latency),expiresAt:tr.lastSeen+ttl});
  lastSent[key]=now;
 }
 return {queue:queue.slice(-240),lastSent};
}
function receive(inbox,messages,owner,now,{ttl=3.5}={}){
 const result=prune(inbox,now);
 if(!blue(owner)||!Number.isFinite(now))return result;
 for(const m of messages||[]){
  if(!m||m.type!=='SIGHTING'||m.source!=='own_sensor'||!blue(m.sender)||
   m.sender===owner||m.receiver!==owner||m.originId!==m.sender||!red(m.targetId)||
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
