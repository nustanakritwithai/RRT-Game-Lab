/* RRT ARENA v0.9.0 — optional public neutral control-zone objective.
 * Pure deterministic scoring. No tactical world state is exposed to agents.
 * The mission point is known to both sides; collision/scoring use world geometry.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaObjectives=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MODES=Object.freeze(['elimination','control']);
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
function create(mode='elimination',bounds,free=()=>true,{targetSeconds=24,radius=null,site=null}={}){
 if(!MODES.includes(mode))throw new RangeError('Unknown game mode');
 if(mode==='elimination')return {
  mode,active:false,point:null,radius:0,targetSeconds:0,
  scores:{blue:0,red:0},presence:{blue:0,red:0},owner:null,contested:false};
 if(!bounds||!Number.isFinite(bounds.w)||!Number.isFinite(bounds.h)||
   bounds.w<=0||bounds.h<=0)throw new RangeError('Invalid objective bounds');
 const radiusPx=Number.isFinite(radius)&&radius>0?radius:
  Math.max(25,Math.min(bounds.w,bounds.h)*.135);
 const locs=[[.5,.5],[.5,.32],[.5,.68],[.36,.5],[.64,.5],
  [.36,.34],[.64,.66],[.36,.66],[.64,.34]];
 // Optional explicit site (e.g. a defended strategic sector); falls back to the neutral sites if blocked.
 const chosen=(point(site)&&free(site)===true?{x:site.x,y:site.y}:null)||
  locs.map(([x,y])=>({x:x*bounds.w,y:y*bounds.h})).find(p=>free(p)===true);
 if(!chosen)throw new Error('No safe control-zone site on this map');
 return {mode,active:true,point:chosen,radius:radiusPx,
  targetSeconds:Number.isFinite(targetSeconds)&&targetSeconds>0?targetSeconds:24,
  scores:{blue:0,red:0},presence:{blue:0,red:0},
  owner:null,contested:false};
}
function isRunner(member){
 return !!member&&member.position===1&&
  typeof member.teamId==='string'&&/^[BR]G[1-9]\d*T1$/.test(member.teamId);
}
function step(state,bots,dt){
 if(!state?.active||!Number.isFinite(dt)||dt<=0||!point(state.point))return null;
 const radius2=state.radius*state.radius,presence={blue:0,red:0};
 for(const bot of bots||[]){
  if(!bot||bot.hp<=0||!point(bot)||!(bot.team in presence))continue;
  if((bot.x-state.point.x)**2+(bot.y-state.point.y)**2<=radius2)
   presence[bot.team]++;
 }
 state.presence=presence;
 state.contested=presence.blue>0&&presence.red>0;
 state.owner=state.contested?null:presence.blue>0?'blue':presence.red>0?'red':null;
 if(!state.owner)return null;
 state.scores[state.owner]=Math.min(state.targetSeconds,
  state.scores[state.owner]+dt);
 return state.owner;
}
function resolve(state,bots,elapsed,limit=150){
 if(!state?.active)return null;
 const fighters=(bots||[]).filter(b=>b&&
  (b.team==='blue'||b.team==='red')&&Number.isFinite(b.hp));
 const blue=fighters.filter(b=>b.team==='blue');
 const red=fighters.filter(b=>b.team==='red');
 if(!blue.length||!red.length)return null;
 const alive={blue:blue.filter(b=>b.hp>0).length,red:red.filter(b=>b.hp>0).length};
 if(!alive.blue&&!alive.red)return {winner:'draw',reason:'double_knockout'};
 if(!alive.blue)return {winner:'red',reason:'team_eliminated'};
 if(!alive.red)return {winner:'blue',reason:'team_eliminated'};
 if(state.scores.blue>=state.targetSeconds||state.scores.red>=state.targetSeconds)
  return {winner:state.scores.blue>state.scores.red?'blue':
   state.scores.red>state.scores.blue?'red':'draw',reason:'objective_points'};
 if(!Number.isFinite(elapsed)||elapsed<limit)return null;
 return {winner:state.scores.blue>state.scores.red+1e-5?'blue':
  state.scores.red>state.scores.blue+1e-5?'red':'draw',reason:'objective_timeout'};
}
return Object.freeze({MODES,create,isRunner,step,resolve});
});
