const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('./multi_target_core.js');
const block=[{x:200,y:150,w:100,h:180}];
const own={x:120,y:200,heading:0};
const T=(id,x,y,kind='wander')=>({id,x,y,kind,active:true});
test('deterministic RNG for reproducible bot behavior',()=>{let a=m.random(61),b=m.random(61);assert.deepEqual(Array.from({length:8},()=>a()),Array.from({length:8},()=>b()));});
test('point obstacle excludes expanded player footprint',()=>{assert.equal(m.freePoint({x:205,y:200},block,10),false);assert.equal(m.freePoint({x:155,y:200},block,10),true);});
test('point boundary respects robot radius',()=>assert.equal(m.freePoint({x:3,y:120},[],10),false));
test('segment through rectangle is blocked',()=>assert.equal(m.segmentClear({x:140,y:200},{x:370,y:200},block,6),false));
test('segment fully above rectangle is clear even at vertical x',()=>assert.equal(m.segmentClear({x:250,y:10},{x:250,y:85},block,6),true));
test('segment parallel outside rectangle is clear',()=>assert.equal(m.segmentClear({x:130,y:200},{x:130,y:250},block,5),true));
test('segment grazing a wall with radius is rejected',()=>assert.equal(m.segmentClear({x:120,y:144},{x:380,y:144},block,8),false));
test('LOS fails through wall',()=>assert.equal(m.visible(own,T('a',400,200),block,{range:600}),false));
test('LOS fails outside range',()=>assert.equal(m.visible(own,T('a',180,200),[],{range:30}),false));
test('LOS respects field of view cone',()=>assert.equal(m.visible(own,T('a',70,200),[],{range:600,fov:Math.PI/2,heading:0}),false));
test('LOS sees forward target',()=>assert.equal(m.visible(own,T('a',170,200),[],{range:600,fov:Math.PI/2,heading:0}),true));
test('fresh observation tracks several visible targets',()=>{let r=m.observe(own,[T('a',140,210),T('b',160,235)],[],{},1,{range:350});assert.equal(r.visibleIds.length,2);assert.equal(r.knownCount,2);});
test('hidden target never leaks current position',()=>{
  const previous=m.observe(own,[T('a',170,200)],[],{},0,{range:250});
  const r=m.observe(own,[T('a',460,400)],block,previous.tracks,1,{range:250,ttl:5});
  assert.equal(r.knownCount,1);assert.equal(r.tracks.a.status,'memory');assert.equal(r.tracks.a.x,170);assert.notEqual(r.tracks.a.x,460);
});
test('confidence falls while target is not visible',()=>{
 const t=m.observe(own,[T('a',170,200)],[],{},0,{range:350});
 const r=m.observe(own,[T('a',950,550)],[],t.tracks,3,{range:200,ttl:6});
 assert.ok(Math.abs(r.tracks.a.confidence-.5)<1e-8);
});
test('expired memory disappears',()=>{
 const t=m.observe(own,[T('a',170,200)],[],{},0,{range:350});
 const r=m.observe(own,[T('a',950,550)],[],t.tracks,10,{range:200,ttl:6});
 assert.equal(r.knownCount,0);
});
test('never seen target is not known to tracker',()=>{
 const r=m.observe(own,[T('a',850,500)],[],{},1,{range:190});assert.equal(r.knownCount,0);
});
test('removed target not in observations',()=>{
 const r=m.observe(own,[{...T('a',150,210),active:false}],[],{},1);assert.equal(r.knownCount,0);
});
test('ranking only considers the seen or remembered tracks',()=>{
 const t={a:{id:'a',x:150,y:200,confidence:1,status:'visible',kind:'patrol'},b:{id:'b',x:340,y:200,confidence:1,status:'visible',kind:'flee'}};
 assert.equal(m.rankTarget(t,own,'nearest')?.id,'a');assert.equal(m.rankTarget(t,own,'runner')?.id,'b');
});
test('focus hysteresis resists switching for tiny changes',()=>{
 const t={a:{id:'a',x:155,y:200,status:'visible',confidence:1},b:{id:'b',x:148,y:200,status:'visible',confidence:1}};
 assert.equal(m.rankTarget(t,own,'nearest','a')?.id,'a');
});
test('visible priority chooses currently observed target',()=>{
 const t={a:{id:'a',x:130,y:210,status:'memory',confidence:.7},b:{id:'b',x:300,y:250,status:'visible',confidence:1}};
 assert.equal(m.rankTarget(t,own,'visible')?.id,'b');
});
test('memory priority chooses ghost over another visible',()=>{
 const t={a:{id:'a',x:200,y:250,status:'memory',confidence:.7},b:{id:'b',x:180,y:220,status:'visible',confidence:1}};
 assert.equal(m.rankTarget(t,own,'memory')?.id,'a');
});
test('no target available yields null',()=>assert.equal(m.rankTarget({},own),null));
test('prediction capped and bounded',()=>{let x=m.predict({x:950,y:590,vx:400,vy:400,lastSeen:0},10);assert.ok(x.x<=948&&x.y<=588);});
test('rrt direct path is collision-free and ends at exact goal',()=>{
 let a={x:70,y:100},b={x:850,y:100},z=m.rrt(a,b,block,{seed:42});assert.ok(z.stats.found);assert.deepEqual(z.path[z.path.length-1],b);
});
test('RRT solves path around rectangle and every edge is clear',()=>{
 let a={x:130,y:240},b={x:440,y:240},z=m.rrt(a,b,block,{seed:42,iterations:1300});
 assert.ok(z.stats.found,`nodes=${z.nodes.length}`);for(let i=1;i<z.path.length;i++)assert.ok(m.segmentClear(z.path[i-1],z.path[i],block,10));
});
test('RRT terminates with failure when goal is in wall',()=>{
 let z=m.rrt({x:50,y:50},{x:250,y:200},block,{iterations:25});assert.equal(z.stats.found,false);assert.equal(z.path.length,0);
});
test('RRT tree samples counted within bounded iteration limit',()=>{
 let z=m.rrt({x:130,y:240},{x:440,y:240},block,{seed:5,iterations:400});let c=z.stats.sampling;assert.equal(c.global+c.corridor+c.goal,z.stats.iterations);assert.ok(z.stats.iterations<=400);
});
test('simple targets cannot step through wall',()=>{
 let p={x:175,y:245},goal={x:275,y:245};let pos=m.moveToward(p,goal,block,45,10);assert.ok(m.segmentClear(p,pos,block,10));
});
test('simple target stays inside map on attempt to leave',()=>{
 let p={x:18,y:18},goal={x:-300,y:-300};let z=m.moveToward(p,goal,[],60,12);assert.ok(m.freePoint(z,[],12));
});
