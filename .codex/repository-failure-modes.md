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
refusing SSH outright. Both containers — dev and production — reported `healthy` throughout. A
dependency check must make the dependency answer. Corollary for anything behind an outbound hop:
prove the hop, not its configuration.

This entry first said the containers stayed green because a `degraded` body still returns 200. That
was generous. On 2026-08-25 the healthcheck turned out not to reach `/health` at all: all three
compose files replaced the image's HEALTHCHECK with a bare TCP connect, which proves only that
uvicorn bound the port. Nor could the image's own line have run — it used `urllib.request`, and this
container is given `HTTP_PROXY=socks5h://...`, so urllib routes even a loopback request through the
SOCKS proxy and fails (`URLError: unknown url type: socks5h`, measured against a server answering 200
on the same port). Fixed in mc2-h6nlv by asking `/health` through `http.client`, which never consults
the environment, held equal across all four files by
`tests/unit/ops/notebooklm-bridge-healthcheck.test.ts`. The 200 stays liveness-only on purpose —
restarting cannot renew a cookie or revive a tunnel — so `scripts/nlm-preflight.sh` is what now
refuses to start a paid generation against a `degraded` bridge. `docker ps` showing `(healthy)` is a
claim about whatever that container was told to ask, which is worth reading before trusting.

**An unpinned dependency lets the build date choose the version.** `notebooklm-py>=0.1.0` gave
`:latest` (built 2026-08-10) version 0.8.0 and `:develop` (built 2026-06-04) version 0.6.0, so
production sat two minors ahead of dev across a release that restructured error handling and removed
dict-subscript access, and nobody had decided either. A floor is not a range. This bites hardest
where the library automates somebody else's web interface, because there the upstream can also
change under a version that did not move. Swept 2026-08-23 (`mc2-aqsjj`): every other requirement
in the bridge image carries an upper bound, and `notebooklm-py` is the only exact pin — deliberately,
because it is the only one where a minor release has already changed behaviour under us. The check
is one line, so re-run it rather than trusting this sentence:
`awk '!/^#/ && /">="/ && !/</' packages/course-gen-platform/docker/*/requirements.txt`.

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

**`:batch` is an endpoint, not a discount flag.** A `:batch` model id sent to the synchronous
OpenRouter endpoint breaks the caller — it belongs to an asynchronous API with a 24-hour window —
and its tariff is not reliably half the base one. Read the same way as the provider price spread:
a suffix or a catalogue entry is never the price.

**A similarity threshold is only meaningful against a measured score distribution.** The retrieval
cut-off was `0.7` against embeddings that top out near `0.58`, so the vector half never returned
anything and "hybrid" search was BM25-only, silently. Thresholds now have one source,
`src/shared/qdrant/retrieval-thresholds.ts`, and a test rejects any literal above it. Measure the
ceiling before choosing a number.

**Remaining credit is a ceiling check, never attribution.** Reconcile with
`pnpm cost:report --since <T0> --verify-with-provider`, which sums `/api/v1/generation` over the
generation ids a window produced — from `generation_trace` and `career_playbooks.cost_breakdown`
alike — and names any id the provider has no record of. **Never the delta of `/api/v1/credits`**:
the key is shared with production and that traffic never stops. Two idle samples with no call of
mine spent $0.084 in 45 s and $0.072 in 150 s, and over two hours the delta read $1.4739 against an
actual $0.03 (`mc2-yson0`).

**An `await` on an `unref`'d timer is a promise Node may abandon.** The waits in
`fetchGenerationFact` were unreferenced, so a failed Career Playbook attempt slept in the generation
lookup and the process exited with **code 0 and no output** — which a caller reads as success. Only
visible in a one-shot script; a worker's own sockets keep the loop alive. The wait now holds the
loop, bounded at 30 s, and the background settle in `llm-cost.ts` opts out explicitly (`mc2-avjau`).

