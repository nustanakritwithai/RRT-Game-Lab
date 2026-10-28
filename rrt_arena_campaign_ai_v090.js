/* RRT ARENA V0.9 — strategic-map AI (M2) and campaign auto-play.
 * decideOrders() receives ONLY a faction view from RRTArenaCampaign.viewFor(): fog of war is enforced by
 * the API, so the AI cannot react to enemy units it has not seen. Same rules and order limits as a player.
 * Personalities are weight sets (assault / fortress / network); determinism comes from an explicit seed.
 */
(function(root,factory){'use strict';
 const api=factory(typeof module==='object'&&module.exports?require('./rrt_arena_campaign_v090.js'):root.RRTArenaCampaign);
 root.RRTArenaCampaignAI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
 'use strict';
 const WEIGHTS=Object.freeze({
  assault:Object.freeze({attack:1.4,defend:.8,recon:.3,tower:.2,dig:.3,risk:.8}),
  fortress:Object.freeze({attack:.7,defend:1.4,recon:.4,tower:.4,dig:1.2,risk:1.4}),
  network:Object.freeze({attack:.9,defend:1.0,recon:1.2,tower:1.3,dig:.6,risk:1.0})});
 const PERSONALITIES=Object.freeze(Object.keys(WEIGHTS));
 function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
 const sizeOk=n=>!!C.presetForSize(n);
 // Public rule knowledge (same calibrated shapes as the campaign coarse model), no hidden state.
 function winProb(a,d,assault,fort){
  if(!(d>0))return 1;
  if(assault){const edge=a>=d?8*(a/d-1)**2:-8*(d/a-1)**2,ft=[0,1,1.1][fort|0]*Math.min(1,Math.max(0,edge)/2);return 1/(1+Math.exp(-(edge-1.45-ft)));}
  return 1/(1+Math.exp(-9.5*Math.log(a/d)));
 }
 function decideOrders(view,personality='assault',seed=0){
  if(!view||!Array.isArray(view.ownUnits)||!Array.isArray(view.sectors))throw new TypeError('decideOrders needs a faction view from viewFor()');
  const base=WEIGHTS[personality]||WEIGHTS.assault;
  // Any personality presses harder when clearly behind on victory points (same rule for both sides).
  const behind=(view.opponentVp-view.vp)>=Math.max(3,Math.floor((view.vpLead||10)/3));
  const W=behind?{...base,attack:base.attack*1.35,risk:base.risk*.7,dig:base.dig*.6}:base;
  const f=view.faction,foe=f==='player'?'enemy':'player',r=rng((seed*2654435761)^(view.turn*97)^(f==='player'?1:2));
  const sec=id=>view.sectors.find(s=>s.id===id);
  const nb=id=>view.edges.filter(e=>e.includes(id)).map(e=>e[0]===id?e[1]:e[0]);
  const myHq=view.sectors.find(s=>s.hq===f),foeHq=view.sectors.find(s=>s.hq===foe);
  const dist=from=>{const d=new Map([[from,0]]),q=[from];while(q.length){const c=q.shift();for(const n of nb(c))if(!d.has(n)){d.set(n,d.get(c)+1);q.push(n);}}return d;};
  const toFoe=dist(foeHq.id);
  const enemyAt=id=>view.enemyUnits.filter(u=>u.sector===id).reduce((n,u)=>n+u.size,0)+
   view.lastSeenUnits.filter(u=>u.sector===id).reduce((n,u)=>n+u.size*(1-u.age/4),0);
  const threatNear=id=>Math.max(enemyAt(id),...nb(id).map(enemyAt));
  const value=s=>(s.victory?3:0)+s.yield*.8+(s.radioHill?1:0)+(s.hq===foe?6:0)+(s.hq===f?5:0)+
   (s.power?2.5:0)+(s.factory?2:0)+(s.relay?1.5:0)+(s.sensor?.5:0);
  // Objective field: open victory sectors pull units from afar, weighted by distance and by known defenders,
  // so a unit sees a free objective two steps away instead of only its neighbours (public map + own intel only).
  const goals=view.sectors.filter(s=>s.victory&&s.owner!==f).map(s=>({id:s.id,v:value(s),d:dist(s.id),def:enemyAt(s.id)}));
  const pull=(id,size)=>goals.reduce((m,g)=>Math.max(m,g.v*winProb(size,g.def,g.def>0&&view.sectors.find(x=>x.id===g.id).owner===foe,0)/(1+(g.d.get(id)??9))),0);
  const orders=[],used=new Set();let supply=view.supply;
  const units=view.ownUnits.slice().sort((a,b)=>a.id.localeCompare(b.id));
  // 1. Home defence. HQ under siege (enemy inside it): every unit within two steps converges on it.
  //    Visible threat next to an empty HQ: the closest unit steps back.
  const toHq=dist(myHq.id),stepHome=u=>nb(u.sector).sort((a,b)=>(toHq.get(a)??99)-(toHq.get(b)??99))[0];
  const besieged=view.enemyUnits.filter(e=>e.sector===myHq.id).reduce((n,e)=>n+e.size,0);
  if(besieged>0){
   for(const u of units.filter(x=>x.sector!==myHq.id&&(toHq.get(x.sector)??99)<=2).sort((a,b)=>(toHq.get(a.sector)??99)-(toHq.get(b.sector)??99))){
    orders.push({unit:u.id,type:'move',to:stepHome(u)});used.add(u.id);}
  }else if(myHq.owner===f&&!units.some(u=>u.sector===myHq.id)&&nb(myHq.id).some(id=>view.enemyUnits.some(e=>e.sector===id))){
   const back=units.slice().sort((a,b)=>(toHq.get(a.sector)??99)-(toHq.get(b.sector)??99)||b.size-a.size)[0];
   if(back){orders.push({unit:back.id,type:'move',to:stepHome(back)});used.add(back.id);}
  }
  // 2. Concentrate: merge co-located units when a known enemy nearby outnumbers each of them.
  for(const u of units){if(used.has(u.id))continue;
   const mate=units.find(v=>v!==u&&!used.has(v.id)&&v.sector===u.sector&&sizeOk(u.size+v.size));
   if(mate&&W.attack+W.defend>1.8&&threatNear(u.sector)>Math.max(u.size,mate.size)){orders.push({unit:u.id,type:'merge',with:mate.id});used.add(u.id);used.add(mate.id);}
  }
  // 3. Score every remaining unit's options.
  for(const u of units){if(used.has(u.id))continue;
   const here=sec(u.sector),opts=[];
   for(const n of nb(u.sector)){const s=sec(n),known=enemyAt(n),unknown=s.owner!==f&&s.confidence===0?1:0;
    const assault=s.owner===foe,p=winProb(u.size,known+(assault&&unknown?2:0),assault,s.fort??1);
    const gain=(s.owner===f?.25:1)*value(s),forward=((toFoe.get(u.sector)??9)-(toFoe.get(n)??9))*.6;
    // When behind on points, a unit that ends the turn inside an enemy-held victory sector blocks its scoring
    // (contest rule) — only if it wins or meets no defender, so the bonus is weighted by the win chance.
    const block=behind&&s.victory&&s.owner===foe?3.5*p:0;
    const toward=Math.max(0,pull(n,u.size)-pull(u.sector,u.size));
    opts.push({o:{unit:u.id,type:'move',to:n},score:W.attack*(gain*p+forward)+toward*.7*W.attack+block-W.risk*(1-p)*u.size*.5});}
   const threat=threatNear(u.sector);
   const holdOwn=here.owner===f?W.defend*value(here)*Math.min(2,threat/Math.max(1,u.size))+(threat>0&&(here.fort??0)<2?W.dig*1.2:0):W.attack*value(here)*.9;
   opts.push({o:{unit:u.id,type:'hold'},score:holdOwn});
   const fog=nb(u.sector).reduce((n,id)=>n+(1-sec(id).confidence)*value(sec(id)),0);
   opts.push({o:{unit:u.id,type:'recon'},score:W.recon*fog*.45});
   if(here.owner===f&&!here.tower&&supply>=C.RULES.towerCost)opts.push({o:{unit:u.id,type:'tower'},score:W.tower*(1.5+(here.radio<2?1:0)+(here.victory?1:0))});
   for(const x of opts)x.score+=r()*.05;
   opts.sort((a,b)=>b.score-a.score);const pick=opts[0].o;
   if(pick.type==='tower')supply-=C.RULES.towerCost;
   orders.push(pick);used.add(u.id);
  }
  return orders;
 }
 /** Fast auto-play with the injected battle resolver (default: calibrated coarse model). */
 function autoplay({games=100,seed=1,personalities=PERSONALITIES,resolver=C.coarseBattle,template='frontlineBasin',rules={}}={}){
  const out={games,unfinished:0,turns:[],battles:0,turnCount:0,reasons:{},sideWins:{player:0,enemy:0,draw:0},comebacks:0,trailingAt6:0,
   byPersonality:Object.fromEntries(personalities.map(p=>[p,{wins:0,losses:0,draws:0}])),pairs:{}};
  for(let g=0;g<games;g++){
   const pp=personalities[g%personalities.length],pe=personalities[Math.floor(g/personalities.length)%personalities.length];
   let s=C.create({seed:seed+g,template,...rules});let trailer=null;
   for(let t=0;t<40&&!s.winner;t++){
    const res=C.resolveTurn(s,{player:decideOrders(C.viewFor(s,'player'),pp,seed+g*31+t),enemy:decideOrders(C.viewFor(s,'enemy'),pe,seed+g*37+t)},resolver);
    out.battles+=res.battles.length;s=res.state;
    if(s.turn===6&&s.factions.player.vp!==s.factions.enemy.vp)trailer=s.factions.player.vp<s.factions.enemy.vp?'player':'enemy';
   }
   if(!s.winner){out.unfinished++;continue;}
   const reason=s.log.length?(C.checkVictory(s).reason||'?'):'?';out.reasons[reason]=(out.reasons[reason]||0)+1;
   out.turns.push(s.turn);out.turnCount+=s.turn;out.sideWins[s.winner]++;
   if(trailer){out.trailingAt6++;if(s.winner===trailer)out.comebacks++;}
   const key=pp+' vs '+pe;out.pairs[key]=out.pairs[key]||{player:0,enemy:0,draw:0};out.pairs[key][s.winner]++;
   if(s.winner==='draw'){out.byPersonality[pp].draws++;out.byPersonality[pe].draws++;}
   else{const wp=s.winner==='player'?pp:pe,lp=s.winner==='player'?pe:pp;out.byPersonality[wp].wins++;out.byPersonality[lp].losses++;}
  }
  const sorted=out.turns.slice().sort((a,b)=>a-b);
  return {games,unfinished:out.unfinished,meanTurns:sorted.length?out.turnCount/sorted.length:0,medianTurns:sorted.length?sorted[Math.floor(sorted.length/2)]:0,
   battlesPerTurn:out.turnCount?out.battles/out.turnCount:0,comebackRate:out.trailingAt6?out.comebacks/out.trailingAt6:null,trailingAt6:out.trailingAt6,
   reasons:out.reasons,sideWins:out.sideWins,byPersonality:out.byPersonality,pairs:out.pairs};
 }
 return Object.freeze({PERSONALITIES,WEIGHTS,decideOrders,autoplay,winProb});
});
