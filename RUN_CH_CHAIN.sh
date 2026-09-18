#!/usr/bin/env bash
# Waits for RUN SEC, then RUN CH (inline charts + analyst narrative) -> tests/build -> deploy -> push.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_CH_CHAIN_LOG.md"
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

log "# RUN CH chain armed — waiting for RUN SEC to finish"
for i in $(seq 1 480); do
  pgrep -f "RUN_SEC_CHAIN.sh" >/dev/null 2>&1 || { log "   RUN SEC done (waited $((i*30))s) — starting RUN CH"; break; }
  sleep 30
done

for attempt in 1 2 3 4; do
  log "▶ RUN CH (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 120m \
      --print "$(cat "$P/RUN_CH_BRIEF.md")" > "$P/RUN_CH_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_CH_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_CH_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 6 min…"; sleep 360; continue
  fi
  log "   ✓ RUN CH finished"; tail -5 "$P/RUN_CH_LOG.md" | sed 's/^/      /' | tee -a "$LOG"; break
done

log "## tests + build"
cd "$P" || exit 1
if nice -n 15 ionice -c3 npm test > "$P/RUN_CH_TEST.log" 2>&1; then
  log "   ✓ npm test exit 0"; tail -4 "$P/RUN_CH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ npm test FAILED"; tail -20 "$P/RUN_CH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"
fi
if nice -n 15 ionice -c3 npm run build > "$P/RUN_CH_BUILD.log" 2>&1; then
  log "   ✓ build exit 0"
  log "## push + deploy"
  git add -A >/dev/null 2>&1
  git diff --cached --quiet || git commit -q -m "chore: charts + narrative run artifacts" 
  git push -q origin main 2>&1 | tail -2 | sed 's/^/      /' | tee -a "$LOG"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -14 | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ build FAILED — tail:"; tail -25 "$P/RUN_CH_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"
fi
log "# RUN CH chain finished"
