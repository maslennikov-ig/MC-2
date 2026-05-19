# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `codex/career-playbook-jd-bridge`
Base branch: `codex/career-playbook-generation-status` stacked on PR #35

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open and stacked; avoid retargeting dependent work to `develop` until upstream PRs land.
- `mc2-db696.9` is implemented on this branch: completed Career Playbooks can be converted into draft courses with synthetic markdown sources, optional persisted/fresh web research, and immediate generation initiation.
- Review fixes for `mc2-db696.9` are included: rollback on initiation failure, persisted web research reuse, bridge rate limiting, physical synthetic file cleanup, real role-profile schema mapping, and removal of the disabled pre-upload action.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.9` - JD to Course bridge.
- Stage summary: [`.codex/stages/mc2-db696.9/summary.md`](./stages/mc2-db696.9/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.9/artifacts`](./stages/mc2-db696.9/artifacts)
- Key verification: backend targeted unit 41 passed, frontend targeted unit 8 passed, artifact validation passed, `pnpm type-check` passed, `pnpm lint` passed with existing warnings, `pnpm build` passed with required local Supabase test env, process verification passed, browser smoke on isolated port 3100 passed.

## Next recommended

Next delivery action: push `codex/career-playbook-jd-bridge` and open a stacked PR targeting `codex/career-playbook-generation-status`.

Next stage id: `mc2-db696.11`
Recommended action: after the JD bridge PR is open, start Phase 11 live tests/smoke/staging verification only with explicit environment/auth readiness. This is the right place for wizard -> generation -> viewer/PDF/share -> create course E2E.

- If upstream stacked PRs land first, rebase/retarget before more dependent work.
- Independent marketing work may proceed separately if its base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.9/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify the stacked PR status, and avoid dependent work on develop unless upstream PRs have merged.
```

## Explicit defers

- Pre-course user upload in the JD bridge modal remains deferred; current upload flow requires an existing course ID.
- Full live Supabase/Redis/staging E2E remains in `mc2-db696.11`; local TOKEN was not available in this stage.
- Reusing the full Stage 1 upload service for trusted generated markdown remains deferred; the direct `file_catalog` pending-source path is documented and covered by tests for MVP.
