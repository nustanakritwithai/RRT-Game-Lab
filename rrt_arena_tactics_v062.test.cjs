'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const api=require('./rrt_arena_tactics_v062.js');
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function setup(changes={}){
 const enemy={x:310,y:260},self={x:160,y:260,range:210,preferred:110,hp:100,maxHp:120,ammo:6};
 return {self,enemy,bounds:{w:600,h:510},scale:360,free:()=>true,canSee:()=>true,canTravel:()=>true,now:20,history:[],side:1,strategy:'balanced',...changes};
}
test('a calculated reposition is substantial even with visible enemy in firing range',()=>{
 const i=setup(),x=api.plan(i); assert.ok(x);assert.ok(x.move>27);assert.ok(d(x.goal,i.self)>25);assert.ok(x.evaluated>=15);
});
test('visible enemy generates a firing line for the new goal',()=>{
 const i=setup(),x=api.plan(i);assert.equal(x.lineOfFire,true);assert.ok(d(x.goal,i.enemy)<=i.self.range*.97);
});
test('aggressive, balanced, cautious yield different preferred range',()=>{
 const a=api.preferredRange('aggressive',100,200),b=api.preferredRange('balanced',100,200),c=api.preferredRange('cautious',100,200);
 assert.ok(a<b && b<c);
});
test('closer than desired triggers kite',()=>{const x=api.plan(setup({self:{x:275,y:260,range:210,preferred:110}}));assert.equal(x.kind,'kite');});
test('farther than desired triggers pressure',()=>{const x=api.plan(setup({self:{x:90,y:260,range:210,preferred:110}}));assert.equal(x.kind,'pressure');});
test('combat in suitable range chooses orbit or flank rather than hold',()=>{const x=api.plan(setup({self:{x:185,y:260,range:210,preferred:110}}));assert.ok(['orbit','flank'].includes(x.kind));});
test('no free points produces no claimed route',()=>{const x=api.plan(setup({free:()=>false}));assert.equal(x,null);});
test('bounded candidates never walk off the map',()=>{const i=setup({self:{x:35,y:255,range:210,preferred:110},enemy:{x:165,y:255}}),x=api.plan(i);assert.ok(x);assert.ok(x.goal.x>=0&&x.goal.x<=600&&x.goal.y>=0&&x.goal.y<=510);});
test('unobstructed firing lane beats geometry behind an opaque wall',()=>{
 const i=setup({canSee:(p)=>p.y<=260,canTravel:()=>true});const x=api.plan(i);assert.ok(x);assert.ok(x.goal.y<=260);assert.equal(x.lineOfFire,true);
});
test('avoids recently visited destination',()=>{
 const i=setup(),first=api.plan(i); const repeat=api.plan({...i,history:[{...first.goal,time:20}]}); assert.ok(d(first.goal,repeat.goal)>36);
});
test('avoids a localized danger heatmap region',()=>{
 const i=setup(),first=api.plan(i);const avoid=api.plan({...i,dangerAt:(p)=>d(p,first.goal)<80?1:0});assert.ok(d(avoid.goal,first.goal)>70);
});
test('candidate scores and decisions deterministic for same observation',()=>{const i=setup();assert.deepEqual(api.plan(i),api.plan(i));});
test('not allowed to infer enemy position when missing visible observation',()=>{assert.equal(api.plan(setup({enemy:null})),null);});
test('invalid collision contract rejects decision',()=>{assert.equal(api.plan(setup({canTravel:null})),null);});
test('no mutation of agent observation or history',()=>{const i=setup();const before=JSON.stringify(i);api.plan(i);assert.equal(JSON.stringify(i),before);});
test('alternate orbit direction can create a different path',()=>{const i=setup();const x=api.plan({...i,side:1}),y=api.plan({...i,side:-1});assert.ok(d(x.goal,y.goal)>20);});
test('reason exposes computed risk and distance',()=>{const x=api.plan(setup());assert.match(x.reason,/เป้าหมาย .*px.*เดิน .*px.*เสี่ยง/);});