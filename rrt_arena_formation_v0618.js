/* RRT ARENA Experimental Formation Scale — Buddy 2/3 -> Group -> Squad.
 * Pure organizational topology: no sensors, no central tactical commander,
 * no shared memory and no target-selection authority. Runs offline.
 */
(function(root,factory){'use strict';const api=factory();root.RRTArenaFormation=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PRESETS=Object.freeze({
 buddy2:Object.freeze([[2]]),
 buddy3:Object.freeze([[3]]),
 group22:Object.freeze([[2,2]]),
 group23:Object.freeze([[2,3]]),
 group33:Object.freeze([[3,3]]),
 squad2222:Object.freeze([[2,2],[2,2]]),
 squad2323:Object.freeze([[2,3],[2,3]]),
 squad3333:Object.freeze([[3,3],[3,3]])
});
function createFormation(preset,side){
 if(!Object.prototype.hasOwnProperty.call(PRESETS,preset))throw new RangeError('Unknown formation preset: '+preset);
 if(!['blue','red'].includes(side))throw new RangeError('Unknown side: '+side);
 const prefix=side==='blue'?'B':'R',agents=[],membership=Object.create(null),groups=[];
 for(const [gi,shape] of PRESETS[preset].entries()){
  const groupId=prefix+'G'+(gi+1),teams=[];
  for(const [ti,size] of shape.entries()){
   const teamId=groupId+'T'+(ti+1),members=[];
   for(let k=0;k<size;k++){
    const id=prefix+(agents.length+1);
    members.push(id);agents.push(id);
    membership[id]={side,groupId,teamId,position:k+1};
   }
   teams.push({id:teamId,members});
  }
  groups.push({id:groupId,teams});
 }
 const links=[],keys=new Set();
 function connect(a,b,level){
  if(!a||!b||a===b)return;
  const key=[a,b].sort().join('|');
  if(keys.has(key))return;
  keys.add(key);links.push({a,b,level});
 }
 // Every buddy can communicate directly with each other buddy member.
 for(const group of groups)for(const team of group.teams){
  for(let i=0;i<team.members.length;i++)for(let j=i+1;j<team.members.length;j++)
   connect(team.members[i],team.members[j],'buddy');
 }
 // Link two buddy teams inside a group with balanced, redundant direct links.
 // No messages are forwarded and these endpoints do not command teammates.
 for(const group of groups)if(group.teams.length===2){
  const [a,b]=group.teams.map(t=>t.members);
  for(let i=0;i<Math.max(a.length,b.length);i++)connect(a[i%a.length],b[i%b.length],'group');
 }
 // Link two groups inside a squad; no third-tier world/sensor registry.
 if(groups.length===2){
  const [a,b]=groups.map(g=>g.teams.flatMap(t=>t.members));
  for(let i=0;i<Math.max(a.length,b.length);i++)connect(a[i%a.length],b[i%b.length],'squad');
 }
 return {preset,side,agents,groups,membership,links};
}
function peersFor(formation,id){
 if(!formation?.membership?.[id])return [];
 const peers=[];
 for(const link of formation.links){
  if(link.a===id)peers.push(link.b);else if(link.b===id)peers.push(link.a);
 }
 return peers.sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
}
function summary(formation){
 return {preset:formation.preset,side:formation.side,agents:formation.agents.length,
  groups:formation.groups.length,teams:formation.groups.reduce((n,g)=>n+g.teams.length,0),
  links:formation.links.length};
}
return Object.freeze({PRESETS,createFormation,peersFor,summary});
});
