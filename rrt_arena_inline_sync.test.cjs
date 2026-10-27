'use strict';
// index.html is deployed alone (offline-safe), so each tested module is inlined there.
// These checks make sure the game page runs exactly the code the unit tests cover.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const modules={arenaCore:'rrt_arena_v05_core.js',agentMemoryCore:'rrt_arena_memory_v061.js',guidedSampler:'rrt_arena_guided_v061.js',
 activeTacticsCore:'rrt_arena_tactics_v062.js',dynamicDefenseCore:'rrt_arena_defense_v063.js',arenaMultiCore:'rrt_arena_multi_v064.js',
 meleeWaveCore:'rrt_arena_melee_v065.js',swarmPredictCore:'rrt_arena_swarm_v066.js',rangedEnemyCore:'rrt_arena_ranged_v067.js',rangedDefenseCore:'rrt_arena_rangeddef_v068.js',blueTeamCore:'rrt_arena_team_v069.js',teamAdvisorCore:'rrt_arena_coop_v0611.js',privateRadioCore:'rrt_arena_private_radio_v0612.js',leaderlessCore:'rrt_arena_leaderless_v0613.js',evidenceCore:'rrt_arena_evidence_v0614.js',duel2Core:'rrt_arena_duel_v0615.js',formationCore:'rrt_arena_formation_v0618.js'};
for(const [id,file] of Object.entries(modules)){
 test(`index.html inlines ${file} unchanged`,()=>{
  const m=html.match(new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`));
  assert.ok(m,`missing <script id="${id}">`);
  assert.equal(m[1].trim(),fs.readFileSync(path.join(__dirname,file),'utf8').trim());
 });
}
test('predictive module loads before the game script uses it',()=>{
 assert.ok(html.indexOf('<script id="swarmPredictCore">')<html.indexOf('swarmCore=globalThis.RRTArenaSwarm'));
});
test('page advertises V0.8 hierarchical combat build',()=>assert.match(html,/<title>RRT ARENA 08\.00/));

const vm=require('node:vm');
test('all standalone inline scripts parse as JavaScript',()=>{
 const blocks=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
 assert.ok(blocks.length>=10,'all original modules, ranged module, and live game script');
 for(let i=0;i<blocks.length;i++)assert.doesNotThrow(()=>new vm.Script(blocks[i][1],{filename:'index:inline:'+i}));
});
test('ranged module is loaded before the live BLUE arena',()=>{
 assert.ok(html.indexOf('<script id="rangedEnemyCore">')<html.indexOf('rangedCore=globalThis.RRTArenaRanged'));
});

test('team core is embedded before the original BLUE engine uses it',()=>assert.ok(html.indexOf('<script id="blueTeamCore">')<html.indexOf('teamCore=globalThis.RRTArenaTeam')));

test('Cooperative advisor loads before live game uses it',()=>assert.ok(html.indexOf('<script id="teamAdvisorCore">')<html.indexOf('coopCore=globalThis.RRTArenaCoop')));

test('PrivateRadio module loads before BLUE sim and is bundled for offline Pages',()=>assert.ok(html.indexOf('<script id="privateRadioCore">')<html.indexOf('commsCore=globalThis.RRTArenaPrivateRadio')));

test('leaderless BID/ACK module loads before blue simulation and is deployed offline',()=>assert.ok(html.indexOf('<script id="leaderlessCore">')<html.indexOf('leaderless=globalThis.RRTArenaLeaderless')));

test('evidence module loads before live BLUE loop',()=>assert.ok(html.indexOf('<script id="evidenceCore">')<html.indexOf('evidenceCore=globalThis.RRTArenaEvidence')));
test('per-BLUE evidence ledgers are isolated and process delivered radio',()=>{
 assert.match(html,/primary\.evidenceLedger=evidenceCore\.emptyLedger\(\)/);
 assert.match(html,/secondary\.evidenceLedger=evidenceCore\.emptyLedger\(\)/);
 assert.match(html,/evidenceCore\.ingest\(blue\.evidenceLedger,normalized,blue\.id,elapsed\)/);
 assert.match(html,/evidenceCore\.ingestLocal\(blue\.evidenceLedger,trace,blue\.id,elapsed\)/);
});
test('the radio evidence resolver is not a fire authorization pathway',()=>{
 const shot=html.slice(html.indexOf('function shoot(bot){'),html.indexOf('function burst('));
 assert.doesNotMatch(shot,/evidenceCore|evidenceLedger|radioInbox/);
});

test('2v2 policy module loads before the four-fighter gameplay loop',()=>{
 assert.ok(html.indexOf('<script id="duel2Core">')<html.indexOf('duel2Core=globalThis.RRTArenaDuel2'));
 assert.match(html,/function loopDuel2Step\(dt\)/);
});
