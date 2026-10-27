'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Archive=require('./rrt_arena_learning_archive_v091.js');
const L=require('./rrt_arena_online_learning_v082.js');
const lessons=()=>{
 const b=L.create(true,'cautious');L.tick(b,{visible:true},0);
 L.recordShot(b);L.recordConfirmedHit(b,11,true);
 L.tick(b,{visible:true},3.2);
 return b;
};
test('policy exports only a bounded tactical state, never HP/position/sensor or radio',()=>{
 const b=lessons(),policy=Archive.snapshot(b);
 assert.ok(policy);
 assert.equal(policy.style,'aggressive');
 assert.equal(policy.contexts.contact.cautious.samples,1);
 const json=JSON.stringify(policy);
 for(const name of ['hp','position','ammo','targetId','duelVisible','radio','duelBrains'])
  assert.equal(json.includes('"'+name+'"'),false);
 assert.ok(json.length<1000);
});
test('each fighter independently restores learned UCB scores across rounds',()=>{
 const a=lessons(),file=Archive.empty();
 file.policies.B1=Archive.snapshot(a);
 const b=Archive.decode(Archive.encode(file));
 const fresh=L.create(true,'balanced');
 assert.equal(Archive.apply(fresh,b.policies.B1),true);
 assert.equal(fresh.style,'aggressive');
 assert.equal(fresh.contexts.contact.cautious.samples,1);
 const r=L.create(true,'balanced');
 assert.equal(Archive.apply(r,b.policies.R1),false);
 assert.equal(r.updates,0);
 fresh.contexts.contact.cautious.mean=-.4;
 assert.notEqual(a.contexts.contact.cautious.mean,fresh.contexts.contact.cautious.mean);
});
test('restored learned policy keeps training with new own observations',()=>{
 const a=lessons();
 const b=L.create(true,'balanced');
 assert.equal(Archive.apply(b,Archive.snapshot(a)),true);
 const prev=b.updates;
 L.tick(b,{visible:true},10);
 L.recordShot(b);L.recordConfirmedHit(b,9,true);
 L.tick(b,{visible:true},13.5);
 assert.equal(b.updates,prev+1);
 assert.ok(Number.isFinite(b.totalReward));
});
test('no learning, disabled or untrained agents cannot overwrite trained policy',()=>{
 const d=L.create(false,'balanced');
 assert.equal(Archive.snapshot(d),null);
 const u=L.create(true,'balanced');
 assert.equal(Archive.snapshot(u),null);
 assert.equal(Archive.apply(d,Archive.snapshot(lessons())),false);
});
test('invalid serialized JSON, version, unknown agents, huge counts and NaN are rejected',()=>{
 assert.equal(Archive.count(Archive.decode('not-json')),0);
 assert.equal(Archive.count(Archive.decode('{"version":999,"policies":{"B1":{}}}')),0);
 assert.equal(Archive.count(Archive.decode('x'.repeat(Archive.MAX_SAMPLES*3))),0);
 const a=Archive.snapshot(lessons());
 const bad={...a,contexts:{...a.contexts,contact:{...a.contexts.contact,
  cautious:{samples:1000000000,mean:3}}}};
 const data=Archive.decode(JSON.stringify({version:Archive.VERSION,policies:{B1:a,R2:bad,B13:a,R13:a,__proto__:a}}));
 assert.equal(Archive.count(data),1);
 assert.ok(data.policies.B1);
 assert.equal(data.policies.R2,undefined);
 assert.equal(data.policies.B13,undefined);
 const forged=L.create(true);
 forged.contexts.contact.balanced.mean=Infinity;
 assert.equal(Archive.snapshot(forged),null);
});
test('archive max size remains finite even at full 12v12 roster',()=>{
 const policy=Archive.snapshot(lessons()),data=Archive.empty();
 for(const side of ['B','R'])for(let i=1;i<=12;i++)data.policies[side+i]=policy;
 const raw=Archive.encode(data);
 assert.equal(Archive.count(Archive.decode(raw)),24);
 assert.ok(raw.length<Archive.MAX_SAMPLES,'compact enough for browser storage');
});
test('default-off mode remains untouched and active persistence is opt-in only',()=>{
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.match(html,/id="duel2PersistLearning"/);
 assert.match(html,/id="duel2ClearTraining"/);
 assert.match(html,/teamParams\.get\('persist'\)==='1'/);
 assert.match(html,/duel2UI\.learning\.checked&&duel2UI\.persist\.checked/);
 assert.match(html,/archiveCore\.apply\(bot\.duelLearner,/);
 assert.match(html,/archiveCore\.snapshot\(bot\.duelLearner\)/);
 const mod=fs.readFileSync(path.join(__dirname,'rrt_arena_learning_archive_v091.js'),'utf8').trim();
 const script=html.match(/<script id="learningArchiveCore">\n([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.equal(script[1].trim(),mod);
});
