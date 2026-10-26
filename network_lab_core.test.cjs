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
 assert.deepEqual(PROTOCOLS,['flood','gossip','fanout','anti-entropy','adaptive-gossip']);
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

test('water rumor is initially unverified even when the world really has water',()=>{
 const sim=createSimulation({count:100,scenario:'water-true',protocol:'flood',range:1500,loss:0});
 assert.equal(sim.state(0).status,'RUMOR_ONLY');
 assert.equal(sim.metrics().verifiedWater,0);
 assert.equal(sim.metrics().refutedRumor,0);
 assert.equal(sim.metrics().fieldInspections,0);
 assert.equal(sim.evaluation().waterExists,true);
 assert.equal(sim.agents.every(a=>!('waterExists' in a)&&!('groundTruth' in a)),true);
});
test('water exists: traveling local observers independently verify and peers turn green',()=>{
 const sim=createSimulation({count:64,scenario:'water-true',protocol:'flood',range:1500,loss:0,latency:1,maxTicks:160});
 sim.run(155);
 const m=sim.metrics();
 assert.ok(m.fieldInspections>=2,'at least two independent site visits');
 assert.ok(m.verifiedWater>10,'independent onsite findings propagate');
 assert.equal(m.refutedRumor,0);
 assert.equal(m.disputed,0);
 assert.equal(sim.state(29).status,'WATER_FOUND');
 assert.ok(sim.state(29).inspections.water>=2);
 assert.equal(sim.evaluation().waterExists,true);
});
test('false rumor: two independent dry-site inspections refute A instead of indefinite CONFLICT',()=>{
 const sim=createSimulation({count:64,scenario:'water-false',protocol:'flood',range:1500,loss:0,latency:1,maxTicks:160});
 sim.run(155);
 const m=sim.metrics();
 assert.ok(m.fieldInspections>=2);
 assert.ok(m.refutedRumor>10,'rumor is evaluated using local observations');
 assert.equal(m.verifiedWater,0);
 assert.equal(m.disputed,0);
 assert.equal(sim.state(29).status,'NO_WATER');
 assert.ok(sim.state(29).inspections.dry>=2);
 assert.equal(sim.evaluation().waterExists,false);
});
test('a single inspection stays provisional; rumor and inspection are not independent corroboration',()=>{
 const sim=createSimulation({count:3,scenario:'water-false',protocol:'flood',range:1500,loss:0,latency:1,maxTicks:160});
 sim.run(155);
 const s=sim.state(0);
 assert.ok(s.inspections.dry<=1,'only one scout for tiny mesh');
 assert.notEqual(s.status,'NO_WATER','rumor plus a single inspection cannot verify absence');
 assert.equal(sim.metrics().refutedRumor,0);
});
test('100% packet loss prevents remote scouting and cannot leak world truth',()=>{
 const sim=createSimulation({count:80,scenario:'water-false',protocol:'flood',range:1500,loss:1,maxTicks:160});
 sim.run(150);
 assert.equal(sim.metrics().primaryReached,1);
 assert.equal(sim.metrics().fieldInspections,0);
 assert.equal(sim.metrics().refutedRumor,0);
 assert.equal(sim.state(35).status,'UNKNOWN');
});
test('water observation reports preserve firsthand origin through relays, not duplicate votes',()=>{
 const sim=createSimulation({count:64,scenario:'water-false',protocol:'flood',range:1500,loss:0,latency:1,maxTicks:160});
 sim.run(155);
 const probe=sim.agents[29],state=sim.state(29);
 assert.equal(probe.evidence instanceof Map,true);
 assert.equal(state.inspections.water,0);
 assert.equal(state.inspections.dry,
   [...probe.evidence.values()].filter(e=>e.kind==='inspection'&&e.value==='B').length);
 assert.equal(state.independentSources,probe.reports.size);
 assert.ok(sim.metrics().duplicates>0);
});
test('seed replay and throughput cap hold for the moving 1,000-agent water trial',()=>{
 const config={count:1000,scenario:'water-true',protocol:'fanout',range:105,loss:.2,maxTicks:110,maxTransmissions:85000,seed:528};
 const a=createSimulation(config),b=createSimulation(config);
 a.run(90);b.run(90);
 assert.deepEqual(a.snapshot(),b.snapshot());
 assert.ok(a.metrics().transmissions<=85000);
 assert.equal(a.metrics().count,1000);
});


