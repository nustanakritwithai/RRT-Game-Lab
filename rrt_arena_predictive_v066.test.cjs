const test=require('node:test');
const assert=require('node:assert/strict');
const ai=require('./rrt_arena_predictive_v066.js');
const self={x:220,y:210}, opts={now:10,scale:400,width:740,height:540,radius:11,enemySpeed:54,blueSpeed:154};
const v=(id,x,y,vx=0,vy=0)=>({id,x,y,vx,vy,status:'visible',lastSeen:10,confidence:1});
const mem=(id,x,y,age=1,confidence=.7)=>({id,x,y,vx:10,vy:0,status:'memory',lastSeen:10-age,confidence});
test('no perceived threats means no predictive alarm or escape',()=>{
 const r=ai.assessEncirclement(self,{},opts);
 assert.equal(r.alert,false);assert.equal(ai.choosePredictiveEscape(self,{},opts),null);
});
test('unobserved/hidden world coordinates are ignored even when close',()=>{
 const t={bad:{id:'bad',status:'hidden',x:221,y:211},unknown:{id:'unknown',x:220,y:210}};
 assert.equal(ai.buildThreatMap(self,t,opts).length,0);
});
test('recent memory position is extrapolated only within bounded uncertainty',()=>{
 const t=ai.buildThreatMap(self,{m:mem('m',120,110,2)},opts)[0];
 assert.ok(t&&t.status==='memory'&&t.confidence>0&&t.confidence<.7);
 assert.ok(t.x>120&&t.x<=120+400*.18);
 assert.ok(Math.abs(t.y-110)<1e-9);
});
test('expired and zero confidence memories have no effect',()=>{
 const tracks={old:mem('old',220,210,8),zero:mem('zero',220,210,1,0)};
 assert.equal(ai.buildThreatMap(self,tracks,opts).length,0);
 assert.equal(ai.assessEncirclement(self,tracks,opts).alert,false);
});
test('approaching opponent contact ETA is positive and bounded',()=>{
 const t=ai.buildThreatMap(self,{a:v('a',320,210,-40,0)},opts)[0];
 assert.ok(t.eta>0&&t.eta<3);
 assert.ok(Number.isFinite(t.forecast.x));
});
test('one distant visible enemy does not invoke anti-encirclement',()=>{
 assert.equal(ai.assessEncirclement(self,{a:v('a',610,210)},opts).alert,false);
});
test('three opponents from multiple bearings predict an enclosure early',()=>{
 const t={a:v('a',306,210,-54,0),b:v('b',220,298,0,-54),c:v('c',143,210,54,0)};
 const r=ai.assessEncirclement(self,t,opts);
 assert.equal(r.alert,true);assert.ok(r.threatCount>=3);
 assert.ok(r.earliestEta>0);
});
test('three old memories alone cannot create a live swarm alarm',()=>{
 const t={a:mem('a',260,210),b:mem('b',220,260),c:mem('c',170,210)};
 assert.equal(ai.assessEncirclement(self,t,opts).alert,false);
});
test('predictive escape seeks the open side of three threats',()=>{
 const t={a:v('a',125,210),b:v('b',220,100),c:v('c',316,210)};
 const choice=ai.choosePredictiveEscape(self,t,{...opts,free:()=>true,direct:()=>true,history:[]});
 assert.ok(choice&&choice.goal.y>self.y+10,JSON.stringify(choice));
 assert.ok(choice.evaluated>0&&choice.openDirections>=3);
});
test('plan validates bounds and free space instead of teleporting',()=>{
 const t={a:v('a',160,210),b:v('b',230,120),c:v('c',300,220)};
 const free=p=>p.x<460&&p.x>40&&p.y>40&&p.y<440;
 const out=ai.choosePredictiveEscape(self,t,{...opts,free,direct:()=>false});
 assert.ok(out&&free(out.goal));assert.equal(out.direct,false);
 assert.ok(out.requiresRRT);
});
test('sealed/dead-end candidate region is refused',()=>{
 const t={a:v('a',170,210),b:v('b',220,160),c:v('c',270,210)};
 assert.equal(ai.choosePredictiveEscape(self,t,{...opts,free:()=>false,direct:()=>false}),null);
});
test('identical track observations produce identical plan; input is immutable',()=>{
 const t=Object.freeze({a:Object.freeze(v('a',140,200)),b:Object.freeze(v('b',220,120)),c:Object.freeze(v('c',310,210))});
 const a=ai.choosePredictiveEscape(self,t,{...opts}),b=ai.choosePredictiveEscape(self,t,{...opts});
 assert.deepEqual(a,b);assert.equal(t.a.x,140);
});
test('memory threat uncertainty and radius do not grant secret precision',()=>{
 const t={a:mem('a',140,210,2,.5)};
 const [r]=ai.buildThreatMap(self,t,opts);
 assert.ok(r.uncertainty>0&&r.confidence<.5);
 assert.ok(ai.buildThreatMap(self,{a:{...t.a,status:'never_observed'}},opts).length===0);
});
