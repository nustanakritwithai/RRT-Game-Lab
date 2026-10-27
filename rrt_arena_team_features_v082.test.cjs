'use strict';
// Contract checks: the V0.6.8 systems in team mode are symmetric by default and the per-team
// override exists only as an experiment hook (debug API), never as a gameplay control.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
test('team panel has one symmetric switch for both teams, on by default',()=>{
 assert.match(html,/<select id="duel2Defense"><option value="on">[^<]*ทั้งสองทีม<\/option><option value="off">/);
 assert.match(html,/duel2UI\.defense\.value=teamParams\.get\('defense'\)==='off'\?'off':'on';/);
});
test('feature gate in team mode reads the shared switch unless an experiment override is set',()=>{
 assert.match(html,/let duel2FeatureOverride=\{blue:null,red:null\}/);
 assert.match(html,/return duel2UI\.defense\.value==='on';/);
});
test('override is only reachable through the debug API',()=>{
 const writes=html.match(/duel2FeatureOverride\[[^\]]+\]=/g)||[];
 assert.equal(writes.length,1);
 assert.match(html,/setTeamFeatures:\(teamName,features\)=>/);
});
test('per-fighter defense state is swapped in and out around every fighter step',()=>{
 assert.match(html,/function withDuel2Defense\(bot,fn\)\{\n const previousBot=duel2CurrentBot;duel2CurrentBot=bot;/);
 assert.match(html,/duel2CurrentBot=previousBot;/);
});
test('team mode supports an optional, different RED formation for unequal battles',()=>{
 assert.match(html,/let duel2RedFormation=Object\.hasOwn\(formationCore\.PRESETS,teamParams\.get\('rformation'\)\)/);
 assert.match(html,/red:formationCore\.createFormation\(duel2RedPreset\(\),'red'\)/);
 assert.match(html,/setRedFormation:\(preset\)=>/);
 assert.match(html,/'B '\+blueAlive\+'\/'\+blueTotal\+' · R '\+redAlive\+'\/'\+redTotal/);
});
