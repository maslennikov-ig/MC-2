#!/bin/bash
set -e

# --- frozen-HOME normalization (mc2-wwc9l) ---
# The frozen Q12 command manifest (sha256 aaec6fc2…, immutable by contract) declares HOME=/root
# for every command. That was correct while the controller ran as root; since the execution
# identity amendment the children run as uid 1000, which cannot read /root. The docker CLI
# resolves its cli-plugins through the config directory under HOME, so an unusable HOME does not
# merely drop credentials — `docker compose` ceases to exist and the call dies with
# "unknown flag: --project-directory", exit 125. That killed the 2026-07-27 window in preflight.
# The manifest env cannot be edited, so the repair belongs here, at the wrapper seam. ONLY a HOME
# the current uid genuinely cannot use is replaced, so the root path stays byte-identical.
if [[ -z ${HOME-} || ! -O "${HOME-}" || ! -r "${HOME-}" || ! -x "${HOME-}" ]]; then
  frozen_home_resolved="$(getent passwd "$(id -u)" | cut -d: -f6)"
  if [[ -z ${frozen_home_resolved} || ! -d ${frozen_home_resolved} ||
    ! -r ${frozen_home_resolved} || ! -x ${frozen_home_resolved} ]]; then
    printf 'frozen-HOME normalization: no usable HOME for uid %s\n' "$(id -u)" >&2
    exit 1
  fi
  export HOME="${frozen_home_resolved}"
fi
# --- end frozen-HOME normalization ---

# MegaCampus Blue/Green Deployment Script
# Usage: ./deploy_blue_green.sh <environment> <docker_tag>
#
# Ports:
#   Blue:  web:3001, api:4001
#   Green: web:3002, api:4002

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/docling-rollout.sh"

