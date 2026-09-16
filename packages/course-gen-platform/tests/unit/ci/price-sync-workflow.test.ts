import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflow = load(
  readFileSync(
    resolve(__dirname, '../../../../../.github/workflows/model-catalog-drift.yml'),
    'utf8'
  )
) as {
  jobs: {
    drift: {
      steps: Array<{
        id?: string;
        name?: string;
        run?: string;
        if?: string;
        'continue-on-error'?: boolean;
      }>;
    };
  };
};
const steps = workflow.jobs.drift.steps;
const drift = steps.find(step => step.id === 'drift')!;
const notification = steps.find(
  step => step.name === 'Say so in Telegram when the sync itself failed'
)!;

function inTemp<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(resolve(tmpdir(), 'price-sync-workflow-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('nightly price sync workflow', () => {
  it.each([1, 2])('propagates updater exit %i instead of claiming success', status => {
    inTemp(dir => {
      const result = spawnSync('bash', ['-c', `pnpm() { return ${status}; }\n${drift.run}`], {
        cwd: dir,
        env: { ...process.env, GITHUB_OUTPUT: resolve(dir, 'output') },
        encoding: 'utf8',
      });
      expect(result.status).toBe(status);
      expect(readFileSync(resolve(dir, 'output'), 'utf8')).toContain(`status=${status}`);
      expect(drift['continue-on-error']).not.toBe(true);
    });
  });

  it.each([0, 1])('records whether a successful update changed tracked rates (diff=%i)', diff => {
    inTemp(dir => {
      const result = spawnSync(
        'bash',
        ['-c', `pnpm() { return 0; }\ngit() { return ${diff}; }\n${drift.run}`],
        {
          cwd: dir,
          env: { ...process.env, GITHUB_OUTPUT: resolve(dir, 'output') },
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(0);
      expect(readFileSync(resolve(dir, 'output'), 'utf8')).toContain(`changed=${diff === 1}`);
      expect(steps.find(step => step.id === 'verify')?.if).toBe(
        "steps.drift.outputs.changed == 'true'"
      );
    });
  });

  it.each([
    ['verify', '', '', 'Проверки обновлённого каталога', 'Этот запуск не опубликовал'],
    ['drift', '2', '', 'Не удалось получить список цен OpenRouter', 'Этот запуск не опубликовал'],
    [
      'price_notice',
      '0',
      'success',
      'Не удалось отправить уведомление',
      'Обновлённые цены уже опубликованы',
    ],
  ])(
    'describes %s failure and publication state accurately',
    (failed, status, commit, reason, state) => {
      inTemp(dir => {
        execFileSync(
          'bash',
          ['-c', `curl() { printf '%s\\n' "$@" > "$CAPTURE"; }\n${notification.run}`],
          {
            cwd: dir,
            env: {
              ...process.env,
              CAPTURE: resolve(dir, 'message'),
              STEP_RESULTS: JSON.stringify({ [failed]: { outcome: 'failure' } }),
              DRIFT_STATUS: status,
              COMMIT_OUTCOME: commit,
              TELEGRAM_BOT_TOKEN: 'test',
              TELEGRAM_CHAT_ID: 'test',
              GITHUB_SERVER_URL: 'https://example.test',
              GITHUB_REPOSITORY: 'test/repo',
              GITHUB_RUN_ID: '123',
            },
          }
        );
        const payload = readFileSync(resolve(dir, 'message'), 'utf8');
        expect(payload).toContain(reason);
        expect(payload).toContain(state);
        expect(payload).not.toContain('было отменено по таймауту');
      });
    }
  );
});
