# Stage mc2-1786710715922-25-db11a6c5 — Role Guide audiences and repetition

Date: 2026-08-29

Status: in progress

Level: integration

Branch: `codex/role-guide-audiences`

Base: `develop` at `9250c1be9a26e196b5809fa95038731919360826`

## Outcome boundary

Deliver one generated Role Guide as three complete audience-specific views plus the unchanged full
document, then make semantic repetition measurable and enforceable only within a view. This single
stage closes `mc2-1786710715922-25-db11a6c5` and `mc2-1786710716114-26-01631777`.

## Ordered work

1. Phase 0: save a fourteen-playbook semantic baseline in `docs/` before production-code changes.
2. Phase A: add canonical audience data, on-the-fly view assembly, audience-aware prompts, and four
   viewer tabs.
3. Phase B: derive `do_not_repeat` and prior-block context from shared-view membership, then add a
   threshold calibrated from phase 0.
4. Final acceptance: one paid dev generation, root reading of all three views, post-change metrics,
   `pnpm type-check`, `pnpm test:unit`, delivery to `develop`, and numeric Beads close reasons.

## Boundaries

- No schema migration, reindex, secret/access change, force-push, or canonical block/topic change.
- Audience checkmarks remain exactly as proposed in spec section 3 unless a measured empty or
  incoherent view forces a stop and owner decision.
- Paid Jina measurements and one paid dev generation are authorized. A second paid dev generation is
  still a stop condition.
- `docs` source: L1 was missing for `@radix-ui/react-tabs@1.1.13`; Context7 answered from the official
  Radix Tabs documentation and the answer was persisted into L1.
- `graph-reviewed: used` — Graphify 0.9.45 report plus focused Career Playbook query used as stale
  orientation; every changed file will be confirmed in the current worktree, and the graph refreshes
  only at accepted integration closeout.
