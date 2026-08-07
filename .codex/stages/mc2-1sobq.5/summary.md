# Stage `mc2-1sobq.5` — release candidate and controlled rollout

Epic: `mc2-1sobq` (`specs/024-docling-intelligence/spec.md`)
Level: integration · Owner: root · Status: accepted 2026-08-07

## What changed observably

**Production now chunks new documents with Docling's own hybrid chunker.**
`DOCLING_CHUNK_STRATEGY=docling_hybrid` is live, and the images the platform
runs were rebuilt from the accepted tree.

| what                | before                   | after                          |
| ------------------- | ------------------------ | ------------------------------ |
| docling-serve       | 2026-08-05 digest        | `@sha256:459f995d…`            |
| docling-mcp-v3      | 2026-08-05 digest        | `@sha256:d6610a7c…`            |
| chunk strategy      | `legacy_markdown`        | `docling_hybrid`               |
| chunking profile id | `serve=unknown` (always) | `serve=1.29.0/docling-2.118.0` |

**The digests it replaced PREDATED Stage A.** Production had been running
without either runtime wrapper and without the baked `ru`/`en` EasyOCR and
RapidOCR model sets — so this rollout delivered Stages A–D, not just the flip.

**It changes NEW documents only.** Existing points keep the shape they were
written with. The collection is mixed by design: the payload fields are
additive, an old reader understands a new point and the reverse. Making it
uniform would need a reindex, which is a separate decision and was not
authorized. No existing document was touched.

**Expect one re-embedding per document** on its first re-processing after
deploy: the embedding cache key includes the chunking profile, which changed.

## How the flip was proven, without processing a user document

Stating that the value reached `.env.production` would have proven nothing:
`resolveChunkingStrategy` warns once and falls back to `legacy_markdown` on
anything it does not recognise, under a fully green deploy. Two read-only probes
inside the running `megacampus-worker` closed that gap.

1. The compiled `resolveChunkingStrategy` returns `docling_hybrid` against the
   real process env and does NOT fall back.
2. `chunkWithStrategy` — strategy read from the env, not passed in — ran end to
   end against a real cached production document: `applied_strategy:
docling_hybrid`, 3 parents / 25 children, `refCoverage: 1.0`, 22 chunks
   carrying containers, and `provenance_containers` present in the Qdrant
   payload projection.

Nothing was written: no point, no embedding, no database row, no change to the
cached document. Both probes were removed from the host afterwards.

Probe 2 is what makes Stage C's claim true in production rather than in tests —
`containers` is the sheet/slide/chapter boundary that only exists in the native
document, and it had been dropped at the payload projection until an independent
review caught it.

## The defect the probe found

`serveVersion()` read a `version` key off `GET /version`. Serve has no such key;
it answers a map keyed by package name. So the read returned undefined and every
chunking profile id ever produced ended `serve=unknown`.

Nothing failed, which is why it survived a whole stage. The profile id exists so
that upgrading the chunker makes already-indexed chunks identifiable as
belonging to a superseded one. Pinned at a constant it can never do that: a
Serve or Docling upgrade would move chunk boundaries while leaving the identity
byte-identical.

The unit tests could not have caught it — they fed a synthetic `{version}` body
that Serve never sends. The new test uses the bytes production actually
returned, and asserts a Docling bump under an unchanged Serve version still
changes the identity, because the chunkers live in the `docling` package.

Nothing is indexed under the broken id: no document had been processed between
the flip and the fix.

## Rollback, rehearsed rather than assumed

`DOCLING_CHUNK_STRATEGY` back to `legacy_markdown` is one repository-variable
edit plus a redeploy, and it restores the previous payload shape exactly with no
data migration.

The image rollback was rehearsed on real images in an isolated local compose
project, production untouched: the image swaps, the override applies (the
`docling-models` and `docling-cache` volumes mount, limits return to 4 GiB and 2
CPU), MCP 1.x reaches healthy and serves all three required tools.

**The rehearsal is the only reason the rollback works.**
`docling_check_required_tools` unpacked `streamable_http_client` as two values;
MCP 1.x yields three. The check could never have passed inside the rollback
container, and it had just been made fatal to the rollback — so every rollback
would have failed. The tests drive a docker stub and cannot see this.

`DOCLING_ROLLBACK_IMAGE` must stay on MCP **1.x**: the rollback path stops Serve.

## Review markers

project-index: reviewed-no-change — one modified module and one new test file
inside subsystems `.codex/project-index.md` already describes.

graph-reviewed: updated — `graphify update .` re-extracted after the change.

docs-reviewed: updated — `.codex/handoff.md` records the runtime proof, the
profile-version defect and the rehearsed rollback.

## Verification

- `pnpm type-check` exit 0 and `pnpm build` exit 0 across all packages.
- Chunking and Docling unit scope: 22 files / 229 tests green, including 5 new
  tests for the Serve version parsing.
- Ops/manifest suite: 64 files / 1259 tests green, 107 skipped (host-gated).
  `deploy/qdrant/q12-deployed-asset-manifest.json` needs no regeneration — the
  change touches none of its 26 tracked assets.
- `scripts/orchestration/run_process_verification.sh` OK.
- Deploy runs 31166411352 (build), 31170887968 (images), 31181424941 (flip).
  Automatic rollback did not trigger on any of them.
- Known flaky `stage4-analysis/evidence/downstream-context` failed the flip run
  under full-suite parallelism and passed on re-run; recorded as not-a-stop.

## Not done here, on purpose

- **No reindex.** Not authorized, and not needed for the payload to be readable.
- No schema migration, no secret or access change, no force-push.
- Serve is not exposed outside the internal network; no `latest` tag, no broad
  format fallback, no global VLM, no audio or video ingestion.
- `mc2-x72bq` (chart extraction) stays deferred on host resources, and
  `mc2-ibzcc` (removing both runtime wrappers) stays open on upstream.