**A model id is declared once, and a row still carries it twice.** `PROSE_MODEL_ID` /
`PROSE_FALLBACK_MODEL_ID` sit beside `DEFAULT_*` in `model-defaults.ts`, held by
`model-ids-live-in-one-place.test.ts`. But an `llm_model_config` row also carries the id a second
time as `primary_display_name`, so an `UPDATE` that forgets it labels the admin screen with the
wrong model — which is what CI caught. **Changing any model id** means `DEFAULT_MODEL_ID`, every
occurrence in `config-seed.json` and the active rows of `llm_model_config` moving together, and
because the database wins over the seed at runtime the order is fixed: edit the database first, then
`pnpm generate:config-seed`, which reads it and rewrites the seed. That order is the only correct
one.

**A reasoning budget is added to `max_tokens`, not carved out of it.** OpenRouter bills reasoning
tokens against `max_tokens`, so both the database and the seed generator refuse `reasoning_enabled`
without a budget. Companion to the output-cap trap below: both are cases where a token limit means
something other than what it looks like.

**A database row that overrides code can outlive its caller, silently.** `prompt_templates` beats
`PROMPT_REGISTRY` at runtime, which is the feature — a prompt changes without a deploy — and nothing
checked the row still fitted the caller. 7 of 21 active rows did not. `checkOverrideContract` now
refuses a row that references a placeholder the registry lacks or drops a required variable the
registry renders, and falls back to the registry; a placeholder counts as unknown only when the
registry's own template lacks it too, so Mustache sections and RAG-borne Helm/Jinja need no second
list. The loud row cost Stage 4 Phase 3 its schema for nine months. **The silent one cost more**:
`stage7_cover_user` ignored four variables the caller had started passing, so every lesson cover was
drawn without its art direction and nothing warned, because an unused variable leaves no unresolved
placeholder (`mc2-pdcb7`).

**A guard is blind to what it has nothing to compare against.** A `prompt_templates` row whose key
has no registry entry cannot be checked by the rule above, and five such rows sat unexamined until
2026-08-24 — all dead, all editable from the pipeline-admin screen, where changing one would have
looked like changing the pipeline and changed nothing (`mc2-jraut`). Two traps found retiring them.
First, `clarifying_questions` **looked** used because its key collides with a table name; its phase
uses a constant in code and never asks the prompt service. Second, retiring orphans in bulk is
unsafe: the same admin screen can create a prompt under a key the registry has never heard of, so
the keys are named explicitly and `decideDeactivation` refuses any the registry still declares — the
live and dead halves of the Stage 4 `_system`/`_user` split differ by one suffix. Report by name,
never by count: `5 with no registry entry` cost an hour to turn back into five keys.

**Each attempt must pin its own endpoint, because a hung one never names itself.** `provider.order`
with one `tag` from `/models/{model}/endpoints` and `allow_fallbacks: false`; the next attempt takes
the next cheapest by live price, nothing outliving the call, and no pin at all when the list cannot
be fetched. `GET /api/v1/generation` cannot help here — it is unreadable while the call still runs,
which is exactly what a timeout is — and `X-Provider-Name` is advertised but never sent. Proven
2026-08-23: a `group_6_wrap` attempt hung 238 s on `open-inference/fp4` while `relace/fp4` answered
the identical request in 124 s. A pinned endpoint can also answer with nothing at all
(`mc2-f1tqd`).

**A LangChain option must ride a constructor field or it is lost to the clone.** `requiresReasoning`
retries a 400 whose body says reasoning is mandatory, once, with `reasoning: {effort:'low'}` and a
budget grown by `MANDATORY_REASONING_RESERVE_TOKENS`. It lives in `configuration.fetch`, a
constructor field, so it survives `new ChatOpenAI(fields)` — the same reason cost recording rides in
`callbacks` — and sitting below `invoke` it also covers `stream` and `batch`. An earlier version
wrapped `invoke`, and the four structured call sites all missed it (`mc2-148j9`).

**A log line must say which deployment it came from.** The pino base uses `detectEnvironment()`, not
`NODE_ENV`, because every dev container sets `NODE_ENV=production`; the image carries `APP_VERSION`.

