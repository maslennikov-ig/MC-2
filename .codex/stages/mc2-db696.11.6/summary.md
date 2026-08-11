# Stage mc2-db696.11.6 — Career Playbook 10-concurrent load test

Status: accepted
Branch: `codex/career-playbook-load-test`
Base: `develop` @ `40fbaed28`

The isolated dev run completed all ten main Career Playbook generations. Worker pickup spread was
1,359 ms, readiness remained live for the whole run, total measured cost was USD 1.19633817, and
the maximum single-run cost was USD 0.160969265. Both approved ceilings were respected.

The original observer lost one result when the disposable access token expired after about an
hour; server state proved the job had continued and completed. A refreshed resume read captured
the tenth artifact without another generation. The load client now refreshes Supabase auth once
on HTTP 401 and retries the affected tRPC operation.

All ten separate best-effort image jobs exposed an OpenAI SDK/JSDOM configuration defect while the
main playbooks remained completed. The server image client now uses the same explicit
browser-like-Node allowance as the text client. Focused coverage passes 12/12.

Exact fixture cleanup passed: the disposable auth/public user, organization, ten playbooks,
job/error rows, queue state, courses, files, and Qdrant vectors all have zero residue.

Documentation: docs-resolve used lockfile versions `@supabase/supabase-js@2.87.2` and
`@trpc/client@11.9.0`; L1 was floating/insufficient, so Context7 supplied the official
`refreshSession` and per-request dynamic-header contracts.

docs-reviewed: updated — the live-smoke runbook now documents refresh-token handling and the
ten-run load boundary.

project-index: updated — the stable load-plan entrypoint is indexed.

graph-reviewed: updated — Graphify 0.9.14 local code graph rebuilt without external semantic
backends to 61,733 nodes, 88,850 edges, and 7,352 communities.

Documentation: no new external/versioned behavior; the implementation reuses repository-owned Career Playbook smoke and BullMQ queue-state patterns.
