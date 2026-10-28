'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('./rrt_arena_campaign_v090.js');
const AI=require('./rrt_arena_campaign_ai_v090.js');
const UI=require('./rrt_arena_campaign_ui_v090.js');

const fresh=(template='nova9',seed=7)=>UI.newGame({seed,template,personality:'assault'});

test('every template sector has a layout point inside the map',()=>{
 for(const [name,t] of Object.entries(C.TEMPLATES)){const L=UI.layoutFor(name);
  const M=UI.mapSize(name),W=UI.CARD.w/2,H=UI.CARD.h/2;
  for(const [id] of t.sectors){assert.ok(L[id],name+' '+id);assert.ok(L[id].x-W>=0&&L[id].x+W<=M.w&&L[id].y-H>=0&&L[id].y+H<=M.h,id);}
  const pts=Object.values(L);for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)
   assert.ok(Math.abs(pts[i].x-pts[j].x)>=UI.CARD.w+2||Math.abs(pts[i].y-pts[j].y)>=UI.CARD.h+2,'sector cards never overlap');}
 assert.throws(()=>UI.layoutFor('nope'),/template/i);
});
test('tap own unit, then an adjacent sector, gives a move order; its own sector gives hold',()=>{
 const g=fresh(),v=UI.playerView(g);const u=v.ownUnits[0];
 let d=UI.selectUnit(UI.emptyDraft(),v,u.id);assert.equal(d.selected,u.id);
 let r=UI.tapSector(d,v,'C2');assert.equal(r.ok,true);assert.deepEqual(r.draft.orders,[{unit:u.id,type:'move',to:'C2'}]);
 assert.equal(r.draft.selected,null,'selection clears after an order');
 r=UI.tapSector(UI.selectUnit(r.draft,v,u.id),v,u.sector);assert.deepEqual(r.draft.orders,[{unit:u.id,type:'hold'}],'new order replaces the old one');
});
test('a non-adjacent destination is refused with a reason and changes nothing',()=>{
 const g=fresh(),v=UI.playerView(g);const u=v.ownUnits[0];
 const d=UI.selectUnit(UI.emptyDraft(),v,u.id),r=UI.tapSector(d,v,'C3');
 assert.equal(r.ok,false);assert.match(r.reason,/ติดกัน/);assert.deepEqual(r.draft.orders,[]);
});
test('enemy units and unknown ids cannot be selected',()=>{
 const g=fresh(),v=UI.playerView(g);
 assert.equal(UI.selectUnit(UI.emptyDraft(),v,'E-U1').selected,null);
 assert.equal(UI.selectUnit(UI.emptyDraft(),v,'zzz').selected,null);
});
test('tapping a sector with nothing selected selects the next own unit there without an order',()=>{
 const g=fresh(),v=UI.playerView(g);const ids=v.ownUnits.filter(u=>u.sector==='C1').map(u=>u.id).sort();
 let r=UI.tapSector(UI.emptyDraft(),v,'C1');assert.equal(r.draft.selected,ids[0]);
 r=UI.tapSector({...r.draft,selected:null,orders:[{unit:ids[0],type:'hold'}]},v,'C1');assert.equal(r.draft.selected,ids[1]);
 r=UI.tapSector(UI.emptyDraft(),v,'C2');assert.equal(r.draft.selected,null);assert.equal(r.ok,true);assert.equal(r.info.id,'C2');
});
test('unit actions mirror the rules: tower needs supply, merge needs a legal size, split sizes are presets',()=>{
 const g=fresh(),v=UI.playerView(g);const [a,b]=v.ownUnits;
 const acts=UI.unitActions(v,[],a.id);const by=t=>acts.filter(x=>x.type===t);
 assert.equal(by('hold').length,1);assert.equal(by('recon').length,1);
 assert.equal(by('tower')[0].enabled,v.supply>=C.RULES.towerCost);
 assert.ok(by('merge').some(x=>x.with===b.id&&x.enabled),'4+4=8 is a squad');
 assert.deepEqual(by('split').map(x=>x.sizes),[[2,2]]);
 assert.equal(by('split')[0].enabled,v.ownUnits.length<C.RULES.maxUnits,'unit cap');
 assert.equal(UI.unitActions(v,[{unit:b.id,type:'split',sizes:[2,2]}],a.id).find(x=>x.type==='split').enabled,false,'a second split this turn would pass the cap');
});
test('every action offered as enabled is accepted by the real rules engine',()=>{
 for(const template of Object.keys(C.TEMPLATES)){let g=fresh(template,3);
  for(let t=0;t<8&&!g.state.winner;t++){const v=UI.playerView(g);
   for(const u of v.ownUnits)for(const a of UI.unitActions(v,[],u.id)){
    const r=C.validateOrders(g.state,'player',[a.order]);
    assert.equal(r.ok,a.enabled,template+' t'+t+' '+JSON.stringify(a)+' '+r.reason);}
   g=UI.submitTurn(g,AI.decideOrders(v,'network',t)).game;}}
});
test('setOrder keeps one order per unit and a merge claims both units',()=>{
 const g=fresh(),v=UI.playerView(g);const [a,b]=v.ownUnits;
 let r=UI.setOrder(UI.emptyDraft(),v,{unit:b.id,type:'recon'});assert.equal(r.ok,true);
 r=UI.setOrder(r.draft,v,{unit:a.id,type:'merge',with:b.id});assert.equal(r.ok,true);
 assert.deepEqual(r.draft.orders,[{unit:a.id,type:'merge',with:b.id}],'the partner order is replaced');
 assert.equal(C.validateOrders(g.state,'player',r.draft.orders).ok,true);
 r=UI.clearOrder(r.draft,b.id);assert.deepEqual(r.orders,[],'clearing either unit removes the merge');
});
test('arrows: move draws from the unit sector to the target; other orders mark the sector',()=>{
 const g=fresh(),v=UI.playerView(g),L=UI.layoutFor('nova9');const [a,b]=v.ownUnits;
 const ar=UI.arrows(v,[{unit:a.id,type:'move',to:'C2'},{unit:b.id,type:'recon'}],L);
 assert.deepEqual(ar[0],{unit:a.id,type:'move',from:L.C1,to:L.C2});
 assert.deepEqual(ar[1],{unit:b.id,type:'recon',at:L.C1});
});
test('submitTurn runs the AI from its own fog-of-war view and advances one turn',()=>{
 const g=fresh(),v=UI.playerView(g);
 const r=UI.submitTurn(g,[{unit:v.ownUnits[0].id,type:'move',to:'C2'}]);
 assert.equal(r.game.state.turn,1);assert.equal(g.state.turn,0,'input game not mutated');
 assert.equal(r.game.turns.length,1);
 const expectEnemy=AI.decideOrders(C.viewFor(g.state,'enemy'),'assault',UI.aiSeed(g,0));
 const direct=C.resolveTurn(g.state,{player:[{unit:v.ownUnits[0].id,type:'move',to:'C2'}],enemy:expectEnemy});
 assert.deepEqual(r.game.state,direct.state);
});
test('submitTurn refuses illegal player orders without advancing',()=>{
 const g=fresh(),v=UI.playerView(g);
 const r=UI.submitTurn(g,[{unit:v.ownUnits[0].id,type:'move',to:'C3'}]);
 assert.equal(r.ok,false);assert.equal(r.game,g);
});
test('turn report never leaks hidden enemy actions',()=>{
 for(let seed=1;seed<=30;seed++){let g=fresh(seed%2?'nova9':'frontlineBasin',seed);
  for(let t=0;t<15&&!g.state.winner;t++){const before=UI.playerView(g);
   const r=UI.submitTurn(g,AI.decideOrders(before,'assault',t+seed));g=r.game;
   for(const line of r.report.lines){
    assert.ok(['player','public','battle'].includes(line.source),JSON.stringify(line));
    assert.doesNotMatch(line.text,/\bE\d+\b/,'no enemy agent ids');}
   const hiddenTypes=r.events.filter(e=>e.faction==='enemy'&&['recon','merge','split','tower','muster','produced','invalid_order'].includes(e.type));
   for(const e of hiddenTypes)assert.ok(!r.report.lines.some(l=>l.event===e),'hidden: '+JSON.stringify(e));
  }}
});
test('every reported battle is labelled abstract and never marked as learning data',()=>{
 let g=fresh('nova9',11),seen=0;
 for(let t=0;t<15&&!g.state.winner;t++){const r=UI.submitTurn(g,AI.decideOrders(UI.playerView(g),'assault',t));g=r.game;
  for(const b of r.report.battles){seen++;assert.equal(b.abstract,true);assert.equal(b.learning,false);
   assert.ok(['won','lost','draw'].includes(b.outcome));assert.ok(b.mine>=1&&b.theirs>=1);}}
 assert.ok(seen>0,'some battles happened');
});
test('save holds only seed, settings and player orders; load replays to the same state',()=>{
 let g=fresh('nova9',21);
 for(let t=0;t<6;t++)g=UI.submitTurn(g,AI.decideOrders(UI.playerView(g),'fortress',t)).game;
 const text=UI.serialize(g),save=JSON.parse(text);
 assert.equal(save.format,'rrt-campaign-save');assert.equal(save.state,undefined,'no full state (enemy positions) in the save');
 const back=UI.deserialize(text);assert.deepEqual(back.state,g.state);assert.equal(back.turns.length,6);
});
test('load rejects corrupt saves, unknown templates and saves from different rules',()=>{
 const g=UI.submitTurn(fresh(),[]).game,save=JSON.parse(UI.serialize(g));
 assert.throws(()=>UI.deserialize('{oops'),/save/i);
 assert.throws(()=>UI.deserialize(JSON.stringify({...save,format:'x'})),/save/i);
 assert.throws(()=>UI.deserialize(JSON.stringify({...save,template:'nope'})),/template/i);
 assert.throws(()=>UI.deserialize(JSON.stringify({...save,personality:'cheat'})),/personality/i);
 assert.throws(()=>UI.deserialize(JSON.stringify({...save,check:'0'})),/rules|ตรง/i);
 assert.throws(()=>UI.deserialize('x'.repeat(UI.MAX_SAVE_CHARS+1)),/large|ใหญ่/i);
});
test('supply line computed from the public view matches the rules engine',()=>{
 for(let seed=1;seed<=12;seed++){let g=fresh(seed%2?'nova9':'frontlineBasin',seed);
  for(let t=0;t<12&&!g.state.winner;t++){
   assert.deepEqual([...UI.supplyLinked(UI.playerView(g))].sort(),[...C.connectedSectors(g.state,'player')].sort());
   g=UI.submitTurn(g,AI.decideOrders(UI.playerView(g),'assault',t)).game;}}
});
test('campaign.html inlines the campaign modules unchanged and loads them in order',()=>{
 const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'campaign.html'),'utf8');
 const files={campaignCore:'rrt_arena_campaign_v090.js',campaignAiCore:'rrt_arena_campaign_ai_v090.js',campaignUiCore:'rrt_arena_campaign_ui_v090.js'};
 let last=-1;for(const [id,file] of Object.entries(files)){
  const m=html.match(new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`));assert.ok(m,'missing '+id+' (run node tools/inline_campaign_page.cjs)');
  assert.equal(m[1].trim(),fs.readFileSync(path.join(__dirname,file),'utf8').trim(),file+' out of date (run node tools/inline_campaign_page.cjs)');
  const at=html.indexOf(`<script id="${id}">`);assert.ok(at>last);last=at;}
 assert.ok(html.indexOf('<script id="campaignPage">')>last,'page script runs after the modules');
 const vm=require('node:vm');for(const b of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(b[1]));
 assert.doesNotMatch(html,/<script[^>]+src=/,'offline: no external scripts');
});
test('the report says when a BLUE unit is wiped out',()=>{
 const before=UI.playerView(fresh('nova9',7)),[a,b,c]=before.ownUnits;
 const after={...before,ownUnits:[b]};
 const r=UI.turnReport('nova9',before,[{type:'encircled',faction:'player',unit:c.id,sector:'C1'}],[],after,[]);
 assert.deepEqual(r.lines.filter(l=>l.event.type==='unit_lost').map(l=>l.event.unit),[a.id],'c is reported as encircled, not twice');
 const m=UI.turnReport('nova9',before,[],[],{...before,ownUnits:[a,c]},[{unit:a.id,type:'merge',with:b.id}]);
 assert.ok(!m.lines.some(l=>l.event.type==='unit_lost'),'a merged partner is not reported lost');
});
// ---- M4: real battles -------------------------------------------------------------------------------
const rushOrders=g=>UI.playerView(g).ownUnits.map(u=>({unit:u.id,type:'move',to:'C2'}));
const fakeEngine=(plan,{winner='blue',deadBlue=1,deadRed=2}={})=>({type:'rrt-campaign-battle',token:plan.token,winner,time:61.2,
 fighters:{blue:plan.slots.blue.map((_,i)=>'B'+(i+1)),red:plan.slots.red.map((_,i)=>'R'+(i+1))},
 alive:{blue:plan.slots.blue.map((_,i)=>'B'+(i+1)).slice(deadBlue),red:plan.slots.red.map((_,i)=>'R'+(i+1)).slice(deadRed)}});
test('a turn in steps stops at each battle and matches the one-shot turn when every battle is quick-resolved',()=>{
 const g=fresh('nova9',7),t=UI.startTurn(g,rushOrders(g));
 assert.equal(t.ok,true);assert.ok(t.spec,'turn 1 rush gives a battle at Control A');assert.equal(t.spec.sector,'C2');
 while(t.spec)UI.quickBattle(t);
 assert.deepEqual(UI.finishTurn(t).game.state,UI.submitTurn(g,rushOrders(g)).game.state);
 assert.throws(()=>UI.feedBattle(t,{}),/no battle/);
});
test('battle plan: the player is always engine BLUE, fair arena, mission and fort from the map, per-side radio',()=>{
 const g=fresh('nova9',7),t=UI.startTurn(g,rushOrders(g)),plan=UI.battlePlan(t.spec,'nova9','tok1');
 const mine=t.spec.attacker.faction==='player'?t.spec.attacker:t.spec.defender;
 assert.deepEqual(plan.slots.blue,mine.agents);assert.ok(plan.slots.blue.every(id=>/^P\d+$/.test(id)));
 assert.equal(plan.params.map,t.spec.terrain+'Fair');assert.equal(plan.params.mission,'control','contested sector = control zone');
 assert.equal(plan.params.formation,C.presetForSize(mine.size));assert.match(plan.params.seed,/^\d{1,9}$/);
 assert.ok(['0','20','50'].includes(plan.params.bloss)&&['0','0.3','0.6'].includes(plan.params.rdelay));
 const assault={...t.spec,kind:'assault',fort:2,attacker:{...t.spec.defender},defender:{...t.spec.attacker}};
 const p2=UI.battlePlan(assault,'nova9','x');assert.equal(p2.params.defender,'blue');assert.equal(p2.params.fort,'2');
 const p3=UI.battlePlan({...t.spec,kind:'meeting',sector:'C1|C2',terrain:'open'},'nova9','x');assert.equal(p3.params.mission,undefined,'meeting = elimination');
 assert.match(p3.title,/ปะทะกลางทาง/);
});
test('battle result: survivors map back to campaign agents; mismatched reports are refused',()=>{
 const g=fresh('nova9',7),t=UI.startTurn(g,rushOrders(g)),plan=UI.battlePlan(t.spec,'nova9','tok2');
 const r=UI.battleResult(plan,fakeEngine(plan,{winner:'blue',deadBlue:1,deadRed:3}));
 assert.equal(r.winner,plan.mine);assert.equal(r.source,'real');
 assert.deepEqual(r.dead[plan.mine],plan.slots.blue.slice(0,1));assert.deepEqual(r.dead[plan.theirs],plan.slots.red.slice(0,3));
 assert.throws(()=>UI.battleResult(plan,{...fakeEngine(plan),token:'other'}),/ไม่ตรง/);
 assert.throws(()=>UI.battleResult(plan,{...fakeEngine(plan),fighters:{blue:['B1'],red:['R1']}}),/จำนวน/);
 assert.throws(()=>UI.battleResult(plan,{...fakeEngine(plan),alive:{blue:['B99'],red:[]}}),/ผู้รอด/);
 assert.throws(()=>UI.battleResult(plan,{...fakeEngine(plan),winner:'green'}),/ผู้ชนะ/);
});
test('a real battle result decides the turn, injures exactly the fallen agents and is labelled real in the report',()=>{
 const g=fresh('nova9',7),t=UI.startTurn(g,rushOrders(g)),plan=UI.battlePlan(t.spec,'nova9','tok3');
 const r=UI.battleResult(plan,fakeEngine(plan,{winner:'blue',deadBlue:2,deadRed:5}));
 UI.feedBattle(t,r);while(t.spec)UI.quickBattle(t);
 const done=UI.finishTurn(t),b=done.report.battles[0];
 assert.equal(b.source,'real');assert.equal(b.abstract,false);assert.equal(b.outcome,'won');assert.equal(b.lost,2);assert.equal(b.killed,5);
 assert.ok(done.report.lines.some(l=>/การรบจริง/.test(l.text)));
 const hurt=done.game.state.roster.filter(a=>a.faction==='player'&&a.injuredTurns>0).map(a=>a.id).sort();
 assert.deepEqual(hurt,plan.slots.blue.slice(0,2).sort());
 assert.equal(done.game.state.sectors.find(s=>s.id==='C2').owner,'player','BLUE won Control A');
 assert.ok(done.game.turns[0].real&&done.game.turns[0].real[0].source==='real');
});
test('save keeps real battle results: load replays to the same state, tampering is refused',()=>{
 let g=fresh('nova9',7);const t=UI.startTurn(g,rushOrders(g)),plan=UI.battlePlan(t.spec,'nova9','tok4');
 UI.feedBattle(t,UI.battleResult(plan,fakeEngine(plan,{winner:'blue',deadBlue:2,deadRed:5})));while(t.spec)UI.quickBattle(t);
 g=UI.finishTurn(t).game;for(let k=0;k<3;k++)g=UI.submitTurn(g,AI.decideOrders(UI.playerView(g),'network',k)).game;
 const text=UI.serialize(g);assert.deepEqual(UI.deserialize(text).state,g.state);
 const quick=UI.submitTurn(fresh('nova9',7),rushOrders(fresh('nova9',7))).game,real1=UI.loadSave(UI.serialize({...g,turns:g.turns.slice(0,1),
  state:UI.submitTurn(fresh('nova9',7),rushOrders(fresh('nova9',7)),(spec,i)=>g.turns[0].real[i]||null).game.state})).game;
 assert.notDeepEqual(real1.state.roster,quick.state.roster,'the stored real result, not the coarse model, decided turn 1');
 const bad=JSON.parse(text);bad.turns[0].real[0].winner='defender';
 assert.throws(()=>UI.deserialize(JSON.stringify(bad)),/ไม่ตรง/,'edited result changes the replay, checksum refuses it');
 bad.turns[0].real[0]={winner:'attacker',dead:{attacker:'all'}};assert.throws(()=>UI.deserialize(JSON.stringify(bad)),/malformed/);
});
test('an unfinished turn is saved and resumes at the battle that was still to be fought',()=>{
 const g=fresh('nova9',7),t=UI.startTurn(g,rushOrders(g)),plan=UI.battlePlan(t.spec,'nova9','tok5');
 UI.feedBattle(t,UI.battleResult(plan,fakeEngine(plan)));
 const {game,pending}=UI.loadSave(UI.serialize(g,{orders:t.orders,real:t.real}));
 assert.deepEqual(game.state,g.state);assert.deepEqual(pending.orders,t.orders);
 const back=UI.resumeTurn(game,pending);
 assert.equal(back.index,t.index,'stored real battles are replayed, play continues where it stopped');
 assert.deepEqual(back.spec,t.spec);
});
test('version 1 saves (orders only) still load',()=>{
 let g=fresh('nova9',3);for(let k=0;k<3;k++)g=UI.submitTurn(g,AI.decideOrders(UI.playerView(g),'assault',k)).game;
 const v1=JSON.parse(UI.serialize(g));v1.version=1;v1.turns=v1.turns.map(t=>t.orders);
 assert.deepEqual(UI.deserialize(JSON.stringify(v1)).state,g.state);
});
test('engine: fair arena layouts are exactly point-symmetric and the battle bridge only runs for map battles',()=>{
 const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 for(const name of ['ruinsFair','lanesFair','openFair']){
  const m=html.match(new RegExp(' '+name+':(\\[\\[[^\\n]*?\\]\\]),?\\n'));assert.ok(m,name);
  const walls=JSON.parse(m[1].replace(/(^|[,\[])\./g,'$10.')),key=w=>w.map(v=>v.toFixed(4)).join();
  const set=new Set(walls.map(key));
  for(const [x,y,w,h] of walls)assert.ok(set.has(key([1-x-w,1-y-h,w,h])),name+' wall '+[x,y,w,h]+' has its mirror');
  assert.match(html,new RegExp('<option value="'+name+'">'));
  assert.ok(!walls.some(([x,y,w,h])=>x<.5&&x+w>.5&&y<.5&&y+h>.5),name+': centre is clear for the neutral control zone');
 }
 const bridge=html.match(/<script id="campaignBattleBridge">([\s\S]*?)<\/script>/)[1];
 assert.match(bridge,/q\.get\('mode'\)!=='duel2'\|\|q\.get\('campaign'\)!=='1'\)return;/);
 assert.match(bridge,/window\.parent\.postMessage\(result,target\)/);
 assert.doesNotMatch(bridge,/duelVisible|duelBrains|hp=|\.hp\s*=/,'the bridge only reads the result, it never changes the battle');
 assert.match(html,/const duel2SideRadio=\(\(\)=>\{const L=\['0','20','50','100'\],D=\['0','0\.3','0\.6','1\.2'\]/);
});
