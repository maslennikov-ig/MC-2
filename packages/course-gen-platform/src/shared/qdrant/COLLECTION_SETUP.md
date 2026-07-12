# Qdrant collection setup

Use the stable alias `course_embeddings` over a versioned physical collection such as `course_embeddings_v1`. Application traffic never uses the physical name directly.

```bash
pnpm --dir packages/course-gen-platform qdrant:bootstrap
pnpm --dir packages/course-gen-platform qdrant:verify
```

The managed schema is:

- named `dense`: 768D Cosine, HNSW `m=16`, `ef_construct=100`;
- named `sparse`: native BM25 with `modifier: idf`;
- one shard, replication/write consistency 1;
- strict mode enabled, with bounded query/update/filter/batch limits;
- indexes: tenant keyword `organization_id`; keyword `course_id`, `document_id`, `chunk_id`, `level`, `chapter`, `section`; bool content flags; float `document_weight`.

Ingest and query share `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`. Query execution is dense+sparse prefetch → RRF → Formula using `$score` and `document_weight`.

For a schema change, create a new physical collection, rebuild deterministically from `file_catalog` and authoritative source files, verify tenant/course-filtered counts and RU/EN retrieval, then switch the alias atomically. Do not mutate an incompatible active collection in place.

Snapshots omit aliases. An exact-version `1.18.2` restore uses an isolated collection and `priority=snapshot`; verify it before separately recreating/switching an alias. See `docs/operations/qdrant-self-hosted.md` for the complete recovery and rollback procedure.
