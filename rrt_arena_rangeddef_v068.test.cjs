'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const rd=require('./rrt_arena_rangeddef_v068.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const T=(id,x,y,extra={})=>({id,x,y,kind:'sentry',status:'visible',lastSeen:10,confidence:1,...extra});
const tracks=list=>Object.fromEntries(list.map(t=>[t.id,t]));
// A wall occupying x in [180,220], y in [100,300]: blocks sight lines that cross it.
const wall={x:180,y:100,w:40,h:200};
const crosses=(a,b)=>{for(let i=0;i<=40;i++){const t=i/40,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=wall.x&&x<=wall.x+wall.w&&y>=wall.y&&y<=wall.y+wall.h)return true;}return false;};
const canSee=(a,b)=>!crosses(a,b);
const free=p=>!(p.x>=wall.x-10&&p.x<=wall.x+wall.w+10&&p.y>=wall.y-10&&p.y<=wall.y+wall.h+10);
const world=(extra={})=>({width:400,height:400,scale:400,radius:9,range:200,ownRange:216,speed:150,canSee,free,direct:(a,b)=>!crosses(a,b),...extra});

// --- Perception of shooters: tracks only ---
test('only ranged kinds become shooters',()=>{const s=rd.perceiveShooters(tracks([T('a',10,10),T('b',20,20,{kind:'hunt'})]),10);assert.deepEqual(s.map(x=>x.id),['a']);});
test('remembered shooter keeps its last seen position with lower confidence',()=>{const s=rd.perceiveShooters({a:T('a',50,60,{status:'memory',lastSeen:8,confidence:.8})},10,{memoryHorizon:6});assert.equal(s.length,1);assert.deepEqual([s[0].x,s[0].y],[50,60]);assert.ok(s[0].confidence<.8);});
test('stale memory beyond the horizon is dropped',()=>assert.equal(rd.perceiveShooters({a:T('a',50,60,{status:'memory',lastSeen:1})},10,{memoryHorizon:6}).length,0));
test('malformed tracks are ignored',()=>assert.equal(rd.perceiveShooters({a:{id:'a',x:NaN,y:1,kind:'sentry',status:'visible'},b:null},10).length,0));

// --- Exposure ---
test('a point hidden behind a wall is not exposed',()=>assert.equal(rd.exposure({x:300,y:200},[T('a',100,200)],world()).count,0));
test('a point in open sight and range is exposed',()=>{const e=rd.exposure({x:100,y:350},[T('a',100,200)],world());assert.equal(e.count,1);assert.deepEqual(e.ids,['a']);});
test('a point beyond enemy weapon range is not exposed',()=>assert.equal(rd.exposure({x:100,y:200},[T('a',100,-1)],world({range:150})).count,0));
test('remembered shooters weigh less than visible ones',()=>{const v=rd.exposure({x:100,y:350},[T('a',100,200)],world()).weight,m=rd.exposure({x:100,y:350},[T('a',100,200,{status:'memory',confidence:.5})],world()).weight;assert.ok(m<v&&m>0);});
test('route exposure grows with time spent in sight',()=>{const s=[T('a',100,200)];const short=rd.routeExposure({x:100,y:380},{x:60,y:380},s,world()),long=rd.routeExposure({x:100,y:380},{x:100,y:250},s,world());assert.ok(long>short);});
test('route exposure is zero when no shooter sees the route',()=>assert.equal(rd.routeExposure({x:300,y:150},{x:300,y:250},[T('a',100,200)],world()),0));

// --- Fire position choice ---
test('no shooters means no defensive move',()=>assert.equal(rd.chooseFirePosition({x:100,y:200},[],world()),null));
test('under crossfire BLUE moves to a spot that breaks sight to the extra shooter',()=>{
 const shooters=[T('a',120,200),T('b',300,200)];const self={x:200,y:360};
 assert.equal(rd.exposure(self,shooters,world()).count,2);
 const r=rd.chooseFirePosition(self,shooters,world({focus:shooters[0]}));
 assert.ok(r);assert.ok(r.others===0,'others '+r.others);});
