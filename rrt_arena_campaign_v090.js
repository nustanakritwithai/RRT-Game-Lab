/* RRT ARENA V0.9 — Strategic map rules core (M1).
 * Pure functions: no DOM, timers or Math.random. State in, new state out.
 * - Formation tokens (Buddy/Group/Squad sizes) move on a sector graph, one order each per turn.
 * - WEGO: both factions submit orders, then a fixed-order resolution runs.
 * - Fog of war: every consumer (player UI and enemy AI) reads the world through viewFor().
 * - Battles are delegated to an injected resolver (coarse model now, the real engine later),
 *   so the decentralized battle AI is never replaced by a map-level shortcut in real play.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaCampaign=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const RULES=Object.freeze({maxUnits:4,supplyCap:12,startSupply:4,towerCost:3,injuryTurns:2,encircledInjuryTurns:3,
  intelExpiry:4,maxFort:2,vpLead:8,vpNeedsSupply:true,maxTurns:15,agentsPerFaction:12,hqFort:2,maxAgents:16,factoryEvery:3,battleRounds:3,hqSiegeTurns:4,contestedVpBlocked:true,fortDecay:true});
 const PRESET_BY_SIZE=Object.freeze({2:'buddy2',3:'buddy3',4:'group22',5:'group23',6:'group33',8:'squad2222',10:'squad2323',12:'squad3333'});
 const RADIO=Object.freeze([{loss:50,delay:0.6},{loss:20,delay:0.3},{loss:0,delay:0}]);
 const FACTIONS=Object.freeze(['player','enemy']);
 const other=f=>f==='player'?'enemy':'player';
 // Symmetric 11-sector map: three lanes (ruins / open+radio hill / lanes+depot) with diagonal flanks.
 const TEMPLATES=Object.freeze({frontlineBasin:Object.freeze({
  sectors:[
   ['P-HQ','ฐานผู้เล่น','ruins','player',2,{hq:'player'}],['P-L','ซากเมืองใต้','ruins','player',1],['P-C','ทุ่งโล่งใต้','open','player',1],['P-R','ถนนใต้','lanes','player',1],
   ['L','ซากเมืองกลาง ★','ruins',null,1,{victory:true}],['C','เนินวิทยุ ★','open',null,1,{victory:true,radioHill:true}],['R','คลังเสบียง ★','lanes',null,3,{victory:true,depot:true}],
   ['E-L','ซากเมืองเหนือ','ruins','enemy',1],['E-C','ทุ่งโล่งเหนือ','open','enemy',1],['E-R','ถนนเหนือ','lanes','enemy',1],['E-HQ','ฐานศัตรู','ruins','enemy',2,{hq:'enemy'}]],
  edges:[['P-HQ','P-L'],['P-HQ','P-C'],['P-HQ','P-R'],['P-L','L'],['P-L','C'],['P-C','C'],['P-R','C'],['P-R','R'],
   ['L','C'],['C','R'],
   ['E-HQ','E-L'],['E-HQ','E-C'],['E-HQ','E-R'],['E-L','L'],['E-L','C'],['E-C','C'],['E-R','C'],['E-R','R']]}),
  // FRACTURED FRONT campaign map (deliberately asymmetric; balance is checked by auto-play, not by mirroring).
  // player = BLUE Restoration Army (C1), enemy = RED Containment Force (C3).
  nova9:Object.freeze({
   sectors:[
    ['N1','📡 North Relay','open','player',1,{relay:true,sensor:true}],['N2','🏙️ Old Town ★','ruins',null,1,{victory:true}],['N3','🛡️ Red Outpost','lanes','enemy',1,{sensor:true,fort:1}],
    ['C1','🏢 BLUE HQ','ruins','player',2,{hq:'player'}],['C2','⚔️ Control A ★','open',null,1,{victory:true}],['C3','🏢 RED HQ','ruins','enemy',2,{hq:'enemy'}],
    ['S1','📦 Blue Depot','lanes','player',3,{depot:true}],['S2','⚡ Power Grid ★','lanes',null,2,{victory:true,power:true}],['S3','🏭 Factory','ruins','enemy',1,{factory:true}]],
   edges:[['N1','N2'],['N2','N3'],['C1','C2'],['C2','C3'],['S1','S2'],['S2','S3'],
    ['N1','C1'],['C1','S1'],['N2','C2'],['C2','S2'],['N3','C3'],['C3','S3']]})});

 const clone=x=>JSON.parse(JSON.stringify(x));
 function presetForSize(n){return PRESET_BY_SIZE[n]||null;}
 function presetFloor(n){for(let k=Math.min(12,n|0);k>=2;k--)if(PRESET_BY_SIZE[k])return k;return 0;}
 function hash32(...parts){let h=2166136261>>>0;for(const p of parts){const s=String(p);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}h^=0x9e3779b9;h=Math.imul(h,16777619)>>>0;}return h>>>0;}
 function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

 function create({seed=1,template='frontlineBasin',maxTurns=RULES.maxTurns,vpLead=RULES.vpLead,vpNeedsSupply=RULES.vpNeedsSupply}={}){
  const t=TEMPLATES[template];if(!t)throw new RangeError('Unknown map template '+template);
  const sectors=t.sectors.map(([id,name,terrain,owner,yieldPerTurn,special={}])=>({id,name,terrain,owner,yield:yieldPerTurn,
   fort:special.hq?RULES.hqFort:(special.fort|0),baseFort:special.hq?RULES.hqFort:(special.fort|0),tower:null,victory:!!special.victory,hq:special.hq||null,radioHill:!!special.radioHill,depot:!!special.depot,
   relay:!!special.relay,power:!!special.power,factory:!!special.factory,sensor:!!special.sensor}));
  const roster=[],units=[],factions={};
  for(const f of FACTIONS){
   const prefix=f==='player'?'P':'E',hq=sectors.find(s=>s.hq===f).id;
   for(let i=1;i<=RULES.agentsPerFaction;i++)roster.push({id:prefix+i,faction:f,injuredTurns:0});
   for(let u=0;u<3;u++)units.push({id:prefix+'-U'+(u+1),faction:f,sector:hq,agents:[1,2,3,4].map(k=>prefix+(u*4+k))});
   factions[f]={supply:RULES.startSupply,vp:0,intel:{},siege:{},reserve:[],nextUnit:4,nextAgent:RULES.agentsPerFaction+1};
  }
  return {version:1,seed:seed>>>0,turn:0,maxTurns,vpLead,vpNeedsSupply,template,sectors,edges:t.edges.map(e=>e.slice()),units,roster,factions,winner:null,log:[]};
 }
 const sectorOf=(s,id)=>s.sectors.find(x=>x.id===id);
 function neighbors(s,id){const out=[];for(const [a,b] of s.edges){if(a===id)out.push(b);else if(b===id)out.push(a);}return out;}
 function connectedSectors(s,f){
  const hq=s.sectors.find(x=>x.hq===f);const seen=new Set();
  if(!hq||hq.owner!==f)return seen;
  const queue=[hq.id];seen.add(hq.id);
  while(queue.length){const id=queue.shift();for(const n of neighbors(s,id))if(!seen.has(n)&&sectorOf(s,n).owner===f){seen.add(n);queue.push(n);}}
  return seen;
 }
 /** A Relay/Factory works only while linked to an owned Power Grid through the faction's own sectors. */
 function powered(s,f,id){
  const grid=s.sectors.find(x=>x.power&&x.owner===f);if(!grid)return false;
  const seen=new Set([grid.id]),q=[grid.id];
  while(q.length){const c=q.shift();if(c===id)return true;for(const n of neighbors(s,c))if(!seen.has(n)&&sectorOf(s,n).owner===f){seen.add(n);q.push(n);}}
  return false;
 }
 function radioLevel(s,f,id){
  let level=0;const sec=sectorOf(s,id);if(!sec)return 0;
  // Powered relay: strong radio in its sector and next door; unpowered relay: weak local radio only.
  for(const r of s.sectors.filter(x=>x.relay&&x.owner===f)){
   if(powered(s,f,r.id)&&(r.id===id||neighbors(s,r.id).includes(id)))level=2;
   else if(r.id===id)level=Math.max(level,1);
  }
  if(sec.tower===f)level=2;
  else if(neighbors(s,id).some(n=>sectorOf(s,n).tower===f))level=Math.max(level,1);
  const hill=s.sectors.find(x=>x.radioHill&&x.owner===f);
  if(hill&&(hill.id===id||neighbors(s,hill.id).includes(id)))level=Math.min(2,level+1);
  return level;
 }
 function radioSettings(level){return {...RADIO[Math.max(0,Math.min(2,level|0))]};}

 /** The ONLY way to read the world for a faction. Ownership of sectors is public; fortification,
   * towers and enemy units are known only from own presence, adjacent sightings (units only),
   * reconnaissance or battle snapshots — snapshots age and expire. */
 function viewFor(s,f){
  const own=s.units.filter(u=>u.faction===f);
  const present=new Set(own.map(u=>u.sector));
  const nearby=new Set(present);for(const id of present)for(const n of neighbors(s,id))nearby.add(n);
  // Owned sensor stations (relay / outpost) watch neighbouring sectors for unit movement.
  for(const x of s.sectors)if(x.sensor&&x.owner===f){nearby.add(x.id);for(const n of neighbors(s,x.id))nearby.add(n);}
  const intel=s.factions[f].intel;
  const sectors=s.sectors.map(x=>{
   const base={id:x.id,name:x.name,terrain:x.terrain,owner:x.owner,victory:x.victory,hq:x.hq,radioHill:x.radioHill,depot:x.depot,yield:x.yield,
    relay:x.relay,power:x.power,factory:x.factory,sensor:x.sensor,powered:x.owner===f?powered(s,f,x.id):null,
    radio:radioLevel(s,f,x.id)};
   if(x.owner===f||present.has(x.id))return {...base,fort:x.fort,tower:x.tower,intelAge:0,confidence:1};
   const snap=intel[x.id],age=snap?s.turn-snap.turn:null;
   if(snap&&age<RULES.intelExpiry)return {...base,fort:snap.fort,tower:snap.tower,intelAge:age,confidence:1-age/RULES.intelExpiry};
   return {...base,fort:null,tower:null,intelAge:null,confidence:0};
  });
  const enemyUnits=s.units.filter(u=>u.faction!==f&&nearby.has(u.sector)).map(u=>({sector:u.sector,size:u.agents.length}));
  const lastSeenUnits=[];
  for(const [id,snap] of Object.entries(intel)){const age=s.turn-snap.turn;if(age>0&&age<RULES.intelExpiry&&!nearby.has(id))for(const size of snap.units)lastSeenUnits.push({sector:id,size,age});}
  return {faction:f,turn:s.turn,maxTurns:s.maxTurns,winner:s.winner,supply:s.factions[f].supply,vp:s.factions[f].vp,
   opponentVp:s.factions[other(f)].vp,vpLead:s.vpLead,edges:s.edges.map(e=>e.slice()),sectors,
   ownUnits:own.map(u=>({id:u.id,faction:f,sector:u.sector,size:u.agents.length,agents:u.agents.slice()})),
   enemyUnits,lastSeenUnits,reserve:s.factions[f].reserve.slice(),
   injured:s.roster.filter(a=>a.faction===f&&a.injuredTurns>0).map(a=>({id:a.id,turns:a.injuredTurns}))};
 }

 function validateOrder(s,f,o){
  const u=s.units.find(x=>x.id===o?.unit);
  if(!u)return {ok:false,reason:'ไม่มีหน่วยนี้'};
  if(u.faction!==f)return {ok:false,reason:'ไม่ใช่หน่วยของฝ่ายเรา'};
  switch(o.type){
   case 'move':return neighbors(s,u.sector).includes(o.to)?{ok:true}:{ok:false,reason:'ไปได้เฉพาะเขตที่ติดกัน'};
   case 'hold':case 'recon':return {ok:true};
   case 'tower':{const sec=sectorOf(s,u.sector);
    if(sec.owner!==f)return {ok:false,reason:'ต้องอยู่ในเขตของฝ่ายเรา'};
    if(sec.tower)return {ok:false,reason:'มีเสาวิทยุแล้ว'};
    if(s.factions[f].supply<RULES.towerCost)return {ok:false,reason:'เสบียงไม่พอ'};return {ok:true};}
   case 'merge':{const w=s.units.find(x=>x.id===o.with);
    if(!w||w.faction!==f||w.id===u.id||w.sector!==u.sector)return {ok:false,reason:'ต้องรวมกับหน่วยของเราในเขตเดียวกัน'};
    return presetForSize(u.agents.length+w.agents.length)?{ok:true}:{ok:false,reason:'ขนาดรวมไม่ตรงรูปขบวนที่มี'};}
   case 'split':{const sizes=o.sizes||[];
    if(sizes.length!==2||sizes[0]+sizes[1]!==u.agents.length||!presetForSize(sizes[0])||!presetForSize(sizes[1]))return {ok:false,reason:'แบ่งได้เฉพาะขนาดรูปขบวนที่มี'};
    if(s.units.filter(x=>x.faction===f).length>=RULES.maxUnits)return {ok:false,reason:'หน่วยเต็มแล้ว'};return {ok:true};}
   default:return {ok:false,reason:'คำสั่งไม่รู้จัก'};
  }
 }
 function validateOrders(s,f,orders){
  const used=new Set();let units=s.units.filter(x=>x.faction===f).length;
  for(const o of orders||[]){
   const r=validateOrder(s,f,o);if(!r.ok)return {ok:false,reason:r.reason,order:o};
   if(o.type==='split'&&++units>RULES.maxUnits)return {ok:false,reason:'หน่วยเต็มแล้ว',order:o};
   for(const id of [o.unit,o.type==='merge'?o.with:null].filter(Boolean)){if(used.has(id))return {ok:false,reason:'หนึ่งหน่วยสั่งได้หนึ่งคำสั่งต่อตา',order:o};used.add(id);}
  }
  return {ok:true};
 }

 function snapshot(s,id){const x=sectorOf(s,id);return {turn:null,owner:x.owner,fort:x.fort,tower:x.tower,
  units:s.units.filter(u=>u.sector===id).map(u=>u.agents.length)};}
 function injure(s,agents,turns){for(const id of agents){const a=s.roster.find(r=>r.id===id);if(a)a.injuredTurns=Math.max(a.injuredTurns,turns);}}
 function removeCasualties(s,unitIds,count){
  const hurt=[];
  for(const uid of unitIds){const u=s.units.find(x=>x.id===uid);if(!u)continue;
   while(count>0&&u.agents.length){hurt.push(u.agents.pop());count--;}}
  return hurt;
 }
 function retreatTarget(s,f,from,origin){
  if(origin&&origin!==from){const o=sectorOf(s,origin);if(!s.units.some(u=>u.sector===origin&&u.faction!==f)&&(o.owner===f||o.owner===null))return origin;}
  const hq=s.sectors.find(x=>x.hq===f)?.id;
  const dist=id=>{const seen=new Map([[hq,0]]);const q=[hq];while(q.length){const c=q.shift();for(const n of neighbors(s,c))if(!seen.has(n)){seen.set(n,seen.get(c)+1);q.push(n);}}return seen.get(id)??99;};
  const options=neighbors(s,from).filter(id=>sectorOf(s,id).owner===f&&!s.units.some(u=>u.sector===id&&u.faction!==f)).sort((a,b)=>dist(a)-dist(b)||a.localeCompare(b));
  return options[0]||null;
 }

 /** One WEGO turn. resolver(spec) -> {winner:'attacker'|'defender'|'draw',casualties:{attacker,defender}} */
 function resolveTurn(input,orders={},resolver=coarseBattle){
  const s=clone(input);const events=[],battles=[];
  if(s.winner)return {state:s,events,battles};
  const accepted={player:[],enemy:[]};
  for(const f of FACTIONS){const used=new Set();
   for(const o of orders[f]||[]){const r=validateOrder(s,f,o);const ids=[o.unit,o.type==='merge'?o.with:null].filter(Boolean);
    if(!r.ok||ids.some(id=>used.has(id))){events.push({type:'invalid_order',faction:f,order:o,reason:r.reason||'ซ้ำ'});continue;}
    ids.forEach(id=>used.add(id));accepted[f].push(o);}}
  const orderOf=id=>{for(const f of FACTIONS)for(const o of accepted[f])if(o.unit===id)return o;return null;};
  // 1. Reconnaissance: true state at the start of the turn.
  const pendingIntel=[];
  for(const f of FACTIONS)for(const o of accepted[f])if(o.type==='recon'){const u=s.units.find(x=>x.id===o.unit);
   for(const id of neighbors(s,u.sector))pendingIntel.push([f,id,snapshot(s,id)]);events.push({type:'recon',faction:f,unit:u.id,sector:u.sector});}
  // 2. Re-organisation.
  for(const f of FACTIONS)for(const o of accepted[f]){
   if(o.type==='merge'){const a=s.units.find(x=>x.id===o.unit),b=s.units.find(x=>x.id===o.with);a.agents.push(...b.agents);s.units=s.units.filter(x=>x!==b);events.push({type:'merge',faction:f,unit:a.id});}
   if(o.type==='split'){const a=s.units.find(x=>x.id===o.unit);
    // Re-check the unit cap at application time: several splits in one turn must not exceed it.
    if(s.units.filter(x=>x.faction===f).length>=RULES.maxUnits){events.push({type:'invalid_order',faction:f,order:o,reason:'หน่วยเต็มแล้ว'});continue;}
    const id=(f==='player'?'P':'E')+'-U'+(s.factions[f].nextUnit++);
    s.units.push({id,faction:f,sector:a.sector,agents:a.agents.splice(o.sizes[0])});events.push({type:'split',faction:f,unit:a.id,into:id});}
  }
  // 3. Movement: opposing units swapping along one edge meet in the open and both stay put.
  const origin=new Map(s.units.map(u=>[u.id,u.sector]));
  const moving=s.units.filter(u=>orderOf(u.id)?.type==='move');
  const bounced=new Set();const edgeGroups=new Map();
  for(const u of moving){const to=orderOf(u.id).to;
   const rev=moving.filter(v=>v.faction!==u.faction&&v.sector===to&&orderOf(v.id).to===u.sector);
   if(rev.length){const key=[u.sector,to].sort().join('|');if(!edgeGroups.has(key))edgeGroups.set(key,new Set());edgeGroups.get(key).add(u.id);rev.forEach(v=>edgeGroups.get(key).add(v.id));}}
  for(const [key,ids] of edgeGroups){
   const side=f=>[...ids].map(id=>s.units.find(u=>u.id===id)).filter(u=>u.faction===f);
   const spec=battleSpec(s,'meeting',key,'open',0,side('player'),side('enemy'));
   const result=runBattle(s,spec,resolver,events,battles);
   for(const id of ids)bounced.add(id);
   void result;
  }
  for(const u of moving)if(!bounced.has(u.id)&&s.units.includes(u))u.sector=orderOf(u.id).to;
  // 4. Sector battles: units present at the start defend; owner's fort counts only for an owning defender.
  for(const sec of s.sectors){
   const here=f=>s.units.filter(u=>u.sector===sec.id&&u.faction===f&&u.agents.length);
   if(!here('player').length||!here('enemy').length)continue;
   const stayed=f=>here(f).some(u=>origin.get(u.id)===sec.id);
   let defF=stayed('player')&&!stayed('enemy')?'player':stayed('enemy')&&!stayed('player')?'enemy':(sec.owner||'enemy');
   const attF=other(defF),kind=stayed(defF)?'assault':'contested';
   // Army scale: one battle fields at most a Platoon (12) per side; extra agents fight further rounds.
   let result,round=0;
   while(true){
    const total=f=>here(f).reduce((n,u)=>n+u.agents.length,0),before={[attF]:total(attF),[defF]:total(defF)};
    const spec=battleSpec(s,kind,sec.id,sec.terrain,sec.owner===defF?sec.fort:0,here(attF),here(defF));spec.round=round;
    if(round)spec.seed=hash32(spec.seed,round);
    result=runBattle(s,spec,resolver,events,battles);
    const lf=result.winner==='attacker'?defF:attF,loserFought=spec[result.winner==='attacker'?'defender':'attacker'].size;
    // Continue only while the beaten side still has fresh reserves that did not fight this round.
    if(result.winner==='draw'||++round>=RULES.battleRounds||total(lf)<2||before[lf]<=loserFought)break;
    events.push({type:'battle_round',sector:sec.id,round});
   }
   const loserF=result.winner==='attacker'?defF:attF;
   if(result.winner==='draw'){retreatUnits(s,here(attF),attF,sec.id,origin,events);}
   else retreatUnits(s,here(loserF),loserF,sec.id,origin,events);
  }
  // Disband empty / single-agent units into the faction reserve.
  for(const u of s.units.slice())if(u.agents.length<2){s.factions[u.faction].reserve.push(...u.agents);s.units=s.units.filter(x=>x!==u);}
  // 5. Capture (siege), dig-in and towers.
  for(const f of FACTIONS){
   const siege={};
   for(const u of s.units.filter(x=>x.faction===f)){const sec=sectorOf(s,u.sector);
    if(sec.owner===f||s.units.some(v=>v.sector===sec.id&&v.faction!==f))continue;
    siege[sec.id]=(s.factions[f].siege[sec.id]||0)+(siege[sec.id]?0:1);
    // An HQ needs a long uncontested siege; other sectors need fort+1 turns.
    if(siege[sec.id]>(sec.hq?Math.max(sec.fort,RULES.hqSiegeTurns-1):sec.fort)){events.push({type:'capture',faction:f,sector:sec.id,from:sec.owner});sec.owner=f;sec.fort=0;if(sec.tower)sec.tower=f;delete siege[sec.id];}}
   s.factions[f].siege=siege;
  }
  for(const f of FACTIONS)for(const o of accepted[f]){const u=s.units.find(x=>x.id===o.unit);if(!u)continue;const sec=sectorOf(s,u.sector);
   if(o.type==='hold'&&sec.owner===f&&!bounced.has(u.id)){sec.fort=Math.min(RULES.maxFort,sec.fort+1);}
   if(o.type==='tower'&&sec.owner===f&&!sec.tower&&s.factions[f].supply>=RULES.towerCost){sec.tower=f;s.factions[f].supply-=RULES.towerCost;events.push({type:'tower',faction:f,sector:sec.id});}}
  // 6. Upkeep.
  s.turn++;
  for(const [f,id,snap] of pendingIntel){snap.turn=s.turn;s.factions[f].intel[id]=snap;}
  for(const b of battles)for(const f of FACTIONS)if(b.sector&&!b.sector.includes('|')){const snap=snapshot(s,b.sector);snap.turn=s.turn;s.factions[f].intel[b.sector]=snap;}
  for(const f of FACTIONS){const fac=s.factions[f];const connected=connectedSectors(s,f);
   fac.supply=Math.min(RULES.supplyCap,fac.supply+s.sectors.filter(x=>x.owner===f&&connected.has(x.id)).reduce((n,x)=>n+x.yield,0));
   // Victory sectors only score while linked to HQ by the faction's own supply line (overextension risk).
   // A victory sector with an enemy unit inside it (under attack / siege) scores for nobody.
   fac.vp+=s.sectors.filter(x=>x.victory&&x.owner===f&&(!s.vpNeedsSupply||connected.has(x.id))&&
    !(RULES.contestedVpBlocked&&s.units.some(u=>u.sector===x.id&&u.faction!==f))).length;}
  // Unattended fortifications decay one level per turn down to the sector's built-in base.
  if(RULES.fortDecay)for(const x of s.sectors){const base=x.baseFort|0;
   if(x.fort>base&&x.owner&&!s.units.some(u=>u.sector===x.id&&u.faction===x.owner))x.fort--;}
  for(const a of s.roster)if(a.injuredTurns>0&&--a.injuredTurns===0)s.factions[a.faction].reserve.push(a.id);
  // A powered Factory produces one fresh agent (no experience) every few turns, up to the roster cap.
  if(s.turn%RULES.factoryEvery===0)for(const f of FACTIONS){const fac=s.factions[f];
   if(s.sectors.some(x=>x.factory&&x.owner===f&&powered(s,f,x.id))&&s.roster.filter(a=>a.faction===f).length<RULES.maxAgents){
    const id=(f==='player'?'P':'E')+(fac.nextAgent++);s.roster.push({id,faction:f,injuredTurns:0,fresh:true});fac.reserve.push(id);events.push({type:'produced',faction:f,agent:id});}}
  for(const f of FACTIONS){const fac=s.factions[f],hq=s.sectors.find(x=>x.hq===f);
   const n=presetFloor(fac.reserve.length);
   if(n&&hq.owner===f&&s.units.filter(u=>u.faction===f).length<RULES.maxUnits){
    const id=(f==='player'?'P':'E')+'-U'+(fac.nextUnit++);s.units.push({id,faction:f,sector:hq.id,agents:fac.reserve.splice(0,n)});events.push({type:'muster',faction:f,unit:id});}}
  const v=checkVictory(s);if(v.winner){s.winner=v.winner;events.push({type:'victory',...v});}
  s.log.push({turn:s.turn,events:events.map(e=>e.type)});
  return {state:s,events,battles};
 }
 function battleSpec(s,kind,sector,terrain,fort,attUnits,defUnits){
  const side=(units,f)=>{const agents=units.flatMap(u=>u.agents);const size=presetFloor(agents.length);
   return {faction:f,size,preset:presetForSize(size),units:units.map(u=>u.id),agents:agents.slice(0,size),
    radio:sector.includes('|')?0:radioLevel(s,f,sector)};};
  const att=side(attUnits,attUnits[0]?.faction||'player'),def=side(defUnits,defUnits[0]?.faction||'enemy');
  return {kind,sector,terrain,fort,attacker:att,defender:def,seed:hash32(s.seed,s.turn,sector,kind)};
 }
 function runBattle(s,spec,resolver,events,battles){
  if(!spec.attacker.size||!spec.defender.size){const r={winner:spec.attacker.size?'attacker':'defender',casualties:{attacker:0,defender:0}};battles.push({...spec,result:r});return r;}
  const r=resolver(spec);
  const att=Math.max(0,Math.min(spec.attacker.size,r.casualties?.attacker|0)),def=Math.max(0,Math.min(spec.defender.size,r.casualties?.defender|0));
  injure(s,removeCasualties(s,spec.attacker.units,att),RULES.injuryTurns);
  injure(s,removeCasualties(s,spec.defender.units,def),RULES.injuryTurns);
  const result={winner:['attacker','defender','draw'].includes(r.winner)?r.winner:'draw',casualties:{attacker:att,defender:def}};
  battles.push({...spec,result});events.push({type:'battle',kind:spec.kind,sector:spec.sector,winner:result.winner});
  return result;
 }
 function retreatUnits(s,units,f,from,origin,events){
  for(const u of units){if(!s.units.includes(u))continue;
   const to=retreatTarget(s,f,from,origin.get(u.id));
   if(to){u.sector=to;events.push({type:'retreat',faction:f,unit:u.id,to});}
   else{injure(s,u.agents,RULES.encircledInjuryTurns);s.units=s.units.filter(x=>x!==u);events.push({type:'encircled',faction:f,unit:u.id,sector:from});}}
 }
 function checkVictory(s){
  for(const f of FACTIONS){const enemyHq=s.sectors.find(x=>x.hq===other(f));if(enemyHq&&enemyHq.owner===f)return {winner:f,reason:'hq_captured'};}
  const vp=f=>s.factions[f].vp;
  // Tug-of-war: points swing with who holds the victory sectors each turn; a clear lead wins.
  const lead=vp('player')-vp('enemy');
  if(Math.abs(lead)>=s.vpLead)return {winner:lead>0?'player':'enemy',reason:'victory_points'};
  if(s.turn>=s.maxTurns){
   if(vp('player')!==vp('enemy'))return {winner:vp('player')>vp('enemy')?'player':'enemy',reason:'turn_limit_vp'};
   const n=f=>s.sectors.filter(x=>x.owner===f).length;
   return {winner:n('player')>n('enemy')?'player':n('enemy')>n('player')?'enemy':'draw',reason:'turn_limit_sectors'};
  }
  return {winner:null};
 }
 /** Coarse outcome models for fast map-level simulation and for battles the player does not watch.
   * Both are fitted to real team battles; results from them are labelled as abstract and never written
   * into any Agent's learning history. */
 const COARSE=Object.freeze({
  terrain:Object.freeze({ruins:{k:9.5,c:.43,e:2},lanes:{k:9.5,c:.40,e:2},open:{k:13,c:.32,e:3}}),
  // Assault = defender holds its sector (control zone at its anchor). Fitted to 648 side-swapped battles
  // (benchmarks/v090_map/m0_fort_calibration.json): 4v4 defender ~80%, 5v4 ~74%, 6v4 attacker 69% -> 36-39%
  // with a fort; forts barely change close fights (4v4, 5v4), levels 1 and 2 are statistically
  // indistinguishable so far; battles end on zone points,
  // so both sides lose only ~1-3 agents.
  assault:Object.freeze({base:1.45,k:8,fort:Object.freeze([0,1.0,1.1]),loserShare:.4,winnerShare:.15}),
  // Contested = both sides move into the same sector: a neutral control-zone battle, not a fight to the death.
  // Fitted to 360 side-swapped battles (benchmarks/v090_map/m4_contested_control_calibration.json): ruins let the
  // smaller side hold on (4v6 25%, 8v12 45%), lanes and open favour numbers; even 12v12 ends with the loser
  // keeping most of its agents. Open terrain: no underdog win in 60 battles, so k is a bounded stand-in.
  // Losses per side grow as c*size^g (cover in ruins keeps them almost flat); the loser takes `lf` of that, the winner
  // `wf`, shrinking further as (loser/winner)^e when the winner outnumbers.
  control:Object.freeze({ruins:{k:2,c:.95,g:.17,lf:1.38,wf:.62,e:1.35},lanes:{k:8.75,c:.575,g:.86,lf:1.18,wf:.82,e:2.2},
   open:{k:20,c:.42,g:.98,lf:1.4,wf:.6,e:5.3}}),
  calibration:'m0_calibration.json (meeting) + m0_fort_calibration.json (assault with forts) + m4_contested_control_calibration.json (contested)'});
 function coarseBattle(spec){
  const r=rng(spec.seed>>>0);const a=Math.max(1,spec.attacker.size),d=Math.max(1,spec.defender.size);
  if(spec.kind==='assault'){
   const A=COARSE.assault,edge=a>=d?A.k*(a/d-1)**2:-A.k*(d/a-1)**2;
   // Walls only pay off once the attacker can actually push in: the fort term grows with the attacker's edge.
   const fortTerm=A.fort[Math.max(0,Math.min(2,spec.fort|0))]*Math.min(1,Math.max(0,edge)/2);
   const p=1/(1+Math.exp(-(edge-A.base-fortTerm)));
   const attackerWins=r()<p,loser=attackerWins?d:a,winner=attackerWins?a:d;
   const loserCas=Math.min(loser,Math.max(1,Math.round(loser*A.loserShare*(.6+.8*r()))));
   const winnerCas=Math.min(winner-1,Math.round(winner*A.winnerShare*(.5+r())));
   return {winner:attackerWins?'attacker':'defender',casualties:attackerWins?{attacker:winnerCas,defender:loserCas}:{attacker:loserCas,defender:winnerCas},p};
  }
  if(spec.kind==='contested'){
   const T=COARSE.control[spec.terrain]||COARSE.control.open,p=1/(1+Math.exp(-T.k*Math.log(a/d)));
   const attackerWins=r()<p,loser=attackerWins?d:a,winner=attackerWins?a:d,base=n=>T.c*Math.pow(n,T.g);
   const loserCas=Math.min(loser,Math.max(1,Math.round(base(loser)*T.lf*(.6+.8*r()))));
   const winnerCas=Math.min(winner-1,Math.round(base(winner)*T.wf*Math.pow(Math.min(1,loser/winner),T.e)*(.5+r())));
   return {winner:attackerWins?'attacker':'defender',casualties:attackerWins?{attacker:winnerCas,defender:loserCas}:{attacker:loserCas,defender:winnerCas},p};
  }
  // Meeting battles (opposing forces crossing on one edge) are fights to elimination (m0_calibration.json): one extra agent wins
  // ~90-100%, open terrain is the most decisive, the loser is eliminated.
  const T=COARSE.terrain[spec.terrain]||COARSE.terrain.open;
  const p=1/(1+Math.exp(-(T.k*Math.log(a/d))));
  const attackerWins=r()<p;
  const loser=attackerWins?d:a,winner=attackerWins?a:d;
  const expected=winner*T.c*Math.pow(Math.min(1,loser/winner),T.e);
  const winnerCas=Math.max(0,Math.min(winner-1,Math.round(expected*(.6+.8*r()))));
  return {winner:attackerWins?'attacker':'defender',casualties:attackerWins?{attacker:winnerCas,defender:loser}:{attacker:loser,defender:winnerCas},p};
 }
 return Object.freeze({RULES,TEMPLATES,PRESET_BY_SIZE,presetForSize,presetFloor,create,neighbors,connectedSectors,powered,radioLevel,radioSettings,
  viewFor,validateOrder,validateOrders,resolveTurn,checkVictory,coarseBattle,COARSE});
});
