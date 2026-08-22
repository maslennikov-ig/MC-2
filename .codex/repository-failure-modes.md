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

**A deploy can ship an image that does not contain the commit.** `DEPLOY_API_CHANGED=false` keeps
the CURRENT image even when a new one was built; after a rollback in 2026-08, the next push did not
restore the new code because its commit touched no api source. `workflow_dispatch` with
`force_deploy=true` sets every `*_changed` and is the supported way out.

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

**A known-flaky label is a place for a real failure to hide.** This repository keeps a list of
suites that time out under full-suite parallelism and pass alone, and that list is legitimate. On
2026-08-03 one of them, `qdrant-source-recovery-runtime`, had been failing for three days for an
entirely different reason — `chown 0:0` in code that is root in the image and an ordinary uid in the
test — and the label absorbed it. Before charging a failure to the known list, check that it matches
the known SHAPE: a timeout under parallelism is not an assertion failure in 76ms alone.

**Measure before you name a cause.** Two `mc2-3gz2m` diagnoses and one `mc2-0tcyw` diagnosis were
stated confidently and were wrong; each was killed by a single cheap query or a page render. A named
suspect with evidence is worth more than a confident cause without it, and it is honest to ship the
former labelled as such.

**A `~…-latest` alias is a routing shim, not a model, and it lies twice.** OpenRouter documents it as
a redirect that "always redirects to the latest model in the family". On 2026-08-17 the family moved,
median call latency went 8.7 s → 102 s with no change on our side, and the courses of 12-20 August
failed on timeouts nobody had configured (`mc2-qch4w`). The second lie is quieter and was measured on
2026-08-22: `GET /models/{alias}/endpoints` answers **200 with an empty list** — 0 against 30 for the
pinned snapshot — and this codebase reads an empty list as _could not find out_, so an alias silently
switches off the per-attempt endpoint pin. `listModelEndpoints` now follows OpenRouter's own
`alias_target.slug` and that hole is closed, but **routing stays on a pinned snapshot** by the
owner's decision: the DeepSeek V4 Flash family already carries an experimental vision variant at 5.5×
the input price, and a redirect is free to land on it.

