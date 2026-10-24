/* RRT ARENA: pure tactical decisions and risk-aware route scoring.
 * No network, DOM, timers, or external dependencies. Shared with Node tests.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  root.RRTArenaCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);

  /** How dangerous is a line segment according to a foe's position & visibility? [0..1]. */
  function edgeExposure(a, b, foe, canSee, scale) {
    if (!foe || typeof canSee !== 'function') return 0;
    let sum = 0;
    for (const t of [.10, .30, .50, .70, .90]) {
      const p = {x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t};
      if (canSee(p, foe)) {
        const rangeFactor = clamp((scale*1.1 - dist(p,foe))/(scale*.9), 0, 1);
        sum += .78 + rangeFactor*.22;
      }
    }
    return clamp(sum/5, 0, 1);
  }

  /** Cost remains Euclidean when riskWeight=0; safer routes become competitive as risk grows. */
  function edgeCost(a, b, foe, canSee, riskWeight, scale) {
    const length = dist(a,b);
    if (riskWeight<=0 || !foe) return length;
    return length * (1 + 3.2 * clamp(riskWeight,0,100)/100 * edgeExposure(a,b,foe,canSee,scale));
  }

  function pathCost(points, foe, canSee, riskWeight, scale) {
    let sum=0;
    for (let i=1;i<points.length;i++) sum += edgeCost(points[i-1],points[i],foe,canSee,riskWeight,scale);
    return sum;
  }

  /** Do not turn a sheltered detour into a risky straight-line shortcut just because it is shorter. */
  function shouldShortcut(a,mid,b,foe,canSee,riskWeight,scale) {
    const direct=edgeCost(a,b,foe,canSee,riskWeight,scale);
    const detour=edgeCost(a,mid,foe,canSee,riskWeight,scale)+edgeCost(mid,b,foe,canSee,riskWeight,scale);
    return direct<=detour*1.015;
  }

  /** Find an open position behind wall faces or corners that blocks enemy line of sight. */
  function findCover(bot,foe,walls,free,canSee,bounds,margin,scale) {
    if (!foe || !walls || !walls.length) return null;
    let best=null,bestScore=Infinity;
    const outer=margin+2;
    for (const w of walls) {
      const x0=w.x-outer, x1=w.x+w.w+outer;
      const y0=w.y-outer, y1=w.y+w.h+outer;
      const candidates=[];
      for (const t of [.12,.5,.88]) {
        candidates.push({x:x0,y:w.y+w.h*t},{x:x1,y:w.y+w.h*t});
        candidates.push({x:w.x+w.w*t,y:y0},{x:w.x+w.w*t,y:y1});
      }
      for (const x of [x0,x1]) for(const y of [y0,y1]) candidates.push({x,y});
      for (const p of candidates) {
        if (p.x<margin+2||p.x>bounds.w-margin-2||p.y<margin+2||p.y>bounds.h-margin-2)continue;
        if (!free(p)) continue;
        if (canSee(p,foe)) continue;
        const travel=dist(bot,p), foeD=dist(p,foe);
        if (foeD<scale*.10) continue;
        // Prefer near, valid cover; avoid standing too close to enemies.
        const score=travel + Math.max(0,scale*.26-foeD)*1.4 +
          (foeD>scale*.90?(foeD-scale*.90)*.12:0);
        if (score<bestScore){bestScore=score;best={x:p.x,y:p.y};}
      }
    }
    return best;
  }

  /** Intent does not move the character. It selects which existing game tool should be used. */
  function decideIntent(input) {
    const {hp,maxHp,ammo,reload,foeVisible,distance,range} = input;
    const strategy=['aggressive','balanced','cautious'].includes(input.strategy)?input.strategy:'balanced';
    const ratio=maxHp>0?hp/maxHp:1;
    const retreatAt={aggressive:.20,balanced:.32,cautious:.46}[strategy];
    if (ratio<retreatAt && (foeVisible || distance<range*.52))
      return {kind:'retreat',reason:'พลังชีวิตต่ำและยังเสี่ยงถูกยิง → ถอยหาที่กำบัง'};
    if (reload>0 || ammo===0 || (ammo<=1 && strategy!=='aggressive'))
      return {kind:'cover',reason:'กระสุนใกล้หมด/กำลังรีโหลด → รักษาที่กำบัง'};
    if (!foeVisible)
      return {kind:'flank',reason:'มองไม่เห็นคู่ต่อสู้ → อ้อมหามุมยิง'};
    if (distance<range*.91)
      return {kind:'engage',reason:'มองเห็นศัตรูในระยะ → เลื่อนตำแหน่งแล้วยิง'};
    return {kind:'advance',reason:'อยู่นอกระยะยิง → เดินเข้าหาเป้าหมาย'};
  }

  /** Avoid arbitrarily awarding a win at the match time limit on tied HP. */
  function resolveWinner(blueHp,redHp,tolerance=.5) {
    if (Math.abs(blueHp-redHp)<=tolerance) return 'draw';
    return blueHp>redHp?'blue':'red';
  }

  return Object.freeze({edgeExposure,edgeCost,pathCost,shouldShortcut,findCover,decideIntent,resolveWinner});
});