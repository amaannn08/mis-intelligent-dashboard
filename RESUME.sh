#!/usr/bin/env bash
# Resume the MIS build chain from RUN 3 (RUN 1-FINISH and RUN 2 already succeeded).
# On success of all three, verify the production build and hand over to DEPLOY.sh.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
LOG="$P/RESUME_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "# resume started (runs 3,4,5 — account switched to amaannn after a quota wall)"

run_one() {
  local n="$1" brief="$P/RUN${1}_BRIEF.md" out="$P/RUN${1}_LOG.md" attempt
  for attempt in 1 2; do
    log "▶ RUN $n (attempt $attempt)"
    ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
        --model gemini-3.8-flash-high --effort high --print-timeout 85m \
        --print "$(cat "$brief")" > "$out" 2>&1; echo "EXIT=$?" >> "$out" )
    if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting" "$out"; then
      log "   ✗ RUN $n quota/network wall (attempt $attempt) — waiting 5 min then retrying"
      sleep 300; continue
    fi
    log "   ✓ RUN $n finished"
    tail -3 "$out" | sed 's/^/      /' | tee -a "$LOG"
    return 0
  done
  log "   ✗✗ RUN $n failed twice — STOPPING"
  return 1
}

for n in 3 4 5; do
  run_one "$n" || { log "chain stopped at RUN $n"; exit 1; }
done

log "## all runs done — verifying the production build"
cd "$P" || exit 1
if nice -n 15 ionice -c3 npm run build > "$P/FINAL_BUILD.log" 2>&1; then
  log "   ✓ npm run build exit 0"
  log "   commits: $(git rev-list --count HEAD)  dirty: $(git status --porcelain | wc -l)"
  log "## handing over to DEPLOY.sh"
  exec bash "$P/DEPLOY.sh"
else
  log "   ✗ build FAILED — not deploying. tail:"
  tail -25 "$P/FINAL_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"
fi
