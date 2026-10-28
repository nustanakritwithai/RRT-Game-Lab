'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('./rrt_arena_campaign_v090.js');
const fresh=(o={})=>C.create({seed:7,...o});
const unitsOf=(s,f)=>s.units.filter(u=>u.faction===f);
const noBattles=()=>{throw new Error('no battle expected');};
const win=side=>spec=>({winner:side,casualties:{attacker:side==='attacker'?0:1,defender:side==='defender'?0:1}});

// --- Map template and setup ---
test('Frontline Basin has 11 sectors, symmetric, 3 victory sectors in the middle row',()=>{
 const s=fresh();assert.equal(s.sectors.length,11);
 assert.deepEqual(s.sectors.filter(x=>x.victory).map(x=>x.id).sort(),['C','L','R']);
 for(const [a,b] of s.edges){assert.ok(s.sectors.find(x=>x.id===a)&&s.sectors.find(x=>x.id===b));}
 const deg=id=>s.edges.filter(e=>e.includes(id)).length;
 assert.equal(deg('P-HQ'),deg('E-HQ'));assert.equal(deg('P-L'),deg('E-L'));assert.equal(deg('P-R'),deg('E-R'));
});
test('both factions start with identical forces, supply and an owned HQ',()=>{
 const s=fresh();
 const size=f=>unitsOf(s,f).map(u=>u.agents.length).sort().join(',');
 assert.equal(size('player'),size('enemy'));assert.equal(s.factions.player.supply,s.factions.enemy.supply);
 assert.equal(s.sectors.find(x=>x.id==='P-HQ').owner,'player');assert.equal(s.sectors.find(x=>x.id==='E-HQ').owner,'enemy');
});
test('unit sizes always match a real battle formation preset',()=>{
 for(const n of [2,3,4,5,6,8,10,12])assert.ok(C.presetForSize(n));
 for(const n of [0,1,7,9,11,13])assert.equal(C.presetForSize(n),null);
});

// --- Fog of war: views never leak hidden truth ---
test('a faction does not see enemy units it has no contact with',()=>{
 const v=C.viewFor(fresh(),'player');
 assert.equal(v.enemyUnits.length,0);
 assert.ok(!JSON.stringify(v).includes('"faction":"enemy","sector"'));
});
test('a faction sees enemy units in sectors adjacent to its own units',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];
 pu.sector='L';eu.sector='E-L';
 const v=C.viewFor(s,'player');assert.equal(v.enemyUnits.length,1);assert.equal(v.enemyUnits[0].sector,'E-L');assert.equal(v.enemyUnits[0].size,eu.agents.length);
});
test('enemy fortification is unknown until observed',()=>{
 const s=fresh();s.sectors.find(x=>x.id==='E-L').fort=2;
 const v=C.viewFor(s,'player');assert.equal(v.sectors.find(x=>x.id==='E-L').fort,null);
});
test('views of the two factions are built by the same rules (mirror check)',()=>{
 const s=fresh();const a=C.viewFor(s,'player'),b=C.viewFor(s,'enemy');
 assert.equal(a.enemyUnits.length,b.enemyUnits.length);assert.equal(a.ownUnits.length,b.ownUnits.length);
});

