/* RRT Arena V0.6.9 — tiny, deterministic team communication and world checks.
 * It does NOT implement or replace either BLUE agent; both use the V0.6.8 AI.
 * Information only enters team radio through the individual observer's visible tracks.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaTeam=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function members(count=1){
  return Array.from({length:count===2?2:1},(_,i)=>({id:'B'+(i+1),team:'blue'}));
 }
 function teamMetrics(blues=[]){
  const valid=(blues||[]).filter(Boolean);
  return {count:valid.length,alive:valid.filter(b=>b.hp>0).length,totalHp:valid.reduce((n,b)=>n+Math.max(0,Number.isFinite(b.hp)?b.hp:0),0)};
 }
 function outcome(blues,enemiesRemaining,seconds,limit=150){
  const members=teamMetrics(blues);if(!members.count)return null;
  if(members.alive===0)return {winner:'red',reason:'BLUE ทั้งทีมถูกกำจัด'};
  if(enemiesRemaining<=0)return {winner:'blue',reason:'BLUE กำจัดศัตรูครบทุกตัว'};
  if(seconds>=limit)return {winner:'red',reason:'หมดเวลา ยังเหลือศัตรู'};
  return null;
 }
 function newRadio(){return {queue:[],lastSent:{}};}
 function broadcast(radio,sender,receiver,tracks,now,{latency=.30,from=null,to=null,range=Infinity,interval=.65}={}){
  const old=radio||newRadio(),queue=(old.queue||[]).slice(),lastSent={...(old.lastSent||{})};
  if(!(Number.isFinite(now))||!sender||!receiver||sender===receiver)return {queue,lastSent};
  if(from&&to&&(!finite(from)||!finite(to)||distance(from,to)>range))return {queue,lastSent};
  for(const [id,t] of Object.entries(tracks||{})){
   if(!finite(t)||t.status!=='visible'||t.confidence<=0)continue;
   const key=sender+'>'+receiver+':'+id;
   if(now-(lastSent[key]??-Infinity)<interval)continue;
   queue.push({sender,receiver,targetId:t.id||id,x:t.x,y:t.y,
    kind:t.kind||null,seenAt:Number.isFinite(t.lastSeen)?Math.min(t.lastSeen,now):now,
    deliverAt:now+Math.max(0,latency),confidence:1});
   lastSent[key]=now;
  }
  return {queue:queue.slice(-240),lastSent};
 }
 function receive(radio,receiver,now,{ttl=3.5}={}){
  const old=radio||newRadio(),received=[],queue=[];
  for(const m of old.queue||[]){
   if(m.receiver===receiver&&m.deliverAt<=now){
    if(m.seenAt<=now&&now-m.seenAt<=ttl)received.push({...m});
   }else if(m.deliverAt>now-ttl)queue.push(m);
  }
  return {received,radio:{queue,lastSent:{...(old.lastSent||{})}}};
 }
 function mergeTracks(tracks,messages,now,{ttl=3.5}={}){
  const result={...(tracks||{})};
  for(const m of messages||[]){
   if(!finite(m)||!Number.isFinite(m.seenAt)||!m.targetId||m.seenAt>now)continue;
   const age=now-m.seenAt;if(age<0||age>ttl)continue;
   const existing=result[m.targetId];
   if(existing?.status==='visible'||existing?.status==='memory'&&Number.isFinite(existing.lastSeen)&&existing.lastSeen>=m.seenAt)continue;
   result[m.targetId]={id:m.targetId,x:m.x,y:m.y,kind:m.kind||null,
    vx:0,vy:0,status:'memory',source:'radio',lastSeen:m.seenAt,firstSeen:m.seenAt,
    confidence:Math.max(.01,Math.min(.64,(m.confidence??1)*.65*(1-age/ttl))),
    uncertainty:12+35*age};
  }
  return result;
 }
 function chooseFocus(tracks,self,teammateFocus,cooperative){
  let choices=Object.values(tracks||{}).filter(t=>finite(t)&&(t.status==='visible'||t.status==='memory'&&t.confidence>0));
  if(!choices.length)return null;
  // Keep current selector semantics for the non-cooperative control group.
  choices.sort((a,b)=>(a.status==='visible'?0:1)-(b.status==='visible'?0:1)||distance(self,a)-distance(self,b));
  const lead=choices[0];
  if(!cooperative||lead.id!==teammateFocus)return lead.id;
  const alternative=choices.find(t=>t.id!==teammateFocus&&
   (t.status==='visible'||!choices.some(v=>v.id!==teammateFocus&&v.status==='visible')));
  return (alternative||lead).id;
 }
 function chooseVisibleEnemy(foe,blues,{range=Infinity,canSee=()=>false}={}){
  if(!finite(foe))return null;
  const visible=(blues||[]).filter(b=>finite(b)&&b.hp>0&&b.active!==false&&distance(foe,b)<=range&&canSee(foe,b));
  visible.sort((a,b)=>distance(foe,a)-distance(foe,b));
  return visible[0]||null;
 }
 function segmentCircleTime(a,b,c,r){
  if(!finite(a)||!finite(b)||!finite(c))return Infinity;
  const vx=b.x-a.x,vy=b.y-a.y,fx=a.x-c.x,fy=a.y-c.y,A=vx*vx+vy*vy,C=fx*fx+fy*fy-r*r;
  if(C<=0)return 0;if(A<1e-12)return Infinity;
  const B=2*(fx*vx+fy*vy),disc=B*B-4*A*C;
  if(disc<0)return Infinity;
  const t=(-B-Math.sqrt(disc))/(2*A);
  return t>=0&&t<=1?t:Infinity;
 }
 return Object.freeze({members,teamMetrics,outcome,newRadio,broadcast,receive,mergeTracks,chooseFocus,chooseVisibleEnemy,segmentCircleTime,distance});
});
