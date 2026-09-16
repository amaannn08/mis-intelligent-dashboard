#!/usr/bin/env bash
# MIS dashboard — one-shot deploy: Neon migrations → Vercel project → env vars → preview → verify → production.
# Idempotent: safe to re-run. Never prints secret values.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
SEC=/home/amann/.hermes/private/mis-secrets.env
export PATH="/home/amann/.local/bin:$PATH"
PROJECT=mis-intelligent-dashboard
TEAM=amans-projects-f8d5ff4a
DLOG="$P/DEPLOY_LOG.md"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$DLOG"; }

[ -f "$SEC" ] || { echo "FATAL: secrets file missing"; exit 1; }
set -a; . "$SEC"; set +a

TOKEN=$(python3 -c "import json;print(json.load(open('/home/amann/.local/share/com.vercel.cli/auth.json'))['token'])")
API=https://api.vercel.com

log "# deploy started"

# ---------------------------------------------------------------- 1. Neon migrations
log "## 1. applying migrations to the production Neon database (direct endpoint)"
if [ -d "$P/packages/db" ]; then
  ( cd "$P/packages/db" && DATABASE_URL="$MIS_PROD_DATABASE_URL_DIRECT" \
      nice -n 15 ionice -c3 npm run db:migrate 2>&1 | tail -6 | sed 's/^/    /' | tee -a "$DLOG" )
  log "   tables now in Neon:"
  psql "$MIS_PROD_DATABASE_URL_DIRECT" -tAc "select tablename from pg_tables where schemaname='public' order by 1" 2>&1 | sed 's/^/      /' | tee -a "$DLOG"
  log "   pgvector: $(psql "$MIS_PROD_DATABASE_URL_DIRECT" -tAc "select extversion from pg_extension where extname='vector'" 2>&1)"
else
  log "   packages/db missing — skipping"
fi

# ---------------------------------------------------------------- 2. Vercel project
log "## 2. Vercel project"
PROJ_JSON=$(curl -s --max-time 40 -H "Authorization: Bearer $TOKEN" "$API/v9/projects/$PROJECT?teamId=team_$TEAM")
if echo "$PROJ_JSON" | grep -q '"error"'; then
  log "   creating project…"
  curl -s --max-time 60 -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/v10/projects?teamId=team_$TEAM" \
    -d "{\"name\":\"$PROJECT\",\"framework\":\"nextjs\",\"rootDirectory\":\"apps/web\"}" -o /tmp/createproj.json -w "      HTTP %{http_code}\n" | tee -a "$DLOG"
else
  log "   project exists"
  # make sure the monorepo settings are right
  curl -s --max-time 40 -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/v9/projects/$PROJECT?teamId=team_$TEAM" \
    -d '{"framework":"nextjs","rootDirectory":"apps/web"}' -o /dev/null -w "      settings PATCH HTTP %{http_code}\n" | tee -a "$DLOG"
fi

# ---------------------------------------------------------------- 3. env vars
log "## 3. environment variables (values never logged)"
set_env() {
  local k="$1" v="$2"
  local code
  code=$(curl -s -o /tmp/envset.json -w "%{http_code}" --max-time 40 -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/v10/projects/$PROJECT/env?teamId=team_$TEAM" \
    -d "$(python3 -c "import json,sys;print(json.dumps({'key':sys.argv[1],'value':sys.argv[2],'type':'encrypted','target':['production','preview','development']}))" "$k" "$v")")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then log "   ✓ $k"
  else
    eid=$(curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" "$API/v9/projects/$PROJECT/env?teamId=team_$TEAM" \
      | python3 -c "
import json,sys
try:
  for e in json.load(sys.stdin).get('envs',[]):
    if e['key']=='$k': print(e['id'])
except Exception: pass" | head -1)
    if [ -n "$eid" ]; then
      c2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 40 -X PATCH -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" "$API/v9/projects/$PROJECT/env/$eid?teamId=team_$TEAM" \
        -d "$(python3 -c "import json,sys;print(json.dumps({'value':sys.argv[1]}))" "$v")")
      log "   ~ $k (updated, HTTP $c2)"
    else
      log "   ✗ $k (HTTP $code)"
    fi
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

# ---------------------------------------------------------------- 4. deploy preview
log "## 4. preview deploy from the repo root"
cd "$P" || exit 1
[ -d .vercel ] || vercel link --yes --project "$PROJECT" --scope "$TEAM" >/dev/null 2>&1
PREVIEW_URL=$(nice -n 15 ionice -c3 vercel deploy --yes 2>&1 | tee -a "$DLOG" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)
log "   preview: ${PREVIEW_URL:-FAILED}"

if [ -n "${PREVIEW_URL:-}" ]; then
  log "## 5. verifying the preview"
  sleep 20
  for path in / /login /api/health; do
    log "   $path -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$PREVIEW_URL$path")"
  done
  HEALTH=$(curl -s --max-time 45 "$PREVIEW_URL/api/health")
  log "   health body: $HEALTH"

  if echo "$HEALTH" | grep -q '"ok":true'; then
    log "## 6. promoting to PRODUCTION"
    set_env NEXT_PUBLIC_APP_URL "$PREVIEW_URL"
    PROD_URL=$(vercel deploy --prod --yes 2>&1 | tee -a "$DLOG" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)
    log "   PRODUCTION: ${PROD_URL:-FAILED}"
    if [ -n "${PROD_URL:-}" ]; then
      set_env NEXT_PUBLIC_APP_URL "$PROD_URL"
      log "   post-deploy: $(curl -s -o /dev/null -w '%{http_code}' --max-time 45 "$PROD_URL/") on /"
      log "   DONE — $PROD_URL"
    fi
  else
    log "   health did not pass — NOT promoting. Investigate."
  fi
fi
log "# deploy finished"
