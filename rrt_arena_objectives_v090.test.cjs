'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Game=require('./rrt_arena_objectives_v090.js');
const bot=(team,x,y,hp=120,id)=>({id:id||(team==='blue'?'B1':'R1'),team,x,y,hp});
const create=(mode='control',opt={})=>Game.create(mode,{w:600,h:400},()=>true,opt);

test('default elimination mission adds no scoring or artificial objectives',()=>{
 const m=create('elimination');
 assert.equal(m.active,false);
 assert.deepEqual(m.scores,{blue:0,red:0});
 assert.equal(Game.step(m,[bot('blue',300,200)],1),null);
 assert.equal(Game.resolve(m,[],150),null);
});
test('control zone is deterministic, public, neutral and collision-safe',()=>{
 const m=create();
 assert.equal(m.active,true);
 assert.deepEqual(m.point,{x:300,y:200});
 assert.ok(m.radius>0&&m.targetSeconds>0);
 const n=Game.create('control',{w:600,h:400},p=>p.y<150);
 assert.ok(n.point.y<150,'zone must avoid map walls');
 assert.deepEqual(n.point,Game.create('control',{w:600,h:400},p=>p.y<150).point);
});
test('only physically present living fighters score, regardless of roster role',()=>{
 const m=create('control',{targetSeconds:5,radius:38});
 assert.equal(Game.step(m,[bot('blue',300,200),bot('red',570,370)],1),'blue');
 assert.equal(m.scores.blue,1);
 assert.equal(m.scores.red,0);
 assert.equal(Game.step(m,[bot('blue',300,200,0),bot('red',570,370)],1),null);
 assert.equal(m.scores.blue,1);
 assert.equal(m.presence.blue,0);
});
test('contested objective pauses scoring; no shared target/sensor information',()=>{
 const m=create('control',{targetSeconds:5,radius:38});
 Game.step(m,[bot('blue',300,200),bot('red',299,204)],.6);
 assert.equal(m.contested,true);
 assert.equal(m.owner,null);
 assert.deepEqual(m.scores,{blue:0,red:0});
 Game.step(m,[bot('blue',300,200),bot('red',500,200)],1);
 assert.equal(m.scores.blue,1);
});
test('score threshold wins while both teams have HP; elimination wins immediately',()=>{
 const m=create('control',{targetSeconds:4,radius:38});
 const bots=[bot('blue',300,200),bot('red',560,390)];
 Game.step(m,bots,2);
 assert.equal(Game.resolve(m,bots,2,150),null);
 Game.step(m,bots,2);
 assert.deepEqual(Game.resolve(m,bots,4,150).winner,'blue');
 assert.equal(Game.resolve(m,bots,4,150).reason,'objective_points');
 const other=create('control',{targetSeconds:20,radius:38});
 Game.step(other,[bot('blue',300,200),bot('red',560,390)],1);
 assert.equal(Game.resolve(other,[bot('blue',300,200,0),bot('red',560,390)],1,150).winner,'red');
 assert.equal(Game.resolve(other,[bot('blue',300,200,0),bot('red',560,390)],1,150).reason,'team_eliminated');
});
test('timeout ranks objective score not hidden enemy HP and supports draws',()=>{
 const b=[bot('blue',300,200,5),bot('red',560,390,120)];
 const m=create('control',{targetSeconds:20,radius:40});
 Game.step(m,b,4);
 const r=Game.resolve(m,b,150,150);
 assert.equal(r.winner,'blue');assert.equal(r.reason,'objective_timeout');
 assert.equal(Game.resolve(create(),b,150,150).winner,'draw');
});
test('runner role is chosen ONLY from immutable buddy membership, not hidden world state',()=>{
 assert.equal(Game.isRunner({teamId:'BG1T1',position:1}),true);
 assert.equal(Game.isRunner({teamId:'BG1T1',position:2}),false);
 assert.equal(Game.isRunner({teamId:'BG1T2',position:1}),false);
 assert.equal(Game.isRunner({teamId:'RG2T1',position:1}),true);
 assert.equal(Game.isRunner(null),false);
});
test('malformed times and coordinates cannot create fictional points',()=>{
 const m=create();
 assert.equal(Game.step(m,[bot('blue',300,200)],NaN),null);
 assert.equal(Game.step(m,[bot('blue',300,200)],-4),null);
 assert.equal(m.scores.blue,0);
 assert.throws(()=>Game.create('control',{w:0,h:100}),/bounds/i);
 assert.throws(()=>Game.create('control',{w:500,h:500},()=>false),/safe/i);
 assert.throws(()=>create('unknown'),/mode/i);
});
test('offline game page exposes mission mode, local runner goal and read-only debug score',()=>{
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 const m=html.match(/<script id="objectiveCore">\n([\s\S]*?)<\/script>/);
 assert.ok(m,'offline mission module embedded');
 assert.equal(m[1].trim(),fs.readFileSync(path.join(__dirname,'rrt_arena_objectives_v090.js'),'utf8').trim());
 for(const text of ['id="duel2Objective"','id="duel2ObjectiveStatus"',
  "missionCore=globalThis.RRTArenaObjectives",
  "missionCore.step(mission,bots,dt)",
  "missionCore.resolve(mission,bots,elapsed,150)",
  "missionCore.isRunner(bot.formationMember)"])
  assert.ok(html.includes(text),'missing gameplay integration: '+text);
 assert.match(html,/timeline\.push\(\{t:stamp,objective:mission\?\.active/);
 assert.match(html,/drawControlZone\(replayActive\?timeline/);
 const goal=html.slice(html.indexOf('function chooseGoal(bot){'),html.indexOf('function checkPlanning(bot,dt){'));
 assert.match(goal,/kind==='objective'/);
 const ai=html.slice(html.indexOf('function currentIntent(bot){'),html.indexOf('function chooseGoal(bot){'));
 assert.match(ai,/missionCore\.isRunner\(bot\.formationMember\)/);
});
