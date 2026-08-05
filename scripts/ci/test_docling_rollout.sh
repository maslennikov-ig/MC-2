#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docling-rollout.sh"

IMAGE_REF_OUTPUT="$(
    "$ROOT_DIR/scripts/ci/resolve_docling_image_ref.sh" \
        'maslennikov-ig/MC-2' \
        'docling-mcp' \
        '3.0.0-docling-2.118.0'
)"
EXPECTED_IMAGE_REF_OUTPUT="$(cat <<'EOF'
repository=ghcr.io/maslennikov-ig/mc-2/docling-mcp
tag=ghcr.io/maslennikov-ig/mc-2/docling-mcp:3.0.0-docling-2.118.0
EOF
)"
[ "$IMAGE_REF_OUTPUT" = "$EXPECTED_IMAGE_REF_OUTPUT" ] || {
    echo "Docling image reference was not normalized to lowercase" >&2
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
            printf '%s\n' 'sha256:current-mcp-image'
            ;;
        "image inspect -f {{.Id}} $ROLLBACK_REF")
            printf '%s\n' 'sha256:current-mcp-image'
            ;;
    esac
}

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
