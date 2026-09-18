#!/usr/bin/env bash
# Plan-mode run: Vercel Blob migration + chart/answer UX overhaul -> PLAN_BLOB_UX.md, then STOP for review.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_BLOBUX_PLAN_LOG.md"
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

log "# BLOB+UX PLAN started (plan mode — no code edits)"
for attempt in 1 2 3; do
  log "▶ PLAN attempt $attempt"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode plan \
      --model gemini-3.8-flash-high --effort high --print-timeout 80m \
      --print "$(cat "$P/RUN_BLOBUX_PLAN_BRIEF.md")" > "$P/RUN_BLOBUX_PLAN_RUN.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_BLOBUX_PLAN_RUN.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_BLOBUX_PLAN_RUN.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 6 min…"; sleep 360; continue
  fi
  log "   ✓ planning finished"; break
done

log "## result"
if [ -f "$P/PLAN_BLOB_UX.md" ]; then
  log "   ✓ PLAN_BLOB_UX.md — $(wc -l < "$P/PLAN_BLOB_UX.md") lines, $(wc -c < "$P/PLAN_BLOB_UX.md") bytes"
  grep -nE "^#{1,3} " "$P/PLAN_BLOB_UX.md" | head -24 | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ plan not written — tail:"; tail -12 "$P/RUN_BLOBUX_PLAN_RUN.md" | sed 's/^/      /' | tee -a "$LOG"
fi
log "# STOPPING for architect review"