**Timeouts come from measurement, and a small budget re-bills the call.** `DEFAULT_LLM_TIMEOUT_MS` is
300000, and all eleven `stage_career_playbook_*` phases carry 238000 in both `config-seed.json` and
`llm_model_config`, because measured calls have taken the full 238 s (`mc2-wg60c`).

**A deploy can be skipped on a fully green pipeline.** `Detect Deploy-Relevant Changes` skips
`Deploy to Dev` for a test-only change, so confirm that job's own conclusion rather than the run's.
Companion to "A deploy can ship an image that does not contain the commit" above.

**One version, four files.** A Docling image bump reached three files of four and would have
published 3.1.0 under the tag `3.0.0`. `docling-image-version-consistency.test.ts` now makes the
Dockerfile LABEL the source of truth and fails on any compose tag or publish-matrix entry that
disagrees. Same shape as a number restated across a trust boundary: interpolate, never retype.

**A flag with two readers is not configured until both have it.**
`DOCLING_MCP_PDF_HEADING_HIERARCHY` is written from one repository variable into both env files, and
half-configured is refused by a workflow gate and by a structural assertion. Set on the MCP side
alone, conversions WITH inferred headings are recorded under the identity of ones without, and
nothing downstream can tell the two apart.

**A deploy may go quiet for five minutes and that is not a hang.** `docker compose up` waits on
Docling Serve's ~330s health `start_period`; the deploy SSH had no keepalive and died with "Broken
pipe" (run 32659118735, production untouched). The keepalive lives in the setup step and is
asserted. Before killing a silent deploy, find out what it is waiting on.

**An output cap taken from the input length fails backwards, and a ceiling is not spend.** Stage 4's
evidence fallback set `maxOutputTokens` to the source document's own token count (`mc2-o5ktb`). A
structured answer is mostly not prose — every claim carries a confidence and `source_refs` whose
entries are a sha256 chunk id and a uuid, over a hundred tokens per claim before a word of content —
so the budget is tightest exactly where the JSON overhead dominates, and **the smaller the input the
more certain the truncation**. A realistic fixture passes; a 339-token source cannot. Replayed
against the provider: 339 gave `finish_reason: "length"` and unparseable JSON, while the same call
at 2048 answered in 941 tokens with `"stop"`. Size an output budget by the shape being asked for.
Two corollaries. The provider bills what the model **emits**, so raising an unreachable cap costs
nothing — this "saving" bought three paid calls where one would do. And the tell needs no logs:
`generation_trace.output_data` carries `finishReason` and `nativeTokensCompletion`, and truncation
reads as `"length"` with the completion count exactly equal to the allocated tokens.

**A guard that names a file cannot survive that file being split.** Several of the strongest checks
here read SOURCE TEXT rather than behaviour — `no-anonymous-spend` scans for raw
`.completions.create(`, `every-spend-has-one-ledger` counts `phase: 'stage_4_evidence_*'`, the
document-evidence privacy contract reads the payload just before a named log message. Each of them
named one path. On 2026-08-24 a lint-debt sweep split four of those files, and three guards went
red without a single behavioural change: the calls were still priced, the log lines still written,
the phases still named. What had changed was which file they were in.

Two lessons, both cheap. When a guard is about a MODULE'S behaviour, read the module's directory,
not a path — `readdirSync` over the sibling `.ts` files costs nothing and cannot be blinded by a
rename. And when a guard is about a CALL SITE — "the cost context must be visible at the call", "the
`cost-exempt:` note must be within 400 characters" — do not widen it: those windows are the point,
and hoisting a shared options object or a request builder out of the call is exactly what they
exist to notice. One of the three failures in that sweep was real by that rule: an options literal
had been collapsed into a spread, and the attribution was no longer where a reader checks it.

