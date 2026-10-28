/* RRT ARENA V0.9 — strategic map screen logic (M3). Pure functions: no DOM, storage or timers.
 * - Everything shown to the player comes from RRTArenaCampaign.viewFor(state,'player') (fog of war);
 *   the turn report keeps only what BLUE could know (own actions, public captures, battles it fought).
 * - The RED AI decides from its own view, exactly as in auto-play.
 * - Saves hold seed, settings and BLUE's orders only; loading replays them through the rules, so a save
 *   cannot carry edited state or reveal enemy positions. A rules change is detected by a checksum.
 * - Map battles here use the coarse model: they are labelled abstract and write no learning history.
 */
(function(root,factory){'use strict';
 const cjs=typeof module==='object'&&module.exports;
 const api=factory(cjs?require('./rrt_arena_campaign_v090.js'):root.RRTArenaCampaign,cjs?require('./rrt_arena_campaign_ai_v090.js'):root.RRTArenaCampaignAI);
 root.RRTArenaCampaignUI=api;if(cjs)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,AI){
 'use strict';
 const MAX_SAVE_CHARS=200000,MAX_TURNS_IN_SAVE=60,ME='player',FOE='enemy';
 const LAYOUTS=Object.freeze({
  // NOVA-9: 3x3 grid, BLUE HQ west (C1), RED HQ east (C3).
  nova9:{h:100,at:{N1:[17,17],N2:[50,17],N3:[83,17],C1:[17,50],C2:[50,50],C3:[83,50],S1:[17,83],S2:[50,83],S3:[83,83]}},
  // Frontline Basin: BLUE south, RED north (taller map: five rows).
  frontlineBasin:{h:126,at:{'E-HQ':[50,13],'E-L':[17,38],'E-C':[50,38],'E-R':[83,38],L:[17,63],C:[50,63],R:[83,63],
   'P-L':[17,88],'P-C':[50,88],'P-R':[83,88],'P-HQ':[50,113]}}});
 /** Sector card size in map units: wide enough for a name and four unit tokens, and tappable on a phone. */
 const CARD=Object.freeze({w:29,h:23});
 function mapSize(template){const L=LAYOUTS[template];if(!L)throw new RangeError('Unknown map template '+template);return {w:100,h:L.h};}
 function layoutFor(template){const L=LAYOUTS[template];if(!L)throw new RangeError('Unknown map template '+template);
  return Object.fromEntries(Object.entries(L.at).map(([id,[x,y]])=>[id,{x,y}]));}
 function hash(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
 const RULES_SIG=hash(JSON.stringify([C.RULES,C.COARSE,AI.WEIGHTS,C.TEMPLATES]));

 // ---- game -------------------------------------------------------------------------------------
 function newGame({seed=1,template='nova9',personality='assault'}={}){
  if(!C.TEMPLATES[template])throw new RangeError('Unknown map template '+template);
  if(!AI.PERSONALITIES.includes(personality))throw new RangeError('Unknown AI personality '+personality);
  seed=seed>>>0;
  return {format:'rrt-campaign-game',seed,template,personality,state:C.create({seed,template}),turns:[]};
 }
 const playerView=g=>C.viewFor(g.state,ME);
 const aiSeed=(g,turn)=>(Math.imul(g.seed,7919)+Math.imul(turn+1,104729))>>>0;
 function submitTurn(g,orders=[]){
  const check=C.validateOrders(g.state,ME,orders);
  if(!check.ok)return {ok:false,reason:check.reason,game:g};
  if(g.state.winner)return {ok:false,reason:'เกมจบแล้ว',game:g};
  const before=playerView(g);
  const enemy=AI.decideOrders(C.viewFor(g.state,FOE),g.personality,aiSeed(g,g.state.turn));
  const res=C.resolveTurn(g.state,{player:orders,enemy});
  const game={...g,state:res.state,turns:g.turns.concat([orders.map(o=>({...o}))])};
  return {ok:true,game,events:res.events,battles:res.battles,report:turnReport(g.template,before,res.events,res.battles,C.viewFor(res.state,ME),orders)};
 }

 // ---- orders draft ------------------------------------------------------------------------------
 const emptyDraft=()=>({selected:null,orders:[]});
 /** Own supply line from public ownership only (mirrors the rules' connectedSectors): HQ outward over own sectors. */
 function supplyLinked(view){
  const own=id=>view.sectors.find(s=>s.id===id)?.owner===view.faction,hq=view.sectors.find(s=>s.hq===view.faction),seen=new Set();
  if(!hq||hq.owner!==view.faction)return seen;
  const q=[hq.id];seen.add(hq.id);
  while(q.length){const c=q.shift();for(const [a,b] of view.edges){const n=a===c?b:b===c?a:null;if(n&&!seen.has(n)&&own(n)){seen.add(n);q.push(n);}}}
  return seen;
 }
 const ownUnit=(view,id)=>view.ownUnits.find(u=>u.id===id)||null;
 const adjacent=(view,a,b)=>view.edges.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
 const touches=(o,id)=>o.unit===id||(o.type==='merge'&&o.with===id);
 const without=(orders,ids)=>orders.filter(o=>!ids.some(id=>touches(o,id)));
 const claimed=o=>[o.unit,o.type==='merge'?o.with:null].filter(Boolean);
 /** View-only mirror of the rules' order validation (the engine re-checks everything on submit). */
 function checkOrder(view,others,o){
  const u=ownUnit(view,o?.unit);if(!u)return {ok:false,reason:'ไม่มีหน่วยนี้'};
  const sec=view.sectors.find(s=>s.id===u.sector);
  switch(o.type){
   case 'move':return adjacent(view,u.sector,o.to)?{ok:true}:{ok:false,reason:'ไปได้เฉพาะเขตที่ติดกัน'};
   case 'hold':case 'recon':return {ok:true};
   case 'tower':if(sec.owner!==view.faction)return {ok:false,reason:'ต้องอยู่ในเขตของฝ่ายเรา'};
    if(sec.tower)return {ok:false,reason:'มีเสาวิทยุแล้ว'};
    return view.supply>=C.RULES.towerCost?{ok:true}:{ok:false,reason:'เสบียงไม่พอ'};
   case 'merge':{const w=ownUnit(view,o.with);
    if(!w||w.id===u.id||w.sector!==u.sector)return {ok:false,reason:'ต้องรวมกับหน่วยของเราในเขตเดียวกัน'};
    return C.presetForSize(u.size+w.size)?{ok:true}:{ok:false,reason:'ขนาดรวมไม่ตรงรูปขบวนที่มี'};}
   case 'split':{const z=o.sizes||[];
    if(z.length!==2||z[0]+z[1]!==u.size||!C.presetForSize(z[0])||!C.presetForSize(z[1]))return {ok:false,reason:'แบ่งได้เฉพาะขนาดรูปขบวนที่มี'};
    const units=view.ownUnits.length+others.filter(x=>x.type==='split').length;
    return units<C.RULES.maxUnits?{ok:true}:{ok:false,reason:'หน่วยเต็มแล้ว'};}
   default:return {ok:false,reason:'คำสั่งไม่รู้จัก'};
  }
 }
 function setOrder(draft,view,order){
  const ids=claimed(order),others=without(draft.orders,ids),r=checkOrder(view,others,order);
  if(!r.ok)return {ok:false,reason:r.reason,draft};
  return {ok:true,draft:{selected:null,orders:others.concat([{...order}])}};
 }
 const clearOrder=(draft,unitId)=>({...draft,orders:without(draft.orders,[unitId])});
 const selectUnit=(draft,view,id)=>({...draft,selected:ownUnit(view,id)?id:null});
 function tapSector(draft,view,id){
  const u=draft.selected&&ownUnit(view,draft.selected);
  if(u)return setOrder(draft,view,id===u.sector?{unit:u.id,type:'hold'}:{unit:u.id,type:'move',to:id});
  const here=view.ownUnits.filter(x=>x.sector===id).sort((a,b)=>a.id.localeCompare(b.id));
  const pick=here.find(x=>!draft.orders.some(o=>touches(o,x.id)))||here[0];
  if(pick)return {ok:true,draft:{...draft,selected:pick.id}};
  return {ok:true,draft:{...draft,selected:null},info:view.sectors.find(s=>s.id===id)||null};
 }
 const SIZE_NAME={2:'Buddy',3:'Buddy',4:'Group',5:'Group',6:'Group',8:'Squad',10:'Squad',12:'Squad'};
 const sizeLabel=n=>(SIZE_NAME[n]||'')+' '+n;
 /** Options for the selected unit's action sheet; enabled exactly when the rules would accept it. */
 function unitActions(view,orders,unitId){
  const u=ownUnit(view,unitId);if(!u)return [];
  const out=[],add=(order,label)=>{const r=checkOrder(view,without(orders,claimed(order)),order);
   out.push({type:order.type,label,order,enabled:r.ok,reason:r.ok?'':r.reason,...(order.with?{with:order.with}:{}),...(order.sizes?{sizes:order.sizes}:{})});};
  const sec=view.sectors.find(s=>s.id===u.sector);
  add({unit:u.id,type:'hold'},sec.owner===view.faction?'ตั้งรับ / เสริมป้อม':'ยืนปิดล้อม');
  add({unit:u.id,type:'recon'},'ลาดตระเวนรอบเขต');
  add({unit:u.id,type:'tower'},'สร้างเสาวิทยุ ('+C.RULES.towerCost+' เสบียง)');
  for(const w of view.ownUnits.filter(x=>x.id!==u.id&&x.sector===u.sector).sort((a,b)=>a.id.localeCompare(b.id)))
   add({unit:u.id,type:'merge',with:w.id},'รวมกับ '+w.id+' → '+sizeLabel(u.size+w.size));
  for(let a=2;a<=u.size-a;a++)if(C.presetForSize(a)&&C.presetForSize(u.size-a))add({unit:u.id,type:'split',sizes:[a,u.size-a]},'แยกเป็น '+a+' + '+(u.size-a));
  return out;
 }
 function arrows(view,orders,layout){
  return orders.map(o=>{const u=ownUnit(view,o.unit);if(!u)return null;
   return o.type==='move'?{unit:o.unit,type:'move',from:layout[u.sector],to:layout[o.to]}:{unit:o.unit,type:o.type,at:layout[u.sector]};}).filter(Boolean);
 }

 // ---- turn report (fog-of-war filtered) ---------------------------------------------------------
 function turnReport(template,before,events,battles,after=null,orders=[]){
  const names=Object.fromEntries(C.TEMPLATES[template].sectors.map(([id,name])=>[id,name]));
  const nm=id=>id&&id.includes('|')?id.split('|').map(x=>names[x]||x).join(' ↔ '):(names[id]||id);
  const side=f=>f===ME?'BLUE':'RED';
  const lines=[],put=(e,source,text,sector)=>lines.push({source,text,sector:sector||null,event:e});
  for(const e of events){const mine=e.faction===ME;
   switch(e.type){
    case 'battle':put(e,'battle',(e.kind==='meeting'?'ปะทะกลางทาง ':e.kind==='assault'?'บุกเขต ':'ชิงเขต ')+nm(e.sector),e.sector);break;
    case 'battle_round':put(e,'battle','การรบที่ '+nm(e.sector)+' ต่อยกที่ '+(e.round+1)+' (กำลังเสริมเข้าสนาม)',e.sector);break;
    case 'capture':put(e,'public',side(e.faction)+' ยึด '+nm(e.sector)+' ได้',e.sector);break;
    case 'victory':put(e,'public',(e.winner==='draw'?'เสมอ':side(e.winner)+' ชนะ')+' — '+({hq_captured:'ยึดฐานบัญชาการ',victory_points:'แต้มนำถึงเป้า',turn_limit_vp:'ครบเทิร์น แต้มมากกว่า',turn_limit_sectors:'ครบเทิร์น ครองเขตมากกว่า'}[e.reason]||e.reason));break;
    case 'retreat':mine?put(e,'player','หน่วย '+e.unit+' ถอยไป '+nm(e.to),e.to):put(e,'battle','หน่วยศัตรูถอยออกจากการรบ');break;
    case 'encircled':put(e,mine?'player':'battle',(mine?'หน่วย '+e.unit:'หน่วยศัตรู')+' ถูกล้อมที่ '+nm(e.sector)+' — ทุกนายบาดเจ็บ',e.sector);break;
    default:if(!mine)break; // enemy recon, re-organisation, towers, production: hidden by fog of war
     if(e.type==='recon')put(e,'player','หน่วย '+e.unit+' ลาดตระเวนรอบ '+nm(e.sector),e.sector);
     else if(e.type==='merge')put(e,'player','รวมหน่วยเป็น '+e.unit);
     else if(e.type==='split')put(e,'player','แยก '+e.unit+' → หน่วยใหม่ '+e.into);
     else if(e.type==='tower')put(e,'player','สร้างเสาวิทยุที่ '+nm(e.sector),e.sector);
     else if(e.type==='muster')put(e,'player','ระดมหน่วยใหม่ '+e.unit+' ที่ฐาน');
     else if(e.type==='produced')put(e,'player','โรงงานผลิต Agent ใหม่ '+e.agent+' (ยังไม่มีประสบการณ์)');
     else if(e.type==='invalid_order')put(e,'player','คำสั่งไม่ผ่าน: '+e.reason);
   }}
  // Own units that are gone after the turn (beaten to fewer than two agents) — merges and encirclements aside.
  if(after){const merged=new Set(orders.filter(o=>o.type==='merge').map(o=>o.with)),
    encircled=new Set(events.filter(e=>e.type==='encircled'&&e.faction===ME).map(e=>e.unit));
   for(const u of before.ownUnits)if(!after.ownUnits.some(x=>x.id===u.id)&&!merged.has(u.id)&&!encircled.has(u.id))
    put({type:'unit_lost',unit:u.id},'player','หน่วย '+u.id+' แตกพ่าย — ผู้รอดกลับเข้ากองหนุน ผู้บาดเจ็บพักรักษาตัว');}
  const out=[];
  for(const b of battles){const me=b.attacker.faction===ME?'attacker':'defender',them=me==='attacker'?'defender':'attacker';
   if(!b.attacker.size||!b.defender.size)continue;
   const w=b.result.winner;
   out.push({sector:b.sector,name:nm(b.sector),kind:b.kind,round:b.round||0,terrain:b.terrain,fort:b.fort,
    mine:b[me].size,theirs:b[them].size,lost:b.result.casualties[me],killed:b.result.casualties[them],
    outcome:w==='draw'?'draw':w===me?'won':'lost',abstract:true,learning:false});}
  return {turn:before.turn+1,lines,battles:out};
 }

 // ---- save / load -------------------------------------------------------------------------------
 function serialize(g){
  return JSON.stringify({format:'rrt-campaign-save',version:1,rules:RULES_SIG,seed:g.seed,template:g.template,
   personality:g.personality,turns:g.turns,check:hash(JSON.stringify(g.state))});
 }
 function deserialize(text){
  if(typeof text!=='string'||text.length>MAX_SAVE_CHARS)throw new RangeError('save too large / ไฟล์ save ใหญ่เกินไป');
  let s;try{s=JSON.parse(text);}catch{throw new SyntaxError('อ่าน save ไม่ได้ (corrupt save)');}
  if(!s||s.format!=='rrt-campaign-save'||s.version!==1)throw new TypeError('ไม่ใช่ไฟล์ save ของ RRT campaign');
  if(!C.TEMPLATES[s.template])throw new RangeError('Unknown map template '+s.template);
  if(!AI.PERSONALITIES.includes(s.personality))throw new RangeError('Unknown AI personality '+s.personality);
  if(!Array.isArray(s.turns)||s.turns.length>MAX_TURNS_IN_SAVE||!s.turns.every(t=>Array.isArray(t)&&t.every(o=>o&&typeof o==='object')))throw new TypeError('save orders malformed');
  if(s.rules!==RULES_SIG)throw new Error('save นี้มาจากกติกาเวอร์ชันอื่น (rules ไม่ตรง)');
  let g=newGame({seed:s.seed,template:s.template,personality:s.personality});
  for(const orders of s.turns){const r=submitTurn(g,orders);if(!r.ok)throw new Error('เล่นซ้ำ save ไม่ตรงกติกา: '+r.reason);g=r.game;}
  if(hash(JSON.stringify(g.state))!==s.check)throw new Error('ผลเล่นซ้ำไม่ตรงกับ save (rules ไม่ตรง)');
  return g;
 }
 return Object.freeze({CARD,MAX_SAVE_CHARS,RULES_SIG,layoutFor,mapSize,supplyLinked,newGame,playerView,aiSeed,submitTurn,emptyDraft,checkOrder,setOrder,clearOrder,
  selectUnit,tapSector,unitActions,arrows,turnReport,serialize,deserialize,sizeLabel});
});