// --- Orders validation ---
test('units may only move to adjacent sectors',()=>{
 const s=fresh();const u=unitsOf(s,'player')[0];
 assert.equal(C.validateOrder(s,'player',{unit:u.id,type:'move',to:'P-L'}).ok,true);
 assert.equal(C.validateOrder(s,'player',{unit:u.id,type:'move',to:'E-HQ'}).ok,false);
});
test('a faction cannot order the other faction\'s units',()=>{
 const s=fresh();assert.equal(C.validateOrder(s,'player',{unit:unitsOf(s,'enemy')[0].id,type:'hold'}).ok,false);
});
test('a radio tower costs supply and needs an owned sector',()=>{
 const s=fresh();const u=unitsOf(s,'player')[0];
 s.factions.player.supply=2;assert.equal(C.validateOrder(s,'player',{unit:u.id,type:'tower'}).ok,false);
 s.factions.player.supply=9;assert.equal(C.validateOrder(s,'player',{unit:u.id,type:'tower'}).ok,true);
});
test('merging is only legal into a valid formation size',()=>{
 const s=fresh();const [a,b]=unitsOf(s,'player');b.sector=a.sector;
 const ok=C.presetForSize(a.agents.length+b.agents.length)!==null;
 assert.equal(C.validateOrder(s,'player',{unit:a.id,type:'merge',with:b.id}).ok,ok);
});
test('one order per unit per turn',()=>{
 const s=fresh();const u=unitsOf(s,'player')[0];
 assert.equal(C.validateOrders(s,'player',[{unit:u.id,type:'hold'},{unit:u.id,type:'recon'}]).ok,false);
});

// --- Turn resolution (WEGO) ---
test('simultaneous moves without contact need no battle',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0];
 const r=C.resolveTurn(s,{player:[{unit:pu.id,type:'move',to:'P-L'}],enemy:[]},noBattles);
 assert.equal(r.state.units.find(u=>u.id===pu.id).sector,'P-L');assert.equal(r.battles.length,0);
});
test('resolution does not mutate the input state',()=>{
 const s=fresh();const before=JSON.stringify(s);const pu=unitsOf(s,'player')[0];
 C.resolveTurn(s,{player:[{unit:pu.id,type:'move',to:'P-L'}],enemy:[]},noBattles);assert.equal(JSON.stringify(s),before);
});
test('units ending in the same sector fight there, owner defends with its fort',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];
 pu.sector='P-L';eu.sector='L';s.sectors.find(x=>x.id==='P-L').fort=1;
 const specs=[];const r=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[{unit:eu.id,type:'move',to:'P-L'}]},spec=>{specs.push(spec);return win('defender')(spec);});
 assert.equal(specs.length,1);assert.equal(specs[0].sector,'P-L');assert.equal(specs[0].defender.faction,'player');assert.equal(specs[0].fort,1);
 assert.equal(specs[0].terrain,s.sectors.find(x=>x.id==='P-L').terrain);
 assert.equal(r.state.units.find(u=>u.id===eu.id).sector,'L','loser retreats to an owned or origin sector');
});
test('units swapping along the same edge meet in the open without a fort',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];
 pu.sector='P-C';eu.sector='C';s.sectors.find(x=>x.id==='C').owner='enemy';
 const specs=[];C.resolveTurn(s,{player:[{unit:pu.id,type:'move',to:'C'}],enemy:[{unit:eu.id,type:'move',to:'P-C'}]},spec=>{specs.push(spec);return win('attacker')(spec);});
 assert.equal(specs.length,1);assert.equal(specs[0].terrain,'open');assert.equal(specs[0].fort,0);assert.equal(specs[0].kind,'meeting');
});
test('battle specs carry unequal sizes and a deterministic per-battle seed',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];
 pu.sector='L';eu.sector='E-L';eu.agents=eu.agents.slice(0,2);
 const seeds=[];for(let k=0;k<2;k++)C.resolveTurn(s,{player:[{unit:pu.id,type:'move',to:'E-L'}],enemy:[{unit:eu.id,type:'hold'}]},spec=>{seeds.push(spec.seed);assert.equal(spec.defender.size,2);assert.equal(spec.attacker.size,pu.agents.length);assert.ok(C.presetForSize(spec.defender.size));return win('attacker')(spec);});
 assert.equal(seeds[0],seeds[1]);
});
test('casualties become injured agents removed from their unit',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];pu.sector='L';eu.sector='E-L';
 const r=C.resolveTurn(s,{player:[{unit:pu.id,type:'move',to:'E-L'}],enemy:[{unit:eu.id,type:'hold'}]},spec=>({winner:'defender',casualties:{attacker:2,defender:1}}));
 const after=r.state.units.find(u=>u.id===pu.id);assert.equal(after.agents.length,pu.agents.length-2);
 assert.equal(r.state.roster.filter(a=>a.faction==='player'&&a.injuredTurns>0).length,2);
});
test('a beaten unit with no friendly sector to retreat to is encircled',()=>{
 const s=fresh();const pu=unitsOf(s,'player')[0],eu=unitsOf(s,'enemy')[0];
 for(const x of s.sectors)if(x.id!=='P-HQ')x.owner='enemy';
 pu.sector='E-L';eu.sector='L';
 const r=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[{unit:eu.id,type:'move',to:'E-L'}]},spec=>({winner:'attacker',casualties:{attacker:0,defender:1}}));
 assert.ok(!r.state.units.some(u=>u.id===pu.id),'encircled unit is disbanded');
 assert.ok(r.events.some(e=>e.type==='encircled'));
});
test('capturing a fortified sector takes extra turns of uncontested presence',()=>{
 let s=fresh();const pu=unitsOf(s,'player')[0];pu.sector='L';const L=s.sectors.find(x=>x.id==='L');L.owner='enemy';L.fort=1;
 s=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[]},noBattles).state;
 assert.equal(s.sectors.find(x=>x.id==='L').owner,'enemy');
 s=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[]},noBattles).state;
 assert.equal(s.sectors.find(x=>x.id==='L').owner,'player');
});
test('holding an owned sector digs in (+1 fort, max 2)',()=>{
 let s=fresh();const u=unitsOf(s,'player')[0];u.sector='P-L';
 for(let k=0;k<3;k++)s=C.resolveTurn(s,{player:[{unit:u.id,type:'hold'}],enemy:[]},noBattles).state;
 assert.equal(s.sectors.find(x=>x.id==='P-L').fort,2);
});
test('recon snapshots the true state, then the intel ages and expires',()=>{
 let s=fresh();const u=unitsOf(s,'player')[0];u.sector='P-L';s.sectors.find(x=>x.id==='L').fort=2;
 s=C.resolveTurn(s,{player:[{unit:u.id,type:'recon'}],enemy:[]},noBattles).state;
 let v=C.viewFor(s,'player');let L=v.sectors.find(x=>x.id==='L');assert.equal(L.fort,2);assert.equal(L.intelAge,0);
 for(let k=0;k<4;k++)s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 v=C.viewFor(s,'player');L=v.sectors.find(x=>x.id==='L');assert.equal(L.fort,null,'stale intel expires');
});

