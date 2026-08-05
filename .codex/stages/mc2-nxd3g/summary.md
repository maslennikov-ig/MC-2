# Stage Summary: mc2-nxd3g

Updated: 2026-08-05
Branch: `develop`; merged to `master` at `66b01524b974e661eb2ccf06d09099162708b536`
Beads: `mc2-nxd3g`
Status: complete; production rollout accepted; no reindex performed

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
- Deployed client-first, then switched production to the split Serve + MCP 3 stack. Existing
  documents were not reindexed.

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
- The final local full suite passed before delivery; GitHub run `30997869869` then passed type-check,
  lint, unit, integration, contract, package/image builds, and the client-first production deploy.
- Client-first production smoke used the TypeScript MCP 2 client against Docling MCP 1.26, negotiated
  the legacy protocol, validated the required tools, and converted a one-page DOCX to 492 characters
  of Markdown.
- Immutable image run `30997545725` published MCP
  `sha256:76b0d76d17742074a0c1b890c528ceb3bbd5d8d565dbe1ee3d2e176a21fabba0` and Serve
  `sha256:72ad1514aff5afdf57a5683d7676fc6b3170e3edf5f992e705ce7cdc463e7476`.
- The first guarded server cutover stopped before mutation because the original rollback package was
  not repository-linked. The exact running MCP 1.x image was republished in the linked package;
  manifest config `sha256:cba83fc462f91cc570a02e38881fad721a6e8334676c49789815d90121da97df`
  matches the old container. Final run `31000043538` passed deploy and monitoring drift checks.
- Production runtime versions are Serve 1.29.0, Docling Slim 2.118.0, Core 2.90.0, MCP 3.0.0,
  Python MCP 2.0.0 and TypeScript MCP client/core 2.0.0. The live Russian raster OCR smoke used the
  modern `2026-07-28` protocol, was not cached, produced 294 Markdown characters, and found all five
  control values. Post-smoke Serve used 2.576 GiB/4 GiB and MCP used 144.3 MiB/512 MiB; both had zero
  restarts.

## Quality Gate

- Accepted local candidate report: `.tmp/docling-benchmark/new-2.118-quality-fixed/report.md`.
- Passed 5/5: scientific PDF, DOCX numbering/nesting/merged cells, PPTX reading order/chart data,
  Russian raster OCR phrases/table, and the vector-outline negative case with controlled
  `EmptyConversionError`.
- A trustworthy full Docling 2.80 baseline could not be reconstructed locally because the prior image/digest was not present. Historical cache contains only the scientific Markdown, not the full corpus/raw JSON. No production access was assumed.
- Result: the quality blocker is removed and `DOCLING_STACK_V2_ENABLED=true` is live with immutable
  candidate and rollback digests.

## Documentation

- docs-reviewed: updated - runtime topology, exact versions, quality harness, immutable rollout, health/tool checks, and automatic MCP 1.x rollback are documented.
- project-index: updated - stable Docling client, image, benchmark, and operations entrypoints are indexed.
- graph-reviewed: updated - Graphify 0.9.14 rebuilt the local code graph without an external
  semantic/model backend (`60455` nodes, `86901` edges; communities refreshed); the focused Docling
  query resolves the SDK 2 client, adapter, benchmark, admin health route and Markdown consumer.

## Explicit Defers

- `mc2-vlskb` (P2): remove the Docling MCP 3.0 timeout wrapper after upstream consumes its declared settings.
- Existing documents remain intentionally unreindexed.
