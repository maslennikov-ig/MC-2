# Root unit acceptance retained across the PG entrypoint correction

Root ran the full selected command file through `run_stage_closeout.py` on
`d839652b1`. Process verification passed, backend four-file Vitest passed
**89/89**, and web hook Vitest passed **3/3**, both exit 0. The following PG
command stopped in `setup-unit.ts` before collection because the new opt-in
script had not supplied the required synthetic Supabase environment. This is
an infrastructure failure, not a behavior red control.

The correction adds literal offline-only URL/key placeholders to the PG script;
it does not change application source or unit tests. Root retains the 89+3
passing checks for those unchanged sources and runs the failed/unexecuted
commands in `acceptance-commands-remaining.json`, rather than rerun passing tests.
The original full selection remains in `acceptance-commands.json` for reproduction.

Initial private log: `/tmp/mc2-1iwt9-root-initial-acceptance.log`.
Source parity across the correction is verified with
`git diff d839652b1 -- packages/course-gen-platform/src packages/course-gen-platform/tests packages/web`.
Final remaining-command receipt and accepted revision are recorded in `summary.md`.

On `f4cb79f9f`, root's remaining command selection passed PG **50/50** and the
bounded CI/CD guard **1/1**, then halted on new-test-only ESLint errors/warnings.
Production lint targets had no findings. Private log:
`/tmp/mc2-1iwt9-root-pg-ci-acceptance.log`. The test fixture typing corrections
affect only `knowledge-sync-v2.test.ts` and `knowledge-sync-v2-pg17.test.ts`.
Root reruns those affected 45+50 controls, combined lint and unexecuted type/build
through `acceptance-commands-final.json`. Existing v1/scheduler/atomic/web (44+3)
and unchanged CI guard evidence are retained; no passing result is represented
as an executed cache step in the new receipt.

On `b6d6f85f5`, root passed the corrected v2 unit **45/45**, PostgreSQL
**50/50**, and combined production/test lint, then type-check reproduced TS4023:
the local `DeleteDownstreamStagesResponse` interface could not be named in the
exported router declarations. The correction only exports this existing type;
it changes no emitted JavaScript or behavior. All 142 passing behavior controls
and the CI guard remain applicable. Root runs changed-module lint, type-check
and the previously unexecuted build in `acceptance-commands-type-build.json`.
Private prior log: `/tmp/mc2-1iwt9-root-type-export-red.log`.

Post-publication run 36748347854 exposed six legacy migration-frontier failures.
Root reproduced 6/6 red locally: the exact filename manifest lacked the new v2
migration. Only the reviewed manifest pin was extended to 264 files; accepted
sources/security/history pins and all application modules are unchanged. Root's
canonical bounded acceptance on `98bf0ce2b` passes 6/6 and script ESLint, recorded
in `acceptance-receipt.json`. The earlier application receipt is preserved byte
for byte as `acceptance-receipt-application.json`. Core 142 behavior controls and
matching type/build evidence remain applicable. Dependency Security Audit is
separate and still blocks CI/release, tracked in `mc2-bot88`.