// --- Supply lines, radio, victory ---
test('a sector cut off from HQ yields no supply',()=>{
 const s=fresh();for(const id of ['P-L','P-C','P-R','L','C','R'])s.sectors.find(x=>x.id===id).owner='enemy';
 s.sectors.find(x=>x.id==='E-L').owner='player';
 assert.ok(!C.connectedSectors(s,'player').has('E-L'));assert.ok(C.connectedSectors(s,'player').has('P-HQ'));
});
test('supply income comes from connected sectors and is capped',()=>{
 let s=fresh();s.factions.player.supply=11;
 s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;assert.equal(s.factions.player.supply,C.RULES.supplyCap);
});
test('radio level: tower gives 2 in its sector and 1 next door',()=>{
 const s=fresh();s.sectors.find(x=>x.id==='P-L').tower='player';
 assert.equal(C.radioLevel(s,'player','P-L'),2);assert.equal(C.radioLevel(s,'player','L'),1);assert.equal(C.radioLevel(s,'enemy','P-L'),0);
});
test('radio level maps to the existing battle loss/delay settings',()=>{
 assert.deepEqual(C.radioSettings(0),{loss:50,delay:0.6});assert.deepEqual(C.radioSettings(2),{loss:0,delay:0});
});
test('victory sectors award points each turn; a clear lead wins',()=>{
 let s=fresh({vpLead:2});for(const id of ['L','C'])s.sectors.find(x=>x.id===id).owner='player';
 s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;assert.equal(s.factions.player.vp,2);assert.equal(s.winner,'player');
});
test('capturing the enemy HQ wins immediately',()=>{
 const s=fresh();s.sectors.find(x=>x.id==='E-HQ').owner='player';assert.equal(C.checkVictory(s).winner,'player');
});
test('turn limit ends the campaign on points',()=>{
 const s=fresh({maxTurns:1});s.factions.enemy.vp=1;
 const r=C.resolveTurn(s,{player:[],enemy:[]},noBattles);assert.equal(r.state.winner,'enemy');
});

