#!/bin/bash
# Example: How to run the A/B test for lesson generation
#
# This script compares multiple LLM models for lesson content generation
# and generates a detailed comparison report.

cd "$(dirname "$0")/.."

# Example 1: Test with provided course and lesson IDs
pnpm tsx scripts/test-lesson-generation.ts \
  --course-id bc34283a-0a61-45cb-8e5c-773a3b67a86c \
  --lesson-id 8c3623c0-07e5-4e01-853d-ff3eab14a546 \
  --models "xiaomi/mimo-v2-flash:free,z-ai/glm-4.7-flash,allenai/olmo-3.1-32b-instruct"

# Example 2: Test with custom models
# pnpm tsx scripts/test-lesson-generation.ts \
#   --course-id YOUR_COURSE_ID \
#   --lesson-id YOUR_LESSON_ID \
#   --models "openai/gpt-4o-mini,anthropic/claude-3.5-sonnet"

# Output will be saved to:
# .tmp/test-generation/
#   ├── xiaomi-mimo-v2-flash-free/
#   │   ├── content.md
#   │   └── metadata.json
#   ├── z-ai-glm-4.7-flash/
#   │   ├── content.md
#   │   └── metadata.json
#   ├── allenai-olmo-3.1-32b-instruct/
#   │   ├── content.md
#   │   └── metadata.json
#   └── comparison-report.md
