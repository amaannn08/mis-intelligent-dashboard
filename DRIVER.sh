#!/usr/bin/env bash
# MIS dashboard pipeline driver — advances the build through runs 2..5 automatically.
# Stops on a hard failure (2 attempts per run) and reports; never commits secrets.
set -u
P=/home/amann/intern-weh/mis-intelligent-dashboard
AGY=/home/amann/.local/bin/agy.bin
SEC=/home/amann/.hermes/private/mis-secrets.env
DLOG="$P/DRIVER_LOG.md"
RUN1_WRAPPER=2038076
SHIK_WRAPPER=2025339

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$DLOG"; }

mkdir -p "$(dirname "$DLOG")"
log "# MIS dashboard driver — started"
log "waiting for RUN 1 (wrapper pid $RUN1_WRAPPER) …"
while kill -0 "$RUN1_WRAPPER" 2>/dev/null; do sleep 30; done
log "RUN 1 finished"

# Don't fight the other agy job for the machine; bounded wait (3 min — it is mostly idle-waiting anyway).
for i in $(seq 1 6); do
  kill -0 "$SHIK_WRAPPER" 2>/dev/null || break
  sleep 30
done
log "other agy job: $(kill -0 "$SHIK_WRAPPER" 2>/dev/null && echo 'still running (proceeding anyway)' || echo 'finished')"

# ---------------------------------------------------------------- inject secrets
log "## injecting environment (values never logged)"
set -a; . "$SEC"; set +a
python3 - "$P" <<'PYEOF'
import os, sys, re
P = sys.argv[1]
keys = {
    "DATABASE_URL": os.environ["MIS_DEV_DATABASE_URL"],
    "GEMINI_API_KEY": os.environ["MIS_GEMINI_API_KEY"],
    "GEMINI_EMBEDDING_MODEL": "gemini-embedding-001",
    "EMBEDDING_DIMENSIONS": "1536",
    "DEEPSEEK_API_KEY": os.environ["MIS_DEEPSEEK_API_KEY"],
    "DEEPSEEK_BASE_URL": "https://api.deepseek.com",
    "DEEPSEEK_MODEL": "deepseek-chat",
    "AUTH_USERNAME": os.environ["MIS_AUTH_USERNAME"],
    "AUTH_PASSWORD": os.environ["MIS_AUTH_PASSWORD"],
    "NEXT_PUBLIC_APP_URL": "http://localhost:3000",
}
# a stable cookie secret for dev+prod unless one already exists
cookie = None
for cand in [f"{P}/apps/web/.env.local", f"{P}/packages/db/.env"]:
    if os.path.exists(cand):
        for line in open(cand):
            if line.startswith("COOKIE_SECRET=") and len(line.split("=",1)[1].strip()) > 16:
                cookie = line.split("=",1)[1].strip()
if not cookie:
    import secrets; cookie = secrets.token_hex(32)
keys["COOKIE_SECRET"] = cookie

def upsert(path, kv):
    d = os.path.dirname(path)
    if d: os.makedirs(d, exist_ok=True)
    lines = open(path).read().splitlines() if os.path.exists(path) else []
    seen = set()
    out = []
    for ln in lines:
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=', ln)
        if m and m.group(1) in kv:
            out.append(f'{m.group(1)}={kv[m.group(1)]}')
            seen.add(m.group(1))
        else:
            out.append(ln)
    for k, v in kv.items():
        if k not in seen:
            out.append(f'{k}={v}')
    open(path, "w").write("\n".join(l for l in out if l.strip()) + "\n")
    print(f"   wrote {len(kv)} keys -> {path}")

for target in [f"{P}/apps/web/.env.local", f"{P}/packages/db/.env"]:
    upsert(target, keys)
PYEOF

log "verifying the env files are ignored by git …"
cd "$P" || exit 1
ok=1
for f in apps/web/.env.local packages/db/.env; do
  if git check-ignore -q "$f" 2>/dev/null; then log "   ✓ ignored: $f"; else log "   ✗ NOT IGNORED: $f — ABORTING"; ok=0; fi
done
[ "$ok" = "1" ] || { log "FATAL: secret file not ignored"; exit 1; }

# ---------------------------------------------------------------- run chain
run_one() {
  local n="$1" brief="$P/RUN${1}_BRIEF.md" out="$P/RUN${1}_LOG.md"
  local attempt
  for attempt in 1 2; do
    log "▶ RUN $n (attempt $attempt) — $(basename "$brief")"
    ( cd "$P" && nice -n 15 ionice -c3 "$AGY" --dangerously-skip-permissions --mode accept-edits \
        --model gemini-3.8-flash-high --effort high --print-timeout 85m \
        --print "$(cat "$brief")" > "$out" 2>&1; echo "EXIT=$?" >> "$out" )
    if grep -qiE "quota reached|network issue connecting|RESOURCE_EXHAUSTED|permission denied" "$out"; then
      log "   ✗ RUN $n hit a quota/network error (attempt $attempt)"
      sleep 300
      continue
    fi
    log "   ✓ RUN $n finished — last log lines:"
    tail -4 "$out" | sed 's/^/      /' | tee -a "$DLOG"
    return 0
  done
  log "   ✗✗ RUN $n failed twice — STOPPING the chain (repo left in its current, inspectable state)"
  return 1
}

for n in 2 3 4 5; do
  run_one "$n" || { log "chain stopped at RUN $n"; exit 1; }
done

log "## all runs complete"
log "commits: $(git -C "$P" rev-list --count HEAD 2>/dev/null)"
git -C "$P" log --oneline | head -20 | sed 's/^/   /' | tee -a "$DLOG"
log "working tree dirty files: $(git -C "$P" status --porcelain | wc -l)"
log "DONE"
