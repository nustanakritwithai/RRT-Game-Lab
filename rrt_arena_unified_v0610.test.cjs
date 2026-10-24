'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const section=(a,b)=>{const start=html.indexOf('function '+a+'('),end=html.indexOf('function '+b+'(',start+12);assert.ok(start>=0,'Missing function '+a);assert.ok(end>start,'Missing end '+b);return html.slice(start,end);};
test('the latest BLUE uses one feature policy across every combat mode',()=>{
 const flags=section('blueFeatureOn','predictiveActive');
 for(const mode of ['predictive','rangedDefense','mobile'])assert.ok(flags.includes(mode),mode);
 assert.doesNotMatch(section('predictiveActive','swarmForecast'),/enemyMode/);
 assert.doesNotMatch(section('rangedDefenseActive','rangedThreatWorld'),/enemyMode/);
 assert.doesNotMatch(section('mobileActive','keepMoving'),/enemyMode/);
});
test('the screenshot green indicator is drawn for every BLUE member, not just B1',()=>{
 const drawing=section('drawSwarmForecast','drawMultiTargets');
 assert.match(drawing,/team\.blues/);
 assert.match(drawing,/drawBlueCapabilityRing\(b\)/);
 assert.match(drawing,/team\.secondary\?\.forecast/);
 assert.match(html,/ctx\.strokeStyle='#86ffc5'/);
});
test('duel BLUE can use the observed RED ranged-defense adapter, never hidden RED coordinates',()=>{
 const adapter=section('duelShooterTrack','rangedThreatWorld');
 assert.match(adapter,/botKnowledge\(bot\)/);
 assert.doesNotMatch(adapter,/bots\[1\]\.x|bots\[1\]\.y/);
 const defWorld=section('rangedThreatWorld','rangedCoverGoal');
 assert.match(defWorld,/duelShooterTrack\(bot\)/);
 const duel=section('loopStep','drawGrid');
 assert.match(duel,/rangedDefenseCheck\(blue\)/);
 assert.match(duel,/keepMoving\(blue,dt\)/);
});
test('B1 and B2 call unchanged V0.6.8 BLUE RRT engine and receive their own defense context',()=>{
 const setup=section('setupBlueTeam','withBlueContext');
 assert.match(setup,/spawnBot\('blue'/);
 const ctx=section('withBlueContext','setupMultiTargets');
 assert.match(ctx,/team\.secondary/);
 const duo=section('duoBlueTurn','loopDuoStep');
 for(const call of ['predictiveCheck','rangedDefenseCheck','keepMoving','checkPlanning','runPlanner','moveBot','shoot'])assert.ok(duo.includes(call),call);
});
test('the green BLUE identity ring is rendered in the duel and all multi modes',()=>{
 const src=section('draw','updateHUD');
 assert.match(src,/drawSwarmForecast\(\)/);
 assert.match(src,/drawBlueCapabilityRing\(bots\[0\]\)/);
});