**A tool may reorganise the directory you told it to write to, and the flag that stops it is
positional.** `notebooklm-py`'s CLI runs a legacy-layout migration in its group callback: it MOVES a
home-root `storage_state.json` into `profiles/default/` — copy, then delete the original. This
deployment is deliberately on the flat layout, because `generator._configure_notebooklm_home`
derives `NOTEBOOKLM_HOME` from the storage file's PARENT, so a profile-shaped path would resolve
the master token one directory too deep. On 2026-08-25 a single `notebooklm login
--master-token-refresh` therefore did not reorganise that directory, it emptied it: production and
dev bind-mount the same host path, and both went to `auth_file: Not found` the moment the command
returned. Three things generalise. First, the gate is `if not storage and not has_env_auth_json()`
reading the GROUP callback's parameter, and `login` has a `--storage` of its own — two flags with
one name, where `notebooklm --storage PATH login …` is safe and `notebooklm login … --storage PATH`
is not. Second, the library path never migrates; only the CLI does, so calling
`notebooklm.auth.mint_cookies` / `persist_minted_jar` directly is both smaller and safer than
shelling out. Third, a runbook line saying "always pass the flag first" is obeyed until the one
night it is not: the durable answer was to make the service reconcile the layout on its own tick
and fail the `master_token` health check out loud while the fork exists.

**A recurring job that must not be absent belongs in the image, not in `deploy/systemd`.** Units in
`deploy/systemd` are deliberately NOT installed by CI — root ownership of that tree is the security
property, which is exactly why `scripts/ci/check_monitoring_drift.py` had to be written. So a unit
in the repository proves nothing about any particular host, and `is-active` reads green whether or
not the work ever happens; that is the same shape as the geo-bypass tunnel that was supervised,
restarting and dead for four months. The browserless cookie re-mint was put in the bridge's own
FastAPI lifespan instead: it arrives wherever the image arrives, it needs no root install, and its
evidence is the mtime of the file it rewrites.

**A server-side limit can apply to a sub-query, and the refusal is served as a quieter answer.**
Qdrant's `strict_mode_config.max_query_limit` bounds a PREFETCH limit exactly as it bounds the outer
one. `getPrefetchLimit` asked for three times the caller's limit with no ceiling, so Stage 5 section
retrieval — sizing its per-query limit as `25 * 4 / queryCount` — sent 300, 150 or 102 whenever a
section plan carried one, two or three queries. Qdrant answered `Bad Request`,
`hybridSearchWithFallback` caught it, and the search ran dense-only. Every layer above kept saying
hybrid: the call, the log line, and `search_type` in the response metadata; only `fallback_used` and
a `warn` disagreed. Two general points. A limit that a caller derives arithmetically from other
constants needs a ceiling read from the schema in force, not from a number retyped beside it. And a
`catch` that degrades to a lesser mode should be treated as a defect report, not a resilience
feature — the 4xx it produced was visible in `QdrantRestErrorRateHigh` for months and nobody was
looking, because the product behaved.

**A quality cap has to be measured on the unit it caps.** Stage 6 grouped retrieval by document with
`group_size: 2`, so one uploaded file could not fill a lesson. Measured per query it cost 22.6 points
of recall@5, and the mechanism was not subtle: grouping reaches deeper to fill each group, discovers
more documents, and the best chunk of each newly discovered document outranks the one that answers
the question. But per query is the wrong unit for the benefit — Stage 6 issues up to ten queries per
lesson and keeps their union, and it is the union that can be dominated. Measured there, the cap
bought **0.11 documents per lesson**: one document already supplied the whole context in six lessons
of nine WITH the cap in force, because those courses hold no second document bearing on the same
lesson. Both halves of a trade have to be measured at the same granularity, and the granularity that
matters is the one the user receives. Related: a grouped Qdrant query returns points the prefetch
never produced — 124 of 475 accepted results at Stage 6 — so "hybrid with RRF" was describing three
quarters of the answer.

**`\b` is an ASCII word boundary, so a Russian pattern matches nothing and reports zero.** Without
the `u` flag, `\b(?:пример|example)\b` cannot fire on Cyrillic, and the failure is silent in exactly
the wrong direction: the check returns "clean". Two independent checks were dark this way for the
whole life of the Russian track — the cadence regex, whose section had therefore been empty in every
RU playbook, and both copies of the example-marker regex, which meant no Russian document's markers
were ever visible to the marking check or the calibration table. A regex over user text is a claim
about a script; test it against the non-Latin language before trusting a zero.

