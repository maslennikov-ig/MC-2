#!/bin/bash
# Simple script to download all enrichment files from Supabase Storage
# Usage: source .env.production && ./download-enrichments.sh

set -euo pipefail

TARGET_DIR="${ENRICHMENTS_LOCAL_PATH:-/opt/megacampus/data/enrichments}"
BUCKET="course-enrichments"

echo "=== Downloading enrichment files from Supabase ==="
echo "Target directory: $TARGET_DIR"

# Check prerequisites
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    exit 1
fi

total_files=0
failed_files=0

# Get list of courses (top-level directories)
echo "Fetching course list..."
courses=$(curl -s -X POST "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"prefix": "", "limit": 1000}' | jq -r '.[].name // empty')

for course in $courses; do
  # Skip if not a UUID
  if [[ ! "$course" =~ ^[0-9a-f-]+$ ]]; then
    continue
  fi

  echo "Processing course: $course"
  mkdir -p "${TARGET_DIR}/${course}"

  # Get items in course directory
  items=$(curl -s -X POST "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\": \"${course}/\", \"limit\": 1000}" | jq -r '.[].name // empty')

  for item in $items; do
    # Check if it's an image file at course level
    if [[ "$item" =~ \.(webp|png|jpg|jpeg)$ ]]; then
      filepath="${TARGET_DIR}/${course}/${item}"
      curl -s -o "$filepath" \
        "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${course}/${item}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
      if [[ -f "$filepath" && -s "$filepath" ]]; then
        echo "  Downloaded: ${course}/${item}"
        total_files=$((total_files + 1))
      else
        echo "  FAILED: ${course}/${item}"
        failed_files=$((failed_files + 1))
      fi
    elif [[ "$item" =~ ^[0-9a-f-]+$ ]]; then
      # It's a lesson directory (UUID)
      mkdir -p "${TARGET_DIR}/${course}/${item}"

      # Get files in lesson directory
      lesson_files=$(curl -s -X POST "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"prefix\": \"${course}/${item}/\", \"limit\": 1000}" | jq -r '.[].name // empty')

      for file in $lesson_files; do
        if [[ "$file" =~ \.(webp|png|jpg|jpeg)$ ]]; then
          filepath="${TARGET_DIR}/${course}/${item}/${file}"
          curl -s -o "$filepath" \
            "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${course}/${item}/${file}" \
            -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
          if [[ -f "$filepath" && -s "$filepath" ]]; then
            echo "  Downloaded: ${course}/${item}/${file}"
            total_files=$((total_files + 1))
          else
            echo "  FAILED: ${course}/${item}/${file}"
            failed_files=$((failed_files + 1))
          fi
        fi
      done
    fi
  done
done

echo ""
echo "=== Migration Summary ==="
echo "Total files downloaded: $total_files"
echo "Failed downloads: $failed_files"
echo ""
echo "Verifying local files..."
local_count=$(find "$TARGET_DIR" -type f \( -name "*.webp" -o -name "*.png" -o -name "*.jpg" \) | wc -l)
echo "Files on disk: $local_count"
du -sh "$TARGET_DIR"
