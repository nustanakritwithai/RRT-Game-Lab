/* PeerMesh Lab browser UI. Simulation rules live only in network_lab_core.js.
 * The visualization can inspect full state; agents' decision rules never receive it.
 */
(function(){
 'use strict';
 const engine=window.PeerMeshCore;
 const $=id=>document.getElementById(id);
 if(!engine||typeof engine.createSimulation!=='function'){
  $('status').textContent='ไม่สามารถโหลด Simulation Engine กรุณาโหลดหน้าใหม่';
  return;
 }
 const fieldIds=['node-count','protocol','scenario','range','loss','latency','mobile','seed','max-ticks'];
 const fields=fieldIds.map($);
 const canvas=$('mesh-canvas'),ctx=canvas.getContext('2d');
 const chart=$('coverage-chart'),ch=chart.getContext('2d');
 const compact=new Intl.NumberFormat('th-TH',{maximumFractionDigits:0});
 const palette={unknown:'#526a83',informed:'#53cfff',rumor:'#53cfff',verifying:'#ffc66d',
  corroborated:'#61e5b5',found:'#61e5b5',refuted:'#ac96f9',
  conflict:'#ff7897',source:'#ffcb72'};
 let sim=null,playing=false,comparing=false,frameId=0,lastFrame=0,selected=0,comparisonRows=[];
 let comparisonIteration=0;
 const pretty=n=>compact.format(n);
 const isWater=()=>sim&&sim.config.scenario.startsWith('water-');
 const labelsTh={
  UNKNOWN:'ยังไม่ทราบข่าว',RUMOR_ONLY:'ได้รับข่าวลือ (ยังไม่ได้ตรวจ)',
  VERIFYING:'กำลังตรวจสอบ / หลักฐานยังไม่พอ',
  WATER_FOUND:'ยืนยันพบน้ำจากผู้สำรวจ ≥2 คน',
  NO_WATER:'ตรวจไม่พบน้ำจากผู้สำรวจ ≥2 คน',
  DISPUTED:'ผลตรวจภาคสนามขัดแย้ง',
  CORROBORATED:'หลักฐานหลายต้นทางตรงกัน',CONFLICT:'หลักฐานขัดแย้ง'
 };
 function settings(){
  return {count:Number($('node-count').value),protocol:$('protocol').value,
   scenario:$('scenario').value,range:Number($('range').value),
   loss:Number($('loss').value)/100,latency:Number($('latency').value),
   mobile:$('mobile').checked,seed:Number($('seed').value),
   maxTicks:Number($('max-ticks').value),
   maxTransmissions:150000};
 }
 function note(s){$('status').textContent=s;}
 function labels(){
  $('range-value').textContent=$('range').value;
  $('loss-value').textContent=$('loss').value+'%';
  $('node-count-value').textContent=pretty(Number($('node-count').value));
 }
 function setLive(on){
  $('run-light').classList.toggle('on',on);
  $('run-label').textContent=comparing?'BENCHMARK':on?'RUNNING':sim&&sim.done?'COMPLETED':'READY';
  $('start').disabled=comparing;
  $('pause').disabled=comparing;
  $('step').disabled=comparing;
  $('reset').disabled=comparing;
  $('compare').disabled=comparing;
  $('export').disabled=comparing;
  fields.forEach(el=>{el.disabled=comparing;});
 }
 function stop(){
  playing=false;
  if(frameId)cancelAnimationFrame(frameId);
  frameId=0;lastFrame=0;
  setLive(false);
 }
 function create(){
  sim=engine.createSimulation(settings());
  selected=0;
  comparisonRows=[];
  $('comparison').textContent='';
  const el=document.createElement('p');
  el.className='hint';
  el.textContent='กด “เทียบ 4 วิธี” เพื่อทดลองทุก Protocol ในสภาพแวดล้อมเดียวกัน';
  $('comparison').append(el);
  $('compare-progress').textContent='Seed เดียวกัน';
  labels();refresh();
 }
 function reset(){
  if(comparing)return;
  stop();create();
  note('พร้อมทดลอง · กดเริ่ม หรือเลือก Agent บนแผนที่');
 }
 function runFrame(now){
  if(!playing)return;
  const delay=140/Number($('speed').value);
  if(!lastFrame)lastFrame=now;
  if(now-lastFrame>=delay){
   lastFrame=now;
   sim.step();
   refresh();
   if(sim.done){
    stop();
    note('จบการทดลอง '+sim.config.maxTicks+' ticks · ส่งออกผลหรือเปลี่ยนวิธีสื่อสารได้');
    return;
   }
  }
  frameId=requestAnimationFrame(runFrame);
 }
 function start(){
  if(comparing)return;
  if(sim.done)create();
  if(playing)return;
  playing=true;lastFrame=0;setLive(true);
  note('กำลังส่งข้อมูลระหว่าง Agent อิสระ · แตะจุดเพื่อดูข้อมูลของตัวนั้น');
  frameId=requestAnimationFrame(runFrame);
 }
 function step(){
  if(comparing)return;
  stop();
  if(!sim.done)sim.step();
  refresh();
  note('เดินหน้า 1 tick · จำนวนการรับส่งเปลี่ยนตาม Delay และ Packet Loss');
 }
 function statusOf(agent){
  const v=sim.state(agent.id);
  if(isWater()){
   switch(v.status){
    case 'WATER_FOUND':return 'found';
    case 'NO_WATER':return 'refuted';
    case 'DISPUTED':return 'conflict';
    case 'VERIFYING':return 'verifying';
    case 'RUMOR_ONLY':return agent.id===0?'source':'rumor';
    default:return 'unknown';
   }
  }
  if(agent.id===0)return 'source';
  if(v.status==='CONFLICT')return 'conflict';
  if(v.status==='CORROBORATED')return 'corroborated';
  return agent.reports.size?'informed':'unknown';
 }
 function drawWorld(){
  if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#091e31');gradient.addColorStop(1,'#06101e');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(80,143,187,.065)';ctx.lineWidth=1;
  for(let x=0;x<=w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<=h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const size=sim.agents.length;
  if(isWater()){
   const site=sim.evaluation().site;
   // The UI can show the rumored coordinates; agent decision code uses its
   // own received rumor packet and field inspection, never this canvas.
   ctx.save();
   ctx.setLineDash([5,7]);ctx.strokeStyle='rgba(255,198,109,.15)';ctx.lineWidth=1;
   for(const a of sim.agents){
    if(a.isScout&&a.seen.has('r0')&&!a.inspected){
     ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(site.x,site.y);ctx.stroke();
    }
   }
   ctx.setLineDash([]);
   const pulse=3*Math.sin(sim.tick*.24);
   ctx.beginPath();ctx.arc(site.x,site.y,21+pulse,0,Math.PI*2);
   ctx.strokeStyle='rgba(255,199,102,.45)';ctx.lineWidth=2;ctx.stroke();
   ctx.beginPath();ctx.arc(site.x,site.y,11,0,Math.PI*2);
   ctx.fillStyle='#d1a45d';ctx.fill();
   ctx.font='bold 12px system-ui,sans-serif';ctx.fillStyle='#ffdfaa';
   ctx.textAlign='center';ctx.fillText('จุดข่าวลือ 💧',site.x,site.y-32);
   ctx.restore();
  }
  // A trail is visualization-only. The transport does not inspect canvas or this list.
  for(const edge of sim.trace){
   if(edge.tick<sim.tick-3)continue;
   const a=sim.agents[edge.from],b=sim.agents[edge.to];
   if(!a||!b)continue;
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
   ctx.strokeStyle=edge.kind==='data'?'rgba(79,210,255,.15)':'rgba(255,203,112,.13)';
   ctx.lineWidth=1.3;ctx.stroke();
  }
  const radius=size>700?3.15:size>350?4.2:size>120?5.2:6.3;
  for(const a of sim.agents){
   const state=statusOf(a);
   ctx.beginPath();ctx.arc(a.x,a.y,radius,0,Math.PI*2);
   ctx.fillStyle=palette[state];ctx.fill();
   if(a.id===0){
    ctx.beginPath();ctx.arc(a.x,a.y,radius+6,0,Math.PI*2);
    ctx.strokeStyle='#ffd184';ctx.lineWidth=1.9;ctx.stroke();
   }
   if(isWater()&&a.isScout&&a.seen.has('r0')&&!a.inspected){
    ctx.beginPath();ctx.arc(a.x,a.y,radius+4,0,Math.PI*2);
    ctx.strokeStyle='#ffc66d';ctx.lineWidth=1.5;ctx.stroke();
   }
  }
  const a=sim.agents[selected];
  if(a){
   ctx.beginPath();ctx.arc(a.x,a.y,radius+9,0,Math.PI*2);
   ctx.strokeStyle='#fff';ctx.lineWidth=1.7;ctx.stroke();
  }
  ctx.fillStyle='#789eb9';ctx.font='13px system-ui,sans-serif';
  ctx.fillText('AGENTS '+size+'  ·  '+sim.config.protocol.toUpperCase(),16,h-14);
 }
 function drawChart(){
  if(!ch)return;
  const w=chart.width,h=chart.height,pad=21;
  ch.clearRect(0,0,w,h);
  ch.fillStyle='#081b2c';ch.fillRect(0,0,w,h);
  const width=w-2*pad,height=h-2*pad;
  ch.strokeStyle='rgba(93,160,195,.22)';ch.lineWidth=1;
  for(let i=0;i<=4;i++){
   const y=pad+height*(1-i/4);
   ch.beginPath();ch.moveTo(pad,y);ch.lineTo(w-pad,y);ch.stroke();
  }
  const maxTick=sim.config.maxTicks,history=sim.history;
  if(!history.length)return;
  ch.beginPath();
  history.forEach((p,i)=>{
   const x=pad+Math.min(1,p.tick/maxTick)*width;
   const y=pad+(1-p.coveragePct/100)*height;
   if(i===0)ch.moveTo(x,y);else ch.lineTo(x,y);
  });
  ch.strokeStyle='#58d9ef';ch.lineWidth=3;ch.stroke();
  const last=history[history.length-1];
  ch.fillStyle='#a4c7d8';ch.font='13px system-ui,sans-serif';
  ch.fillText('100%',pad+3,17);
  ch.fillText('0',pad+3,h-5);
  ch.fillText('tick '+last.tick,Math.max(pad,w-105),h-5);
 }
 function inspect(){
  const a=sim.agents[selected],s=sim.state(selected);
  const panel=$('inspector');panel.replaceChildren();
  if(!a)return;
  const title=document.createElement('strong');title.textContent='Agent #'+a.id;
  const p=document.createElement('p');
  p.textContent=(labelsTh[s.status]||s.status)+' · '+s.independentSources+
   ' แหล่งต้นทาง · '+(s.hasPrimary?'ได้รับข่าวต้นทาง':'ยังไม่ได้ข่าวต้นทาง');
  const list=document.createElement('div');
  const seen=[...a.evidence.entries()].map(([origin,e])=>{
   const kind=e.kind==='inspection'?'สำรวจจริง':e.kind==='rumor'?'ข่าวลือ':'ข้ออ้าง';
   const value=isWater()?(e.value==='A'?'พบน้ำ':'ไม่พบน้ำ'):'ข้อมูล '+e.value;
   return '#'+origin+' '+kind+' → '+value;
  });
  list.textContent=seen.length?'หลักฐานในความจำ: '+seen.join(' · '):'ยังไม่มีหลักฐาน';
  const tail=document.createElement('p');tail.className='hint';
  if(isWater()){
   const inspect=document.createElement('p');
   inspect.textContent='การสำรวจพื้นที่: พบน้ำ '+s.inspections.water+' · ไม่พบน้ำ '+
    s.inspections.dry+' · '+(s.inspected?'ตัวนี้ตรวจแล้ว':s.scouting?'ตัวนี้กำลังเดินทาง':'ตัวนี้ไม่ได้รับหน้าที่สำรวจ');
   tail.textContent='นับเฉพาะผู้สำรวจที่เป็นต้นทางอิสระ: การส่งข่าวซ้ำไม่ใช่การตรวจแหล่งน้ำ';
   panel.append(title,p,inspect,list,tail);
  }else{
   tail.textContent='ส่งผ่านกี่ทอดไม่เพิ่มคะแนนพยาน หากมีแหล่งต้นทางเดียว';
   panel.append(title,p,list,tail);
  }
 }
 function refresh(){
  if(!sim)return;
  const m=sim.metrics();
  $('m-reached').textContent=pretty(m.primaryReached)+' / '+pretty(m.count);
  $('m-coverage').textContent=m.coveragePct.toFixed(1)+'%';
  $('m-transmissions').textContent=pretty(m.transmissions);
  $('m-duplicates').textContent=pretty(m.duplicates);
  const water=isWater();
  $('m-agree-label').textContent=water?'ยืนยันพบแหล่งน้ำ':'ยืนยันตรงกัน';
  $('m-conflict-label').textContent=water?'ยืนยันไม่พบน้ำ':'ข้อมูลขัดแย้ง';
  $('m-agree-sub').textContent=water?'ผู้สำรวจอิสระ ≥2 ราย':'≥2 ต้นทางอิสระ';
  $('m-conflict-sub').textContent=water?'ผู้สำรวจอิสระ ≥2 ราย':'ความเห็น A และ B ไม่ตรงกัน';
  $('m-agree').textContent=pretty(water?m.verifiedWater:m.corroborated);
  $('m-conflict').textContent=pretty(water?m.refutedRumor:m.conflicted);
  $('water-summary').style.display=water?'flex':'none';
  $('water-legend').style.display=water?'flex':'none';
  $('classic-legend').style.display=water?'flex':'none';
  $('scene-pill').textContent=water?'RUMOR → SCOUT → VERIFY · NO CENTRAL LEADER':'LOCAL DECISIONS · NO CENTRAL LEADER';
  if(water){
   const world=sim.evaluation();
   $('water-case-label').textContent='โลกจำลอง: '+(world.waterExists?'มีน้ำจริง':'ไม่มีน้ำจริง')+
    ' · ปล่อยข่าวลือว่า “ตรงนี้มีน้ำ”';
   $('water-explainer').textContent='ผู้ทดลองเลือกความจริงของโลกไว้ แต่ Agent ต้องไปสำรวจพิกัดด้วยตนเอง ไม่มีสมองกลางให้คำตอบ';
   $('water-progress').textContent='ตรวจพื้นที่แล้ว '+m.fieldInspections+
    ' · กำลังไปตรวจ '+m.scoutsEnRoute+' · ได้ยินข่าวแต่ยังไม่ยืนยัน '+m.rumorOnly;
   $('water-result').textContent='ยืนยันพบ '+m.verifiedWater+' · ยืนยันไม่พบ '+
    m.refutedRumor+' · รอหลักฐาน '+m.verifying+' · ขัดแย้ง '+m.disputed+
    ' · ตำแหน่ง ('+world.site.x+', '+world.site.y+')';
  }
  $('tick-count').textContent='Tick '+m.tick;
  drawWorld();drawChart();inspect();setLive(playing);
 }
 function selectAgent(e){
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width*canvas.width;
  const y=(e.clientY-rect.top)/rect.height*canvas.height;
  let nearest=-1,best=Infinity;
  for(const a of sim.agents){
   const d=(a.x-x)**2+(a.y-y)**2;
   if(d<best){best=d;nearest=a.id;}
  }
  const tolerance=Math.max(13*canvas.width/Math.max(rect.width,1),25);
  if(best<=tolerance*tolerance){selected=nearest;refresh();}
 }
 function td(row,text,cls){
  const cell=document.createElement('td');
  cell.textContent=String(text);
  if(cls)cell.className=cls;
  row.append(cell);
 }
 function table(rows){
  const container=$('comparison');container.replaceChildren();
  const t=document.createElement('table');
  const thead=document.createElement('thead');
  const head=document.createElement('tr');
  for(const name of ['Protocol','ถึง (%)','ส่ง (ครั้ง)','ซ้ำ','สูญหาย','P90 tick','ข้อมูลประมาณ']){
   const th=document.createElement('th');th.textContent=name;head.append(th);
  }
  thead.append(head);t.append(thead);
  const body=document.createElement('tbody');
  const topCoverage=Math.max(...rows.map(r=>r.coverage));
  const minTx=Math.min(...rows.map(r=>r.sent));
  for(const m of rows){
   const tr=document.createElement('tr');
   td(tr,m.name);td(tr,m.coverage.toFixed(1)+'%',m.coverage===topCoverage?'best':'');
   td(tr,pretty(m.sent),m.sent===minTx?'best':'');
   td(tr,pretty(m.dup));td(tr,pretty(m.lost));td(tr,m.p90===null?'—':m.p90);
   td(tr,(m.bytes/1024).toFixed(1)+' KB');
   body.append(tr);
  }
  t.append(body);container.append(t);
 }
 function percentile90(agentList){
  const arrivals=agentList.map(a=>a.firstAt.get('r0')).filter(x=>Number.isFinite(x)).sort((a,b)=>a-b);
  if(!arrivals.length)return null;
  return arrivals[Math.max(0,Math.ceil(arrivals.length*.9)-1)];
 }
 function compare(){
  if(comparing)return;
  stop();comparing=true;setLive(false);
  const baseline=settings(),protocols=engine.PROTOCOLS.slice();
  comparisonRows=[];comparisonIteration++;
  const token=comparisonIteration;
  const progress=$('compare-progress');
  const next=()=>{
   if(token!==comparisonIteration)return;
   if(!protocols.length){
    comparing=false;setLive(false);table(comparisonRows);
    progress.textContent='ครบ 4 วิธี · Seed '+baseline.seed;
    note('เปรียบเทียบครบ 4 Protocol · เงื่อนไขเหมือนกัน ข้อมูลเป็นผลจำลอง');
    return;
   }
   const method=protocols.shift();
   const trial=engine.createSimulation({...baseline,protocol:method});
   const label=method==='anti-entropy'?'Anti-Entropy':method[0].toUpperCase()+method.slice(1);
   note('กำลังเปรียบเทียบ '+label+' · '+(4-protocols.length)+'/4');
   progress.textContent=label+' · tick 0 / '+trial.config.maxTicks;
   const pump=()=>{
    if(token!==comparisonIteration)return;
    const start=performance.now();let steps=0;
    while(!trial.done && steps<3){
     trial.step();steps++;
     if(performance.now()-start>14)break;
    }
    progress.textContent=label+' · tick '+trial.tick+' / '+trial.config.maxTicks;
    if(!trial.done){requestAnimationFrame(pump);return;}
    const m=trial.metrics();
    comparisonRows.push({name:label,coverage:m.coveragePct,sent:m.transmissions,dup:m.duplicates,
     lost:m.lost,bytes:m.estimatedBytes,p90:percentile90(trial.agents)});
    requestAnimationFrame(next);
   };
   requestAnimationFrame(pump);
  };
  requestAnimationFrame(next);
 }
 function exportResults(){
  if(comparing)return;
  const payload={kind:'PeerMesh Simulation Experiment',disclaimer:'SIMULATED; agreement != ground truth',
   ...sim.snapshot(),comparison:comparisonRows.slice()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='peermesh-seed-'+sim.config.seed+'-'+sim.config.protocol+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
  note('ส่งออกผลจำลองเป็น JSON (Tick, Seed, Protocol, Agent และสถิติ)');
 }
 for(const field of fields)field.addEventListener('change',reset);
 for(const field of [$('range'),$('loss')])field.addEventListener('input',labels);
 $('speed').addEventListener('change',()=>{});
 $('start').addEventListener('click',start);
 $('pause').addEventListener('click',()=>{stop();note('พักการจำลอง · กดเริ่มเพื่อทำต่อ');});
 $('step').addEventListener('click',step);
 $('reset').addEventListener('click',reset);
 $('compare').addEventListener('click',compare);
 $('export').addEventListener('click',exportResults);
 canvas.addEventListener('click',selectAgent);
 window.__peerMeshDebug=Object.freeze({getState:()=>({
  running:playing,comparing,selected,settings:sim.config,metrics:sim.metrics(),
  agents:sim.agents.length,comparison:comparisonRows.slice()
 })});
 create();
 note('เลือกค่าทดลองแล้วกดเริ่ม · แตะ Agent เพื่อดูหลักฐานที่แต่ละตัวได้รับ');
})();
