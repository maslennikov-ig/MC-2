import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const DEPLOY = resolve(REPO_ROOT, 'scripts/deploy_blue_green.sh');
const ROLLBACK = resolve(REPO_ROOT, 'scripts/rollback_blue_green.sh');
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const RELEASE_SHA = 'a'.repeat(40);
const PREVIOUS_SHA = 'b'.repeat(40);

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface Harness {
  base: string;
  runRoot: string;
  quiesceManifest: string;
  dockerLog: string;
  nginxConfig: string;
  env: NodeJS.ProcessEnv;
  binDir: string;
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body, { mode: 0o755 });
  chmodSync(path, 0o755);
}

function harness(activeColor?: 'blue' | 'green'): Harness {
  const base = mkdtempSync(join(tmpdir(), 'mc2-q12-handoff-'));
  temporaryDirectories.push(base);
  const runRoot = join(base, 'backups', 'q12', RUN_ID);
  mkdirSync(runRoot, { recursive: true });

  // Synthetic Compose/nginx assets referenced by the wrapper.
  for (const compose of [
    'docker-compose.infra.yml',
    'docker-compose.app.yml',
    'docker-compose.production.yml',
  ]) {
    writeFileSync(join(base, compose), 'services: {}\n');
  }
  for (const envName of ['.env.production', '.env.blue', '.env.green']) {
    writeFileSync(join(base, envName), 'COLOR=placeholder\n');
  }
  writeFileSync(
    join(base, 'nginx.conf.template'),
    'server { listen {{WEB_PORT}}; # {{COLOR}} api {{API_PORT}}; }\n'
  );
  if (activeColor) {
    writeFileSync(join(base, 'active_color'), `${activeColor}\n`);
  }

  // Bound, quiesced writer-quiesce manifest for this run.
  const writers = Array.from({ length: 10 }, (_, index) => ({
    class: 'production-worker',
    id: `${index}`.repeat(64).slice(0, 64),
    name: `writer-${index}`,
  }));
  const quiesceManifest = join(runRoot, `writer-quiesce-${RUN_ID}.json`);
  writeFileSync(
    quiesceManifest,
    `${JSON.stringify({
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: RUN_ID,
      status: 'quiesced',
      writers,
    })}\n`
  );

  // Stub docker/nginx/curl on PATH: docker logs argv and returns a restart=no
  // identity for inspect; nginx succeeds; curl exposes only the healthy
  // Docling facade endpoint used by the prepare handoff.
  const binDir = join(base, 'bin');
  mkdirSync(binDir);
  const dockerLog = join(base, 'docker.log');
  writeExecutable(
    join(binDir, 'docker'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$DOCKER_LOG"',
      'if [ "$1" = "inspect" ]; then',
      '  echo "containerdeadbeef imagesha256cafef00d no 0"',
      'fi',
      'exit 0',
      '',
    ].join('\n')
  );
  writeExecutable(
    join(binDir, 'nginx'),
    [
      '#!/usr/bin/env bash',
      // Fault injection: when NGINX_FAIL is set, `nginx -s reload` fails so the
      // switch window (config written, reload failing) can be exercised.
      'if [ -n "${NGINX_FAIL:-}" ] && [ "$1" = "-s" ]; then exit 1; fi',
      'exit 0',
      '',
    ].join('\n')
  );
  writeExecutable(
    join(binDir, 'curl'),
    [
      '#!/usr/bin/env bash',
      'case " $* " in',
      '  *" http://127.0.0.1:8000/health "*) exit 0 ;;',
      '  *) echo "unexpected curl invocation: $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n')
  );
  const nginxConfig = join(base, 'nginx.conf.installed');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    BASE_PATH: base,
    NGINX_CONFIG_PATH: nginxConfig,
    Q12_NGINX_CMD: 'nginx',
    Q12_NGINX_TEE: 'tee',
    DOCKER_LOG: dockerLog,
  };

  return { base, runRoot, quiesceManifest, dockerLog, nginxConfig, env, binDir };
}

