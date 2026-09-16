#!/usr/bin/env bash
# Chain: RUN 1-FINISH → then the original driver (runs 2..5). Secrets are already injected.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
LOG="$P/CHAIN_LOG.md"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "# chain started (run 1-finish, then runs 2..5)"

run_brief() {
  local name="$1" brief="$2" out="$3" attempt
  for attempt in 1 2; do
    log "▶ $name (attempt $attempt)"
    ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
        --model gemini-3.8-flash-high --effort high --print-timeout 85m \
        --print "$(cat "$brief")" > "$out" 2>&1; echo "EXIT=$?" >> "$out" )
    if grep -qiE "quota reached|network issue connecting|RESOURCE_EXHAUSTED|permission denied" "$out"; then
      log "   ✗ $name quota/network error (attempt $attempt)"; sleep 300; continue
    fi
    log "   ✓ $name finished"
    tail -3 "$out" | sed 's/^/      /' | tee -a "$LOG"
    return 0
  done
  log "   ✗✗ $name failed twice"; return 1
}

# --- step 1: finish the database layer ---
if ! run_brief "RUN 1-FINISH" "$P/RUN1_FINISH_BRIEF.md" "$P/RUN1_FINISH_LOG.md"; then
  log "stopping: run 1-finish failed"; exit 1
fi

# --- step 2: hand over to the main driver for runs 2..5 ---
log "handing over to DRIVER.sh for runs 2..5"
exec bash "$P/DRIVER.sh"
