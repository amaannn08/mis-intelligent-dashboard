#!/usr/bin/env bash
# Waits for RUN SEC, then runs agy in PLAN MODE to produce PLAN_CH.md and STOPS (architect review next).
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_CHPLAN_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

ACCT_A="$BK/keyring_gemini_antigravity.json"
ACCT_B="$(ls "$BK"/keyring_gemini_antigravity*[Kk]rish*.json 2>/dev/null | head -1)"
next_acct="$ACCT_B"
failover() {
  [ -f "$next_acct" ] || return 0
  log "   ⤵ switching Antigravity account"
  /tmp/keyring_env/bin/python3 /tmp/restore_account.py "$next_acct" "failover" 2>&1 | sed 's/^/      /' | tee -a "$LOG"
  if [ "$next_acct" = "$ACCT_A" ]; then next_acct="$ACCT_B"; else next_acct="$ACCT_A"; fi
}

log "# CH-PLAN armed — waiting for RUN SEC to finish"
for i in $(seq 1 480); do
  pgrep -f "RUN_SEC_CHAIN.sh" >/dev/null 2>&1 || { log "   RUN SEC done (waited $((i*30))s) — planning now"; break; }
  sleep 30
done

for attempt in 1 2 3; do
  log "▶ RUN CH-PLAN (attempt $attempt) — PLAN MODE, no code edits"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode plan \
      --model gemini-3.8-flash-high --effort high --print-timeout 70m \
      --print "$(cat "$P/RUN_CHPLAN_BRIEF.md")" > "$P/RUN_CHPLAN_RUN.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_CHPLAN_RUN.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_CHPLAN_RUN.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 6 min…"; sleep 360; continue
  fi
  log "   ✓ planning finished"
  break
done

log "## result"
if [ -f "$P/PLAN_CH.md" ]; then
  log "   ✓ PLAN_CH.md written — $(wc -l < "$P/PLAN_CH.md") lines, $(wc -c < "$P/PLAN_CH.md") bytes"
  log "   headings:"; grep -nE "^#{1,3} " "$P/PLAN_CH.md" | head -20 | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ PLAN_CH.md not written — tail of the run:"
  tail -12 "$P/RUN_CHPLAN_RUN.md" | sed 's/^/      /' | tee -a "$LOG"
fi
log "# CH-PLAN done — STOPPING here for architect review (no code was changed)"