function writeActivationReceipt(h: Harness): void {
  writeFileSync(
    join(h.runRoot, 'database-barrier-receipt.json'),
    `${JSON.stringify({
      schema_version: 'megacampus.q12.database-barrier-receipt/v1',
      run_id: RUN_ID,
      state: 'activated',
      zero_guard_residue: true,
      expected_catalog_sha256: 'c'.repeat(64),
      last_command: 'activate',
      rollback_probes_verified: false,
      probe_receipt_sha256: null,
    })}\n`
  );
}

function runDeploy(h: Harness, mode: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    'bash',
    [
      DEPLOY,
      '--q12-mode',
      mode,
      '--run-id',
      RUN_ID,
      '--release-sha',
      RELEASE_SHA,
      '--external-quiesce-manifest',
      h.quiesceManifest,
    ],
    { env: h.env, encoding: 'utf8' }
  );
}

function recoveryPath(h: Harness): string {
  return join(h.runRoot, `deploy-handoff-recovery-${RUN_ID}.json`);
}

function recoveryState(h: Harness): Record<string, unknown> {
  return JSON.parse(readFileSync(recoveryPath(h), 'utf8')) as Record<string, unknown>;
}

function dockerLog(h: Harness): string {
  return existsSync(h.dockerLog) ? readFileSync(h.dockerLog, 'utf8') : '';
}

function recoveryTempResidue(h: Harness): string[] {
  return readdirSync(h.runRoot).filter(name => name.startsWith('.deploy-handoff-recovery.'));
}

function runDeployWithSha(h: Harness, mode: string, sha: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    'bash',
    [
      DEPLOY,
      '--q12-mode',
      mode,
      '--run-id',
      RUN_ID,
      '--release-sha',
      sha,
      '--external-quiesce-manifest',
      h.quiesceManifest,
    ],
    { env: h.env, encoding: 'utf8' }
  );
}

