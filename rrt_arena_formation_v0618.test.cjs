'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('./rrt_arena_formation_v0618.js');
const expected={
 buddy2:[2,1,1],buddy3:[3,1,1],
 group22:[4,2,1],group23:[5,2,1],group33:[6,2,1],
 squad2222:[8,4,2],squad2323:[10,4,2],squad3333:[12,4,2]
};
test('exact buddy 2/3 -> two teams/group -> two groups/squad taxonomy',()=>{
 assert.deepEqual(Object.keys(F.PRESETS).sort(),Object.keys(expected).sort());
 for(const [preset,[count,teams,groups]] of Object.entries(expected)){
  const a=F.createFormation(preset,'blue'),b=F.createFormation(preset,'red');
  for(const side of [a,b]){
   assert.equal(side.agents.length,count,preset);
   assert.equal(side.groups.length,groups,preset);
   assert.equal(side.groups.reduce((n,g)=>n+g.teams.length,0),teams,preset);
   assert.ok(side.groups.every(g=>g.teams.length===(groups===2||teams>1?2:1)),preset);
   assert.ok(side.groups.every(g=>g.teams.every(t=>t.members.length===2||t.members.length===3)),preset);
   assert.equal(new Set(side.agents).size,count,preset);
   assert.equal(Object.keys(side.membership).length,count,preset);
  }
  assert.ok(a.agents.every((id,i)=>id==='B'+(i+1)));
  assert.ok(b.agents.every((id,i)=>id==='R'+(i+1)));
  assert.deepEqual(a.groups.map(g=>g.teams.map(t=>t.members.length)),
   b.groups.map(g=>g.teams.map(t=>t.members.length)));
 }
});
test('no central tactical commander or shared sensor state in formation metadata',()=>{
 const a=F.createFormation('squad2323','blue');
 assert.equal(a.agents.length,10);
 assert.ok(!('commander' in a)&&!('worldTruth' in a)&&!('sharedMemory' in a));
 for(const member of Object.values(a.membership)){
  assert.ok(member.groupId&&member.teamId);
  assert.ok(!('role' in member)||member.role!=='commander');
 }
});
test('all links are reciprocal, same-side and bounded in degree',()=>{
 for(const name of Object.keys(expected))for(const side of ['blue','red']){
  const f=F.createFormation(name,side),prefix=side==='blue'?'B':'R';
  const serialized=new Set();
  for(const link of f.links){
   assert.match(link.a,new RegExp('^'+prefix+'[1-9]\\d*$'));
   assert.match(link.b,new RegExp('^'+prefix+'[1-9]\\d*$'));
   assert.notEqual(link.a,link.b);
   assert.ok(['buddy','group','squad'].includes(link.level));
   const pair=[link.a,link.b].sort().join('|');
   assert.ok(!serialized.has(pair),'duplicate link '+pair);
   serialized.add(pair);
   assert.ok(F.peersFor(f,link.a).includes(link.b));
   assert.ok(F.peersFor(f,link.b).includes(link.a));
  }
  assert.ok(f.agents.every(id=>F.peersFor(f,id).length<=6));
 }
});
test('connected peer mesh without a centralized hub, including mixed 2+3 teams',()=>{
 for(const name of Object.keys(expected)){
  const f=F.createFormation(name,'blue'),seen=new Set(['B1']),queue=['B1'];
  while(queue.length)for(const peer of F.peersFor(f,queue.shift())){
   if(!seen.has(peer)){seen.add(peer);queue.push(peer);}
  }
  assert.equal(seen.size,f.agents.length,name);
  if(f.agents.length>=8)assert.ok(f.agents.every(id=>F.peersFor(f,id).length>1),name);
 }
});
test('invalid formation codes and invalid color cannot build a roster',()=>{
 assert.throws(()=>F.createFormation('invalid','blue'));
 assert.throws(()=>F.createFormation('buddy2','green'));
});
test('runtime exposes formation choice while original duel2 remains the default',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
 assert.match(html,/id="duel2Formation"/);
 assert.match(html,/formationCore=globalThis\.RRTArenaFormation/);
 assert.match(html,/formationCore\.createFormation\(duel2UI\.formation\.value/);
 assert.match(html,/formationCore\.peersFor\(team\.formations\[bot\.team\],bot\.id\)/);
 assert.match(html,/window\.__rrtDuel2Debug=/);
 assert.match(html,/function setupDuel2\(\)/);
 assert.match(html,/function loopDuel2Step\(dt\)/);
});

test('extended identity modules admit B12/R12 but reject fake cross-team radio',()=>{
 const D=require('./rrt_arena_duel_v0615.js'),L=require('./rrt_arena_leaderless_v0613.js');
 const self={id:'B12',team:'blue',hp:120,x:0,y:0,ammo:6,maxAmmo:6,maxHp:120};
 const mate={id:'B11',team:'blue',hp:120,x:20,y:0};
 const enemy={id:'R12',team:'red',hp:120,x:100,y:0};
 assert.equal(D.chooseTarget(self,[{id:'R12',status:'visible',position:{x:100,y:0},age:0}]),'R12');
 const own=D.sendSightings(null,self,mate,{
 R12:{id:'R12',x:100,y:0,status:'visible',lastSeen:1,confidence:1}},1,{range:50});
 assert.equal(own.queue.length,1);
 assert.equal(D.receive(D.makeInbox(),own.queue,'B11',2).sightings.R12.targetId,'R12');
 assert.equal(D.sendSightings(null,self,enemy,{
 R12:{id:'R12',x:100,y:0,status:'visible',lastSeen:1,confidence:1}},1,{range:200}).queue.length,0);
 const tr={R12:{id:'R12',x:100,y:0,status:'visible'}};
 assert.equal(L.sendBid(null,self,mate,tr,'R12',1,{range:50}).queue.length,1);
 assert.equal(L.sendBid(null,self,enemy,tr,'R12',1,{range:200}).queue.length,0);
});