# ============================================================================
# Q12 quiesce-aware blue/green handoff (fail-closed).
#
# Activated only by `--q12-mode`; the normal deployment path below is left
# byte-for-command unchanged. Q12 handoff creates the target containers with
# `--no-start`, pins them to restart=no, switches Nginx only at commit, and
# never starts a writer before the durable database activation receipt exists.
# Final writer resume is left to the supervisor-owned resume path, not this
# wrapper. This wrapper produces its own durable `deploy-handoff-recovery`
# evidence and never writes the controller-owned journal, checkpoint, or
# final-writer manifest.
# ============================================================================
if [ "${1:-}" = "--q12-mode" ]; then
    set -euo pipefail

    Q12_BASE_PATH="${BASE_PATH:-/opt/megacampus}"
    Q12_ENV="${Q12_ENV:-production}"
    Q12_NGINX_CONFIG_PATH="${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/megacampus}"
    Q12_NGINX_CMD="${Q12_NGINX_CMD:-sudo nginx}"
    Q12_NGINX_TEE="${Q12_NGINX_TEE:-sudo tee}"
    Q12_INFRA_COMPOSE="$Q12_BASE_PATH/docker-compose.infra.yml"
    Q12_APP_COMPOSE="$Q12_BASE_PATH/docker-compose.app.yml"
    Q12_WORKER_COMPOSE="$Q12_BASE_PATH/docker-compose.production.yml"
    Q12_RECEIPT_SCHEMA='megacampus.q12.database-barrier-receipt/v1'
    Q12_QUIESCE_SCHEMA='megacampus.q12.writer-quiesce/v1'
    Q12_RECOVERY_SCHEMA='megacampus.q12.deploy-handoff-recovery/v1'

    q12_fail() { echo "ERROR: $*" >&2; exit 1; }

    q12_require_value() {
        [ -n "${2:-}" ] || q12_fail "$1 requires a value"
    }

    Q12_MODE=""
    Q12_RUN_ID=""
    Q12_RELEASE_SHA=""
    Q12_QUIESCE_MANIFEST=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --q12-mode) q12_require_value "$1" "${2:-}"; Q12_MODE="$2"; shift 2 ;;
            --run-id) q12_require_value "$1" "${2:-}"; Q12_RUN_ID="$2"; shift 2 ;;
            --release-sha) q12_require_value "$1" "${2:-}"; Q12_RELEASE_SHA="$2"; shift 2 ;;
            --external-quiesce-manifest) q12_require_value "$1" "${2:-}"; Q12_QUIESCE_MANIFEST="$2"; shift 2 ;;
            *) q12_fail "unexpected Q12 handoff argument: $1" ;;
        esac
    done

    case "$Q12_MODE" in
        prepare-quiesced | commit-quiesced | finalize-quiesced) ;;
        retire-old-observed)
            q12_fail "retire-old-observed is a supervisor-gated post-observation action and is not handled by the handoff wrapper" ;;
        *) q12_fail "unknown Q12 handoff mode: $Q12_MODE" ;;
    esac

    [[ "$Q12_RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] \
        || q12_fail "run-id must be a canonical lowercase UUID"
    [[ "$Q12_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] \
        || q12_fail "release-sha must be 40 lowercase hexadecimal characters"
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
    and isinstance(data.get("writers"), list)
    and len(data["writers"]) == 10
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

    q12_recovery_state() {
        [ -f "$Q12_RECOVERY" ] || { echo ""; return 0; }
        python3 - "$Q12_RECOVERY" "$Q12_RUN_ID" "$Q12_RECOVERY_SCHEMA" <<'PY'
import json, sys
path, run_id, schema = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "rb") as handle:
    data = json.loads(handle.read())
assert isinstance(data, dict)
assert data.get("schema_version") == schema
assert data.get("run_id") == run_id
print(data.get("state", ""))
PY
    }

    q12_recovery_field() {
        [ -f "$Q12_RECOVERY" ] || { echo ""; return 0; }
        python3 - "$Q12_RECOVERY" "$1" <<'PY'
import json, sys
with open(sys.argv[1], "rb") as handle:
    data = json.loads(handle.read())
print(data.get(sys.argv[2], ""))
PY
    }

    # Atomically fold a captured-identity JSON array file into the recovery
    # manifest under KEY (tmp + rename + fsync; never an O_TRUNC in-place write).
    q12_fold_array() {
        local key="$1" array_file="$2"
        python3 - "$Q12_RECOVERY" "$array_file" "$key" <<'PY'
import json, os, sys, tempfile
recovery_path, array_path, key = sys.argv[1], sys.argv[2], sys.argv[3]
with open(recovery_path) as handle:
    document = json.load(handle)
with open(array_path) as handle:
    document[key] = json.load(handle)
document.pop("targets_file", None)
directory = os.path.dirname(recovery_path)
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
os.replace(handle.name, recovery_path)
directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
    }

    # Emit a durable, fsynced deploy-handoff-recovery manifest. Extra key/value
    # pairs are passed as NAME=VALUE positional arguments and stored verbatim.
    q12_write_recovery() {
        local state="$1"; shift
        python3 - "$Q12_RECOVERY" "$Q12_RUN_ID" "$Q12_RELEASE_SHA" \
            "$Q12_RECOVERY_SCHEMA" "$state" "$@" <<'PY'
import json, os, sys, tempfile
path, run_id, release_sha, schema, state = sys.argv[1:6]
extra = {}
for pair in sys.argv[6:]:
    key, _, value = pair.partition("=")
    extra[key] = value
existing = {}
if os.path.exists(path):
    with open(path, "rb") as handle:
        existing = json.loads(handle.read())
document = dict(existing)
document.update(
    {
        "schema_version": schema,
        "run_id": run_id,
        "release_sha": release_sha,
        "state": state,
    }
)
document.update(extra)
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
    }

    # Record a captured target identity into a JSON-array file used only to
    # accumulate the recovery manifest's `targets` list before it is published.
    Q12_TARGETS_FILE="$(mktemp "$Q12_RUN_ROOT/.deploy-handoff-targets.XXXXXX")"
    trap 'rm -f "$Q12_TARGETS_FILE"' EXIT
    printf '[]\n' > "$Q12_TARGETS_FILE"

    q12_capture_target() {
        local class="$1" name="$2"
        local inspected id image restart_name restart_count
        inspected="$(docker inspect --format \
            '{{.Id}} {{.Image}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.RestartPolicy.MaximumRetryCount}}' \
            "$name")" || q12_fail "failed to inspect target container $name"
        read -r id image restart_name restart_count <<<"$inspected"
        [ "$restart_name" = "no" ] && [ "$restart_count" = "0" ] \
            || q12_fail "target $name did not reach restart=no policy"
        python3 - "$Q12_TARGETS_FILE" "$class" "$name" "$id" "$image" <<'PY'
import json, sys
path, cls, name, cid, image = sys.argv[1:6]
with open(path) as handle:
    targets = json.load(handle)
targets.append(
    {
        "class": cls,
        "name": name,
        "id": cid,
        "image_id": image,
        "intended_restart_policy": {"name": "unless-stopped", "maximum_retry_count": 0},
        "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
    }
)
with open(path, "w") as handle:
    json.dump(targets, handle)
PY
    }

    q12_create_no_start_and_pin() {
        # Create the named target container without starting it, then pin it to
        # restart=no and verify the pinned policy.
        local class="$1" name="$2"
        docker update --restart=no "$name" > /dev/null \
            || q12_fail "failed to pin $name to restart=no"
        q12_capture_target "$class" "$name"
    }

    q12_active_color() {
        if [ -f "$Q12_BASE_PATH/active_color" ]; then
            cat "$Q12_BASE_PATH/active_color"
        else
            echo "blue"
        fi
    }

    Q12_ACTIVE_COLOR="$(q12_active_color)"
    case "$Q12_ACTIVE_COLOR" in
        blue) Q12_TARGET_COLOR="green"; Q12_TARGET_WEB_PORT=3002; Q12_TARGET_API_PORT=4002 ;;
        green) Q12_TARGET_COLOR="blue"; Q12_TARGET_WEB_PORT=3001; Q12_TARGET_API_PORT=4001 ;;
        *) q12_fail "unknown active color: $Q12_ACTIVE_COLOR" ;;
    esac

    q12_switch_nginx() {
        local color="$1" web_port="$2" api_port="$3"
        local template="$Q12_BASE_PATH/nginx.conf.template"
        [ -f "$template" ] || q12_fail "nginx template not found at $template"
        sed -e "s/{{WEB_PORT}}/$web_port/g" \
            -e "s/{{API_PORT}}/$api_port/g" \
            -e "s/{{COLOR}}/$color/g" \
            "$template" | $Q12_NGINX_TEE "$Q12_NGINX_CONFIG_PATH" > /dev/null
        $Q12_NGINX_CMD -t || q12_fail "nginx configuration test failed; Q12 traffic not moved"
        $Q12_NGINX_CMD -s reload || q12_fail "nginx reload failed; Q12 traffic not moved"
    }

    case "$Q12_MODE" in
        prepare-quiesced)
            q12_activation_committed \
                && q12_fail "run is already activated; prepare-quiesced is a pre-activation step"
            # Re-prepare guard: a durable recovery manifest that has advanced past
            # `prepared` (commit/finalize/rollback) must never be recomputed onto a
            # fresh target color or clobbered. Re-prepare is idempotent only over a
            # matching `prepared` manifest with byte-identical target and release.
            Q12_EXISTING_STATE="$(q12_recovery_state)"
            if [ -n "$Q12_EXISTING_STATE" ]; then
                [ "$Q12_EXISTING_STATE" = "prepared" ] \
                    || q12_fail "a durable handoff recovery already exists in state '$Q12_EXISTING_STATE'; re-prepare is refused after commit"
                [ "$(q12_recovery_field target_color)" = "$Q12_TARGET_COLOR" ] \
                    && [ "$(q12_recovery_field release_sha)" = "$Q12_RELEASE_SHA" ] \
                    || q12_fail "re-prepare parameters differ from the existing prepared handoff recovery"
            fi
            echo "Q12 prepare: creating target $Q12_TARGET_COLOR web/api without starting them"
            docling_prepare_rollout "$Q12_BASE_PATH/.env.$Q12_ENV" \
                || q12_fail "Docling rollout gate failed"
            Q12_INFRA_SERVICES=(redis qdrant prometheus grafana notebooklm-bridge)
            Q12_INFRA_SERVICES+=("${DOCLING_ROLLOUT_SERVICES[@]}")
            docker compose -f "$Q12_INFRA_COMPOSE" --env-file "$Q12_BASE_PATH/.env.$Q12_ENV" \
                up -d "${Q12_INFRA_SERVICES[@]}" \
                || q12_fail "shared infrastructure did not come up"
            if ! docling_check_facade || \
                { [ "${#DOCLING_ROLLOUT_SERVICES[@]}" -gt 0 ] && ! docling_check_required_tools; }; then
                docling_rollback_rollout "$Q12_BASE_PATH/.env.$Q12_ENV" "$Q12_INFRA_COMPOSE" \
                    || q12_fail "Docling MCP facade is unhealthy and rollback failed"
                q12_fail "Docling MCP facade is unhealthy; MCP 1.x was restored"
            fi
            docker compose -f "$Q12_APP_COMPOSE" --env-file "$Q12_BASE_PATH/.env.$Q12_TARGET_COLOR" \
                up --no-start web api \
                || q12_fail "target web/api were not created"
            q12_create_no_start_and_pin "production-web" "megacampus-web-$Q12_TARGET_COLOR"
            q12_create_no_start_and_pin "production-api" "megacampus-api-$Q12_TARGET_COLOR"
            q12_write_recovery prepared \
                "target_color=$Q12_TARGET_COLOR" \
                "previous_active_color=$Q12_ACTIVE_COLOR" \
                "quiesce_manifest_path=$Q12_QUIESCE_MANIFEST" \
                "nginx_switched=false" \
                "targets_file=$Q12_TARGETS_FILE"
            # Fold the captured targets into the recovery manifest atomically.
            q12_fold_array targets "$Q12_TARGETS_FILE"
            echo "Q12 prepare complete: target $Q12_TARGET_COLOR web/api created (restart=no), Nginx unchanged"
            ;;
        commit-quiesced)
            q12_activation_committed \
                && q12_fail "run is already activated; commit-quiesced is a pre-activation step"
            [ "$(q12_recovery_state)" = "prepared" ] \
                || q12_fail "commit-quiesced requires a durable prepared handoff recovery state"
            [ "$(q12_recovery_field release_sha)" = "$Q12_RELEASE_SHA" ] \
                || q12_fail "commit-quiesced release-sha does not match the prepared handoff recovery"
            echo "Q12 commit: moving nginx to $Q12_TARGET_COLOR and creating production workers without starting them"
            # P1-1(a): durably record the switch intent BEFORE mutating Nginx so a
            # crash in the switch window (config on target, active_color advanced)
            # is recoverable — rollback keys off this marker, not only the
            # post-switch nginx_switched=true flag written below.
            q12_write_recovery prepared "nginx_switch_intent=true"
            q12_switch_nginx "$Q12_TARGET_COLOR" "$Q12_TARGET_WEB_PORT" "$Q12_TARGET_API_PORT"
            echo "$Q12_TARGET_COLOR" > "$Q12_BASE_PATH/active_color"
            docker compose -p megacampus -f "$Q12_WORKER_COMPOSE" \
                --env-file "$Q12_BASE_PATH/.env.$Q12_TARGET_COLOR" \
                up --no-start worker worker-stage6 \
                || q12_fail "target production workers were not created"
            docker compose -f "$Q12_INFRA_COMPOSE" --env-file "$Q12_BASE_PATH/.env.$Q12_ENV" \
                up --no-start worker-stage7 \
                || q12_fail "target worker-stage7 was not created"
            printf '[]\n' > "$Q12_TARGETS_FILE"
            q12_create_no_start_and_pin "production-worker" "megacampus-worker"
            q12_create_no_start_and_pin "production-worker" "megacampus-worker-stage6"
            q12_create_no_start_and_pin "production-worker" "megacampus-worker-stage7"
            q12_write_recovery activation_ready \
                "nginx_switched=true" \
                "active_color=$Q12_TARGET_COLOR"
            q12_fold_array workers "$Q12_TARGETS_FILE"
            echo "Q12 commit complete: nginx on $Q12_TARGET_COLOR, workers created (restart=no), none started"
            ;;
        finalize-quiesced)
            # NOTE: deploy.finalize is not yet wired into the frozen
            # q12-command-manifest.json; per D5J 2026-07-15 §10 the supervisor
            # binding for finalize/rollback is Task 9 scope. The wrapper mode is
            # implemented and fail-closed so the controller can adopt it there.
            [ "$(q12_recovery_state)" = "activation_ready" ] \
                || q12_fail "finalize-quiesced requires a durable activation_ready handoff recovery state"
            [ "$(q12_recovery_field release_sha)" = "$Q12_RELEASE_SHA" ] \
                || q12_fail "finalize-quiesced release-sha does not match the activation_ready handoff recovery"
            q12_activation_committed \
                || q12_fail "database activation receipt is absent; refusing to finalize before supervisor activation"
            # No container is started, no restart policy is restored, and no live
            # discovery is performed here: writer resume belongs to the
            # supervisor-owned resume path.
            q12_write_recovery handoff_ready \
                "database_activation_receipt=verified"
            echo "Q12 finalize complete: activation receipt verified, handoff ready, no writer started"
            ;;
    esac

    exit 0