**A near-empty result is the shape a broken check takes, so read zeroes as suspects.** Every case in
the entry above was found by asking why a counter was zero, never by a failing test. When a check
that should find something finds nothing across an entire language, that is the finding.

**MDX compiles `<` as the start of a tag, and a smoke gate that checks a query has not checked a
page.** `MarkdownRenderer` uses `compileMDX`, and a red band is a ceiling written with `<` — one run
carried 54 of them (`red <2x`, `<65%`). Every public page of such a guide returned **HTTP 500**:
catalog share, slug share and all three reader links. Because the metric ledger has published a red
band for every metric since it existed, this had been true for every such guide all along, and five
paid runs passed over it — the live-smoke `public-share` gate reported "rendered successfully"
because it queries tRPC rather than requesting the URL and reading a status. `escapeBareAngleBrackets`
rewrites a `<` that cannot start a tag and leaves what can, fences and code spans included. A gate
for a page must fetch the page.

**A locating word has to be the rarest word in the line, and a contested family must stay silent.**
Two false positives, each billing a paid regeneration. A milestone check anchored on the label's
**first** long word, and every ledger label begins with "First", so one correct one-line ramp summary
was searched from five places at once and blamed five times. Separately, `findCadenceLedgerEntry`
took the first row matching a duty family, and the ledger held both `Performance review` (quarterly)
and `Team performance review` (weekly); the block wrote what its own row publishes and was blamed
with the other row's rhythm. Anchor on the rarest token, and when two ledger rows could both own a
line, report nothing rather than guess.

**`block_15` sorts before `block_4`.** A disagreement resolver ordered block ids as strings to find
the earliest, picked the wrong block, and sent the block that was right to be rewritten. An id with a
numeric suffix needs a numeric comparison every time it is ordered.

**An absent field reads as a measurement.** No cost row named a service tier, so 64 of 64 rows with
nothing there were read as "flex is off" — for a run in which every call had in fact been served by
`openai/flex`, which `GET /api/v1/generation` said plainly. Before reporting an absence, find the
positive record: a field nothing writes is silence, not evidence. `settleCareerPlaybookNodeCosts`
now keeps `service_tier` from the receipt it was already fetching.

**A check can attack exactly what the contract requires.** Eight `unresolved_placeholder` criticals
in one run all pointed at the example marker the prompt mandates, and satisfying any of them would
have turned a correct block into a different defect. The fix is a filter, not a prompt: demote any
critical the deterministic detector cannot confirm in the block's own text. Corollary from the same
family — a critical whose own description says the check passed is a prompt-shaped defect a prompt
alone cannot hold, and the run counts it all the same.

**A prompt that explains a rule through its consequence gets the explanation published, and a rule
written inside the data gets written down for the reader.** Reader text carried five rule-leak
sentences until the rationale was removed and replaced with a per-sentence test. Separately, the
`prior_blocks_digest` section titles carried writing rules inside the data, and the model copied them
out — six leaks in three stored documents, for rules that already existed in the output contract.
Remove the trigger rather than banning the output.

**Part of the document is written by our own code, and no prompt reaches it.** 27 of one run's 28
unreachable references came from `appendCareerPlaybookCalibrationTable` — application-built, appended
after generation, labelling rows "Block 8"/"Block 11". The block was regenerated twice and the table
was re-appended each time. Before writing a prompt fix for something in the output, establish which
side of the seam produced it.

**A fused RRF score is not on a different scale from a dense cosine one.** Fused scores reach 1.0000
against dense bests of 0.45–0.65. The standing advice not to compare them was right; its stated
reason was wrong, which is worth knowing before someone re-derives a threshold from it.

**A counter can name what was planned rather than what was issued.** `[Lesson RAG] Retrieval
complete` logs `queriesExecuted: queries.length`. Count the provider rows in `generation_trace`
instead. Its sibling: a per-query retrieval rate does not describe a ten-query lesson, because the
per-query limit is a function of the query count — a one-query harness measuring 29.97 candidates is
6 in a real lesson.

