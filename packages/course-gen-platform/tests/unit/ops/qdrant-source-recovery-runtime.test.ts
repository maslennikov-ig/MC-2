import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const WRAPPER = resolve(REPO_ROOT, 'deploy/qdrant/source-recovery-run.sh');
const ENTRYPOINT = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
);
const SERVICES = [
  'megacampus-api',
  'megacampus-api-blue',
  'megacampus-api-green',
  'megacampus-worker',
  'megacampus-worker-stage6',
  'megacampus-worker-stage7',
] as const;
const temporaryDirectories: string[] = [];

function source(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function temporaryDirectory(label: string): string {
  const directory = mkdtempSync(`/tmp/mc2-${label}-`);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function renderInfraCompose(): Record<string, any> {
  const directory = temporaryDirectory('source-recovery-compose');
  const envFile = join(directory, 'compose.env');
  const state = join(directory, 'state');
  const progress = join(state, 'progress');
  const development = join(directory, 'uploads-dev');
  const production = join(directory, 'uploads');
  const capability = join(directory, 'source-recovery-capability');
  for (const path of [state, progress, development, production, capability]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  for (const name of ['qdrant_api_key', 'qdrant_read_only_api_key']) {
    writeFileSync(join(directory, name), `synthetic-${name}\n`, { mode: 0o400 });
  }
  const planInput = join(directory, 'plan-input.json');
  const manifest = join(state, 'manifest.json');
  writeFileSync(planInput, '{}\n', { mode: 0o400 });
  writeFileSync(manifest, '{}\n', { mode: 0o400 });
  writeFileSync(
    envFile,
    [
      `PRODUCTION_ENV_FILE=${envFile}`,
      `QDRANT_API_KEY_FILE=${join(directory, 'qdrant_api_key')}`,
      `QDRANT_READ_ONLY_API_KEY_FILE=${join(directory, 'qdrant_read_only_api_key')}`,
      'QDRANT_SNAPSHOT_STORAGE_MODE=local',
      `QDRANT_METRICS_TEXTFILE_HOST_DIR=${directory}`,
      'QDRANT_METRICS_GID=2001',
      'QDRANT_OPERATOR_IMAGE_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      `SOURCE_RECOVERY_STATE_HOST_DIR=${state}`,
      `SOURCE_RECOVERY_PROGRESS_HOST_DIR=${progress}`,
      `SOURCE_RECOVERY_PLAN_INPUT_FILE=${planInput}`,
      `SOURCE_RECOVERY_MANIFEST_FILE=${manifest}`,
      `SOURCE_RECOVERY_DEVELOPMENT_UPLOAD_ROOT=${development}`,
      `SOURCE_RECOVERY_PRODUCTION_UPLOAD_ROOT=${production}`,
      `SOURCE_RECOVERY_CAPABILITY_HOST_DIR=${capability}`,
      'SUPABASE_URL=http://127.0.0.1:54321',
      'SUPABASE_SERVICE_KEY=synthetic-service-key',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );

  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.infra.yml',
      '--env-file',
      envFile,
      '--profile',
      'operator',
      'config',
      '--format',
      'json',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toContain('synthetic-qdrant_api_key');
  return JSON.parse(result.stdout) as Record<string, any>;
}

function volume(service: Record<string, any>, target: string): Record<string, any> | undefined {
  return service.volumes?.find((candidate: Record<string, any>) => candidate.target === target);
}

describe('Q12 source-recovery operator isolation', () => {
  it('renders the planner, executor, and disposition one-shots with exact isolation', () => {
    const model = renderInfraCompose();
    const planner = model.services['qdrant-source-recovery-planner'];
    const executor = model.services['qdrant-source-recovery-executor'];
    const disposition = model.services['qdrant-source-recovery-disposition'];

    for (const service of [planner, executor, disposition]) {
      expect(service.image).toMatch(/qdrant-operator@sha256:[a-f0-9]{64}$/u);
      expect(service.profiles).toEqual(['operator']);
      expect(service.read_only).toBe(true);
      expect(service.cap_drop).toContain('ALL');
      expect(service.tmpfs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^\/tmp(?::|$)/u),
          expect.stringMatching(/^\/run\/qdrant-operator(?::|$)/u),
        ])
      );
      expect(service.restart).toBe('no');
      expect(service.secrets).toBeUndefined();
      expect(service.environment.QDRANT_API_KEY ?? '').toBe('');
      expect(service.environment.QDRANT_API_KEY_FILE ?? '').toBe('');
    }

    expect(planner.networks).toHaveProperty('megacampus');
    expect(volume(planner, '/opt/megacampus/data/uploads-dev')?.read_only).toBe(true);
    expect(volume(planner, '/opt/megacampus/data/uploads')?.read_only).toBe(true);
    expect(volume(planner, '/run/source-recovery/capability')).toMatchObject({
      type: 'bind',
    });
    expect(volume(planner, '/run/source-recovery/capability')?.read_only ?? false).toBe(false);
    expect(volume(planner, '/run/source-recovery/plan-input.json')?.read_only).toBe(true);
    expect(
      planner.volumes
        .filter((candidate: Record<string, any>) => !(candidate.read_only ?? false))
        .map((candidate: Record<string, any>) => candidate.target)
        .sort()
    ).toEqual(['/run/source-recovery/capability', '/var/lib/megacampus-source-recovery']);

    expect(executor.network_mode).toBe('none');
    expect(executor.env_file).toBeUndefined();
    expect(executor.user).toBe('1001:1001');
    expect(volume(executor, '/opt/megacampus/data/uploads-dev')?.read_only).toBe(true);
    expect(volume(executor, '/opt/megacampus/data/uploads')?.read_only ?? false).toBe(false);
    expect(volume(executor, '/run/source-recovery/manifest.json')?.read_only).toBe(true);
    expect(volume(executor, '/run/source-recovery/progress')?.read_only ?? false).toBe(false);
    expect(
      executor.volumes.map((candidate: Record<string, any>) => candidate.target).sort()
    ).toEqual([
      '/opt/megacampus/data/uploads',
      '/opt/megacampus/data/uploads-dev',
      '/run/source-recovery/manifest.json',
      '/run/source-recovery/progress',
    ]);

    expect(disposition.networks).toHaveProperty('megacampus');
    expect(disposition.volumes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: expect.stringContaining('/uploads') }),
      ])
    );
    expect(volume(disposition, '/run/source-recovery/manifest.json')?.read_only).toBe(true);
    expect(volume(disposition, '/run/source-recovery/progress')?.read_only ?? false).toBe(false);
    expect(
      disposition.volumes.map((candidate: Record<string, any>) => candidate.target).sort()
    ).toEqual(['/run/source-recovery/manifest.json', '/run/source-recovery/progress']);
  });

  it('exposes all source-recovery modes without staging a Qdrant credential', () => {
    const help = spawnSync('bash', [ENTRYPOINT, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain(
      'source-recovery plan|verify|execute|rollback|apply-dispositions|verify-dispositions'
    );

    const entrypoint = source('packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh');
    expect(entrypoint).toContain('tools/qdrant/source-recovery.ts');
    expect(entrypoint).toContain('unset QDRANT_API_KEY QDRANT_API_KEY_FILE');
    expect(entrypoint).toMatch(/source-recovery\)[\s\S]*require_source_recovery_arguments/);
    expect(entrypoint).not.toMatch(
      /source-recovery\)[\s\S]{0,500}(?:stage_api_key_for_file_client|load_raw_api_key)/
    );

    const dockerfile = source('packages/course-gen-platform/Dockerfile');
    expect(dockerfile).toContain('qdrant-operator-entrypoint.sh source-recovery --help');
  });
});

