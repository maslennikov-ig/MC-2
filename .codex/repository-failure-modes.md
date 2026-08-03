# How this repository fails, so you do not rediscover it

This is the durable half of what used to live in `.codex/handoff.md`. It was extracted on
2026-08-03 because the handoff is capped at 200 lines and is CURRENT STATE ONLY, and these are
neither: they are lessons that outlive every stage. Four consecutive sessions had to shorten
something true to fit something else true, which is a bad trade to keep making.

Nothing here expires with a stage. Add to it when a failure teaches something general; move
anything that turns out to be about one stage back into that stage's summary.

## The failure modes

**Delivery is not deployment.** Two directories production executes had no delivery path at all —
`deploy/postgres` until 2026-07-31, and `ops/qdrant`, which by design still has none. Both were
found by looking for an observable effect on the host, not by reading the workflow. The workflow
looked right in both cases. Corollary: after changing anything under `deploy/`, check what the host
actually has, and remember that `/opt/megacampus/deploy/systemd` is STAGED, never active — systemd
runs `/etc/systemd/system`, and only a deliberate root install moves bytes between them.

**Completion is not success.** BullMQ marks a job completed whenever the processor returns, and
these handlers return `{ success: false }` rather than throwing. A queue that looks drained can be a
queue that failed quietly, in bulk.

**The producing container is not the consuming one.** Absolute paths and queue names are resolved by
the PRODUCER and travel inside the job payload. The operator sets `/opt/megacampus/data`; the
workers mount the same files at `/app/uploads`. Getting it wrong costs a full round: every job dies
on ENOENT and marks its document failed.

**Errors get discarded, repeatedly, and it keeps costing whole nights.** `mc2-0tcyw` is the fourth
instance: a captured stderr was thrown away on the failure path, so a nightly backup failure read
`failed with status 1` and nothing else. When something fails without a reason, FIX THE REPORTING
FIRST — every single time here that has paid for itself within the hour, and it is usually a
one-line change. Its sibling: a diagnostic that only runs where the tool cannot fail is not a
diagnostic. Check where your new guard actually executes.

**The checked environment gets substituted for the consuming one.** Fakes that accept any page size,
any job result, any container. A test that passes against a fake proves the fake agrees with itself.

**Prove it on the host, as the user that will run it**, and **prove a new guard red before you trust
it green.** Several defects here survived a green suite because the suite never exercised the path
the host takes: different uid, different `HOME`, different filesystem protections, a hardened unit
with `ProtectSystem=strict`.

**Measure before you name a cause.** Two `mc2-3gz2m` diagnoses and one `mc2-0tcyw` diagnosis were
stated confidently and were wrong; each was killed by a single cheap query or a page render. A named
suspect with evidence is worth more than a confident cause without it, and it is honest to ship the
former labelled as such.

## Local traps that waste an afternoon

- Host port **6333 is the DEV Qdrant and is empty**. Production answers on **6335**.
- `AGENTS.md` is rewritten by a `bd` hook, so the primary worktree is rarely clean. Stage explicit
  paths; never `git add -A`.
- `q12-privileged-launch.sh` and `q12-writer-resume.py` are root-owned and deliberately NOT shipped
  by an ordinary deploy. Root ownership is the security property.
- The GHCR token for `claude-deploy` is dead (`mc2-2vtmk`), so a digest-pinned image that gets pruned
  cannot be re-pulled. The operator image is held under `hold/qdrant-operator:pinned` for that
  reason, tagged BEFORE any prune.
- Prometheus retention lives in `prometheus.yml` with the CLI flags REMOVED: a flag silently
  overrides the config file.