// --- Coarse battle model (placeholder until calibrated against real battles) ---
test('coarse model is deterministic per seed and favours the larger side',()=>{
 const spec=(a,d)=>({attacker:{size:a},defender:{size:d},fort:0,terrain:'open',seed:42});
 assert.deepEqual(C.coarseBattle(spec(4,4)),C.coarseBattle(spec(4,4)));
 let big=0;for(let k=0;k<400;k++)if(C.coarseBattle({...spec(8,4),seed:k}).winner==='attacker')big++;
 assert.ok(big>280,'8 vs 4 attacker wins '+big+'/400');
});
test('coarse model: forts help the defender',()=>{
 let a0=0,a2=0;for(let k=0;k<400;k++){const b={kind:'assault',attacker:{size:6},defender:{size:4},terrain:'ruins',seed:k};
  if(C.coarseBattle({...b,fort:0}).winner==='attacker')a0++;if(C.coarseBattle({...b,fort:2}).winner==='attacker')a2++;}
 assert.ok(a2<a0);
});
test('coarse casualties never exceed unit sizes',()=>{
 for(let k=0;k<200;k++){const r=C.coarseBattle({attacker:{size:3},defender:{size:6},fort:1,terrain:'lanes',seed:k});
  assert.ok(r.casualties.attacker>=0&&r.casualties.attacker<=3&&r.casualties.defender>=0&&r.casualties.defender<=6);}
});

