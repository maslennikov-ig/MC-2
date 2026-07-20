# Qdrant runtime module

This module implements private self-hosted Qdrant `1.18.2` access with exact client `@qdrant/js-client-rest` `1.18.0`. The retired hosted proof-of-concept is not a supported target.

## Contract

- `config.ts` defines alias `course_embeddings`, versioned physical names, and the single native multilingual BM25 `Document` factory.
- `collection-schema.ts` defines 768D Cosine dense vectors, sparse `modifier: idf`, strict mode, tenant/filter indexes, and float `document_weight`.
- `collection-manager.ts` bootstraps and verifies schema, physical collections, and atomic alias actions.
- Upload helpers preserve the complete payload and send Qdrant-native sparse documents; no custom/process-local BM25 remains.
- Search sends dense + sparse prefetch to server RRF, then Formula over `$score`; no client-side fusion or priority mutation remains.

Required BM25 options are identical at ingest and query: `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`.

## Security and names

Runtime services receive `QDRANT_URL` on the private Docker network and a file-injected API key. Never expose port 6333, the dashboard, or `/metrics` publicly. Applications use the stable alias; only bootstrap/reindex/recovery tools target physical names.

## Commands

These host-pnpm commands are for a checked-out local-development repository and
the isolated dev Qdrant only. Staging/production must use the digest-pinned
container operator documented in `docs/operations/qdrant-self-hosted.md`.

```bash
pnpm --dir packages/course-gen-platform qdrant:bootstrap
pnpm --dir packages/course-gen-platform qdrant:verify
pnpm --dir packages/course-gen-platform qdrant:reindex:plan
pnpm --dir packages/course-gen-platform qdrant:reindex:execute
pnpm --dir packages/course-gen-platform qdrant:reindex:verify
pnpm --dir packages/course-gen-platform qdrant:snapshot
pnpm --dir packages/course-gen-platform qdrant:restore-drill
```

See [`COLLECTION_SETUP.md`](./COLLECTION_SETUP.md), [`UPLOAD-GUIDE.md`](./UPLOAD-GUIDE.md), and the operator runbook at `docs/operations/qdrant-self-hosted.md`.
