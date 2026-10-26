'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const text=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const block=(a,b)=>{const i=text.indexOf(a),j=text.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'Missing block '+a);return text.slice(i,j);};
test('static 2v2 mode is offered next to the unchanged 1v1 and multi modes',()=>{
 for(const mode of ['duel','duel2','multi'])assert.match(text,new RegExp('<option value="'+mode+'">'));
 assert.match(text,/id="duel2Panel"/);assert.match(text,/id="duel2Status"/);
});
test('both sides use latest BLUE spawn stats rather than original weaker RED in 2v2',()=>{
 const setup=block('function setupDuel2(){','function showOverlay(');
 assert.match(setup,/for\(const key of equalKeys\)red1\[key\]=blue1\[key\]/);
 assert.match(setup,/spawnBot\('blue',chosen\.x,chosen\.y,slot\.id\)/);
 assert.match(setup,/b\.team=slot\.team/);
 assert.match(setup,/bot\.duelDefense=\{/);
});
test('each fighter owns separate per-opponent memories, sensors, RRT planner and radio inbox',()=>{
 const setup=block('function setupDuel2(){','function showOverlay(');
 for(const marker of [/bot\.duelBrains=Object\.create\(null\)/,
  /bot\.duelSearchBrain=mem\.createMemory/,/bot\.duelInbox=duel2Core\.makeInbox/,
  /bot\.evidenceLedger=evidenceCore\.emptyLedger/])assert.match(setup,marker);
 const sense=block('function senseDuel2World(){','function duel2Shoot(');
 assert.match(sense,/mem\.updateObservation\(brain,/);
 assert.match(sense,/seen=foe\.hp>0&&dist\(bot,foe\)<=S\*1\.12&&clearSight\(bot,foe\)/);
 assert.match(sense,/duel2Core\.chooseTarget\(bot,candidates,previous,\{\s*scale:S,now:elapsed/);
 assert.match(sense,/teamCore\.receive\(team\.radio,bot\.id,elapsed/);
 assert.match(sense,/leaderless\.negotiate\(bot,visibleNow,selected,bot\.bidInbox/);
 assert.doesNotMatch(sense,/bot\.duelTargetId\s*=\s*peer\.duelTargetId|bot\.duelBrains\s*=\s*peer\.duelBrains/);
});
test('both teams use same ranged-threat defense and keep-moving via local tactical context',()=>{
 const loop=block('function loopDuel2Step(dt){','function loopStep(dt){');
 assert.match(loop,/for\(const bot of bots\)/);
 assert.match(loop,/withRngStream\(bot\.id/);
 assert.match(loop,/withDuel2Defense\(bot/);
 for(const marker of [/rangedDefenseCheck\(bot\)/,/checkPlanning\(bot,dt\)/,
 /runPlanner\(bot,28\)/,/dodgeMove\(bot,dt\)/,
 /moveBot\(bot,dt\)/,/keepMoving\(bot,dt\)/,/duel2Shoot\(bot\)/])
 assert.match(loop,marker);
});
test('duel2 radio exchange is direct sender and receiver only and obeys fault transport',()=>{
 const sense=block('function senseDuel2World(){','function duel2Shoot(');
 assert.match(sense,/sendRadioPacket\(r=>duel2Core\.sendSightings/);
 assert.match(sense,/sendRadioPacket\(r=>leaderless\.sendBid/);
 assert.match(sense,/evidenceCore\.ingest\(bot\.evidenceLedger,normalized,bot\.id,elapsed\)/);
 assert.match(sense,/duel2Core\.receive\(bot\.duelInbox,validated,bot\.id,elapsed\)/);
 const network=block('function sendRadioPacket(build){','const multiActive=');
 assert.match(network,/duel2Active\(\)\?duel2UI\.radioLoss:multiUI\.radioLoss/);
});
test('radio sightings never bypass local sight and are not passed to shooting',()=>{
 const sense=block('function senseDuel2World(){','function duel2Shoot(');
 assert.match(sense,/A radio message cannot create a visible track/);
 const shoot=block('function duel2Shoot(bot){','function duel2Projectiles(');
 assert.match(shoot,/bot\.duelVisible\?\.\[bot\.duelTargetId\]/);
 assert.match(shoot,/!bot\.brain\.wasVisible/);
 assert.match(shoot,/!clearSight\(bot,trace\)/);
 assert.doesNotMatch(shoot,/duelInbox|radioInbox|team\.radio|bots\.find\(.*team!==/);
});
test('projectile collision stops on teammates and never damages a friendly',()=>{
 const projectiles=block('function duel2Projectiles(dt){','function loopDuel2Step(dt){');
 assert.match(projectiles,/duel2Core\.projectileContact\(shot,bots,old,next/);
 assert.match(projectiles,/if\(hit\.friendly\)\{/);
 assert.match(projectiles,/duel2FriendlyBlocks\+\+/);
 assert.ok(projectiles.indexOf('if(hit.friendly)')<projectiles.indexOf('victim.hp=Math.max'));
});
test('win condition is full-team elimination or total HP on timeout',()=>{
 const loop=block('function loopDuel2Step(dt){','function loopStep(dt){');
 assert.match(loop,/duel2Core\.resolve\(bots,elapsed,150\)/);
 assert.match(loop,/endRound\(result\.winner\)/);
 const end=block('function endRound(winner){','function firstWallHit(');
 assert.match(end,/storedLessons\[duel2Active\(\)\?bot\.id:bot\.team\]/);
});
test('mobile controls and separate HUD are wired to battle scene',()=>{
 const status=block('function updateDuel2HUD(){','function updateHUD(){');
 assert.match(status,/Math\.ceil\(hp\)\+'\/240'/);
 assert.match(status,/id/);
 assert.match(text,/duel2UI\.teamMode\.addEventListener|for\(const control of \[duel2UI\.teamMode/);
 assert.match(text,/duel2UI\.panel\.hidden=!duel2Active\(\)/);
 assert.match(text,/window\.__rrtDuel2Debug=/);
});
