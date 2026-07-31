#!/bin/bash
set -e

# MegaCampus Blue/Green Rollback Script
# Usage: ./rollback_blue_green.sh [environment] <expected_commit>
#
# Instantly switches traffic back to the previous color.
# Ports:
#   Blue:  web:3001, api:4001
#   Green: web:3002, api:4002

# ============================================================================
# Q12 phase-aware rollback (fail-closed).
#
# Activated only when `--q12-run-id` is present; the normal rollback path below
# is left byte-for-command unchanged. Before the durable database activation
# receipt, Q12 rollback is safe: it starts no writer and, if commit already
# moved Nginx to the target color, restores Nginx to the previously serving
# color. After the activation commit the release is finish-forward only, so any
# Q12 rollback request fails closed rather than resurrecting the old color.
# ============================================================================
if printf '%s\n' "$@" | grep -qx -- '--q12-run-id'; then
    set -euo pipefail

    Q12_BASE_PATH="${BASE_PATH:-/opt/megacampus}"
    Q12_NGINX_CONFIG_PATH="${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/megacampus}"
    Q12_NGINX_CMD="${Q12_NGINX_CMD:-sudo nginx}"
    Q12_NGINX_TEE="${Q12_NGINX_TEE:-sudo tee}"
    Q12_RECEIPT_SCHEMA='megacampus.q12.database-barrier-receipt/v1'
    Q12_QUIESCE_SCHEMA='megacampus.q12.writer-quiesce/v1'
    Q12_RECOVERY_SCHEMA='megacampus.q12.deploy-handoff-recovery/v1'

    q12_fail() { echo "ERROR: $*" >&2; exit 1; }
    q12_require_value() { [ -n "${2:-}" ] || q12_fail "$1 requires a value"; }

    Q12_ENV_ARG=""
    Q12_PREVIOUS_SHA=""
    Q12_RUN_ID=""
    Q12_QUIESCE_MANIFEST=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --q12-run-id) q12_require_value "$1" "${2:-}"; Q12_RUN_ID="$2"; shift 2 ;;
            --external-quiesce-manifest) q12_require_value "$1" "${2:-}"; Q12_QUIESCE_MANIFEST="$2"; shift 2 ;;
            --*) q12_fail "unexpected Q12 rollback argument: $1" ;;
            *)
                if [ -z "$Q12_ENV_ARG" ]; then
                    Q12_ENV_ARG="$1"
                elif [ -z "$Q12_PREVIOUS_SHA" ]; then
                    Q12_PREVIOUS_SHA="$1"
                else
                    q12_fail "unexpected Q12 rollback positional argument: $1"
                fi
                shift ;;
        esac
    done

    [ -n "$Q12_ENV_ARG" ] || q12_fail "Q12 rollback requires the environment argument"
    [[ "$Q12_PREVIOUS_SHA" =~ ^[0-9a-f]{40}$ ]] \
        || q12_fail "Q12 rollback requires the exact 40-character previous release commit"
    [[ "$Q12_RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] \
        || q12_fail "run-id must be a canonical lowercase UUID"
    [[ "$Q12_QUIESCE_MANIFEST" == /* ]] \
        || q12_fail "external-quiesce-manifest must be an absolute path"

    Q12_RUN_ROOT="$Q12_BASE_PATH/backups/q12/$Q12_RUN_ID"
    [ -d "$Q12_RUN_ROOT" ] || q12_fail "Q12 run root is missing: $Q12_RUN_ROOT"
    Q12_EXPECTED_MANIFEST="$Q12_RUN_ROOT/writer-quiesce-$Q12_RUN_ID.json"
    [ "$Q12_QUIESCE_MANIFEST" = "$Q12_EXPECTED_MANIFEST" ] \
        || q12_fail "external-quiesce-manifest is not the run's writer-quiesce manifest"
    [ -f "$Q12_QUIESCE_MANIFEST" ] || q12_fail "external-quiesce-manifest file is missing"
    python3 - "$Q12_QUIESCE_MANIFEST" "$Q12_RUN_ID" "$Q12_QUIESCE_SCHEMA" <<'PY' \
        || q12_fail "external-quiesce-manifest is not a bound, quiesced writer-quiesce manifest"
import json, sys
path, run_id, schema = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "rb") as handle:
    data = json.loads(handle.read())
ok = (
    isinstance(data, dict)
    and data.get("schema_version") == schema
    and data.get("run_id") == run_id
    and data.get("status") == "quiesced"
)
sys.exit(0 if ok else 1)
PY

    Q12_RECEIPT="$Q12_RUN_ROOT/database-barrier-receipt.json"
    Q12_RECOVERY="$Q12_RUN_ROOT/deploy-handoff-recovery-$Q12_RUN_ID.json"

    q12_activation_committed() {
        [ -f "$Q12_RECEIPT" ] || return 1
        python3 - "$Q12_RECEIPT" "$Q12_RUN_ID" "$Q12_RECEIPT_SCHEMA" <<'PY'
import json, sys
path, run_id, schema = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path, "rb") as handle:
        data = json.loads(handle.read())
except Exception:
    sys.exit(1)
ok = (
    isinstance(data, dict)
    and data.get("schema_version") == schema
    and data.get("run_id") == run_id
    and data.get("state") == "activated"
    and data.get("last_command") == "activate"
)
sys.exit(0 if ok else 1)
PY
    }

    if q12_activation_committed; then
        q12_fail "database activation is committed; Q12 rollback is finish-forward only and cannot resurrect the previous color"
    fi

    # NOTE: deploy.rollback is not yet wired into the frozen
    # q12-command-manifest.json; per D5J 2026-07-15 §10 the supervisor binding
    # for finalize/rollback is Task 9 scope. This wrapper mode is implemented and
    # fail-closed so the controller can adopt it there.
    #
    # Pre-activation safe rollback. Read the durable handoff recovery state to
    # decide whether commit already moved (or may have moved) Nginx. Each field is
    # printed on its own line so an empty middle field never collapses.
    Q12_STATE=""
    Q12_PREVIOUS_COLOR=""
    Q12_NGINX_SWITCHED="false"
    Q12_NGINX_INTENT="false"
    if [ -f "$Q12_RECOVERY" ]; then
        {
            IFS= read -r Q12_STATE
            IFS= read -r Q12_PREVIOUS_COLOR
            IFS= read -r Q12_NGINX_SWITCHED
            IFS= read -r Q12_NGINX_INTENT
        } < <(python3 - "$Q12_RECOVERY" "$Q12_RUN_ID" "$Q12_RECOVERY_SCHEMA" <<'PY'
import json, sys
path, run_id, schema = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "rb") as handle:
    data = json.loads(handle.read())
assert isinstance(data, dict)
assert data.get("schema_version") == schema
assert data.get("run_id") == run_id
print(data.get("state", ""))
print(data.get("previous_active_color", ""))
print(str(data.get("nginx_switched", False)).lower())
print(str(data.get("nginx_switch_intent", False)).lower())
PY
)
    fi

    # Cross-check the actual serving color against the recorded previous color so
    # a crash in commit's switch window (intent recorded, nginx_switched not yet
    # durable, active_color already advanced) is still fully rolled back.
    Q12_ACTUAL_COLOR=""
    if [ -f "$Q12_BASE_PATH/active_color" ]; then
        Q12_ACTUAL_COLOR="$(tr -d '[:space:]' < "$Q12_BASE_PATH/active_color")"
    fi

    Q12_NEED_RESTORE="false"
    if [ -n "$Q12_PREVIOUS_COLOR" ]; then
        if [ "$Q12_NGINX_SWITCHED" = "true" ] || [ "$Q12_NGINX_INTENT" = "true" ] \
            || { [ -n "$Q12_ACTUAL_COLOR" ] && [ "$Q12_ACTUAL_COLOR" != "$Q12_PREVIOUS_COLOR" ]; }; then
            Q12_NEED_RESTORE="true"
        fi
    fi

    if [ "$Q12_NEED_RESTORE" = "true" ]; then
        case "$Q12_PREVIOUS_COLOR" in
            blue) Q12_PREVIOUS_WEB_PORT=3001; Q12_PREVIOUS_API_PORT=4001 ;;
            green) Q12_PREVIOUS_WEB_PORT=3002; Q12_PREVIOUS_API_PORT=4002 ;;
            *) q12_fail "unknown previous active color: $Q12_PREVIOUS_COLOR" ;;
        esac
        echo "Q12 rollback: commit may have moved nginx; restoring nginx to $Q12_PREVIOUS_COLOR"
        template="$Q12_BASE_PATH/nginx.conf.template"
        [ -f "$template" ] || q12_fail "nginx template not found at $template"
        sed -e "s/{{WEB_PORT}}/$Q12_PREVIOUS_WEB_PORT/g" \
            -e "s/{{API_PORT}}/$Q12_PREVIOUS_API_PORT/g" \
            -e "s/{{COLOR}}/$Q12_PREVIOUS_COLOR/g" \
            "$template" | $Q12_NGINX_TEE "$Q12_NGINX_CONFIG_PATH" > /dev/null
        $Q12_NGINX_CMD -t || q12_fail "nginx configuration test failed; Q12 rollback did not move traffic"
        $Q12_NGINX_CMD -s reload || q12_fail "nginx reload failed; Q12 rollback did not move traffic"
        echo "$Q12_PREVIOUS_COLOR" > "$Q12_BASE_PATH/active_color"
    else
        echo "Q12 rollback: commit had not moved nginx; no traffic change required"
    fi

    python3 - "$Q12_RECOVERY" "$Q12_RUN_ID" "$Q12_RECOVERY_SCHEMA" "$Q12_PREVIOUS_SHA" <<'PY'
import json, os, sys, tempfile
path, run_id, schema, previous_sha = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
existing = {}
if os.path.exists(path):
    with open(path, "rb") as handle:
        existing = json.loads(handle.read())
document = dict(existing)
document.update(
    {
        "schema_version": schema,
        "run_id": run_id,
        "state": "rollback_preparing",
        "rollback_previous_release_sha": previous_sha,
    }
)
directory = os.path.dirname(path)
handle = tempfile.NamedTemporaryFile(
    mode="w", dir=directory, prefix=".deploy-handoff-recovery.", delete=False
)
try:
    json.dump(document, handle, sort_keys=True, separators=(",", ":"))
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
finally:
    handle.close()
os.chmod(handle.name, 0o600)
os.replace(handle.name, path)
directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
    echo "Q12 rollback complete: pre-activation state safe, no writer started"
    exit 0
fi

ENV=${1:-production}
EXPECTED_COMMIT=${2:-}
BASE_PATH=${BASE_PATH:-/opt/megacampus}
NGINX_CONFIG_PATH=${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/megacampus}
DEPLOY_STATE="$BASE_PATH/deploy_state"

[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Error: rollback requires the exact 40-character release commit." >&2
    exit 1
}

state_value() {
    local key="$1"
    awk -v key="$key" 'index($0, key "=") == 1 { value=substr($0, length(key) + 2) } END { print value }' "$DEPLOY_STATE"
}

# 1. Determine Current Active Color
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    echo "Error: active_color file not found. Cannot determine current state."
    echo "   Expected: $BASE_PATH/active_color"
    exit 1
fi

# 2. Require a deployment transaction that actually switched traffic.
[ -r "$DEPLOY_STATE" ] || {
    echo "Error: deploy_state is missing; refusing an ambiguous rollback." >&2
    exit 1
}
DEPLOY_STATUS="$(state_value status)"
PREVIOUS_COLOR="$(state_value previous_color)"
SWITCHED_COLOR="$(state_value target_color)"
STATE_COMMIT="$(state_value commit)"
if [ "$STATE_COMMIT" != "$EXPECTED_COMMIT" ]; then
    echo "Error: deploy_state commit does not match the requested release; refusing stale rollback." >&2
    exit 1
fi
if [ "$DEPLOY_STATUS" != "switched" ] && [ "$DEPLOY_STATUS" != "accepted" ]; then
    echo "Error: deployment did not reach status=switched; refusing to promote an unaccepted target." >&2
    exit 1
fi
if [ "$CURRENT_COLOR" != "$SWITCHED_COLOR" ]; then
    echo "Error: active color does not match the switched deployment; refusing rollback." >&2
    exit 1
fi
TARGET_COLOR="$PREVIOUS_COLOR"
if [ "$TARGET_COLOR" == "green" ]; then
    TARGET_WEB_PORT=3002
    TARGET_API_PORT=4002
elif [ "$TARGET_COLOR" == "blue" ]; then
    TARGET_WEB_PORT=3001
    TARGET_API_PORT=4001
else
    echo "Error: Unknown rollback target color '$TARGET_COLOR'."
    exit 1
fi

echo "Initiating Rollback"
echo "   Current: $CURRENT_COLOR"
echo "   Target:  $TARGET_COLOR (web:$TARGET_WEB_PORT, api:$TARGET_API_PORT)"
echo ""

# 3. Verify Target Configuration Exists
if [ ! -f "$BASE_PATH/.env.$TARGET_COLOR" ]; then
    echo "Error: Configuration for $TARGET_COLOR not found."
    echo "   Expected: $BASE_PATH/.env.$TARGET_COLOR"
    echo ""
    echo "   This may mean there was no previous deployment to roll back to."
    exit 1
fi
for image_spec in \
    'WEB_IMAGE:ghcr.io/maslennikov-ig/mc-2/web' \
    'API_IMAGE:ghcr.io/maslennikov-ig/mc-2/api'; do
    image_key="${image_spec%%:*}"
    image_repository="${image_spec#*:}"
    image_value="$(awk -v key="$image_key" 'index($0, key "=") == 1 { value=substr($0, length(key) + 2) } END { print value }' "$BASE_PATH/.env.$TARGET_COLOR")"
    image_prefix="${image_repository}@sha256:"
    image_digest="${image_value#"$image_prefix"}"
    [[ "$image_value" == "$image_prefix"* && "$image_digest" =~ ^[0-9a-f]{64}$ ]] || {
        echo "Error: $image_key is missing or mutable in rollback target configuration." >&2
        exit 1
    }
done

# 4. Ensure Infrastructure is Running
echo "Ensuring infrastructure is running..."
docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.$ENV" up -d
echo "   Infrastructure ready."
echo ""

# 5. Start Target Application Environment (if not running)
echo "Ensuring $TARGET_COLOR application environment is running..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate

# 6. Health Check
echo "Performing Health Checks on $TARGET_COLOR..."

# Check API
API_HEALTHY=false
echo "   Checking API on localhost:$TARGET_API_PORT..."
for i in {1..6}; do
    if curl -s -f "http://localhost:$TARGET_API_PORT/health" > /dev/null 2>&1; then
        echo "   API health check passed!"
        API_HEALTHY=true
        break
    fi
    echo "   Waiting for API... ($i/6)"
    sleep 5
done

# Check Web
WEB_HEALTHY=false
echo "   Checking Web on localhost:$TARGET_WEB_PORT..."
for i in {1..6}; do
    if curl -s -f "http://localhost:$TARGET_WEB_PORT" > /dev/null 2>&1; then
        echo "   Web health check passed!"
        WEB_HEALTHY=true
        break
    fi
    echo "   Waiting for Web... ($i/6)"
    sleep 5
done

if [ "$API_HEALTHY" = false ] || [ "$WEB_HEALTHY" = false ]; then
    echo ""
    echo "Rollback target ($TARGET_COLOR) failed health check!"
    [ "$API_HEALTHY" = false ] && echo "   - API not healthy"
    [ "$WEB_HEALTHY" = false ] && echo "   - Web not healthy"
    echo ""
    echo "   Aborting rollback. Current active: $CURRENT_COLOR"
    exit 1
fi

echo ""

# Restore background consumers with the same environment snapshot as the
# rollback color before sending traffic back to it. This keeps Qdrant and
# document-evidence gates coherent across API, main worker, and Stage 6.
PRODUCTION_ENV_FILE="$BASE_PATH/.env.$TARGET_COLOR"
export PRODUCTION_ENV_FILE
# -p megacampus for the same reason as deploy_blue_green.sh: the colour env file sets
# COMPOSE_PROJECT_NAME=megacampus-<colour>, but these workers carry fixed container_names in the
# single `megacampus` project. Without it the rollback dies on "container name is already in use" —
# which is exactly what happened on 2026-07-30, leaving the failed deploy with no way back.
docker compose -p megacampus -f "$BASE_PATH/docker-compose.production.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate --no-deps worker worker-stage6
unset PRODUCTION_ENV_FILE

# 7. Switch Traffic
echo "Switching Nginx to $TARGET_COLOR..."

if [ -f "$BASE_PATH/nginx.conf.template" ]; then
    sed -e "s/{{WEB_PORT}}/$TARGET_WEB_PORT/g" \
        -e "s/{{API_PORT}}/$TARGET_API_PORT/g" \
        -e "s/{{COLOR}}/$TARGET_COLOR/g" \
        "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null

    if sudo nginx -t 2>/dev/null; then
        sudo nginx -s reload
        echo "   Traffic switched to $TARGET_COLOR!"
    else
        echo "   Nginx config test failed! Traffic NOT switched."
        exit 1
    fi
else
    echo "   Nginx template not found!"
    exit 1
fi

# 8. Update State
echo "$TARGET_COLOR" > "$BASE_PATH/active_color"
sed -i 's/^status=.*/status=rolled_back/' "$DEPLOY_STATE"

# 9. Stop broken application environment
echo ""
echo "Stopping broken application environment ($CURRENT_COLOR)..."
docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$CURRENT_COLOR" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true

echo ""
echo "Rollback Complete!"
echo "   Active: $TARGET_COLOR"
echo "   Web:    http://localhost:$TARGET_WEB_PORT"
echo "   API:    http://localhost:$TARGET_API_PORT"
