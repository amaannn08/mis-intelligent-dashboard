#!/usr/bin/env bash
# Waits for the chat chain to finish, then runs RUN D (CRM design port + performance) → build → deploy.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_D_CHAIN_LOG.md"
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

log "# RUN D chain armed — waiting for the chat chain to finish first"
for i in $(seq 1 480); do
  if ! pgrep -f "CHAT_CHAIN.sh" >/dev/null 2>&1; then
    log "   chat chain is done (waited $((i*30))s) — starting RUN D"
    break
  fi
  sleep 30
done

run_one() {
  local n="$1" brief="$P/RUN_${1}_BRIEF.md" out="$P/RUN_${1}_LOG.md" attempt
  for attempt in 1 2 3 4; do
    log "▶ RUN $n (attempt $attempt)"
    ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
        --model gemini-3.8-flash-high --effort high --print-timeout 120m \
        --print "$(cat "$brief")" > "$out" 2>&1; echo "EXIT=$?" >> "$out" )
    if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$out"; then
      log "   ✗ RUN $n quota/network wall (attempt $attempt)"
      failover
      log "   waiting 6 min…"
      sleep 360
      continue
    fi
    log "   ✓ RUN $n finished"
    tail -4 "$out" | sed 's/^/      /' | tee -a "$LOG"
    return 0
  done
  log "   ✗✗ RUN $n failed after 4 attempts — stopping"
  return 1
}

run_one D || exit 1

log "## build check"
cd "$P" || exit 1
if nice -n 15 ionice -c3 npm run build > "$P/RUN_D_BUILD.log" 2>&1; then
  log "   ✓ production build exit 0"
  log "   commits: $(git rev-list --count HEAD)  dirty: $(git status --porcelain | wc -l)"
  log "## deploying to production"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -18 | sed 's/^/      /' | tee -a "$LOG"
else
  log "   ✗ build FAILED — tail:"
  tail -25 "$P/RUN_D_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"
fi
log "# RUN D chain finished"
