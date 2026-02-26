#!/usr/bin/env bash
set -euo pipefail

TYPE="video"
TARGET_MINUTES=1
MAX_TIME_SECONDS=420
BRIDGE_URL="${NOTEBOOKLM_BRIDGE_URL:-http://127.0.0.1:8010}"
TOKEN="${NOTEBOOKLM_BRIDGE_TOKEN:-}"

usage() {
  cat <<'EOF'
Usage: scripts/nlm-bridge-smoke.sh [options]

Options:
  --type <video|audio>      Artifact type (default: video)
  --target-minutes <n>      Soft target duration minutes (default: 1)
  --max-time-seconds <n>    curl max-time in seconds (default: 420)
  --bridge-url <url>        Bridge URL (default: NOTEBOOKLM_BRIDGE_URL or http://127.0.0.1:8010)
  --token <value>           Bridge token (default: NOTEBOOKLM_BRIDGE_TOKEN or packages/course-gen-platform/.env)
  -h, --help                Show this help
EOF
}

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)
      TYPE="${2:-}"
      shift 2
      ;;
    --target-minutes)
      TARGET_MINUTES="${2:-}"
      shift 2
      ;;
    --max-time-seconds)
      MAX_TIME_SECONDS="${2:-}"
      shift 2
      ;;
    --bridge-url)
      BRIDGE_URL="${2:-}"
      shift 2
      ;;
    --token)
      TOKEN="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$TYPE" != "video" && "$TYPE" != "audio" ]]; then
  echo "--type must be 'video' or 'audio'" >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  TOKEN="$(read_env_value NOTEBOOKLM_BRIDGE_TOKEN packages/course-gen-platform/.env)"
fi

if [[ -z "$TOKEN" ]]; then
  echo "NOTEBOOKLM_BRIDGE_TOKEN is empty. Pass --token or set NOTEBOOKLM_BRIDGE_TOKEN." >&2
  exit 1
fi

REQUEST_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$REQUEST_FILE" "$RESPONSE_FILE"' EXIT

if [[ "$TYPE" == "video" ]]; then
  ENDPOINT="/video/generate-overview"
  cat >"$REQUEST_FILE" <<JSON
{
  "lesson_title": "Bridge smoke test (video)",
  "script": "Explain in a compact way what a feedback loop is. Give one short practical example and one action the learner can apply immediately.",
  "language": "en",
  "target_duration_minutes": ${TARGET_MINUTES},
  "duration_range_min_minutes": ${TARGET_MINUTES},
  "duration_range_max_minutes": ${TARGET_MINUTES},
  "video_format": "brief",
  "video_style": "classic",
  "sources": [
    {
      "title": "Smoke source",
      "content": "A feedback loop measures result, compares it to a target, and adjusts the next action."
    }
  ]
}
JSON
else
  ENDPOINT="/artifacts/generate-audio"
  cat >"$REQUEST_FILE" <<JSON
{
  "lesson_title": "Bridge smoke test (audio)",
  "script": "Define feedback loop in one sentence. Add one practical example and one quick takeaway.",
  "language": "en",
  "target_duration_minutes": ${TARGET_MINUTES},
  "duration_range_min_minutes": ${TARGET_MINUTES},
  "duration_range_max_minutes": ${TARGET_MINUTES},
  "audio_format": "brief",
  "audio_length": "short",
  "sources": [
    {
      "title": "Smoke source",
      "content": "Feedback loop means measuring results and using them to improve the next iteration."
    }
  ]
}
JSON
fi

echo "[nlm-bridge-smoke] start: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "[nlm-bridge-smoke] type=${TYPE} target_minutes=${TARGET_MINUTES} max_time_seconds=${MAX_TIME_SECONDS}"
echo "[nlm-bridge-smoke] endpoint=${BRIDGE_URL}${ENDPOINT}"

HTTP_CODE="$(curl -sS --max-time "${MAX_TIME_SECONDS}" -o "${RESPONSE_FILE}" -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -X POST "${BRIDGE_URL}${ENDPOINT}" \
  --data-binary @"${REQUEST_FILE}")"

echo "[nlm-bridge-smoke] finish: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "[nlm-bridge-smoke] http_code=${HTTP_CODE}"

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "[nlm-bridge-smoke] error response:"
  cat "${RESPONSE_FILE}"
  exit 1
fi

RESPONSE_FILE_PATH="${RESPONSE_FILE}" python - <<'PY'
import json
import os
from pathlib import Path

response_path = Path(os.environ["RESPONSE_FILE_PATH"])
data = json.loads(response_path.read_text())
if "video_base64" in data:
    payload_len = len(data.get("video_base64") or "")
    media_type = "video"
elif "audio_base64" in data:
    payload_len = len(data.get("audio_base64") or "")
    media_type = "audio"
else:
    payload_len = 0
    media_type = "unknown"

meta = data.get("metadata") or {}
print(f"[nlm-bridge-smoke] media_type={media_type}")
print(f"[nlm-bridge-smoke] mime_type={data.get('mime_type')}")
print(f"[nlm-bridge-smoke] extension={data.get('extension')}")
print(f"[nlm-bridge-smoke] duration_seconds={data.get('duration_seconds')}")
print(f"[nlm-bridge-smoke] payload_base64_len={payload_len}")
print(f"[nlm-bridge-smoke] metadata.provider={meta.get('provider')}")
print(f"[nlm-bridge-smoke] metadata.status={meta.get('status')}")
print(f"[nlm-bridge-smoke] metadata.task_id={meta.get('task_id')}")
PY
