#!/usr/bin/env bash
# Team-mode A/B of the V0.6.8 systems (side-swapped, seed-paired). Seeds 1001-1050 x 2 sides = 100 matches.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=benchmarks/v082; mkdir -p "$OUT"; SEEDS=${SEEDS:-1001-1050}
ALL=buddy2,buddy3,group22,group33,squad2222,squad3333
for m in ruins open; do node tools/benchmark_team_features.cjs --formations=$ALL --seeds=$SEEDS --map=$m --dteam=adaptive --out=$OUT/team_features_${m}_adaptive.json 2>/dev/null; done
node tools/benchmark_team_features.cjs --formations=group22,squad3333 --seeds=$SEEDS --map=ruins --dteam=independent --out=$OUT/team_features_ruins_independent.json 2>/dev/null
node tools/benchmark_team_features.cjs --formations=group22,squad3333 --seeds=$SEEDS --map=ruins --arms=bothOn --out=$OUT/control_bothon_ruins.json 2>/dev/null
