# mc2-v9c3k: Telegram price sync notification repair

Accepted and deployed on 2026-10-01 after the owner instruction “задеплой”.
Release v0.31.49: a44cb2399039457a18188291323a1217c6e7e4e5.
Production: 188e5abc3fd785167f9015b60ee90c6f80bb57a0, active blue.

## Cause and repair

Run 36848193232 published rates as 67c71c999 before its price notice failed
with HTTP 400; 36698595768 failed at the same phase. Legacy Markdown opened
an unclosed italic entity at max_price. The failure notice already used plain
text and succeeded. The original Telegram error description was suppressed;
the entity error was reproduced from the actual payload.

208ba9186 sends the price notice as plain text and logs only descriptions from
failed Telegram responses, preserving curl's exit status. Nine focused workflow
tests passed; both new regressions failed before the repair.

The unchanged security gate found 16 high advisories in four dependency families.
342f0381a updates fast-uri, undici (6/7), brace-expansion (1/2), and Axios within
their existing major lines. Root inspected the manifest/lockfile diff, verified
cherry-pick equality and independently passed the high-severity audit.
No schema, secret, access or permission changes were introduced.

## Acceptance and delivery

Local type-check/build, formatting, bash syntax, artifact validation and the
9 focused tests passed. Full CI/CD 36870583394 passed on production commit
188e5abc3, including unit/integration/contract tests, security audit and monitoring
drift. The normal deploy helper reused passing local type/build via --force;
the CI gate and test execution stayed unchanged.

At 14:07:35 UTC, SSH verified deploy_state=accepted, active blue and matching
revision labels on API/web and main/stage6/stage7 workers. Production web/API
and unchanged dev web health returned HTTP 200.

The accepted source tree was promoted to develop as acf42ce94 by a clean isolated
merge and guarded ordinary push. The dirty primary checkout/ref was preserved.
Normal master price-sync 36873944045 then passed: 531 test files/7898 tests passed,
29 files/807 tests skipped by the existing suite configuration. It published new
rates as 575872e4736fd0c85cc37dbdc7174762367fbd56 and successfully sent the real
Telegram price notice; failure notice was skipped.

CI/CD: https://github.com/maslennikov-ig/MC-2/actions/runs/36870583394.
Price sync: https://github.com/maslennikov-ig/MC-2/actions/runs/36873944045.
Exact evidence is in acceptance-receipt.json. This closes the task, not the
unrelated formal orchestration stage mc2-sdjy8.
Rollback uses scripts/rollback_blue_green.sh with the failed deployment SHA.
Previous accepted production was f1742fe211f17933188eaf892ed02e438b04bb4e, green.

Docs-reviewed: updated; documentation-decision: compatible security versions
recorded in manifests/lockfile and delegated artifact, no API migration.
Graph-reviewed: blocked for refresh — no owned graph in the isolated checkout;
the dirty primary checkout and its graph remain read-only.
Security child worktree was clean and removed after dependency patch-id equality
and accepted develop delivery. Its source branch is retained for cherry-pick recovery.

## Explicit defers

mc2-5hqt3 tracks 11 moderate/1 low dependency advisories; high/critical are zero.
mc2-uhh07 tracks the release helper deleting rollback backups before commit;
its observed failed pre-commit left generated metadata staged. The formatter
was repaired locally and the intended release completed with normal hooks/tag/push.
No history rewrite or security-gate weakening was used.
