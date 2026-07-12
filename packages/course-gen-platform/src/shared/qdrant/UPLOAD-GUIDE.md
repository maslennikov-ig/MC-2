# Uploading document chunks to Qdrant

Stage 2 writes through the stable `course_embeddings` alias to private Qdrant `1.18.2`. The index is derived: authoritative file content and `file_catalog` metadata remain the source of truth.

Each point must include:

- named 768D Jina v3 `dense` vector;
- named `sparse` Qdrant `Document` with `model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`, `k=1.2`, `b=0.75`, `avg_len=256`;
- complete `organization_id`, `course_id`, `document_id`, `chunk_id`, hierarchy/content flags, `document_priority`, and numeric `document_weight` payload.

Do not generate sparse hashes or corpus statistics in the application. Qdrant owns IDF. Keep batching bounded and deterministic; retries must preserve stable point IDs and tenant/course isolation.

Before upload, run `qdrant:verify`. For a full rebuild, use `qdrant:reindex:plan`, `qdrant:reindex:execute`, and `qdrant:reindex:verify`; do not improvise direct uploads or switch aliases before verification. Full operational instructions are in `docs/operations/qdrant-self-hosted.md`.
