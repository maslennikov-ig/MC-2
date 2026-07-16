---
schema_version: orchestration-artifact/v1
artifact_type: independent-docs-review
task_id: mc2-jz6y0.13.19
stage_id: mc2-jz6y0
review_target: D6 `.13.19` integration documentation slice (handoff, stage summary, D6 artifact)
reviewer: claude fable-5 (independent docs reviewer, read-only)
review_date: 2026-07-16
repo: /home/me/code/mc2
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
branch: codex/self-hosted-qdrant-platform
integration_head: 3d70eaf233b13056fac68b86f9be5b191459641a
reviewed_files:
  - .codex/handoff.md (modified)
  - .codex/stages/mc2-jz6y0/summary.md (modified)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md (new)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-probe-stream-review.md (reference)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-root-stream-review.md (reference)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-field11-ratification-review.md (reference)
verdict: FAIL
scores_p0_p1_p2_p3: '0/1/4/1'
---

# Summary

**FAIL** — 0 P0, 1 P1, 4 P2, 1 P3.

Every load-bearing _fact_ in the D6 documentation slice verified true: all named
commit SHAs exist with roles matching their descriptions, every named file
exists at its named path, all four cheaply-reproducible hashes reproduce
byte-exactly, and the D6 test counts are internally consistent across the
handoff, summary, and artifact. The D6 artifact (`…13.19-q12-d6.md`) and the
handoff's D6/field-11 sections tell an accurate, mutually consistent story.

The FAIL is entirely a **staleness / cross-document consistency** problem, not a
factual-accuracy or code/behavior problem: the **stage summary's current-state
header banner (`summary.md:3/6/8`) was never refreshed for the D6 integration**.
Its `Status:` line still declares D6 `.13.19` and Root `.13.13` "blocked
explicit defers on the live-only W-tuple field 11" with "remote/live activation
remains NO-GO," and its "Current accepted integration evidence: integration HEAD
`a73a3651`" is one integration behind the real HEAD `3d70eaf2`. Two handoff
lines carry the same stale framing. These directly contradict the merged reality
and the newer 2026-07-16 summary section, so a reader who trusts the summary
banner would conclude D6 is still blocked. All findings are fixable by editing a
handful of lines; no fact needs to change.

## What verified clean (no findings)

- **Commit SHAs** (all exist, roles match): `72af414c` (field-11 ratification),
  `7f511691` (D6 Stream 1 / DB probe merge), `3d70eaf2` (D6 Stream 2 / Root
  coordinator merge — and the current HEAD), `60910053` (W FLIP), plus
  `a73a3651`, `66e41cb5`, `70bf6103`. `3d70eaf2` is a descendant of both
  `a73a3651` and `72af414c`; the D6 stream commit chain (RED→GREEN TDD) is
  present under the `3d70eaf2` merge.
- **Hashes reproduced byte-exact**: contract `tail -c 47092` =
  `2a2251ac…aae5`; `sha256(deploy/qdrant/q12-command-manifest.json)` =
  `aaec6fc2…a841`; `sha256(deploy/qdrant/q12-activation-truth-projection.sql)`
  = `36d28034…332af`; canonical NFC sorted-key inventory hash reproduced
  independently = `c90edb78…bac6` (14 identities), matching the pin test
  `q12-managed-session-inventory.test.ts:18` and confirming field 11 is 11/11.
- **File paths**: all eight D6 changed files, the inventory + two pin tests, the
  D6 contract/plan, the full-completion spec/plan, the orchestrator prompt, and
  all four `.13.19-*` artifacts exist at their named locations.
- **Runbook**: `docs/operations/qdrant-self-hosted.md` contains no D6
  contradiction — its "probe" references are the restore-drill `probe.json`, not
  the D6 activation-truth probe. D6 adds no command/systemd/cron by design and
  the runbook correctly needs no D6 mention now (that is C7/live-window scope).
- **Handoff budget & structure**: 197 lines (≤200); the "Starter prompt for next
  orchestrator" section (lines 132–142) is intact.
