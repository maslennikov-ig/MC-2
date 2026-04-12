# RAG Fail-Fast Design

Date: 2026-04-12
Owner: Codex
Bead: `mc2-ndy7w`

## Goal

Stop silent degradation when Qdrant is unavailable for courses that have uploaded documents and therefore require RAG. In those cases the pipeline must fail immediately, mark the run as an infrastructure error, and send exactly one Telegram alert for the run.

## Problem

The current implementation treats several Qdrant failures as soft degradation:

- Stage 5 job input can fall back to `hasVectorizedDocs = false` after a failed `file_catalog` query.
- Stage 5 Section RAG can return an empty result when RAG should have been mandatory.
- Stage 6 Lesson RAG can return an empty result when RAG should have been mandatory.
- Document-availability checks currently assume documents exist on query errors, which is correct for avoiding false-negative skips, but does not turn the failure into a hard stop.

That behavior is acceptable only for courses without uploaded documents. It is not acceptable when the user explicitly provided source documents and expects document-grounded generation.

## Product Policy

### When RAG is required

RAG is required only when the course has uploaded documents.

Practical rule:

- no uploaded documents -> title-only / non-document flow may continue without Qdrant
- uploaded documents exist -> Qdrant availability becomes a hard prerequisite for Stage 5 and Stage 6

### Notification policy

If RAG is required and unavailable:

- fail immediately
- send one Telegram alert per course run
- do not spam Telegram on every retry or per-lesson failure

## Recommended Approach

Use a centralized RAG execution policy rather than scattered local patches.

### Why

- one source of truth for “RAG required vs optional”
- one place to distinguish “no documents” from “documents exist but Qdrant is broken”
- one place to issue a deduplicated Telegram alert
- less risk of Stage 5 and Stage 6 drifting apart again

## Architecture

### 1. Centralized RAG preflight helper

Introduce a shared helper that answers:

- does this course have uploaded documents?
- are indexed documents available?
- is Qdrant reachable?
- is `course_embeddings` reachable?
- should the caller continue, skip RAG, or fail hard?

Expected outcomes:

- `rag_optional_no_documents`
- `rag_ready`
- `rag_required_unavailable`

### 2. Stage 5 input path

`buildDocumentSummaries(...)` must stop treating database/Qdrant-related failures as “assume no documents” when the course has uploaded files.

Behavior:

- no uploaded files -> return `hasVectorizedDocs = false`
- uploaded files + RAG ready -> return vectorized document summaries
- uploaded files + RAG unavailable -> throw a typed infrastructure error

### 3. Stage 5 and Stage 6 runtime retrieval

Both retrieval layers must respect the same policy:

- no uploaded files -> empty RAG result is valid
- uploaded files + Qdrant unavailable -> throw hard error, do not return empty result

This prevents “preflight passed once, Qdrant died later, pipeline kept going silently”.

### 4. Deduplicated Telegram alert

Reuse the existing course notification path instead of inventing a second alerting channel.

Behavior:

- on `rag_required_unavailable`, call the existing course error notifier
- dedupe by course run / stage run so retries do not emit repeated Telegram messages

The message should explicitly say that document-grounded generation was stopped because RAG/Qdrant is unavailable.

## Error Semantics

Introduce a typed infra error for this case, for example:

- code/category: `RAG_INFRA_UNAVAILABLE`
- human message: `RAG is required for this course, but Qdrant is unavailable`

This error should be handled as infrastructure failure, not as quality failure and not as “course has no documents”.

## Best-Practice Decisions

### Keep non-document courses working

We should not force Qdrant for courses that legitimately have no uploaded documents. That would turn a targeted hardening into unnecessary platform coupling.

### Fail at both boundaries

Only failing at startup is insufficient. Distributed systems fail mid-run. The runtime retrievers must still enforce the policy.

### Prefer one contract over repeated booleans

Instead of re-encoding the same logic in multiple places, use one shared result type and one decision helper.

## Testing Strategy

### Unit tests

- course without uploaded documents -> optional/no-fail path
- course with uploaded documents and healthy Qdrant -> ready path
- course with uploaded documents and failed availability/query/Qdrant check -> hard fail
- duplicate retries for same run -> single Telegram alert

### Regression tests

- Stage 5 does not silently downgrade document-backed generation to non-RAG
- Stage 6 does not silently return empty retrieval when RAG was mandatory

## Out of Scope

- changing title-only generation behavior
- redesigning Telegram infrastructure globally
- recovering specific broken courses in this change
- altering model ladder policy

## Rollout Notes

After code is in place, Dev verification should include:

- course with uploaded documents + healthy Qdrant -> normal Stage 5/6 generation
- simulated Qdrant outage -> hard failure + one Telegram alert
- course without uploaded documents -> still allowed to run
