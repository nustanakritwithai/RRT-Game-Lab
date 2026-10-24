#!/usr/bin/env bash
# Full V0.6.6 A/B matrix on held-out seeds (never used for tuning). Tuning used seeds 1-30.
# Results: benchmarks/v066/<label>.json and a summary line per condition in summary.jsonl.
set -euo pipefail
cd "$(dirname "$0")/.."
SEEDS=${SEEDS:-1001-1100}; JOBS=${JOBS:-4}; OUT=benchmarks/v066; mkdir -p "$OUT"; : > "$OUT/summary.jsonl"
run(){ label=$1; shift; node tools/benchmark_swarm.cjs --seeds "$SEEDS" --jobs "$JOBS" --label "$label" --out "$OUT/$label.json" "$@" 2>/dev/null | tee -a "$OUT/summary.jsonl"; }
for k in on off; do for p in off on; do run "393_24_balanced_kite${k}_pred${p}" --width 393 --height 852 --kite $k --predictive $p; done; done
for vp in "320 640" "1365 900"; do set -- $vp; for p in off on; do run "${1}_24_balanced_kiteon_pred${p}" --width $1 --height $2 --predictive $p; done; done
for p in off on; do run "393_12_balanced_kiteon_pred${p}" --width 393 --height 852 --count 12 --predictive $p; done
for d in training hard; do for p in off on; do run "393_24_${d}_kiteon_pred${p}" --width 393 --height 852 --difficulty $d --predictive $p; done; done