**A LangChain clone keeps only what the constructor was given.** `ChatOpenAI.withConfig` — which
`withStructuredOutput` and `bindTools` both funnel through — is `new ChatOpenAI(this.fields)` by
design (langchainjs#8586), so anything attached to a built instance is dropped, silently. That cost
every structured call its price (`mc2-258fi`) and, separately, its mandatory-reasoning recovery
(`mc2-148j9`). The rule that follows: build with it, never attach it. Cost recording rides in
`callbacks`; the generation-id capture and the reasoning-floor resend ride in `configuration.fetch`,
which also puts them below `invoke` and so covers `stream` and `batch`. Held by
`tests/unit/shared/llm/structured-output-reaches-invoke.test.ts`.

**A health check that reads a variable has checked nothing.** The NotebookLM bridge decided the
geo-bypass proxy was fine because `HTTPS_PROXY` was set. On 2026-08-22 the tunnel had been dead long
enough that nothing had generated since April: no listener on the forwarded port, the upstream host
refusing SSH outright. Both containers — dev and production — reported `healthy` throughout, because
Docker's own HEALTHCHECK only wants a 200 from `/health` and a `degraded` body still returns one. A
dependency check must make the dependency answer. Corollary for anything behind an outbound hop:
prove the hop, not its configuration, and remember that `docker ps` showing `(healthy)` is a claim
about a loopback request.

**An unpinned dependency lets the build date choose the version.** `notebooklm-py>=0.1.0` gave
`:latest` (built 2026-08-10) version 0.8.0 and `:develop` (built 2026-06-04) version 0.6.0, so
production sat two minors ahead of dev across a release that restructured error handling and removed
dict-subscript access, and nobody had decided either. A floor is not a range. This bites hardest
where the library automates somebody else's web interface, because there the upstream can also
change under a version that did not move.

**The empty path that logs nothing is the one you will meet.** `retrieveLessonContextCore` had five
ways to return no chunks; four logged and one did not, and the silent one is what a live run hit —
zero RAG chunks in 143 ms with the document indexed, identified only by which log lines were
_missing_. When a function has several early returns for the same outcome, the one without a line is
not cheaper, it is the one that costs an afternoon. Related: a fallback that re-parses with the
schema that just refused the value does not "use defaults", it throws (`mc2-80o1t`).

**A threshold in characters is a claim about a writing system.** Stage 5 refused every Chinese
course it was ever asked to make — `section_title` min 10 characters, `key_topics` min 5 — and
nothing was wrong with the text: `应急基金核心概念` is eight characters and a complete idiomatic
title that takes thirty-five in English. The minimums were calibrated on Latin script. The same
factor of two is already written down elsewhere in this repository, in the chars-per-token table
(2.0 for Chinese against 4.0 for English), and three call sites bypassed _that_ too by writing
`language === 'ru' ? 'rus' : 'eng'`. When a number describes how much a character carries, weight
it by script rather than lowering it — lowering lets genuinely truncated Latin text through.
Related and worse: a lookup of the form `TABLE[language] || []` turns an unlisted language into
**no checks at all**, which is how the Spanish language-consistency check passed everything.
Configure by what a thing _is_ (which script a language uses) rather than by what it is not.

**A placeholder in an id field is a filter nobody wrote.** `convertToLessonSpecV2` put
`primary_documents: ['auto-generated']` into every automatic-mode lesson spec. Stage 6 intersects
that list with the accepted document-evidence set, a word never matches a UUID, and so every
automatic course with an uploaded document was written **without the document** for six months —
zero chunks in 140 ms, `success: true`, judge scores of 0.90-0.93. Two other builders of the same
field document the empty-array sentinel and one of them says outright "do not use 'default'
sentinel"; this was the same mistake under a different word, which is why the guard now rejects any
non-UUID literal rather than that one string.

**Supervision is not availability, and `is-active` is a claim about the supervisor.** The dead
SOCKS tunnel did have a systemd unit — a _user_ unit, `Linger=yes`, `Restart=always`, active since
February. It restarted `ssh` every twelve seconds against a host refusing connections, logged
`Connection refused` each time, and `systemctl is-active` answered `active` throughout, because the
`autossh` parent was alive. Four months. Look for user units too (`systemctl --user`), and judge a
tunnel by its listener and its egress, never by its unit state.

**Ask the server what the constraint is.** `mc2-r7udy` was blocked from February on
`system_metrics.event_type` refusing a new value, and the plan to unblock it stated no migration was
needed because the table has no CHECK constraint. True, and beside the point: the constraint is a
PostgreSQL enum, which is stricter. `pg_type.typtype = 'e'` says so in one query; the migrations
directory does not. Sibling of "A Constraint the Repo Cannot Show You" and the same remedy.

## Local traps that waste an afternoon

- Host port **6333 is the DEV Qdrant and is empty**. Production answers on **6335**.
- Production workers take their environment from `/opt/megacampus/.env.<active_color>` — read
  `active_color` first. `.env.production` is the compose default and is not what runs. A variable
  that must survive a deploy goes into **both** `.env.green` and `.env.blue`.
- `AGENTS.md` is rewritten by a `bd` hook, so the primary worktree is rarely clean. Stage explicit
  paths; never `git add -A`.
- `q12-privileged-launch.sh` and `q12-writer-resume.py` are root-owned and deliberately NOT shipped
  by an ordinary deploy. Root ownership is the security property.
- CI deploys used to replace the persistent `claude-deploy` GHCR credential with a job-scoped
  `GITHUB_TOKEN`, which expires after the job. A dedicated read-only credential was installed and
  verified on 2026-08-09, but the recurrence fix is still local in commit `63b4e2efd`. Do not run an
  older deploy revision: the first later deploy must include that commit so CI authenticates through
  a temporary `DOCKER_CONFIG`. The operator image remains held under
  `hold/qdrant-operator:pinned`, tagged BEFORE any prune.
- Prometheus retention lives in `prometheus.yml` with the CLI flags REMOVED: a flag silently
  overrides the config file.
- Stage cleanup is deliberately two-step: first run
  `scripts/orchestration/cleanup_stage_workspace.py --stage <stage_id> --dry-run`, then run it
  without `--dry-run` only after approving the exact candidates. It removes
  `packages/web/.next/cache` only inside clean child worktrees whose branch is already merged into a
  delivery target, then removes that worktree and its safe local branch. Dirty, unmerged, protected,
  and primary worktrees — including their caches — are retained and reported.
