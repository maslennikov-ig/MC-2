#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docling-rollout.sh"

IMAGE_REF_OUTPUT="$(
    "$ROOT_DIR/scripts/ci/resolve_docling_image_ref.sh" \
        'maslennikov-ig/MC-2' \
        'docling-mcp-v3' \
        '3.0.0-docling-2.118.0'
)"
EXPECTED_IMAGE_REF_OUTPUT="$(cat <<'EOF'
repository=ghcr.io/maslennikov-ig/mc-2/docling-mcp-v3
tag=ghcr.io/maslennikov-ig/mc-2/docling-mcp-v3:3.0.0-docling-2.118.0
EOF
)"
[ "$IMAGE_REF_OUTPUT" = "$EXPECTED_IMAGE_REF_OUTPUT" ] || {
    echo "Docling image reference was not normalized to lowercase" >&2
    exit 1
}
grep -q 'registry_image: docling-mcp-v3' "$ROOT_DIR/.github/workflows/build-docling-images.yml" || {
    echo "Docling MCP 3 must publish separately from the immutable MCP 1.x rollback package" >&2
    exit 1
}

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

cat > "$TEST_DIR/disabled.env" <<'EOF'
DOCLING_STACK_V2_ENABLED=false
EOF
docling_prepare_rollout "$TEST_DIR/disabled.env"
[ "${#DOCLING_ROLLOUT_SERVICES[@]}" -eq 0 ]

if docling_validate_digest_ref TEST_IMAGE 'example/docling:3.0.0'; then
    echo 'mutable Docling tag unexpectedly passed validation' >&2
    exit 1
fi
if docling_validate_digest_ref TEST_IMAGE 'example/docling@sha256:0000000000000000000000000000000000000000000000000000000000000000'; then
    echo 'sentinel digest unexpectedly passed validation' >&2
    exit 1
fi
docling_validate_digest_ref TEST_IMAGE 'example/docling@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

ROLLBACK_REF='example/docling-mcp@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
SERVE_REF='example/docling-serve@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
DOCKER_LOG="$TEST_DIR/docker.log"
docker() {
    printf '%s\n' "$*" >> "$DOCKER_LOG"
    if [ "$*" = "pull ${DOCKER_FAIL_PULL:-__none__}" ]; then
        return 1
    fi
    case "$*" in
        "inspect -f {{.Image}} megacampus-docling-mcp-internal")
            # `SWITCHED_RUNNING_ID` lets a case say what the host is actually
            # running; unset means the pre-cutover 1.x image.
            printf '%s\n' "${SWITCHED_RUNNING_ID:-sha256:current-mcp-image}"
            ;;
        "image inspect -f {{.Id}} $ROLLBACK_REF")
            printf '%s\n' 'sha256:current-mcp-image'
            ;;
        "image inspect -f {{.Id}} $CANDIDATE_REF")
            printf '%s\n' 'sha256:already-switched-mcp-image'
            ;;
        "image inspect -f {{.Id}} $PREVIOUS_REF")
            printf '%s\n' 'sha256:previous-release-mcp-image'
            ;;
    esac
}
PREVIOUS_REF='example/docling-mcp@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'

cat > "$TEST_DIR/invalid-candidate.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=example/docling-mcp:3.0.0
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
EOF
if docling_prepare_rollout "$TEST_DIR/invalid-candidate.env"; then
    echo 'rollout gate ignored an invalid MCP candidate reference' >&2
    exit 1
fi

CANDIDATE_REF='example/docling-mcp@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
cat > "$TEST_DIR/pull-failure.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
EOF
if DOCKER_FAIL_PULL="$CANDIDATE_REF" docling_prepare_rollout "$TEST_DIR/pull-failure.env"; then
    echo 'rollout gate ignored a failed candidate pull' >&2
    exit 1
fi

# Steady state after a successful cutover: the running container is the MCP 3
# candidate, not the 1.x rollback. The gate must still pass, or the first
# successful switch permanently blocks every later deploy — which is exactly
# what happened on 2026-08-06 (run 31112111522, mc2-h89lo).
cat > "$TEST_DIR/already-switched.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
EOF
SWITCHED_RUNNING_ID='sha256:already-switched-mcp-image' \
    docling_prepare_rollout "$TEST_DIR/already-switched.env" || {
    echo 'rollout gate refused a host that is already on the MCP 3 candidate' >&2
    exit 1
}

# And it must still refuse a host running something that is NEITHER the
# rollback nor the candidate: that is a host nobody can prove a rollback for.
cat > "$TEST_DIR/unknown-running.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
EOF
if SWITCHED_RUNNING_ID='sha256:some-unrelated-image' \
    docling_prepare_rollout "$TEST_DIR/unknown-running.env"; then
    echo 'rollout gate accepted a host running neither the rollback nor the candidate' >&2
    exit 1
fi

# A SECOND upgrade: the host runs the image the previous release pinned, which
# is neither the 1.x rollback nor the new candidate. Naming it in
# DOCLING_PREVIOUS_MCP_IMAGE is what lets the deploy proceed; without that the
# gate blocks every image change after the first, one step further out than the
# failure mc2-h89lo fixed.
cat > "$TEST_DIR/second-upgrade.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
DOCLING_PREVIOUS_MCP_IMAGE=$PREVIOUS_REF
EOF
SWITCHED_RUNNING_ID='sha256:previous-release-mcp-image' \
    docling_prepare_rollout "$TEST_DIR/second-upgrade.env" || {
    echo 'rollout gate refused a host running the previous recorded release' >&2
    exit 1
}

# The same host WITHOUT the recorded previous release is still refused: the
# escape hatch has to be named, not inferred.
if SWITCHED_RUNNING_ID='sha256:previous-release-mcp-image' \
    docling_prepare_rollout "$TEST_DIR/unknown-running.env"; then
    echo 'rollout gate accepted an unrecorded previous release' >&2
    exit 1
fi

# And a malformed previous reference must fail loudly rather than be ignored.
cat > "$TEST_DIR/bad-previous.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_SERVE_IMAGE=$SERVE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
DOCLING_PREVIOUS_MCP_IMAGE=example/docling-mcp:3.0.0
EOF
if docling_prepare_rollout "$TEST_DIR/bad-previous.env"; then
    echo 'rollout gate ignored a mutable DOCLING_PREVIOUS_MCP_IMAGE tag' >&2
    exit 1
fi

cat > "$TEST_DIR/rollback.env" <<EOF
DOCLING_STACK_V2_ENABLED=true
DOCLING_MCP_IMAGE=$CANDIDATE_REF
DOCLING_ROLLBACK_IMAGE=$ROLLBACK_REF
EOF
docling_check_facade() {
    return 0
}
docling_rollback_rollout "$TEST_DIR/rollback.env" "$TEST_DIR/compose.yml"
grep -qx "DOCLING_STACK_V2_ENABLED=false" "$TEST_DIR/rollback.env"
grep -qx "DOCLING_MCP_IMAGE=$ROLLBACK_REF" "$TEST_DIR/rollback.env"
grep -q 'force-recreate docling-mcp-internal docling-mcp' "$DOCKER_LOG"
grep -q 'stop docling-serve' "$DOCKER_LOG"
grep -q 'convert_document_into_docling_document' "$ROOT_DIR/scripts/lib/docling-rollout.sh"
grep -q 'export_docling_document_to_markdown' "$ROOT_DIR/scripts/lib/docling-rollout.sh"
grep -q 'save_docling_document' "$ROOT_DIR/scripts/lib/docling-rollout.sh"

echo 'Docling rollout gate tests passed.'
