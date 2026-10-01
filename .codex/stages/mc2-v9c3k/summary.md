# mc2-v9c3k: Telegram price sync notification repair

Owner authorized deployment on 2026-10-01. Release is in progress.
Base: origin/develop 67c71c999cdc7412d6c0fba778087c6f4c6c03e4.
Source fixes: 208ba9186 (notification), 342f0381a (security gate unblock).

The workflow published rates before its price notice failed with HTTP 400.
Legacy Markdown opened an unclosed italic entity at max_price; the failure
notice succeeded because it already used plain text. Send the price notice
without markup parsing and log only descriptions from failed Telegram responses.

The unchanged security gate found 16 high advisories in four dependency families.
Update fast-uri, undici (6/7), brace-expansion (1/2), and Axios within their major
lines. Root inspected the exact manifest/lockfile diff and verified the child
content after cherry-pick. The root audit passes with 0 high/critical; 11 moderate
and 1 low remain tracked in mc2-5hqt3. No schema, secret or permission changes.

Acceptance: 9 focused workflow tests, Prettier, bash syntax, artifact validator,
audit and diff checks passed. Root type-check and full build passed; full CI is pending.
The standard CI/CD gate remains mandatory before production activation.
Rollback uses scripts/rollback_blue_green.sh with the exact failed deployment SHA.
Previous accepted production: f1742fe211f17933188eaf892ed02e438b04bb4e, green.

Docs-reviewed: updated; documentation-decision: security patch/minor versions
recorded in manifests/lockfile and delegated artifact, no API migration.
Graph-reviewed: blocked for refresh — no owned graph in the isolated checkout;
primary checkout is dirty and its graph remains read-only.