test('prefers a standoff spot: inside own range but outside the enemy range',()=>{
 const focus=T('a',200,60);const r=rd.chooseFirePosition({x:200,y:120},[focus],world({free:()=>true,canSee:()=>true,direct:()=>true,range:150,ownRange:200,focus}));
 assert.ok(r&&r.standoff,'standoff '+JSON.stringify(r));const d=dist(r.goal,focus);assert.ok(d>150&&d<=200,'distance '+d);});
test('chosen goal is free and inside the arena',()=>{const r=rd.chooseFirePosition({x:30,y:30},[T('a',120,40),T('b',40,140)],world());assert.ok(r&&free(r.goal)&&r.goal.x>=18&&r.goal.y>=18&&r.goal.x<=382&&r.goal.y<=382);});
test('never invents a position when everything is blocked',()=>assert.equal(rd.chooseFirePosition({x:100,y:200},[T('a',300,200)],world({free:()=>false})),null));
test('extreme shooter counts stay finite',()=>{const many=Array.from({length:40},(_,i)=>T('s'+i,20+i*9,20+(i%5)*70));const r=rd.chooseFirePosition({x:300,y:350},many,world());assert.ok(!r||Number.isFinite(r.score));});

// --- Assessment and decision ---
test('two shooters with sight on BLUE require relocation',()=>{const a=rd.assess({x:200,y:360},[T('a',120,200),T('b',300,200)],world());assert.equal(a.count,2);assert.equal(a.act,true);});
test('a single engaged shooter does not force retreat at full health',()=>{const a=rd.assess({x:100,y:350},[T('a',100,200)],world({focusId:'a',hpFraction:1}));assert.equal(a.act,false);});
test('a single shooter forces cover while reloading',()=>assert.equal(rd.assess({x:100,y:350},[T('a',100,200)],world({focusId:'a',reloading:true})).act,true));
test('an unengaged shooter with sight on BLUE requires relocation',()=>assert.equal(rd.assess({x:100,y:350},[T('a',100,200)],world({focusId:'z'})).act,true));
test('hidden BLUE is safe',()=>assert.equal(rd.assess({x:300,y:200},[T('a',100,200)],world()).act,false));
test('disabled defense never acts',()=>assert.equal(rd.decide({enabled:false,assessment:{act:true},now:5}).act,false));
test('decision acts on a fresh threat',()=>{const d=rd.decide({enabled:true,assessment:{act:true,count:2},now:5,lastAt:-10});assert.equal(d.act,true);assert.ok(d.label.length>0);});
test('decision keeps an in-flight safe cover route',()=>assert.equal(rd.decide({enabled:true,assessment:{act:true,count:2},now:5,lastAt:4.5,moving:true,routeExposure:0}).act,false));
test('decision re-routes when the cover route becomes exposed',()=>assert.equal(rd.decide({enabled:true,assessment:{act:true,count:2},now:5,lastAt:4,moving:true,routeExposure:1.2}).act,true));
test('decision cooldown prevents frame-by-frame replanning',()=>assert.equal(rd.decide({enabled:true,assessment:{act:true,count:2},now:5,lastAt:4.8}).act,false));