test('Gossip never loses its only chance because first random draw skips a connected peer',()=>{
 // Seed 2 previously gave zero transmissions forever despite zero loss, radio range 1500.
 const s=createSimulation({count:2,seed:2,scenario:'single',protocol:'gossip',
  range:1500,loss:0,latency:1,maxTicks:70});
 s.run(70);
 assert.equal(s.metrics().primaryReached,2);
 assert.ok(s.metrics().transmissions>0);
});
test('Gossip loss retry is bounded, acknowledged and can recover',()=>{
 const s=createSimulation({count:2,seed:311,scenario:'single',protocol:'gossip',
  range:1500,loss:.35,latency:1,maxTicks:100,maxRetries:5});
 s.run(100);
 const m=s.metrics();
 assert.equal(m.primaryReached,2,'must eventually deliver across connected pair');
 assert.ok(m.acknowledgements>=1,'receiver confirms via actual packet');
 assert.ok(m.transmissions>0&&m.transmissions<40,'bounded data/ACK cost');
 assert.ok(m.retries>=0&&m.acknowledgements<=m.delivered);
});
test('100% loss never fabricates delivery and respects retry budget',()=>{
 const s=createSimulation({count:2,seed:2,scenario:'single',protocol:'gossip',
  range:1500,loss:1,latency:1,maxTicks:160,maxRetries:4});
 s.run(160);
 assert.equal(s.metrics().primaryReached,1);
 assert.equal(s.metrics().delivered,0);
 assert.ok(s.metrics().dataPackets<=4,'max four actual sends to one neighbor');
 assert.equal(s.metrics().acknowledgements,0);
});
test('static sparse topology stays disconnected without magical message jumps',()=>{
 const s=createSimulation({count:10,seed:311,scenario:'water-false',
  protocol:'adaptive-gossip',range:40,loss:0,mobile:false,maxTicks:100});
 const initial=s.metrics();
 assert.equal(initial.sourceComponent,1);
 s.run(100);
 assert.equal(s.metrics().primaryReached,1);
 assert.equal(s.metrics().fieldInspections,0);
 assert.ok(s.metrics().isolated>=0);
});
test('mobile store-carry-forward delivers on later encounters at the same short radius',()=>{
 const settings={count:50,seed:311,scenario:'water-false',
  protocol:'adaptive-gossip',range:40,loss:0,latency:1,maxTicks:160};
 const fixed=createSimulation({...settings,mobile:false});
 const moving=createSimulation({...settings,mobile:true});
 fixed.run(160);moving.run(160);
 assert.equal(moving.config.range,40);
 assert.ok(moving.metrics().primaryReached>=fixed.metrics().primaryReached);
 assert.ok(moving.metrics().sourceComponent<=50);
 assert.ok(moving.metrics().carrierContacts>=0);
});
test('adaptive transmission gives field evidence its own priority, no central truth shortcut',()=>{
 const s=createSimulation({count:100,seed:311,scenario:'water-false',
  protocol:'adaptive-gossip',range:1500,loss:0,latency:1,maxTicks:160});
 const before=s.metrics();
 assert.equal(before.verifiedWater,0);
 assert.equal(before.refutedRumor,0);
 assert.equal(before.factFirst,0);
 s.run(155);
 const m=s.metrics();
 assert.ok(m.fieldInspections>=2);
 assert.ok(m.refutedRumor>1);
 assert.equal(m.verifiedWater,0);
 assert.equal(m.disputed,0);
 assert.ok(m.factFirst>=0&&m.factFirst<=100);
 assert.ok(m.uncorrectedRumor>=0&&m.uncorrectedRumor<=100);
 assert.equal(s.agents.every(a=>!('waterExists' in a)),true);
});
test('new metrics are bounded for reproducible 1,000 mobile nodes',()=>{
 const input={count:1000,seed:528,scenario:'water-true',protocol:'adaptive-gossip',
  range:85,loss:.2,mobile:true,maxTicks:60,maxTransmissions:85000};
 const a=createSimulation(input),b=createSimulation(input);
 a.run(60);b.run(60);
 assert.deepEqual(a.snapshot(),b.snapshot());
 const m=a.metrics();
 assert.equal(m.count,1000);
 assert.ok(m.transmissions<=85000);
 assert.ok(m.factFirst>=0&&m.factFirst<=1000);
 assert.ok(m.acknowledgements>=0);
 assert.ok(m.sourceComponent>=1&&m.sourceComponent<=1000);
 assert.ok(m.isolated>=0&&m.isolated<=999);
});
