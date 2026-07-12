# Self-hosted Qdrant setup

> Current runtime guidance. The former Qdrant Cloud proof-of-concept is retired: its test-only data was lost and must not be recovered or mutated. Rebuild the derived index from `file_catalog` and authoritative source files.

MegaCampus uses private, single-node Qdrant `1.18.2`. Images are pinned by tag and digest in Compose; `latest` and public listeners are unsupported. Applications connect through the stable alias `course_embeddings`; operators create versioned physical collections such as `course_embeddings_v1`.

## Local development

From the repository root, create a local secret file outside Git, set the variables described in `packages/course-gen-platform/.env.example`, and start the pinned service:

```bash
docker compose -f docker-compose.dev.yml up -d qdrant-dev

(
  set -eu
  key_file=${QDRANT_API_KEY_FILE:-./secrets/qdrant_api_key}
  test -r "$key_file"
  QDRANT_API_KEY=''
  IFS= read -r QDRANT_API_KEY <"$key_file" || test -n "$QDRANT_API_KEY"
  test -n "$QDRANT_API_KEY"
  export QDRANT_URL=http://127.0.0.1:6333 QDRANT_API_KEY
  trap 'unset QDRANT_API_KEY QDRANT_URL' EXIT
  pnpm --dir packages/course-gen-platform qdrant:bootstrap
  pnpm --dir packages/course-gen-platform qdrant:verify
)
```

Use `QDRANT_URL=http://qdrant-dev:6333` inside the Compose network and `http://127.0.0.1:6333` from the host. `client.ts` presence-checks raw `QDRANT_URL` and `QDRANT_API_KEY`; it does not read `QDRANT_API_KEY_FILE`. The subshell above loads the raw key without printing it and removes the exported values on exit. The loopback host port is for local/operator access only. Never expose Qdrant through nginx or bind its API, Web UI, or metrics to a public interface.

## Collection and retrieval contract

- Dense vector `dense`: Jina v3, 768 dimensions, Cosine, HNSW `m=16`, `ef_construct=100`.
- Sparse vector `sparse`: `modifier: idf`.
- Ingest and query use `Document` with `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`.
- Search is server-side dense + sparse prefetch, RRF, then Formula over `$score` for `document_weight`; there is no custom or process-local BM25 and no client-side fusion/boost.
- Strict mode requires indexes for `organization_id` (tenant), `course_id`, `document_id`, `chunk_id`, `level`, `chapter`, `section`, `has_code`, `has_formulas`, `has_tables`, `has_images`, and float `document_weight`.

Bootstrap and verification fail on incompatible schema or alias drift. Alias actions are atomic; application traffic never targets a physical collection name.

## Reindex and recovery

Plan, execute, and verify a rebuild from authoritative sources:

```bash
pnpm --dir packages/course-gen-platform qdrant:reindex:plan
pnpm --dir packages/course-gen-platform qdrant:reindex:execute
pnpm --dir packages/course-gen-platform qdrant:reindex:verify
```

Use deterministic resumable batches and verify tenant/course-filtered counts and retrieval before atomic alias cutover. Snapshots do not contain aliases. Restore Qdrant `1.18.2` snapshots into an isolated collection on Qdrant `1.18.2` with `priority=snapshot`, verify the probe, then recreate or switch the alias separately. Never restore over the active alias.

The complete security, monitoring, systemd, snapshot, restore, rollback, and Q12 authorization procedure is in [`docs/operations/qdrant-self-hosted.md`](../../../docs/operations/qdrant-self-hosted.md).

## First-party references

Checked 2026-07-12: [Qdrant 1.18.2](https://github.com/qdrant/qdrant/releases/tag/v1.18.2), [full-text/BM25](https://qdrant.tech/documentation/search/text-search/full-text-search/), [hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/), [indexing](https://qdrant.tech/documentation/manage-data/indexing/), [collections and aliases](https://qdrant.tech/documentation/manage-data/collections/), [snapshots](https://qdrant.tech/documentation/operations/snapshots/), and [security](https://qdrant.tech/documentation/security/).
