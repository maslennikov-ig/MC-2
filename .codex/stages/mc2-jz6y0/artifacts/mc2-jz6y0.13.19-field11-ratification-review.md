---
schema_version: orchestration-artifact/v1
artifact_type: independent-correctness-review
task_id: mc2-jz6y0.13.19
stage_id: mc2-jz6y0
agent_type: correctness-reviewer
subagent_model: claude-fable-5
repo: mc2
branch: codex/self-hosted-qdrant-platform-plan
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
review_target: deploy/qdrant/q12-managed-session-inventory.provisional.json
review_authority: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md (section "Exact managed-provider and session projection", lines 255-283)
risk_level: high
access_mode: read-only
verdict: PASS
findings_by_severity:
  P0: 0
  P1: 0
  P2: 1
  P3: 2
recomputed_canonical_hash: c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6
base_branch: codex/self-hosted-qdrant-platform
base_commit: 1535a56b9699c6ed247467b6eb30800ff7bd34ff
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: read-only review; single artifact write; no workspace to clean
verification:
  - 'canonical hash recomputed c90edb78… matches; contract tail-hash 2a2251ac… verified; checklist 1-8 PASS'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-field11-ratification-review.md
explicit_defers:
  - 'none beyond the findings recorded in the review body'
---

# Summary

See the review body below; verdict and severity counts are in the frontmatter/body.

# Verdict: PASS

The provisional managed-session inventory
`deploy/qdrant/q12-managed-session-inventory.provisional.json` is ratifiable on
every mechanical, structural, schema, sort, and canonical-hash criterion of the
frozen D6 contract's managed-session projection. The canonical hash reproduces
byte-exactly. No P0/P1 defect exists. Three advisory findings (one P2, two P3)
concern determination semantics and evidence durability that were already
declared "PENDING independent review" by the freezing commit; none falsifies the
inventory, invents an identity, or alters canonical bytes. Per the tasking, all
findings are reported without pre-filtering.

## Preconditions (all verified before review)

| Check                                               | Result                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Contract tail-hash `tail -c 47092 ... \| sha256sum` | `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5` — MATCHES tasking |
| Frozen schema (field 10) sha256                     | `f2bb0bee394111073a86e421bc11470531880c6ce0c0933a436080eaab6dd56d` — MATCHES tasking |
| Provisional file present                            | yes (4148 bytes)                                                                     |
| Target artifact pre-existing                        | no (no overwrite)                                                                    |

## Findings

| id  | severity | confidence | evidence (file:line)                                                                               | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------- | ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | P2       | medium     | q12-managed-session-inventory.provisional.json:94-111 ; .13.14 boundary:112-113 ; contract:281,283 | `transaction_free_required=false` on the two `supabase_admin` managed client identities (id10 empty-app client backend; id11 `postgres_exporter`) — and on the other non-probe clients (id5 `postgrest`, id6 `Supavisor (auth_query)`, id7 `Supavisor`) — is a determination that a downstream consumer must reconcile with two upstream statements: (a) `.13.14` says managed `supabase_admin` clients are "accepted only when idle and transaction-free"; (b) contract :281 makes `transaction_free_required` a drift gate ("a required transaction-free predicate that is false stop as drift"). Under the drift-gate reading, `false` means an open transaction on id10/id11 would NOT trip the projection drift gate, weakening the `.13.14` guarantee at the projection layer. A coherent alternative reading exists (the field is descriptive "is-this-a-stateless-background-row" metadata and the idle+txfree acceptance is enforced by separate barrier termination logic), which is why this is a semantic-consistency flag, not a byte error. Related: id5/id7 `allowed_states` permit `idle in transaction` (lines 50, 68) while id6/id10/id11 do not — an internally defensible but determination-heavy asymmetry. |
| F2  | P3       | low        | commit 5836927e (2 files only: tuple artifact + provisional json) ; .13.10 tuple:64,106-116        | Traceability of the 13 observed identities rests on the commit-message narrative + the summarized inventory + count arithmetic (13 observed + 1 probe = 14, which matches), NOT on re-verifiable primary bytes: the three `pg_stat_activity` samples are not tracked in the repo. This is by construction of the LIVE-BOUNDARY gate (values unknowable pre-live), so it is an evidence-durability note, not a fail — but a future agent must not treat the roster as independently re-derivable from tracked bytes without a fresh owner-authorized live read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F3  | P3       | low        | q12-managed-session-inventory.provisional.json:3-48 vs 85-93,112-129                               | Background-worker role attribution asymmetry: core postmaster children (archiver/autovacuum launcher/background writer/checkpointer/walwriter, id0-4) carry `role=""`, whereas `logical replication launcher` (id9), `pg_cron launcher` (id12), and `pg_net 0.19.5 worker` (id13) carry `role="supabase_admin"`. This is plausible (extension/logical background workers registered by `supabase_admin` inherit that owner while core children have no `usename`) and actually strengthens the observed-not-invented case, but a downstream reviewer should confirm PG17 `pg_stat_activity` genuinely reports `usename=supabase_admin` for the logical replication launcher on this project (some PG builds report NULL for it). Non-blocking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Checklist results (1-8)

