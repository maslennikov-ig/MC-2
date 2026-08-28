/**
 * Contract: every variable the dev compose file demands is one the dev deploy writes.
 *
 * `.env.dev` is rewritten from scratch on every dev deploy, from one heredoc in
 * `.github/workflows/ci-cd.yml`. So a variable the compose file requires and that
 * block does not write simply is not there — and `${VAR:?...}` makes Docker Compose
 * refuse the whole deploy rather than mount a wrong path.
 *
 * That is what happened on 2026-08-28: `QDRANT_METRICS_TEXTFILE_HOST_DIR` was added to
 * the dev services (mc2-kim48) in the required form copied from the staging compose,
 * and nothing wrote it. Every test in the pipeline was green — unit, integration,
 * contract, type-check, build, lint — and `Deploy to Dev` died in 36 seconds on
 * `required variable QDRANT_METRICS_TEXTFILE_HOST_DIR is missing a value`. The two
 * files have to agree and nothing made them.
 *
 * The `:?` form stays: a silent default would have mounted some other directory and
 * published metrics nobody scrapes, which is worse than a refusal. What was missing is
 * this check.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const source = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8');

/** Every `${VAR:?...}` in a compose file — the ones a deploy cannot do without. */
export function requiredVariables(compose: string): string[] {
  return [
    ...new Set(
      [...compose.matchAll(/\$\{([A-Z0-9_]+):\?[^}]*\}/gu)].map(match => match[1] as string)
    ),
  ].sort();
}

/**
 * The names the dev deploy's heredoc writes into `.env.dev`.
 *
 * Read from the block itself rather than from a hand-kept list, so the check cannot
 * pass because somebody updated the list and not the deploy.
 */
function devEnvNames(workflow: string): Set<string> {
  const opener = "cat > ${{ env.DEPLOY_PATH }}/.env.dev << 'ENVEOF'";
  const start = workflow.indexOf(opener);
  expect(start, 'the dev .env heredoc moved; this check is reading nothing').toBeGreaterThan(-1);
  // The whole step, not just the heredoc. Some values cannot come from the heredoc at
  // all: it is quoted, so it does not expand, and `QDRANT_METRICS_GID` is read from
  // the host with `stat` and appended afterwards. Reading only the heredoc would call
  // that variable missing and push it back into a form that cannot work.
  const end = workflow.indexOf('\n      - name:', start);
  const step = workflow.slice(start, end < 0 ? undefined : end);

  const names = new Set<string>();
  for (const line of step.split('\n').map(text => text.trim())) {
    // A plain `NAME=value` line inside the heredoc.
    const direct = /^([A-Z0-9_]+)=/u.exec(line);
    if (direct) names.add(direct[1]);
    // An `echo "NAME=..." >> .env.dev` appended after it.
    if (line.includes('.env.dev')) {
      for (const match of line.matchAll(/([A-Z0-9_]+)=\\?\$/gu)) names.add(match[1]);
    }
  }
  return names;
}

describe('the dev deploy writes every variable the dev compose file requires', () => {
  const compose = source('docker-compose.dev.yml');
  const workflow = source('.github/workflows/ci-cd.yml');

  it('is looking at the two files it means to be looking at', () => {
    expect(compose).toContain('worker-stage6-dev:');
    expect(devEnvNames(workflow).size).toBeGreaterThan(20);
  });

  it('leaves no required variable unwritten', () => {
    const written = devEnvNames(workflow);
    const missing = requiredVariables(compose).filter(name => !written.has(name));

    expect(missing).toEqual([]);
  });

  it('would have caught the deploy that failed', () => {
    // The exact shape, in miniature: a service demanding a variable, and a heredoc
    // that writes a different one.
    const brokenCompose = `
    volumes:
      - \${QDRANT_METRICS_TEXTFILE_HOST_DIR:?QDRANT_METRICS_TEXTFILE_HOST_DIR must be set}:/var/lib/megacampus/qdrant-metrics
    `;

    expect(requiredVariables(brokenCompose)).toEqual(['QDRANT_METRICS_TEXTFILE_HOST_DIR']);
    expect(new Set(['REDIS_URL']).has('QDRANT_METRICS_TEXTFILE_HOST_DIR')).toBe(false);
  });
});
