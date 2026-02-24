# Stage7 NotebookLM Smoke Script

Date: 2026-02-21

## Scope

Added a local smoke-test utility to validate Stage7 enrichment generation flow through API procedures (not direct bridge calls):

- `generateOnDemand`
- `getGenerationStatus` polling
- optional `regenerate` when enrichment already exists
- post-check of asset persistence and playback URL retrieval

## Files Changed

- `packages/course-gen-platform/scripts/nlm-stage7-smoke.ts`
- `scripts/nlm-stage7-preflight.sh`
- `package.json` (added `nlm:stage7-preflight` script)

## Usage

```bash
pnpm nlm:stage7-preflight -- --type nlm_audio --timeout-seconds 2100 --poll-interval-seconds 10
```

Quick non-regeneration check for existing enrichment:

```bash
pnpm nlm:stage7-preflight -- --type nlm_audio --lesson-id <lesson_uuid> --no-regenerate-if-exists
```

## Verification Performed

1. Help/CLI validation:
   - `pnpm nlm:stage7-preflight -- --help`
2. Real Stage7 generation run (new enrichment):
   - `pnpm nlm:stage7-preflight -- --type nlm_audio --timeout-seconds 2100 --poll-interval-seconds 10`
3. Re-run against existing enrichment (no regeneration):
   - `pnpm nlm:stage7-preflight -- --type nlm_audio --lesson-id 3d39c52e-929e-432c-b6e3-b3ae741edee5 --no-regenerate-if-exists --timeout-seconds 120 --poll-interval-seconds 5`

## Real Run Result

- Lesson: `3d39c52e-929e-432c-b6e3-b3ae741edee5`
- Enrichment type: `nlm_audio`
- Generated enrichment id: `d707e3aa-ce1c-4565-a65a-fcb68e119563`
- Final status: `completed`
- Local artifact path:
  - `/home/me/code/mc2/data/enrichments/8baaa75e-bb85-496e-81df-807e770fd73d/3d39c52e-929e-432c-b6e3-b3ae741edee5/d707e3aa-ce1c-4565-a65a-fcb68e119563.mp3`
- Artifact size:
  - `2.6M`
- Report JSON:
  - `/home/me/code/mc2/logs/nlm-stage7-smoke/2026-02-21T09-27-14-039Z.json`

## Notes

- `getPlaybackUrl` in this CLI context returned `"Object not found"` while local file was present.
- Smoke script records this in `playbackError` but does not fail if final enrichment status is `completed` and artifact is persisted.
