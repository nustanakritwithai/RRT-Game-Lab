# RRT ARENA — RANGED ENEMY LAB V0.6.7 / INTEGRATION HANDOFF

**Status:** PLAYABLE ON PR BRANCH / NODE + CHROMIUM PASS / PENDING MAIN MERGE AND PAGES READBACK  
**Updated:** 25 October 2026 (Asia/Bangkok)  
**Repository:** https://github.com/nustanakritwithai/RRT-Game-Lab  
**Draft PR:** https://github.com/nustanakritwithai/RRT-Game-Lab/pull/3  
**Branch:** `feat/v067-ranged-enemy-lab`  
**Baseline merged:** V0.6.6, main `a5a477bea4d21cfbfbbc1eb681ae3a7bbb54941d` (PR #2)

## 1. Mission and immutable constraints

Add **basic, rule-controlled ranged enemies** to the existing RRT Arena so the ORIGINAL BLUE agent can fight multiple shooters and, in a later phase, a mixture of ranged/melee bots. No new BLUE agent, no LLM for the enemies, no fake wins.

- Do NOT replace `spawnBot('blue')`, `currentIntent`, `chooseGoal`, `beginPlan`, `runPlanner`, `moveBot` or `shoot`.
- Do NOT weaken melee bots, secretly change BLUE HP/speed/damage, or expose real hidden enemy positions to BLUE.
- Enemy sight must use the world's actual LOS query only within the perception layer. An enemy with memory may walk to a last-seen BLUE position, **never fire at it while invisible**.
- Use swept segment collisions for bullets and movement. Projectiles are physical objects, not instant hit declarations.
- Duel, classic multi-target tracking, melee wave, predictive swarm defense, replay and mobile fixed-height HUD must remain functional.
- Do not declare 70% (or any) win rate against ranged opponents until controlled browser benchmarks have been run.

## 2. What is implemented on this branch

| File | Purpose |
| --- | --- |
| `rrt_arena_ranged_v067.js` | Dependency-free pure UMD factory, observer, basic FSM intent, swept local movement, ranged fire/clip/reload and projectile-versus-wall/fighter collision. |
| `rrt_arena_ranged_v067.test.cjs` | 37 isolated TDD test cases (roles, LOS/memory, no hidden firing, collision, ammunition, deterministic output). |
| `.github/workflows/tests.yml` | Existing V0.6.6 unit tests **plus** the V0.6.7 pure ranged test suite. |
| `RANGED_LAB_V067_MATRIX.json` | Proposed scenario and benchmark matrix (NOT experimental results). |

The branch now embeds the unchanged ranged module into `index.html` and wires the bot roles and incoming projectiles into the original BLUE loop. The PR CI verifies syntax, source sync, Node tests and Chromium gameplay across 320/393/1365px. This is playable in branch artifacts but not a published release until merge and Pages readback.

## 3. Ranged enemy roles

- **Sentry:** stationary. Shoots only fresh visible BLUE with LOS/range/ammo/cooldown satisfied. It never pursues.
- **Patrol:** basic waypoint path, pauses to fire when a visible target enters range. No RRT or strategic flanking.
- **Hunter:** approaches a visible BLUE if far, moves away if far too close, fires when observed in range, and investigates last-seen BLUE coordinates briefly after losing sight. No omniscient pursuit, RRT, map-wide target knowledge or squad coordination.

Preset difficulties training/balanced/hard change only declared weapon and enemy movement parameters via `RRTArenaRanged.statsFor(level)`. Melee rules in V0.6.6 stay unchanged. Keep per-role weapon parameters immutable during paired experiments.

## 4. Existing original BLUE integration map (V0.6.6)

The following live hooks existed at handoff:

| Existing V0.6.6 hook | Integration rule |
| --- | --- |
| `setupRound / setupMultiTargets / addSimpleTarget` | Add role-based ranged target setup; preserve existing melee spawn path. |
| `senseMultiWorld` | Remains the only observation source for what **BLUE** knows about all enemies. Do not pass `multi.targets` to BLUE planners. |
| `loopMultiStep` | Invoke ranged enemy FSM for the ranged subset using BLUE world state only for the *enemy* observer's validated LOS. |
| `multiProjectiles` | Keep BLUE projectiles and wall-first projectile hits unchanged. Track incoming ranged projectiles separately and call `advanceProjectile` against BLUE. |
| `findThreatDodge` | Future option: feed only **visible incoming** ranged bullets to the original BLUE reflex. Do not leak hidden projectiles. |
| `currentIntent / chooseGoal / beginPlan / runPlanner` | Leave intact for the first ranged **baseline** run. Later hook a ranged threat advisor into original intent selection and RRT goal scoring. |
| `updateMultiHUD / drawMultiTargets / replay` | Render ranged role and projectiles, freeze status-card heights at 320/393 px, export seed/flags/projectile metrics. |
| `tools/browser_regression.cjs` | Extend with Ranged, Mixed and original V0.6.6 regression cases. |

**Important:** V0.6.6 inline modules are checked against the external module files in CI. Before final integration, decide whether to embed the new UMD module in `index.html` (preserves standalone offline HTML) or update the GitHub Pages artifact packaging and explicit offline-test contract. Do not silently break offline play.

## 5. Suggested integration pseudocode (adapter, NOT a live patch)

```js
// World-only, not BLUE decision code.
const ranged = RRTArenaRanged.createRangedBot({id:'R01',x:80,y:60,role:'patrol',difficulty:'balanced'});
const obs = RRTArenaRanged.observeBlue(ranged, blue, now, {
  range: rangedSensorRange,
  canSee: (a,b) => clearSight(a,b), // geometry from the world; not secret knowledge
  ttl: 5
});
const sensedRanged = obs.status === 'visible'
  ? {...ranged,track:{x:obs.x,y:obs.y,lastSeen:now}}
  : ranged;
const intent = RRTArenaRanged.planBasicBot(sensedRanged,obs,now,{scale:S,radius:R});
const moved = RRTArenaRanged.moveBasicBot(sensedRanged,intent,dt,{
  scale:S,width:W,height:H,radius:R+1,
  isFree:point=>freePoint(point,R+1),
  pathClear:(a,b)=>!blocked(a,b,R+1)
});
const {bot:next,shot} = RRTArenaRanged.tryFire(moved,obs,now,{
  scale:S,radius:R,
  canSee:(a,b)=>clearSight(a,b),
  rng:arenaSeededRng
});
if(shot) incomingRangedProjectiles.push(shot);
// World-only projectile step: apply damage ONLY on confirmed swept collision.
const event = RRTArenaRanged.advanceProjectile(shot,dt,{
  width:W,height:H,walls,
  targets:[{id:'blue',x:blue.x,y:blue.y,radius:R,active:blue.hp>0}]
});
```

The adapter must iterate current projectiles at the *next* world simulation step rather than advancing a newly created shot twice within the same frame. Ensure `now`, `dt`, obstacle geometry and seeded RNG use the existing engine's contracts. Tests are written against pure function inputs, not browser globals.

## 6. Planned experimental controls

- Gameplay mode: `Melee` (old), `Ranged` (new), `Mixed` (new). Classic multi-target tracking remains accessible.
- Ranged role distribution: preset sentry/patrol/hunter, optionally assign simple role per bot as before.
- Difficulty: training / balanced / hard; number 4 / 8 / 12 / 16 / 24.
- **Future** BLUE toggle: `Ranged Threat Defense OFF/ON`. OFF is original V0.6.6 baseline; ON only after baseline.
- Recommended HUD: single-line clipped chips; avoid dynamically growing heights for active status or multi-wave summary.
- Keep `?mode=multi&seed=N` deterministic, and preserve replay download.

## 7. Research sequence / acceptance gates

1. **Preparation — DONE:** three simple bot roles, observation-only FSM and bullet physics; 37 pure unit cases plus runtime tests; CI green.
2. **Playable integration — DONE ON BRANCH:** original BLUE scene, read-only debug snapshot, ranged and mixed URL controls, incoming bullets, HUD, replay and browser checks; main still unchanged.
3. **Baseline — PENDING:** 4, 8, 12, 24 ranged enemies at 320/393/1365 px, same seeds across weapon types and flags; save win/loss, HP, time, kills, ammo, hit rate, incoming shot hits, cover uptime and RRT failures.
4. **Future BLUE ranged defense — PENDING:** identify failure modes; add threat LOS/crossfire/cover goal scoring from BLUE observations only. Use RRT for full path, keep micro-reflex collision testing.
5. **Mixed combat — PENDING:** enable melee + ranged enemy subsets while preserving V0.6.6 anti-encirclement behavior.
6. **Quality gate — PARTIAL:** Node tests, browser regression at 320/393/1365px, fixed HUD, source-sync and CI PASS on branch; full paired 100-seed win-rate benchmark, Pages deployment and public readback remain separate release/research checks.

## 8. Test commands

```bash
node --test rrt_arena_ranged_v067.test.cjs
node --test *.test.cjs
# After actual browser integration:
node tools/browser_regression.cjs
```

**Status truth:** Browser smoke confirms actual ranged projectiles fired and no page errors across three viewports; no validated 100-seed ranged win rate is claimed yet. Publish only after PR CI PASS and direct public Pages readback. The dedicated benchmark matrix remains a research follow-up, not a fabricated release metric.