// --- Keep moving: bridge steps while RRT plans, lateral jinks while exposed ---
const open=(extra={})=>({speed:150,range:200,canSee:()=>true,free:()=>true,blocked:()=>false,...extra});
test('bridge step moves straight toward a goal whose segment is clear',()=>{const p=rd.bridgeStep({x:100,y:100},{x:200,y:100},1/60,open());assert.ok(p&&p.x>100&&Math.abs(p.y-100)<1e-9);});
test('bridge step never exceeds normal walking speed',()=>{const a={x:100,y:100};const p=rd.bridgeStep(a,{x:400,y:100},1/60,open());assert.ok(dist(a,p)<=150/60+1e-9);});
test('bridge step refuses a goal behind a wall',()=>assert.equal(rd.bridgeStep({x:100,y:200},{x:300,y:200},1/60,open({blocked:(a,b)=>crosses(a,b)})),null));
test('bridge step stops at the goal instead of overshooting',()=>{const p=rd.bridgeStep({x:100,y:100},{x:101,y:100},1,open());assert.deepEqual(p,{x:101,y:100});});
test('jink moves sideways relative to the exposing shooter',()=>{const s=[T('a',100,0)];const r=rd.jinkStep({x:100,y:150},s,1/60,open({dir:1}));assert.ok(r);assert.ok(Math.abs(r.point.y-150)<1e-6&&Math.abs(r.point.x-100)>1);});
test('jink keeps walking speed',()=>{const a={x:100,y:150};const r=rd.jinkStep(a,[T('a',100,0)],1/60,open({dir:1}));assert.ok(dist(a,r.point)<=150/60+1e-9);});
test('jink flips direction when the first side is blocked',()=>{const r=rd.jinkStep({x:100,y:150},[T('a',100,0)],1/60,open({dir:1,free:p=>p.x>=100}));assert.ok(r&&r.point.x>100&&r.dir===-1);});
test('jink never steps into more crossfire',()=>{const shooters=[T('a',100,0),T('b',300,150)];const r=rd.jinkStep({x:100,y:150},shooters,1/60,open({dir:1,canSee:(s,p)=>s.id==='a'||p.x>101}));assert.ok(!r||r.point.x<=101);});
test('no jink when no shooter can see BLUE',()=>assert.equal(rd.jinkStep({x:300,y:200},[T('a',100,200)],1/60,open({canSee})),null));
test('jink respects an avoid predicate (e.g. melee bots nearby)',()=>assert.equal(rd.jinkStep({x:100,y:150},[T('a',100,0)],1/60,open({dir:1,avoid:()=>true})),null));
test('rejoin picks the furthest waypoint reachable in a straight line',()=>{const path=[{x:110,y:100},{x:150,y:100},{x:150,y:200}];assert.equal(rd.rejoinIndex({x:120,y:100},path,0,(a,b)=>!(b.y>150)),1);});
test('rejoin keeps the current waypoint when nothing further is reachable',()=>assert.equal(rd.rejoinIndex({x:0,y:0},[{x:1,y:1},{x:2,y:2}],0,()=>false),0));

// --- Exploration memory: what BLUE has actually looked at ---
const cov=()=>rd.createCoverage(400,400,10);
test('coverage starts with every cell unseen',()=>{const c=cov();assert.equal(c.cols*c.rows,c.seen.length);assert.ok(c.seen.every(v=>v===-Infinity));});
test('cells in range and in sight are marked seen',()=>{const c=cov();rd.markVisible(c,{x:50,y:50},5,{range:120,canSee:()=>true});const i=rd.cellIndex(c,{x:70,y:60});assert.equal(c.seen[i],5);assert.equal(c.seen[rd.cellIndex(c,{x:390,y:390})],-Infinity);});
test('cells behind a wall stay unseen',()=>{const c=cov();rd.markVisible(c,{x:100,y:200},5,{range:400,canSee});assert.equal(c.seen[rd.cellIndex(c,{x:300,y:200})],-Infinity);assert.equal(c.seen[rd.cellIndex(c,{x:100,y:260})],5);});
test('explore goal heads for the area seen least recently',()=>{const c=cov();for(let i=0;i<c.seen.length;i++)c.seen[i]=10;c.seen[rd.cellIndex(c,{x:350,y:350})]=-Infinity;const g=rd.exploreGoal(c,{x:50,y:50},12,{free:()=>true});assert.ok(g&&dist(g,{x:350,y:350})<30,JSON.stringify(g));});
test('explore goal skips blocked cells',()=>{const c=cov();const g=rd.exploreGoal(c,{x:50,y:50},12,{free:p=>p.x<200});assert.ok(g&&g.x<200);});
test('explore goal returns null when nothing is free',()=>assert.equal(rd.exploreGoal(cov(),{x:50,y:50},1,{free:()=>false}),null));
