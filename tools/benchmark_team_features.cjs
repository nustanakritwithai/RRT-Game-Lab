#!/usr/bin/env node
'use strict';
/* Team-mode A/B for the V0.6.8 systems (Ranged Threat Defense + Keep Moving + exploration memory).
 * For every seed the same match is played twice with sides swapped:
 *   arm "blueOn": BLUE has the features, RED does not;  arm "redOn": RED has them, BLUE does not.
 * Both teams keep identical stats/AI otherwise. The override is the experiment-only debug hook
 * __rrtDuel2Debug.setTeamFeatures; normal play is always symmetric.
 * Usage: node tools/benchmark_team_features.cjs --formations=group22,squad2222,squad3333 \
 *   --seeds=1001-1030 --map=ruins --dteam=adaptive [--jobs=4] [--out=benchmarks/v082/team_features.json]
 */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s.replace(/^--/,''),'true']:[s.slice(2,i),s.slice(i+1)];}));
const presets={buddy2:2,buddy3:3,group22:4,group23:5,group33:6,squad2222:8,squad2323:10,squad3333:12};
const seedList=spec=>String(spec).split(',').flatMap(part=>{const [a,b]=part.split('-').map(Number);return Number.isFinite(b)?Array.from({length:b-a+1},(_,i)=>a+i):[a];});
const formations=String(args.formations||'group22').split(',');
const seeds=seedList(args.seeds||'1001-1010');
const map=args.map||'ruins',dteam=args.dteam||'adaptive',jobs=Number(args.jobs||4);
const width=Number(args.width||393),height=Number(args.height||852);
const output=path.resolve(args.out||'benchmarks/v082/team_features.json');
const file='file://'+path.resolve(__dirname,'../index.html');
for(const f of formations)if(!presets[f])throw new Error('unknown formation '+f);
const arms={blueOn:{blue:true,red:false},redOn:{blue:false,red:true},bothOn:{blue:true,red:true}};
const armNames=String(args.arms||'blueOn,redOn').split(',');

async function play(page,formation,seed,arm){
 await page.goto(file+'?mode=duel2&formation='+formation+'&seed='+seed+(dteam==='independent'?'':'&dteam='+dteam));
 return page.evaluate(({map,arm})=>{
  const d=window.__rrtDuel2Debug,engine=window.__rrtArenaDebug;
  const sel=document.getElementById('mapSelect');if(sel.value!==map){sel.value=map;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  for(const t of ['blue','red'])d.setTeamFeatures(t,{rangedDefense:arm[t],mobile:arm[t]});
  document.getElementById('start').click();
  let s=d.getState(),safe=true;
  for(let k=0;k<31&&s.phase!=='ended';k++){d.advance(k===30?.5:5);s=d.getState();const v=engine.validate();safe=safe&&v.fightersFree&&v.waypointsClear;}
  const side=t=>s.fighters.filter(b=>b.team===t);
  const sum=(list,f)=>list.reduce((n,b)=>n+f(b),0);
  const def=t=>{const l=side(t);return {coverMoves:sum(l,b=>b.defense.coverMoves),jinks:sum(l,b=>b.defense.jinks),bridgeSteps:sum(l,b=>b.defense.bridgeSteps),standoffs:sum(l,b=>b.defense.standoffs)};};
  return {winner:s.winner,ended:s.phase==='ended',time:s.time,safe,
   blueHp:sum(side('blue'),b=>b.hp),redHp:sum(side('red'),b=>b.hp),
   blueAlive:side('blue').filter(b=>b.hp>0).length,redAlive:side('red').filter(b=>b.hp>0).length,
   shotsBlue:sum(side('blue'),b=>b.shots),shotsRed:sum(side('red'),b=>b.shots),
   defenseBlue:def('blue'),defenseRed:def('red'),override:s.featureOverride};
 },{map,arm});
}
async function main(){
 const browser=await chromium.launch();const tasks=[];
 for(const formation of formations)for(const seed of seeds)for(const armName of armNames)tasks.push({formation,seed,armName});
 const rows=[];let next=0;const started=Date.now();
 async function worker(){
  const ctx=await browser.newContext({viewport:{width,height}});
  await ctx.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  while(next<tasks.length){const t=tasks[next++];const r=await play(page,t.formation,t.seed,arms[t.armName]);
   const featured=t.armName==='blueOn'?'blue':t.armName==='redOn'?'red':null;
   const row={...t,...r,featuredTeam:featured,featuredWon:featured?r.winner===featured:null,
    featuredHp:featured?(featured==='blue'?r.blueHp:r.redHp):null,otherHp:featured?(featured==='blue'?r.redHp:r.blueHp):null,errors:errors.splice(0)};
   rows.push(row);
   process.stderr.write(`${t.formation} seed=${t.seed} ${t.armName}: ${r.winner} t=${r.time.toFixed(1)} HP ${r.blueHp.toFixed(0)}/${r.redHp.toFixed(0)}${r.safe?'':' UNSAFE'}\n`);}
  await ctx.close();
 }
 await Promise.all(Array.from({length:Math.max(1,jobs)},worker));await browser.close();
 rows.sort((a,b)=>a.formation.localeCompare(b.formation)||a.seed-b.seed||a.armName.localeCompare(b.armName));
 const wilson=(k,n)=>{if(!n)return [0,0];const z=1.96,p=k/n,den=1+z*z/n,c=(p+z*z/(2*n))/den,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.round(1000*(c-h))/10,Math.round(1000*(c+h))/10];};
 const summary=formations.map(formation=>{
  const ab=rows.filter(r=>r.formation===formation&&r.featuredTeam);
  const n=ab.length,wins=ab.filter(r=>r.featuredWon).length,losses=ab.filter(r=>r.winner&&r.winner!=='draw'&&!r.featuredWon).length;
  const draws=ab.filter(r=>r.winner==='draw').length;
  // Side-swapped pairs: does the featured team win BOTH halves of the same seed?
  const pairs=seeds.map(seed=>ab.filter(r=>r.seed===seed)).filter(p=>p.length===2);
  const sweep=pairs.filter(p=>p.every(r=>r.featuredWon)).length,lost=pairs.filter(p=>p.every(r=>!r.featuredWon)).length;
  const mean=k=>n?Math.round(10*ab.reduce((s,r)=>s+r[k],0)/n)/10:null;
  const both=rows.filter(r=>r.formation===formation&&r.armName==='bothOn');
  return {formation,size:presets[formation],map,dteam,matches:n,featuredWins:wins,featuredLosses:losses,draws,
   featuredWinRate:n?Math.round(1000*wins/n)/10:null,wilson95:wilson(wins,n),
   pairsSweptByFeatured:sweep,pairsSweptByBaseline:lost,pairs:pairs.length,
   meanFeaturedHp:mean('featuredHp'),meanBaselineHp:mean('otherHp'),
   unsafe:rows.filter(r=>r.formation===formation&&!r.safe).length,unfinished:rows.filter(r=>r.formation===formation&&!r.ended).length,
   bothOnBlueWins:both.length?both.filter(r=>r.winner==='blue').length+'/'+both.length:null};
 });
 const report={type:'SIMULATION_ONLY',viewport:[width,height],seeds:args.seeds||'1001-1010',arms:armNames,runMs:Date.now()-started,summary,rows};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,1)+'\n');
 for(const s of summary)console.log(JSON.stringify(s));
}
main().catch(e=>{console.error(e);process.exit(1);});
