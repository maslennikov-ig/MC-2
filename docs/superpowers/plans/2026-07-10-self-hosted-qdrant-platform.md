# Self-Hosted Qdrant Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Qdrant Cloud dependency with a secure, observable, recoverable self-hosted Qdrant runtime and correct the application's hybrid retrieval contract.

**Architecture:** Run a version-pinned single Qdrant node per environment, expose only private/loopback interfaces, and keep `course_embeddings` as an alias over versioned physical collections. Ingest Jina dense vectors plus Qdrant-native multilingual BM25 documents, retrieve with server-side RRF and Formula Query priority scoring, and operate the derived index through deterministic bootstrap, reindex, snapshots, restore drills, Prometheus, and Grafana.

**Tech Stack:** Qdrant Server `1.18.2`, `@qdrant/js-client-rest` `1.18.0`, TypeScript, Vitest, Docker Compose, Prometheus `3.11.3`, Grafana `12.4.0`, Bash/systemd, pnpm.

## Global Constraints

- Implement epic `mc2-jz6y0`; create Beads children before delegated or file-changing streams.
- Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, the design spec, and `graphify-out/GRAPH_REPORT.md` before editing.
- Use a dedicated `codex/` branch and worktree for every write-heavy delegated stream; do not touch the dirty primary checkout.
- Preserve unrelated changes, especially the existing `.claude/settings.json` modification.
- Import cross-package contracts only from `@megacampus/shared-types`.
- Never commit Qdrant, S3, Grafana, or Telegram credentials.
- Application collection name is alias `course_embeddings`; initial physical name is `course_embeddings_v1`.
- Dense vectors remain Jina v3, 768 dimensions, Cosine distance.
- Native BM25 options are exactly `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256` at ingest and query.
- Staging/prod mutation, `/deploy`, remote secret changes, and live reindex require explicit current-task authorization.
- No task is accepted from a worker report alone: review the artifact, files, diff, and verification output.
- Finish implementation with docs review, Graphify refresh, Beads update, stage closeout, commit, and push.

---

## File Map

### Search and collection contract

- Create `packages/course-gen-platform/src/shared/qdrant/config.ts`: environment names and native BM25 options.
- Create `packages/course-gen-platform/src/shared/qdrant/collection-schema.ts`: pure vector, payload-index, and strict-mode definitions.
- Create `packages/course-gen-platform/src/shared/qdrant/collection-manager.ts`: bootstrap, alias, and drift verification.
- Modify `packages/course-gen-platform/src/shared/qdrant/create-collection.ts`: CLI-only wrapper over the manager.
- Modify `packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts`, `upload-types.ts`, and `upload.ts`: complete payload and native sparse document ingestion.
- Modify `packages/course-gen-platform/src/shared/qdrant/search-operations.ts`, `search-helpers.ts`, `search-types.ts`, and `search.ts`: native BM25, RRF, Formula Query, grouping, cache correctness, and fallback metadata.
- Delete `packages/course-gen-platform/src/shared/embeddings/bm25.ts` after all runtime imports are removed.

### Tests and tools

- Create `packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts`.
- Create `packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts`.
- Create `packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts`.
- Create `packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts`.
- Modify `packages/course-gen-platform/tests/integration/qdrant.test.ts` and `ci-qdrant-smoke.test.ts`.
- Create `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts` and `reindex-plan.ts`.
- Create `packages/course-gen-platform/tools/qdrant/snapshot.ts`, `restore-drill.ts`, and `verify-collection.ts`.
- Modify `packages/course-gen-platform/package.json` and `pnpm-lock.yaml`.

### Runtime and operations

- Modify `docker-compose.dev.yml`, `docker-compose.infra.yml`, `docker-compose.app.yml`, and `docker-compose.production.yml`.
- Modify `.github/workflows/ci-cd.yml`, `scripts/deploy_dev.sh`, and `scripts/deploy_blue_green.sh`.
- Create `deploy/systemd/megacampus-qdrant-snapshot.service` and `.timer`.
- Create `ops/qdrant/prometheus/prometheus.yml` and `alerts.yml`.
- Create `ops/qdrant/grafana/provisioning/datasources/prometheus.yml`, `provisioning/dashboards/qdrant.yml`, and `dashboards/qdrant.json`.
- Create `docs/operations/qdrant-self-hosted.md`.
- Modify `.env.production.example`, `packages/course-gen-platform/.env.example`, `docs/quickstart.md`, `.claude/docs/deployment-guide.md`, Qdrant module docs, `.codex/project-index.md`, `.codex/handoff.md`, and the stage summary.

---

### Task 1: Central Configuration, Pinned Client, And Collection Schema

**Files:**

- Create: `packages/course-gen-platform/src/shared/qdrant/config.ts`
- Create: `packages/course-gen-platform/src/shared/qdrant/collection-schema.ts`
- Create: `packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts`
- Modify: `packages/course-gen-platform/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `QDRANT_COLLECTION_ALIAS`, `QDRANT_PHYSICAL_COLLECTION`, `QDRANT_BM25_OPTIONS`, `createBm25Document(text)`, `COLLECTION_CREATE_PARAMS`, `PAYLOAD_INDEXES`.
- Consumes: environment variables `QDRANT_COLLECTION_NAME` and `QDRANT_PHYSICAL_COLLECTION_NAME`.

- [ ] **Step 1: Write the failing schema test**

```typescript
import { describe, expect, it } from 'vitest';
import {
  COLLECTION_CREATE_PARAMS,
  PAYLOAD_INDEXES,
} from '../../../src/shared/qdrant/collection-schema';
import { createBm25Document } from '../../../src/shared/qdrant/config';

