#!/usr/bin/env bash
# V0.6.8 ranged/mixed A/B on held-out seeds (tuning used seeds 1-30).
# Variants: v067 = published V0.6.7 page; defoff = V0.6.8 with Ranged Threat Defense and Keep Moving
# off (only the two planner/focus bug fixes); still = defense + exploration on, Keep Moving off;
# full = everything on (default).
set -euo pipefail
cd "$(dirname "$0")/.."
SEEDS=${SEEDS:-1001-1100}; JOBS=${JOBS:-4}; OUT=benchmarks/v068; mkdir -p "$OUT"; : > "$OUT/summary.jsonl"
V067=${V067:-$OUT/.index_v067.html}
[ -s "$V067" ] || git show 84b4225:index.html > "$V067"
run(){ label=$1; shift; node tools/benchmark_swarm.cjs --seeds "$SEEDS" --jobs "$JOBS" --label "$label" --out "$OUT/$label.json" "$@" 2>/dev/null | tee -a "$OUT/summary.jsonl"; }
cond(){ tag=$1; shift; run "${tag}_v067" --file "$V067" "$@"; run "${tag}_defoff" --rangedDefense off --mobile off "$@"; run "${tag}_still" --rangedDefense on --mobile off "$@"; run "${tag}_full" --rangedDefense on --mobile on "$@"; }
for n in 8 12 16 24; do cond "393_ranged_${n}" --enemy ranged --count $n --width 393 --height 852; done
cond "320_ranged_12" --enemy ranged --count 12 --width 320 --height 640
cond "1365_ranged_12" --enemy ranged --count 12 --width 1365 --height 900
cond "1365_ranged_24" --enemy ranged --count 24 --width 1365 --height 900
for n in 12 24; do cond "393_mixed_${n}" --enemy mixed --count $n --width 393 --height 852; done
run "393_melee_24_v067" --file "$V067" --enemy melee --count 24 --width 393 --height 852
run "393_melee_24_v068" --enemy melee --count 24 --width 393 --height 852
