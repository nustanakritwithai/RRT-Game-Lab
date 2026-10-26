/* PeerMesh Lab — deterministic, locally decided peer-to-peer dissemination simulator.
 * Agents own separate ledgers. The transport/test harness knows positions and true values
 * for scoring only; neither is available to an agent's consensus rule. No LLM calls.
 * CORROBORATED means 2+ independent origins agree, NOT that the content is true.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PeerMeshCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PROTOCOLS=Object.freeze(['flood','gossip','fanout','anti-entropy','adaptive-gossip']);
 const W=1000,H=620;
 const WATER_SITE=Object.freeze({x:500,y:310});
 const WATER_RADIUS=20;
 const clamp=(n,min,max,d)=>Number.isFinite(Number(n))?Math.min(max,Math.max(min,Number(n))):d;
 function hash32(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return h>>>0;
 }
 const sample=(...parts)=>hash32(parts.join('|'))/4294967296;
 function rng(seed){
  let x=hash32('layout:'+seed);
  return function(){x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);
   t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 }
 function normalized(input){
  const c=input||{};
  return Object.freeze({
   count:Math.trunc(clamp(c.count,1,1000,1000)),
   protocol:PROTOCOLS.includes(c.protocol)?c.protocol:'flood',
   scenario:['single','witnesses','conflict','water-true','water-false'].includes(c.scenario)?c.scenario:'single',
   seed:Math.trunc(clamp(c.seed,1,2147483647,311)),
   range:clamp(c.range,20,1500,108),
   loss:clamp(c.loss,0,1,0.1),
   latency:Math.trunc(clamp(c.latency,1,12,2)),
   mobile:!!c.mobile,
   gossipChance:clamp(c.gossipChance,0,1,0.52),
   fanout:Math.trunc(clamp(c.fanout,1,20,3)),
   maxHops:Math.trunc(clamp(c.maxHops,0,48,16)),
   maxRetries:Math.trunc(clamp(c.maxRetries,1,8,4)),
   maxTicks:Math.trunc(clamp(c.maxTicks,1,400,160)),
   maxTransmissions:Math.trunc(clamp(c.maxTransmissions,1,300000,150000))
  });
 }
 function createSimulation(input){
  const config=normalized(input);
  const isWater=config.scenario==='water-true'||config.scenario==='water-false';
  // World truth is only sampled by first-hand inspections inside WATER_RADIUS.
  // It must never be given to a peer's ledger, relay, or consensus evaluator.
  const waterExists=config.scenario==='water-true';
  const random=rng(config.seed);
  const agents=Array.from({length:config.count},(_,id)=>{
   const ang=random()*Math.PI*2;
   return {id,x:20+random()*(W-40),y:20+random()*(H-40),
    vx:Math.cos(ang)*(1+random()*2.5),vy:Math.sin(ang)*(1+random()*2.5),
    seen:new Map(),reports:new Map(),evidence:new Map(),sent:new Map(),firstAt:new Map(),
    isScout:id>0&&(id%17===1||(id>8&&id%17===2)),
    inspected:false,fieldVotes:{water:0,dry:0}};
  });
  const pending=new Map();
  const trace=[];
  const history=[];
  let t=0;
  let attempts=0,delivered=0,lost=0,duplicates=0,rejected=0,dataPackets=0,controlPackets=0,bytes=0;
  let retries=0,acknowledgements=0,carrierContacts=0;
  let lastTopology=null;
  const primaryId='r0';
  // Reports are authored by independent simulated witnesses, not by relays.
  function seed(origin,value,kind='claim'){
   if(origin<0||origin>=agents.length||agents[origin].reports.has(origin))return;
   const a=agents[origin],report=Object.freeze({id:'r'+origin,origin,value,kind,hop:0,
    site:isWater?{x:WATER_SITE.x,y:WATER_SITE.y}:null,observedAt:0});
   a.seen.set(report.id,report);
   a.reports.set(origin,value);
   a.evidence.set(origin,Object.freeze({kind,value,observedAt:0}));
   a.sent.set(report.id,new Map());
   a.firstAt.set(report.id,0);
  }
  seed(0,'A',isWater?'rumor':'claim');
  if(!isWater&&config.scenario!=='single'){
   for(const id of new Set([Math.floor(config.count*.31),Math.floor(config.count*.69)]))seed(id,'A');
  }
  if(config.scenario==='conflict'){
   for(const id of new Set([config.count-1,config.count-2]))if(id>0&& !agents[id].reports.has(id))seed(id,'B');
  }
  function verdict(a){
   const n=a.reports.size;
   if(isWater){
    const wet=a.fieldVotes.water,dry=a.fieldVotes.dry;
    // Rumor forwarding NEVER counts as a second independent onsite witness.
    // Even 1,000 repeats of the rumor are not an observed water source.
    let status;
    if(wet&&dry)status='DISPUTED';
    else if(wet>=2)status='WATER_FOUND';
    else if(dry>=2)status='NO_WATER';
    else if(wet||dry)status='VERIFYING';
    else status=a.seen.has(primaryId)?'RUMOR_ONLY':'UNKNOWN';
    return {status,independentSources:n,variant:
     wet&&!dry?'A':dry&&!wet?'B':null,inspections:{water:wet,dry}};
   }
   if(n<2)return {status:'UNKNOWN',independentSources:n,variant:n?[...a.reports.values()][0]:null};
   const variants=new Set(a.reports.values());
   if(variants.size>1)return {status:'CONFLICT',independentSources:n,variant:null};
   return {status:'CORROBORATED',independentSources:n,variant:[...variants][0]};
  }
  function state(id){
   if(!Number.isInteger(id)||id<0||id>=agents.length)return null;
   const a=agents[id],v=verdict(a);
   return {id,status:v.status,independentSources:v.independentSources,
    variant:v.variant,hasPrimary:a.seen.has(primaryId),reports:a.reports.size,
    inspections:v.inspections||{water:0,dry:0},isScout:isWater&&a.isScout,
    scouting:isWater&&a.isScout&&a.seen.has(primaryId)&&!a.inspected,
    inspected:isWater&&a.inspected};
  }
  function metrics(){
   let primaryReached=0,unknown=0,conflicted=0,corroborated=0,wrongCorroborated=0,anyReached=0;
   let rumorOnly=0,verifying=0,verifiedWater=0,refutedRumor=0,disputed=0,fieldInspections=0,scoutsEnRoute=0;
   let factFirst=0,uncorrectedRumor=0,factReached=0,evidenceWithoutRumor=0;
   for(const a of agents){
    if(a.seen.has(primaryId))primaryReached++;
    if(a.seen.size)anyReached++;
    const v=verdict(a);
    if(v.status==='UNKNOWN')unknown++;
    else if(v.status==='CONFLICT')conflicted++;
    else if(v.status==='CORROBORATED'){corroborated++;if(v.variant!=='A')wrongCorroborated++;}
    else if(v.status==='RUMOR_ONLY')rumorOnly++;
    else if(v.status==='VERIFYING')verifying++;
    else if(v.status==='WATER_FOUND')verifiedWater++;
    else if(v.status==='NO_WATER')refutedRumor++;
    else if(v.status==='DISPUTED')disputed++;
    if(isWater){
     if(a.inspected)fieldInspections++;
     if(a.isScout&&a.seen.has(primaryId)&&!a.inspected)scoutsEnRoute++;
     const heard=a.firstAt.get(primaryId);
     const firstFact=Math.min(Infinity,...[...a.firstAt.entries()].filter(([key])=>key!==primaryId).map(([,tick])=>tick));
     if(Number.isFinite(firstFact)){
      factReached++;
      if(!Number.isFinite(heard))evidenceWithoutRumor++;
      if(firstFact<(heard??Infinity))factFirst++;
     }else if(Number.isFinite(heard))uncorrectedRumor++;
    }
   }
   const neighbors=peers(),visited=new Uint8Array(config.count),queue=[0];
   let sourceComponent=0,isolated=0,degreeSum=0;
   visited[0]=1;
   for(const list of neighbors){degreeSum+=list.length;if(list.length===0)isolated++;}
   while(sourceComponent<queue.length){
    const id=queue[sourceComponent++];
    for(const peer of neighbors[id])if(!visited[peer]){visited[peer]=1;queue.push(peer);}
   }
   return {tick:t,count:config.count,primaryReached,anyReached,
    coveragePct:Math.round(primaryReached/config.count*1000)/10,
    unknown,conflicted,corroborated,wrongCorroborated,
    rumorOnly,verifying,verifiedWater,refutedRumor,disputed,fieldInspections,scoutsEnRoute,
    factFirst,uncorrectedRumor,factReached,evidenceWithoutRumor,
    sourceComponent,isolated,averageDegree:Math.round(degreeSum/config.count*10)/10,
    retries,acknowledgements,carrierContacts,
    transmissions:attempts,delivered,lost,duplicates,rejected,
    dataPackets,controlPackets,estimatedBytes:bytes,
    queued:[...pending.values()].reduce((n,arr)=>n+arr.length,0),
    budgetExhausted:attempts>=config.maxTransmissions};
  }
  function peers(){
   if(lastTopology)return lastTopology;
   const cells=new Map(),cell=Math.max(config.range,1);
   for(const a of agents){
    const x=Math.floor(a.x/cell),y=Math.floor(a.y/cell),key=x+','+y;
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(a.id);
   }
   const adjacency=agents.map(()=>[]);
   const distance2=config.range*config.range;
   for(const a of agents){
    const x=Math.floor(a.x/cell),y=Math.floor(a.y/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
     const bucket=cells.get((x+dx)+','+(y+dy));
     if(!bucket)continue;
     for(const id of bucket){
      if(id===a.id)continue;
      const b=agents[id],xx=a.x-b.x,yy=a.y-b.y;
      if(xx*xx+yy*yy<=distance2)adjacency[a.id].push(id);
     }
    }
    adjacency[a.id].sort((u,v)=>u-v);
   }
   lastTopology=adjacency;return adjacency;
  }
  function transmit(kind,from,to,payload){
   if(attempts>=config.maxTransmissions)return false;
   if(from===to||from<0||to<0||to>=agents.length)return false;
   const sender=agents[from],receiver=agents[to];
   if(Math.hypot(sender.x-receiver.x,sender.y-receiver.y)>config.range)return false;
   attempts++;
   const size=kind==='data'?96:24+8*(payload.ids?payload.ids.length:0);
   bytes+=size;
   if(kind==='data')dataPackets++;else controlPackets++;
   const key=kind+':'+(payload.report?payload.report.id:payload.reportId||(payload.ids||[]).join(','));
   if(sample(config.seed,'radio',kind,from,to,key,t,attempts)<config.loss){lost++;return true;}
   const due=t+config.latency;
   if(!pending.has(due))pending.set(due,[]);
   pending.get(due).push({kind,from,to,payload,due});
   return true;
  }
  function data(from,to,report){
   if(!report||report.hop>=config.maxHops)return false;
   return transmit('data',from,to,{report:{id:report.id,origin:report.origin,value:report.value,
    kind:report.kind||'claim',site:report.site||null,observedAt:report.observedAt||0,hop:report.hop+1}});
  }
  function ackMode(){return ['gossip','fanout','adaptive-gossip'].includes(config.protocol);}
  // Per-agent per-message per-neighbor retry state. Failed probability draws do
  // NOT consume an attempt or mark a neighbor as sent; lost packets may retry.
  function offer(a,peer,report){
   const ledger=a.sent.get(report.id);
   if(!ledger)return false;
   const previous=ledger.get(peer);
   if(previous&&(previous.confirmed||previous.attempts>=config.maxRetries||
      t<previous.nextAt))return false;
   const ok=data(a.id,peer,report);
   if(!ok)return false;
   const tries=(previous?.attempts||0)+1;
   ledger.set(peer,{attempts:tries,nextAt:t+
    Math.max(2,config.latency*2)*Math.pow(2,Math.min(tries-1,4)),confirmed:false});
   if(tries>1)retries++;
   if(config.mobile&&t>(a.firstAt.get(report.id)??t)+4)carrierContacts++;
   return true;
  }
  function receive(packet){
   const a=agents[packet.to],other=agents[packet.from];
   if(!a||!other){rejected++;return;}
   delivered++;
   trace.push({tick:t,from:packet.from,to:packet.to,kind:packet.kind});
   if(trace.length>100)trace.shift();
   if(packet.kind==='data'){
    const r=packet.payload.report;
    if(!r||!Number.isInteger(r.origin)||r.origin<0||r.origin>=agents.length||
       r.id!=='r'+r.origin||!['A','B'].includes(r.value)||r.hop>config.maxHops||
       !['claim','rumor','inspection'].includes(r.kind||'claim')||
       (isWater&&r.kind==='rumor'&&r.origin!==0)||
       (isWater&&r.kind==='inspection'&&(r.origin===0||!r.site||
        !Number.isFinite(r.site.x)||!Number.isFinite(r.site.y)))||
       (isWater&&r.kind==='rumor'&&(!r.site||
        !Number.isFinite(r.site.x)||!Number.isFinite(r.site.y)))){rejected++;return;}
    if(a.seen.has(r.id)){
     duplicates++;
     if(ackMode())transmit('ack',a.id,other.id,{reportId:r.id});
     return;
    }
    // Preserve first received claim from one origin; independent votes are by origin only.
    if(a.reports.has(r.origin)){duplicates++;return;}
    const item=Object.freeze({id:r.id,origin:r.origin,value:r.value,kind:r.kind||'claim',
     site:r.site?{x:r.site.x,y:r.site.y}:null,observedAt:r.observedAt||0,hop:r.hop});
    a.seen.set(item.id,item);
    a.reports.set(item.origin,item.value);
    a.evidence.set(item.origin,Object.freeze({kind:item.kind,value:item.value,
     observedAt:item.observedAt}));
    if(item.kind==='inspection'){
     if(item.value==='A')a.fieldVotes.water++;else a.fieldVotes.dry++;
    }
    a.sent.set(item.id,new Map());
    a.firstAt.set(item.id,t);
    if(ackMode())transmit('ack',a.id,other.id,{reportId:r.id});
    return;
   }
   if(packet.kind==='ack'){
    const id=packet.payload?.reportId;
    const entry=typeof id==='string'&&a.sent.get(id)?.get(packet.from);
    if(entry&&!entry.confirmed){
     entry.confirmed=true;
     acknowledgements++;
    }
    return;
   }
   if(packet.kind==='digest'){
    const remote=new Set(packet.payload.ids);
    const missing=[];
    for(const id of remote)if(!a.seen.has(id))missing.push(id);
    if(missing.length)transmit('request',a.id,other.id,{ids:missing.slice(0,16)});
    for(const [id,report] of a.seen)if(!remote.has(id))data(a.id,other.id,report);
    return;
   }
   if(packet.kind==='request'){
    for(const id of packet.payload.ids){
     const report=a.seen.get(id);
     if(report)data(a.id,other.id,report);
    }
   }
  }
  function inspectSite(a,target){
   if(a.inspected)return;
   if(Math.hypot(a.x-target.x,a.y-target.y)>WATER_RADIUS)return;
   // An agent can obtain site truth only through its own physical proximity.
   // The environment is a measurement fixture, not a shared message or vote.
   const observation=Object.freeze({id:'r'+a.id,origin:a.id,
    value:waterExists?'A':'B',kind:'inspection',hop:0,site:{...target},observedAt:t});
   a.inspected=true;
   a.seen.set(observation.id,observation);
   a.reports.set(a.id,observation.value);
   a.evidence.set(a.id,Object.freeze({kind:'inspection',value:observation.value,observedAt:t}));
   if(observation.value==='A')a.fieldVotes.water++;else a.fieldVotes.dry++;
   a.sent.set(observation.id,new Map());
   a.firstAt.set(observation.id,t);
  }
  function move(){
   if(!config.mobile&&!isWater)return;
   for(const a of agents){
    // Only an agent that actually heard the rumor can choose to investigate.
    // Site coordinates come from its local received message, not global truth.
    const rumor=isWater&&a.seen.get(primaryId);
    if(rumor&&rumor.site&&a.isScout&&!a.inspected){
     const dx=rumor.site.x-a.x,dy=rumor.site.y-a.y;
     const distance=Math.hypot(dx,dy);
     if(distance>WATER_RADIUS){
      const speed=Math.min(8,distance);
      a.x+=dx/distance*speed;a.y+=dy/distance*speed;
     }
     inspectSite(a,rumor.site);
     continue;
    }
    if(!config.mobile)continue;
    a.x+=a.vx;a.y+=a.vy;
    if(a.x<12){a.x=12;a.vx=Math.abs(a.vx);}
    else if(a.x>W-12){a.x=W-12;a.vx=-Math.abs(a.vx);}
    if(a.y<12){a.y=12;a.vy=Math.abs(a.vy);}
    else if(a.y>H-12){a.y=H-12;a.vy=-Math.abs(a.vy);}
   }
  }
  function push(neighborhood){
   const c=config;
   for(const a of agents){
    const neighbors=neighborhood[a.id];
    if(!a.seen.size||!neighbors.length)continue;
    for(const report of a.seen.values()){
     if(report.hop>=c.maxHops)continue;
     const sent=a.sent.get(report.id);
     if(!sent)continue;
     if(c.protocol==='fanout'||c.protocol==='adaptive-gossip'){
      // Evidence moves quicker than rumors in adaptive mode. Rumors use one
      // contact/tick and a low independent chance; verified first-hand
      // inspection messages use up to four contacts per tick.
      const high=report.kind==='inspection';
      const capacity=c.protocol==='fanout'?c.fanout:high?4:1;
      const chance=c.protocol==='adaptive-gossip'?(high?1:report.kind==='rumor'?.35:.6):1;
      const offset=Math.floor(sample(c.seed,c.protocol,a.id,report.id,t)*neighbors.length);
      let accepted=0;
      for(let i=0;i<neighbors.length&&accepted<capacity;i++){
       const id=neighbors[(offset+i)%neighbors.length];
       if(sent.get(id)?.confirmed)continue;
       if(sample(c.seed,c.protocol,'select',a.id,id,report.id,t)>=chance)continue;
       if(offer(a,id,report))accepted++;
      }
     }else if(c.protocol==='gossip'){
      for(const id of neighbors){
       if(sample(c.seed,'gossip',a.id,id,report.id,t)<c.gossipChance){
        offer(a,id,report);
       }
      }
     }else if(c.protocol==='flood'){
      // Flooding is retained as a one-shot high-bandwidth baseline.
      for(const id of neighbors){
       if(sent.has(id))continue;
       if(data(a.id,id,report)){
        sent.set(id,{confirmed:true,attempts:1,nextAt:Infinity});
        if(config.mobile&&t>(a.firstAt.get(report.id)??t)+4)carrierContacts++;
       }
      }
     }
    }
   }
  }
  function sync(neighborhood,maxPeers=3,interval=4){
   if(t%interval!==0)return;
   for(const a of agents){
    if(!neighborhood[a.id].length)continue;
    const neighbors=neighborhood[a.id];
    const offset=Math.floor(sample(config.seed,'sync',t,a.id)*neighbors.length);
    const ids=[...a.seen.keys()];
    for(let i=0;i<Math.min(maxPeers,neighbors.length);i++){
     const peer=neighbors[(offset+i)%neighbors.length];
     transmit('digest',a.id,peer,{ids});
    }
   }
  }
  function step(){
   if(t>=config.maxTicks)return metrics();
   t++;
   const arrivals=pending.get(t)||[];
   pending.delete(t);
   // Deliver only packets scheduled earlier; newly generated responses arrive on future ticks.
   for(const packet of arrivals)receive(packet);
   move();
   if(config.mobile||isWater)lastTopology=null;
   const neighborhood=peers();
   if(config.protocol==='anti-entropy')sync(neighborhood);
   else{
    push(neighborhood);
    // Slow digest-based repair for adaptive peers; this also permits a
    // moving agent to store data and reconcile with newly encountered peers.
    if(config.protocol==='adaptive-gossip')sync(neighborhood,1,16);
   }
   const m=metrics();
   history.push({tick:t,coveragePct:m.coveragePct,primaryReached:m.primaryReached,
    corroborated:m.corroborated,conflicted:m.conflicted,transmissions:m.transmissions,duplicates:m.duplicates});
   return m;
  }
  function run(ticks=config.maxTicks){
   const limit=Math.min(config.maxTicks,t+Math.max(0,Math.trunc(ticks)));
   while(t<limit)step();
   return metrics();
  }
  function evaluation(){
   // Evaluator-only truth. Never consulted in peer verdicts or gossip.
   return {scenario:config.scenario,site:isWater?{...WATER_SITE}:null,
    waterExists:isWater?waterExists:null,fieldInspections:metrics().fieldInspections};
  }
  function snapshot(){
   return {label:'SIMULATION — not observed network activity',config:{...config},metrics:metrics(),
    evaluation:evaluation(),history:history.slice(),agents:agents.map(a=>({
     id:a.id,x:Math.round(a.x*10)/10,y:Math.round(a.y*10)/10,
     ...state(a.id)})),recent:trace.slice()};
  }
  const initial=metrics();
  history.push({tick:0,coveragePct:initial.coveragePct,primaryReached:initial.primaryReached,
   corroborated:initial.corroborated,conflicted:initial.conflicted,transmissions:0,duplicates:0});
  return Object.freeze({config,agents,history,trace,step,run,state,metrics,snapshot,evaluation,
   get tick(){return t;},get done(){return t>=config.maxTicks;}});
 }
 return Object.freeze({PROTOCOLS,createSimulation});
});
