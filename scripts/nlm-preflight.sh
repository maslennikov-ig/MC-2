#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/nlm-preflight.sh [options]

Checks local NotebookLM bridge wiring and optionally runs a real smoke generation.

Options:
  --media <audio|video|both>    What to generate (default: audio)
  --timeout-seconds <seconds>   Max time for one generation request (default: 3600)
  --bridge-url <url>            Override NOTEBOOKLM_BRIDGE_URL
  --token <token>               Override NOTEBOOKLM_BRIDGE_TOKEN
  --language <lang>             Request language (default: en)
  --save-dir <path>             Directory for generated smoke files
  --skip-generate               Run preflight checks only, no media generation
  -h, --help                    Show help
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[error] Missing required command: $1" >&2
    exit 1
  fi
}

log() {
  printf '[nlm-preflight] %s\n' "$*"
}

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    # Load even when file contains CRLF line endings.
    local temp_env
    temp_env="$(mktemp)"
    tr -d '\r' < "$env_file" > "$temp_env"
    # shellcheck disable=SC1090
    set -a && source "$temp_env" && set +a
    rm -f "$temp_env"
    log "Loaded env: ${env_file}"
  fi
}

CLI_MEDIA=""
CLI_TIMEOUT_SECONDS=""
CLI_BRIDGE_URL=""
CLI_TOKEN=""
CLI_LANGUAGE=""
CLI_SAVE_DIR=""
SKIP_GENERATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --media)
      CLI_MEDIA="${2:-}"
      shift 2
      ;;
    --timeout-seconds)
      CLI_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --bridge-url)
      CLI_BRIDGE_URL="${2:-}"
      shift 2
      ;;
    --token)
      CLI_TOKEN="${2:-}"
      shift 2
      ;;
    --language)
      CLI_LANGUAGE="${2:-}"
      shift 2
      ;;
    --save-dir)
      CLI_SAVE_DIR="${2:-}"
      shift 2
      ;;
    --skip-generate)
      SKIP_GENERATE=1
      shift
      ;;
    --)
      shift
      continue
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[error] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd curl
require_cmd node

# Load local env files if present.
load_env_file "${REPO_ROOT}/.env.local"
load_env_file "${REPO_ROOT}/packages/course-gen-platform/.env"

MEDIA="${CLI_MEDIA:-${NLM_PREFLIGHT_MEDIA:-audio}}"
TIMEOUT_SECONDS="${CLI_TIMEOUT_SECONDS:-${NLM_PREFLIGHT_TIMEOUT_SECONDS:-3600}}"
BRIDGE_URL="${CLI_BRIDGE_URL:-${NOTEBOOKLM_BRIDGE_URL:-${NOTEBOOKLM_BRIDGE_BASE_URL:-http://127.0.0.1:8010}}}"
TOKEN="${CLI_TOKEN:-${NOTEBOOKLM_BRIDGE_TOKEN:-${NOTEBOOKLM_TOKEN:-}}}"
LANGUAGE="${CLI_LANGUAGE:-${NLM_PREFLIGHT_LANGUAGE:-en}}"
SAVE_DIR="${CLI_SAVE_DIR:-${NLM_PREFLIGHT_SAVE_DIR:-${REPO_ROOT}/logs/nlm-preflight}}"

case "$MEDIA" in
  audio|video|both) ;;
  *)
    echo "[error] --media must be one of: audio, video, both" >&2
    exit 1
    ;;
esac

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SECONDS" -le 0 ]]; then
  echo "[error] --timeout-seconds must be a positive integer" >&2
  exit 1
fi

if [[ -z "${TOKEN}" ]]; then
  echo "[error] NOTEBOOKLM_BRIDGE_TOKEN is empty. Set env var or pass --token." >&2
  exit 1
fi

if [[ -z "${BRIDGE_URL}" ]]; then
  echo "[error] NOTEBOOKLM_BRIDGE_URL is empty. Set env var or pass --bridge-url." >&2
  exit 1
fi

BRIDGE_URL="${BRIDGE_URL%/}"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${SAVE_DIR}/${RUN_ID}"
mkdir -p "$RUN_DIR"

AUTH_JSON="${NOTEBOOKLM_AUTH_JSON:-}"
STORAGE_DIR="${NOTEBOOKLM_STORAGE_STATE_DIR:-${REPO_ROOT}/secrets/notebooklm}"
STORAGE_PATH="${NOTEBOOKLM_STORAGE_PATH:-${STORAGE_DIR}/storage_state.json}"

log "Bridge URL: ${BRIDGE_URL}"
log "Media mode: ${MEDIA}"
log "Timeout per request: ${TIMEOUT_SECONDS}s"
log "Output dir: ${RUN_DIR}"

if [[ -n "${AUTH_JSON}" ]]; then
  log "Auth source: NOTEBOOKLM_AUTH_JSON (set)"
