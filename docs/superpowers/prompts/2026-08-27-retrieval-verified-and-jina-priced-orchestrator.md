Target: Claude Code CLI, repo /home/me/code/mc2, branch develop.
Audience: engineering agent starting cold, Opus 5.
Runtime: WSL + VS Code terminal; dev and staging both on `ssh megacampus-prod`.

Goal: find out whether last week's retrieval change helped a lesson, what it moved in provider calls,
and what those calls cost — then close `mc2-d0e2n`. Run `bd show mc2-d0e2n`; the epic and its six
children carry the facts, file paths and traps, and bd is the source of truth, not this text. Read
`docs/superpowers/plans/2026-08-27-retrieval-verified-and-jina-priced.md` for the work order and the
design beside it for why, before touching anything.

Context: retrieval was measured for the first time on 2026-08-26/27 (`mc2-xg6g8`, closed) and two
production paths changed. Stage 5 had never been hybrid for a section plan of three or fewer queries:
`max_query_limit` is 100 and applies to a prefetch limit, so it asked for 300, got `Bad Request`, and
served that as a dense-only fallback while every log line still said hybrid. Stage 6 stopped capping
results per document, on the owner's decision, reversing `mc2-jz6y0.16` for lesson content. Recall@5
went 0.7742 → 0.9677 and 0.7419 → 0.9677. Both numbers come from `pnpm benchmark:rag`, which scores
whether the answering chunk reaches the top five, and **no lesson has been read** — the benchmark
cannot read one, its evaluation set has no lessons in it.

Three things are therefore unknown. Whether the lesson is better: the cap's removal raises how much
of a lesson one document may supply, measured at 0.11 documents, but that counted the retrieved union
_before_ reranking and the model reads the seven the reranker picks. What the change did to call
volumes: Stage 6 stops at `enoughCandidates` = 40 and breaks _after_ a query returns, so at ~6.25
unique chunks per query it needed about seven queries and now needs two, while `rerankChunks` sends
the whole accumulated union to Jina, so the reranker input moved the other way, roughly 40–46 → 60.
That is arithmetic; measure it. And what any of it costs: **Jina spend is in no ledger at all.**
`mc2-4clyr`'s "Stage 6 is 90% of cost" comes from `generation_trace`, which records OpenRouter only;
the reranker counts tokens into an in-process tracker nobody reads, no Jina price exists in any cost
table, and `no-anonymous-spend` guards only `createOpenRouterModel*`.

Traps this repository has already sprung. `localhost:6333` here is another project's Qdrant — ours is
the dev host on 6335, read-only over `ssh -N -L 16335:127.0.0.1:6335 megacampus-prod`, and 6333 there
is the dev instance with 12 points. A dev run publishes no Prometheus metrics, so read traces and
container logs. A test that pins the broken shape once let a blocker into production: show every new
test red against the old behaviour and say you checked. `lint-staged` rewrites files at commit time;
re-run text-asserting tests after committing. Never `pnpm install` to repair the root `node_modules`.
The primary worktree can move under you — another session landed five commits in it mid-pass last
time. For `mc2-kim48`, read the whole reconciliation path in `document-evidence-textfile.ts` before
asserting any mechanism: the previous pass asserted two from partial reads and retracted both.

Authority: standing owner authorization covers paid runs under USD 5, commits, push to `develop` and
dev deploys on a green pipeline — act and report, do not ask. Reindex, any production mutation and
any migration need a fresh decision; this plan names no migration, so one appearing means the scope
drifted. The retrieval constants settled on 2026-08-27 are settled: a defect a lesson reveals is a
finding to report, not a knob to turn in the same pass. The restored cap used for the second arm is a
local edit and must never be committed. Leave `mc2-8m90f` and the parked Helixa work in `mc2-gxese`
alone.

Output: `pnpm type-check` and `pnpm build` for code changes, one risk-selected `pnpm test` after
implementation, `vitest.config.unit.ts` for focused runs because the default backend command is
fail-closed and needs Qdrant 1.18.2, `eslint` on touched files. Deliver through `/push-dev` after
`scripts/orchestration/check_stranded_commits.py`. Report the verdict on the two lessons in plain
words — "indistinguishable" is a result and must be said as one — the measured call volumes per arm,
what a lesson costs in Jina, and what `mc2-kim48`'s three questions turned out to be.

Stop and ask if the verification would need a production run, if a lesson cannot be generated under
USD 5, or if reading the two lessons argues for changing retrieval again rather than recording what
it did.
