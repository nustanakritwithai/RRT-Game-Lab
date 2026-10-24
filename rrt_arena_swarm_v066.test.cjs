'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const sw=require('./rrt_arena_swarm_v066.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const V=(id,x,y,extra={})=>({id,x,y,vx:0,vy:0,status:'visible',lastSeen:10,confidence:1,uncertainty:0,...extra});
const tracksOf=list=>Object.fromEntries(list.map(t=>[t.id,t]));
const opts={speed:50,reach:24,horizon:2.6};
const self={x:200,y:200};
const ring=(n,r,from=0,span=2*Math.PI)=>Array.from({length:n},(_,i)=>{const a=from+span*i/n;return V('R'+i,self.x+Math.cos(a)*r,self.y+Math.sin(a)*r);});
const corridorOpts=(extra={})=>({width:400,height:400,scale:400,radius:9,selfSpeed:150,enemySpeed:50,reach:24,free:()=>true,direct:()=>true,...extra});

// --- Perception: only observation tracks, bounded memory ---
test('perception keeps visible tracks at their observed position',()=>{const p=sw.perceive(tracksOf([V('a',50,60)]),10);assert.equal(p.length,1);assert.deepEqual([p[0].x,p[0].y,p[0].confidence],[50,60,1]);});
test('perception drops memory older than the bounded horizon',()=>{const p=sw.perceive({a:V('a',50,60,{status:'memory',lastSeen:5,confidence:.4})},10,{memoryHorizon:2.4});assert.equal(p.length,0);});
test('fresh memory is dead-reckoned from the last seen track, not a hidden truth',()=>{
 const tr={a:V('a',100,100,{status:'memory',lastSeen:9.5,vx:20,vy:0,confidence:.9,uncertainty:20})};
 const p=sw.perceive(tr,10,{memoryHorizon:2.4,width:400,height:400});
 assert.equal(p.length,1);assert.ok(Math.abs(p[0].x-110)<1e-9);assert.equal(p[0].y,100);
 assert.ok(p[0].confidence<.9&&p[0].confidence>0);assert.equal(p[0].status,'memory');});
test('memory extrapolation is capped and stays inside the arena',()=>{const p=sw.perceive({a:V('a',395,100,{status:'memory',lastSeen:9,vx:140,vy:0,confidence:.9})},10,{memoryHorizon:2.4,width:400,height:400});assert.ok(p[0].x<=400&&p[0].x>=0);});
test('perception ignores malformed and non-finite tracks',()=>{const p=sw.perceive({a:{id:'a',x:NaN,y:3,status:'visible'},b:null,c:{id:'c',x:1,y:2,status:'gone'}},10);assert.equal(p.length,0);});

// --- Time to contact ---
test('time to contact is finite for an approaching melee bot',()=>{const t=sw.timeToContact(self,V('a',300,200),opts);assert.ok(Number.isFinite(t.seconds));assert.ok(Math.abs(t.seconds-(100-24)/50)<1e-9);});
test('closer bot reaches sooner',()=>assert.ok(sw.timeToContact(self,V('a',260,200),opts).seconds<sw.timeToContact(self,V('a',330,200),opts).seconds));
test('bot already within reach has zero time to contact',()=>assert.equal(sw.timeToContact(self,V('a',215,200),opts).seconds,0));
test('observed fast closing velocity shortens the estimate',()=>{const slow=sw.timeToContact(self,V('a',300,200),opts).seconds,fast=sw.timeToContact(self,V('a',300,200,{vx:-120}),opts).seconds;assert.ok(fast<slow);});
test('no nominal speed and no motion means no predicted contact',()=>assert.equal(sw.timeToContact(self,V('a',300,200),{reach:24,speed:0}).seconds,Infinity));
test('remembered (uncertain) bot is treated pessimistically and with lower confidence',()=>{const v=sw.timeToContact(self,V('a',300,200),opts),m=sw.timeToContact(self,{...V('a',300,200),status:'memory',confidence:.5,uncertainty:30},opts);assert.ok(m.seconds<v.seconds);assert.ok(m.confidence<v.confidence);});

// --- Threat map / encirclement ---
test('empty threat map is clear and numeric',()=>{const m=sw.threatMap(self,[],opts);assert.equal(m.level,'clear');assert.equal(m.risk,0);assert.equal(m.inbound,0);assert.equal(m.soonest,Infinity);});
test('one approaching bot is not an encirclement',()=>{const m=sw.threatMap(self,[V('a',290,200)],opts);assert.ok(m.risk<.35,'risk '+m.risk);assert.ok(m.gap.width>Math.PI);});
test('ring of bots closing in is critical encirclement',()=>{const m=sw.threatMap(self,ring(7,110),opts);assert.ok(['danger','critical'].includes(m.level),m.level);assert.ok(m.gap.width<Math.PI*.6);});
test('bots on three sides leave the open side as the escape gap',()=>{
 const m=sw.threatMap(self,ring(5,100,Math.PI*.5,Math.PI*1.0).concat(),opts);
 // Threats span the left half (90°..270°), so the gap points to +x.
 assert.ok(Math.cos(m.gap.angle)>.7,'gap angle '+m.gap.angle);});
