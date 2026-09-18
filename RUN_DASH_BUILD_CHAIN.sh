#!/usr/bin/env bash
# RUN DASH-BUILD -> verify -> commit -> push -> production deploy.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_DASH_BUILD_CHAIN_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

ACCT_A="$BK/keyring_gemini_antigravity.json"
ACCT_B="$(ls "$BK"/keyring_gemini_antigravity*[Kk]rish*.json 2>/dev/null | head -1)"
next_acct="$ACCT_A"

failover() {
  [ -f "$next_acct" ] || return 0
  log "   ⤵ switching Antigravity account"
  /tmp/keyring_env/bin/python3 /tmp/restore_account.py "$next_acct" "failover" 2>&1 | sed 's/^/      /' | tee -a "$LOG"
  if [ "$next_acct" = "$ACCT_A" ]; then next_acct="$ACCT_B"; else next_acct="$ACCT_A"; fi
}

log "# DASH-BUILD chain started (plan + review approved)"
for attempt in 1 2 3 4; do
  log "▶ RUN DASH-BUILD (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 120m \
      --print "$(cat "$P/RUN_DASH_BUILD_BRIEF.md")" > "$P/RUN_DASH_BUILD_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_DASH_BUILD_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_DASH_BUILD_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 5 min…"; sleep 300; continue
  fi
  log "   ✓ build run finished"; tail -5 "$P/RUN_DASH_BUILD_LOG.md" | sed 's/^/      /' | tee -a "$LOG"; break
done

log "## independent verification"
cd "$P" || exit 1
OK=1
nice -n 15 ionice -c3 npm run typecheck > "$P/RUN_DASH_TYPECHECK.log" 2>&1 && log "   ✓ typecheck" || { log "   ✗ typecheck"; tail -12 "$P/RUN_DASH_TYPECHECK.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }
nice -n 15 ionice -c3 npm test > "$P/RUN_DASH_TEST.log" 2>&1 && { log "   ✓ npm test"; tail -5 "$P/RUN_DASH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; } || { log "   ✗ npm test"; tail -18 "$P/RUN_DASH_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }
nice -n 15 ionice -c3 npm run build > "$P/RUN_DASH_BUILDLOG.log" 2>&1 && log "   ✓ build" || { log "   ✗ build"; tail -20 "$P/RUN_DASH_BUILDLOG.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; }

if [ "$OK" = "1" ]; then
  log "## commit + push + deploy"
  git add -A >/dev/null 2>&1
  git diff --cached --quiet || git commit -q -m "feat(dashboard): company filter driving every KPI/chart + burn & EBITDA-% MoM chart

- Overview: URL-driven company filter (?companies=slug,slug) recomputes the KPI row, revenue trend,
  recent filings and coverage labels server-side (single batched query, zero N+1)
- aggregation is the ratio of sums (never an average of company percentages); companies with no revenue
  in a month are excluded from that month's ratio
- new burn + EBITDA-% month-on-month chart: dual series, single left axis, emphasised zero line,
  tooltips carrying both the percentage and the underlying rupees, explicit coverage note
- honest labelling: 'Sum of latest reported revenue - N companies with data' and 'Reporting: N of M selected'
- reconciliation tests for the aggregator + URL parsing" && log "   ✓ committed"
  git push -q origin main 2>&1 | tail -2 | sed 's/^/      /' | tee -a "$LOG"
  log "   pushed: $(git rev-parse --short HEAD)"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -10 | sed 's/^/      /' | tee -a "$LOG"
else
  log "## verification failed — not shipping (tree left inspectable)"
fi
log "# DASH-BUILD chain finished (OK=$OK)"