**A count from one run is not a measurement of a stochastic node.** Replaying one proofreader on a
**byte-identical** input gave 1, 5, 12 and 7 criticals and four different regeneration lists; three
runs of one English fixture gave 1, 5 and 11. Five runs of identical input spanned 25/9/7/11/13.
Every closure that rests on such a number is resting on noise. Replaying a single node costs ~$0.002
against ~$0.10 for a full run, so the cheap instrument already exists; the contract now requires a
floor of eight arms per side, and deterministic replay over stored documents is the comparable row.

**A replay does not see what the live node saw.** A defect that appears in every live run reproduced
in **0 of 16** replay arms before the change and 0 of 16 after, in both directions, because a replay
reads `final_markdown` — the text after the final regenerations — while the live node was handed the
assembly from before them. When replay cannot reproduce a live defect, check what each one is fed
before concluding the defect is intermittent, and say plainly that the fix rests on the mechanism
rather than dressing it up as a measured win.

**A whole-document producer has no per-block row to file under.** The final proofreader's findings
reached no stored row at all, for months, because `q_a_data.quality_issues` is built by walking
`generatedBlocks` for a per-block verdict. Anything that judges the document as a whole needs its own
source key, or its output is computed, paid for and discarded.

**A severity is only downgraded when every consumer of it agrees.** `verdictFromIssues` sent
everything above `info` to regeneration, warnings included, which made a check's own suggestion —
"this is a warning rather than a regeneration trigger" — untrue of the code beneath it, and would
have silently voided a deliberate `critical` → `warning` downgrade. Before changing a severity, grep
every consumer of it; a deterministic path and its LLM sibling routing on different thresholds is the
same defect wearing two hats.

**`env_file` is not compose interpolation.** A variable that is demonstrably in `.env.dev` still
fails `${VAR:?}` in a hand-written `docker compose … up`, because `env_file` populates the
container's environment while `${VAR}` in the compose file is resolved from the invoking shell and
the project `.env`. The working form is the one `scripts/deploy_dev.sh:151` uses, `--env-file
"$BASE_PATH/.env.dev"`; production additionally needs `API_IMAGE` and `WEB_IMAGE` passed explicitly.

**One provider key serves dev and production, so exhausting it from dev is a production outage.** The
Jina key ran out on 2026-09-02: it stopped Career Playbook on dev and would have stopped production
the moment a course ran, because embedding and rerank rates are read with the same credential from
both. A corpus-wide "read-only" measurement is a paid write against that balance. Replacing the key
means every place the value is read — the local `.env`, the GitHub Actions secret every deploy writes
from, `/opt/megacampus/.env.{dev,blue,green,production}`, and each running container — and the proof
is a 200 from `/v1/embeddings` at 768 dims through our own code, not a config diff.

## Local traps that waste an afternoon

- Host port **6333 is the DEV Qdrant** and holds **12 points** across one course (2026-08-27).
  Production answers on **6335** with 6856. A RAG measurement against 6333 is a measurement of
  twelve chunks; on a developer workstation `localhost:6333` is a DIFFERENT project's Qdrant,
  with a collection of the same name. Reach ours read-only with
  `ssh -N -L 16335:127.0.0.1:6335 megacampus-prod` and the read-only key, which refuses every
  write — verified, `403 Forbidden` on an empty alias change. A write against a collection that
  does not exist answers 404 instead, because Qdrant resolves the collection first; that 404
  reads like "the key can write" and does not mean it.
- A Stage 6 probe's lesson length follows `estimated_duration_minutes` from `course_structure` — 5
  minutes for course `8baaa75e` against the 15 an older baseline used — so every per-lesson counter
  moves with it. Read the value before comparing two runs.
- Rotating a credential in a running production container is safe when the container is recreated on
  **the digest it is already running** (`sha256:20e1372e15bd…`, read from the container, not from a
  tag): the credential changes and nothing else does. Verify the queues are idle first, and check
  `RestartCount` is 0 afterwards.
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