- **Script-derived hashes not re-executed** (documented cross-check only):
  cross-language canonical parity `764d1b37…` and field-7 recovery slice
  `c41cf104…` are consistent across the artifact and summary but require the
  PG17/runtime repro scripts to re-derive; not a finding, noted as a review
  limitation. Likewise the PG17-gated suite counts (80/80, 337/337, 424/424,
  913/914, 75/75, 5/5) were cross-checked for documentary consistency across all
  three docs rather than re-run.

# Findings

| id  | severity | confidence | file:line                                    | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | ---------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | P1       | high       | `.codex/stages/mc2-jz6y0/summary.md:3`       | The summary's headline `Status:` banner still says D6 `.13.19` and Root `.13.13` "are blocked explicit defers on the live-only W-tuple field 11; remote/live activation remains NO-GO." This is a **non-historical current-state banner** that flatly contradicts the merged reality: D6 is integrated at HEAD `3d70eaf2`, field 11 is ratified 11/11, and the newer 2026-07-16 summary section (lines 498–535) plus the handoff both say so. A reader trusting the banner concludes D6 is still blocked. |
| F2  | P2       | high       | `.codex/stages/mc2-jz6y0/summary.md:6`       | "Current accepted integration evidence: integration HEAD `a73a3651`" is stale. The real integration HEAD is `3d70eaf2` (descendant of `a73a3651`), which carries the two D6 stream merges (`7f511691` + `3d70eaf2`) and the field-11 ratification (`72af414c`). Labelled "Current," so it should name `3d70eaf2`.                                                                                                                                                                                         |
| F3  | P2       | high       | `.codex/stages/mc2-jz6y0/summary.md:8`       | "Implementation scope … The remaining Q12 tail is remote/live only: … field-11/RE-FREEZE + D6 + Root in the live window" is stale. Field 11 is ratified locally and D6 is integrated locally; only the fields-5/6/8/9 re-freeze (Task C7) is live-window, and Root `.13.13` join is the next **local** implementation stream, not a live-window item.                                                                                                                                                     |
| F4  | P2       | high       | `.codex/handoff.md:51`                       | "Root `.13.13` is blocked on the live-only tuple field 11." Stale/internally contradictory: field 11 is ratified, and the same handoff elsewhere (lines 87–93 "now 11/11", 120 "Root `.13.13` join local acceptance … next", 167–170) treats `.13.13` as the next local implementation stream, not blocked.                                                                                                                                                                                               |
| F5  | P2       | high       | `.codex/handoff.md:189-191`                  | The `docs-reviewed: updated` closeout footer describes "the frozen D6 contract/plan, the 10/11 tuple, … and the blocked live tail" — the pre-D6 (a73a3651) state. It was not refreshed for the 2026-07-16 D6-integration update declared in the file's own header (line 3). Should read implemented/integrated D6, 11/11 tuple, and the D6-integrated / Root-`.13.13`-next tail.                                                                                                                          |
| F6  | P3       | medium     | `.codex/stages/mc2-jz6y0/summary.md:475-480` | The dated 2026-07-15 section says "D6 `.13.19` BLOCKED as an explicit defer." This is inside a clearly dated, superseded historical block (the 2026-07-16 section that follows corrects it), so it is acceptable as history — but a one-line "(superseded 2026-07-16, see below)" pointer would remove any risk of a reader stopping at the older block. Optional.                                                                                                                                        |

# Verification (per required check)

- **Check 1 — Factual accuracy: PASS.** All commit SHAs, all four
  cheaply-reproducible hashes, and every named file path verified against the
  repo (details under "What verified clean"). D6 test counts are consistent
  across artifact/summary/handoff. Integration HEAD is `3d70eaf2`. No named
  SHA or hash was unverifiable; script-derived hashes/PG17-gated counts were
  cross-checked documentarily rather than re-executed (noted limitation).
- **Check 2 — handoff vs summary vs artifact consistency: PARTIAL / FAIL.** The
  handoff D6/field-11 sections and the D6 artifact agree (field 11 11/11; D6
  integrated at `3d70eaf2`; re-freeze reduced to fields 5/6/8/9 at C7; `.13.13`
  next; remote gates unchanged). The **summary header (F1/F2/F3)** and two
  **handoff lines (F4/F5)** contradict that shared story.
