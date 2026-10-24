'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
test('page exposes ranged and mixed enemy selection without replacing BLUE',()=>{
 assert.match(html,/id="multiEnemyMode"/);assert.match(html,/<option value="ranged">/);
 assert.match(html,/<option value="mixed">/);
 assert.match(html,/spawnBot\('blue',W\*\.085,H\*\.81\)/);
 assert.match(html,/function currentIntent\(bot\)/);
 assert.match(html,/function runPlanner\(bot,budget\)/);
});
test('new controller uses observation-only ranged API and wall-safe movement',()=>{
 for(const method of ['observeBlue','planBasicBot','moveBasicBot','tryFire','advanceProjectile'])assert.ok(html.includes('rangedCore.'+method));
 assert.match(html,/isFree:p=>freePoint\(p,R\+1\)/);
 assert.match(html,/pathClear:\(a,b\)=>!blocked\(a,b,R\+1\)/);
});
test('ranged projectiles do not enter BLUE shot list or call direct damage on firing',()=>{
 assert.match(html,/multi\.rangedShots\.push\(fired\.shot\)/);
 assert.match(html,/rangedCore\.advanceProjectile\(shot,dt/);
 assert.match(html,/r\.impact\?\.type==='target'/);
});
test('melee strikes explicitly exclude shooter bots',()=>{
 assert.match(html,/if\(attacker\.team==='ranged'\)continue/);
 assert.match(html,/function meleeOnlyTracks\(\)/);
 assert.match(html,/swarmCore\.perceive\(meleeOnlyTracks\(\)/);
});
test('ranged debug export shows deterministic seed and battle observations',()=>{
 assert.match(html,/enemyMode:multi\.enemyMode,rangedFired:multi\.rangedFired/);
 assert.match(html,/seed:benchmarkSeed/);
 assert.match(html,/notDeterministic:true/);
});
test('HUD wave-height remains fixed on narrow screens',()=>{
 assert.match(html,/\.multiWaveStats\{[^}]*height:65px;min-height:65px;overflow:hidden/);
 assert.match(html,/\.sublabel\{[^}]*height:17px;min-height:17px;overflow:hidden/);
});
