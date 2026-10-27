#!/usr/bin/env node
'use strict';
/* M2: auto-play many campaigns (strategic AI vs strategic AI, calibrated coarse battles) and check the
 * map-balance acceptance targets. Usage: node tools/campaign_autoplay.cjs [--games=3000] [--seed=1] [--out=file.json]
 */
const fs=require('node:fs'),path=require('node:path');const AI=require('../rrt_arena_campaign_ai_v090.js');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(2,i),s.slice(i+1)];}));
const games=Number(args.games||3000),seed=Number(args.seed||1);
const r=AI.autoplay({games,seed});
const wr=p=>{const x=r.byPersonality[p];return +(x.wins/Math.max(1,x.wins+x.losses+x.draws)).toFixed(3);};
const checks={
 'median length 10-14 turns':r.medianTurns>=10&&r.medianTurns<=14,
 'comeback >= 20% when trailing at turn 6':r.comebackRate!==null&&r.comebackRate>=.2,
 'no personality wins > 60% overall':AI.PERSONALITIES.every(p=>wr(p)<=.6),
 'battles per turn <= 2.5':r.battlesPerTurn<=2.5,
 'side balance: player vs enemy within 45-55% of decisive games':(()=>{const d=r.sideWins.player+r.sideWins.enemy;return d>0&&Math.abs(r.sideWins.player/d-.5)<=.05;})()};
const report={type:'SIMULATION_ONLY',note:'strategic AI with calibrated coarse battles; not real-engine battles',games,seed,...r,
 winRates:Object.fromEntries(AI.PERSONALITIES.map(p=>[p,wr(p)])),checks};
console.log(JSON.stringify({medianTurns:r.medianTurns,meanTurns:+r.meanTurns.toFixed(2),battlesPerTurn:+r.battlesPerTurn.toFixed(2),comebackRate:r.comebackRate&&+r.comebackRate.toFixed(3),trailingAt6:r.trailingAt6,sideWins:r.sideWins,reasons:r.reasons,winRates:report.winRates},null,1));
for(const [k,v] of Object.entries(checks))console.log((v?'PASS ':'FAIL ')+k);
if(args.out){fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(args.out,JSON.stringify(report,null,1)+'\n');}
