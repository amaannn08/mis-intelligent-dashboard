#!/usr/bin/env bash
# Fix the two deploy blockers: (1) Vercel deployment protection (SSO 302s), (2) env vars with the
# correct team id. Then redeploy to production and verify.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
SEC=/home/amann/.hermes/private/mis-secrets.env
export PATH="/home/amann/.local/bin:$PATH"
PROJECT=mis-intelligent-dashboard
TEAM_ID=team_qr2gkYRec5GIRxCaU9FhUt5O
API=https://api.vercel.com
LOG="$P/DEPLOY_FIX_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

set -a; . "$SEC"; set +a
TOKEN=$(python3 -c "import json;print(json.load(open('/home/amann/.local/share/com.vercel.cli/auth.json'))['token'])")

log "# deploy fix started"

# ---------------------------------------------------------------- 1. deployment protection OFF
log "## 1. disabling Vercel deployment protection (that is what the 302s were)"
curl -s --max-time 40 -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/v9/projects/$PROJECT?teamId=$TEAM_ID" \
  -d '{"ssoProtection":null,"passwordProtection":null,"previewDeploymentSuffix":null}' \
  -o /tmp/patchprot.json -w "   PATCH HTTP %{http_code}\n" | tee -a "$LOG"
python3 -c "
import json
try:
    d=json.load(open('/tmp/patchprot.json'))
    print('   ssoProtection now:', d.get('ssoProtection'))
    print('   passwordProtection now:', d.get('passwordProtection'))
    if 'error' in d: print('   error:', d['error'])
except Exception as e: print('   ?', e)" 2>&1 | tee -a "$LOG"

# ---------------------------------------------------------------- 2. env vars with the RIGHT team id
log "## 2. environment variables (correct team id: $TEAM_ID)"
set_env() {
  local k="$1" v="$2" code eid c2
  code=$(curl -s -o /tmp/envset.json -w "%{http_code}" --max-time 40 -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/v10/projects/$PROJECT/env?teamId=$TEAM_ID" \
    -d "$(python3 -c "import json,sys;print(json.dumps({'key':sys.argv[1],'value':sys.argv[2],'type':'encrypted','target':['production','preview','development']}))" "$k" "$v")")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then log "   ✓ $k"; return 0; fi
  eid=$(curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" "$API/v9/projects/$PROJECT/env?teamId=$TEAM_ID" \
    | python3 -c "
import json,sys
try:
  for e in json.load(sys.stdin).get('envs',[]):
    if e['key']=='$k': print(e['id'])
except Exception: pass" | head -1)
  if [ -n "$eid" ]; then
    c2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 40 -X PATCH -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" "$API/v9/projects/$PROJECT/env/$eid?teamId=$TEAM_ID" \
      -d "$(python3 -c "import json,sys;print(json.dumps({'value':sys.argv[1]}))" "$v")")
    log "   ~ $k (updated HTTP $c2)"
  else
    log "   ✗ $k (POST HTTP $code)"
  fi
}
COOKIE=$(grep '^COOKIE_SECRET=' "$P/apps/web/.env.local" 2>/dev/null | cut -d= -f2-)
[ -z "$COOKIE" ] && COOKIE=$(python3 -c "import secrets;print(secrets.token_hex(32))")
set_env DATABASE_URL "$MIS_PROD_DATABASE_URL"
set_env GEMINI_API_KEY "$MIS_GEMINI_API_KEY"
set_env GEMINI_EMBEDDING_MODEL "gemini-embedding-001"
set_env EMBEDDING_DIMENSIONS "1536"
set_env DEEPSEEK_API_KEY "$MIS_DEEPSEEK_API_KEY"
set_env DEEPSEEK_BASE_URL "https://api.deepseek.com"
set_env DEEPSEEK_MODEL "deepseek-chat"
set_env AUTH_USERNAME "$MIS_AUTH_USERNAME"
set_env AUTH_PASSWORD "$MIS_AUTH_PASSWORD"
set_env COOKIE_SECRET "$COOKIE"

log "## 3. env vars now on the project:"
curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" "$API/v9/projects/$PROJECT/env?teamId=$TEAM_ID" \
  | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  for e in sorted(d.get('envs',[]), key=lambda x:x['key']):
      print('     ', e['key'], '->', e.get('target'))
except Exception as e: print('   ?', e)" 2>&1 | tee -a "$LOG"

# ---------------------------------------------------------------- 4. production deploy
log "## 4. production deploy (picks up the new env vars)"
cd "$P" || exit 1
[ -d .vercel ] || vercel link --yes --project "$PROJECT" --scope amans-projects-f8d5ff4a >/dev/null 2>&1
PROD_URL=$(nice -n 15 ionice -c3 vercel deploy --prod --yes 2>&1 | tee -a "$LOG" | grep -oE 'https://mis-intelligent-dashboard[a-zA-Z0-9.-]*\.vercel\.app' | tail -1)
log "   production: ${PROD_URL:-FAILED}"

if [ -n "${PROD_URL:-}" ]; then
  set_env NEXT_PUBLIC_APP_URL "$PROD_URL"
  sleep 15
  log "## 5. verification"
  for path in / /login /api/health; do
    log "   $path -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$PROD_URL$path")"
  done
  log "   health body: $(curl -s --max-time 45 "$PROD_URL/api/health")"
  log "   DONE — $PROD_URL"
fi
log "# deploy fix finished"