// --- Fuzz: random legal orders for both sides keep every invariant ---
function randomOrders(s,f,r){
 const orders=[],used=new Set();
 for(const u of s.units.filter(x=>x.faction===f)){
  if(used.has(u.id))continue;
  const pick=r();let o;
  if(pick<.55){const n=C.neighbors(s,u.sector);o={unit:u.id,type:'move',to:n[Math.floor(r()*n.length)]};}
  else if(pick<.70)o={unit:u.id,type:'hold'};else if(pick<.80)o={unit:u.id,type:'recon'};
  else if(pick<.88)o={unit:u.id,type:'tower'};
  else{const w=s.units.find(x=>x.faction===f&&x.id!==u.id&&x.sector===u.sector&&!used.has(x.id));o=w?{unit:u.id,type:'merge',with:w.id}:{unit:u.id,type:'split',sizes:[2,u.agents.length-2]};}
  if(C.validateOrder(s,f,o).ok&&!(o.with&&used.has(o.with))){orders.push(o);used.add(u.id);if(o.with)used.add(o.with);}
 }
 return orders;
}
test('200 random campaigns: agents conserved, units valid, campaigns always end',()=>{
 let ends=0;
 for(let g=0;g<200;g++){
  let s=C.create({seed:1000+g});let a=g*7919+1;const r=()=>{a=(a*1103515245+12345)>>>0;return a/4294967296;};
  for(let t=0;t<40&&!s.winner;t++){
   s=C.resolveTurn(s,{player:randomOrders(s,'player',r),enemy:randomOrders(s,'enemy',r)}).state;
   for(const f of ['player','enemy']){
    const inUnits=s.units.filter(u=>u.faction===f).flatMap(u=>u.agents);
    const injured=s.roster.filter(x=>x.faction===f&&x.injuredTurns>0).map(x=>x.id);
    const all=[...inUnits,...s.factions[f].reserve,...injured];
    assert.equal(all.length,12,'agent count g'+g+' t'+t+' '+f);assert.equal(new Set(all).size,12,'agent duplicated g'+g);
    assert.ok(s.units.filter(u=>u.faction===f).length<=C.RULES.maxUnits);
   }
   for(const u of s.units){assert.ok(u.agents.length>=2,'unit too small');assert.ok(s.sectors.some(x=>x.id===u.sector));}
   for(const x of s.sectors)assert.ok(x.fort>=0&&x.fort<=2);
   assert.ok(Number.isFinite(s.factions.player.supply)&&s.factions.player.supply<=C.RULES.supplyCap);
  }
  assert.ok(s.winner,'campaign '+g+' ended by turn limit at the latest');ends++;
 }
 assert.equal(ends,200);
});
test('two splits in one turn cannot exceed the unit cap',()=>{
 const s=fresh();const [a,b]=unitsOf(s,'player');
 const orders=[{unit:a.id,type:'split',sizes:[2,2]},{unit:b.id,type:'split',sizes:[2,2]}];
 assert.equal(C.validateOrders(s,'player',orders).ok,false);
 const r=C.resolveTurn(s,{player:orders,enemy:[]},noBattles);
 assert.equal(r.state.units.filter(u=>u.faction==='player').length,C.RULES.maxUnits);
});
test('coarse model matches the measured real-battle table (M0-S3) within tolerance',()=>{
 const cal=require('./benchmarks/v090_map/m0_calibration.json').table;
 for(const row of cal){
  let w=0;const N=400;for(let k=0;k<N;k++)if(C.coarseBattle({attacker:{size:row.a},defender:{size:row.b},fort:0,terrain:row.map,seed:k*31+7}).winner==='attacker')w++;
  assert.ok(Math.abs(w/N-row.pA)<=.12,`${row.a}v${row.b} ${row.map}: model ${(w/N).toFixed(2)} vs measured ${row.pA}`);
 }
});
test('contested (control-zone) model matches the measured M4 table within tolerance',()=>{
 // Lanes / open from the original M4 table; ruins from the point-symmetric arena that map battles actually use.
 const fair=[...require('./benchmarks/v090_map/m4_fair_side_bias.json').rows.control,...require('./benchmarks/v090_map/m4_fair_quick_check.json').rows.control]
  .filter(r=>r.map==='ruinsFair'),cells={};
 for(const r of fair){const k=r.a+':'+r.b;const c=cells[k]=cells[k]||{a:r.a,b:r.b,map:'ruins',n:0,w:0,la:0,lb:0};c.n++;if(r.aWon)c.w++;c.la+=r.aLost;c.lb+=r.bLost;}
 const ruinsRows=Object.values(cells).map(c=>({a:c.a,b:c.b,map:'ruins',n:c.n,pA:c.w/c.n,meanALost:c.la/c.n,meanBLost:c.lb/c.n}));
 assert.ok(ruinsRows.length>=4);
 for(const row of [...require('./benchmarks/v090_map/m4_contested_control_calibration.json').table.filter(r=>r.map!=='ruins'),...ruinsRows]){
  let w=0,lost=0;const N=400;
  for(let k=0;k<N;k++){const r=C.coarseBattle({kind:'contested',attacker:{size:row.a},defender:{size:row.b},fort:0,terrain:row.map,seed:k*29+3});
   if(r.winner==='attacker')w++;lost+=r.casualties.attacker+r.casualties.defender;}
  // 20 battles per cell: allow two binomial standard errors of the measurement (at least 0.12).
  const tol=Math.max(.12,2*Math.sqrt(Math.max(row.pA*(1-row.pA),.05)/row.n));
  assert.ok(Math.abs(w/N-row.pA)<=tol,`${row.a}v${row.b} ${row.map}: model ${(w/N).toFixed(2)} vs measured ${row.pA} (tol ${tol.toFixed(2)})`);
  const measured=row.meanALost+row.meanBLost;
  assert.ok(Math.abs(lost/N-measured)<=Math.max(1.2,measured*.45),`${row.a}v${row.b} ${row.map} total losses: model ${(lost/N).toFixed(1)} vs measured ${measured}`);
 }
});
test('a contested 12v12 sector battle never wipes the loser out',()=>{
 for(let k=0;k<300;k++){const r=C.coarseBattle({kind:'contested',attacker:{size:12},defender:{size:12},fort:0,terrain:'open',seed:k});
  assert.ok(Math.max(r.casualties.attacker,r.casualties.defender)<12);}
});
test('assault model matches the measured fort table (pooled over terrains) within tolerance',()=>{
 const rows=require('./benchmarks/v090_map/m0_fort_calibration.json').table;const pool={};
 for(const x of rows){const k=x.a+':'+x.b+':'+x.fort;pool[k]=pool[k]||{a:x.a,b:x.b,fort:x.fort,w:0,n:0};pool[k].w+=x.aWins;pool[k].n+=x.n;}
 for(const c of Object.values(pool)){let w=0;const N=600;
  for(let k=0;k<N;k++)if(C.coarseBattle({kind:'assault',attacker:{size:c.a},defender:{size:c.b},fort:c.fort,terrain:'ruins',seed:k*13+5}).winner==='attacker')w++;
  assert.ok(Math.abs(w/N-c.w/c.n)<=.12,`${c.a}v${c.b} fort ${c.fort}: model ${(w/N).toFixed(2)} vs measured ${(c.w/c.n).toFixed(2)}`);}
});
test('assault losers keep most of their unit (zone battles end on points)',()=>{
 for(let k=0;k<200;k++){const r=C.coarseBattle({kind:'assault',attacker:{size:6},defender:{size:4},fort:1,terrain:'lanes',seed:k});
  const lost=r.winner==='attacker'?r.casualties.defender:r.casualties.attacker,size=r.winner==='attacker'?4:6;assert.ok(lost<size,'loser not wiped');}
});
test('HQs start fortified',()=>{const s=fresh();assert.equal(s.sectors.find(x=>x.id==='P-HQ').fort,C.RULES.hqFort);assert.equal(s.sectors.find(x=>x.id==='E-HQ').fort,C.RULES.hqFort);});
test('the lead can swing back: points are a tug-of-war, not a race',()=>{
 let s=fresh({vpLead:10});s.sectors.find(x=>x.id==='L').owner='player';
 for(let k=0;k<3;k++)s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 for(const id of ['L','C','R'])s.sectors.find(x=>x.id===id).owner='enemy';
 for(let k=0;k<2;k++)s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 assert.ok(s.factions.enemy.vp>s.factions.player.vp);assert.equal(s.winner,null);
});