1. **Top-level keys / scalars / schema_version — PASS.** Parsed keys exactly `{database, identities, project_ref, provider_plane_trusted, schema_version, source_decision_sha256}`. `project_ref='diqooqbuchsliypgwksu'`, `database='postgres'`, `source_decision_sha256='7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27'`, `provider_plane_trusted=true` (JSON boolean). `schema_version='megacampus.q12.managed-session-inventory/v1'` equals the frozen schema's `schema_version`. All scalars equal the schema `fixed_scalars`.
2. **Identity keys / sort / no observation keys — PASS.** All 14 identities carry exactly the seven keys `{role, database, backend_type, application_identity, client_class, allowed_states, transaction_free_required}`; no `pid/backend_start/xact_start/xid/xmin`. Programmatic check: identities are strictly byte-ascending on the first five fields `(role, database, backend_type, application_identity, client_class)`; no duplicate first-five tuple (no identity-collapse ambiguity).
3. **allowed_states literals — PASS.** Every non-`none` literal is one of the lowercase set `{active, idle, idle in transaction, idle in transaction (aborted)}`; no invented literal. `none` appears only as `["none"]` and only on the eight stateless background rows (id0-4, id9, id12, id13); never mixed with real states; never on a client backend.
4. **client_class vocabulary — PASS (with F1 note).** Only the five allowed classes appear (`provider-background`, `provider-client`, `application-client`, `controller-client`, `probe`). Each identity's class matches its role/backend_type and the `.13.14` plane categories: background rows→`provider-background`; `supabase_admin` client backends + `pgbouncer` auth_query→`provider-client`; tenant `postgrest`/`authenticator`→`application-client`; `postgres`-role Supavisor (the Q12 controller-binding role)→`controller-client`; the Q12 probe→`probe`. Assignments are internally consistent and consistent with the trusted provider plane; they remain determinations (as the commit flags).
5. **Probe identity — PASS.** The probe appears exactly once (id8): `application_identity='megacampus-q12-activation-truth'`, `backend_type='client backend'`, `role='postgres'`, `database='postgres'`, `allowed_states=['active']`, `transaction_free_required=false`. It is the sole backend actively holding a transaction during projection, matching contract :283 ("its own transaction is the sole explicit non-transaction-free exception"). Note: the contract's "sole exception" is about the probe's live transaction, and its "where required" language (contract :283) permits other non-probe clients to carry `transaction_free_required=false`; the reconciliation of those values is F1, not a violation here.
6. **No invented identity — PASS (with F2 flag).** Count reconciles: 13 observed + 1 probe = 14. Every non-probe identity is a recognizable managed `pg_stat_activity` row class, and several carry observation-specific detail that could not come from general knowledge — `pg_net 0.19.5` version string (lines 122-124), `Supavisor (auth_query)` with `pgbouncer` role (lines 59-65), `postgres_exporter` (lines 103-111). None reads as fabricated-from-general-knowledge, and no suspicious absence or mis-collapsed duplicate was found. Primary sample bytes are not tracked (F2), so this passes on plausibility + count + observation-specific markers, not on primary-byte re-derivation; no identity FAILS traceability.
7. **Canonical hash / parse integrity — PASS.** Recomputed over NFC-normalized, recursively key-sorted, compact (`,`/`:`) JSON of the parsed object: `c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6` — equals the provisional canonical hash. `object_pairs_hook` duplicate-key scan: none. Float scan: none (the file contains no numeric literals at all; booleans and strings only).
8. **Ratification mechanics — PASS.** The canonical hash is a pure function of the parsed object (NFC + key-sort + compact), independent of the filename. Dropping the `.provisional` suffix renames the file without touching its content bytes, and "re-recording the hash" edits the field-11 row of the tuple artifact `.13.10`, not this inventory. Therefore canonical bytes are unchanged by ratification; only the tuple's path reference and the `PROVISIONAL` label change.

