#!/usr/bin/env bash

# Shell helpers for the client-first Docling rollout. Sourcing this file does
# not mutate Docker state; images are inspected/pulled only after the explicit
# DOCLING_STACK_V2_ENABLED=true gate is present in the selected env file.

docling_env_value() {
    local env_file="$1" key="$2"
    awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' \
        "$env_file" | tail -n 1
}

docling_validate_digest_ref() {
    local label="$1" value="$2"
    [[ "$value" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] || {
        echo "ERROR: $label must be an immutable image@sha256 reference" >&2
        return 1
    }
    [[ "$value" != *@sha256:0000000000000000000000000000000000000000000000000000000000000000 ]] || {
        echo "ERROR: $label is still the not-configured sentinel" >&2
        return 1
    }
}

# Where the host remembers which MCP image it is actually running.
#
# Kept beside the env file because CI REGENERATES that file from repository
# variables on every deploy: anything the host learns must live outside it or be
# forgotten. This is what removes the manual step — `DOCLING_PREVIOUS_MCP_IMAGE`
# still works and still bootstraps a host that has never recorded anything, but
# nobody has to remember to move it in lockstep with `DOCLING_MCP_IMAGE`, and
# forgetting no longer fails the deploy of the entire application.
docling_deployed_image_state() {
    printf '%s/.docling-deployed-mcp-image\n' "${1%/*}"
}

# Records the MCP image this host now runs. Called only AFTER health passes, so
# a failed switch never overwrites the last image known to work.
docling_record_deployed_image() {
    local env_file="$1"
    local state mcp_image
    state="$(docling_deployed_image_state "$env_file")"
    mcp_image="$(docling_env_value "$env_file" DOCLING_MCP_IMAGE)"
    [ -n "$mcp_image" ] || return 0
    printf '%s\n' "$mcp_image" > "$state" 2>/dev/null ||
        echo "WARNING: could not record the deployed Docling MCP image at $state" >&2
}

docling_prepare_rollout() {
    local env_file="$1"
    local enabled mcp_image serve_image rollback_image previous_image
    local current_id rollback_id candidate_id previous_id

    DOCLING_ROLLOUT_SERVICES=()
    [ -r "$env_file" ] || {
        echo "ERROR: Docling rollout env file is not readable: $env_file" >&2
        return 1
    }
    enabled="$(docling_env_value "$env_file" DOCLING_STACK_V2_ENABLED)"
    case "${enabled:-false}" in
        false) return 0 ;;
        true) ;;
        *) echo "ERROR: DOCLING_STACK_V2_ENABLED must be true or false" >&2; return 1 ;;
    esac

    mcp_image="$(docling_env_value "$env_file" DOCLING_MCP_IMAGE)"
    serve_image="$(docling_env_value "$env_file" DOCLING_SERVE_IMAGE)"
    rollback_image="$(docling_env_value "$env_file" DOCLING_ROLLBACK_IMAGE)"
    previous_image="$(docling_env_value "$env_file" DOCLING_PREVIOUS_MCP_IMAGE)"
    # The host's own record wins over the declared one: it is written by a
    # successful switch and therefore cannot drift from reality.
    local recorded_state recorded_image
    recorded_state="$(docling_deployed_image_state "$env_file")"
    if [ -r "$recorded_state" ]; then
        recorded_image="$(tr -d '[:space:]' < "$recorded_state")"
        [ -z "$recorded_image" ] || previous_image="$recorded_image"
    fi
    docling_validate_digest_ref DOCLING_MCP_IMAGE "$mcp_image" || return 1
    docling_validate_digest_ref DOCLING_SERVE_IMAGE "$serve_image" || return 1
    docling_validate_digest_ref DOCLING_ROLLBACK_IMAGE "$rollback_image" || return 1
    # Optional, and validated only when present: an empty value means "no
    # previous release recorded", which is the correct state for a first switch.
    if [ -n "$previous_image" ]; then
        docling_validate_digest_ref DOCLING_PREVIOUS_MCP_IMAGE "$previous_image" || return 1
    fi

    # Before the first v3 switch the rollback digest must resolve to the image
    # the MCP container is actually running: that is what makes the rollback
    # provable rather than declared.
    #
    # AFTER a successful switch the host runs the CANDIDATE, so demanding the
    # rollback image forever would make one successful cutover block every
    # later deploy. It did: from the moment production went to MCP 3, every
    # `Deploy to Dev` failed here (mc2-h89lo). Accepting the candidate as well
    # keeps the safety property — the host is on an image this deploy can name
    # and pull, and the rollback digest is still validated and pulled above —
    # while letting the steady state deploy.
    #
    # And a SECOND upgrade runs into the same wall one step further out: the host
    # is then running the PREVIOUS candidate, which is neither the rollback nor
    # the new one. `DOCLING_PREVIOUS_MCP_IMAGE` is how that release is named. It
    # is not a second rollback target — the rollback path stops Serve and
    # recreates MCP standalone, so only an MCP 1.x image can serve it — it is
    # only an assertion that the operator knows what is running.
    #
    # A host running NONE of the three is still refused: nobody can prove a
    # rollback for an image this configuration does not know about.
    docker pull "$rollback_image" > /dev/null || return 1
    current_id="$(docker inspect -f '{{.Image}}' megacampus-docling-mcp-internal 2>/dev/null || true)"
    [ -n "$current_id" ] || {
        echo "ERROR: current Docling MCP container is missing; rollback identity cannot be proven" >&2
        return 1
    }
    rollback_id="$(docker image inspect -f '{{.Id}}' "$rollback_image")" || return 1
    candidate_id="$(docker image inspect -f '{{.Id}}' "$mcp_image" 2>/dev/null || true)"
    previous_id=""
    if [ -n "$previous_image" ]; then
        previous_id="$(docker image inspect -f '{{.Id}}' "$previous_image" 2>/dev/null || true)"
        if [ -z "$previous_id" ]; then
            # Absent locally is not the same as wrong: `docker image prune -a`
            # removes the previous release the moment nothing runs it. Fetch it
            # once rather than block a correct deploy on a housekeeping job.
            docker pull "$previous_image" > /dev/null 2>&1 || true
            previous_id="$(docker image inspect -f '{{.Id}}' "$previous_image" 2>/dev/null || true)"
        fi
    fi
    [ "$current_id" = "$rollback_id" ] ||
        [ "$current_id" = "$candidate_id" ] ||
        { [ -n "$previous_id" ] && [ "$current_id" = "$previous_id" ]; } || {
        echo "ERROR: the running MCP image is none of DOCLING_ROLLBACK_IMAGE, DOCLING_MCP_IMAGE or DOCLING_PREVIOUS_MCP_IMAGE" >&2
        return 1
    }

    docker pull "$serve_image" > /dev/null || return 1
    docker pull "$mcp_image" > /dev/null || return 1
    DOCLING_ROLLOUT_SERVICES=(docling-serve docling-mcp-internal docling-mcp)
}

