# Uploading document chunks to Qdrant

Stage 2 writes through the stable `course_embeddings` alias to private Qdrant `1.18.2`. The index is derived: authoritative file content and `file_catalog` metadata remain the source of truth.

Each point must include:

- named 768D Jina v3 `dense` vector;
- named `sparse` Qdrant `Document` with `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`;
- complete `organization_id`, `course_id`, `document_id`, `chunk_id`, hierarchy/content flags, `document_priority`, and numeric `document_weight` payload.

Do not generate sparse hashes or corpus statistics in the application. Qdrant owns IDF. Keep batching bounded and deterministic; retries must preserve stable point IDs and tenant/course isolation.

## Public write API

`uploadChunksToQdrant(embeddingResults, options)` accepts `EmbeddingResult[]`: each item contains an enriched chunk, one 768-dimensional `dense_vector`, and `token_count`. `UploadOptions` supports:

- `batch_size` (default 100; production callers keep it bounded);
- `collection_name` (default stable alias `course_embeddings`, or an explicit reindex target);
- `wait` (default `true`);
- `enable_sparse` (default `false`; the live Stage 2 phase explicitly sets `true` so native BM25 is written).

The function returns `{ points_uploaded, batch_count, duration_ms, success }`. An empty input is a successful zero-point no-op. Before the first upsert, all inputs are converted to deterministic document-scoped UUIDv8 point IDs and validated; any present `document_weight` must be finite and within `[0.5, 1.0]`, so a bad later item cannot leave an earlier partial batch.

`deleteChunksByDocumentId(documentId, collectionName?)` and `deleteChunksByCourseId(courseId, collectionName?)` perform filtered deletes with `wait: true`. `getCollectionStats(collectionName?)` returns point, indexed-vector, and segment counts. Application callers normally use the stable alias; reindex tooling alone supplies a physical target.

## Status and error semantics

When Supabase credentials are available, a successful upload attempts to set every unique source document to `vector_status='indexed'`, records its chunk count, and clears the previous error. A failed conversion/upsert attempts `vector_status='failed'` with the error and chunk count, then rethrows the upload error. Status-write failures are logged per document without hiding the Qdrant result; if Supabase is not configured, status writes are explicitly skipped with a warning.

Qdrant failures preserve available `status`, `data`, and the original `cause` on the rethrown error. Delete/stat helpers add operation context and rethrow. The live Stage 2 phase owns timeout, retry/backoff classification, progress updates, and the terminal job failure; the low-level upload API does not silently convert failures into an empty success.

Before upload, run `qdrant:verify`. For a full rebuild, use `qdrant:reindex:plan`, `qdrant:reindex:execute`, and `qdrant:reindex:verify`; do not improvise direct uploads or switch aliases before verification. Full operational instructions are in `docs/operations/qdrant-self-hosted.md`.

## Source links

- Public implementation and types: [`upload.ts`](./upload.ts) and [`upload-types.ts`](./upload-types.ts).
- Point identity, payload validation, and native sparse documents: [`upload-helpers.ts`](./upload-helpers.ts).
- Live Stage 2 timeout/retry caller: [`../../stages/stage2-document-processing/phases/phase-6-qdrant-upload.ts`](../../stages/stage2-document-processing/phases/phase-6-qdrant-upload.ts).
- Durable Stage 2 behavior: [`../../stages/stage2-document-processing/README.md`](../../stages/stage2-document-processing/README.md).
- Contract coverage: [`../../../tests/unit/shared/qdrant/upload-helpers.test.ts`](../../../tests/unit/shared/qdrant/upload-helpers.test.ts), [`../../../tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts`](../../../tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts), and [`../../../tests/integration/qdrant.test.ts`](../../../tests/integration/qdrant.test.ts).
