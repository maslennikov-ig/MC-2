Start only after:
- stream A merged to `develop`
- stream B merged to `develop`
- new code deployed to Dev

Base branch/commit:
- current `develop` after A+B deploy

Worktree/branch:
- dedicated clean worktree
- branch: `codex/mkk6903-true-remediation`

Write scope:
- no repo-tracked code except optional report file
- Supabase operations and authenticated Dev API calls allowed

Course:
- generation code: `MKK-6903`
- course id: `c8ffafbd-6135-4bab-86f9-866df6a51176`
- current live state before remediation: `31 completed`, `9 approved`, `0 review_required`, `0 failed`
- those 9 `approved` rows are workaround approvals and must be replaced by real Stage 6 output

Goal:
- perform true remediation, not another manual approval pass
- create fresh latest `lesson_contents` rows for the 9 workaround lessons

Do:
1. Snapshot current latest rows for all 9 workaround lessons, including:
   - `id`
   - `status`
   - `created_at`
   - `metadata.selected_model`
   - `metadata.selected_model_phase`
   - `metadata.selected_model_source`
   - `metadata.attemptLadder`
2. Re-run Stage 6 regeneration for those 9 lessons through the real supported remediation path.
3. Validate that each lesson gets a newer latest `lesson_contents` row than the workaround-approved row.
4. Validate that the new latest rows are real Stage 6 outputs with populated metadata and no unintended `auto_last_chance -> hardcoded -> xiaomi`.
5. Validate final course state:
   - `40 ready`
   - `0 review_required`
   - `0 failed`
   - where ready can be `completed` or `approved`, but must be backed by fresh generated rows for the 9 remediated lessons

Verification:
- before/after SQL evidence
- final lesson status table
- final latest-row metadata for the 9 remediated lessons
- if Dev API is used, include request paths and outcomes in the artifact

Artifact:
- `.codex/agent-reports/2026-04-14/mkk6903-true-remediation.md`

Final reply:
- `TASK stream-c-mkk6903-true-remediation | STATUS returned|blocked | ARTIFACT <path>`
- include exact lesson list remediated, before/after evidence, and final course counts
