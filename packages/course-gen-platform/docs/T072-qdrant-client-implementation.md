# Qdrant client implementation

> Current implementation note. T072 originally targeted a hosted proof-of-concept; that runtime guidance is superseded by private self-hosted Qdrant `1.18.2`.

The backend uses exact `@qdrant/js-client-rest` `1.18.0`. `src/shared/qdrant/client.ts` owns the singleton client; environment parsing rejects public/external Qdrant URLs in supported Compose deployments. Runtime secrets are injected from untracked files and must never be committed or printed.

## Names and schema

- Logical alias: `course_embeddings` (`QDRANT_COLLECTION_NAME`).
- Versioned physical collection: `course_embeddings_v1` or the explicit `QDRANT_PHYSICAL_COLLECTION_NAME`.
- Dense vector: named `dense`, 768-dimensional Cosine.
- Sparse vector: named `sparse`, Qdrant-native BM25 with collection-side IDF.
- Strict indexes include tenant `organization_id`, course/document/chunk filters, content flags, and float `document_weight`.

Applications read and write only through the alias. Bootstrap/reindex tooling owns physical names and atomic alias actions.

## Write path

Every point contains the complete tenant/course/document/chunk payload and both vectors. The sparse value is a Qdrant `Document` using the shared options `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`. Runtime code has no custom sparse hash vocabulary or process-local corpus statistics.

## Query path

The server receives dense and sparse prefetches, fuses them with RRF, and nests that result in Formula Query using `$score` and the indexed `document_weight`. Required organization/course filters are applied inside Qdrant. The application does not fuse or boost scores client-side. Optional grouping by `document_id` is enabled only by genuinely live Stage 5/6 callers.

## Operations

```bash
pnpm --dir packages/course-gen-platform verify:qdrant
pnpm --dir packages/course-gen-platform qdrant:bootstrap
pnpm --dir packages/course-gen-platform qdrant:verify
```

See [`qdrant-setup.md`](./qdrant-setup.md), the module [`README.md`](../src/shared/qdrant/README.md), and [`docs/operations/qdrant-self-hosted.md`](../../../docs/operations/qdrant-self-hosted.md) for reindex, snapshots, monitoring, systemd, rollback, and the Q12 remote-activation boundary.
