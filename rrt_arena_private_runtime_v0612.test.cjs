'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const text=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const block=(start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Expected source block '+start);return text.slice(a,b);};
test('sensing writes ONLY BLUE-local target tracks, radio reports remain inbox-only',()=>{
 const sense=block('function senseMultiWorld(){','function multiProjectiles(dt){');
 assert.match(sense,/blue\.radioInbox=commsCore\.ingest/);
 assert.match(sense,/blue\.radioInbox=commsCore\.prune/);
 assert.doesNotMatch(sense,/teamCore\.mergeTracks/);
 assert.doesNotMatch(sense,/mem\.rememberEncounter\(ownBrain/);
 assert.match(sense,/const measured=multiCore\.observe\(blue,multi\.targets,previous,elapsed/);
});
test('B2 coordination reads a delivered TARGET_CLAIM, never B1 coordinator state directly',()=>{
 const sense=block('function senseMultiWorld(){','function multiProjectiles(dt){');
 assert.match(sense,/commsCore\.peerClaim\(blue\.radioInbox,'B1',elapsed\)/);
 assert.match(sense,/commsCore\.sendClaim\(team\.radio,blue,peer,multi\.tracks/);
 assert.match(sense,/if\(peerClaim/);
 assert.doesNotMatch(sense,/team\.primaryFocus/);
});
test('radio coordinates are ONLY an exploration hint and cannot authorize firing',()=>{
 const planning=block('function chooseGoal(bot){','function beginPlan(');
 assert.match(planning,/commsCore\.radioExploreGoal\(bot\.radioInbox/);
 const shot=block('function shoot(bot){','function burst(');
 assert.match(shot,/multi\.tracks\[multi\.focus\]\?\.status!=='visible'/);
 assert.doesNotMatch(shot,/radioInbox|commsCore/);
});
test('per-agent memories and carry across rounds are keyed by B1 or B2',()=>{
 const setup=block('function setupBlueTeam(){','function withBlueContext(');
 assert.match(setup,/primary\.radioInbox=commsCore\.makeInbox\(\)/);
 assert.match(setup,/secondary\.radioInbox=commsCore\.makeInbox\(\)/);
 assert.match(setup,/spawnBot\('blue',pos\.x,pos\.y,'B2'\)/);
 const end=block('function finishMultiWave(outcome){','function meleeOnlyTracks(');
 assert.match(end,/storedLessons\[member\.id\]/);
 assert.doesNotMatch(end,/storedLessons\['blue'\]/);
});
test('random scopes are assigned by world / enemy / B1 / B2 / damage',()=>{
 assert.match(text,/rngStreams=commsCore\.createStreams\(benchmarkSeed\)/);
 assert.match(text,/withRngStream\('world',\(\)=>setupMultiTargets\(\)\)/);
 assert.match(text,/withRngStream\('enemy',\(\)=>\{stepSimpleTargets\(dt\);stepRangedTargets\(dt\);\}\)/);
 assert.match(text,/withRngStream\(blue\.id,\(\)=>withBlueContext\(/);
 assert.match(text,/withRngStream\('damage',\(\)=>multiProjectiles\(dt\)\)/);
});
