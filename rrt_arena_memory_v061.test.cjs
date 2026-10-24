'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const m=require('./rrt_arena_memory_v061.js');
test('unknown until actual visible observation',()=>{
 const a=m.createMemory();
 assert.equal(m.knowledge(a,0).status,'unknown');
 assert.equal(m.updateObservation(a,{visible:false,position:{x:200,y:100}},1).status,'unknown');
 assert.equal(a.lastSeen,null);
});
test('records sensory contact, then last-seen position and expiry',()=>{
 const a=m.createMemory();const s=m.updateObservation(a,{visible:true,position:{x:22,y:33}},2);
 assert.equal(s.event,'spotted');assert.equal(s.status,'visible');
 assert.equal(m.updateObservation(a,{visible:false,position:{x:999,y:999}},3).event,'lost');
 const k=m.knowledge(a,4);assert.equal(k.status,'remembered');assert.deepEqual(k.position,{x:22,y:33});
 assert.equal(m.knowledge(a,12).status,'unknown');
 assert.equal(m.knowledge(a,12).position,null);
});
test('memory is copied, not a writable reference to input data',()=>{
 const a=m.createMemory(),p={x:4,y:5};m.updateObservation(a,{visible:true,position:p},1);p.x=200;
 assert.equal(m.knowledge(a,1).position.x,4);
});
test('missing or invalid observations cannot cause omniscient contact',()=>{
 const a=m.createMemory();m.updateObservation(a,{visible:true,position:{x:NaN,y:10}},2);assert.equal(a.sightings,0);
 m.updateObservation(a,null,3);assert.equal(m.knowledge(a,3).status,'unknown');
});
test('sighting increments only on reacquisition, losses counted',()=>{
 const a=m.createMemory();m.updateObservation(a,{visible:true,position:{x:1,y:1}},0);
 m.updateObservation(a,{visible:true,position:{x:2,y:2}},1);
 m.updateObservation(a,{visible:false},2);
 m.updateObservation(a,{visible:true,position:{x:3,y:3}},3);
 assert.equal(a.sightings,2);assert.equal(a.losses,1);
});
test('danger is local, bounded, decaying; clamped across coordinates',()=>{
 const a=m.createMemory();m.rememberDanger(a,{x:0.4,y:0.5},0);
 assert.ok(m.dangerAt(a,{x:.4,y:.5},0)>.9);
 assert.ok(m.dangerAt(a,{x:.99,y:.99},0)<.1);
 assert.ok(m.dangerAt(a,{x:.4,y:.5},120)<m.dangerAt(a,{x:.4,y:.5},0));
 for(let i=0;i<70;i++)m.rememberDanger(a,{x:i/70,y:(i%2?0:.9)},i);
 assert.ok(a.danger.length<=m.MAX_DANGER);
});
test('nearby repeated hits merge into stronger local danger',()=>{
 const a=m.createMemory();m.rememberDanger(a,{x:.5,y:.5},1,.2);const old=m.dangerAt(a,{x:.5,y:.5},1);
 m.rememberDanger(a,{x:.51,y:.49},2,.8);assert.equal(a.danger.length,1);
 assert.ok(m.dangerAt(a,{x:.5,y:.5},2)>old);
});
test('lessons survive new rounds at reduced strength, not sightings',()=>{
 const a=m.createMemory();m.rememberDanger(a,{x:.5,y:.5},0);
 m.updateObservation(a,{visible:true,position:{x:95,y:95}},1);
 const next=m.createMemory(m.preserveLessons(a,20));assert.equal(next.lastSeen,null);
 assert.equal(next.sightings,0);assert.ok(next.danger.length>0);
 assert.ok(next.danger[0].strength<1);
});
test('patrol is free-space constrained and independent of foe position',()=>{
 const allow=p=>p.x<70;const r=m.selectPatrolGoal('blue',0,{w:100,h:100},allow);
 assert.ok(r);assert.ok(r.point.x<70);assert.notEqual(r.index,0);
 assert.equal(m.selectPatrolGoal('blue',0,{w:100,h:100},()=>false),null);
});
test('encounter history records actual observation sites, is capped, merges close events',()=>{
 const a=m.createMemory();assert.equal(a.encounters.length,0);
 assert.equal(m.rememberEncounter(a,{x:.3,y:.4},2,.8),true);
 assert.equal(m.rememberEncounter(a,{x:.31,y:.42},3,.9),true);
 assert.equal(a.encounters.length,1);
 for(let i=0;i<65;i++)m.rememberEncounter(a,{x:(i%10)/10,y:Math.floor(i/10)/10},4+i,.7);
 assert.ok(a.encounters.length<=m.MAX_ENCOUNTERS);
 assert.equal(m.rememberEncounter(a,{x:NaN,y:1},3),false);
});
test('previous-round encounter spots preserved and weakened without carrying exact lastSeen',()=>{
 const a=m.createMemory();m.rememberEncounter(a,{x:.75,y:.30},3,.9);
 m.updateObservation(a,{visible:true,position:{x:444,y:200}},4);
 const prior=m.preserveEncounters(a,6);assert.equal(prior.length,1);
 const b=m.createMemory([],prior);assert.equal(b.lastSeen,null);assert.equal(b.wasVisible,false);
 assert.equal(b.encounters.length,1);assert.ok(b.encounters[0].strength<.9);
 assert.deepEqual(m.knowledge(b,1).position,null);
});
test('search hotspots never invent positions and reject blocked or already reached spots',()=>{
 const a=m.createMemory();assert.equal(m.selectSearchHotspot(a,0,{w:800,h:500},()=>true,{x:70,y:80},20),null);
 m.rememberEncounter(a,{x:.7,y:.3},2,.8);m.rememberEncounter(a,{x:.85,y:.75},3,.9);
 const v=m.selectSearchHotspot(a,0,{w:800,h:500},p=>p.x>600,{x:200,y:400},15);
 assert.ok(v&&v.point.x>600&&v.point.y>0);
 const n=m.selectSearchHotspot(a,0,{w:800,h:500},()=>false,{x:200,y:400},15);
 assert.equal(n,null);
});
