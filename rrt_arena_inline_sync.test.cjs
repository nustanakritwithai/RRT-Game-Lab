'use strict';
// index.html is deployed alone (offline-safe), so each tested module is inlined there.
// These checks make sure the game page runs exactly the code the unit tests cover.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const modules={arenaCore:'rrt_arena_v05_core.js',agentMemoryCore:'rrt_arena_memory_v061.js',guidedSampler:'rrt_arena_guided_v061.js',
 activeTacticsCore:'rrt_arena_tactics_v062.js',dynamicDefenseCore:'rrt_arena_defense_v063.js',arenaMultiCore:'rrt_arena_multi_v064.js',
 meleeWaveCore:'rrt_arena_melee_v065.js',swarmPredictCore:'rrt_arena_swarm_v066.js',rangedEnemyCore:'rrt_arena_ranged_v067.js',rangedDefenseCore:'rrt_arena_rangeddef_v068.js'};
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
test('page advertises the V0.6.8 build',()=>assert.match(html,/<title>RRT ARENA 06\.8/));

const vm=require('node:vm');
test('all standalone inline scripts parse as JavaScript',()=>{
 const blocks=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
 assert.ok(blocks.length>=10,'all original modules, ranged module, and live game script');
 for(let i=0;i<blocks.length;i++)assert.doesNotThrow(()=>new vm.Script(blocks[i][1],{filename:'index:inline:'+i}));
});
test('ranged module is loaded before the live BLUE arena',()=>{
 assert.ok(html.indexOf('<script id="rangedEnemyCore">')<html.indexOf('rangedCore=globalThis.RRTArenaRanged'));
});
