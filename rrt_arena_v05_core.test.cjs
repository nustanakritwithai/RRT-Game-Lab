'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./rrt_arena_v05_core.js');
const near = (a,b,epsilon=1e-6) => Math.abs(a-b) < epsilon;
const point = (x,y)=>({x,y});
const vis = (p)=>p.y < 40;

test('route cost equals distance when danger weighting is zero', () => {
 assert.ok(near(core.edgeCost(point(0,0),point(30,40),point(70,10),vis,0,100),50));
});
test('safer longer path can beat short exposed path with high risk', () => {
 const enemy=point(100,10), a=point(0,20), mid=point(0,75), end=point(95,75);
 const visible = p=>p.y < 40;
 const risky=core.pathCost([a,point(95,20),end],enemy,visible,100,100);
 const safe=core.pathCost([a,mid,end],enemy,visible,100,100);
 assert.ok(safe<risky);
});
test('smoothing respects exposure even when clear shortcut exists',()=>{
 const enemy=point(100,0), a=point(0,60), mid=point(40,90), b=point(100,60);
 const exposed=p=>p.y<72;
 assert.equal(core.shouldShortcut(a,mid,b,enemy,exposed,100,100),false);
 assert.equal(core.shouldShortcut(a,mid,b,enemy,exposed,0,100),true);
});
test('findCover picks a free position hidden by obstacle',()=>{
 const fighter=point(20,50), enemy=point(95,50);
 const wall={x:43,y:25,w:15,h:50};
 const free=p=>p.x>=5&&p.y>=5&&p.x<=115&&p.y<=95&&!(p.x>=wall.x-5&&p.x<=wall.x+wall.w+5&&p.y>=wall.y-5&&p.y<=wall.y+wall.h+5);
 const visible=(a,b)=>! (a.x<wall.x&&b.x>wall.x+wall.w&&a.y>25&&a.y<75&&b.y>25&&b.y<75);
 const cover=core.findCover(fighter,enemy,[wall],free,visible,{w:120,h:100},6,100);
 assert.ok(cover);
 assert.equal(free(cover),true);
 assert.equal(visible(cover,enemy),false);
});
test('low HP visible bot should retreat, ammo depleted bot should seek cover',()=>{
 assert.equal(core.decideIntent({hp:22,maxHp:120,ammo:4,reload:0,foeVisible:true,distance:50,range:100,strategy:'balanced'}).kind,'retreat');
 assert.equal(core.decideIntent({hp:120,maxHp:120,ammo:0,reload:1,foeVisible:true,distance:50,range:100,strategy:'balanced'}).kind,'cover');
});
test('engage when viable; flank without sight; release cover when hidden',()=>{
 const base={hp:110,maxHp:120,ammo:6,reload:0,foeVisible:true,distance:75,range:100,strategy:'balanced'};
 assert.equal(core.decideIntent(base).kind,'engage');
 assert.equal(core.decideIntent({...base,foeVisible:false}).kind,'flank');
 assert.equal(core.decideIntent({...base,hp:25,foeVisible:false}).kind,'flank');
});
test('strategy adjusts retreat threshold',()=>{
 const b={hp:45,maxHp:120,ammo:6,reload:0,foeVisible:true,distance:50,range:100};
 assert.equal(core.decideIntent({...b,strategy:'cautious'}).kind,'retreat');
 assert.notEqual(core.decideIntent({...b,strategy:'aggressive'}).kind,'retreat');
});
test('exposure function bounded and finite',()=>{
 for(const weight of [0,20,100]){
  let x=core.edgeExposure(point(0,0),point(90,90),point(20,20),()=>true,100);
  assert.ok(Number.isFinite(x)&&x>=0&&x<=1);
  let cost=core.edgeCost(point(0,0),point(90,90),point(20,20),()=>true,weight,100);
  assert.ok(Number.isFinite(cost)&&cost>=0);
 }
});
test('timeout match resolves exact or near ties as draws, never awards arbitrary win',()=>{
 assert.equal(core.resolveWinner(120,120),'draw');
 assert.equal(core.resolveWinner(73.2,73.55),'draw');
 assert.equal(core.resolveWinner(74,72),'blue');
 assert.equal(core.resolveWinner(72,74),'red');
});
