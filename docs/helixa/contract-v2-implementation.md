# MegaCampus knowledge-sync v2 implementation

Task/stage: `mc2-1iwt9`, in progress. MegaCampus base: origin/develop
`c7a000ec6cf387153f94b26d00b5db7c51237d03`.
Authority: exact section C of Helixa origin/main
`3e0a62686611eafaf0261e669c21a27bd2c18fb7`,
`docs/superpowers/specs/2026-09-30-sources-complete-and-current-spec.md`.
D14 and section C were refreshed read-only; Helixa source is not written here.

## Explicit owner clarification, 2026-09-30

Manifest objects: ALL completed objects readable by at least one actual member
of the producer organization under the existing application read rules.

Publication/visibility withdrawal: retract ONLY when the LAST organization
member loses read access. Turning a public link off alone does not retract an
object still readable by its owner/admin/instructor/enrolled member. This
explicit clarification supersedes the initial candidate that filtered by
organization/public visibility, and the unconditional unpublication reading.
No per-user ACL fields are added to the wire contract or application policy.
Deletion and generation rollback still retract because the completed object
ceases to exist or be current regardless of remaining reader privileges.

The earlier contradiction was stopped and reported before implementation:
public-to-private retains owner access, requiring both manifest inclusion and
withdrawal under the original interpretation. The owner resolved that exact
case explicitly; implementation resumed. A production acceptance fixture must
actually remove access of the last org member to exercise unpublication.

## Wire and persistence invariants

- Exact v2 schema; full COMPLETED/UPDATED package; object.revision integer >=1.
  Persistent revision state keyed (kind,id), independent of native row lifetime.
- Tombstone: schemaVersion,eventId,eventType,sentAt,producer,object only.
  object keys kind,id,revision,status=retracted,reason. Four contract reasons;
  no snapshot read, content/documents/claims/relations/scope/hashes on wire.
- Normalize actual answerable fields; ignore processing metadata, timestamps,
  progress/cost/image state. Deferred capture compares final transaction state.
  A logical downstream delete uses one atomic v2 RPC, preserving v1's old path.
- Select the latest usable lesson version using native content usability rules.
  Preserve rendered markdown overrides while excluding generation telemetry
  in native content wrappers; obsolete versions do not cause updates.
- Immutable protocol-pinned intents and safe retry/lease fences. Source descriptors
  and semantic snapshots must not pair old revisions with newer native content.
- One DB-snapshot inventory avoids PostgREST's row limit. Every current object
  exactly once; pages <=1000; same HMAC/route; hourly and after every reconciler.
  Resend uses current revision. Scheduled reconciler runs apply:true.
- Exact HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2=true; absent/false stays v1. DB capture
  gate defaults false and mirrors runtime authority. Off/on/off preserves v1.
- V2 never dispatches v1 backlog. Activation locks the exact binding and refuses
  while any previously claimed/frozen v1 intent remains undelivered, including
  retryable/action-required intents and entries whose attempt counter was reset.
  Successful v1 replay acknowledges completed materialization at Helixa.
- Native dirty capture and activation share the binding lock. A native edit or
  last-reader withdrawal overlapping bootstrap must capture after the new gate
  commits, rather than silently read an obsolete false gate.

## Technical premortem

Verdict: GO after explicit owner clarification.
Blast radius: native content/access writes -> revision/intent -> scheduler ->
existing signed receiver; manifest inventory -> current-revision resend.

| Failure                     | Concrete mechanism                                          | Detection/mitigation                                                                                     |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Revision reset after delete | Native row lifetime                                         | Separate revision table; real delete/recreate and concurrency controls                                   |
| False withdrawal            | Private remains readable by some org members                | Actual existing membership/role/enrollment/owner predicate; last-reader controls                         |
| Event storm                 | Parent/child cascades or separate cleanup requests          | Deferred fingerprint plus atomic downstream RPC; cascade/single-edit controls                            |
| Mixed rollout               | Delayed v1 unconditionally replaces a v2 projection         | Default-off mirrored gate; activation waits for claimed/frozen v1 to complete; protocol-exclusive claims |
| Wrong manifest              | Partial query, 1000 row cap, or inconsistent read snapshots | One consistent JSON inventory; exact pagination and failed-read controls                                 |
| Missing tombstone           | Old delivery loads deleted row                              | Intent-only tombstone branch; snapshot loader spy must remain uncalled                                   |
| Contract drift by executor  | Invented payload fields or audience assumptions             | Exact wire comparisons and owner clarification recorded above                                            |

Bootstrap control: both object/org dirty entrypoints lock enabled bindings before
checking the gate. Real two-session controls must prove overlapping title edits,
deletion and last-reader withdrawal are not lost during activation.

Recovery: keep v2 off during rollout; disabling it restores v1 without deleting
revision history/frozen events. No production rollback/apply/deploy is authorized.

## Ownership and verification

DB worker owns new migration and real disposable PostgreSQL tests.
Transport worker owns Helixa TS modules, worker scheduler and focused tests.
Atomic-edit worker owns the existing cascade-confirm + pending-field flow and
its v2 atomic RPC consumer, preserving the legacy path when v2 is off.
Root owns shared decisions, CI/default flag forwarding, final acceptance and
documentation. All three workers have isolated branches and disjoint write zones.
Every behavior needs red evidence on old code in the same worker tree, then
focused green. Root owns one integrated focused set, pnpm type-check and pnpm build.
No secrets/customer content are printed; no live system or Helixa source writes.

## Graph and docs

Read-only orientation borrowed primary graph built at 006117b3; current code
was verified at c7a000ec6. Graph closeout refresh and docs review remain pending.
