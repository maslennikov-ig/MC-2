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

1. Phase 0: accepted. Fourteen-playbook baseline saved in
   `docs/career-playbook/2026-08-29-semantic-repetition-baseline.md`; at the measured 0.85 threshold,
   8/6,594 audience-view block pairs (0.12%) and 18/6,829 within-block paragraph pairs (0.26%) are
   too close.
2. Phase A: accepted. Canonical employee/manager/HR views contain 20/20/14 stored blocks, their
   union is all 27 ids, full persistence is unchanged, prompts receive explicit readers, and the
   viewer exposes full plus three audience tabs.
3. Phase B: accepted. `do_not_repeat` is canonical and model-independent, each real group target
   receives its own digest from generated shared-view blocks, and the final-only semantic
   block/paragraph gate uses `0.85`. Provider exhaustion is fail-closed and its accumulated costs
   survive to the failed playbook ledger.
4. Root acceptance and delivery remain: `pnpm type-check`, `pnpm test:unit`, dev delivery, one paid
   generation, reading all four views, exact-ID post-change metrics, cleanup, numeric Beads close
   reasons, graph refresh and stage closeout.

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