describe('Q12 quiesce-aware blue/green handoff wrapper', () => {
  it('leaves normal deploy mode byte-for-command compatible', () => {
    const h = harness('blue');
    const result = spawnSync('bash', [DEPLOY, 'production', 'latest'], {
      env: h.env,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('TAG must be an immutable commit tag');
  });

  it('leaves normal rollback mode byte-for-command compatible', () => {
    const h = harness('blue');
    const result = spawnSync('bash', [ROLLBACK, 'production', 'latest'], {
      env: h.env,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact 40-character release commit');
  });

  describe('prepare-quiesced', () => {
    it('creates target web/api without starting them, pins restart=no, and never touches Nginx', () => {
      const h = harness('blue');
      const result = runDeploy(h, 'prepare-quiesced');
      expect(result.status, result.stderr).toBe(0);
      const log = dockerLog(h);
      expect(log).toContain('up --no-start web api');
      expect(log).toContain('update --restart=no megacampus-web-green');
      expect(log).toContain('update --restart=no megacampus-api-green');
      // No writer is ever started during prepare.
      expect(log).not.toMatch(/up -d[^\n]*\bweb api\b/);
      expect(log).not.toMatch(/^start /m);
      // Nginx and active color remain untouched.
      expect(existsSync(h.nginxConfig)).toBe(false);
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('blue');
      const recovery = recoveryState(h);
      expect(recovery.state).toBe('prepared');
      expect(recovery.target_color).toBe('green');
      expect(recovery.nginx_switched).toBe('false');
      expect(Array.isArray(recovery.targets)).toBe(true);
      expect((recovery.targets as unknown[]).length).toBe(2);
      // The recovery manifest is published atomically: no temp residue remains.
      expect(recoveryTempResidue(h)).toHaveLength(0);
    });

    it('refuses to prepare once the run is already activated', () => {
      const h = harness('blue');
      writeActivationReceipt(h);
      const result = runDeploy(h, 'prepare-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('already activated');
    });

    it('refuses to re-prepare once commit has advanced the run', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      expect(runDeploy(h, 'commit-quiesced').status).toBe(0);
      const logAfterCommit = dockerLog(h);
      const result = runDeploy(h, 'prepare-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('already exists');
      // No fresh docker mutation and the advanced manifest is not clobbered.
      expect(dockerLog(h)).toBe(logAfterCommit);
      expect(recoveryState(h).state).toBe('activation_ready');
    });
  });

  describe('commit-quiesced', () => {
    it('switches Nginx and creates workers without starting them', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      const result = runDeploy(h, 'commit-quiesced');
      expect(result.status, result.stderr).toBe(0);
      const log = dockerLog(h);
      expect(log).toContain('up --no-start worker worker-stage6');
      expect(log).toContain('up --no-start worker-stage7');
      expect(log).toContain('update --restart=no megacampus-worker');
      // No worker is started during commit.
      expect(log).not.toMatch(/up -d[^\n]*worker/);
      expect(log).not.toMatch(/^start /m);
      // Nginx is switched and the active color advances to the target.
      expect(existsSync(h.nginxConfig)).toBe(true);
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('green');
      const recovery = recoveryState(h);
      expect(recovery.state).toBe('activation_ready');
      expect(recovery.nginx_switched).toBe('true');
      expect((recovery.workers as unknown[]).length).toBe(3);
      expect(recoveryTempResidue(h)).toHaveLength(0);
    });

    it('durably records the Nginx switch intent before moving Nginx', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      // Inject a reload failure so commit aborts inside the switch window.
      const result = spawnSync(
        'bash',
        [
          DEPLOY,
          '--q12-mode',
          'commit-quiesced',
          '--run-id',
          RUN_ID,
          '--release-sha',
          RELEASE_SHA,
          '--external-quiesce-manifest',
          h.quiesceManifest,
        ],
        { env: { ...h.env, NGINX_FAIL: '1' }, encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      // The intent marker must be durable even though the switch failed, so a
      // later rollback can recognise that Nginx may already be on the target.
      const recovery = recoveryState(h);
      expect(recovery.nginx_switch_intent).toBe('true');
      expect(recovery.nginx_switched).not.toBe('true');
    });

    it('refuses to commit when release-sha differs from the prepared manifest', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      const result = runDeployWithSha(h, 'commit-quiesced', 'd'.repeat(40));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('release-sha');
      // Fails before any Nginx mutation.
      expect(existsSync(h.nginxConfig)).toBe(false);
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('blue');
    });

    it('refuses to commit without a durable prepared state', () => {
      const h = harness('blue');
      const result = runDeploy(h, 'commit-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('requires a durable prepared');
    });

    it('refuses to commit once the run is already activated', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      writeActivationReceipt(h);
      const result = runDeploy(h, 'commit-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('already activated');
    });
  });

  describe('finalize-quiesced', () => {
    it('requires the activation receipt and starts no container', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      expect(runDeploy(h, 'commit-quiesced').status).toBe(0);
      const logBefore = dockerLog(h);
      writeActivationReceipt(h);
      const result = runDeploy(h, 'finalize-quiesced');
      expect(result.status, result.stderr).toBe(0);
      // Finalize performs no docker mutation at all.
      expect(dockerLog(h)).toBe(logBefore);
      expect(recoveryState(h).state).toBe('handoff_ready');
    });

    it('refuses to finalize before the activation receipt exists', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      expect(runDeploy(h, 'commit-quiesced').status).toBe(0);
      const result = runDeploy(h, 'finalize-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('activation receipt is absent');
    });

    it('refuses to finalize without a durable activation_ready state', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      writeActivationReceipt(h);
      const result = runDeploy(h, 'finalize-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('requires a durable activation_ready');
    });
  });

  describe('fail-closed input validation', () => {
    const cases: Array<[string, string[], string]> = [
      [
        'rejects a non-UUID run-id',
        ['--q12-mode', 'prepare-quiesced', '--run-id', 'not-a-uuid', '--release-sha', RELEASE_SHA],
        'run-id must be a canonical',
      ],
      [
        'rejects a short release sha',
        ['--q12-mode', 'prepare-quiesced', '--run-id', RUN_ID, '--release-sha', 'abc'],
        'release-sha must be 40',
      ],
      [
        'rejects an unknown mode',
        ['--q12-mode', 'teleport', '--run-id', RUN_ID, '--release-sha', RELEASE_SHA],
        'unknown Q12 handoff mode',
      ],
      [
        'rejects an unexpected argument',
        ['--q12-mode', 'prepare-quiesced', '--surprise', 'x'],
        'unexpected Q12 handoff argument',
      ],
    ];
    for (const [name, args, expected] of cases) {
      it(name, () => {
        const h = harness('blue');
        const result = spawnSync('bash', [DEPLOY, ...args], { env: h.env, encoding: 'utf8' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(expected);
      });
    }

    it('rejects a relative external-quiesce-manifest', () => {
      const h = harness('blue');
      const result = spawnSync(
        'bash',
        [
          DEPLOY,
          '--q12-mode',
          'prepare-quiesced',
          '--run-id',
          RUN_ID,
          '--release-sha',
          RELEASE_SHA,
          '--external-quiesce-manifest',
          'relative/path.json',
        ],
        { env: h.env, encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('must be an absolute path');
    });

    it('rejects an external-quiesce-manifest that is not the run manifest', () => {
      const h = harness('blue');
      const other = join(h.base, 'elsewhere.json');
      writeFileSync(other, '{}\n');
      const result = spawnSync(
        'bash',
        [
          DEPLOY,
          '--q12-mode',
          'prepare-quiesced',
          '--run-id',
          RUN_ID,
          '--release-sha',
          RELEASE_SHA,
          '--external-quiesce-manifest',
          other,
        ],
        { env: h.env, encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('not the run');
    });

    it('rejects a missing run root', () => {
      const h = harness('blue');
      rmSync(h.runRoot, { recursive: true, force: true });
      const result = runDeploy(h, 'prepare-quiesced');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('run root is missing');
    });
  });

  describe('phase-aware rollback', () => {
    function runRollback(h: Harness): ReturnType<typeof spawnSync> {
      return spawnSync(
        'bash',
        [
          ROLLBACK,
          'production',
          PREVIOUS_SHA,
          '--q12-run-id',
          RUN_ID,
          '--external-quiesce-manifest',
          h.quiesceManifest,
        ],
        { env: h.env, encoding: 'utf8' }
      );
    }

    it('restores Nginx to the previous color after a pre-activation commit', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      expect(runDeploy(h, 'commit-quiesced').status).toBe(0);
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('green');
      const result = runRollback(h);
      expect(result.status, result.stderr).toBe(0);
      // Nginx and active color are restored to blue; no writer is started.
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('blue');
      expect(dockerLog(h)).not.toMatch(/^start /m);
      expect(recoveryState(h).state).toBe('rollback_preparing');
    });

    it('is a no-op traffic change when commit had not switched Nginx', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      const result = runRollback(h);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('no traffic change required');
      expect(recoveryState(h).state).toBe('rollback_preparing');
    });

    it('restores Nginx when the active color diverges even without a durable switch flag', () => {
      const h = harness('blue');
      // Model a commit that moved Nginx to green and advanced active_color, then
      // crashed before durably recording nginx_switched=true (only the intent
      // marker survived).
      writeFileSync(
        recoveryPath(h),
        `${JSON.stringify({
          schema_version: 'megacampus.q12.deploy-handoff-recovery/v1',
          run_id: RUN_ID,
          release_sha: RELEASE_SHA,
          state: 'prepared',
          target_color: 'green',
          previous_active_color: 'blue',
          nginx_switched: 'false',
          nginx_switch_intent: 'true',
        })}\n`
      );
      writeFileSync(join(h.base, 'active_color'), 'green\n');
      const result = runRollback(h);
      expect(result.status, result.stderr).toBe(0);
      // The diverged active color is corrected back to the serving color and
      // Nginx is rewritten; no writer is started.
      expect(readFileSync(join(h.base, 'active_color'), 'utf8').trim()).toBe('blue');
      expect(existsSync(h.nginxConfig)).toBe(true);
      expect(dockerLog(h)).not.toMatch(/^start /m);
      expect(recoveryState(h).state).toBe('rollback_preparing');
    });

    it('is finish-forward only and refuses after activation is committed', () => {
      const h = harness('blue');
      expect(runDeploy(h, 'prepare-quiesced').status).toBe(0);
      expect(runDeploy(h, 'commit-quiesced').status).toBe(0);
      writeActivationReceipt(h);
      const result = runRollback(h);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('finish-forward only');
    });
  });
});