test('distant bots beyond the forecast horizon are not inbound',()=>{const m=sw.threatMap(self,ring(6,380),opts);assert.equal(m.inbound,0);assert.equal(m.level,'clear');});
test('walls that block open directions raise encirclement risk',()=>{
 const threats=ring(3,100,Math.PI*.75,Math.PI*.5);
 const open=sw.threatMap(self,threats,opts).risk;
 const walled=sw.threatMap(self,threats,{...opts,open:a=>Math.cos(a)<-.2}).risk;
 assert.ok(walled>open,`walled ${walled} > open ${open}`);});
test('remembered bots weigh less than visible bots at the same place',()=>{
 const vis=sw.threatMap(self,ring(4,100,0,Math.PI),opts).pressure;
 const mem=sw.threatMap(self,ring(4,100,0,Math.PI).map(t=>({...t,status:'memory',confidence:.3})),opts).pressure;
 assert.ok(mem<vis);});
test('extreme swarm counts stay finite',()=>{const m=sw.threatMap(self,ring(60,90),opts);assert.ok(Number.isFinite(m.risk)&&m.risk<=1&&m.risk>=0);assert.ok(Number.isFinite(m.gap.angle));});

// --- Corridor choice ---
test('corridor escapes through the gap, away from a three-sided swarm',()=>{
 const threats=ring(5,95,Math.PI*.5,Math.PI);const r=sw.chooseCorridor(self,threats,corridorOpts());
 assert.ok(r);assert.ok(r.goal.x>self.x+30,'goal '+JSON.stringify(r.goal));assert.ok(r.margin>0);});
test('corridor goals respect arena bounds and free-space checks',()=>{
 const r=sw.chooseCorridor({x:30,y:30},[V('a',80,40),V('b',40,90)],corridorOpts({free:p=>p.x<300}));
 assert.ok(r);assert.ok(r.goal.x>=18&&r.goal.y>=18&&r.goal.x<300&&r.goal.y<=382);});
test('no corridor is invented when every destination is blocked',()=>assert.equal(sw.chooseCorridor(self,[V('a',260,200)],corridorOpts({free:()=>false})),null));
test('no threats means no evasive corridor',()=>assert.equal(sw.chooseCorridor(self,[],corridorOpts()),null));
test('corridor avoids a lane that a flanking bot can intercept',()=>{
 // Chasers come from the left; a flanker waits right on the straight "away" line.
 const threats=[V('a',140,200),V('b',150,170),V('c',150,230),V('f',300,200)];
 const r=sw.chooseCorridor(self,threats,corridorOpts());
 assert.ok(r);const lane=sw.routeMargin(self,[r.goal],threats,corridorOpts());
 assert.ok(lane>0,'margin '+lane);
 assert.ok(Math.abs(r.goal.y-200)>40,'should leave the intercepted straight lane '+JSON.stringify(r.goal));});
test('corridor avoids dead-end pockets with poor openness',()=>{
 // Everything right of x=300 is a pocket: reachable but almost no exits from inside.
 const threats=ring(4,95,Math.PI*.6,Math.PI*.8);
 const direct=(a,b)=>!(a.x>300&&b.x>a.x)&&!(a.x>300&&Math.abs(b.y-a.y)>8&&b.x>=a.x-8);
 const r=sw.chooseCorridor(self,threats,corridorOpts({direct}));
 assert.ok(r);assert.ok(r.goal.x<=300,'avoid pocket '+JSON.stringify(r.goal));});
test('corridor never proposes a destination through a blocked straight lane when an open one exists',()=>{
 const r=sw.chooseCorridor(self,[V('a',140,200)],corridorOpts({direct:(a,b)=>b.y<=a.y}));
 assert.ok(r&&r.direct===true);});

// --- Route cut detection ---
test('route margin is negative when a bot sits on the remaining path',()=>assert.ok(sw.routeMargin(self,[{x:300,y:200},{x:380,y:200}],[V('a',300,210)],corridorOpts())<0));
test('route margin is positive when bots are behind',()=>assert.ok(sw.routeMargin(self,[{x:300,y:200}],[V('a',120,200)],corridorOpts())>0));
test('empty route has no margin to report',()=>assert.equal(sw.routeMargin(self,[],[V('a',120,200)],corridorOpts()),Infinity));

// --- Decision policy (hysteresis, toggles) ---
const map=level=>({level,risk:{clear:0,watch:.2,danger:.55,critical:.9}[level],soonest:1,inbound:3});
test('disabled predictive defense never acts (baseline A/B path)',()=>assert.equal(sw.decide({enabled:false,map:map('critical'),now:5}).act,false));
test('clear or watch levels do not cause needless relocation',()=>{assert.equal(sw.decide({enabled:true,map:map('clear'),now:5}).act,false);assert.equal(sw.decide({enabled:true,map:map('watch'),now:5}).act,false);});
test('danger triggers a preemptive move before contact',()=>{const d=sw.decide({enabled:true,map:map('danger'),now:5,lastAt:-10});assert.equal(d.act,true);assert.equal(d.reason,'encircle_risk');assert.ok(d.label.length>0);});
test('an in-flight safe evasive route is not interrupted',()=>assert.equal(sw.decide({enabled:true,map:map('danger'),now:5,lastAt:4.5,evading:true,routeMargin:.8}).act,false));
test('a route being cut off triggers a new corridor',()=>{const d=sw.decide({enabled:true,map:map('danger'),now:5,lastAt:4.5,evading:true,routeMargin:-.2});assert.equal(d.act,true);assert.equal(d.reason,'route_cut');});
test('cooldown limits repeated replanning outside critical danger',()=>assert.equal(sw.decide({enabled:true,map:map('danger'),now:5,lastAt:4.9}).act,false));
