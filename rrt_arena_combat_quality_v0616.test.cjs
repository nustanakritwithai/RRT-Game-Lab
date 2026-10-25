'use strict';
// V0.6.16: combat quality regressions MUST fail on old 2v2 hold-fire logic.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const block=(start,end)=>{
 const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Missing source region '+start);
 return html.slice(i,j);
};
test('Duel2 uses same observed-ally firing geometry for decisions AND bullets',()=>{
 const shot=block('function duel2Shoot(bot){','function duel2Projectiles(dt){');
 const intent=block('function currentIntent(bot){','function chooseGoal(bot){');
 assert.match(shot,/duel2LaneBlocker\(bot\)/);
 assert.match(intent,/duel2LaneBlocker\(bot\)/);
 assert.match(shot,/team\.heldFire\+\+/);
});
test('Duel2 blocked shooter tries a NEW clear firing lane using original RRT goal',()=>{
 const goal=block('function chooseGoal(bot){','function beginPlan(');
 assert.match(goal,/kind==='team_lane'/);
 assert.match(goal,/duel2Active\(\)/);
 assert.match(goal,/duel2SeenTeammates\(bot\)/);
 assert.match(goal,/coopCore\.findClearLane\(bot,foe/);
 assert.match(goal,/radioTeammates\.every\(m=>dist\(p,m\)>R\*2\.25\)/);
 assert.match(goal,/!blocked\(a,b,R\+1\)/);
});
test('Duel2 must not use secret teammate positions to plan an avoidance route',()=>{
 const planning=block('function chooseGoal(bot){','function beginPlan(');
 const lane=planning.slice(planning.indexOf("if(kind==='team_lane'"),planning.indexOf("if(kind==='evade'"));
 assert.match(lane,/duel2SeenTeammates\(bot\)/);
 assert.doesNotMatch(lane,/duel2PositionSafe|\bbots\.(?:find|filter|map)|peer\.brain|duelBrains\[peer\./);
});
test('Duel2 reports held fire and lateral reposition attempts for research',()=>{
 const debug=block('window.__rrtDuel2Debug={','window.__rrtMultiDebug={');
 assert.match(debug,/heldFire:team\.heldFire/);
 assert.match(debug,/laneMoves:team\.laneMoves/);
 assert.match(html,/🧭|มุมยิงใหม่/);
});

test('Duel2 evidence checks movement using public arena-scale speed, not fixed desktop pixels',()=>{
 const sense=block('function senseDuel2World(){','function duel2Shoot(bot){');
 assert.match(sense,/evidenceCore\.evaluate\(bot\.evidenceLedger,packet\.targetId,elapsed,\{/);
 assert.match(sense,/maxDistance:R\*2\.5/);
 assert.match(sense,/maxSpeed:bot\.moveSpeed\*S\*1\.8/);
});

const Evidence=require('./rrt_arena_evidence_v0614.js');
function movingLedger(peerX){
 const local=Evidence.ingestLocal(Evidence.emptyLedger(),
  {id:'R1',status:'visible',x:100,y:100,lastSeen:1},'B1',2);
 assert.equal(local.status,'ACCEPTED');
 const remote=Evidence.ingest(local.ledger,{
  source:'own_sensor',sender:'B2',receiver:'B1',originId:'B2',
  targetId:'R1',observationId:'b2-sighting',messageId:'message-2',
  x:peerX,y:100,confidence:.8,observedAt:1.4,deliverAt:1.7,expiresAt:4.5
 },'B1',2);
 assert.equal(remote.status,'ACCEPTED');
 return remote.ledger;
}
test('viewport-scaled evidence accepts physically plausible target movement',()=>{
 assert.equal(Evidence.evaluate(movingLedger(180),'R1',2,
  {maxDistance:40,maxSpeed:250,maxSkew:.8}).status,'CORROBORATED');
});
test('viewport-scaled evidence still flags simultaneous impossible location jumps',()=>{
 assert.equal(Evidence.evaluate(movingLedger(600),'R1',2,
  {maxDistance:40,maxSpeed:250,maxSkew:.8}).status,'CONFLICT');
});
