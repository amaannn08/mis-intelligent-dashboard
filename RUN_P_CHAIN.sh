#!/usr/bin/env bash
# RUN P (professional, hallucination-proof chat prompts) -> build -> production deploy.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_P_CHAIN_LOG.md"
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

log "# RUN P chain started"
for attempt in 1 2 3 4; do
  log "▶ RUN P (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 100m \
      --print "$(cat "$P/RUN_P_BRIEF.md")" > "$P/RUN_P_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_P_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_P_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"
    failover
    log "   waiting 6 min…"
    sleep 360
    continue
  fi
  log "   ✓ RUN P finished"
  tail -5 "$P/RUN_P_LOG.md" | sed 's/^/      /' | tee -a "$LOG"
  break
done

log "## build + deploy"
cd "$P" || exit 1
if nice -n 15 ionice -c3 npm run build > "$P/RUN_P_BUILD.log" 2>&1; then
  log "   ✓ build exit 0  (commits: $(git rev-list --count HEAD), dirty: $(git status --porcelain | wc -l))"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -14 | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ build FAILED — tail:"
  tail -25 "$P/RUN_P_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"
fi
log "# RUN P chain finished"
