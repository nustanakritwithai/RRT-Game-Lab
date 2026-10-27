# RRT ARENA — GAME LIMITATIONS ROADMAP v1.0

Last reviewed: 2026-10-28
Production baseline: V0.8.2, main `3e8fd688fb754a1a3f97ec962d7bf513ba7a2668`
Development policy: **One limitation / one isolated change / full regression before merge.** Preserve original BLUE and RED AI, private memories, P2P provenance, and 8v8–12v12 performance. Simulator outputs are not real combat results.

| Priority | Verified limitation | Intended fix | Status | Acceptance gate |
|---|---|---|---|---|
| 1 | Only elimination or HP timeout decides Duel2 | Optional neutral Control Point A | IN DEVELOPMENT | Uncontested occupancy scores; contested pauses; 20s control/150s timeout; symmetric AI; elimination default unchanged |
| 2 | Online learning UCB resets every setupRound | Per-Agent persisted learned policy across matches | QUEUED | Optional carry-over, bounded schema, correct load/reset, no shared learning |
| 3 | Player does not organize individuals into mission roles | Squad/Buddy roster management | QUEUED | Players assign roles pre-match; no live omniscient command |
| 4 | No mission selection or long-form play loop | Lobby, mission choice and post-match results | QUEUED | A complete start→objective→result→new mission path |
| 5 | No persistent career/progression | Local profile, Agent XP, unlocks, history | QUEUED | Validated save/load and meaningful progression without pay-to-win |
| 6 | Opponent behavior insufficiently diverse | Distinct enemy rosters and strategies | QUEUED | Measurable behavior variety with equal stat baseline where relevant |
| 7 | Squad scale generates many PeerMesh packets | Communication cost benchmarking and dedup evolution | QUEUED | Stable private truth/ACK and lower CPU/message overhead |
| 8 | Real Android FPS unknown, 12v12 CI around 50 FPS | Built-in mobile device profiler | QUEUED | Frame p50/p95 and per-mode CPU stats on actual mobile |
| 9 | UI still optimized for laboratory settings | Mobile-friendly game HUD/lobby/results | QUEUED | No overflow at 320/393px; mission readable while playing |
| 10 | No competing player-owned AI teams | Save/replay/import → asynchronous competition | QUEUED | Tamper-aware deterministic replay before server PvP |

## #1 Control Point A — strict first milestone
- Duel2 only; 1v1, multi/survival, PeerMesh network laboratory unchanged.
- `?mode=duel2&mission=control` opts in; existing URLs remain elimination.
- Both factions know public neutral point A before kickoff; the pure score engine alone reads world positions to adjudicate occupancy. This does **not** grant tactical bots hidden enemy tracks.
- One static mission runner per Group uses the **existing** RRT/goal planner when the runner does not have a personally visible threat; other members retain the current tactical policy.
- Presence by any living soldier scores only when exactly one side is inside radius. If both sides occupy it, the score is frozen.
- First team with 20 seconds uncontested presence wins; elimination wins immediately; at 150 seconds score wins, tie is draw.
- Draw zone and scoreboard; update read-only debug. Same HP/range/aim/radio/learning for both teams.
- Add Node rules/tests, Chromium 2v2/3v3/5v5/8v8/12v12 and baseline unchanged 150s/CI.
- Do not claim that this single objective makes a complete campaign or product. Test first; merge only after all gates.

**Future work must update this file to mark an item VERIFIED DONE only after CI and merged commit.**
