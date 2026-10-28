'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('./rrt_arena_campaign_v090.js');
const AI=require('./rrt_arena_campaign_ai_v090.js');

test('every personality returns only legal orders, at most one per unit',()=>{
 for(const p of AI.PERSONALITIES){let s=C.create({seed:3});
  for(let t=0;t<12&&!s.winner;t++){
   for(const f of ['player','enemy']){const o=AI.decideOrders(C.viewFor(s,f),p,t);assert.equal(C.validateOrders(s,f,o).ok,true,p+' t'+t+' '+JSON.stringify(C.validateOrders(s,f,o)));}
   s=C.resolveTurn(s,{player:AI.decideOrders(C.viewFor(s,'player'),p,t),enemy:AI.decideOrders(C.viewFor(s,'enemy'),p,t)}).state;}}
});
test('decisions are deterministic for the same view and seed',()=>{
 const v=C.viewFor(C.create({seed:9}),'enemy');assert.deepEqual(AI.decideOrders(v,'assault',4),AI.decideOrders(v,'assault',4));
});
test('the AI cannot react to hidden enemy units (fog of war holds)',()=>{
 const a=C.create({seed:5}),b=C.create({seed:5});
 // Move a player unit somewhere the enemy cannot see in state b only.
 b.units.find(u=>u.faction==='player').sector='P-L';
 const va=C.viewFor(a,'enemy'),vb=C.viewFor(b,'enemy');assert.deepEqual(va,vb,'views identical');
 assert.deepEqual(AI.decideOrders(va,'assault',1),AI.decideOrders(vb,'assault',1));
});
test('decideOrders takes a view, not the full state',()=>{
 assert.throws(()=>AI.decideOrders(C.create({seed:1}),'assault',0),/view/i);
});
test('an undefended HQ under visible threat gets a defender',()=>{
 const s=C.create({seed:2});
 for(const u of s.units.filter(x=>x.faction==='enemy'))u.sector='C';
 s.units.find(u=>u.faction==='player').sector='E-C'; // visible to the enemy units in C, next to E-HQ
 const v=C.viewFor(s,'enemy');assert.ok(v.enemyUnits.some(e=>e.sector==='E-C'));
 const o=AI.decideOrders(v,'assault',0);
 assert.ok(o.some(x=>x.type==='move'&&['E-L','E-C','E-R','E-HQ'].includes(x.to)),'a unit heads back toward HQ: '+JSON.stringify(o));
});
test('assault personality advances toward victory sectors from the start',()=>{
 const s=C.create({seed:4});const o=AI.decideOrders(C.viewFor(s,'player'),'assault',0);
 assert.ok(o.some(x=>x.type==='move'));
});
test('network personality builds towers when it can afford them',()=>{
 const s=C.create({seed:4});s.factions.player.supply=9;const o=AI.decideOrders(C.viewFor(s,'player'),'network',0);
 assert.ok(o.some(x=>x.type==='tower'));
});
test('autoplay: 60 campaigns of mixed personalities all finish with sane statistics',()=>{
 const r=AI.autoplay({games:60,seed:100});
 assert.equal(r.games,60);assert.equal(r.unfinished,0);
 assert.ok(r.meanTurns>=3&&r.meanTurns<=C.RULES.maxTurns);assert.ok(r.battlesPerTurn>=0);
});
test('a besieged HQ is relieved by nearby units',()=>{
 const s=C.create({seed:3,template:'nova9'});
 const red=s.units.filter(u=>u.faction==='enemy');red[0].sector='S3';red[1].sector='N3';red[2].sector='C2';
 s.units.find(u=>u.faction==='player').sector='C3';
 const o=AI.decideOrders(C.viewFor(s,'enemy'),'assault',0);
 assert.ok(o.filter(x=>x.type==='move'&&x.to==='C3').length>=2,JSON.stringify(o));
});
test('NOVA-9 auto-play: the side behind at turn 6 still comes back sometimes (objective field, contested zones)',()=>{
 const r=AI.autoplay({games:450,seed:900,template:'nova9'});
 assert.equal(r.unfinished,0);assert.ok(r.comebackRate>=.15,'comeback '+r.comebackRate.toFixed(2)+' (was 0.09 before M3.1)');
 assert.ok(r.medianTurns>=9&&r.medianTurns<=14,'median '+r.medianTurns);
});