describe('self-hosted Qdrant schema', () => {
  it('uses native BM25 with IDF and multilingual no-stemming options', () => {
    expect(COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.modifier).toBe('idf');
    expect(createBm25Document('Пример text')).toEqual({
      text: 'Пример text',
      model: 'qdrant/bm25',
      options: {
        language: 'none',
        tokenizer: 'multilingual',
        lowercase: true,
        k: 1.2,
        b: 0.75,
        avg_len: 256,
      },
    });
  });

  it('indexes every field used by filters, deletes, hierarchy, and grouping', () => {
    expect(PAYLOAD_INDEXES.map(index => index.field_name)).toEqual([
      'organization_id',
      'course_id',
      'document_id',
      'chunk_id',
      'level',
      'chapter',
      'section',
      'has_code',
      'has_formulas',
      'has_tables',
      'has_images',
    ]);
    expect(COLLECTION_CREATE_PARAMS.strict_mode_config).toMatchObject({
      enabled: true,
      unindexed_filtering_retrieve: false,
      unindexed_filtering_update: false,
      max_query_limit: 100,
      max_payload_index_count: 16,
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the modules do not exist**

Run:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-schema.test.ts
```

Expected: FAIL with module-resolution errors for `config` or `collection-schema`.

- [ ] **Step 3: Implement the pure configuration modules**

Use this exported contract in `config.ts`:

```typescript
export const QDRANT_COLLECTION_ALIAS =
  process.env.QDRANT_COLLECTION_NAME?.trim() || 'course_embeddings';
export const QDRANT_PHYSICAL_COLLECTION =
  process.env.QDRANT_PHYSICAL_COLLECTION_NAME?.trim() || 'course_embeddings_v1';

export const QDRANT_BM25_OPTIONS = {
  language: 'none',
  tokenizer: 'multilingual',
  lowercase: true,
  k: 1.2,
  b: 0.75,
  avg_len: 256,
} as const;

export function createBm25Document(text: string) {
  return { text, model: 'qdrant/bm25' as const, options: QDRANT_BM25_OPTIONS };
}
```

Move the 768D dense/HNSW configuration out of `create-collection.ts`. Add `modifier: 'idf'`, the eleven indexes from the spec, and the exact strict-mode values from the spec. Define `organization_id` with `{ type: 'keyword', is_tenant: true }`; use `keyword` for the other string fields and `bool` for the four content flags.

- [ ] **Step 4: Pin the JavaScript client and refresh the lockfile**

Change `"@qdrant/js-client-rest": "^1.18.0"` to `"@qdrant/js-client-rest": "1.18.0"`, then run:

```bash
pnpm install --lockfile-only
```

Expected: lockfile remains on `1.18.0` without a range in the package manifest.

- [ ] **Step 5: Run focused tests and type-check the package**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-schema.test.ts
pnpm --filter @megacampus/course-gen-platform type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/course-gen-platform/src/shared/qdrant/config.ts packages/course-gen-platform/src/shared/qdrant/collection-schema.ts packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts packages/course-gen-platform/package.json pnpm-lock.yaml
git commit -m "feat(qdrant): define self-hosted collection contract"
```

---

### Task 2: Idempotent Physical Collection, Alias, And Drift Verification

**Files:**

- Create: `packages/course-gen-platform/src/shared/qdrant/collection-manager.ts`
- Create: `packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/create-collection.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/index.ts`
- Create: `packages/course-gen-platform/tools/qdrant/verify-collection.ts`
- Modify: `packages/course-gen-platform/package.json`

**Interfaces:**

- Consumes: configuration exports from Task 1 and an injected `QdrantClient`.
- Produces: `ensureCourseEmbeddingsCollection(options)`, `verifyCourseEmbeddingsCollection(options)`, and `SchemaVerificationResult`.

- [ ] **Step 1: Write client-mocked tests for creation order, idempotency, alias conflict, and drift**

The test must assert this call order for a fresh database:

```typescript
expect(calls).toEqual([
  'getCollections',
  'createCollection:course_embeddings_v1',
  ...PAYLOAD_INDEXES.map(index => `createPayloadIndex:${index.field_name}`),
  'getCollection:course_embeddings_v1',
  'getAliases',
  'updateCollectionAliases:course_embeddings->course_embeddings_v1',
]);
```

Add cases where the correct collection/alias already exist, where alias points to the wrong physical collection, where a legacy physical `course_embeddings` conflicts, and where dense size, sparse modifier, an index, or strict mode differs. Drift must return a non-empty mismatch list and perform no mutation.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts
```

Expected: FAIL because `collection-manager.ts` is missing.

- [ ] **Step 3: Implement the manager with dependency injection**

Use this public shape:

```typescript
export interface EnsureCollectionOptions {
  client?: QdrantClient;
  aliasName?: string;
  physicalName?: string;
  allowDropLegacy?: boolean;
}

export interface SchemaVerificationResult {
  ok: boolean;
  aliasName: string;
  physicalName: string;
  mismatches: string[];
}

export async function verifyCourseEmbeddingsCollection(
  options: EnsureCollectionOptions = {}
): Promise<SchemaVerificationResult>;

export async function ensureCourseEmbeddingsCollection(
  options: EnsureCollectionOptions = {}
): Promise<SchemaVerificationResult>;
```

Create indexes before any point ingestion. Use one `updateCollectionAliases()` action to create the alias. Refuse drift and conflicts by default. Permit deletion of the legacy physical collection only when `allowDropLegacy === true`, after logging its point count and explicit name.

- [ ] **Step 4: Reduce `create-collection.ts` to a direct-execution CLI wrapper**

Keep the full resolved-path import guard. Parse `--physical`, `--alias`, `--verify-only`, and `--allow-drop-legacy`. Export the manager functions from `index.ts`. Add package scripts:

```json
{
  "qdrant:bootstrap": "tsx src/shared/qdrant/create-collection.ts",
  "qdrant:verify": "tsx tools/qdrant/verify-collection.ts"
}
```

- [ ] **Step 5: Run tests and CLI help/verify failure behavior**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/create-collection.test.ts tests/unit/shared/qdrant/collection-manager.test.ts
pnpm --filter @megacampus/course-gen-platform qdrant:bootstrap -- --help
```

Expected: tests PASS; CLI exits 0 for help and does not connect on import.

- [ ] **Step 6: Commit**

```bash
git add packages/course-gen-platform/src/shared/qdrant packages/course-gen-platform/tests/unit/shared/qdrant packages/course-gen-platform/tools/qdrant/verify-collection.ts packages/course-gen-platform/package.json
git commit -m "feat(qdrant): manage versioned collections through an alias"
```

---

### Task 3: Complete Payload And Native BM25 Ingestion

**Files:**

- Create: `packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/upload-types.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/upload.ts`
- Delete: `packages/course-gen-platform/src/shared/embeddings/bm25.ts`

**Interfaces:**

- Consumes: `createBm25Document()` and `toQdrantPayload()`.
- Produces: points with `{ dense, sparse: Document }` and complete compacted payloads.

- [ ] **Step 1: Write a failing upload conversion test**

Build an `EmbeddingResult` whose chunk has `document_priority: 'CORE'` and `document_weight: 1`. Assert:

```typescript
expect(point.vector.sparse).toEqual(createBm25Document(chunk.content));
expect(point.payload).toMatchObject({
  document_priority: 'CORE',
  document_weight: 1,
  organization_id: chunk.organization_id,
  course_id: chunk.course_id,
  document_id: chunk.document_id,
  chunk_id: chunk.chunk_id,
});
expect(Object.values(point.payload)).not.toContain(undefined);
expect(Object.values(point.payload)).not.toContain(null);
```

Also assert that two separate calls do not share or accumulate corpus state.

- [ ] **Step 2: Run and confirm the priority assertion fails**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/upload-helpers.test.ts
```

Expected: FAIL because the current manual payload omits priority fields and sparse vector is numeric.

- [ ] **Step 3: Replace the duplicate payload and custom BM25 path**

Implement one compaction helper:

```typescript
export function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
  );
}
```

`toQdrantPoint()` must use:

```typescript
const vector = {
  dense: dense_vector,
  ...(enable_sparse ? { sparse: createBm25Document(chunk.content) } : {}),
};
return {
  id: generateNumericId(chunk.chunk_id),
  vector,
  payload: compactPayload(toQdrantPayload(chunk)),
};
```

Remove `buildCorpusStatistics()` from upload flow. Remove all imports of `getGlobalBM25Scorer`, then delete `bm25.ts`.

- [ ] **Step 4: Run focused upload, Stage 2, and lifecycle tests**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/upload-helpers.test.ts tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts tests/unit/shared/qdrant/lifecycle.test.ts tests/unit/shared/qdrant/lifecycle-refcount.test.ts
```

Expected: PASS.

- [ ] **Step 5: Prove there are no runtime references to the custom scorer**

```bash
rg -n 'BM25Scorer|getGlobalBM25Scorer|buildCorpusStatistics' packages/course-gen-platform/src
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add packages/course-gen-platform/src/shared/embeddings/bm25.ts packages/course-gen-platform/src/shared/qdrant packages/course-gen-platform/tests/unit/shared/qdrant packages/course-gen-platform/tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts
git commit -m "fix(qdrant): ingest native BM25 and complete priority payloads"
```

---

### Task 4: Native Hybrid Query, Formula Priority, Grouping, And Cache Correctness

**Files:**

- Create: `packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/search-operations.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/search-helpers.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/search-types.ts`
- Modify: `packages/course-gen-platform/src/shared/qdrant/search.ts`
- Modify: Stage 5/6 Qdrant/RAG unit tests that assert request options.

**Interfaces:**

- Adds `group_by_document?: boolean`, `group_size?: number`, and `fallback_used` metadata.
- Replaces client-side priority score mutation with a nested Qdrant Query API request.

- [ ] **Step 1: Write request-shape and cache-key regression tests**

Mock `qdrantClient.query()` and `queryGroups()`. Assert the hybrid sparse prefetch query equals `createBm25Document(queryText)`, dense threshold is only on dense prefetch, RRF is nested inside Formula Query when boosting is enabled, and the formula supplies default `document_weight: 0.5`.

Assert cache keys differ for:

```typescript
{ enable_priority_boost: false }
{ enable_priority_boost: true, priority_boost_factor: 0.4 }
{ enable_priority_boost: true, priority_boost_factor: 0.8 }
{ group_by_document: true, group_size: 2 }
```

- [ ] **Step 2: Run and confirm failure against the current custom sparse/client boost implementation**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/search-operations.test.ts
```

Expected: FAIL on sparse document shape, formula, grouping, and cache keys.

- [ ] **Step 3: Implement query builders as pure functions**

Export these functions for unit tests:

```typescript
export function buildHybridPrefetch(
  queryText: string,
  denseVector: number[],
  options: ResolvedSearchOptions
);
export function buildPriorityFormula(boostFactor: number);
export function flattenDocumentGroups(
  groups: QueryGroupsResponse['groups'],
  limit: number
): QdrantScoredPoint[];
```

Use RRF as the safe default. Formula Query must implement the spec's multiplicative formula and default missing weight to `0.5`. Clamp invalid payload values in the expression when the Qdrant expression API supports it; otherwise ingestion validation plus formula defaults must guarantee the range, and the unit test must reject an out-of-range upload payload.

- [ ] **Step 4: Replace runtime query execution**

- Hybrid without boost/grouping: `qdrantClient.query()` with two prefetches and `{ rrf: {} }`.
- Hybrid with boost: nested RRF prefetch followed by Formula Query.
- Grouped hybrid: `qdrantClient.queryGroups()` with `group_by: 'document_id'`, `group_size: 2`, and round-robin flattening capped at `limit`.
- Dense-only: preserve current path; wrap in Formula Query only when priority boost is explicitly enabled.
- Remove the score-mapping/sorting block from `search.ts`.
- Include boost, factor, grouping, group size, and collection alias in cache keys.

- [ ] **Step 5: Enable grouping in Stage 5/6 only behind the passing regression gate**

Pass `group_by_document: true` and `group_size: 2` from the three production retrieval entrypoints after Task 5's RU/EN integration fixture passes. Preserve each caller's result limit. If the fixture fails, keep the option implemented but disabled and create a Beads follow-up with the exact missed query/evidence; do not weaken the fixture.

- [ ] **Step 6: Run focused search and RAG tests**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/search-operations.test.ts tests/unit/stages/stage5-generation/qdrant-search.test.ts
pnpm --filter @megacampus/course-gen-platform type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/course-gen-platform/src/shared/qdrant packages/course-gen-platform/src/stages/stage5-generation packages/course-gen-platform/src/stages/stage6-lesson-content packages/course-gen-platform/tests/unit/shared/qdrant packages/course-gen-platform/tests/unit/stages/stage5-generation
git commit -m "feat(qdrant): rank hybrid results with formula and grouping"
```

---

### Task 5: Blocking Qdrant Integration Coverage

**Files:**

- Modify: `packages/course-gen-platform/tests/integration/qdrant.test.ts`
- Modify: `packages/course-gen-platform/tests/integration/ci-qdrant-smoke.test.ts`
- Modify: `packages/course-gen-platform/vitest.config.integration-ci.ts` only if a new test file is added.
- Modify: `.github/workflows/ci-cd.yml`

**Interfaces:**

- Consumes: production collection manager, upload adapter, and search adapter.
- Produces: a blocking CI contract for native BM25/RRF/Formula/grouping/strict mode.

- [ ] **Step 1: Fix the skip decision**

Replace the mutable `qdrantAvailable` suite skip with synchronous environment gating:

```typescript
const hasQdrantConfig = Boolean(process.env.QDRANT_URL && process.env.QDRANT_API_KEY);
const qdrantDescribe = hasQdrantConfig ? describe : describe.skip;
qdrantDescribe('Qdrant Vector Database Integration Tests', () => {
  /* existing suite */
});
```

When environment variables exist and Qdrant is unreachable, `beforeAll` must fail rather than skip.

- [ ] **Step 2: Expand the CI smoke fixture**

Create two RU and two EN documents across two organizations/courses. The CI test must prove:

- physical collection plus alias creation;
- complete payload including priority;
- RU and EN native BM25 matches;
- dense + sparse RRF returns evidence;
- CORE Formula Query outranks an otherwise equivalent SUPPLEMENTARY point;
- grouping returns at most two chunks per document and preserves diversity;
- tenant/course filters do not leak points;
- an unindexed-field filter is rejected by strict mode;
- snapshot create/list/delete works;
- cleanup removes alias and physical test collection.

- [ ] **Step 3: Pin CI and remove Cloud reliance**

Change every Qdrant service image in `.github/workflows/ci-cd.yml` to `qdrant/qdrant:v1.18.2`. Point contract/integration jobs at `http://localhost:6333` with `test-qdrant-key`; do not pass the Cloud URL/key secrets. Remove `continue-on-error: true` from the Qdrant integration gate.

- [ ] **Step 4: Run the pinned local integration gate**

```bash
docker run --rm -d --name mc2-qdrant-plan-test -p 6333:6333 -e QDRANT__SERVICE__API_KEY=test-qdrant-key qdrant/qdrant:v1.18.2
trap 'docker rm -f mc2-qdrant-plan-test >/dev/null 2>&1 || true' EXIT
QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key pnpm --filter @megacampus/course-gen-platform test:integration:ci
docker rm -f mc2-qdrant-plan-test
trap - EXIT
```

Expected: all CI integration files PASS and cleanup completes even after a test failure.

- [ ] **Step 5: Run the broad Qdrant integration file explicitly**

```bash
docker run --rm -d --name mc2-qdrant-full-test -p 6333:6333 -e QDRANT__SERVICE__API_KEY=test-qdrant-key qdrant/qdrant:v1.18.2
trap 'docker rm -f mc2-qdrant-full-test >/dev/null 2>&1 || true' EXIT
QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key pnpm --filter @megacampus/course-gen-platform exec vitest run tests/integration/qdrant.test.ts
docker rm -f mc2-qdrant-full-test
trap - EXIT
```

Expected: the suite executes rather than reporting all scenarios skipped.

- [ ] **Step 6: Commit**

```bash
git add packages/course-gen-platform/tests/integration packages/course-gen-platform/vitest.config.integration-ci.ts .github/workflows/ci-cd.yml
git commit -m "test(qdrant): gate native hybrid and strict-mode behavior"
```

---

### Task 6: Self-Hosted Dev And Staging Runtime

**Files:**

- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.infra.yml`
- Modify: `docker-compose.app.yml`
- Modify: `docker-compose.production.yml`
- Modify: `scripts/deploy_dev.sh`
- Modify: `scripts/deploy_blue_green.sh`
- Modify: `.env.production.example`
- Modify: `packages/course-gen-platform/.env.example`

**Interfaces:**

- Produces: `qdrant-dev` and `qdrant` services, private URLs, health dependencies, persistent volumes, and secret names.

- [ ] **Step 1: Add Compose validation expectations before editing**

Record the current failure/absence:

```bash
docker compose -f docker-compose.infra.yml --env-file .env.production.example config --services | rg '^qdrant$'
```

Expected before implementation: no match.

- [ ] **Step 2: Harden `qdrant-dev`**

Use `qdrant/qdrant:v1.18.2`, API and read-only keys, telemetry disabled, metrics prefix `qdrant_`, a `/readyz` health check, 1 CPU/1 GiB limits, persistent storage, and loopback port `6333`. Change API/main/Stage 6 dependencies to `condition: service_healthy`.

- [ ] **Step 3: Add staging Qdrant to shared infrastructure**

Add service `qdrant` to `docker-compose.infra.yml` with:

- image `qdrant/qdrant:v1.18.2`;
- loopback `127.0.0.1:6335:6333`;
- named volume `megacampus_qdrant` at `/qdrant/storage`;
- 2 CPU/2 GiB limits;
- API/read-only keys, telemetry disabled, hardware reporting and metrics prefix;
- native S3 snapshot environment mapping;
- `/readyz` health check;
- main worker dependency on healthy Qdrant.

Set `QDRANT_URL=http://qdrant:6333` explicitly in the staging API, main worker, and Stage 6 worker Compose environments. Do not add Qdrant to Stage 7.

- [ ] **Step 4: Add deploy health gates without activating staging**

`deploy_dev.sh` and `deploy_blue_green.sh` must check `/readyz`, authenticated `/collections`, and `qdrant:verify` before recreating RAG-capable application containers. The scripts must print only endpoint/service names, never keys. Do not run either deploy script in this task.

- [ ] **Step 5: Update tracked environment examples**

Document local internal URLs, collection/physical names, read-only key, and S3 snapshot variables with non-secret placeholder values. Remove Cloud as the default. Keep a short note that external URLs are unsupported unless the security runbook is followed.

- [ ] **Step 6: Validate Compose and shell syntax**

```bash
docker compose -f docker-compose.dev.yml --env-file .env.example config --quiet
docker compose -f docker-compose.infra.yml --env-file .env.production.example config --quiet
docker compose -f docker-compose.app.yml --env-file .env.production.example config --quiet
docker compose -f docker-compose.production.yml --env-file .env.production.example config --quiet
bash -n scripts/deploy_dev.sh scripts/deploy_blue_green.sh
```

Expected: PASS without resolving real secrets or contacting the server.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.dev.yml docker-compose.infra.yml docker-compose.app.yml docker-compose.production.yml scripts/deploy_dev.sh scripts/deploy_blue_green.sh .env.production.example packages/course-gen-platform/.env.example
git commit -m "feat(qdrant): add secure self-hosted runtime services"
```

---

### Task 7: Reindex Plan, Execute, And Verify Tool

**Files:**

- Create: `packages/course-gen-platform/tools/qdrant/reindex-plan.ts`
- Create: `packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/reindex-plan.test.ts`
- Modify: `packages/shared-types/src/bullmq-jobs.ts`
- Modify: Stage 2 handler/phase files needed to pass an explicit target collection.
- Modify: `packages/course-gen-platform/package.json`

**Interfaces:**

- Adds optional `qdrantTargetCollection` to `DocumentProcessingJobDataSchema`.
- Produces CLI modes `plan`, `execute`, and `verify`, with `--target-collection`, `--concurrency`, and `--course-id`.

- [ ] **Step 1: Write pure reindex classification tests**

Use fixtures for available source, missing source, unsupported MIME, and already-enqueued identity. Assert:

```typescript
expect(buildReindexPlan(rows, sourceProbe)).toEqual({
  eligible: 2,
  recoverable: 1,
  missingSource: 1,
  estimatedDocuments: 1,
  gaps: [{ fileId: missingId, reason: 'source_missing' }],
});
```

- [ ] **Step 2: Add the optional shared job contract**

Extend the schema with:

```typescript
qdrantTargetCollection: z.string().min(1).max(255).optional(),
qdrantReindexRunId: z.string().uuid().optional(),
```

Thread `qdrantTargetCollection` through Stage 2 to `uploadChunksToQdrant({ collection_name })`. Normal jobs continue to use the alias default.

- [ ] **Step 3: Implement `plan` mode as read-only**

Query only the columns required to resolve source path, course, organization, MIME type, priority, and current status. Print JSON plus a human summary. Exit 2 when gaps exist unless `--allow-gaps` is passed; `--allow-gaps` only changes exit status and does not mark missing rows indexed.

- [ ] **Step 4: Implement bounded `execute` mode**

Require `--target-collection` to name a physical collection, refuse the logical alias, and require a successful schema verification first. Enqueue idempotent document-processing jobs with deterministic job IDs derived from reindex run and file ID. Default concurrency is 2. Persist run ID and counts in the command artifact; do not log source content or keys.

- [ ] **Step 5: Implement `verify` mode**

Compare recoverable source document IDs with distinct Qdrant `document_id` values, verify per-course and per-organization counts, and invoke the RU/EN hybrid fixture. Exit non-zero on missing/extra documents, schema drift, or failed relevance checks.

- [ ] **Step 6: Run tests and dry-run against mocked/local fixtures**

```bash
pnpm --filter @megacampus/shared-types build
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/reindex-plan.test.ts tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts
```

Expected: tests PASS; the pure fixture plan is deterministic and performs no mutation.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/bullmq-jobs.ts packages/course-gen-platform/tools/qdrant packages/course-gen-platform/tests/unit/tools/qdrant packages/course-gen-platform/src/stages/stage2-document-processing packages/course-gen-platform/package.json
git commit -m "feat(qdrant): add source-driven reindex workflow"
```

---

### Task 8: Native S3 Snapshots And Restore Drill

**Files:**

- Create: `packages/course-gen-platform/tools/qdrant/snapshot.ts`
- Create: `packages/course-gen-platform/tools/qdrant/restore-drill.ts`
- Create: `packages/course-gen-platform/tests/unit/tools/qdrant/snapshot.test.ts`
- Create: `deploy/systemd/megacampus-qdrant-snapshot.service`
- Create: `deploy/systemd/megacampus-qdrant-snapshot.timer`
- Modify: `packages/course-gen-platform/package.json`

**Interfaces:**

- Produces: `qdrant:snapshot` and `qdrant:restore-drill` commands and a six-hour timer.
- Consumes: Qdrant-native S3 snapshot configuration from Task 6.

- [ ] **Step 1: Write snapshot manifest and retention tests**

Mock `createSnapshot`, `listSnapshots`, collection info, and delete calls. Assert manifest contains collection, snapshot name, point count, size, checksum when returned, timestamp, and storage mode; retention never deletes the newest successful snapshot and keeps 30 days.

- [ ] **Step 2: Implement snapshot command**

Resolve alias to physical collection, create the snapshot, verify it appears in `listSnapshots`, and emit a single JSON manifest. Exit non-zero if snapshot creation or listing fails. Never print S3 credentials.

- [ ] **Step 3: Implement isolated restore drill**

Create target `qdrant_restore_drill_<UTC timestamp>`, recover with priority `snapshot`, then run schema, counts, dense, RU BM25, EN BM25, and Formula Query checks. Delete only the drill collection in `finally`; preserve the manifest on failure.

- [ ] **Step 4: Add systemd unit templates**

The service runs from `/opt/megacampus/packages/course-gen-platform`, loads `/opt/megacampus/.env.production`, and invokes `pnpm qdrant:snapshot`. The timer uses `OnCalendar=*-*-* 00/6:15:00`, `Persistent=true`, and randomized delay up to 10 minutes. Installation/enabling is documented but not executed without deploy authorization.

- [ ] **Step 5: Run unit and local restore tests**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/snapshot.test.ts
systemd-analyze verify deploy/systemd/megacampus-qdrant-snapshot.service deploy/systemd/megacampus-qdrant-snapshot.timer
```

For the integration drill, configure local snapshot storage on a temporary pinned Qdrant container and run both package commands. Expected: restored counts and four search checks PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/course-gen-platform/tools/qdrant packages/course-gen-platform/tests/unit/tools/qdrant deploy/systemd packages/course-gen-platform/package.json
git commit -m "feat(qdrant): automate snapshots and restore drills"
```

---

### Task 9: Prometheus, Grafana, Alerts, And Operator Web UI

**Files:**

- Create: `ops/qdrant/prometheus/prometheus.yml`
- Create: `ops/qdrant/prometheus/alerts.yml`
- Create: `ops/qdrant/grafana/provisioning/datasources/prometheus.yml`
- Create: `ops/qdrant/grafana/provisioning/dashboards/qdrant.yml`
- Create: `ops/qdrant/grafana/dashboards/qdrant.json`
- Modify: `docker-compose.infra.yml`
- Create: `docs/operations/qdrant-self-hosted.md`

**Interfaces:**

- Prometheus scrapes `http://qdrant:6333/metrics?per_collection=true` with the read-only key.
- Grafana reads Prometheus and binds to loopback only.

- [ ] **Step 1: Add Prometheus and Grafana services**

Use `prom/prometheus:v3.11.3` and `grafana/grafana:12.4.0`. Bind Prometheus to `127.0.0.1:9090` and Grafana to `127.0.0.1:3005`, mount persistent named volumes, provision the read-only Qdrant credential from a secret file, and set bounded Prometheus retention to 15 days/5 GiB.

- [ ] **Step 2: Add scrape and alert configuration**

Create the eight alerts from the spec with exact `for` durations and severities. Add recording rules for Qdrant REST error ratio and p95 latency. Backup and restore age metrics may be exported by the snapshot tool as a Prometheus textfile mounted read-only.

- [ ] **Step 3: Provision the dashboard**

The JSON dashboard must include the minimum panels from the spec, an environment variable, a collection variable, and links to the Qdrant Web UI/runbook. Use no public sharing and no embedded secrets.

- [ ] **Step 4: Document secure operator access**

In `docs/operations/qdrant-self-hosted.md`, include:

```bash
ssh -L 6335:127.0.0.1:6335 -L 3005:127.0.0.1:3005 -L 9090:127.0.0.1:9090 megacampus-prod
```

Document Web UI `/dashboard`, read-only key use, bootstrap, verify, snapshot, restore drill, alert triage, and prohibition on public port exposure.

- [ ] **Step 5: Validate configurations**

```bash
docker run --rm --entrypoint /bin/promtool -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" prom/prometheus:v3.11.3 check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint /bin/promtool -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" prom/prometheus:v3.11.3 check rules /etc/prometheus/alerts.yml
docker compose -f docker-compose.infra.yml --env-file .env.production.example config --quiet
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ops/qdrant docker-compose.infra.yml docs/operations/qdrant-self-hosted.md
git commit -m "feat(qdrant): add self-hosted monitoring and alerts"
```

---

### Task 10: Documentation And Cloud Retirement

**Files:**

- Modify: `docs/quickstart.md`
- Modify: `.claude/docs/deployment-guide.md`
- Modify: `packages/course-gen-platform/src/shared/qdrant/README.md`
- Modify: `packages/course-gen-platform/src/shared/qdrant/COLLECTION_SETUP.md`
- Modify: `packages/course-gen-platform/src/shared/qdrant/UPLOAD-GUIDE.md`
- Modify: `.codex/project-index.md`

**Interfaces:**

- Produces one consistent self-hosted setup and operations narrative.

- [ ] **Step 1: Remove Cloud-first setup instructions**

Replace Cloud account/cluster/key creation with local/self-hosted bootstrap, exact pinned version, internal URLs, and secure key generation. Keep Qdrant Cloud only in a historical migration note stating it is no longer an active dependency.

- [ ] **Step 2: Update module documentation**

Document native BM25/IDF, alias/physical names, priority Formula Query, grouping semantics, strict indexes, and the absence of custom process-local BM25. Correct stale 1024D/collection-name examples encountered in touched Qdrant docs.

- [ ] **Step 3: Update deployment topology and project index**

Add Qdrant, Prometheus, Grafana, snapshot timer, and the operations runbook to deployment topology and stable navigation. Do not add stage history to `.codex/project-index.md`.

- [ ] **Step 4: Run documentation scans**

```bash
rg -n 'cloud.qdrant.io|your-cluster.*qdrant|Qdrant Cloud' docs/quickstart.md .env.production.example packages/course-gen-platform/.env.example packages/course-gen-platform/src/shared/qdrant .claude/docs/deployment-guide.md
rg -n 'getGlobalBM25Scorer|BM25Scorer' docs packages/course-gen-platform/src/shared/qdrant
```

Expected: only an explicitly labeled historical/deprecated Cloud note remains; no runtime custom-BM25 claim remains.

- [ ] **Step 5: Commit**

```bash
git add docs/quickstart.md .claude/docs/deployment-guide.md packages/course-gen-platform/src/shared/qdrant .codex/project-index.md
git commit -m "docs(qdrant): document self-hosted operations"
```

---

### Task 11: Local And Dev Acceptance Before Any Staging Mutation

**Files:**

- Modify only failing in-scope code/tests/docs discovered by acceptance.
- Create/update: `.codex/stages/mc2-jz6y0/artifacts/acceptance.md`.

**Interfaces:**

- Produces reproducible evidence that the implementation is deployable.

- [ ] **Step 1: Run the complete focused Qdrant test set**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant tests/unit/tools/qdrant tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts tests/unit/stages/stage5-generation/qdrant-search.test.ts
```

- [ ] **Step 2: Run pinned integration and restore gates**

Start the pinned local container, run `test:integration:ci`, the broad `qdrant.test.ts`, bootstrap/verify, snapshot/restore drill, then stop the container. Record exact counts and test totals in the acceptance artifact.

- [ ] **Step 3: Run repository gates**

```bash
pnpm type-check
pnpm build
scripts/orchestration/run_process_verification.sh
```

Expected: all exit 0.

- [ ] **Step 4: Run non-mutating dev preflight**

Validate rendered dev Compose, current server resources, image tags, and the planned source-document count. Do not recreate containers or alter data in this step.

- [ ] **Step 5: Ask for staging activation authorization**

Present the exact actions: start new Qdrant/monitoring services, bootstrap collection, run reindex, change active API/workers to local URL, install/enable snapshot timer, and run a document-backed smoke. Include rollback and estimated external effects. Stop before remote mutation until the user authorizes it.

- [ ] **Step 6: Commit the acceptance artifact**

If acceptance finds an in-scope defect, return to the owning task, add its regression test, fix it, rerun that task's checks, and commit the exact files there before continuing. Then commit the acceptance artifact:

```bash
git add .codex/stages/mc2-jz6y0/artifacts/acceptance.md
git commit -m "test(qdrant): record self-hosted acceptance evidence"
```

---

### Task 12: Authorized Staging Cutover, Observation, And Closeout

**Files:**

- Update: `.codex/stages/mc2-jz6y0/summary.md`
- Update: `.codex/handoff.md`
- Update: Beads epic/children.

**Interfaces:**

- Requires explicit user authorization obtained in Task 11.
- Produces live evidence, rollback state, and completed delivery.

- [ ] **Step 1: Snapshot and capture pre-change state**

Record active color, current application image SHAs, current Qdrant env hostnames without secret values, and source/reindex plan counts. The broken Cloud service has no snapshot dependency.

- [ ] **Step 2: Start self-hosted infrastructure and verify before wiring clients**

Start only `qdrant`, Prometheus, and Grafana. Pass `/readyz`, authenticated `/collections`, version `1.18.2`, Web UI tunnel, metrics scrape, and schema bootstrap/verify.

- [ ] **Step 3: Reindex the physical collection**

Run plan, execute, and verify for `course_embeddings_v1`. Do not cut over with unaccepted gaps. If gaps are caused by truly missing source files, record exact file IDs and ask for a product decision rather than marking them indexed.

- [ ] **Step 4: Recreate RAG-capable clients and run smoke**

Recreate staging API, main worker, and Stage 6 worker with `QDRANT_URL=http://qdrant:6333`. Prove no active container uses a Cloud hostname. Run one document-backed Stage 2 -> Stage 5/6 smoke and controlled CORE-vs-SUPPLEMENTARY ranking check.

- [ ] **Step 5: Activate backup timer and observe**

Create an off-host snapshot, run restore drill, enable the six-hour timer, verify Prometheus targets/alerts/Grafana, and observe errors/fallbacks for at least one normal smoke cycle.

- [ ] **Step 6: Roll back on any failed gate**

Before application cutover, rollback is stopping the new services. After cutover, restore prior application images/env, point clients back only if the prior endpoint is usable, or keep generation stopped with `RAG_INFRA_UNAVAILABLE`; never hide failure with empty RAG. Alias rollback is used for collection-version failures.

- [ ] **Step 7: Close orchestration state**

Run a read-only `docs_reviewer`, refresh Graphify locally, update the stage summary/handoff, close completed Beads children, and close `mc2-jz6y0` only when all acceptance criteria including live activation pass. If credentials or authorization remain unavailable, leave the activation child blocked and report the exact gate.

- [ ] **Step 8: Run canonical closeout and push**

```bash
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0
git pull --rebase
bd dolt push
git push
git status --short --branch
```

Expected: closeout passes and branch is up to date with origin.

---

## Plan Self-Review Mapping

| Spec requirement                            | Plan tasks                 |
| ------------------------------------------- | -------------------------- |
| pinned self-hosted runtime and security     | 1, 5, 6                    |
| native BM25/IDF                             | 1, 3, 4, 5                 |
| complete priority payload and Formula Query | 3, 4, 5                    |
| strict mode and filter-complete indexes     | 1, 2, 5                    |
| aliases and schema drift                    | 2, 7, 12                   |
| grouping/diversity                          | 4, 5                       |
| source-driven reindex                       | 7, 11, 12                  |
| S3 snapshots and restore drill              | 8, 11, 12                  |
| Prometheus/Grafana/alerts/Web UI            | 9, 12                      |
| docs and Cloud retirement                   | 10                         |
| no unauthorized staging mutation            | Global Constraints, 11, 12 |
| verification/closeout                       | 5, 11, 12                  |

No quantization, multi-node cluster, on-disk hot index, custom sharding, JWT RBAC, or language-specific sparse fields are implemented in this plan; they remain the explicit capacity-triggered defers from the design.