interface WrapperFixture {
  directory: string;
  env: NodeJS.ProcessEnv;
  args: string[];
  statePath(service: string): string;
  composeLog: string;
  systemctlLog: string;
}

function wrapperFixture(active: readonly string[] = []): WrapperFixture {
  const directory = temporaryDirectory('source-recovery-wrapper');
  const bin = join(directory, 'bin');
  const serviceState = join(directory, 'service-state');
  const project = join(directory, 'project');
  const development = join(project, 'data/uploads-dev');
  const production = join(project, 'data/uploads');
  const capability = join(project, 'data/source-recovery-capability');
  const state = join(directory, 'state');
  const progress = join(state, 'progress');
  for (const path of [bin, serviceState, development, production, capability, progress]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  chmodSync(capability, 0o700);
  const systemctlLog = join(directory, 'systemctl.log');
  const composeLog = join(directory, 'compose.log');
  writeFileSync(join(project, 'docker-compose.infra.yml'), 'services: {}\n', { mode: 0o600 });
  for (const service of SERVICES) {
    writeFileSync(
      join(serviceState, service),
      active.includes(service) ? 'active\n' : 'inactive\n'
    );
  }

  const systemctl = join(bin, 'systemctl');
  writeFileSync(
    systemctl,
    `#!/usr/bin/env bash
set -euo pipefail
command="$1"; service="\${2:-}"
printf '%s %s\n' "$command" "$service" >> "$SYSTEMCTL_LOG"
case "$command" in
  is-active) cat "$SERVICE_STATE/$service" ;;
  stop) printf 'inactive\n' > "$SERVICE_STATE/$service" ;;
  start) printf 'active\n' > "$SERVICE_STATE/$service" ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o700 }
  );
  const docker = join(bin, 'docker');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$1 $2 $3" == 'context inspect default' ]]
printf 'unix:///var/run/docker.sock\n'
`,
    { mode: 0o700 }
  );
  const compose = join(bin, 'operator-compose');
  writeFileSync(
    compose,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$COMPOSE_LOG"
if [[ -n "\${SOURCE_RECOVERY_TEST_SLEEP:-}" ]]; then sleep "$SOURCE_RECOVERY_TEST_SLEEP"; fi
if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_MODE:-}" && "$*" == *" \${SOURCE_RECOVERY_TEST_FAIL_MODE} "* ]]; then exit 71; fi
if [[ "$*" == *' qdrant-source-recovery-planner source-recovery plan' ]]; then
  printf '{}\n' > "$SOURCE_RECOVERY_MANIFEST_FILE"
  chmod 0400 "$SOURCE_RECOVERY_MANIFEST_FILE"
  printf '{}\n' > "$SOURCE_RECOVERY_PROGRESS_HOST_DIR/journal.json"
  chmod 0600 "$SOURCE_RECOVERY_PROGRESS_HOST_DIR/journal.json"
  if [[ -n "\${SOURCE_RECOVERY_TEST_CAPABILITY_RESIDUE:-}" ]]; then
    touch "$SOURCE_RECOVERY_CAPABILITY_HOST_DIR/residue"
  fi
fi
`,
    { mode: 0o700 }
  );
  const envFile = join(directory, 'operator.env');
  const planInput = join(directory, 'plan-input.json');
  const manifest = join(state, 'manifest.json');
  writeFileSync(
    envFile,
    'QDRANT_OPERATOR_IMAGE_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n'
  );
  writeFileSync(planInput, '{}\n', { mode: 0o600 });

  return {
    directory,
    statePath: service => join(serviceState, service),
    composeLog,
    systemctlLog,
    env: {
      PATH: process.env.PATH,
      SOURCE_RECOVERY_SYSTEMCTL_BIN: systemctl,
      SOURCE_RECOVERY_DOCKER_BIN: docker,
      SOURCE_RECOVERY_COMPOSE_BIN: compose,
      SOURCE_RECOVERY_LOCK_FILE: join(directory, 'source-recovery.lock'),
      SOURCE_RECOVERY_EXPECTED_UID: String(process.getuid?.() ?? 1000),
      SOURCE_RECOVERY_EXPECTED_GID: String(process.getgid?.() ?? 1000),
      SOURCE_RECOVERY_LOCAL_TEST: '1',
      SYSTEMCTL_LOG: systemctlLog,
      SERVICE_STATE: serviceState,
      COMPOSE_LOG: composeLog,
    },
    args: [
      '--run-id',
      '123e4567-e89b-42d3-a456-426614174000',
      '--project-directory',
      project,
      '--env-file',
      envFile,
      '--plan-input',
      planInput,
      '--manifest',
      manifest,
      '--progress-directory',
      progress,
      '--development-root',
      development,
      '--production-root',
      production,
      '--capability-directory',
      capability,
    ],
  };
}

function states(fixture: WrapperFixture): Record<string, string> {
  return Object.fromEntries(
    SERVICES.map(service => [service, readFileSync(fixture.statePath(service), 'utf8').trim()])
  );
}

describe('Q12 source-recovery host lock and writer restoration', () => {
  it('uses the fixed production lock and exact six writer names', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    expect(wrapper).toContain('/run/megacampus-qdrant-source-recovery/source-recovery.lock');
    expect(wrapper).toContain("readonly NODE_UID='1001'");
    expect(wrapper).toContain("readonly NODE_GID='1001'");
    for (const service of SERVICES) expect(wrapper).toContain(service);
    expect(wrapper).toContain('flock -n');
    expect(wrapper).toContain('DOCKER_HOST');
    expect(wrapper).toContain('unix://');
  });

  it('refuses active writers without the explicit wrapper-controlled stop sequence', () => {
    const fixture = wrapperFixture(['megacampus-api', 'megacampus-worker-stage7']);
    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('active writer services');
    expect(states(fixture)).toMatchObject({
      'megacampus-api': 'active',
      'megacampus-worker-stage7': 'active',
    });
  });

  it('rejects a capability directory with the wrong owner mode or cleanup residue', () => {
    const unsafeMode = wrapperFixture();
    chmodSync(unsafeMode.args.at(-1)!, 0o755);
    const modeResult = spawnSync('bash', [WRAPPER, ...unsafeMode.args], {
      env: unsafeMode.env,
      encoding: 'utf8',
    });
    expect(modeResult.status).not.toBe(0);
    expect(modeResult.stderr).toContain('capability directory must be owned by UID:GID 1001:1001');

    const residue = wrapperFixture();
    const residueResult = spawnSync('bash', [WRAPPER, ...residue.args], {
      env: { ...residue.env, SOURCE_RECOVERY_TEST_CAPABILITY_RESIDUE: '1' },
      encoding: 'utf8',
    });
    expect(residueResult.status).not.toBe(0);
    expect(residueResult.stderr).toContain('planner left capability probe residue');
  });

  it.each([
    ['success', undefined],
    ['failed execute', 'execute'],
  ])('restores every exact prior active/inactive state after %s', (_label, failMode) => {
    const active = ['megacampus-api-blue', 'megacampus-worker-stage6'];
    const fixture = wrapperFixture(active);
    const before = states(fixture);
    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_TEST_FAIL_MODE: failMode,
      },
      encoding: 'utf8',
    });
    expect(result.status === 0).toBe(failMode === undefined);
    expect(states(fixture)).toEqual(before);
    const log = readFileSync(fixture.systemctlLog, 'utf8');
    expect(log).toContain('stop megacampus-api-blue');
    expect(log).toContain('start megacampus-api-blue');
    expect(log).toContain('stop megacampus-worker-stage6');
    expect(log).toContain('start megacampus-worker-stage6');
  });

  it('resumes reviewed protected state without silently replanning', () => {
    const fixture = wrapperFixture();
    const manifest = fixture.args[fixture.args.indexOf('--manifest') + 1];
    const progress = fixture.args[fixture.args.indexOf('--progress-directory') + 1];
    writeFileSync(manifest, '{}\n', { mode: 0o400 });
    writeFileSync(join(progress, 'journal.json'), '{}\n', { mode: 0o600 });

    const result = spawnSync('bash', [WRAPPER, '--resume-from', 'execute', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const composeLog = readFileSync(fixture.composeLog, 'utf8');
    expect(composeLog).not.toContain('qdrant-source-recovery-planner source-recovery plan');
    expect(composeLog).toContain('qdrant-source-recovery-executor source-recovery execute');
    expect(composeLog).toContain(
      'qdrant-source-recovery-disposition source-recovery verify-dispositions'
    );
  });

  it('reruns copy verification before every disposition-stage resume', () => {
    const fixture = wrapperFixture();
    const manifest = fixture.args[fixture.args.indexOf('--manifest') + 1];
    const progress = fixture.args[fixture.args.indexOf('--progress-directory') + 1];
    writeFileSync(manifest, '{}\n', { mode: 0o400 });
    writeFileSync(join(progress, 'journal.json'), '{}\n', { mode: 0o600 });

    const result = spawnSync(
      'bash',
      [WRAPPER, '--resume-from', 'apply-dispositions', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    const composeLog = readFileSync(fixture.composeLog, 'utf8');
    const verify = composeLog.indexOf('qdrant-source-recovery-planner source-recovery verify');
    const apply = composeLog.indexOf(
      'qdrant-source-recovery-disposition source-recovery apply-dispositions'
    );
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(apply).toBeGreaterThan(verify);
    expect(composeLog).not.toContain('qdrant-source-recovery-executor source-recovery execute');
  });

  it('holds one non-blocking flock across the complete command chain', async () => {
    const fixture = wrapperFixture();
    const first = spawn('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_TEST_SLEEP: '0.2' },
      stdio: 'pipe',
    });
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
    const second = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('another source-recovery run holds');
    await new Promise<void>((resolveExit, reject) => {
      first.once('error', reject);
      first.once('exit', code => (code === 0 ? resolveExit() : reject(new Error(`exit ${code}`))));
    });
  });

  it('restores exact writer state when the controlled sequence receives SIGTERM', async () => {
    const fixture = wrapperFixture(['megacampus-api-green']);
    const before = states(fixture);
    const child = spawn('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_TEST_SLEEP: '5' },
      detached: true,
      stdio: 'ignore',
    });
    const deadline = Date.now() + 2_000;
    while (states(fixture)['megacampus-api-green'] !== 'inactive' && Date.now() < deadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    expect(states(fixture)['megacampus-api-green']).toBe('inactive');
    process.kill(-child.pid!, 'SIGTERM');
    await new Promise<void>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', () => resolveExit());
    });
    expect(states(fixture)).toEqual(before);
  });
});