- **Check 3 — no stale contradiction outside historical sections: FAIL.**
  F1–F5 are stale "blocked / live-only field 11 / 10/11 / integration HEAD
  a73a3651" claims in non-historical (current-state) locations. F6 is the sole
  instance inside a dated historical block and is acceptable.
- **Check 4 — runbook impact: PASS.** No operations doc claims anything D6
  contradicts; D6 adds no command/systemd/cron and needs no runbook mention
  before C7/live time.
- **Check 5 — handoff ≤200 lines, current-state-only, starter-prompt intact:
  PASS with exception.** 197 lines; the "Starter prompt for next orchestrator"
  section is present and intact. The current-state-only property is violated
  only by the stale F4/F5 lines.

# Risks / Follow-ups

- **Fix before push (removes the FAIL):** refresh the summary header block
  `summary.md:3` (Status → D6 integrated at `3d70eaf2`, field 11 ratified 11/11,
  Root `.13.13` local join next; only C7 re-freeze + remote/live tail remain
  NO-GO), `:6` (integration HEAD → `3d70eaf2`), and `:8` (drop field-11/D6 from
  the "remote/live only" tail); and correct `handoff.md:51` (Root `.13.13` is
  next local stream, not blocked) and `handoff.md:189-191` (docs-reviewed footer
  → integrated D6 / 11/11 tuple / D6-integrated tail). Optionally add the F6
  forward pointer.
- These are pure documentation edits with no code, security, or behavior impact.
  All underlying facts (SHAs, hashes, paths, counts) are correct and need no
  change.
- Re-review is not required for the fixes themselves (mechanical wording), but a
  quick self-check that the summary banner and handoff footer match the
  handoff's D6 sections is advised before push.

# Re-verification (2026-07-16, post-fix)

**Updated verdict: PASS** — 0 P0, 0 P1, 0 P2, 1 P3 (F6, accepted as history).

All five actionable findings were fixed exactly and re-verified against the
current worktree; no regression or new contradiction was introduced, and the
handoff remains 197 lines (≤200).

- **F1 — RESOLVED** (`summary.md:3`): Status banner now reads "D6 `.13.19` is
  implemented and integrated at `3d70eaf2` on the ratified 11/11 W tuple (field
  11 ratified `72af414c`); Root `.13.13` join is the next local stream;
  remote/live activation remains NO-GO until the owner-gated window." No
  "blocked explicit defers" phrasing remains anywhere in the summary.
- **F2 — RESOLVED** (`summary.md:6`): now "integration HEAD `3d70eaf2` (D6
  merges `7f511691`+`3d70eaf2`, field-11 ratification `72af414c`) on top of
  `a73a3651`…" — the true HEAD is named and `a73a3651` is correctly framed as
  the base it sits on.
- **F3 — RESOLVED** (`summary.md:8`): scope now lists field-11 ratification and
  D6 `.13.19` (plus `.13.7` delivered) as accepted; the remaining tail is Root
  `.13.13` join (local) → GHCR → live-cutover window (incl. C7 re-freeze) →
  `.13.8`/`.13.6`. Matches the handoff "Next recommended".
- **F4 — RESOLVED** (`handoff.md:51`): now "Root `.13.13` is unblocked by the
  D6 integration and is the next local stream." No `.13.13`-blocked phrasing
  remains.
- **F5 — RESOLVED** (`handoff.md` docs-reviewed footer): rewritten for the D6
  slice ("the D6 integration, ratified 11/11 tuple, review lineage, and the
  next-step Root `.13.13` join now match Beads, the stage summary, and the D6
  artifact"). No stale "10/11 tuple" / "frozen D6 contract/plan" / "blocked
  live tail" wording remains in the footer. (The single `frozen D6 contract/plan
docs d1627f1c` mention at `handoff.md:10` is the historical description of the
  base commit's contents and is correct, not stale.)
- **F6 — unchanged / accepted** (`summary.md:475-480`): "D6 BLOCKED" remains
  inside the dated 2026-07-15 historical block, superseded by the 2026-07-16
  section; acceptable as history per the original review.

No factual re-checks were needed (all SHAs/hashes/paths/counts were verified
true in the initial review and were not touched by the fixes). The slice is
clear to push.
