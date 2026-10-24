'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const m=require('./rrt_arena_ranged_v067.js');
const blue={x:190,y:130,active:true,hp:120};
const field={width:500,height:350,scale:350,radius:10};
const bot=(role='sentry',more={})=>m.createRangedBot({id:'R01',x:95,y:130,role,difficulty:'balanced',...more});
const contact=(status='visible',x=190,y=130)=>({status,x,y,lastSeen:8,confidence:status==='visible'?1:.7});
const clear=()=>true,blocked=()=>false;
test('presets contain three basic roles and are immutable',()=>{
 assert.deepEqual(m.ROLES,['sentry','patrol','hunter']);
 assert.ok(Object.isFrozen(m.DIFFICULTIES));
 assert.ok(m.statsFor('hard').damage>m.statsFor('training').damage);
 assert.equal(m.createRangedBot({id:'a',x:0,y:0,role:'unknown'}).role,'sentry');
});
test('factory keeps enemy distinct from existing BLUE',()=>{
 const r=bot('hunter');assert.equal(r.team,'ranged');assert.equal(r.id,'R01');
 assert.equal(r.track,null);assert.equal(r.ammo,m.statsFor('balanced').magazine);
});
test('sensor detects in-range visible BLUE with clear line of sight',()=>{
 const b=bot();const q=m.observeBlue(b,blue,8,{range:200,canSee:clear});
 assert.equal(q.status,'visible');assert.equal(q.x,blue.x);assert.equal(q.y,blue.y);
});
test('sensor refuses out-of-range target',()=>{
 assert.equal(m.observeBlue(bot(),{x:490,y:130,active:true},8,{range:120,canSee:clear}).status,'unknown');
});
test('sensor refuses target behind a wall',()=>{
 assert.equal(m.observeBlue(bot(),blue,8,{range:250,canSee:blocked}).status,'unknown');
});
test('sensor refuses dead or missing target',()=>{
 assert.equal(m.observeBlue(bot(),{...blue,hp:0},8,{range:300,canSee:clear}).status,'unknown');
 assert.equal(m.observeBlue(bot(),null,8).status,'unknown');
});
test('memory does not read concealed current coordinates',()=>{
 const b=bot('hunter',{track:{x:125,y:80,lastSeen:5}});
 const a=m.observeBlue(b,{x:300,y:300,active:true,hp:120},7,{range:700,canSee:blocked,ttl:5});
 assert.equal(a.status,'memory');assert.equal(a.x,125);assert.equal(a.y,80);assert.equal(a.lastSeen,5);
});
test('memory expires at TTL and cannot chase indefinitely',()=>{
 const b=bot('hunter',{track:{x:125,y:80,lastSeen:2}});
 assert.equal(m.observeBlue(b,blue,9,{range:400,canSee:blocked,ttl:5}).status,'unknown');
});
test('memory observation alone cannot issue a firing solution',()=>{
 const b=bot('hunter');
 const p=m.planBasicBot(b,contact('memory'),8,field);
 assert.equal(p.fire,false);
 assert.equal(m.tryFire(b,contact('memory'),8,{...field,canSee:clear}).shot,null);
});
test('unknown observation cannot use target ground truth',()=>{
 assert.equal(m.planBasicBot(bot('hunter'),{status:'unknown',x:190,y:130},8,field).fire,false);
 assert.equal(m.tryFire(bot(),{status:'hidden',x:190,y:130},8,{...field,canSee:clear}).shot,null);
});
test('sentry only holds position, with or without contact',()=>{
 const b=bot('sentry');
 assert.equal(m.planBasicBot(b,contact('visible'),8,field).goal,null);
 assert.equal(m.planBasicBot(b,{status:'unknown'},8,field).goal,null);
});
test('patrol follows waypoints rather than knowing BLUE path',()=>{
 const b=bot('patrol',{waypoints:[{x:95,y:130},{x:130,y:130}]});
 const p=m.planBasicBot(b,{status:'unknown'},8,field);
 assert.equal(p.kind,'patrol');assert.deepEqual(p.goal,{x:130,y:130});
});
test('patrol can fire only when an observed enemy is in range',()=>{
 const b=bot('patrol',{waypoints:[{x:110,y:130}]});
 const p=m.planBasicBot(b,contact(),8,field);
 assert.equal(p.kind,'fire');assert.equal(p.fire,true);
});
test('hunter closes distance to observed BLUE when far',()=>{
 const b=bot('hunter'),obs=contact('visible',400,130);
 const p=m.planBasicBot(b,obs,8,field);
 assert.equal(p.kind,'advance');assert.deepEqual(p.goal,{x:400,y:130});
});
test('hunter investigates last known spot but does not fire',()=>{
 const b=bot('hunter'),p=m.planBasicBot(b,contact('memory',160,200),8,field);
 assert.equal(p.kind,'investigate');assert.equal(p.fire,false);assert.deepEqual(p.goal,{x:160,y:200});
});
test('hunter backs away at close range without gaining speed',()=>{
 const b=bot('hunter',{x:190,y:135}),p=m.planBasicBot(b,contact('visible',190,130),8,field);
 assert.equal(p.kind,'backoff');assert.ok(m.distance(p.goal,{x:190,y:130})>5);
});
test('movement never exceeds speed multiplied by delta time',()=>{
 const b=bot('hunter');
 const p=m.moveBasicBot(b,{kind:'advance',goal:{x:400,y:130}},1/60,{...field,isFree:clear,pathClear:clear});
 assert.ok(m.distance(p,b)<=m.statsFor('balanced').walkSpeed*field.scale/60+1e-7);
});
test('sentry cannot move even when given a move intent',()=>{
 const b=bot('sentry');
 assert.deepEqual(m.moveBasicBot(b,{kind:'advance',goal:{x:300,y:130}},.25,{...field,isFree:clear,pathClear:clear}),b);
});
test('movement refuses swept wall collision even with clear endpoint',()=>{
 const b=bot('hunter');
 assert.deepEqual(m.moveBasicBot(b,{kind:'advance',goal:{x:300,y:130}},.25,{...field,isFree:clear,pathClear:blocked}),b);
});
test('movement refuses unprovided collision queries',()=>{
 const b=bot('hunter');
 assert.deepEqual(m.moveBasicBot(b,{kind:'advance',goal:{x:200,y:130}},.3,field),b);
});
test('patrol waypoint index advances when reaching a point',()=>{
 const b=bot('patrol',{waypoints:[{x:95,y:130},{x:105,y:130}]});
 const p=m.planBasicBot(b,{status:'unknown'},8,field);
 assert.equal(p.waypointIndex,1);
});
test('shot uses visible observation, ammo and seeded aim',()=>{
 const b=bot();
 const f=m.tryFire(b,contact(),8,{...field,canSee:clear,rng:()=>.5});
 assert.ok(f.shot);assert.equal(f.shot.ownerId,'R01');assert.equal(f.bot.ammo,b.ammo-1);
 assert.ok(f.shot.vx>0);assert.ok(Math.abs(f.shot.vy)<1e-5);
});
test('no shooting through cover',()=>{
 assert.equal(m.tryFire(bot(),contact(),8,{...field,canSee:blocked,rng:()=>.5}).shot,null);
});
test('shot is blocked if enemy is out of weapon range',()=>{
 const b=bot();assert.equal(m.tryFire(b,contact('visible',495,130),8,{...field,canSee:clear}).shot,null);
});
test('shot respects cooldown',()=>{
 assert.equal(m.tryFire(bot('sentry',{readyAt:9}),contact(),8,{...field,canSee:clear}).shot,null);
});
test('empty magazine starts reload instead of firing',()=>{
 const r=m.tryFire(bot('sentry',{ammo:0,reloadUntil:0}),contact(),8,{...field,canSee:clear});
 assert.equal(r.shot,null);assert.ok(r.bot.reloadUntil>8);
});
test('weapon cannot fire while reload timer runs',()=>{
 const r=m.tryFire(bot('sentry',{ammo:0,reloadUntil:12}),contact(),9,{...field,canSee:clear});
 assert.equal(r.shot,null);assert.equal(r.bot.ammo,0);
});
test('reload restores bounded magazine, never buffs stats',()=>{
 const b=bot('sentry',{ammo:0,reloadUntil:6});
 const r=m.tryFire(b,contact(),8,{...field,canSee:clear,rng:()=>.5});
 assert.ok(r.shot);assert.equal(r.bot.ammo,m.statsFor(b.difficulty).magazine-1);
 assert.equal(b.ammo,0);
});
test('dead bots cannot shoot or move',()=>{
 const b=bot('hunter',{hp:0,active:false});
 assert.equal(m.tryFire(b,contact(),8,{...field,canSee:clear}).shot,null);
 assert.deepEqual(m.moveBasicBot(b,{kind:'advance',goal:{x:200,y:130}},.25,{...field,isFree:clear,pathClear:clear}),b);
});
test('world projectile sweep hits a target between start and end',()=>{
 const p={ownerId:'R01',team:'ranged',x:0,y:100,vx:200,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.7,{width:500,height:350,walls:[],targets:[{id:'blue',x:100,y:100,radius:11,active:true}]});
 assert.equal(r.impact.type,'target');assert.equal(r.impact.targetId,'blue');assert.ok(r.impact.point.x<100);
});
test('wall intercepts a shot before a target',()=>{
 const p={ownerId:'R01',team:'ranged',x:0,y:100,vx:220,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.7,{width:500,height:350,walls:[{x:55,y:70,w:10,h:60}],targets:[{id:'blue',x:120,y:100,radius:9,active:true}]});
 assert.equal(r.impact.type,'wall');
});
test('target in front of wall gets hit first',()=>{
 const p={ownerId:'R01',team:'ranged',x:0,y:100,vx:220,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.7,{width:500,height:350,walls:[{x:130,y:70,w:10,h:60}],targets:[{id:'blue',x:75,y:100,radius:9,active:true}]});
 assert.equal(r.impact.type,'target');
});
test('swept projectile does not invent a hit when lane is clear',()=>{
 const p={ownerId:'R01',team:'ranged',x:0,y:100,vx:220,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.2,{width:500,height:350,walls:[],targets:[{id:'blue',x:180,y:100,radius:9,active:true}]});
 assert.equal(r.impact,null);assert.ok(r.projectile.x>0);
});
test('projectile expires and can leave the arena safely',()=>{
 const p={ownerId:'R01',team:'ranged',x:490,y:100,vx:200,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.2,{width:500,height:350,walls:[],targets:[]});
 assert.equal(r.projectile,null);
});
test('projectile ignores inactive entities and original owner',()=>{
 const p={ownerId:'R01',team:'ranged',x:0,y:100,vx:200,vy:0,ttl:2,damage:8,radius:2};
 const r=m.advanceProjectile(p,.5,{width:500,height:350,walls:[],targets:[{id:'R01',x:40,y:100,radius:10,active:true},{id:'blue',x:80,y:100,radius:10,active:false}]});
 assert.equal(r.impact,null);
});
test('all logic remains deterministic and does not mutate inputs',()=>{
 const b=Object.freeze(bot('patrol',{waypoints:Object.freeze([{x:125,y:130}])}));
 const obs=Object.freeze(contact());
 const a=m.tryFire(b,obs,8,{...field,canSee:clear,rng:()=>.27});
 const z=m.tryFire(b,obs,8,{...field,canSee:clear,rng:()=>.27});
 assert.deepEqual(a,z);assert.equal(b.ammo,m.statsFor('balanced').magazine);
});
test('range sensor fov rejects behind observer',()=>{
 const b=bot('hunter',{heading:Math.PI});
 const o=m.observeBlue(b,blue,8,{range:250,fov:Math.PI/2,canSee:clear});
 assert.equal(o.status,'unknown');
});
