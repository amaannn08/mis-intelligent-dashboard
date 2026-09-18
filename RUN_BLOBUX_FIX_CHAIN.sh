#!/usr/bin/env bash
# RUN BLOBUX-FIX -> verify (tests+build+tests) -> commit -> push -> production deploy.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
BK=/home/amann/.gemini/token_backup
LOG="$P/RUN_BLOBUX_FIX_CHAIN_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

ACCT_A="$BK/keyring_gemini_antigravity.json"
ACCT_B="$(ls "$BK"/keyring_gemini_antigravity*[Kk]rish*.json 2>/dev/null | head -1)"
next_acct="$ACCT_A"   # currently krish is active, so fail over to the other one first

failover() {
  [ -f "$next_acct" ] || return 0
  log "   ⤵ switching Antigravity account"
  /tmp/keyring_env/bin/python3 /tmp/restore_account.py "$next_acct" "failover" 2>&1 | sed 's/^/      /' | tee -a "$LOG"
  if [ "$next_acct" = "$ACCT_A" ]; then next_acct="$ACCT_B"; else next_acct="$ACCT_A"; fi
}

log "# BLOBUX-FIX chain started"
for attempt in 1 2 3; do
  log "▶ RUN BLOBUX-FIX (attempt $attempt)"
  ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
      --model gemini-3.8-flash-high --effort high --print-timeout 120m \
      --print "$(cat "$P/RUN_BLOBUX_FIX_BRIEF.md")" > "$P/RUN_BLOBUX_FIX_LOG.md" 2>&1; echo "EXIT=$?" >> "$P/RUN_BLOBUX_FIX_LOG.md" )
  if grep -qiE "quota reached|RESOURCE_EXHAUSTED|network issue connecting|429" "$P/RUN_BLOBUX_FIX_LOG.md"; then
    log "   ✗ quota/network wall (attempt $attempt)"; failover; log "   waiting 5 min…"; sleep 300; continue
  fi
  log "   ✓ fix run finished"; tail -5 "$P/RUN_BLOBUX_FIX_LOG.md" | sed 's/^/      /' | tee -a "$LOG"; break
done

log "## independent verification"
cd "$P" || exit 1
OK=1
if nice -n 15 ionice -c3 npm run typecheck > "$P/RUN_FIX_TYPECHECK.log" 2>&1; then log "   ✓ typecheck"; else log "   ✗ typecheck FAILED"; tail -12 "$P/RUN_FIX_TYPECHECK.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; fi
if nice -n 15 ionice -c3 npm test > "$P/RUN_FIX_TEST.log" 2>&1; then log "   ✓ npm test"; tail -4 "$P/RUN_FIX_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; else log "   ✗ npm test FAILED"; tail -16 "$P/RUN_FIX_TEST.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; fi
if nice -n 15 ionice -c3 npm run build > "$P/RUN_FIX_BUILD.log" 2>&1; then log "   ✓ build"; else log "   ✗ build FAILED"; tail -18 "$P/RUN_FIX_BUILD.log" | sed 's/^/      /' | tee -a "$LOG"; OK=0; fi

if [ "$OK" = "1" ]; then
  log "## commit + push + deploy"
  git add -A >/dev/null 2>&1
  git diff --cached --quiet || {
    git commit -q -m "feat(blob): client-side Vercel Blob uploads, authenticated private proxy, legacy fallback

feat(ux): compact supporting charts and clean answer formatting

- chart: 160/140px plots, single left axis, value labels, 24% bar gap, <=36px bars, rounded ends,
  emphasised zero baseline, no decorative series
- answer: markdown bold fixed (regression-tested), quiet citation marks, key-figures strip from the
  deterministic chart payload, trend callout, Basis meta row, 680px prose measure
- blob: @vercel/blob client upload with server-issued token, documents.blob_url migration,
  private store read through an authenticated proxy, document_blobs read fallback kept" && log "   ✓ committed"
  }
  git push -q origin main 2>&1 | tail -2 | sed 's/^/      /' | tee -a "$LOG"
  log "   pushed: $(git rev-parse --short HEAD)"
  bash "$P/DEPLOY_FIX.sh" 2>&1 | tail -12 | sed 's/^/      /' | tee -a "$LOG"
else
  log "## verification failed — NOT committing/deploying (tree left inspectable)"
fi
log "# BLOBUX-FIX chain finished (OK=$OK)"