## Recomputed canonical hash

```
c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6
```

Equals the provisional canonical hash in the tasking, the freezing commit `5836927e`, and the tuple artifact `.13.10` field-11 row.

## Significant Findings (do not lose)

- **Finding:** The provisional inventory is byte-exact and structurally sound; the only open questions are determination semantics, which the freezing commit itself declared pending review.
  **Evidence:** recomputed hash `c90edb78…` matches; checklist items 1-3,7,8 clean; commit `5836927e` message + tuple `.13.10:64`.
  **Implication:** Field 11 can be ratified (drop `.provisional`, re-record the hash in `.13.10`) on the mechanical criteria; canonical bytes will not change.
  **Confidence:** high.
  **Next action:** proceed with ratification mechanics; carry F1 as an explicit note.

- **Finding (F1):** `transaction_free_required=false` on the `supabase_admin` managed client identities (id10, id11) sits in tension with `.13.14` ("accepted only when idle and transaction-free") and the contract drift-gate semantics (:281).
  **Evidence:** provisional json:94-111; `.13.14`:112-113; contract:281,283.
  **Implication:** If D6 uses `transaction_free_required` as the projection drift gate, an open transaction on a `supabase_admin` client would not be flagged, softening the `.13.14` acceptance guarantee at the projection layer. Must be reconciled before D6 relies on this field.
  **Confidence:** medium.
  **Next action:** downstream owner/orchestrator to confirm the intended semantics (descriptive metadata vs. drift gate) and, if gate, re-evaluate id10/id11 values.

- **Finding (F2):** The 13 observed identities are not re-verifiable from tracked bytes; the raw `pg_stat_activity` samples are not in the repo.
  **Evidence:** commit `5836927e` touches only 2 files (tuple + provisional json).
  **Implication:** Roster correctness ultimately depends on the owner-authorized live read; a future agent cannot re-derive it offline and must not assume it can.
  **Confidence:** low.
  **Next action:** treat any re-freeze as requiring a fresh authorized live inventory per the LIVE-BOUNDARY gate.

## Constraints honored

Read-only throughout: `git show/log`, `sha256sum`, `python3` canonicalization only. No network, no DSN, no live DB access. Single write: this artifact (no existing file overwritten). General Supabase training knowledge was used only to justify FLAGS (F1/F3), never as evidence of correctness for item 6.

# Verification

See the frontmatter `verification` list and the evidence recorded in the review body.

# Risks / Follow-ups

All findings, dispositions, and residual notes are enumerated in the review body; none are open beyond what the stream/stage artifacts track.
