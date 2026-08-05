# Stage Summary: mc2-nxd3g

Updated: 2026-08-05
Branch: current worktree (not delivered)
Beads: `mc2-nxd3g`
Status: implementation complete; final release acceptance pending; production rollout awaits separate authorization

## Scope

- Migrated the backend and admin health probe to the split TypeScript MCP SDK 2.0.0 client/core packages with protocol auto-negotiation.
- Added one conversion bundle for convert/export/save, typed error classification, one connection-loss retry, required-tool validation, MCP 2 `structuredContent`, and MCP 1 text-JSON compatibility.
- Added a version-tolerant Docling JSON adapter and SHA-256/legacy-MD5 cache-pair cleanup.
- Split Docling Serve 1.29.0 / Docling 2.118.0 / Core 2.90.0 from Docling MCP 3.0.0 / Python MCP 2.0.0, with hash locks, model refresh, resource limits, nginx `/mcp`, and immutable deployment gates.
- Added a reproducible five-document quality corpus and benchmark artifacts under `.tmp/docling-benchmark/`.
- Added EasyOCR `ru,en` model preload and a focused MCP 3 compatibility wrapper for the OCR fields
  that upstream does not forward to Serve.
- Corrected the DOCX fixture to use one true multilevel numbering definition, proving semantic list
  nesting instead of relying on unrelated Word paragraph styles.
- Did not deploy, reindex, or mutate production data.

## Verification

- Focused backend/client/adapter/cache tests and web MCP health tests passed; the MCP image also runs
  its real upstream-options unit test during build.
- All six Compose configurations parsed successfully.
- Local Serve -> MCP -> nginx -> SDK 2 initialize/list-tools smoke passed with all three required tools.
- Exact runtime versions passed image assertions; during the accepted quality run Serve peaked at
  1.947 GiB of its 4 GiB limit, MCP stayed inside 512 MiB, with zero restarts.
- CI rollout, workflow, blue/green fail-closed, and deploy-change contracts passed.
- The first canonical release-closeout attempt passed type-check/build, then failed 13 of 6,651
  executed tests: four Q12 process-contract timeouts under unrestricted worker contention, three
  stale Q12 asset-manifest assertions, and six `normalizeError` compatibility assertions.
- The correction loop preserved meaningful plain errors, regenerated the canonical Q12 manifest,
  and capped backend unit-test workers at four. The affected error suite passed 15/15, the manifest
  suite passed 40/40 with 26 expected skips, and all observed timeout files passed 7/7, 8/8, 26/26
  and 248/248 under the corrected worker limit.
- A combined correctness/improvement review found and fixed three in-scope contract gaps: rollout
  operations are explicitly fail-closed even when Bash `errexit` is suppressed by an OR-list;
  saved JSON is verified against the bundle key and the SDK client is recreated after failed initial
  connect; cache cleanup matches Python `json.dumps(ensure_ascii=True)` for Unicode paths. Focused
  regression tests pass 14/14 plus the rollout shell contract and syntax checks.
- Final root-owned release acceptance runs after this summary, Beads, Compose/search proof, and graph
  refresh; its receipt is the acceptance authority rather than any incomplete earlier attempt.

## Quality Gate

- Accepted local candidate report: `.tmp/docling-benchmark/new-2.118-quality-fixed/report.md`.
- Passed 5/5: scientific PDF, DOCX numbering/nesting/merged cells, PPTX reading order/chart data,
  Russian raster OCR phrases/table, and the vector-outline negative case with controlled
  `EmptyConversionError`.
- A trustworthy full Docling 2.80 baseline could not be reconstructed locally because the prior image/digest was not present. Historical cache contains only the scientific Markdown, not the full corpus/raw JSON. No production access was assumed.
- Result: the quality blocker is removed. `DOCLING_STACK_V2_ENABLED` still remains `false` until a
  separately authorized production rollout supplies immutable candidate and rollback digests.

## Documentation

- docs-reviewed: updated - runtime topology, exact versions, quality harness, immutable rollout, health/tool checks, and automatic MCP 1.x rollback are documented.
- project-index: updated - stable Docling client, image, benchmark, and operations entrypoints are indexed.
- graph-reviewed: updated - Graphify 0.9.14 rebuilt the local code graph without an external
  semantic/model backend (`60453` nodes, `86900` edges, `7242` communities); the focused Docling
  query resolves the new client and Markdown consumer. The report is built from current HEAD plus
  the explicitly reported uncommitted stage diff.

## Explicit Defers

- `mc2-vlskb` (P2): remove the Docling MCP 3.0 timeout wrapper after upstream consumes its declared settings.
- Production image publication/deploy and one live smoke conversion require separate user authority;
  existing documents are not reindexed.