elif [[ -f "${STORAGE_PATH}" ]]; then
  log "Auth source: ${STORAGE_PATH}"
else
  log "Warning: no NOTEBOOKLM_AUTH_JSON and storage file not found at ${STORAGE_PATH}"
fi

health_body="${RUN_DIR}/health.json"
health_code="$(curl -sS -o "$health_body" -w '%{http_code}' --max-time 15 "${BRIDGE_URL}/health")"
if [[ "$health_code" != "200" ]]; then
  echo "[error] Bridge health failed (${health_code}). Body:" >&2
  cat "$health_body" >&2
  exit 1
fi
log "Bridge health OK"
cat "$health_body"

if [[ "$SKIP_GENERATE" -eq 1 ]]; then
  log "skip-generate enabled, finishing after preflight checks"
  exit 0
fi

build_payload() {
  local media_type="$1"
  if [[ "$media_type" == "audio" ]]; then
    cat <<JSON
{"lesson_title":"NLM smoke test (${RUN_ID})","script":"This is a NotebookLM smoke test audio request. Summarize three key ideas in a compact style.","language":"${LANGUAGE}","audio_format":"brief","audio_length":"short"}
JSON
  else
    cat <<JSON
{"lesson_title":"NLM smoke test (${RUN_ID})","script":"This is a NotebookLM smoke test video request. Explain the lesson in a short overview with clear structure.","language":"${LANGUAGE}","video_format":"brief","video_style":"auto_select"}
JSON
  fi
}

run_generation() {
  local media_type="$1"
  local endpoint=""
  if [[ "$media_type" == "audio" ]]; then
    endpoint="/artifacts/generate-audio"
  else
    endpoint="/video/generate-overview"
  fi

  local payload_file="${RUN_DIR}/${media_type}-payload.json"
  local response_file="${RUN_DIR}/${media_type}-response.json"
  local summary_file="${RUN_DIR}/${media_type}-summary.json"
  local payload
  payload="$(build_payload "$media_type")"
  printf '%s\n' "$payload" > "$payload_file"

  log "Starting ${media_type} smoke generation..."
  local started_at
  started_at="$(date +%s)"

  local status
  status="$(curl -sS -o "$response_file" -w '%{http_code}' \
    --max-time "$TIMEOUT_SECONDS" \
    -X POST "${BRIDGE_URL}${endpoint}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${payload_file}")"

  local finished_at
  finished_at="$(date +%s)"
  local elapsed=$((finished_at - started_at))

  if [[ "$status" != "200" ]]; then
    echo "[error] ${media_type} generation failed with status ${status} after ${elapsed}s" >&2
    echo "[error] Response:" >&2
    cat "$response_file" >&2
    return 1
  fi

  node - "$response_file" "$media_type" "$RUN_DIR" > "$summary_file" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [responsePath, mediaType, outputDir] = process.argv.slice(2);
const raw = fs.readFileSync(responsePath, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  console.error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const base64Key = mediaType === 'audio' ? 'audio_base64' : 'video_base64';
const base64Value = parsed[base64Key];
if (typeof base64Value !== 'string' || base64Value.trim().length === 0) {
  console.error(`Missing ${base64Key} in response`);
  process.exit(3);
}

const extension =
  typeof parsed.extension === 'string' && parsed.extension.trim().length > 0
    ? parsed.extension.trim().toLowerCase()
    : mediaType === 'audio'
      ? 'mp3'
      : 'mp4';
const mimeType =
  typeof parsed.mime_type === 'string' && parsed.mime_type.trim().length > 0
    ? parsed.mime_type.trim()
    : mediaType === 'audio'
      ? 'audio/mpeg'
      : 'video/mp4';

const fileName = `${mediaType}-smoke.${extension}`;
const outputPath = path.join(outputDir, fileName);

const binary = Buffer.from(base64Value, 'base64');
if (binary.length === 0) {
  console.error('Decoded artifact is empty');
  process.exit(4);
}

fs.writeFileSync(outputPath, binary);

const summary = {
  mediaType,
  outputPath,
  bytes: binary.length,
  mimeType,
  extension,
  durationSeconds:
    typeof parsed.duration_seconds === 'number' && Number.isFinite(parsed.duration_seconds)
      ? parsed.duration_seconds
      : null,
  metadataKeys:
    parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
      ? Object.keys(parsed.metadata)
      : [],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
NODE

  log "${media_type} generation OK (${elapsed}s)"
  cat "$summary_file"
}

if [[ "$MEDIA" == "audio" || "$MEDIA" == "both" ]]; then
  run_generation "audio"
fi

if [[ "$MEDIA" == "video" || "$MEDIA" == "both" ]]; then
  run_generation "video"
fi

log "Preflight finished successfully"
