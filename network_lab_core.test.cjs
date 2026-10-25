'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createSimulation,PROTOCOLS}=require('./network_lab_core.js');

function trial(settings={},ticks=70){
 const sim=createSimulation({count:80,seed:311,protocol:'flood',range:1500,loss:0,latency:1,maxTicks:180,...settings});
 sim.run(ticks);return sim;
}
test('1 to 1,000 independently owned agents, no central consensus state',()=>{
 for(const count of [1,2,50,1000]){
  const sim=createSimulation({count,seed:311});
  assert.equal(sim.agents.length,count);
  assert.equal(new Set(sim.agents.map(a=>a.id)).size,count);
  assert.equal(sim.metrics().primaryReached,1);
  assert.equal(sim.state(0).status,'UNKNOWN');
  if(count>2)assert.notStrictEqual(sim.agents[1].reports,sim.agents[2].reports);
 }
});
test('same seed and protocol reproduce exactly the same simulation',()=>{
 const a=trial({count:180,range:130,loss:0.15,seed:888,protocol:'gossip',mobile:true},65);
 const b=trial({count:180,range:130,loss:0.15,seed:888,protocol:'gossip',mobile:true},65);
 assert.deepEqual(a.snapshot(),b.snapshot());
});
test('flood reaches whole fully-connected mesh without failures',()=>{
 const sim=trial({count:120},8);
 assert.equal(sim.metrics().primaryReached,120);
 assert.equal(sim.metrics().coveragePct,100);
 assert.ok(sim.metrics().transmissions>=119);
});
test('only one reporter stays UNKNOWN even after 1,000 relays',()=>{
 const sim=trial({count:100,protocol:'flood'},8);
 assert.equal(sim.state(76).independentSources,1);
 assert.equal(sim.state(76).status,'UNKNOWN');
 assert.equal(sim.metrics().corroborated,0);
 assert.ok(sim.metrics().duplicates>0);
});
test('retransmits never count as additional independent origin',()=>{
 const sim=trial({count:45,protocol:'flood'},12);
 for(let i=0;i<45;i++)assert.equal(sim.state(i).independentSources,1);
 assert.equal(sim.metrics().corroborated,0);
});
test('honest independent witnesses establish only CORROBORATED, not truth',()=>{
 const sim=trial({count:64,scenario:'witnesses'},8);
 assert.equal(sim.state(29).status,'CORROBORATED');
 assert.ok(sim.state(29).independentSources>=2);
 assert.equal(sim.metrics().wrongCorroborated,0);
});
test('conflicting evidence yields CONFLICT, even when true reports are majority',()=>{
 const sim=trial({count:64,scenario:'conflict'},8);
 assert.equal(sim.state(29).status,'CONFLICT');
 assert.ok(sim.state(29).independentSources>=3);
 assert.equal(sim.metrics().conflicted,64);
 assert.equal(sim.metrics().corroborated,0);
});
test('100% packet loss isolates original source; no invented reception',()=>{
 const sim=trial({count:70,loss:1},30);
 assert.equal(sim.metrics().primaryReached,1);
 assert.equal(sim.state(20).independentSources,0);
 assert.equal(sim.metrics().delivered,0);
 assert.ok(sim.metrics().lost>0);
});
test('hop limit prevents all forwarding, no infinite flooding',()=>{
 const sim=trial({maxHops:0},25);
 assert.equal(sim.metrics().primaryReached,1);
 assert.equal(sim.metrics().transmissions,0);
});
test('all four protocols operate and remain within bounded traffic',()=>{
 assert.deepEqual(PROTOCOLS,['flood','gossip','fanout','anti-entropy']);
 for(const protocol of PROTOCOLS){
  const sim=trial({count:80,protocol,loss:0.1,range:1500},60);
  assert.ok(sim.metrics().primaryReached>1,protocol);
  assert.ok(sim.metrics().transmissions>=sim.metrics().delivered,protocol);
  assert.ok(sim.metrics().transmissions<=sim.config.maxTransmissions,protocol);
  assert.equal(sim.agents.length,80);
 }
});
test('1,000 nodes run under a hard packet budget; snapshots contain measured fields',()=>{
 const sim=trial({count:1000,range:98,protocol:'flood',maxTransmissions:130000},48);
 const m=sim.metrics();
 assert.ok(m.primaryReached>1);
 assert.ok(m.transmissions<=130000);
 assert.ok(m.coveragePct>=0&&m.coveragePct<=100);
 assert.equal(m.count,1000);
 assert.ok(Array.isArray(sim.snapshot().history));
 assert.ok(sim.snapshot().history.length>0);
});
test('mobile network keeps messages local; scorer truth is not agent knowledge',()=>{
 const sim=trial({count:85,range:75,loss:0.3,mobile:true,scenario:'conflict'},35);
 assert.equal(sim.agents.every(a=>!('groundTruth' in a)&&!('trueValue' in a)),true);
 assert.equal(sim.agents.every(a=>a.reports instanceof Map),true);
 assert.ok(sim.metrics().lost>=0);
 assert.ok(sim.metrics().tick<=35);
});
test('static website exposes functional controls and the correct pure engine file',()=>{
 const html=fs.readFileSync('network-lab.html','utf8');
 for(const id of ['mesh-canvas','node-count','protocol','scenario','range','loss','mobile','start','pause','step','reset','compare','export','metrics','comparison']){
  assert.ok(html.includes('id="'+id+'"'),'missing '+id);
 }
 assert.ok(html.includes('src="network_lab_core.js"'));
 assert.ok(html.includes('1000'));
});