docling_check_facade() {
    local attempts="${1:-30}"
    local attempt
    for ((attempt = 1; attempt <= attempts; attempt++)); do
        curl --fail --silent --show-error --max-time 5 \
            http://127.0.0.1:8000/health > /dev/null 2>&1 && return 0
        [ "$attempt" -eq "$attempts" ] || sleep 2
    done
    echo "ERROR: Docling MCP facade health check failed" >&2
    return 1
}

docling_check_required_tools() {
    local container_name="${1:-megacampus-docling-mcp-internal}"
    timeout 30s docker exec -i "$container_name" python - <<'PY'
import asyncio

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

REQUIRED_TOOLS = {
    "convert_document_into_docling_document",
    "export_docling_document_to_markdown",
    "save_docling_document",
}


async def main() -> None:
    async with streamable_http_client("http://docling-mcp:8000/mcp") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            response = await session.list_tools()
            available = {tool.name for tool in response.tools}
            missing = REQUIRED_TOOLS - available
            if missing:
                raise RuntimeError(f"missing required Docling MCP tools: {sorted(missing)}")


asyncio.run(main())
PY
}

docling_set_env_value() {
    local env_file="$1" key="$2" value="$3"
    local escaped_value
    escaped_value="${value//\\/\\\\}"
    escaped_value="${escaped_value//&/\\&}"
    escaped_value="${escaped_value//|/\\|}"
    if grep -q "^${key}=" "$env_file"; then
        sed -i "s|^${key}=.*$|${key}=${escaped_value}|" "$env_file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$env_file"
    fi
}

docling_rollback_rollout() {
    local env_file="$1" compose_file="$2"
    local rollback_image
    [ -r "$env_file" ] || {
        echo "ERROR: Docling rollback env file is not readable: $env_file" >&2
        return 1
    }
    rollback_image="$(docling_env_value "$env_file" DOCLING_ROLLBACK_IMAGE)"
    docling_validate_digest_ref DOCLING_ROLLBACK_IMAGE "$rollback_image" || return 1

    echo "Docling v2 health failed; restoring the recorded MCP 1.x image..." >&2
    docling_set_env_value "$env_file" DOCLING_MCP_IMAGE "$rollback_image" || return 1
    docling_set_env_value "$env_file" DOCLING_STACK_V2_ENABLED false || return 1

    # The image alone is not the rollback. MCP 1.x converts LOCALLY, and the
    # split left the service sized and wired for a proxy: 512 MiB, half a CPU,
    # remote mode aimed at the Serve stopped below, and no models volume at all.
    # The override restores what a local converter actually needs. It sits next
    # to the infra file, so a caller that passes a compose file from elsewhere
    # still finds it.
    local rollback_override="${compose_file%/*}/docker-compose.docling-rollback.yml"
    local compose_files=(-f "$compose_file")
    if [ -r "$rollback_override" ]; then
        compose_files+=(-f "$rollback_override")
    else
        echo "WARNING: $rollback_override is missing; MCP 1.x will run with the split stack's limits and no models volume" >&2
    fi

    docker compose "${compose_files[@]}" --env-file "$env_file" \
        up -d --no-deps --force-recreate docling-mcp-internal docling-mcp || return 1
    docker compose "${compose_files[@]}" --env-file "$env_file" stop docling-serve || return 1

    # The facade answering is NOT proof the rollback worked: nginx keeps serving
    # whether or not the MCP behind it can convert anything. Without the tool
    # check this function printed "MCP 1.x was restored" over a dead conversion
    # path, which is the worst possible moment to be optimistic.
    docling_check_facade || return 1
    docling_check_required_tools
}
