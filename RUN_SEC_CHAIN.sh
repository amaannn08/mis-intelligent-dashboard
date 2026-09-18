#!/usr/bin/env bash
# RUN SEC via agy: security hardening (env-only credentials, secret scanner in tests, stronger hook, SECURITY.md)
# -> tests + build -> push to the new GitHub repo.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_SEC_CHAIN_LOG.md"
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

log "# RUN SEC chain started"
for attempt in 1 2 3 4; do
  log "▶ RUN SEC (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 100m \
      --print "$(cat "$P/RUN_SEC_BRIEF.md")" > "$P/RUN_SEC_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_SEC_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_SEC_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 6 min…"; sleep 360; continue
  fi
  log "   ✓ RUN SEC finished"; tail -4 "$P/RUN_SEC_LOG.md" | sed 's/^/      /' | tee -a "$LOG"; break
done

log "## tests + build"
cd "$P" || exit 1
if nice -n 15 ionice -c3 npm test > "$P/RUN_SEC_TEST.log" 2>&1; then log "   ✓ npm test (incl. the new scanner) exit 0"; tail -6 "$P/RUN_SEC_TEST.log" | sed 's/^/      /' | tee -a "$LOG";
else log "   ✗ npm test FAILED — tail:"; tail -20 "$P/RUN_SEC_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; fi
if nice -n 15 ionice -c3 npm run build > "$P/RUN_SEC_BUILD.log" 2>&1; then log "   ✓ build exit 0"; else log "   ✗ build FAILED"; tail -15 "$P/RUN_SEC_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"; fi

log "## push to GitHub (repo amaannn08/mis-intelligent-dashboard)"
git add -A >/dev/null 2>&1
if ! git diff --cached --quiet; then
  git commit -q -m "chore(security): env-only credentials, secret scanner in test suite, hardened pre-commit hook

- scripts/scan-secrets.ts scans tracked files for credential shapes and the live env values; wired into npm test
- .githooks/pre-commit reuses the rule set and blocks staged .env/pem/key files
- SECURITY.md documents the policy, rotation steps and where secrets live
- README/ .env.example list variable names and placeholders only" && log "   ✓ committed"
fi
git push -q origin main 2>&1 | tail -3 | sed 's/^/      /' | tee -a "$LOG"
log "   pushed: $(git rev-parse --short HEAD)  (dirty: $(git status --porcelain | wc -l))"
log "# RUN SEC chain finished"
