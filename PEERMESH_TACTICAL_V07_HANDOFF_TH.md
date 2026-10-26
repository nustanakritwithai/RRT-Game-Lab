# PeerMesh Tactical V0.7 — RRT Arena Duel 2v2 Integration

**Scope:** Test a strictly peer-to-peer, private-agent adaptation of the PeerMesh V1.2 radio ideas in RRT Arena. This is not the 1–1,000-agent network engine itself; tactical messages are small, direct, and time-sensitive.

## Live modes / test entrypoints

- `?mode=duel2&seed=83` — Independent, radio disabled
- `?mode=duel2&dteam=coop&seed=83` — existing Cooperative baseline
- `?mode=duel2&dteam=adaptive&seed=83` — PeerMesh Tactical V0.7
- `?mode=duel2&dteam=adaptive&loss=100&seed=83` — full outage/fallback

All four fighters (BLUE B1/B2 and RED R1/R2) keep **identical** HP, ammunition, projectile damage, speed, aim, RRT planners, memory, defense, visual perception, and firing logic.

## Reused PeerMesh ideas

1. **Per-agent private outgoing queues and dedup:** Every fighter owns its own `peerMesh` pending packet Map, seen-message Map, and short-lived support hint. No central tactical decisions are made by the radio scheduler.
2. **Priority:** radio delivery queues prefer a receiver acknowledgement (PM_ACK), urgent NEED_SUPPORT from the sender's actual HP/position, then existing negotiation responses, BID, and SIGHTING. Expiry and physical radio limitations still apply.
3. **Bounded ACK/Retry:** a sender only stops retrying a tracked packet when its receiver's PM_ACK really arrives. Retransmits preserve the same mesh ID for deduplication. Three attempts maximum, exponential backoff, TTL expiration, no retry when out of range. At 100% packet loss nothing is delivered.
4. **Message coalescing:** obsolete local sightings of the same target to the same peer are replaced by newer observations rather than accumulating an unlimited queue.
5. **Support hint:** when hit and needing help, an agent can share its **own** position. Receiving it can suggest a search destination when no enemy is currently visible. It is never enemy perception, target acquisition, a command from a leader, or firing permission.
6. **Evidence provenance:** existing `RRTArenaEvidence` checks receive-side first-hand reports and spatial disagreement. Radio sightings do not update local visual tracks or authorize shooting.

## Deliberate exclusions

- Do not use 1,000-node Gossip, multi-hop relaying, or IHAVE/IWANT for tiny time-critical 2v2 target reports. Additional request/response handshakes could make tactical reports stale.
- Do not read another Agent's `duelBrains`, `duelVisible`, chosen focus, or hidden enemy position as an input to PeerMesh.
- The simulator's physical projectile collision still uses authoritative world data, just as before. That is **not** a shared tactical brain.

## Testing and acceptance

- `node --test rrt_arena_peermesh_v07.test.cjs` (private state, priorities, retry/ACK, loss, TTL, dedup, code-inline correspondence).
- `node tools/peermesh_duel2_browser.cjs` (real Chromium 320/393/1365, four equal fighters, adaptive radio active, independent silent, 100% loss no ghost packets).
- `node tools/browser_regression.cjs` (original Duel/Melee/Ranged/2v2/Solo/Multi), `node tools/benchmark_duel2_quality.cjs` (paired 25s simulation controls including adaptive and 100% outage).
- All GitHub Actions jobs must complete PASS on the exact released commit. Verify live GitHub Pages **after deployment**.
- Review effectiveness via sent, delivered, dropped, retries, acknowledged, duplicates, conflicts, overlap, lane moves, HP, shots, win rate, and actual completion. A passing smoke test is not proof of win-rate improvement.

**Rollback:** return the UI to existing Cooperative or Independent mode; original modes and their policies are retained unchanged.