// --- NOVA-9 (FRACTURED FRONT campaign map) ---
const nova=(o={})=>C.create({seed:11,template:'nova9',...o});
test('NOVA-9 is a 3x3 grid with BLUE/RED home sectors and a neutral centre column of victory sectors',()=>{
 const s=nova();assert.equal(s.sectors.length,9);assert.equal(s.edges.length,12);
 assert.deepEqual(s.sectors.filter(x=>x.victory).map(x=>x.id).sort(),['C2','N2','S2']);
 assert.equal(s.sectors.find(x=>x.id==='C1').hq,'player');assert.equal(s.sectors.find(x=>x.id==='C3').hq,'enemy');
 for(const id of ['N2','C2','S2'])assert.equal(s.sectors.find(x=>x.id===id).owner,null);
 assert.equal(s.sectors.find(x=>x.id==='N3').fort,1,'Red Outpost starts fortified');
});
test('Relay and Factory need a Power Grid linked through own sectors',()=>{
 const s=nova();assert.equal(C.powered(s,'player','N1'),false);
 s.sectors.find(x=>x.id==='S2').owner='player';assert.equal(C.powered(s,'player','N1'),true,'S2-S1-C1-N1 all player');
 s.sectors.find(x=>x.id==='C1').owner='enemy';assert.equal(C.powered(s,'player','N1'),false,'link through C1 cut');
});
test('a powered relay gives strong radio in its sector and next door; unpowered only weak local radio',()=>{
 const s=nova();assert.equal(C.radioLevel(s,'player','N1'),1);assert.equal(C.radioLevel(s,'player','N2'),0);
 s.sectors.find(x=>x.id==='S2').owner='player';assert.equal(C.radioLevel(s,'player','N1'),2);assert.equal(C.radioLevel(s,'player','N2'),2);
 assert.equal(C.radioLevel(s,'enemy','N2'),0);
});
test('sensor stations reveal enemy units next door without a unit present',()=>{
 const s=nova();const pu=s.units.find(u=>u.faction==='player');pu.sector='N2';
 const v=C.viewFor(s,'enemy');assert.ok(v.enemyUnits.some(e=>e.sector==='N2'),'Red Outpost sees Old Town');
});
test('a powered factory produces fresh agents up to the roster cap; unpowered it does nothing',()=>{
 let s=nova();for(let k=0;k<4;k++)s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 assert.equal(s.roster.filter(a=>a.faction==='enemy').length,12,'no grid, no production');
 s=nova();s.sectors.find(x=>x.id==='S2').owner='enemy';
 for(let k=0;k<12;k++)s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 const n=s.roster.filter(a=>a.faction==='enemy').length;assert.ok(n>12&&n<=C.RULES.maxAgents,'produced '+n);
 assert.ok(s.roster.filter(a=>a.fresh).every(a=>a.faction==='enemy'));
});
test('more than a Platoon in one sector fights in rounds (at most 12 per side per round)',()=>{
 const s=nova();const blue=s.units.filter(u=>u.faction==='player');
 for(const u of blue)u.sector='C2';blue[0].agents.push('P13','P14');s.roster.push({id:'P13',faction:'player',injuredTurns:0},{id:'P14',faction:'player',injuredTurns:0});
 const red=s.units.find(u=>u.faction==='enemy');red.sector='C3';
 const specs=[];C.resolveTurn(s,{player:[],enemy:[{unit:red.id,type:'move',to:'C2'}]},spec=>{specs.push(spec);assert.ok(spec.attacker.size<=12&&spec.defender.size<=12);return {winner:'attacker',casualties:{attacker:0,defender:4}};});
 assert.ok(specs.length>=2,'second round with reinforcements: '+specs.length);
});
test('200 random NOVA-9 campaigns keep every agent accounted for',()=>{
 for(let g=0;g<200;g++){let s=C.create({seed:500+g,template:'nova9'});let a=g*104729+3;const r=()=>{a=(a*1103515245+12345)>>>0;return a/4294967296;};
  for(let t=0;t<40&&!s.winner;t++){
   s=C.resolveTurn(s,{player:randomOrders(s,'player',r),enemy:randomOrders(s,'enemy',r)}).state;
   for(const f of ['player','enemy']){const all=[...s.units.filter(u=>u.faction===f).flatMap(u=>u.agents),...s.factions[f].reserve,...s.roster.filter(x=>x.faction===f&&x.injuredTurns>0).map(x=>x.id)];
    const n=s.roster.filter(x=>x.faction===f).length;assert.equal(all.length,n,'g'+g+' t'+t);assert.equal(new Set(all).size,n);assert.ok(n<=C.RULES.maxAgents);}
  }
  assert.ok(s.winner);
 }
});
test('an HQ falls only after a long uncontested siege',()=>{
 let s=nova();const pu=s.units.find(u=>u.faction==='player');pu.sector='C3';
 for(const u of s.units.filter(x=>x.faction==='enemy'))u.sector='S3';
 for(let k=0;k<C.RULES.hqSiegeTurns-1;k++){s=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[]},noBattles).state;assert.equal(s.sectors.find(x=>x.id==='C3').owner,'enemy','turn '+k);}
 s=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[]},noBattles).state;assert.equal(s.sectors.find(x=>x.id==='C3').owner,'player');
});
test('a contested victory sector scores for nobody',()=>{
 let s=nova({vpLead:50});s.sectors.find(x=>x.id==='C2').owner='enemy';
 const pu=s.units.find(u=>u.faction==='player');pu.sector='C2';s.sectors.find(x=>x.id==='C2').fort=2;
 for(const u of s.units.filter(x=>x.faction==='enemy'))u.sector='S3';
 s=C.resolveTurn(s,{player:[{unit:pu.id,type:'hold'}],enemy:[]},noBattles).state;
 assert.equal(s.factions.enemy.vp,0,'enemy holds C2 but it is contested');
});
test('unattended forts decay to their base level; attended ones do not',()=>{
 let s=nova();const PL=s.sectors.find(x=>x.id==='S1');PL.fort=2;const N3=s.sectors.find(x=>x.id==='N3');N3.fort=2;
 s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 assert.equal(s.sectors.find(x=>x.id==='S1').fort,1);assert.equal(s.sectors.find(x=>x.id==='N3').fort,1);
 s=C.resolveTurn(s,{player:[],enemy:[]},noBattles).state;
 assert.equal(s.sectors.find(x=>x.id==='S1').fort,0);assert.equal(s.sectors.find(x=>x.id==='N3').fort,1,'outpost keeps its base fort');
 assert.equal(s.sectors.find(x=>x.id==='C1').fort,C.RULES.hqFort,'HQ keeps its base fort');
 let t=nova();const u=t.units.find(x=>x.faction==='player');u.sector='S1';t.sectors.find(x=>x.id==='S1').fort=2;
 t=C.resolveTurn(t,{player:[{unit:u.id,type:'hold'}],enemy:[]},noBattles).state;assert.equal(t.sectors.find(x=>x.id==='S1').fort,2);
});
test('resolveTurnSteps yields each battle and gives the same result as resolveTurn with that resolver',()=>{
 let s=C.create({seed:7,template:'nova9'});
 const orders={player:s.units.filter(u=>u.faction==='player').map(u=>({unit:u.id,type:'move',to:'C2'})),
  enemy:s.units.filter(u=>u.faction==='enemy').map(u=>({unit:u.id,type:'move',to:'C2'}))};
 const steps=C.resolveTurnSteps(s,orders);const seen=[];let st=steps.next();
 while(!st.done){seen.push(st.value);assert.ok(st.value.attacker.agents.length&&st.value.defender.agents.length);st=steps.next(C.coarseBattle(st.value));}
 assert.ok(seen.length>=1&&seen[0].kind==='contested'&&seen[0].sector==='C2');
 assert.deepEqual(st.value.state,C.resolveTurn(s,orders).state);
 assert.equal(s.turn,0,'input untouched');
});
test('a resolver can name exactly which agents fell; a malformed list falls back to the count',()=>{
 const s=C.create({seed:7,template:'nova9'});
 const orders={player:s.units.filter(u=>u.faction==='player').map(u=>({unit:u.id,type:'move',to:'C2'})),
  enemy:s.units.filter(u=>u.faction==='enemy').map(u=>({unit:u.id,type:'move',to:'C2'}))};
 let picked=null;
 const named=C.resolveTurn(s,orders,spec=>{picked=spec.defender.agents.slice(1,4);return {winner:'attacker',casualties:{attacker:0,defender:0},dead:{attacker:[],defender:picked},source:'real'};});
 const injured=named.state.roster.filter(a=>a.injuredTurns>0).map(a=>a.id).sort();
 assert.deepEqual(injured,picked.slice().sort(),'exactly the named agents are injured');
 assert.equal(named.battles[0].result.source,'real');assert.equal(named.events.find(e=>e.type==='battle').source,'real');
 const bad=C.resolveTurn(s,orders,()=>({winner:'attacker',casualties:{attacker:0,defender:2},dead:{defender:['nobody']}}));
 assert.equal(bad.state.roster.filter(a=>a.injuredTurns>0).length,2,'unknown ids ignored, count used');
});