fi

ENV=${1:-production}
TAG=${2:-}
BASE_PATH=${BASE_PATH:-/opt/megacampus}
NGINX_CONFIG_PATH=${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/megacampus}
DEPLOY_STATE="$BASE_PATH/deploy_state"
WEB_REPOSITORY="ghcr.io/maslennikov-ig/mc-2/web"
API_REPOSITORY="ghcr.io/maslennikov-ig/mc-2/api"
OPERATOR_REPOSITORY="ghcr.io/maslennikov-ig/mc-2/qdrant-operator"
DEPLOY_WEB_CHANGED=${DEPLOY_WEB_CHANGED:-true}
DEPLOY_API_CHANGED=${DEPLOY_API_CHANGED:-true}
DEPLOY_BRIDGE_CHANGED=${DEPLOY_BRIDGE_CHANGED:-true}
DEPLOY_CONFIG_CHANGED=${DEPLOY_CONFIG_CHANGED:-true}
APP_DEPLOY_NEEDED=false

if [[ ! "$TAG" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: TAG must be an immutable commit tag (40 lowercase hexadecimal characters)" >&2
    exit 1
fi

env_value() {
    local path="$1"
    local key="$2"
    awk -v key="$key" 'index($0, key "=") == 1 { value=substr($0, length(key) + 2) } END { print value }' "$path"
}

upsert_env() {
    local path="$1"
    local key="$2"
    local value="$3"
    local temp
    temp="$(mktemp "${path}.XXXXXX")"
    awk -v key="$key" 'index($0, key "=") != 1' "$path" > "$temp"
    printf '%s=%s\n' "$key" "$value" >> "$temp"
    chmod --reference="$path" "$temp"
    mv "$temp" "$path"
}

write_color_env() {
    local color="$1"
    local web_port="$2"
    local api_port="$3"
    local web_image="$4"
    local api_image="$5"
    local target="$BASE_PATH/.env.$color"
    local temp
    temp="$(mktemp "${target}.XXXXXX")"
    cp "$BASE_PATH/.env.$ENV" "$temp"
    {
        printf 'COLOR=%s\n' "$color"
        printf 'WEB_PORT=%s\n' "$web_port"
        printf 'API_PORT=%s\n' "$api_port"
        printf 'COMPOSE_PROJECT_NAME=megacampus-%s\n' "$color"
        printf 'WEB_IMAGE=%s\n' "$web_image"
        printf 'API_IMAGE=%s\n' "$api_image"
    } >> "$temp"
    chmod 0600 "$temp"
    mv "$temp" "$target"
}

require_immutable_ref() {
    local value="$1"
    local repository="$2"
    local label="$3"
    local prefix="${repository}@sha256:"
    local digest
    if [[ "$value" != "$prefix"* ]]; then
        echo "ERROR: $label must be a repository digest under $repository" >&2
        return 1
    fi
    digest="${value#"$prefix"}"
    [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || {
        echo "ERROR: $label must be a repository digest under $repository" >&2
        return 1
    }
}

resolve_repo_digest() {
    local reference="$1"
    local repository="$2"
    local digest
    docker pull "$reference" > /dev/null
    digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$reference" | awk -v prefix="$repository@sha256:" 'index($0, prefix) == 1 { print; exit }')"
    require_immutable_ref "$digest" "$repository" "$reference"
    printf '%s' "$digest"
}

resolve_container_digest() {
    local container="$1"
    local repository="$2"
    local image_id digest
    image_id="$(docker inspect --format '{{.Image}}' "$container")"
    digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" | awk -v prefix="$repository@sha256:" 'index($0, prefix) == 1 { print; exit }')"
    require_immutable_ref "$digest" "$repository" "$container"
    printf '%s' "$digest"
}

ensure_color_image_ref() {
    local color="$1"
    local key="$2"
    local repository="$3"
    local container="$4"
    local env_file="$BASE_PATH/.env.$color"
    local value
    [ -r "$env_file" ] || { echo "ERROR: missing $env_file" >&2; return 1; }
    value="$(env_value "$env_file" "$key")"
    if [ -z "$value" ]; then
        value="$(resolve_container_digest "$container" "$repository")"
        upsert_env "$env_file" "$key" "$value"
    fi
    require_immutable_ref "$value" "$repository" "$key"
    REPLY="$value"
}

write_deploy_state() {
    local status="$1"
    local temp
    temp="$(mktemp "${DEPLOY_STATE}.XXXXXX")"
    {
        printf 'status=%s\n' "$status"
        printf 'previous_color=%s\n' "$CURRENT_COLOR"
        printf 'target_color=%s\n' "$NEW_COLOR"
        printf 'commit=%s\n' "$TAG"
    } > "$temp"
    chmod 0600 "$temp"
    mv "$temp" "$DEPLOY_STATE"
}

read_secret_file() {
    local path="$1"
    local label="$2"
    local mode
    local value

    if [[ "$path" != /* ]]; then
        path="$BASE_PATH/${path#./}"
    fi
    sudo -n test -f "$path" && sudo -n test -r "$path" || { echo "ERROR: $label file is missing or unreadable" >&2; return 1; }
    mode="$(sudo -n stat -c '%a' "$path")"
    (( (8#$mode & 077) == 0 )) || { echo "ERROR: $label file permissions are unsafe" >&2; return 1; }
    value="$(sudo -n cat -- "$path"; printf x)"
    value="${value%x}"
    if [[ "$value" == *$'\r\n' ]]; then
        value="${value%$'\r\n'}"
    elif [[ "$value" == *$'\n' ]]; then
        value="${value%$'\n'}"
    fi
    [ -n "$value" ] && [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || {
        echo "ERROR: $label file must contain exactly one non-empty line" >&2
        return 1
    }
    REPLY="$value"
}

configured_path() {
    local env_file="$1"
    local key="$2"
    local fallback="$3"
    local value=''

    if [ -r "$env_file" ]; then
        value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$env_file" | tail -n 1)"
    fi
    printf '%s' "${value:-$fallback}"
}

qdrant_staging_gate() {
    local read_only_key admin_key read_only_path admin_path

    echo "   Qdrant readiness endpoint..."
    for i in {1..12}; do
        if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6335/readyz > /dev/null 2>&1; then
            break
        fi
        [ "$i" -lt 12 ] || { echo "ERROR: Qdrant readiness failed" >&2; return 1; }
        sleep 5
    done

    read_only_path="${QDRANT_READ_ONLY_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.$ENV" QDRANT_READ_ONLY_API_KEY_FILE "$BASE_PATH/secrets/qdrant_read_only_api_key")}"
    read_secret_file "$read_only_path" 'Qdrant read-only API key'
    read_only_key="$REPLY"
    unset REPLY
    echo "   Qdrant authenticated collections endpoint..."
    curl --fail --silent --show-error --max-time 5 \
        -H "api-key: $read_only_key" http://127.0.0.1:6335/collections > /dev/null
    unset read_only_key

    admin_path="${QDRANT_API_KEY_FILE:-$(configured_path "$BASE_PATH/.env.$ENV" QDRANT_API_KEY_FILE "$BASE_PATH/secrets/qdrant_api_key")}"
    read_secret_file "$admin_path" 'Qdrant admin API key'
    admin_key="$REPLY"
    unset REPLY
    echo "   Running qdrant:verify..."
    QDRANT_URL=http://qdrant:6333 QDRANT_API_KEY="$admin_key" \
        docker compose -f "$BASE_PATH/docker-compose.app.yml" \
        --env-file "$BASE_PATH/.env.$NEW_COLOR" run --rm --no-deps -T \
        -e QDRANT_URL -e QDRANT_API_KEY \
        --entrypoint tsx api \
        dist/shared/qdrant/create-collection.js --verify-only
    unset admin_key
}

if [ "$DEPLOY_WEB_CHANGED" = "true" ] || [ "$DEPLOY_API_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    APP_DEPLOY_NEEDED=true
fi

# 1. Determine Active Color (Default to blue if first run)
if [ -f "$BASE_PATH/active_color" ]; then
    CURRENT_COLOR=$(cat "$BASE_PATH/active_color")
else
    CURRENT_COLOR="blue"
fi

if [ "$CURRENT_COLOR" == "blue" ]; then
    NEW_COLOR="green"
    NEW_WEB_PORT=3002
    NEW_API_PORT=4002
else
    NEW_COLOR="blue"
    NEW_WEB_PORT=3001
    NEW_API_PORT=4001
fi

echo "Starting Blue/Green Deployment"
echo "   Environment: $ENV"
echo "   Current: $CURRENT_COLOR"
echo "   Target:  $NEW_COLOR (web:$NEW_WEB_PORT, api:$NEW_API_PORT)"
echo "   Changes: web=$DEPLOY_WEB_CHANGED api=$DEPLOY_API_CHANGED bridge=$DEPLOY_BRIDGE_CHANGED config=$DEPLOY_CONFIG_CHANGED"
echo ""

if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    write_deploy_state preparing
fi

# Resolve and pre-pull the exact operator image before any Compose invocation.
# The CI change detector publishes this target for every deploy-relevant commit.
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Logging in to GHCR..."
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-maslennikov-ig}" --password-stdin
fi
OPERATOR_IMAGE="$(resolve_repo_digest "$OPERATOR_REPOSITORY:$TAG" "$OPERATOR_REPOSITORY")"
QDRANT_OPERATOR_IMAGE_SHA256="${OPERATOR_IMAGE#"$OPERATOR_REPOSITORY@sha256:"}"
[[ "$QDRANT_OPERATOR_IMAGE_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
    echo "ERROR: QDRANT_OPERATOR_IMAGE_SHA256 was not resolved from the release image" >&2
    exit 1
}
upsert_env "$BASE_PATH/.env.$ENV" QDRANT_OPERATOR_IMAGE_SHA256 "$QDRANT_OPERATOR_IMAGE_SHA256"

# mc2-y5tgw: pin the digest under a local tag so `docker image prune -f` cannot take it.
# Prune removes DANGLING images, and the floating release tag moves to whatever the next deploy
# pulls -- including a dev deploy -- which leaves the digest .env.production still points at with no
# tag of its own. The operator image is the most exposed image on this host because no container
# references it: all six of its services are one-shot `compose run --rm` with pull_policy: never.
# It is also load-bearing for source recovery and for the document repair, and claude-deploy cannot
# re-pull it while the GHCR token is dead (mc2-2vtmk), so losing it is unrecoverable in the moment.
docker tag "$OPERATOR_IMAGE" hold/qdrant-operator:pinned
echo "   Operator image held as hold/qdrant-operator:pinned ($OPERATOR_IMAGE)"

unset OPERATOR_IMAGE QDRANT_OPERATOR_IMAGE_SHA256

# 2. Keep MCP 1.x untouched unless the separately approved rollout flag is on.
docling_prepare_rollout "$BASE_PATH/.env.$ENV"

# 3. Ensure data directories exist with correct ownership
# Docker bind mounts inherit host permissions. Container runs as nodejs (uid 1001).
# Without this, directories created by Docker daemon get root:root ownership,
# causing EACCES errors in container.
echo "Ensuring data directories exist with correct permissions..."
mkdir -p "$BASE_PATH/data/enrichments" \
         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev"
# $BASE_PATH/secrets is root-owned 0700 — the job's own "Create Qdrant secret files" step installs
# it that way — so the deploy user cannot create, or even stat through, anything inside it. The
# NotebookLM storage directory lives there and is root-owned, so it is created with the privilege
# that owns the parent, exactly as read_secret_file already reads the keys beside it. Splitting this
# off the data-directory mkdir keeps that unprivileged and this privileged, which is what they are.
sudo -n mkdir -p "$BASE_PATH/secrets/notebooklm"
sudo chown -R 1001:1001 "$BASE_PATH/data/enrichments" \
                         "$BASE_PATH/data/uploads" "$BASE_PATH/data/uploads-dev"
echo "   Data directories ready (owner: 1001:1001)."
echo ""

# 4. Ensure Infrastructure is Running (shared by all colors)
echo "Ensuring infrastructure is running..."
INFRA_SERVICES=(redis qdrant prometheus grafana notebooklm-bridge worker-stage7)
INFRA_SERVICES+=("${DOCLING_ROLLOUT_SERVICES[@]}")
# NOT a bare `up -d`: `docling-mcp-internal` declares `depends_on: docling-serve:
# service_healthy`, so compose WAITS on the new Serve and exits non-zero when it
# never gets there — up to ~330s of start_period plus retries. Under `set -e` a
# bare command would kill this script at that point, which is precisely BEFORE
# the rollback below. The single most likely Docling failure would therefore
# have left production with a stopped Serve, a crash-looping MCP and no
# automatic recovery, having never reached the recovery code written for it.
infra_up_failed=false
docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.$ENV" \
    up -d "${INFRA_SERVICES[@]}" || infra_up_failed=true
if [ "$infra_up_failed" = true ] || ! docling_check_facade || \
    { [ "${#DOCLING_ROLLOUT_SERVICES[@]}" -gt 0 ] && ! docling_check_required_tools; }; then
    docling_rollback_rollout "$BASE_PATH/.env.$ENV" "$BASE_PATH/docker-compose.infra.yml" \
        || { echo "ERROR: Docling MCP health failed and rollback failed" >&2; exit 1; }
    echo "ERROR: Docling MCP health failed; MCP 1.x was restored and Docling Serve stopped" >&2
    exit 1
fi
# Health passed, so this image is now the one to recognise on the NEXT deploy.
# Recorded here rather than declared in a repository variable nobody remembers
# to move.
[ "${#DOCLING_ROLLOUT_SERVICES[@]}" -eq 0 ] || docling_record_deployed_image "$BASE_PATH/.env.$ENV"
echo "   Infrastructure ready."
echo ""

if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    ensure_color_image_ref "$CURRENT_COLOR" WEB_IMAGE "$WEB_REPOSITORY" "megacampus-web-$CURRENT_COLOR"
    CURRENT_WEB_IMAGE="$REPLY"
    unset REPLY
    ensure_color_image_ref "$CURRENT_COLOR" API_IMAGE "$API_REPOSITORY" "megacampus-api-$CURRENT_COLOR"
    CURRENT_API_IMAGE="$REPLY"
    unset REPLY

    if [ "$DEPLOY_WEB_CHANGED" = "true" ]; then
        NEW_WEB_IMAGE="$(resolve_repo_digest "$WEB_REPOSITORY:$TAG" "$WEB_REPOSITORY")"
    else
        NEW_WEB_IMAGE="$CURRENT_WEB_IMAGE"
    fi
    if [ "$DEPLOY_API_CHANGED" = "true" ]; then
        NEW_API_IMAGE="$(resolve_repo_digest "$API_REPOSITORY:$TAG" "$API_REPOSITORY")"
    else
        NEW_API_IMAGE="$CURRENT_API_IMAGE"
    fi
    if [ "$CURRENT_COLOR" = "blue" ]; then
        CURRENT_WEB_PORT=3001
        CURRENT_API_PORT=4001
    else
        CURRENT_WEB_PORT=3002
        CURRENT_API_PORT=4002
    fi
    echo "Preparing immutable current and target color environments..."
    write_color_env "$CURRENT_COLOR" "$CURRENT_WEB_PORT" "$CURRENT_API_PORT" "$CURRENT_WEB_IMAGE" "$CURRENT_API_IMAGE"
    write_color_env "$NEW_COLOR" "$NEW_WEB_PORT" "$NEW_API_PORT" "$NEW_WEB_IMAGE" "$NEW_API_IMAGE"

    # 7. Deploy Application to New Color
    echo "Cleaning up any leftover $NEW_COLOR containers from previous failed deploys..."
    # Force remove containers by name (handles orphans from different project names)
    docker stop "megacampus-api-$NEW_COLOR" "megacampus-web-$NEW_COLOR" 2>/dev/null || true
    docker rm -f "megacampus-api-$NEW_COLOR" "megacampus-web-$NEW_COLOR" 2>/dev/null || true
    # Also try compose down for proper cleanup
    # NOTE: do NOT use --remove-orphans here, it kills shared infra (Redis, docling-mcp)!
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down 2>/dev/null || true

    qdrant_staging_gate

    echo "Starting $NEW_COLOR containers..."
    # NOTE: do NOT use --remove-orphans, it kills shared infra containers (Redis, workers, etc.)
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" up -d --force-recreate web api

    # 8. Health Check (check both web and api)
    echo "Performing Health Checks..."

    # Check API health
    API_HEALTHY=false
    echo "   Checking API on localhost:$NEW_API_PORT..."
    for i in {1..12}; do
        if curl -s -f "http://localhost:$NEW_API_PORT/health" > /dev/null 2>&1; then
            echo "   API health check passed!"
            API_HEALTHY=true
            break
        fi
        echo "   Waiting for API... ($i/12)"
        sleep 5
    done

    # Check Web health
    WEB_HEALTHY=false
    echo "   Checking Web on localhost:$NEW_WEB_PORT..."
    for i in {1..12}; do
        if curl -s -f "http://localhost:$NEW_WEB_PORT" > /dev/null 2>&1; then
            echo "   Web health check passed!"
            WEB_HEALTHY=true
            break
        fi
        echo "   Waiting for Web... ($i/12)"
        sleep 5
    done

    if [ "$API_HEALTHY" = false ] || [ "$WEB_HEALTHY" = false ]; then
        echo ""
        echo "Health check failed!"
        [ "$API_HEALTHY" = false ] && echo "   - API not healthy"
        [ "$WEB_HEALTHY" = false ] && echo "   - Web not healthy"
        echo ""
        echo "Rolling back (stopping $NEW_COLOR)..."
        docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$NEW_COLOR" down
        exit 1
    fi

    echo ""

    # 9. Switch Traffic
    echo "Switching traffic to $NEW_COLOR..."

    if [ -f "$BASE_PATH/nginx.conf.template" ]; then
        # Replace both WEB_PORT and API_PORT in template
        sed -e "s/{{WEB_PORT}}/$NEW_WEB_PORT/g" \
            -e "s/{{API_PORT}}/$NEW_API_PORT/g" \
            -e "s/{{COLOR}}/$NEW_COLOR/g" \
            "$BASE_PATH/nginx.conf.template" | sudo tee "$NGINX_CONFIG_PATH" > /dev/null

        # Test nginx config before reload
        if sudo nginx -t 2>/dev/null; then
            sudo nginx -s reload
            echo "   Traffic switched successfully!"
        else
            echo "   Nginx config test failed! Traffic NOT switched."
            exit 1
        fi
    else
        echo "   Nginx template not found at $BASE_PATH/nginx.conf.template"
        echo "   Traffic NOT switched."
        exit 1
    fi

    # 10. Update State
    echo "$NEW_COLOR" > "$BASE_PATH/active_color"
    write_deploy_state switched

    # 11. Cleanup Old Application Environment
    echo ""
    echo "Stopping old application environment ($CURRENT_COLOR)..."
    docker compose -f "$BASE_PATH/docker-compose.app.yml" --env-file "$BASE_PATH/.env.$CURRENT_COLOR" -p "megacampus-$CURRENT_COLOR" down 2>/dev/null || true
else
    echo "No web/api/config changes; skipping Blue/Green app switch."
fi

# 12. Update Workers with New Image
# Workers use the same api image but are NOT part of Blue/Green (no traffic switching needed).
# They must be restarted to pick up new code after each deploy.
WORKER_COMPOSE="$BASE_PATH/docker-compose.production.yml"
INFRA_COMPOSE="$BASE_PATH/docker-compose.infra.yml"

if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    WORKER_COLOR="$NEW_COLOR"
    WORKER_ENV_FILE="$BASE_PATH/.env.$WORKER_COLOR"
    PRODUCTION_ENV_FILE="$WORKER_ENV_FILE"
    export PRODUCTION_ENV_FILE
    echo "Updating API-backed workers..."
    # The colour env files set COMPOSE_PROJECT_NAME=megacampus-<colour>, which is right for the
    # colour-scoped api/web but wrong here: the workers carry fixed container_names and live in the
    # single `megacampus` project, exactly as the comment above says — they are NOT part of
    # blue/green. Without pinning the project, compose tries to create megacampus-worker under
    # megacampus-green and docker refuses with "container name is already in use", which is how the
    # 2026-07-30 deploy left web and api on the new code and worker-stage6 four weeks behind.
    for SVC in worker worker-stage6; do
        echo "   Restarting $SVC..."
        docker compose -p megacampus -f "$WORKER_COMPOSE" --env-file "$WORKER_ENV_FILE" up -d --force-recreate --no-deps "$SVC"
    done
    unset PRODUCTION_ENV_FILE
    echo "   Updating worker-stage7..."
    docker compose -f "$INFRA_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" pull worker-stage7 2>/dev/null || true
    docker compose -f "$INFRA_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" up -d --force-recreate --no-deps worker-stage7
else
    echo "API image unchanged; skipping API-backed worker restarts."
fi

if [ "$DEPLOY_BRIDGE_CHANGED" = "true" ] || [ "$DEPLOY_CONFIG_CHANGED" = "true" ]; then
    echo "Updating notebooklm-bridge..."
    docker compose -f "$INFRA_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" pull notebooklm-bridge 2>/dev/null || true
    docker compose -f "$INFRA_COMPOSE" --env-file "$BASE_PATH/.env.$ENV" up -d --force-recreate notebooklm-bridge
else
    echo "NotebookLM bridge unchanged; skipping bridge restart."
fi
echo ""

# 13. Docker Cleanup (prevent disk space exhaustion)
echo ""
echo "Cleaning up Docker resources..."

# Remove dangling images (not tagged, safe to remove)
# NOTE: Using -f (dangling only), NOT -a which would remove docling-mcp (8GB, manually built)
DANGLING_CLEANED=$(docker image prune -f 2>/dev/null | tail -1 || echo "0B")
echo "   Dangling images cleaned: $DANGLING_CLEANED"

# Remove unused build cache older than 7 days
BUILD_CACHE_CLEANED=$(docker builder prune -f --filter "until=168h" 2>/dev/null | tail -1 || echo "0B")
echo "   Build cache cleaned: $BUILD_CACHE_CLEANED"

# Report disk space
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
DISK_USED=$(df -h / | awk 'NR==2 {print $5}')
echo "   Disk status: $DISK_FREE free ($DISK_USED used)"

# Warning if disk is critically low
DISK_PERCENT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_PERCENT" -gt 90 ]; then
    echo ""
    echo "⚠️  WARNING: Disk usage above 90%!"
    echo "   Consider running: docker system prune -a --volumes"
fi

echo ""
echo "Deployment Complete!"
if [ "$APP_DEPLOY_NEEDED" = "true" ]; then
    echo "   Active: $NEW_COLOR"
    echo "   Web:    http://localhost:$NEW_WEB_PORT"
    echo "   API:    http://localhost:$NEW_API_PORT"
else
    echo "   Active: $CURRENT_COLOR (unchanged)"
fi
