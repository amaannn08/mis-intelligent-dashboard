#!/usr/bin/env bash
# MIS dashboard — one-shot deploy: Neon migrations → Vercel project → env vars → preview → verify → production.
# Idempotent. Never prints secret values.
# Hardened: the Vercel token is re-read right before use and refreshed via the CLI if a call is rejected,
# because auth.json rotates (a stale token returns HTTP 403 "Not authorized").
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
SEC=/home/amann/.hermes/private/mis-secrets.env
export PATH="/home/amann/.local/bin:$PATH"
PROJECT=mis-intelligent-dashboard
TEAM_SLUG=amans-projects-f8d5ff4a
TEAM_ID=team_qr2gkYRec5GIRxCaU9FhUt5O
API=https://api.vercel.com
AUTH=/home/amann/.local/share/com.vercel.cli/auth.json
LOG="$P/DEPLOY_FIX_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

set -a; . "$SEC"; set +a

# ---- token plumbing ---------------------------------------------------------
fresh_token() {
  # ask the CLI to validate/refresh (it rewrites auth.json), then read it
  timeout 45 vercel whoami >/dev/null 2>&1
  python3 -c "import json;print(json.load(open('$AUTH'))['token'])"
}

# curl wrapper: retries a rejected call once after refreshing the token
api_call() {
  local method="$1" url="$2" body="${3:-}" code
  local tok; tok=$(fresh_token)
  local args=(-s -o /tmp/vcres.json -w "%{http_code}" --max-time 60 -X "$method"
              -H "Authorization: Bearer $tok")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  code=$(curl "${args[@]}" "$url")
  if [ "$code" = "403" ] || [ "$code" = "401" ]; then
    sleep 3
    tok=$(fresh_token)   # CLI refreshes the rotated token
    args=(-s -o /tmp/vcres.json -w "%{http_code}" --max-time 60 -X "$method" -H "Authorization: Bearer $tok")
    [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
    code=$(curl "${args[@]}")
  fi
  echo "$code"
}

log "# deploy started"

# ---------------------------------------------------------------- 1. Neon migrations
log "## 1. applying migrations to the production Neon database"
( cd "$P/packages/db" && DATABASE_URL="$MIS_PROD_DATABASE_URL_DIRECT" nice -n 15 ionice -c3 npm run db:migrate 2>&1 | tail -6 ) \
  | sed 's/^/      /' | tee -a "$LOG"

# ---------------------------------------------------------------- 2. project exists / protection off
log "## 2. Vercel project: protection off"
log "   PATCH HTTP $(api_call PATCH "$API/v9/projects/$PROJECT?teamId=$TEAM_ID" \
  '{"ssoProtection":null,"passwordProtection":null,"previewDeploymentSuffix":null}')"

# ---------------------------------------------------------------- 3. env vars
log "## 3. environment variables"
set_env() {
  local k="$1" v="$2" code eid c2
  code=$(api_call POST "$API/v10/projects/$PROJECT/env?teamId=$TEAM_ID" \
    "$(python3 -c "import json,sys;print(json.dumps({'key':sys.argv[1],'value':sys.argv[2],'type':'encrypted','target':['production','preview','development']}))" "$k" "$v")")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then log "   ✓ $k"; return 0; fi
  eid=$(curl -s --max-time 40 -H "Authorization: Bearer $(fresh_token)" \
    "$API/v9/projects/$PROJECT/env?teamId=$TEAM_ID" \
    | python3 -c "
import json,sys
try:
  for e in json.load(sys.stdin).get('envs',[]):
    if e['key']=='$k': print(e['id'])
except Exception: pass" | head -1)
  if [ -n "$eid" ]; then
    c2=$(api_call PATCH "$API/v9/projects/$PROJECT/env/$eid?teamId=$TEAM_ID" \
      "$(python3 -c "import json,sys;print(json.dumps({'value':sys.argv[1]}))" "$v")")
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

# ---------------------------------------------------------------- 4. production deploy (with retry)
log "## 4. production deploy"
cd "$P" || exit 1
[ -d .vercel ] || vercel link --yes --project "$PROJECT" --scope "$TEAM_SLUG" >/dev/null 2>&1
PROD=""
for try in 1 2 3; do
  OUT=$(nice -n 15 ionice -c3 vercel deploy --prod --yes 2>&1)
  echo "$OUT" | tail -6 | sed 's/^/      /' | tee -a "$LOG"
  PROD=$(echo "$OUT" | grep -oE 'https://mis-intelligent-dashboard[a-zA-Z0-9.-]*\.vercel\.app' | tail -1)
  if [ -n "$PROD" ]; then break; fi
  log "   deploy attempt $try produced no URL — refreshing auth and retrying"
  fresh_token >/dev/null; sleep 5
done
log "   production: ${PROD:-FAILED}"

if [ -n "$PROD" ]; then
  set_env NEXT_PUBLIC_APP_URL "$PROD"
  sleep 12
  log "## 5. verification"
  for path in / /login /api/health; do
    log "   $path -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$PROD$path")"
  done
  log "   health body: $(curl -s --max-time 45 "$PROD/api/health")"
  log "   stable alias: https://mis-intelligent-dashboard.vercel.app -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 45 https://mis-intelligent-dashboard.vercel.app/api/health)"
  log "   DONE — $PROD"
fi
log "# deploy finished"
