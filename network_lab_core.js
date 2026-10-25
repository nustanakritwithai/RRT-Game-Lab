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
 const PROTOCOLS=Object.freeze(['flood','gossip','fanout','anti-entropy']);
 const W=1000,H=620;
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
   scenario:['single','witnesses','conflict'].includes(c.scenario)?c.scenario:'single',
   seed:Math.trunc(clamp(c.seed,1,2147483647,311)),
   range:clamp(c.range,20,1500,108),
   loss:clamp(c.loss,0,1,0.1),
   latency:Math.trunc(clamp(c.latency,1,12,2)),
   mobile:!!c.mobile,
   gossipChance:clamp(c.gossipChance,0,1,0.52),
   fanout:Math.trunc(clamp(c.fanout,1,20,3)),
   maxHops:Math.trunc(clamp(c.maxHops,0,48,16)),
   maxTicks:Math.trunc(clamp(c.maxTicks,1,400,160)),
   maxTransmissions:Math.trunc(clamp(c.maxTransmissions,1,300000,150000))
  });
 }
 function createSimulation(input){
  const config=normalized(input);
  const random=rng(config.seed);
  const agents=Array.from({length:config.count},(_,id)=>{
   const ang=random()*Math.PI*2;
   return {id,x:20+random()*(W-40),y:20+random()*(H-40),
    vx:Math.cos(ang)*(1+random()*2.5),vy:Math.sin(ang)*(1+random()*2.5),
    seen:new Map(),reports:new Map(),sent:new Map(),firstAt:new Map()};
  });
  const pending=new Map();
  const trace=[];
  const history=[];
  let t=0;
  let attempts=0,delivered=0,lost=0,duplicates=0,rejected=0,dataPackets=0,controlPackets=0,bytes=0;
  let lastTopology=null;
  const primaryId='r0';
  // Reports are authored by independent simulated witnesses, not by relays.
  function seed(origin,value){
   if(origin<0||origin>=agents.length||agents[origin].reports.has(origin))return;
   const a=agents[origin],report=Object.freeze({id:'r'+origin,origin,value,hop:0});
   a.seen.set(report.id,report);
   a.reports.set(origin,value);
   a.sent.set(report.id,new Set());
   a.firstAt.set(report.id,0);
  }
  seed(0,'A');
  if(config.scenario!=='single'){
   for(const id of new Set([Math.floor(config.count*.31),Math.floor(config.count*.69)]))seed(id,'A');
  }
  if(config.scenario==='conflict'){
   for(const id of new Set([config.count-1,config.count-2]))if(id>0&& !agents[id].reports.has(id))seed(id,'B');
  }
  function verdict(a){
   const n=a.reports.size;
   if(n<2)return {status:'UNKNOWN',independentSources:n,variant:n?[...a.reports.values()][0]:null};
   const variants=new Set(a.reports.values());
   if(variants.size>1)return {status:'CONFLICT',independentSources:n,variant:null};
   return {status:'CORROBORATED',independentSources:n,variant:[...variants][0]};
  }
  function state(id){
   if(!Number.isInteger(id)||id<0||id>=agents.length)return null;
   const a=agents[id],v=verdict(a);
   return {id,status:v.status,independentSources:v.independentSources,
    variant:v.variant,hasPrimary:a.seen.has(primaryId),reports:a.reports.size};
  }
  function metrics(){
   let primaryReached=0,unknown=0,conflicted=0,corroborated=0,wrongCorroborated=0,anyReached=0;
   for(const a of agents){
    if(a.seen.has(primaryId))primaryReached++;
    if(a.seen.size)anyReached++;
    const v=verdict(a);
    if(v.status==='UNKNOWN')unknown++;
    else if(v.status==='CONFLICT')conflicted++;
    else {corroborated++;if(v.variant!=='A')wrongCorroborated++;}
   }
   return {tick:t,count:config.count,primaryReached,anyReached,
    coveragePct:Math.round(primaryReached/config.count*1000)/10,
    unknown,conflicted,corroborated,wrongCorroborated,
    transmissions:attempts,delivered,lost,duplicates,rejected,
    dataPackets,controlPackets,estimatedBytes:bytes,
    queued:[...pending.values()].reduce((n,arr)=>n+arr.length,0),
    budgetExhausted:attempts>=config.maxTransmissions};
  }
  function peers(){
   if(lastTopology&&!config.mobile)return lastTopology;
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
   attempts++;
   const size=kind==='data'?96:24+8*(payload.ids?payload.ids.length:0);
   bytes+=size;
   if(kind==='data')dataPackets++;else controlPackets++;
   const key=kind+':'+(payload.report?payload.report.id:(payload.ids||[]).join(','));
   if(sample(config.seed,'radio',kind,from,to,key,t,attempts)<config.loss){lost++;return true;}
   const due=t+config.latency;
   if(!pending.has(due))pending.set(due,[]);
   pending.get(due).push({kind,from,to,payload,due});
   return true;
  }
  function data(from,to,report){
   if(!report||report.hop>=config.maxHops)return false;
   return transmit('data',from,to,{report:{id:report.id,origin:report.origin,value:report.value,hop:report.hop+1}});
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
       r.id!=='r'+r.origin||!['A','B'].includes(r.value)||r.hop>config.maxHops){rejected++;return;}
    if(a.seen.has(r.id)){duplicates++;return;}
    // Preserve first received claim from one origin; independent votes are by origin only.
    if(a.reports.has(r.origin)){duplicates++;return;}
    const item=Object.freeze({id:r.id,origin:r.origin,value:r.value,hop:r.hop});
    a.seen.set(item.id,item);
    a.reports.set(item.origin,item.value);
    a.sent.set(item.id,new Set());
    a.firstAt.set(item.id,t);
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
  function move(){
   if(!config.mobile)return;
   for(const a of agents){
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
     if(c.protocol==='fanout'){
      if(t-a.firstAt.get(report.id)>4)continue;
      const offset=Math.floor(sample(c.seed,'fanout',a.id,report.id,t)*neighbors.length);
      let selected=0;
      for(let i=0;i<neighbors.length&&selected<c.fanout;i++){
       const id=neighbors[(offset+i)%neighbors.length];
       if(sent.has(id))continue;
       sent.add(id);data(a.id,id,report);selected++;
      }
     }else{
      for(const id of neighbors){
       if(sent.has(id))continue;
       sent.add(id);
       if(c.protocol==='flood'||sample(c.seed,'gossip',a.id,id,report.id)<c.gossipChance)
        data(a.id,id,report);
      }
     }
    }
   }
  }
  function sync(neighborhood){
   if(t%4!==0)return;
   for(const a of agents){
    if(!neighborhood[a.id].length)continue;
    const neighbors=neighborhood[a.id];
    const offset=Math.floor(sample(config.seed,'sync',t,a.id)*neighbors.length);
    const ids=[...a.seen.keys()];
    for(let i=0;i<Math.min(3,neighbors.length);i++){
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
   if(config.mobile)lastTopology=null;
   const neighborhood=peers();
   if(config.protocol==='anti-entropy')sync(neighborhood);else push(neighborhood);
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
  function snapshot(){
   return {label:'SIMULATION — not observed network activity',config:{...config},metrics:metrics(),
    history:history.slice(),agents:agents.map(a=>({
     id:a.id,x:Math.round(a.x*10)/10,y:Math.round(a.y*10)/10,
     ...state(a.id)})),recent:trace.slice()};
  }
  const initial=metrics();
  history.push({tick:0,coveragePct:initial.coveragePct,primaryReached:initial.primaryReached,
   corroborated:initial.corroborated,conflicted:initial.conflicted,transmissions:0,duplicates:0});
  return Object.freeze({config,agents,history,trace,step,run,state,metrics,snapshot,
   get tick(){return t;},get done(){return t>=config.maxTicks;}});
 }
 return Object.freeze({PROTOCOLS,createSimulation});
});
