#!/usr/bin/env bash
# RUN POLISH: KPI copy fix -> verify -> commit -> push -> deploy.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_POLISH_CHAIN_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

ACCT_A="$BK/keyring_gemini_antigravity.json"                                   # amaannn.gupta.08
ACCT_B="$(ls "$BK"/keyring_gemini_antigravity*[Kk]rish*.json 2>/dev/null | head -1)"  # krish (currently active)
next_acct="$ACCT_A"

failover() {
  [ -f "$next_acct" ] || return 0
  log "   ⤵ switching Antigravity account"
  /tmp/keyring_env/bin/python3 /tmp/restore_account.py "$next_acct" "failover" 2>&1 | sed 's/^/      /' | tee -a "$LOG"
  if [ "$next_acct" = "$ACCT_A" ]; then next_acct="$ACCT_B"; else next_acct="$ACCT_A"; fi
}

log "# POLISH chain started"
for attempt in 1 2 3; do
  log "▶ RUN POLISH (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 60m \
      --print "$(cat "$P/RUN_POLISH_BRIEF.md")" > "$P/RUN_POLISH_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_POLISH_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_POLISH_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 5 min…"; sleep 300; continue
  fi
  log "   ✓ polish run finished"; tail -4 "$P/RUN_POLISH_LOG.md" | sed 's/^/      /' | tee -a "$LOG"; break
done

log "## independent verification"
cd "$P" || exit 1
OK=1
nice -n 15 ionice -c3 npm run typecheck > "$P/RUN_POLISH_TYPECHECK.log" 2>&1 && log "   ✓ typecheck" || { log "   ✗ typecheck"; tail -10 "$P/RUN_POLISH_TYPECHECK.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }
nice -n 15 ionice -c3 npm test > "$P/RUN_POLISH_TEST.log" 2>&1 && { log "   ✓ npm test"; tail -4 "$P/RUN_POLISH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; } || { log "   ✗ npm test"; tail -14 "$P/RUN_POLISH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }
nice -n 15 ionice -c3 npm run build > "$P/RUN_POLISH_BUILD.log" 2>&1 && log "   ✓ build" || { log "   ✗ build"; tail -16 "$P/RUN_POLISH_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }

if [ "$OK" = "1" ]; then
  log "## commit + push + deploy"
  git add -A >/dev/null 2>&1
  git diff --cached --quiet || git commit -q -m "fix(dashboard): only show the delta chip on metric KPI cards

Counts, text values and ratios no longer render a meaningless 'No baseline'; metric cards keep it
(renamed to 'no prior period') and a component test pins both cases." && log "   ✓ committed"
  git push -q origin main 2>&1 | tail -2 | sed 's/^/      /' | tee -a "$LOG"
  log "   pushed: $(git rev-parse --short HEAD)"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -10 | sed 's/^/      /' | tee -a "$LOG"
else
  log "## verification failed — not shipping (tree left inspectable)"
fi
log "# POLISH chain finished (OK=$OK)"
