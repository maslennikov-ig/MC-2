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
