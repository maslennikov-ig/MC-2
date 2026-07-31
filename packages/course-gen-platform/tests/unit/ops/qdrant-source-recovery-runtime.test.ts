/* eslint-disable max-lines, max-lines-per-function */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

import {
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
} from './fixtures/q12-retained-barrier-contract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const WRAPPER = resolve(REPO_ROOT, 'deploy/qdrant/source-recovery-run.sh');
const COMMAND_MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'deploy/qdrant/q12-command-manifest.json'), 'utf8')
) as { commands: Record<string, { argv: string[] }> };

function resolvedCommandSha256(
  commandId: string,
  runId: string,
  extraSubstitutions: Record<string, string> = {}
): string {
  const argv = COMMAND_MANIFEST.commands[commandId].argv.map(value => {
    let rendered = value.split('<run-id>').join(runId);
    for (const [token, replacement] of Object.entries(extraSubstitutions)) {
      rendered = rendered.split(token).join(replacement);
    }
    return rendered;
  });
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex');
}
const ENTRYPOINT = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
);
const Q12_RUN_ID = '223e4567-e89b-42d3-a456-426614174000';
// The joined materializer writes expected-post-migration-catalog.json with this
// exact fixed content (q12-retained-barrier-runner.py), so its digest is stable
// and every W artifact in the joined run binds it instead of the fabricated 'b'*64.
const JOINED_CATALOG_SHA = createHash('sha256')
  .update('{"schema_version":"fixture/v1"}\n')
  .digest('hex');
const SERVICES = [
  'megacampus-api',
  'megacampus-api-blue',
  'megacampus-api-green',
  'megacampus-worker',
  'megacampus-worker-stage6',
  'megacampus-worker-stage7',
] as const;
const COMPOSE_WRITERS = [
  'megacampus-blue/api|megacampus-green/api',
  'megacampus-blue/web|megacampus-green/web',
  'megacampus/worker',
  'megacampus/worker-stage6',
  'megacampus/worker-stage7',
  'megacampus/api-dev',
  'megacampus/web-dev',
  'megacampus/worker-dev',
  'megacampus/worker-stage6-dev',
  'megacampus/worker-stage7-dev',
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
      'QDRANT_API_KEY=source-recovery-admin-value-sentinel',
      `QDRANT_API_KEY_FILE=${join(directory, 'qdrant_api_key')}`,
      'QDRANT_READ_ONLY_API_KEY=source-recovery-read-only-value-sentinel',
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

describe.runIf(RUN_REAL_CONTROLLER)('Q12 source-recovery operator isolation', () => {
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
      // /run/source-recovery must NOT be a tmpfs here: measured 2026-07-31, `compose run` does not
      // nest these bind mounts inside a tmpfs at the same path — the plan input arrived as an empty
      // 0755 directory and the capability bind never took. Its mode is fixed in the image instead
      // (see the mount-parent test below).
      expect(service.tmpfs).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^\/run\/source-recovery(?::|$)/u)])
      );
      expect(service.restart).toBe('no');
      expect(service.secrets).toBeUndefined();
      expect(service.environment.QDRANT_API_KEY ?? '').toBe('');
      expect(service.environment.QDRANT_API_KEY_FILE ?? '').toBe('');
      expect(service.environment.QDRANT_READ_ONLY_API_KEY ?? '').toBe('');
      expect(service.environment.QDRANT_READ_ONLY_API_KEY_FILE ?? '').toBe('');
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
    // apply-dispositions and verify-dispositions both re-derive readSourceCounts(), whose probe
    // realpath()s the production upload root, so the service cannot run its own commands without
    // it — measured as `ENOENT ... realpath` in production 2026-07-31. It stays READ-ONLY, and the
    // development root stays absent, so nothing here can write to either tree.
    expect(volume(disposition, '/opt/megacampus/data/uploads')?.read_only).toBe(true);
    expect(volume(disposition, '/opt/megacampus/data/uploads-dev')).toBeUndefined();
    expect(volume(disposition, '/run/source-recovery/manifest.json')?.read_only).toBe(true);
    expect(volume(disposition, '/run/source-recovery/progress')?.read_only ?? false).toBe(false);
    expect(
      disposition.volumes.map((candidate: Record<string, any>) => candidate.target).sort()
    ).toEqual([
      '/opt/megacampus/data/uploads',
      '/run/source-recovery/manifest.json',
      '/run/source-recovery/progress',
    ]);
    expect(
      disposition.volumes
        .filter((candidate: Record<string, any>) => !(candidate.read_only ?? false))
        .map((candidate: Record<string, any>) => candidate.target)
    ).toEqual(['/run/source-recovery/progress']);
  });

  // Compose interpolates these SIX variables as bind SOURCES, i.e. host paths. CI wrote container
  // paths into four of them (/run/source-recovery/...), which Docker then created as empty
  // root-owned directories on the host and mounted in place of the real inputs — the plan input
  // arrived as a 0755 directory. It stayed invisible because the wrapper exports the correct values
  // and the shell environment outranks --env-file, so only a Compose call made WITHOUT the wrapper
  // saw it. The frozen command manifest already names every one of these paths; bind them to it.
  it('writes the frozen host bind sources into the deployed environment, not container paths', () => {
    const workflow = source('.github/workflows/ci-cd.yml');
    const argv = COMMAND_MANIFEST.commands['source.forward'].argv;
    const argumentValue = (option: string): string => {
      const index = argv.indexOf(option);
      expect(index).toBeGreaterThanOrEqual(0);
      return argv[index + 1];
    };
    const manifestPath = argumentValue('--manifest');
    const expected: Record<string, string> = {
      SOURCE_RECOVERY_PLAN_INPUT_FILE: argumentValue('--plan-input'),
      SOURCE_RECOVERY_MANIFEST_FILE: manifestPath,
      SOURCE_RECOVERY_PROGRESS_HOST_DIR: argumentValue('--progress-directory'),
      SOURCE_RECOVERY_DEVELOPMENT_UPLOAD_ROOT: argumentValue('--development-root'),
      SOURCE_RECOVERY_PRODUCTION_UPLOAD_ROOT: argumentValue('--production-root'),
      SOURCE_RECOVERY_CAPABILITY_HOST_DIR: argumentValue('--capability-directory'),
      // The wrapper derives the state directory as the manifest's own parent.
      SOURCE_RECOVERY_STATE_HOST_DIR: manifestPath.slice(0, manifestPath.lastIndexOf('/')),
    };
    for (const [key, value] of Object.entries(expected)) {
      expect(workflow).toContain(`${key}=${value}\n`);
      expect(value.startsWith('/run/source-recovery')).toBe(false);
    }
  });

  // assertOwnerOnlyStateDirectory requires the PARENT of every owner-only operator input to be a
  // mode-0700 directory owned by the operator uid. The image created both mount parents at 0555, so
  // `source-recovery plan` refused its own bind-mounted plan input in production on 2026-07-31.
  it('creates both source-recovery mount parents at the mode the owner-only check demands', () => {
    const dockerfile = source('packages/course-gen-platform/Dockerfile');
    for (const directory of ['/run/source-recovery', '/var/lib/megacampus-source-recovery']) {
      expect(dockerfile).toContain(`install -d -o nodejs -g nodejs -m 0700 ${directory}`);
      expect(dockerfile).not.toContain(`-m 0555 ${directory}`);
    }
    expect(source('packages/course-gen-platform/tools/qdrant/source-recovery.ts')).toContain(
      '(metadata.mode & 0o777) !== 0o700'
    );
  });

  it('exposes all source-recovery modes without staging a Qdrant credential', () => {
    const help = spawnSync('bash', [ENTRYPOINT, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain(
      'source-recovery plan|verify|execute|rollback|apply-dispositions|verify-dispositions'
    );

    const entrypoint = source('packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh');
    expect(entrypoint).toContain('tools/qdrant/source-recovery.ts');
    expect(entrypoint).toContain(
      'unset QDRANT_API_KEY QDRANT_API_KEY_FILE QDRANT_READ_ONLY_API_KEY QDRANT_READ_ONLY_API_KEY_FILE'
    );
    expect(entrypoint).toMatch(/source-recovery\)[\s\S]*require_source_recovery_arguments/);
    expect(entrypoint).not.toMatch(
      /source-recovery\)[\s\S]{0,500}(?:stage_api_key_for_file_client|load_raw_api_key)/
    );

    const dockerfile = source('packages/course-gen-platform/Dockerfile');
    expect(dockerfile).toContain('qdrant-operator-entrypoint.sh source-recovery --help');
  });

  it('removes every Qdrant credential variable before help and execution children', () => {
    const directory = temporaryDirectory('source-recovery-entrypoint-child');
    const child = join(directory, 'tsx-child');
    const entrypoint = join(directory, 'entrypoint.sh');
    writeFileSync(
      child,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s|%s|%s\n' "\${QDRANT_API_KEY-unset}" "\${QDRANT_API_KEY_FILE-unset}" "\${QDRANT_READ_ONLY_API_KEY-unset}" "\${QDRANT_READ_ONLY_API_KEY_FILE-unset}"
`,
      { mode: 0o700 }
    );
    const currentUid = String(process.getuid?.() ?? 1000);
    const currentGid = String(process.getgid?.() ?? 1000);
    const isolatedEntrypoint = source(
      'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
    )
      .replace("readonly TSX_BIN='/usr/local/bin/tsx'", `readonly TSX_BIN='${child}'`)
      .replace("readonly NODE_UID='1001'", `readonly NODE_UID='${currentUid}'`)
      .replace("readonly NODE_GID='1001'", `readonly NODE_GID='${currentGid}'`);
    writeFileSync(entrypoint, isolatedEntrypoint, { mode: 0o700 });

    for (const args of [
      ['--help'],
      [
        'execute',
        '--manifest-path',
        '/reviewed/manifest.json',
        '--journal-path',
        '/reviewed/progress/journal.json',
        '--confirm-run-id',
        '123e4567-e89b-42d3-a456-426614174000',
      ],
    ]) {
      const result = spawnSync('bash', [entrypoint, 'source-recovery', ...args], {
        env: {
          PATH: process.env.PATH,
          QDRANT_API_KEY: 'admin-value-sentinel',
          QDRANT_API_KEY_FILE: '/admin-file-sentinel',
          QDRANT_READ_ONLY_API_KEY: 'read-only-value-sentinel',
          QDRANT_READ_ONLY_API_KEY_FILE: '/read-only-file-sentinel',
        },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('unset|unset|unset|unset');
      expect(`${result.stdout}${result.stderr}`).not.toContain('sentinel');
    }
  });

  it('stages the Q12 database capability owner-only and never puts its value in argv or env', () => {
    const directory = temporaryDirectory('q12-database-capability-entrypoint');
    const child = join(directory, 'tsx-child');
    const entrypoint = join(directory, 'entrypoint.sh');
    const sourceCapability = join(directory, 'raw-capability');
    const stagedCapability = join(directory, 'runtime/q12_db_capability');
    const probeReceipt = join(directory, 'database-barrier-probe-receipt.json');
    const sentinel = 'q12-database-capability-value-sentinel';
    const currentUid = String(process.getuid?.() ?? 1000);
    const currentGid = String(process.getgid?.() ?? 1000);
    const unexpectedControllerUid = String(Number(currentUid) + 1);
    writeFileSync(sourceCapability, `${sentinel}\n`, { mode: 0o400 });
    chmodSync(sourceCapability, 0o400);
    writeFileSync(
      probeReceipt,
      `${JSON.stringify({
        schema_version: 'megacampus.q12.database-barrier-probes/v1',
        run_id: Q12_RUN_ID,
        expected_catalog_sha256: 'b'.repeat(64),
        completed_at: '2026-07-13T12:00:00.000Z',
        probes: {
          postgrest_anon: 'rejected',
          postgrest_authenticated: 'rejected',
          postgrest_service_role_without_capability: 'rejected',
          postgrest_service_role_with_capability: 'rolled_back',
          postgrest_preference_applied: 'tx=rollback',
          auth_profile: 'rejected_zero_residue',
          storage_object: 'rejected_zero_metadata_zero_bytes',
          cron_rpc: 'rejected_exact_jobs_unchanged',
          pg_net_rpc: 'rejected_zero_queue_zero_external_request',
          direct_supervisor: 'rolled_back',
        },
        residue: {
          guard_probe_rows: 0,
          auth_rows: 0,
          storage_metadata_rows: 0,
          storage_object_bytes: 0,
          cron_job_set_unchanged: true,
          pg_net_queue_rows: 0,
          external_requests: 0,
        },
      })}\n`,
      { mode: 0o400 }
    );
    writeFileSync(
      child,
      `#!/usr/bin/env bash
set -euo pipefail
[[ "\${Q12_DB_CAPABILITY_BOUND:-}" == 1 ]]
[[ "\${Q12_DB_CAPABILITY_FILE:-}" == "$STAGED_CAPABILITY" ]]
[[ "$(cat -- "$Q12_DB_CAPABILITY_FILE")" == '${sentinel}' ]]
identity="$(stat -c '%u:%g:%a' -- "$Q12_DB_CAPABILITY_FILE")"
rm -- "$Q12_DB_CAPABILITY_FILE"
printf 'bound|%s|%s\n' "$Q12_DB_CAPABILITY_FILE" "$identity"
`,
      { mode: 0o700 }
    );
    const isolatedEntrypoint = source(
      'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
    )
      .replace("readonly TSX_BIN='/usr/local/bin/tsx'", `readonly TSX_BIN='${child}'`)
      .replace("readonly NODE_UID='1001'", `readonly NODE_UID='${currentUid}'`)
      .replace("readonly NODE_GID='1001'", `readonly NODE_GID='${currentGid}'`)
      .replace("readonly CONTROLLER_UID='1000'", `readonly CONTROLLER_UID='${currentUid}'`)
      .replace("readonly CONTROLLER_GID='1000'", `readonly CONTROLLER_GID='${currentGid}'`)
      .replace("readonly NODE_BIN='/usr/local/bin/node'", `readonly NODE_BIN='${process.execPath}'`)
      .replace(
        "readonly DEFAULT_Q12_DB_CAPABILITY_FILE='/run/secrets/q12_db_capability'",
        `readonly DEFAULT_Q12_DB_CAPABILITY_FILE='${sourceCapability}'`
      )
      .replace(
        "readonly STAGED_Q12_DB_CAPABILITY_FILE='/run/qdrant-operator/q12_db_capability'",
        `readonly STAGED_Q12_DB_CAPABILITY_FILE='${stagedCapability}'`
      )
      .replace(
        "readonly DEFAULT_Q12_PROBE_RECEIPT_FILE='/run/secrets/q12_database_barrier_probe_receipt'",
        `readonly DEFAULT_Q12_PROBE_RECEIPT_FILE='${probeReceipt}'`
      );
    writeFileSync(entrypoint, isolatedEntrypoint, { mode: 0o700 });

    const childArgs = [
      entrypoint,
      'source-recovery',
      'execute',
      '--manifest-path',
      '/reviewed/manifest.json',
      '--journal-path',
      '/reviewed/progress/journal.json',
      '--confirm-run-id',
      '123e4567-e89b-42d3-a456-426614174000',
    ];
    const q12Environment = {
      PATH: process.env.PATH,
      Q12_DB_CAPABILITY_FILE: sourceCapability,
      Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE: probeReceipt,
      Q12_RUN_ID,
      Q12_EXPECTED_CATALOG_SHA256: 'b'.repeat(64),
      STAGED_CAPABILITY: stagedCapability,
    };
    const result = spawnSync('bash', childArgs, {
      env: q12Environment,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(`bound|${stagedCapability}|${currentUid}:${currentGid}:400`);
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
    expect(existsSync(sourceCapability)).toBe(true);
    expect(existsSync(stagedCapability)).toBe(false);

    const omitted = spawnSync('bash', childArgs, {
      env: {
        PATH: process.env.PATH,
        Q12_DB_CAPABILITY_FILE: sourceCapability,
        STAGED_CAPABILITY: stagedCapability,
      },
      encoding: 'utf8',
    });
    expect(omitted.status).not.toBe(0);
    expect(omitted.stdout).toBe('');
    expect(existsSync(stagedCapability)).toBe(false);

    const mismatched = spawnSync('bash', childArgs, {
      env: { ...q12Environment, Q12_EXPECTED_CATALOG_SHA256: 'c'.repeat(64) },
      encoding: 'utf8',
    });
    expect(mismatched.status).not.toBe(0);
    expect(mismatched.stdout).toBe('');
    expect(existsSync(stagedCapability)).toBe(false);

    const inverseEntrypoint = join(directory, 'entrypoint-inverse-owner.sh');
    const inverseSource = isolatedEntrypoint.replace(
      `readonly CONTROLLER_UID='${currentUid}'`,
      `readonly CONTROLLER_UID='${unexpectedControllerUid}'`
    );
    writeFileSync(inverseEntrypoint, inverseSource, { mode: 0o700 });
    const inverse = spawnSync('bash', [inverseEntrypoint, ...childArgs.slice(1)], {
      env: q12Environment,
      encoding: 'utf8',
    });
    expect(inverse.status).not.toBe(0);
    expect(inverse.stderr).toMatch(/controller.*UID:GID|host.*owner/iu);
    expect(inverse.stdout).toBe('');
    expect(existsSync(stagedCapability)).toBe(false);
  });
});

interface WrapperFixture {
  directory: string;
  env: NodeJS.ProcessEnv;
  args: string[];
  statePath(service: string): string;
  composeLog: string;
  systemctlLog: string;
  dockerLog: string;
}

interface ComposeWriterFixture extends WrapperFixture {
  barrierReceipt: string;
  runId: string;
  q12RunRoot: string;
  curlLog: string;
  oldCrossedQuiesceManifest: string;
  probeReceipt: string;
  q12Capability: string;
  recordsPath: string;
  recoveryState: string;
  quiesceManifest: string;
  records(): Array<Record<string, any>>;
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
  const dockerLog = join(directory, 'docker.log');
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
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ "$1 $2" == 'context show' ]]; then
  printf '%s\n' "$DOCKER_CURRENT_CONTEXT"
elif [[ "$1 $2" == 'context inspect' ]]; then
  if [[ "$3" == default ]]; then
    printf '%s\n' "$DOCKER_DEFAULT_ENDPOINT"
  elif [[ "$3" == "$DOCKER_CURRENT_CONTEXT" ]]; then
    printf '%s\n' "$DOCKER_CURRENT_ENDPOINT"
  else
    exit 65
  fi
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1" == ps ]]; then
  project=''; service=''
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == --filter ]]; then
      case "$2" in
        label=com.docker.compose.project=*) project="\${2##*=}" ;;
        label=com.docker.compose.service=*) service="\${2##*=}" ;;
      esac
      shift 2
    else
      shift
    fi
  done
  jq -r --arg project "$project" --arg service "$service" '.[] | select((($project == "") or .Config.Labels["com.docker.compose.project"] == $project) and (($service == "") or .Config.Labels["com.docker.compose.service"] == $service)) | .Id' "$DOCKER_RECORDS_FILE"
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1" == inspect ]]; then
  id="\${@: -1}"
  if [[ -n "\${SOURCE_RECOVERY_TEST_SWAP_FILE_AFTER_INSPECT:-}" ]]; then
    count=0
    [[ ! -f "$SOURCE_RECOVERY_TEST_INSPECT_COUNTER" ]] || count="$(cat "$SOURCE_RECOVERY_TEST_INSPECT_COUNTER")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$SOURCE_RECOVERY_TEST_INSPECT_COUNTER"
    if [[ $count -eq $SOURCE_RECOVERY_TEST_SWAP_FILE_AFTER_INSPECT ]]; then
      mv -- "$SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT" "$SOURCE_RECOVERY_TEST_SWAP_TARGET"
    fi
  fi
  jq -c --arg id "$id" '[.[] | select(.Id == $id)]' "$DOCKER_RECORDS_FILE"
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1 $2" == 'update --restart=no' ]]; then
  id="$3"
  if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_UPDATE_AFTER:-}" ]]; then
    count=0
    [[ ! -f "$SOURCE_RECOVERY_TEST_UPDATE_COUNTER" ]] || count="$(cat "$SOURCE_RECOVERY_TEST_UPDATE_COUNTER")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$SOURCE_RECOVERY_TEST_UPDATE_COUNTER"
    if [[ $count -eq $SOURCE_RECOVERY_TEST_FAIL_UPDATE_AFTER ]]; then exit 73; fi
  fi
  jq --arg id "$id" 'map(if .Id == $id then .HostConfig.RestartPolicy = {Name:"no",MaximumRetryCount:0} else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
  mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1" == update && "$2" == --restart=* ]]; then
  if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_RESTORE_POLICY_AFTER:-}" ]]; then
    count=0
    [[ ! -f "$SOURCE_RECOVERY_TEST_RESTORE_POLICY_COUNTER" ]] || count="$(cat "$SOURCE_RECOVERY_TEST_RESTORE_POLICY_COUNTER")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$SOURCE_RECOVERY_TEST_RESTORE_POLICY_COUNTER"
    if [[ $count -eq $SOURCE_RECOVERY_TEST_FAIL_RESTORE_POLICY_AFTER ]]; then exit 74; fi
  fi
  policy="\${2#--restart=}"; id="$3"
  name="\${policy%%:*}"; retries=0
  if [[ "$policy" == *:* ]]; then retries="\${policy##*:}"; fi
  jq --arg id "$id" --arg name "$name" --argjson retries "$retries" 'map(if .Id == $id then .HostConfig.RestartPolicy = {Name:$name,MaximumRetryCount:$retries} else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
  mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
  if [[ "\${SOURCE_RECOVERY_TEST_DRIFT_POLICY_ID:-}" == "$id" ]]; then
    jq --arg id "$id" 'map(if .Id == $id then .HostConfig.RestartPolicy = {Name:"always",MaximumRetryCount:0} else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
    mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
  fi
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1" == stop ]]; then
  if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_STOP_AFTER:-}" ]]; then
    count=0
    [[ ! -f "$SOURCE_RECOVERY_TEST_STOP_COUNTER" ]] || count="$(cat "$SOURCE_RECOVERY_TEST_STOP_COUNTER")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$SOURCE_RECOVERY_TEST_STOP_COUNTER"
    if [[ $count -eq $SOURCE_RECOVERY_TEST_FAIL_STOP_AFTER ]]; then exit 76; fi
  fi
  id="\${@: -1}"
  # Real Docker drives a healthcheck-bearing container to Health.Status="unhealthy" when it stops
  # (measured 2026-07-31 on megacampus-api-dev). Leaving it "healthy" here is the substitution that
  # let a wrapper clause no stopped writer could ever satisfy stay green through every suite.
  jq --arg id "$id" 'map(if .Id == $id then .State.Running=false | .State.Status="exited" | (if .State.Health != null then .State.Health.Status="unhealthy" else . end) else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
  mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
elif [[ -n "\${DOCKER_RECORDS_FILE:-}" && "$1" == start ]]; then
  if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_START_AFTER:-}" ]]; then
    count=0
    [[ ! -f "$SOURCE_RECOVERY_TEST_START_COUNTER" ]] || count="$(cat "$SOURCE_RECOVERY_TEST_START_COUNTER")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$SOURCE_RECOVERY_TEST_START_COUNTER"
    if [[ $count -eq $SOURCE_RECOVERY_TEST_FAIL_START_AFTER ]]; then exit 75; fi
  fi
  id="$2"
  if [[ "\${SOURCE_RECOVERY_TEST_START_NOOP_ID:-}" == "$id" ]]; then exit 0; fi
  jq --arg id "$id" 'map(if .Id == $id then .State.Running=true | .State.Status="running" else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
  mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
  if [[ -n "\${SOURCE_RECOVERY_TEST_SLEEP_AFTER_START:-}" ]]; then sleep "$SOURCE_RECOVERY_TEST_SLEEP_AFTER_START"; fi
  if [[ "\${SOURCE_RECOVERY_TEST_START_STARTING_ID:-}" == "$id" ]]; then
    jq --arg id "$id" 'map(if .Id == $id then .State.Health.Status="starting" else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
    mv "$DOCKER_RECORDS_FILE.tmp" "$DOCKER_RECORDS_FILE"
  fi
else
  exit 64
fi
`,
    { mode: 0o700 }
  );
  const compose = join(bin, 'operator-compose');
  writeFileSync(
    compose,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'context=%s %s\n' "\${DOCKER_CONTEXT:-unset}" "$*" >> "$COMPOSE_LOG"
if [[ -n "\${SOURCE_RECOVERY_TEST_SLEEP:-}" ]]; then sleep "$SOURCE_RECOVERY_TEST_SLEEP"; fi
if [[ -n "\${SOURCE_RECOVERY_TEST_FORBIDDEN_FD:-}" ]]; then
  [[ -z "\${Q12_EXTERNAL_QUIESCE_LEASE_FD:-}" ]]
  [[ ! -e "/proc/self/fd/$SOURCE_RECOVERY_TEST_FORBIDDEN_FD" ]]
fi
if [[ -n "\${SOURCE_RECOVERY_TEST_FAIL_MODE:-}" && "$*" == *" \${SOURCE_RECOVERY_TEST_FAIL_MODE} "* ]]; then
  printf '%s_phase_rejected\n' "$SOURCE_RECOVERY_TEST_FAIL_MODE" >&2
  exit 71
fi
if [[ "$*" == *' qdrant-source-recovery-planner source-recovery plan' ]]; then
  printf '{}\n' > "$SOURCE_RECOVERY_MANIFEST_FILE"
  chmod 0400 "$SOURCE_RECOVERY_MANIFEST_FILE"
  printf '{}\n' > "$SOURCE_RECOVERY_PROGRESS_HOST_DIR/journal.json"
  chmod 0600 "$SOURCE_RECOVERY_PROGRESS_HOST_DIR/journal.json"
  if [[ -n "\${SOURCE_RECOVERY_TEST_CAPABILITY_RESIDUE:-}" ]]; then
    touch "$SOURCE_RECOVERY_CAPABILITY_HOST_DIR/residue"
  fi
fi
if [[ -n "\${SOURCE_RECOVERY_TEST_SWAP_AFTER_MODE:-}" &&
      "$*" == *" source-recovery \${SOURCE_RECOVERY_TEST_SWAP_AFTER_MODE} "* ]]; then
  mv -- "$SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT" "$SOURCE_RECOVERY_TEST_SWAP_TARGET"
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
    dockerLog,
    env: {
      PATH: process.env.PATH,
      SOURCE_RECOVERY_SYSTEMCTL_BIN: systemctl,
      SOURCE_RECOVERY_DOCKER_BIN: docker,
      SOURCE_RECOVERY_COMPOSE_BIN: compose,
      SOURCE_RECOVERY_LOCK_FILE: join(directory, 'source-recovery.lock'),
      SOURCE_RECOVERY_EXPECTED_UID: String(process.getuid?.() ?? 1000),
      SOURCE_RECOVERY_EXPECTED_GID: String(process.getgid?.() ?? 1000),
      SOURCE_RECOVERY_CONTROLLER_UID: String(process.getuid?.() ?? 1000),
      SOURCE_RECOVERY_CONTROLLER_GID: String(process.getgid?.() ?? 1000),
      SOURCE_RECOVERY_LOCAL_TEST: '1',
      SYSTEMCTL_LOG: systemctlLog,
      SERVICE_STATE: serviceState,
      COMPOSE_LOG: composeLog,
      DOCKER_LOG: dockerLog,
      DOCKER_CURRENT_CONTEXT: 'default',
      DOCKER_DEFAULT_ENDPOINT: 'unix:///var/run/docker.sock',
      DOCKER_CURRENT_ENDPOINT: 'unix:///var/run/docker.sock',
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

function probeReceiptValue(
  runId: string,
  expectedCatalog: string = 'b'.repeat(64)
): Record<string, any> {
  return {
    schema_version: 'megacampus.q12.database-barrier-probes/v1',
    run_id: runId,
    expected_catalog_sha256: expectedCatalog,
    completed_at: '2026-07-13T12:00:00.000Z',
    probes: {
      postgrest_anon: 'rejected',
      postgrest_authenticated: 'rejected',
      postgrest_service_role_without_capability: 'rejected',
      postgrest_service_role_with_capability: 'rolled_back',
      postgrest_preference_applied: 'tx=rollback',
      auth_profile: 'rejected_zero_residue',
      storage_object: 'rejected_zero_metadata_zero_bytes',
      cron_rpc: 'rejected_exact_jobs_unchanged',
      pg_net_rpc: 'rejected_zero_queue_zero_external_request',
      direct_supervisor: 'rolled_back',
    },
    residue: {
      guard_probe_rows: 0,
      auth_rows: 0,
      storage_metadata_rows: 0,
      storage_object_bytes: 0,
      cron_job_set_unchanged: true,
      pg_net_queue_rows: 0,
      external_requests: 0,
    },
  };
}

function probeReceiptDigest(runId: string, expectedCatalog: string = 'b'.repeat(64)): string {
  return createHash('sha256')
    .update(`${JSON.stringify(probeReceiptValue(runId, expectedCatalog))}\n`)
    .digest('hex');
}

function composeWriterFixture(
  runId: string = Q12_RUN_ID,
  q12RunRootOverride?: string,
  expectedCatalog: string = 'b'.repeat(64)
): ComposeWriterFixture {
  const fixture = wrapperFixture();
  const recordsPath = join(fixture.directory, 'docker-records.json');
  const curlLog = join(fixture.directory, 'curl.log');
  const curl = join(fixture.directory, 'bin/curl');
  const progress = fixture.args[fixture.args.indexOf('--progress-directory') + 1];
  const q12RunRoot = q12RunRootOverride ?? join(fixture.directory, `backups/q12/${runId}`);
  const barrierReceipt = join(q12RunRoot, 'database-barrier-receipt.json');
  const q12Capability = join(q12RunRoot, 'secrets/db-capability');
  const quiesceManifest = join(q12RunRoot, `writer-quiesce-${runId}.json`);
  const recoveryState = join(q12RunRoot, `writer-recovery-state-${runId}.json`);
  const oldCrossedQuiesceManifest = join(progress, `writer-quiesce-${runId}.json`);
  const probeReceipt = join(q12RunRoot, 'database-barrier-probe-receipt.json');
  const identities = [
    ['megacampus-blue', 'api', true],
    ['megacampus-blue', 'web', true],
    ['megacampus', 'worker', true],
    ['megacampus', 'worker-stage6', true],
    ['megacampus', 'worker-stage7', true],
    ['megacampus', 'api-dev', true],
    ['megacampus', 'web-dev', true],
    ['megacampus', 'worker-dev', true],
    ['megacampus', 'worker-stage6-dev', true],
    ['megacampus', 'worker-stage7-dev', false],
  ] as const;
  const records = identities.map(([project, service, running], index) => ({
    Id: `${String(index + 1).padStart(2, '0')}${'a'.repeat(62)}`,
    Name: `/${project}-${service}-1`,
    Config: {
      Image: `registry.invalid/${project}/${service}@sha256:${String(index).repeat(64)}`,
      Labels: {
        'com.docker.compose.project': project,
        'com.docker.compose.service': service,
        'com.docker.compose.project.config_files': `/srv/${project}/compose.yml`,
        'com.docker.compose.project.working_dir': `/srv/${project}`,
      },
    },
    Image: `sha256:${String(index + 1).repeat(64)}`,
    State: {
      Running: running,
      Status: running ? 'running' : 'exited',
      Restarting: false,
      Health: { Status: 'healthy' },
    },
    HostConfig: {
      RestartPolicy: {
        Name: index === 9 ? 'on-failure' : 'unless-stopped',
        MaximumRetryCount: index === 9 ? 3 : 0,
      },
    },
  }));
  writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  mkdirSync(resolve(q12Capability, '..'), { recursive: true, mode: 0o700 });
  chmodSync(q12RunRoot, 0o700);
  chmodSync(resolve(q12Capability, '..'), 0o700);
  writeFileSync(
    barrierReceipt,
    `${JSON.stringify({
      schema_version: 'megacampus.q12.database-barrier-receipt/v1',
      run_id: runId,
      state: 'recovery_ready_guarded',
      zero_guard_residue: false,
      expected_catalog_sha256: expectedCatalog,
      last_command: 'prepare-recovery',
      rollback_probes_verified: true,
      probe_receipt_sha256: 'c'.repeat(64),
    })}\n`,
    { mode: 0o400 }
  );
  writeFileSync(q12Capability, 'q12-wrapper-secret-sentinel\n', { mode: 0o400 });
  chmodSync(q12Capability, 0o400);
  writeFileSync(probeReceipt, `${JSON.stringify(probeReceiptValue(runId, expectedCatalog))}\n`, {
    mode: 0o400,
  });
  const readyReceipt = JSON.parse(readFileSync(barrierReceipt, 'utf8')) as Record<string, any>;
  readyReceipt.probe_receipt_sha256 = createHash('sha256')
    .update(readFileSync(probeReceipt))
    .digest('hex');
  chmodSync(barrierReceipt, 0o600);
  writeFileSync(barrierReceipt, `${JSON.stringify(readyReceipt)}\n`);
  chmodSync(barrierReceipt, 0o400);
  writeFileSync(
    curl,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CURL_LOG"
headers=''; body=''; url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump-header|--output|--write-out|--resolve|--connect-timeout|--max-time|--max-filesize|--max-redirs|--proto|--user-agent)
      case "$1" in
        --dump-header) headers="$2" ;;
        --output) body="$2" ;;
      esac
      shift 2
      ;;
    --silent|--show-error|--http1.1) shift ;;
    https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
[[ -n $headers && -n $body && -n $url ]]
printf 'probe %s\n' "$url" >> "$DOCKER_LOG"
status=502
reason='Bad Gateway'
title='502 Bad Gateway'
if [[ $url == https://dev.ai.megacampus.ru/ ]]; then
  status=503
  reason='Service Temporarily Unavailable'
  title='503 Service Temporarily Unavailable'
fi
server='nginx/1.24.0'
footer="$server"
content_type='text/html'
line_end=$'\\r\\n'
variant="\${SOURCE_RECOVERY_TEST_NGINX_VARIANT:-default}"
case "$variant" in
  default) ;;
  tokens-off) server='nginx'; footer='nginx' ;;
  custom-body) title='application custom maintenance response' ;;
  wrong-reason) reason='Service Unavailable' ;;
  wrong-status) status=504; reason='Gateway Timeout'; title='504 Gateway Timeout' ;;
  mismatched-footer) footer='nginx' ;;
  lf-only) line_end=$'\\n' ;;
  extra-bytes) ;;
  oversized) ;;
  json) content_type='application/json' ;;
  wrong-content-type) content_type='text/plain' ;;
  missing-content-type|duplicate-content-type|missing-content-length|duplicate-content-length|missing-server|duplicate-server|chunked) ;;
  *) exit 78 ;;
esac
if [[ $variant == json ]]; then
  printf '{"status":"maintenance"}' > "$body"
else
  printf '<html>%s<head><title>%s</title></head>%s<body>%s<center><h1>%s</h1></center>%s<hr><center>%s</center>%s</body>%s</html>%s' \
    "$line_end" "$title" "$line_end" "$line_end" "$title" "$line_end" "$footer" "$line_end" "$line_end" "$line_end" > "$body"
fi
if [[ $variant == extra-bytes ]]; then printf '<!-- custom -->' >> "$body"; fi
if [[ $variant == oversized ]]; then
  head -c 600 /dev/zero | tr '\\0' x > "$body"
fi
length="$(wc -c < "$body" | tr -d ' ')"
{
  printf 'HTTP/1.1 %s %s\\r\\n' "$status" "$reason"
  [[ $variant == missing-server ]] || printf 'Server: %s\\r\\n' "$server"
  [[ $variant != duplicate-server ]] || printf 'Server: %s\\r\\n' "$server"
  [[ $variant == missing-content-type ]] || printf 'Content-Type: %s\\r\\n' "$content_type"
  [[ $variant != duplicate-content-type ]] || printf 'Content-Type: %s\\r\\n' "$content_type"
  [[ $variant == missing-content-length ]] || printf 'Content-Length: %s\\r\\n' "$length"
  [[ $variant != duplicate-content-length ]] || printf 'Content-Length: %s\\r\\n' "$length"
  [[ $variant != chunked ]] || printf 'Transfer-Encoding: chunked\\r\\n'
  printf 'Connection: keep-alive\\r\\n\\r\\n'
} > "$headers"
printf '%s' "$status"
`,
    { mode: 0o700 }
  );
  fixture.env = {
    ...fixture.env,
    SOURCE_RECOVERY_WRITER_BACKEND: 'compose',
    SOURCE_RECOVERY_CURL_BIN: curl,
    DOCKER_RECORDS_FILE: recordsPath,
    CURL_LOG: curlLog,
  };
  fixture.args.push(
    '--database-barrier-receipt',
    barrierReceipt,
    '--q12-db-capability-file',
    q12Capability
  );
  return {
    ...fixture,
    barrierReceipt,
    runId,
    q12RunRoot,
    curlLog,
    oldCrossedQuiesceManifest,
    probeReceipt,
    q12Capability,
    recordsPath,
    recoveryState,
    quiesceManifest,
    records: () => JSON.parse(readFileSync(recordsPath, 'utf8')) as Array<Record<string, any>>,
  };
}

function states(fixture: WrapperFixture): Record<string, string> {
  return Object.fromEntries(
    SERVICES.map(service => [service, readFileSync(fixture.statePath(service), 'utf8').trim()])
  );
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function withJournalEntryHash(value: Record<string, any>): Record<string, any> {
  const preimage = canonicalJson(value);
  return {
    ...value,
    entry_hash: createHash('sha256').update(preimage).digest('hex'),
  };
}

function writeJournal(path: string, entries: Array<Record<string, any>>): void {
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${entries.map(canonicalJson).join('\n')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function writeProtectedJson(path: string, value: unknown, mode = 0o400): void {
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode });
  chmodSync(path, mode);
}

function writeCanonicalProtectedJson(path: string, value: unknown, mode = 0o400): void {
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${canonicalJson(value)}\n`, { mode });
  chmodSync(path, mode);
}

function mutateProtectedJson(path: string, mutate: (value: Record<string, any>) => void): void {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  mutate(value);
  writeProtectedJson(path, value);
}

function writeResumeTestDockerEnvironment(
  fixture: ComposeWriterFixture,
  env: NodeJS.ProcessEnv
): void {
  const environment = Object.fromEntries(
    Object.entries({ ...fixture.env, ...env }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  writeProtectedJson(join(fixture.q12RunRoot, 'resume-test-docker-environment.json'), {
    schema_version: 'megacampus.q12.resume-test-docker-environment/v1',
    environment,
  });
}

interface ResumeWriterFixture extends ComposeWriterFixture {
  authority: string;
  capabilitiesRoot: string;
  capability: string;
  capabilityCheckpoint: string;
  checkpoint: string;
  cutoverLock: string;
  finalIds: string[];
  finalManifest: string;
  heldIds: string[];
  inputCheckpoint: string;
  resumeIntentHash: string;
  resumeState: string;
  resume(
    modeOverride?: 'forward' | 'rollback',
    env?: NodeJS.ProcessEnv
  ): ReturnType<typeof spawnSync>;
}

interface WriterQuiesceFixture extends ComposeWriterFixture {
  capabilitiesRoot: string;
  capability: string;
  capabilityCheckpoint: string;
  checkpoint: string;
  cutoverLock: string;
  inputCheckpoint: string;
  inventory: string;
  journal: string;
  plannedTransition: string;
  policyNoTransition: string;
  terminalTransition: string;
  quiesce(env?: NodeJS.ProcessEnv): ReturnType<typeof spawnSync>;
}

function writerClass(record: Record<string, any>): string {
  const service = String(record.Config.Labels['com.docker.compose.service']);
  if (service === 'api' || service === 'api-dev') {
    return service === 'api' ? 'production-api' : 'development-api';
  }
  if (service === 'web' || service === 'web-dev') {
    return service === 'web' ? 'production-web' : 'development-web';
  }
  return service.endsWith('-dev') ? 'development-worker' : 'production-worker';
}

function manifestWriter(
  record: Record<string, any>,
  intendedRunning: boolean,
  intendedPolicy?: { name: string; maximum_retry_count: number }
): Record<string, any> {
  const labels = record.Config.Labels;
  return {
    class: writerClass(record),
    id: record.Id,
    name: record.Name,
    project: labels['com.docker.compose.project'],
    service: labels['com.docker.compose.service'],
    config_files: labels['com.docker.compose.project.config_files'],
    working_dir: labels['com.docker.compose.project.working_dir'],
    image_id: record.Image,
    image_ref: record.Config.Image,
    healthcheck_present: record.State.Health !== null,
    intended_running: intendedRunning,
    intended_restart_policy:
      intendedPolicy ??
      (intendedRunning
        ? {
            name: record.HostConfig.RestartPolicy.Name,
            maximum_retry_count: record.HostConfig.RestartPolicy.MaximumRetryCount,
          }
        : { name: 'no', maximum_retry_count: 0 }),
    temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
  };
}

function quiesceWriter(record: Record<string, any>): Record<string, any> {
  return {
    class: writerClass(record),
    id: record.Id,
    name: record.Name,
    project: record.Config.Labels['com.docker.compose.project'],
    service: record.Config.Labels['com.docker.compose.service'],
    config_files: record.Config.Labels['com.docker.compose.project.config_files'],
    working_dir: record.Config.Labels['com.docker.compose.project.working_dir'],
    image_id: record.Image,
    image_ref: record.Config.Image,
    prior_running: record.State.Running,
    prior_status: record.State.Status,
    healthcheck_present: record.State.Health !== null,
    prior_health_status: record.State.Health?.Status ?? null,
    prior_restart_policy: {
      name: record.HostConfig.RestartPolicy.Name,
      maximum_retry_count: record.HostConfig.RestartPolicy.MaximumRetryCount,
    },
    temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
  };
}

function targetWriterRecords(): Array<Record<string, any>> {
  return ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7'].map((service, index) => ({
    Id: `${String(index + 11).padStart(2, '0')}${'b'.repeat(62)}`,
    Name:
      service === 'api' || service === 'web'
        ? `/megacampus-green-${service}-1`
        : `/megacampus-${service}`,
    Config: {
      Image: `registry.invalid/megacampus-green/${service}@sha256:${String(index + 5).repeat(64)}`,
      Labels: {
        'com.docker.compose.project':
          service === 'api' || service === 'web' ? 'megacampus-green' : 'megacampus',
        'com.docker.compose.service': service,
        'com.docker.compose.project.config_files':
          service === 'api' || service === 'web'
            ? '/srv/megacampus-green/compose.yml'
            : '/srv/megacampus/docker-compose.production.yml',
        'com.docker.compose.project.working_dir':
          service === 'api' || service === 'web' ? '/srv/megacampus-green' : '/srv/megacampus',
      },
    },
    Image: `sha256:${String(index + 5).repeat(64)}`,
    State: {
      Running: false,
      Status: 'created',
      Restarting: false,
      Health: { Status: 'healthy' },
    },
    HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } },
  }));
}

interface ResumeJournalFixtureOptions {
  authorityLeaseEpoch?: string;
  commonPrefixTransform?: (phases: string[]) => string[];
  databaseExistingProofCompletionEpoch?: boolean;
  databasePreIssuanceOrphan?: boolean;
  databaseRecoveryEpoch?: boolean;
  duplicateFinalPair?: boolean;
  entryMutator?: (entry: Record<string, any>) => void;
  historicalInstallScenario?:
    | 'valid'
    | 'wrong-context'
    | 'ambiguous'
    | 'orphan-recovery'
    | 'completion-recovery'
    | 'linked-recovery'
    | 'linked-recovery-cross-sha';
  probeMutator?: (probe: Record<string, any>) => void;
  rollbackJournalPhaseOrderTransform?: (phases: string[]) => string[];
  rollbackRequiredPhases?: string[];
  rollbackStateRequiredReceiptsTransform?: (
    receipts: Array<{ phase: string; receipt_sha256: string }>
  ) => Array<{ phase: string; receipt_sha256: string }>;
  targetRecordsTransform?: (records: Array<Record<string, any>>) => Array<Record<string, any>>;
}

function databaseCompletionEpoch(
  executionEpoch: string,
  existingProofCompletion: boolean | undefined
): string {
  return existingProofCompletion ? 'cutover-recovery-1' : executionEpoch;
}

type AppendJournalEntry = (
  phase: string,
  outcome: string,
  acceptedObjectKind?: string,
  acceptedObjectSha256?: string | null,
  entryLeaseEpoch?: string,
  overrides?: Record<string, any>
) => Record<string, any>;

function claimInitialDatabaseCapability(
  preIssuanceOrphan: boolean | undefined,
  issuedCapability: string,
  claimedCapability: string,
  commandId: string,
  leaseEpoch: string,
  capabilitySha256: string,
  appendJournalEntry: AppendJournalEntry
): Record<string, any> | null {
  if (preIssuanceOrphan) return null;
  appendJournalEntry('guard_cleanup_complete', 'capability_issued', 'none', null, leaseEpoch, {
    command_id: commandId,
    capability_manifest_sha256: capabilitySha256,
  });
  renameSync(issuedCapability, claimedCapability);
  return appendJournalEntry(
    'guard_cleanup_complete',
    'capability_claimed',
    'none',
    null,
    leaseEpoch,
    { command_id: commandId, capability_manifest_sha256: capabilitySha256 }
  );
}

function databaseRecoveryRequired(options: ResumeJournalFixtureOptions): boolean {
  return Boolean(options.databaseRecoveryEpoch || options.databasePreIssuanceOrphan);
}

function appendResumeCommonPrefix(
  phases: string[],
  historicalInstallScenario: ResumeJournalFixtureOptions['historicalInstallScenario'],
  completedCapabilities: string,
  releaseSha: string,
  resourceManifestSha: string,
  quiesceManifestSha: string,
  appendJournalEntry: AppendJournalEntry
): void {
  const historicalInstallDefinitions: Array<{
    journalPhase: string | null;
    capabilityLeaseEpoch: string;
    journalLeaseEpoch: string;
    location: 'completed' | 'superseded';
    commandSha: string;
    inputCheckpointSha: string;
    quiesceSha: string;
    supersedesPrevious: boolean;
  }> = [];
  if (
    historicalInstallScenario === 'valid' ||
    historicalInstallScenario === 'ambiguous' ||
    historicalInstallScenario === 'orphan-recovery' ||
    historicalInstallScenario === 'completion-recovery'
  ) {
    historicalInstallDefinitions.push({
      journalPhase: 'maintenance_guarded',
      capabilityLeaseEpoch:
        historicalInstallScenario === 'orphan-recovery' ? 'cutover-recovery-1' : 'cutover',
      journalLeaseEpoch:
        historicalInstallScenario === 'completion-recovery' ? 'cutover-recovery-1' : 'cutover',
      location: 'completed',
      commandSha: '4'.repeat(64),
      inputCheckpointSha: '5'.repeat(64),
      quiesceSha: '0'.repeat(64),
      supersedesPrevious: false,
    });
  }
  if (historicalInstallScenario === 'wrong-context' || historicalInstallScenario === 'ambiguous') {
    historicalInstallDefinitions.push({
      journalPhase: 'snapshot_exported',
      capabilityLeaseEpoch:
        historicalInstallScenario === 'ambiguous' ? 'cutover-recovery-1' : 'cutover',
      journalLeaseEpoch:
        historicalInstallScenario === 'ambiguous' ? 'cutover-recovery-1' : 'cutover',
      location: 'completed',
      commandSha: historicalInstallScenario === 'ambiguous' ? '6'.repeat(64) : '4'.repeat(64),
      inputCheckpointSha:
        historicalInstallScenario === 'ambiguous' ? '7'.repeat(64) : '5'.repeat(64),
      quiesceSha: quiesceManifestSha,
      supersedesPrevious: false,
    });
  }
  if (
    historicalInstallScenario === 'linked-recovery' ||
    historicalInstallScenario === 'linked-recovery-cross-sha'
  ) {
    historicalInstallDefinitions.push(
      {
        journalPhase: null,
        capabilityLeaseEpoch: 'cutover',
        journalLeaseEpoch: 'cutover',
        location: 'superseded',
        commandSha: '4'.repeat(64),
        inputCheckpointSha: '5'.repeat(64),
        quiesceSha: '0'.repeat(64),
        supersedesPrevious: false,
      },
      {
        journalPhase: 'maintenance_guarded',
        capabilityLeaseEpoch: 'cutover-recovery-1',
        journalLeaseEpoch: 'cutover-recovery-1',
        location: 'completed',
        commandSha:
          historicalInstallScenario === 'linked-recovery-cross-sha'
            ? '6'.repeat(64)
            : '4'.repeat(64),
        inputCheckpointSha: '7'.repeat(64),
        quiesceSha: '0'.repeat(64),
        supersedesPrevious: true,
      }
    );
  }
  const runRoot = join(completedCapabilities, '..', '..');
  const journalPath = join(runRoot, 'phase.jsonl');
  if (!existsSync(journalPath)) writeFileSync(journalPath, '', { mode: 0o600 });
  let previousHistoricalInstallDigest: string | null = null;
  const definitionsByPhase = new Map<string, (typeof historicalInstallDefinitions)[number]>();
  const prefixDefinitions: typeof historicalInstallDefinitions = [];
  for (const definition of historicalInstallDefinitions) {
    if (definition.journalPhase) definitionsByPhase.set(definition.journalPhase, definition);
    else prefixDefinitions.push(definition);
  }
  const publishHistoricalInstall = (
    definition: (typeof historicalInstallDefinitions)[number],
    projectionEntry: Record<string, any>
  ): string => {
    const copyPath = join(
      runRoot,
      `retained-barrier-capability-checkpoint-install-${definition.capabilityLeaseEpoch}.json`
    );
    writeProtectedJson(
      copyPath,
      checkpointForJournalEntry(projectionEntry, journalPath, null),
      0o600
    );
    const historicalInstallCapabilityPath = join(
      completedCapabilities,
      '..',
      definition.location,
      `barrier.install--${definition.capabilityLeaseEpoch}.json`
    );
    writeCanonicalProtectedJson(historicalInstallCapabilityPath, {
      schema_version: 'megacampus.q12.host-command-capability/v1',
      run_id: Q12_RUN_ID,
      command_id: 'barrier.install',
      command_sha256: definition.commandSha,
      release_sha: releaseSha,
      operator_digest: '8'.repeat(64),
      resource_manifest_sha256: resourceManifestSha,
      quiesce_manifest_sha256: definition.quiesceSha,
      capability_input_checkpoint_sha256: fileSha256(copyPath),
      resume_authority_sha256: null,
      lease_epoch: definition.capabilityLeaseEpoch,
      supersedes_capability_sha256: definition.supersedesPrevious
        ? previousHistoricalInstallDigest
        : null,
    });
    previousHistoricalInstallDigest = fileSha256(historicalInstallCapabilityPath);
    return previousHistoricalInstallDigest;
  };
  let lastEntry: Record<string, any> | null = null;
  for (const phase of phases) {
    const definition = definitionsByPhase.get(phase);
    let overrides: Record<string, any> = {};
    let leaseEpoch = 'cutover';
    if (definition && lastEntry) {
      for (const prefixDefinition of prefixDefinitions.splice(0)) {
        publishHistoricalInstall(prefixDefinition, lastEntry);
      }
      const digest = publishHistoricalInstall(definition, lastEntry);
      leaseEpoch = definition.journalLeaseEpoch;
      overrides = {
        command_id: 'barrier.install',
        command_sha256: definition.commandSha,
        capability_manifest_sha256: digest,
        quiesce_manifest_sha256: definition.quiesceSha,
      };
    }
    lastEntry = appendJournalEntry(phase, 'completed', 'none', null, leaseEpoch, overrides);
  }
}

function writerRollbackRequiredReceipts(
  receipts: Array<{ phase: string; receipt_sha256: string }>,
  transform:
    | ((
        values: Array<{ phase: string; receipt_sha256: string }>
      ) => Array<{ phase: string; receipt_sha256: string }>)
    | undefined
): Array<{ phase: string; receipt_sha256: string }> {
  return transform ? transform(receipts) : receipts;
}

function checkpointForJournalEntry(
  entry: Record<string, any>,
  journalPath: string,
  authoritySha256: string | null,
  runId: string = Q12_RUN_ID
): Record<string, any> {
  const journalStat = statSync(journalPath);
  return {
    schema_version: 'megacampus.q12.cutover-checkpoint/v1',
    run_id: runId,
    seq: entry.seq,
    phase: entry.phase,
    journal_entry_hash: entry.entry_hash,
    previous_journal_entry_hash: entry.previous_hash,
    journal_device: String(journalStat.dev),
    journal_inode: String(journalStat.ino),
    accepted_object_kind: entry.accepted_object_kind,
    accepted_object_sha256: entry.accepted_object_sha256,
    resume_authority_sha256: authoritySha256,
    lease_epoch: entry.lease_epoch,
  };
}

function writerQuiesceFixture(): WriterQuiesceFixture {
  const fixture = composeWriterFixture();
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const checkpoint = join(fixture.q12RunRoot, 'phase-checkpoint.json');
  const cutoverLock = join(fixture.directory, 'q12-cutover.lock');
  const capabilitiesRoot = join(fixture.q12RunRoot, 'capabilities');
  const capabilityDirectories = Object.fromEntries(
    ['issued', 'claimed', 'completed', 'superseded'].map(directory => {
      const path = join(capabilitiesRoot, directory);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      chmodSync(path, 0o700);
      return [directory, path];
    })
  );
  const releaseSha = 'e'.repeat(40);
  const resourceManifestSha256 = 'd'.repeat(64);
  const commandSha256 = '9'.repeat(64);
  const leaseEpoch = 'cutover';
  const entries: Array<Record<string, any>> = [];
  let previousHash = '0'.repeat(64);
  const append = (
    phase: string,
    outcome: string,
    capabilityManifestSha256 = '0'.repeat(64),
    entryLeaseEpoch = leaseEpoch,
    acceptedObjectKind = 'none',
    acceptedObjectSha256: string | null = null
  ): Record<string, any> => {
    const entry = withJournalEntryHash({
      schema: 'megacampus.q12.cutover-journal/v1',
      run_id: Q12_RUN_ID,
      seq: entries.length + 1,
      phase,
      outcome,
      timestamp: new Date(Date.UTC(2026, 6, 14, 8, 0, entries.length + 1)).toISOString(),
      release_sha: releaseSha,
      operator_digest: '8'.repeat(64),
      command_id: outcome === 'completed' ? 'barrier.prepare-recovery' : 'writers.quiesce',
      command_sha256: commandSha256,
      lease_epoch: entryLeaseEpoch,
      previous_hash: previousHash,
      rotation_required: true,
      resource_manifest_sha256: resourceManifestSha256,
      quiesce_manifest_sha256: '0'.repeat(64),
      capability_manifest_sha256: capabilityManifestSha256,
      accepted_object_kind: acceptedObjectKind,
      accepted_object_sha256: acceptedObjectSha256,
    });
    entries.push(entry);
    previousHash = String(entry.entry_hash);
    return entry;
  };
  append('preflight', 'completed');
  append('maintenance_guarded', 'completed');
  const intent = append('quiesced', 'intent');
  writeJournal(journal, entries);
  const capabilityCheckpoint = join(
    fixture.q12RunRoot,
    `writer-quiesce-capability-checkpoint-${Q12_RUN_ID}-${leaseEpoch}.json`
  );
  writeProtectedJson(capabilityCheckpoint, checkpointForJournalEntry(intent, journal, null), 0o600);
  const capabilityBasename = `writers.quiesce--${leaseEpoch}.json`;
  const issuedCapability = join(capabilityDirectories.issued, capabilityBasename);
  writeFileSync(
    issuedCapability,
    `${canonicalJson({
      schema_version: 'megacampus.q12.host-command-capability/v1',
      run_id: Q12_RUN_ID,
      command_id: 'writers.quiesce',
      command_sha256: commandSha256,
      release_sha: releaseSha,
      operator_digest: '8'.repeat(64),
      resource_manifest_sha256: resourceManifestSha256,
      quiesce_manifest_sha256: '0'.repeat(64),
      resume_authority_sha256: null,
      capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
      lease_epoch: leaseEpoch,
      supersedes_capability_sha256: null,
    })}\n`,
    { mode: 0o400 }
  );
  chmodSync(issuedCapability, 0o400);
  const capabilitySha256 = fileSha256(issuedCapability);
  append('quiesced', 'capability_issued', capabilitySha256);
  const capability = join(capabilityDirectories.claimed, capabilityBasename);
  renameSync(issuedCapability, capability);
  const claimed = append('quiesced', 'capability_claimed', capabilitySha256);
  writeJournal(journal, entries);
  const currentCheckpoint = checkpointForJournalEntry(claimed, journal, null);
  const inputCheckpoint = join(
    fixture.q12RunRoot,
    `writer-quiesce-input-checkpoint-${Q12_RUN_ID}-${leaseEpoch}.json`
  );
  writeProtectedJson(inputCheckpoint, currentCheckpoint, 0o600);
  writeProtectedJson(checkpoint, currentCheckpoint, 0o600);
  writeFileSync(cutoverLock, '', { mode: 0o600 });
  chmodSync(cutoverLock, 0o600);
  const quiesce = (env: NodeJS.ProcessEnv = {}): ReturnType<typeof spawnSync> => {
    writeResumeTestDockerEnvironment(fixture, env);
    return spawnSync(
      'bash',
      [
        '-c',
        'exec 9<>"$1"; flock -n 9; shift; exec bash "$@"',
        'q12-quiesce-lease',
        cutoverLock,
        WRAPPER,
        '--operation',
        'quiesce-writers-only',
        '--run-id',
        Q12_RUN_ID,
      ],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_RUN_ROOT: fixture.q12RunRoot,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: cutoverLock,
          Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
          ...env,
        },
        encoding: 'utf8',
      }
    );
  };
  return {
    ...fixture,
    capabilitiesRoot,
    capability,
    capabilityCheckpoint,
    checkpoint,
    cutoverLock,
    inputCheckpoint,
    inventory: join(fixture.q12RunRoot, `writer-quiesce-inventory-${Q12_RUN_ID}.json`),
    journal,
    plannedTransition: join(
      fixture.q12RunRoot,
      `writer-quiesce-policy-change-planned-${Q12_RUN_ID}.json`
    ),
    policyNoTransition: join(
      fixture.q12RunRoot,
      `writer-quiesce-policy-no-verified-${Q12_RUN_ID}.json`
    ),
    terminalTransition: join(fixture.q12RunRoot, `writer-quiesce-quiesced-${Q12_RUN_ID}.json`),
    quiesce,
  };
}

function advanceWriterQuiesceRecoveryEpoch(
  fixture: WriterQuiesceFixture,
  ordinal = 1,
  acceptOverlay = true
): { capability: string; overlay: string } {
  const leaseEpoch = `cutover-recovery-${ordinal}`;
  const journalEntries = readFileSync(fixture.journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const previousHead = journalEntries.at(-1)!;
  const predecessor = journalEntries.find(
    entry => entry.phase === 'maintenance_guarded' && entry.outcome === 'completed'
  )!;
  const previousCapabilityBytes = readFileSync(fixture.capability);
  const previousCapabilitySha256 = createHash('sha256')
    .update(previousCapabilityBytes)
    .digest('hex');
  const previousCapability = JSON.parse(previousCapabilityBytes.toString('utf8')) as Record<
    string,
    any
  >;
  const previousBasename = fixture.capability.slice(fixture.capability.lastIndexOf('/') + 1);
  renameSync(fixture.capability, join(fixture.capabilitiesRoot, 'superseded', previousBasename));
  const capabilityCheckpoint = join(
    fixture.q12RunRoot,
    `writer-quiesce-capability-checkpoint-${Q12_RUN_ID}-${leaseEpoch}.json`
  );
  writeProtectedJson(
    capabilityCheckpoint,
    checkpointForJournalEntry(predecessor, fixture.journal, null),
    0o600
  );
  const capabilityBasename = `writers.quiesce--${leaseEpoch}.json`;
  const issuedCapability = join(fixture.capabilitiesRoot, 'issued', capabilityBasename);
  writeProtectedJson(issuedCapability, {
    ...previousCapability,
    capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
    lease_epoch: leaseEpoch,
    supersedes_capability_sha256: previousCapabilitySha256,
  });
  const capabilitySha256 = fileSha256(issuedCapability);
  const journalEntry = (
    prior: Record<string, any>,
    outcome: string,
    acceptedObjectKind = 'none',
    acceptedObjectSha256: string | null = null
  ): Record<string, any> => {
    const preimage = { ...prior };
    delete preimage.entry_hash;
    return withJournalEntryHash({
      ...preimage,
      seq: Number(prior.seq) + 1,
      phase: 'quiesced',
      outcome,
      timestamp: new Date(Date.UTC(2026, 6, 14, 9, ordinal, Number(prior.seq))).toISOString(),
      command_id: 'writers.quiesce',
      lease_epoch: leaseEpoch,
      previous_hash: prior.entry_hash,
      capability_manifest_sha256: capabilitySha256,
      accepted_object_kind: acceptedObjectKind,
      accepted_object_sha256: acceptedObjectSha256,
    });
  };
  const recovery = journalEntry(previousHead, 'recovery_reacquired');
  journalEntries.push(recovery);
  writeJournal(fixture.journal, journalEntries);
  const recoveryCheckpoint = checkpointForJournalEntry(recovery, fixture.journal, null);
  writeProtectedJson(fixture.checkpoint, recoveryCheckpoint, 0o600);

  if (!existsSync(fixture.inventory)) {
    const capability = join(fixture.capabilitiesRoot, 'claimed', capabilityBasename);
    renameSync(issuedCapability, capability);
    const claimed = journalEntry(recovery, 'capability_claimed');
    journalEntries.push(claimed);
    writeJournal(fixture.journal, journalEntries);
    const inputCheckpoint = join(
      fixture.q12RunRoot,
      `writer-quiesce-input-checkpoint-${Q12_RUN_ID}-${leaseEpoch}.json`
    );
    const claimedCheckpoint = checkpointForJournalEntry(claimed, fixture.journal, null);
    writeProtectedJson(inputCheckpoint, claimedCheckpoint, 0o600);
    writeProtectedJson(fixture.checkpoint, claimedCheckpoint, 0o600);
    fixture.capability = capability;
    fixture.capabilityCheckpoint = capabilityCheckpoint;
    fixture.inputCheckpoint = inputCheckpoint;
    return { capability, overlay: '' };
  }

  const inventory = JSON.parse(readFileSync(fixture.inventory, 'utf8')) as Record<string, any>;
  let lastTransitionState = 'inventory_only';
  let lastTransitionSha256: string | null = null;
  if (existsSync(fixture.policyNoTransition)) {
    lastTransitionState = 'policy_no_verified';
    lastTransitionSha256 = fileSha256(fixture.policyNoTransition);
  } else if (existsSync(fixture.plannedTransition)) {
    lastTransitionState = 'policy_change_planned';
    lastTransitionSha256 = fileSha256(fixture.plannedTransition);
  }
  const previousOverlays = readdirSync(fixture.q12RunRoot)
    .filter(name => name.startsWith(`writer-quiesce-recovery-overlay-${Q12_RUN_ID}-`))
    .sort((left, right) => {
      const leftOrdinal = Number(left.slice(left.lastIndexOf('-') + 1).replace('.json', ''));
      const rightOrdinal = Number(right.slice(right.lastIndexOf('-') + 1).replace('.json', ''));
      return leftOrdinal - rightOrdinal;
    });
  const previousOverlaySha256 = previousOverlays.length
    ? fileSha256(join(fixture.q12RunRoot, previousOverlays.at(-1)!))
    : null;
  const overlay = join(
    fixture.q12RunRoot,
    `writer-quiesce-recovery-overlay-${Q12_RUN_ID}-${leaseEpoch}.json`
  );
  const overlayValue = {
    schema_version: 'megacampus.q12.writer-quiesce-recovery-overlay/v1',
    run_id: Q12_RUN_ID,
    lease_epoch: leaseEpoch,
    prior_capability_sha256: previousCapabilitySha256,
    new_capability_sha256: capabilitySha256,
    recovery_checkpoint_sha256: createHash('sha256')
      .update(`${canonicalJson(recoveryCheckpoint)}\n`)
      .digest('hex'),
    inventory_sha256: fileSha256(fixture.inventory),
    initial_capability_input_checkpoint_sha256: inventory.capability_input_checkpoint_sha256,
    initial_input_checkpoint_sha256: inventory.input_checkpoint_sha256,
    last_transition_state: lastTransitionState,
    last_transition_sha256: lastTransitionSha256,
    previous_overlay_sha256: previousOverlaySha256,
    continuation: 'monotonic_quiesce_only',
  };
  writeFileSync(overlay, `${canonicalJson(overlayValue)}\n`, { mode: 0o400 });
  chmodSync(overlay, 0o400);
  if (!acceptOverlay) {
    fixture.capability = issuedCapability;
    fixture.capabilityCheckpoint = capabilityCheckpoint;
    return { capability: issuedCapability, overlay };
  }
  const overlayAccepted = journalEntry(
    recovery,
    'recovery_prefix_accepted',
    'writer_quiesce_recovery_overlay',
    fileSha256(overlay)
  );
  journalEntries.push(overlayAccepted);
  writeJournal(fixture.journal, journalEntries);
  writeProtectedJson(
    fixture.checkpoint,
    checkpointForJournalEntry(overlayAccepted, fixture.journal, null),
    0o600
  );
  const capability = join(fixture.capabilitiesRoot, 'claimed', capabilityBasename);
  renameSync(issuedCapability, capability);
  const claimed = journalEntry(overlayAccepted, 'capability_claimed');
  journalEntries.push(claimed);
  writeJournal(fixture.journal, journalEntries);
  const inputCheckpoint = join(
    fixture.q12RunRoot,
    `writer-quiesce-input-checkpoint-${Q12_RUN_ID}-${leaseEpoch}.json`
  );
  const claimedCheckpoint = checkpointForJournalEntry(claimed, fixture.journal, null);
  writeProtectedJson(inputCheckpoint, claimedCheckpoint, 0o600);
  writeProtectedJson(fixture.checkpoint, claimedCheckpoint, 0o600);
  fixture.capability = capability;
  fixture.capabilityCheckpoint = capabilityCheckpoint;
  fixture.inputCheckpoint = inputCheckpoint;
  return { capability, overlay };
}

interface JoinedResumeSetup {
  runRoot: string;
  runId: string;
  quiescePath: string;
  fwmPath: string;
  fwm: {
    final_writers: Array<Record<string, any>>;
    held_writers: Array<Record<string, any>>;
  };
  originalWriters: Array<Record<string, any>>;
  // Id of an original writer captured in the never-run 'created' state (a real
  // production shape: a writer that was created but never started); its docker
  // record must report Status 'created', not 'exited'.
  createdNoHealthId?: string;
}

// Amendment section 6: the W-owned megacampus.q12.writer-quiesce/v1 topology
// the joined materializer consumes read-only. Production api/web are the active
// blue frontends; the five workers and all ten dev services live under
// `megacampus`; this is exactly the topology W's controller pins at
// q12-writer-resume.py:1270-1286.
function joinedQuiesceWriters(): Array<Record<string, any>> {
  const rows: Array<[string, string, string]> = [
    ['megacampus-blue', 'api', 'production-api'],
    ['megacampus-blue', 'web', 'production-web'],
    ['megacampus', 'worker', 'production-worker'],
    ['megacampus', 'worker-stage6', 'production-worker'],
    ['megacampus', 'worker-stage7', 'production-worker'],
    ['megacampus', 'api-dev', 'development-api'],
    ['megacampus', 'web-dev', 'development-web'],
    ['megacampus', 'worker-dev', 'development-worker'],
    ['megacampus', 'worker-stage6-dev', 'development-worker'],
    ['megacampus', 'worker-stage7-dev', 'development-worker'],
  ];
  const writers = rows.map(([project, service, klass], index) => {
    const digit = String((index + 1) % 10);
    const healthcheck = service === 'api' || service === 'web';
    return {
      class: klass,
      id: digit.repeat(64),
      name: `/${project}-${service}-1`,
      project,
      service,
      config_files: '/opt/megacampus/docker-compose.production.yml',
      working_dir: '/opt/megacampus',
      image_id: `sha256:${digit.repeat(64)}`,
      image_ref: `registry.invalid/${project}/${service}@sha256:${digit.repeat(64)}`,
      prior_running: true,
      prior_status: 'running',
      healthcheck_present: healthcheck,
      prior_health_status: healthcheck ? 'healthy' : null,
      prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
      temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
    };
  });
  return writers.sort((left, right) =>
    left.project !== right.project
      ? left.project.localeCompare(right.project)
      : left.service !== right.service
        ? left.service.localeCompare(right.service)
        : String(left.id).localeCompare(String(right.id))
  );
}

// Build a docker inspect record for a writer entry (quiesce or FWM shape) in its
// resume-start stopped/no state, so `docker inspect` agrees byte-for-byte with
// Root authority (design step e: records come FROM the manifest, not invented).
function stoppedWriterRecord(
  writer: Record<string, any>,
  status: 'created' | 'exited'
): Record<string, any> {
  return {
    Id: writer.id,
    Name: writer.name,
    Config: {
      Image: writer.image_ref,
      Labels: {
        'com.docker.compose.project': writer.project,
        'com.docker.compose.service': writer.service,
        'com.docker.compose.project.config_files': writer.config_files,
        'com.docker.compose.project.working_dir': writer.working_dir,
      },
    },
    Image: writer.image_id,
    State: {
      Running: false,
      Status: status,
      Restarting: false,
      Health: writer.healthcheck_present ? { Status: 'healthy' } : null,
    },
    HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } },
  };
}

// Approved D5 install-chain recovery dimensions (RetainedChainSpec), used to
// exercise the barrier.install recovery-epoch lifecycle over the real Root
// prefix instead of the fabricated historicalInstallScenario builder.
function installChainSpec(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    operation: 'install',
    rootEpoch: 'cutover',
    cutoverCopyBeforeRecoveryRoot: 'absent',
    recoveryReissues: 0,
    publicationWindowOrphans: 0,
    completionMode: 'normal',
    faultAfter: 'none',
    stopAfter: 'completed',
    installTransaction: 'normal',
    ...overrides,
  };
}

// Rollback held-target-count -> the Root materializer profile that produces it:
// 0 = clean prefix 4; 1..5 = the sanctioned partialCaptureTargets crash lever
// (partial durable capture; k=5 is full capture, no activate/deploy.commit). All
// keep a genesis + section-5-valid joined prefix; W consumes the FWM held set
// read-only. The activation frontier is NOT used for held=5: it abandons
// barrier.activate, which W's historical-barrier validation rejects
// (q12-writer-resume.py:1778) — the lever's full-capture profile is the correct one.
function rollbackHeldSpec(heldTargetCount: number): Record<string, unknown> {
  if (heldTargetCount >= 1 && heldTargetCount <= 5) {
    return { partialCaptureTargets: heldTargetCount };
  }
  return {};
}

// A tamperPrefix that appends one row (a deploy.commit/completed template with
// overrides) after the last prefix row (barrier.activate) — the section-5
// grammar validates it in position without shifting any Root retained checkpoint.
function appendMalformedPrefixRow(overrides: Record<string, unknown>): (runRoot: string) => void {
  return runRoot => {
    const journal = join(runRoot, 'phase.jsonl');
    const entries = readFileSync(journal, 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>);
    const last = entries[entries.length - 1];
    const template =
      entries.find(e => e.command_id === 'deploy.commit' && e.outcome === 'completed') ?? last;
    const preimage = { ...template };
    delete preimage.entry_hash;
    Object.assign(preimage, overrides);
    preimage.seq = entries.length + 1;
    preimage.previous_hash = last.entry_hash;
    entries.push(withJournalEntryHash(preimage));
    writeJournal(journal, entries);
  };
}

async function joinedWriterResumeFixture(
  mode: 'forward' | 'rollback',
  installChain?: Record<string, unknown>,
  // Only W-suffix-affecting options are meaningful here (e.g. databasePreIssuanceOrphan);
  // prefix-shaping options are owned by the Root materializer, not W.
  journalOptions: ResumeJournalFixtureOptions = {},
  createdNoHealth = false,
  heldTargetCount = 0,
  // mutate-then-build hook: tamper the Root prefix journal AFTER the composer
  // emits it but BEFORE W builds its suffix, so every suffix checkpoint / db
  // terminal proof / capability binding derives against the tampered journal
  // naturally (no post-hoc rehash cascade). Used only by joined-mutation negatives,
  // and only for defects appended after the last prefix row (barrier.activate) so
  // no Root-owned retained checkpoint shifts.
  tamperPrefix?: (runRoot: string) => void,
  // OQ1 cutover-window coverage only (P2-1b): independently controls whether
  // the joined-prefix quiesce manifest carries the cutover-shaped barrier
  // (state=maintenance_guarded/probe=null) and whether the run-root window
  // marker is seeded. Both default to the existing recovery shape/no-marker
  // so every pre-existing caller is byte-for-byte unaffected.
  windowMode: { manifestBarrier?: 'cutover' | 'recovery'; marker?: boolean } = {}
): Promise<ResumeWriterFixture> {
  const runRoot = mkdtempSync('/tmp/mc2-q12-d5-root-');
  temporaryDirectories.push(runRoot);
  const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
  const quiescePath = join(runRoot, `writer-quiesce-${runId}.json`);
  const originalWriters = joinedQuiesceWriters();
  let createdNoHealthId: string | undefined;
  if (createdNoHealth) {
    // A healthcheck-less dev worker that was created but never run — a real
    // production shape W must resume without starting or mutating it.
    const created = originalWriters.find(writer => writer.service === 'worker-stage7-dev')!;
    created.prior_running = false;
    created.prior_status = 'created';
    created.prior_health_status = null;
    createdNoHealthId = String(created.id);
  }
  if (windowMode.marker) {
    writeFileSync(
      join(runRoot, 'quiesce-window-mode.json'),
      `${JSON.stringify({
        schema_version: 'megacampus.q12.quiesce-window-mode/v1',
        run_id: runId,
        mode: 'cutover',
      })}\n`,
      { mode: 0o400 }
    );
  }
  writeFileSync(
    quiescePath,
    `${canonicalJson({
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: runId,
      status: 'quiesced',
      barrier:
        windowMode.manifestBarrier === 'cutover'
          ? {
              state: 'maintenance_guarded',
              zero_guard_residue: false,
              expected_catalog_sha256: JOINED_CATALOG_SHA,
              probe_receipt_sha256: null,
            }
          : {
              state: 'recovery_ready_guarded',
              zero_guard_residue: false,
              expected_catalog_sha256: JOINED_CATALOG_SHA,
              probe_receipt_sha256: probeReceiptDigest(runId, JOINED_CATALOG_SHA),
            },
      writers: originalWriters,
    })}\n`,
    { mode: 0o400 }
  );
  chmodSync(quiescePath, 0o400);
  const materialized = await materializeJoinedRetainedBarrierFixture({
    runRoot,
    joinedProfile: mode,
    quiesceManifestPath: quiescePath,
    ...(mode === 'rollback'
      ? { completedPrefixLength: 4 as const, ...rollbackHeldSpec(heldTargetCount) }
      : {}),
    ...(installChain ? { chains: { install: installChain } } : {}),
  } as never);
  if (tamperPrefix) tamperPrefix(runRoot);
  const fwmPath =
    mode === 'forward'
      ? materialized.forwardFinalWriterManifestPath!
      : materialized.rollbackFinalWriterManifestPath!;
  const fwm = JSON.parse(readFileSync(fwmPath, 'utf8')) as {
    final_writers: Array<Record<string, any>>;
    held_writers: Array<Record<string, any>>;
  };
  return writerResumeFixture(mode, mode === 'forward' ? 5 : 5, createdNoHealth, journalOptions, {
    runRoot,
    runId,
    quiescePath,
    fwmPath,
    fwm,
    originalWriters,
    createdNoHealthId,
  });
}

function writerResumeFixture(
  mode: 'forward' | 'rollback',
  heldTargetCount = mode === 'forward' ? 5 : 3,
  createdNoHealth = false,
  journalOptions: ResumeJournalFixtureOptions = {},
  joined?: JoinedResumeSetup
): ResumeWriterFixture {
  const runId = joined?.runId ?? Q12_RUN_ID;
  const expectedCatalogSha = joined ? JOINED_CATALOG_SHA : 'b'.repeat(64);
  const fixture = joined
    ? composeWriterFixture(runId, joined.runRoot, expectedCatalogSha)
    : composeWriterFixture();
  if (journalOptions.probeMutator) {
    mutateProtectedJson(fixture.probeReceipt, journalOptions.probeMutator);
    mutateProtectedJson(fixture.barrierReceipt, barrier => {
      barrier.probe_receipt_sha256 = fileSha256(fixture.probeReceipt);
    });
  }
  const originalRecords = fixture.records();
  if (createdNoHealth) {
    originalRecords[9].State = {
      Running: false,
      Status: 'created',
      Restarting: false,
      Health: null,
    };
  }
  const originalQuiesce = joined ? joined.originalWriters : originalRecords.map(quiesceWriter);
  const rawTargetRecords = targetWriterRecords();
  const targetRecords =
    journalOptions.targetRecordsTransform?.(rawTargetRecords) ?? rawTargetRecords;
  const capturedTargets = targetRecords.slice(0, heldTargetCount);
  const barrier = JSON.parse(readFileSync(fixture.barrierReceipt, 'utf8')) as Record<string, any>;
  const readinessBarrier = {
    state: barrier.state,
    zero_guard_residue: barrier.zero_guard_residue,
    expected_catalog_sha256: barrier.expected_catalog_sha256,
    probe_receipt_sha256: barrier.probe_receipt_sha256,
  };
  // Joined path: keep W's already-materialized quiesce manifest bytes verbatim
  // (the Root FWM binds their digest); the fabricated path publishes its own.
  if (!joined) {
    writeProtectedJson(fixture.quiesceManifest, {
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: runId,
      status: 'quiesced',
      barrier: readinessBarrier,
      writers: originalQuiesce,
    });
  }
  const quiesceSha = fileSha256(joined ? joined.quiescePath : fixture.quiesceManifest);
  if (mode === 'forward') {
    writeProtectedJson(fixture.recoveryState, {
      schema_version: 'megacampus.q12.writer-recovery-state/v1',
      run_id: runId,
      state: 'recovery_complete_writers_quiesced',
      expected_catalog_sha256: expectedCatalogSha,
      writer_quiesce_manifest_sha256: quiesceSha,
      source_manifest_sha256: 'c'.repeat(64),
      source_journal_sha256: 'd'.repeat(64),
    });
  }
  // Joined path: the ten originals and the FWM writer arrays are Root authority;
  // docker inspect records are derived FROM the FWM (design step e), never
  // invented, so they agree with Root byte-for-byte.
  const finalWriters = joined ? joined.fwm.final_writers : [];
  const heldWriters = joined ? joined.fwm.held_writers : [];
  if (joined) {
    const isTarget = (writer: Record<string, any>): boolean =>
      String(writer.name).endsWith('-q12fixture');
    const records = [...finalWriters, ...heldWriters].map(writer =>
      stoppedWriterRecord(
        writer,
        isTarget(writer) || String(writer.id) === joined.createdNoHealthId ? 'created' : 'exited'
      )
    );
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  }
  const stoppedOriginal = originalRecords.map(record => ({
    ...record,
    State: {
      ...record.State,
      Running: false,
      Status: record.State.Running ? 'exited' : record.State.Status,
    },
    HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } },
  }));
  const liveTargets = mode === 'forward' ? targetRecords : capturedTargets;
  if (!joined) {
    writeFileSync(
      fixture.recordsPath,
      `${JSON.stringify([...stoppedOriginal, ...liveTargets], null, 2)}\n`,
      { mode: 0o600 }
    );
  }

  const originalProduction = originalRecords.slice(0, 5);
  const originalDevelopment = originalRecords.slice(5);
  const finalRecords =
    mode === 'forward' ? [...targetRecords, ...originalDevelopment] : originalRecords;
  const heldRecords = mode === 'forward' ? originalProduction : capturedTargets;
  if (!joined) {
    finalWriters.push(
      ...finalRecords.map(record => {
        const original = originalRecords.find(candidate => candidate.Id === record.Id);
        return manifestWriter(
          record,
          original?.State.Running ?? true,
          original
            ? {
                name: original.HostConfig.RestartPolicy.Name,
                maximum_retry_count: original.HostConfig.RestartPolicy.MaximumRetryCount,
              }
            : { name: 'unless-stopped', maximum_retry_count: 0 }
        );
      })
    );
    heldWriters.push(...heldRecords.map(record => manifestWriter(record, false)));
  }
  const finalManifest = joined
    ? joined.fwmPath
    : join(fixture.q12RunRoot, `final-writer-manifest-${mode}-${runId}.json`);
  const handoffState = join(fixture.q12RunRoot, `writer-handoff-state-${runId}.json`);
  const rollbackState = join(fixture.q12RunRoot, `writer-rollback-state-${runId}.json`);
  const authority = join(fixture.q12RunRoot, `writer-resume-authority-${runId}.json`);
  const resumeState = join(fixture.q12RunRoot, `writer-resume-state-${runId}.json`);
  const checkpoint = join(fixture.q12RunRoot, 'phase-checkpoint.json');
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const cutoverLock = join(fixture.directory, 'q12-cutover.lock');
  const releaseSha = joined ? '0123456789abcdef0123456789abcdef01234567' : 'e'.repeat(40);
  const leaseEpoch = 'cutover';
  const resourceManifestSha = 'd'.repeat(64);
  // Joined path: continue the ONE canonical journal from the Root prefix head —
  // never re-open a second journal, never rehash the prefix (design step g).
  const journalEntries: Array<Record<string, any>> = joined
    ? readFileSync(journal, 'utf8')
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, any>)
    : [];
  let previousHash = joined
    ? String(journalEntries[journalEntries.length - 1].entry_hash)
    : '0'.repeat(64);
  // Resource-manifest binding for suffix rows: the prefix's last row already
  // stepped resource_manifest_sha256 to its final value (deploy.prepare); the
  // suffix carries that tail unchanged (amendment section 4 item 8).
  const suffixResourceManifestSha = joined
    ? String(journalEntries[journalEntries.length - 1].resource_manifest_sha256)
    : resourceManifestSha;
  const appendJournalEntry = (
    phase: string,
    outcome: string,
    acceptedObjectKind = 'none',
    acceptedObjectSha256: string | null = null,
    entryLeaseEpoch = leaseEpoch,
    overrides: Record<string, any> = {}
  ): Record<string, any> => {
    const seq = journalEntries.length + 1;
    const preimage = {
      schema: 'megacampus.q12.cutover-journal/v1',
      run_id: runId,
      seq,
      phase,
      outcome,
      timestamp: new Date(Date.UTC(2026, 6, 13, 11, 0, seq)).toISOString(),
      release_sha: releaseSha,
      operator_digest: '8'.repeat(64),
      command_id: 'barrier.prepare-recovery',
      command_sha256: '9'.repeat(64),
      lease_epoch: entryLeaseEpoch,
      previous_hash: previousHash,
      rotation_required: true,
      resource_manifest_sha256: suffixResourceManifestSha,
      quiesce_manifest_sha256: quiesceSha,
      capability_manifest_sha256: '0'.repeat(64),
      accepted_object_kind: acceptedObjectKind,
      accepted_object_sha256: acceptedObjectSha256,
      ...overrides,
    };
    journalOptions.entryMutator?.(preimage);
    const entry = withJournalEntryHash(preimage);
    journalEntries.push(entry);
    previousHash = String(entry.entry_hash);
    return entry;
  };
  const capabilitiesRoot = join(fixture.q12RunRoot, 'capabilities');
  const capabilityDirectories = Object.fromEntries(
    ['issued', 'claimed', 'completed', 'superseded'].map(directory => {
      const path = join(capabilitiesRoot, directory);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      chmodSync(path, 0o700);
      return [directory, path];
    })
  );
  const appendDatabaseTerminalLifecycle = (
    operation: 'cleanup' | 'rollback',
    requiredPhaseReceipts: Array<{ phase: string; receipt_sha256: string }>
  ): void => {
    const predecessor = JSON.parse(readFileSync(fixture.barrierReceipt, 'utf8')) as Record<
      string,
      any
    >;
    Object.assign(
      predecessor,
      operation === 'cleanup'
        ? {
            state: 'activated',
            zero_guard_residue: false,
            last_command: 'activate',
            rollback_probes_verified: true,
            probe_receipt_sha256: fileSha256(fixture.probeReceipt),
          }
        : {
            state: 'maintenance_guarded',
            zero_guard_residue: false,
            last_command: 'install',
            rollback_probes_verified: false,
            probe_receipt_sha256: null,
          }
    );
    writeCanonicalProtectedJson(fixture.barrierReceipt, predecessor);
    const predecessorSha256 = fileSha256(fixture.barrierReceipt);
    const predecessorArchive = join(
      fixture.q12RunRoot,
      `database-barrier-receipt-v1-before-${operation}.json`
    );
    writeFileSync(predecessorArchive, readFileSync(fixture.barrierReceipt), { mode: 0o400 });
    chmodSync(predecessorArchive, 0o400);
    const databaseCapabilitySha256 = createHash('sha256')
      .update(readFileSync(fixture.q12Capability, 'utf8').trimEnd())
      .digest('hex');
    const baselineProjection = {
      baseline_structural_catalog_sha256: 'a'.repeat(64),
      database_default_sha256: '6'.repeat(64),
      cron_jobs_sha256: '7'.repeat(64),
      guarded_relations_sha256: '8'.repeat(64),
      pg_net_queue_count: 0,
    };
    const baseline = join(fixture.q12RunRoot, 'database-barrier-baseline.json');
    writeCanonicalProtectedJson(baseline, {
      schema_version: 'megacampus.q12.database-barrier-baseline/v1',
      run_id: runId,
      state: 'maintenance_guarded_baseline',
      source_baseline_sha256: '9'.repeat(64),
      baseline_sha256: createHash('sha256').update(canonicalJson(baselineProjection)).digest('hex'),
      predecessor_checkpoint_sha256: 'a'.repeat(64),
      predecessor_journal_entry_hash: 'b'.repeat(64),
      resource_manifest_sha256: suffixResourceManifestSha,
      expected_post_migration_catalog_sha256: expectedCatalogSha,
      database_capability_sha256: databaseCapabilitySha256,
      baseline: baselineProjection,
    });
    const recoveryCapabilityAnchor = [...journalEntries]
      .reverse()
      .find(entry => entry.outcome === 'accepted');
    expect(recoveryCapabilityAnchor).toBeDefined();
    const commandId = `barrier.${operation}`;
    const intent = appendJournalEntry(
      'guard_cleanup_complete',
      'intent',
      'none',
      null,
      leaseEpoch,
      {
        command_id: commandId,
      }
    );
    writeJournal(journal, journalEntries);
    let capabilityCheckpoint = join(
      fixture.q12RunRoot,
      `database-barrier-capability-checkpoint-${operation}-${leaseEpoch}.json`
    );
    writeProtectedJson(
      capabilityCheckpoint,
      checkpointForJournalEntry(intent, journal, null, runId),
      0o600
    );
    let rollbackIntentSha256: string | null = null;
    let requiredReceiptsSha256: string | null = null;
    const databaseCapabilityBasename = `${commandId}--${leaseEpoch}.json`;
    const issuedCapability = join(capabilityDirectories.issued, databaseCapabilityBasename);
    writeCanonicalProtectedJson(issuedCapability, {
      schema_version: 'megacampus.q12.host-command-capability/v1',
      run_id: runId,
      command_id: commandId,
      command_sha256: '9'.repeat(64),
      release_sha: releaseSha,
      operator_digest: '8'.repeat(64),
      resource_manifest_sha256: suffixResourceManifestSha,
      quiesce_manifest_sha256: quiesceSha,
      resume_authority_sha256: null,
      capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
      lease_epoch: leaseEpoch,
      supersedes_capability_sha256: null,
    });
    const hostCapabilitySha256 = fileSha256(issuedCapability);
    const claimedCapability = join(capabilityDirectories.claimed, databaseCapabilityBasename);
    const claimed = claimInitialDatabaseCapability(
      journalOptions.databasePreIssuanceOrphan,
      issuedCapability,
      claimedCapability,
      commandId,
      leaseEpoch,
      hostCapabilitySha256,
      appendJournalEntry
    );
    writeJournal(journal, journalEntries);
    let databaseExecutionEpoch = leaseEpoch;
    let currentCapabilityBasename = databaseCapabilityBasename;
    let currentClaimedCapability = claimed === null ? issuedCapability : claimedCapability;
    let currentHostCapabilitySha256 = hostCapabilitySha256;
    let currentClaimed = claimed;
    if (databaseRecoveryRequired(journalOptions)) {
      const supersededCapability = join(
        capabilityDirectories.superseded,
        databaseCapabilityBasename
      );
      renameSync(currentClaimedCapability, supersededCapability);
      databaseExecutionEpoch = 'cutover-recovery-1';
      capabilityCheckpoint = join(
        fixture.q12RunRoot,
        `database-barrier-capability-checkpoint-${operation}-${databaseExecutionEpoch}.json`
      );
      writeProtectedJson(
        capabilityCheckpoint,
        checkpointForJournalEntry(recoveryCapabilityAnchor!, journal, null, runId),
        0o600
      );
      currentCapabilityBasename = `${commandId}--${databaseExecutionEpoch}.json`;
      const recoveryIssuedCapability = join(
        capabilityDirectories.issued,
        currentCapabilityBasename
      );
      writeCanonicalProtectedJson(recoveryIssuedCapability, {
        schema_version: 'megacampus.q12.host-command-capability/v1',
        run_id: runId,
        command_id: commandId,
        command_sha256: '9'.repeat(64),
        release_sha: releaseSha,
        operator_digest: '8'.repeat(64),
        resource_manifest_sha256: suffixResourceManifestSha,
        quiesce_manifest_sha256: quiesceSha,
        resume_authority_sha256: null,
        capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
        lease_epoch: databaseExecutionEpoch,
        supersedes_capability_sha256: hostCapabilitySha256,
      });
      currentHostCapabilitySha256 = fileSha256(recoveryIssuedCapability);
      appendJournalEntry(
        'guard_cleanup_complete',
        'recovery_reacquired',
        'none',
        null,
        databaseExecutionEpoch,
        {
          command_id: commandId,
          capability_manifest_sha256: currentHostCapabilitySha256,
        }
      );
      currentClaimedCapability = join(capabilityDirectories.claimed, currentCapabilityBasename);
      renameSync(recoveryIssuedCapability, currentClaimedCapability);
      currentClaimed = appendJournalEntry(
        'guard_cleanup_complete',
        'capability_claimed',
        'none',
        null,
        databaseExecutionEpoch,
        {
          command_id: commandId,
          capability_manifest_sha256: currentHostCapabilitySha256,
        }
      );
      writeJournal(journal, journalEntries);
    }
    if (operation === 'rollback') {
      requiredReceiptsSha256 = createHash('sha256')
        .update(canonicalJson(requiredPhaseReceipts))
        .digest('hex');
      const rollbackIntent = join(fixture.q12RunRoot, 'database-barrier-rollback-intent.json');
      writeCanonicalProtectedJson(rollbackIntent, {
        schema_version: 'megacampus.q12.database-barrier-rollback-intent/v1',
        run_id: runId,
        state: 'rollback_intent',
        expected_post_migration_catalog_sha256: expectedCatalogSha,
        database_barrier_baseline_sha256: fileSha256(baseline),
        predecessor_receipt_sha256: predecessorSha256,
        input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
        intent_journal_entry_hash: intent.entry_hash,
        required_phase_receipts: requiredPhaseReceipts,
        required_phase_receipts_sha256: requiredReceiptsSha256,
      });
      rollbackIntentSha256 = fileSha256(rollbackIntent);
    }
    const inputCheckpoint = join(
      fixture.q12RunRoot,
      `database-barrier-input-checkpoint-${operation}-${databaseExecutionEpoch}.json`
    );
    writeProtectedJson(
      inputCheckpoint,
      checkpointForJournalEntry(currentClaimed!, journal, null, runId),
      0o600
    );
    const terminalProof = join(
      fixture.q12RunRoot,
      `database-barrier-${operation}-terminal-proof.json`
    );
    writeCanonicalProtectedJson(terminalProof, {
      schema_version: 'megacampus.q12.database-barrier-terminal-proof/v1',
      run_id: runId,
      operation,
      state: 'guard_cleanup_complete',
      expected_post_migration_catalog_sha256: expectedCatalogSha,
      database_barrier_baseline_sha256: fileSha256(baseline),
      predecessor_receipt_sha256: predecessorSha256,
      predecessor_receipt_archive_sha256: fileSha256(predecessorArchive),
      database_barrier_rollback_intent_sha256: rollbackIntentSha256,
      input_checkpoint_sha256: fileSha256(inputCheckpoint),
      intent_journal_entry_hash: intent.entry_hash,
      structural_catalog_sha256:
        operation === 'cleanup'
          ? expectedCatalogSha
          : baselineProjection.baseline_structural_catalog_sha256,
      database_default_sha256: baselineProjection.database_default_sha256,
      cron_jobs_sha256: baselineProjection.cron_jobs_sha256,
      guard_residue: {
        q12_guard_schema_count: 0,
        q12_guard_relation_count: 0,
        q12_guard_function_count: 0,
        q12_guard_type_count: 0,
        q12_guard_trigger_count: 0,
        q12_guard_event_trigger_count: 0,
        barrier_era_session_count: 0,
      },
      required_phase_receipts_sha256: requiredReceiptsSha256,
      database_capability_sha256: databaseCapabilitySha256,
      completed_at: '2026-07-14T08:00:00.000Z',
    });
    const completedCapability = join(capabilityDirectories.completed, currentCapabilityBasename);
    renameSync(currentClaimedCapability, completedCapability);
    const completionEpoch = databaseCompletionEpoch(
      databaseExecutionEpoch,
      journalOptions.databaseExistingProofCompletionEpoch
    );
    appendJournalEntry(
      'guard_cleanup_complete',
      'capability_completed',
      'none',
      null,
      completionEpoch,
      {
        command_id: commandId,
        capability_manifest_sha256: currentHostCapabilitySha256,
      }
    );
    rmSync(fixture.q12Capability);
    writeCanonicalProtectedJson(fixture.barrierReceipt, {
      schema_version: 'megacampus.q12.database-barrier-receipt/v2',
      run_id: runId,
      state: 'guard_cleanup_complete',
      expected_catalog_sha256: expectedCatalogSha,
      zero_guard_residue: true,
      last_command: operation,
      rollback_probes_verified: operation === 'cleanup',
      probe_receipt_sha256: operation === 'cleanup' ? fileSha256(fixture.probeReceipt) : null,
      terminal_proof_sha256: fileSha256(terminalProof),
      database_capability_deleted: true,
    });
    appendJournalEntry(
      'guard_cleanup_complete',
      'accepted',
      'database_barrier_receipt',
      fileSha256(fixture.barrierReceipt),
      completionEpoch,
      { command_id: commandId, capability_manifest_sha256: currentHostCapabilitySha256 }
    );
  };
  const commonPrefix = journalOptions.commonPrefixTransform?.([
    'preflight',
    'maintenance_guarded',
    'quiesced',
    'snapshot_exported',
    'backup_committed',
    'restore_verified',
    'base_migration_guarded',
    'observability_migration_guarded',
    'migrations_applied',
    'recovery_ready_guarded',
    'source_recovered',
    'reindex_started',
    'qdrant_verified',
  ]) ?? [
    'preflight',
    'maintenance_guarded',
    'quiesced',
    'snapshot_exported',
    'backup_committed',
    'restore_verified',
    'base_migration_guarded',
    'observability_migration_guarded',
    'migrations_applied',
    'recovery_ready_guarded',
    'source_recovered',
    'reindex_started',
    'qdrant_verified',
  ];
  if (!joined) {
    appendResumeCommonPrefix(
      commonPrefix,
      journalOptions.historicalInstallScenario,
      String(capabilityDirectories.completed),
      releaseSha,
      resourceManifestSha,
      quiesceSha,
      appendJournalEntry
    );
  }
  const finalPhase = mode === 'forward' ? 'prepared_quiesced' : 'rollback_preparing';
  const resumeCommandId = `writers.resume.${mode}`;
  const resumeCommandSha = resolvedCommandSha256(resumeCommandId, runId);
  const resumeBinding = { command_id: resumeCommandId, command_sha256: resumeCommandSha };
  let finalManifestSha: string;
  if (joined) {
    // The FWM intent/object/accepted trio already lives in the Root prefix
    // (design step f); the suffix consumes its digest and never re-publishes it.
    finalManifestSha = fileSha256(finalManifest);
  } else {
    const finalIntent = appendJournalEntry(finalPhase, 'intent', 'none', null, leaseEpoch, {
      ...resumeBinding,
    });
    writeProtectedJson(finalManifest, {
      schema_version: 'megacampus.q12.final-writer-manifest/v1',
      run_id: runId,
      mode,
      release_sha: releaseSha,
      expected_catalog_sha256: expectedCatalogSha,
      writer_quiesce_manifest_sha256: quiesceSha,
      publication_intent_journal_entry_hash: finalIntent.entry_hash,
      input_checkpoint_sha256: '1'.repeat(64),
      lease_epoch: leaseEpoch,
      final_writers: finalWriters,
      held_writers: heldWriters,
    });
    finalManifestSha = fileSha256(finalManifest);
    appendJournalEntry(
      finalPhase,
      'accepted',
      'final_writer_manifest',
      finalManifestSha,
      leaseEpoch,
      {
        ...resumeBinding,
      }
    );
    if (journalOptions.duplicateFinalPair) {
      appendJournalEntry(finalPhase, 'intent', 'none', null, leaseEpoch, { ...resumeBinding });
      appendJournalEntry(
        finalPhase,
        'accepted',
        'final_writer_manifest',
        finalManifestSha,
        leaseEpoch,
        { ...resumeBinding }
      );
    }
  }
  let handoffStateSha: string | null = null;
  let rollbackStateSha: string | null = null;
  const statePhase =
    mode === 'forward' ? 'handoff_ready_writers_quiesced' : 'rollback_ready_writers_quiesced';
  let stateIntent: Record<string, any>;
  if (mode === 'forward') {
    if (!joined) {
      for (const phase of ['activation_ready', 'activation_committing', 'activated']) {
        appendJournalEntry(phase, 'completed');
      }
    }
    stateIntent = appendJournalEntry(statePhase, 'intent', 'none', null, leaseEpoch, {
      ...resumeBinding,
    });
    writeProtectedJson(handoffState, {
      schema_version: 'megacampus.q12.writer-handoff-state/v1',
      run_id: runId,
      state: 'handoff_ready_writers_quiesced',
      mode,
      release_sha: releaseSha,
      expected_catalog_sha256: expectedCatalogSha,
      writer_quiesce_manifest_sha256: quiesceSha,
      final_writer_manifest_sha256: finalManifestSha,
      database_activation_receipt_sha256: '3'.repeat(64),
      publication_intent_journal_entry_hash: stateIntent.entry_hash,
      input_checkpoint_sha256: '2'.repeat(64),
      lease_epoch: leaseEpoch,
    });
    handoffStateSha = fileSha256(handoffState);
    appendJournalEntry(
      statePhase,
      'accepted',
      'writer_handoff_state',
      handoffStateSha,
      leaseEpoch,
      {
        ...resumeBinding,
      }
    );
    appendDatabaseTerminalLifecycle('cleanup', []);
  } else {
    const rollbackPhaseOrder = [
      'handoff_rollback_verified',
      'qdrant_rollback_verified',
      'source_rollback_verified',
      'observability_migration_rollback_guarded',
      'base_migration_rollback_guarded',
    ];
    const requiredPhaseNames = journalOptions.rollbackRequiredPhases ?? rollbackPhaseOrder;
    const requiredPhaseReceipts = [...requiredPhaseNames]
      .sort()
      .map((phase, index) => ({ phase, receipt_sha256: String(index + 1).repeat(64) }));
    const rollbackJournalPhaseOrder =
      journalOptions.rollbackJournalPhaseOrderTransform?.(rollbackPhaseOrder) ?? rollbackPhaseOrder;
    for (const phase of rollbackJournalPhaseOrder) {
      if (requiredPhaseNames.includes(phase)) appendJournalEntry(phase, 'completed');
    }
    appendDatabaseTerminalLifecycle('rollback', requiredPhaseReceipts);
    stateIntent = appendJournalEntry(statePhase, 'intent', 'none', null, leaseEpoch, {
      ...resumeBinding,
    });
    const rollbackStateRequiredReceipts = writerRollbackRequiredReceipts(
      requiredPhaseReceipts,
      journalOptions.rollbackStateRequiredReceiptsTransform
    );
    const rollbackStateRequiredReceiptsSha = createHash('sha256')
      .update(canonicalJson(rollbackStateRequiredReceipts))
      .digest('hex');
    writeProtectedJson(rollbackState, {
      schema_version: 'megacampus.q12.writer-rollback-state/v1',
      run_id: runId,
      state: 'rollback_ready_writers_quiesced',
      mode,
      release_sha: releaseSha,
      expected_catalog_sha256: expectedCatalogSha,
      writer_quiesce_manifest_sha256: quiesceSha,
      final_writer_manifest_sha256: finalManifestSha,
      database_barrier_receipt_sha256: fileSha256(fixture.barrierReceipt),
      required_phase_receipts: rollbackStateRequiredReceipts,
      required_phase_receipts_sha256: rollbackStateRequiredReceiptsSha,
      publication_intent_journal_entry_hash: stateIntent.entry_hash,
      input_checkpoint_sha256: '2'.repeat(64),
      lease_epoch: leaseEpoch,
    });
    rollbackStateSha = fileSha256(rollbackState);
    appendJournalEntry(
      statePhase,
      'accepted',
      'writer_rollback_state',
      rollbackStateSha,
      leaseEpoch,
      {
        ...resumeBinding,
      }
    );
  }
  const barrierSha = fileSha256(fixture.barrierReceipt);
  const authorityPhase = `resume_authority_${mode}`;
  const authorityLeaseEpoch = journalOptions.authorityLeaseEpoch ?? leaseEpoch;
  const authorityIntent = appendJournalEntry(
    authorityPhase,
    'intent',
    'none',
    null,
    authorityLeaseEpoch,
    { ...resumeBinding }
  );
  const authorityValue = {
    schema_version: 'megacampus.q12.writer-resume-authority/v1',
    run_id: runId,
    state:
      mode === 'forward' ? 'handoff_ready_writers_quiesced' : 'rollback_ready_writers_quiesced',
    mode,
    release_sha: releaseSha,
    expected_catalog_sha256: expectedCatalogSha,
    writer_quiesce_manifest_sha256: quiesceSha,
    final_writer_manifest_sha256: finalManifestSha,
    database_barrier_receipt_sha256: barrierSha,
    recovery_state_sha256: mode === 'forward' ? fileSha256(fixture.recoveryState) : null,
    handoff_state_sha256: handoffStateSha,
    rollback_state_sha256: rollbackStateSha,
    authority_intent_journal_entry_hash: authorityIntent.entry_hash,
    input_checkpoint_sha256: '3'.repeat(64),
    lease_epoch: authorityLeaseEpoch,
  };
  writeProtectedJson(authority, authorityValue);
  const authoritySha = fileSha256(authority);
  appendJournalEntry(
    authorityPhase,
    'accepted',
    'writer_resume_authority',
    authoritySha,
    authorityLeaseEpoch,
    { ...resumeBinding }
  );
  const resumeIntent = appendJournalEntry(
    `resume_committing_${mode}`,
    'intent',
    'none',
    null,
    authorityLeaseEpoch,
    { ...resumeBinding }
  );
  writeJournal(journal, journalEntries);
  const capabilityCheckpoint = join(
    fixture.q12RunRoot,
    `writer-resume-capability-checkpoint-${mode}-${authorityLeaseEpoch}.json`
  );
  writeProtectedJson(
    capabilityCheckpoint,
    checkpointForJournalEntry(resumeIntent, journal, authoritySha, runId),
    0o600
  );
  const capabilityBasename = `writers.resume.${mode}--${authorityLeaseEpoch}.json`;
  const issuedCapability = join(capabilityDirectories.issued, capabilityBasename);
  const capabilityValue = {
    schema_version: 'megacampus.q12.host-command-capability/v1',
    run_id: runId,
    command_id: resumeCommandId,
    command_sha256: resumeCommandSha,
    release_sha: releaseSha,
    operator_digest: '8'.repeat(64),
    resource_manifest_sha256: suffixResourceManifestSha,
    quiesce_manifest_sha256: quiesceSha,
    resume_authority_sha256: authoritySha,
    capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
    lease_epoch: authorityLeaseEpoch,
    supersedes_capability_sha256: null,
  };
  writeFileSync(issuedCapability, `${canonicalJson(capabilityValue)}\n`, { mode: 0o400 });
  chmodSync(issuedCapability, 0o400);
  const capabilitySha256 = fileSha256(issuedCapability);
  appendJournalEntry(
    `resume_committing_${mode}`,
    'capability_issued',
    'none',
    null,
    authorityLeaseEpoch,
    {
      ...resumeBinding,
      capability_manifest_sha256: capabilitySha256,
    }
  );
  const capability = join(capabilityDirectories.claimed, capabilityBasename);
  renameSync(issuedCapability, capability);
  const resumeHead = appendJournalEntry(
    `resume_committing_${mode}`,
    'capability_claimed',
    'none',
    null,
    authorityLeaseEpoch,
    {
      ...resumeBinding,
      capability_manifest_sha256: capabilitySha256,
    }
  );
  writeJournal(journal, journalEntries);
  const currentCheckpoint = checkpointForJournalEntry(resumeHead, journal, authoritySha, runId);
  const inputCheckpoint = join(
    fixture.q12RunRoot,
    `writer-resume-input-checkpoint-${mode}-${authorityLeaseEpoch}.json`
  );
  writeProtectedJson(inputCheckpoint, currentCheckpoint, 0o600);
  writeProtectedJson(checkpoint, currentCheckpoint, 0o600);
  writeFileSync(cutoverLock, '', { mode: 0o600 });
  chmodSync(cutoverLock, 0o600);
  rmSync(fixture.q12Capability, { force: true });
  const resume = (
    modeOverride: 'forward' | 'rollback' = mode,
    env: NodeJS.ProcessEnv = {}
  ): ReturnType<typeof spawnSync> => {
    writeResumeTestDockerEnvironment(fixture, env);
    return spawnSync(
      'bash',
      [
        '-c',
        'exec 9<>"$1"; flock -n 9; shift; exec bash "$@"',
        'q12-resume-lease',
        cutoverLock,
        WRAPPER,
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        modeOverride,
        '--run-id',
        runId,
      ],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_RUN_ROOT: fixture.q12RunRoot,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: cutoverLock,
          Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
          ...env,
        },
        encoding: 'utf8',
      }
    );
  };
  return {
    ...fixture,
    authority,
    capabilitiesRoot,
    capability,
    capabilityCheckpoint,
    checkpoint,
    cutoverLock,
    finalIds: finalWriters.map(writer => String(writer.id)),
    finalManifest,
    heldIds: heldWriters.map(writer => String(writer.id)),
    inputCheckpoint,
    resumeIntentHash: String(resumeIntent.entry_hash),
    resumeState,
    resume,
  };
}

function rewriteWriterResumeEpoch(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  leaseEpoch: string
): string {
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const journalEntries = readFileSync(journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const previousHead = journalEntries.at(-1)!;
  const firstResumeIndex = journalEntries.findIndex(
    entry => entry.phase === `resume_committing_${mode}`
  );
  const acceptedPredecessor = journalEntries[firstResumeIndex - 1];
  expect(acceptedPredecessor?.outcome).toBe('accepted');
  const authoritySha256 = fileSha256(fixture.authority);
  const previousCapabilityBytes = readFileSync(fixture.capability);
  const previousCapabilitySha256 = createHash('sha256')
    .update(previousCapabilityBytes)
    .digest('hex');
  const previousCapability = JSON.parse(previousCapabilityBytes.toString('utf8')) as Record<
    string,
    any
  >;
  const previousBasename = fixture.capability.slice(fixture.capability.lastIndexOf('/') + 1);
  const supersededCapability = join(fixture.capabilitiesRoot, 'superseded', previousBasename);
  renameSync(fixture.capability, supersededCapability);

  const capabilityCheckpoint = join(
    fixture.q12RunRoot,
    `writer-resume-capability-checkpoint-${mode}-${leaseEpoch}.json`
  );
  writeProtectedJson(
    capabilityCheckpoint,
    checkpointForJournalEntry(acceptedPredecessor, journal, authoritySha256, fixture.runId),
    0o600
  );
  const capabilityBasename = `writers.resume.${mode}--${leaseEpoch}.json`;
  const issuedCapability = join(fixture.capabilitiesRoot, 'issued', capabilityBasename);
  writeFileSync(
    issuedCapability,
    `${canonicalJson({
      ...previousCapability,
      capability_input_checkpoint_sha256: fileSha256(capabilityCheckpoint),
      lease_epoch: leaseEpoch,
      supersedes_capability_sha256: previousCapabilitySha256,
    })}\n`,
    { mode: 0o400 }
  );
  chmodSync(issuedCapability, 0o400);
  const capabilitySha256 = fileSha256(issuedCapability);
  const previousPreimage = { ...previousHead };
  delete previousPreimage.entry_hash;
  const recoveryReacquired = withJournalEntryHash({
    ...previousPreimage,
    seq: Number(previousHead.seq) + 1,
    phase: `resume_committing_${mode}`,
    outcome: 'recovery_reacquired',
    timestamp: '2026-07-13T12:01:00.000Z',
    command_id: `writers.resume.${mode}`,
    lease_epoch: leaseEpoch,
    previous_hash: previousHead.entry_hash,
    capability_manifest_sha256: capabilitySha256,
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
  });
  const capability = join(fixture.capabilitiesRoot, 'claimed', capabilityBasename);
  renameSync(issuedCapability, capability);
  const capabilityClaimed = withJournalEntryHash({
    ...previousPreimage,
    seq: recoveryReacquired.seq + 1,
    phase: recoveryReacquired.phase,
    outcome: 'capability_claimed',
    timestamp: '2026-07-13T12:01:01.000Z',
    command_id: `writers.resume.${mode}`,
    lease_epoch: leaseEpoch,
    previous_hash: recoveryReacquired.entry_hash,
    capability_manifest_sha256: capabilitySha256,
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
  });
  journalEntries.push(recoveryReacquired, capabilityClaimed);
  writeJournal(journal, journalEntries);
  const currentCheckpoint = checkpointForJournalEntry(
    capabilityClaimed,
    journal,
    authoritySha256,
    fixture.runId
  );
  const inputCheckpoint = join(
    fixture.q12RunRoot,
    `writer-resume-input-checkpoint-${mode}-${leaseEpoch}.json`
  );
  writeProtectedJson(inputCheckpoint, currentCheckpoint, 0o600);
  writeProtectedJson(fixture.checkpoint, currentCheckpoint, 0o600);
  fixture.capability = capability;
  fixture.capabilityCheckpoint = capabilityCheckpoint;
  fixture.inputCheckpoint = inputCheckpoint;
  return leaseEpoch;
}

function advanceWriterResumeRecoveryEpoch(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  ordinal = 1
): string {
  return rewriteWriterResumeEpoch(fixture, mode, `cutover-recovery-${ordinal}`);
}

function rewindWriterResumeToOrphanBoundary(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  boundary: 'issued-file' | 'claimed-file'
): void {
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const entries = readFileSync(journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const resumeIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.phase === `resume_committing_${mode}`);
  const retainedHead =
    boundary === 'issued-file'
      ? resumeIndexes[0]
      : resumeIndexes.find(({ entry }) => entry.outcome === 'capability_issued')!;
  entries.splice(retainedHead.index + 1);
  writeJournal(journal, entries);
  writeProtectedJson(
    fixture.checkpoint,
    checkpointForJournalEntry(retainedHead.entry, journal, fileSha256(fixture.authority)),
    0o600
  );
  rmSync(fixture.inputCheckpoint, { force: true });
  if (boundary === 'issued-file') {
    const issued = join(fixture.capabilitiesRoot, 'issued', `writers.resume.${mode}--cutover.json`);
    renameSync(fixture.capability, issued);
    fixture.capability = issued;
  }
}

function rewindWriterQuiesceToOrphanBoundary(
  fixture: WriterQuiesceFixture,
  boundary: 'issued-file' | 'claimed-file'
): void {
  const entries = readFileSync(fixture.journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const quiesceIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.phase === 'quiesced');
  const retainedHead =
    boundary === 'issued-file'
      ? quiesceIndexes[0]
      : quiesceIndexes.find(({ entry }) => entry.outcome === 'capability_issued')!;
  entries.splice(retainedHead.index + 1);
  writeJournal(fixture.journal, entries);
  writeProtectedJson(
    fixture.checkpoint,
    checkpointForJournalEntry(retainedHead.entry, fixture.journal, null),
    0o600
  );
  rmSync(fixture.inputCheckpoint, { force: true });
  if (boundary === 'issued-file') {
    const issued = join(fixture.capabilitiesRoot, 'issued', 'writers.quiesce--cutover.json');
    renameSync(fixture.capability, issued);
    fixture.capability = issued;
  }
}

function rewriteResumeJournalHead(
  fixture: ResumeWriterFixture,
  mutate: (head: Record<string, any>) => void
): void {
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const entries = readFileSync(journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const preimage = { ...entries.at(-1)! };
  delete preimage.entry_hash;
  mutate(preimage);
  const head = withJournalEntryHash(preimage);
  entries[entries.length - 1] = head;
  writeJournal(journal, entries);
  const checkpoint = JSON.parse(readFileSync(fixture.checkpoint, 'utf8')) as Record<string, any>;
  const journalStat = statSync(journal);
  Object.assign(checkpoint, {
    journal_entry_hash: head.entry_hash,
    previous_journal_entry_hash: head.previous_hash,
    journal_device: String(journalStat.dev),
    journal_inode: String(journalStat.ino),
    accepted_object_kind: head.accepted_object_kind,
    accepted_object_sha256: head.accepted_object_sha256,
  });
  writeProtectedJson(fixture.checkpoint, checkpoint, 0o600);
}

function resumeChild(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  env: NodeJS.ProcessEnv
): ReturnType<typeof spawn> {
  writeResumeTestDockerEnvironment(fixture, env);
  return spawn(
    'bash',
    [
      '-c',
      'exec 9<>"$1"; flock -n 9; shift; exec bash "$@"',
      'q12-resume-lease',
      fixture.cutoverLock,
      WRAPPER,
      '--operation',
      'resume-writers-only',
      '--resume-mode',
      mode,
      '--run-id',
      fixture.runId,
    ],
    {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_Q12_RUN_ROOT: fixture.q12RunRoot,
        SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: fixture.cutoverLock,
        Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
        ...env,
      },
      detached: true,
      stdio: 'ignore',
    }
  );
}

function expectResumeCompensated(fixture: ResumeWriterFixture): void {
  expect(existsSync(fixture.resumeState)).toBe(false);
  const relevant = fixture
    .records()
    .filter(record => [...fixture.finalIds, ...fixture.heldIds].includes(String(record.Id)));
  expect(
    relevant.every(
      record =>
        record.State.Running === false &&
        record.HostConfig.RestartPolicy.Name === 'no' &&
        record.HostConfig.RestartPolicy.MaximumRetryCount === 0
    ),
    JSON.stringify(relevant, null, 2)
  ).toBe(true);
}

function removeOption(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const [, value] = args.splice(index, 2);
  return value;
}

function prepareReviewedState(fixture: WrapperFixture, removePlannerAssets = false): void {
  const manifest = fixture.args[fixture.args.indexOf('--manifest') + 1];
  const progress = fixture.args[fixture.args.indexOf('--progress-directory') + 1];
  writeFileSync(manifest, '{}\n', { mode: 0o400 });
  writeFileSync(join(progress, 'journal.json'), '{}\n', { mode: 0o600 });
  if (removePlannerAssets) {
    const planInput = removeOption(fixture.args, '--plan-input');
    const capability = removeOption(fixture.args, '--capability-directory');
    rmSync(planInput!, { force: true });
    rmSync(capability!, { recursive: true, force: true });
  }
}

describe.runIf(RUN_REAL_CONTROLLER)('Q12 source-recovery host lock and writer restoration', () => {
  it('exposes only the frozen narrow writer-resume command surface', () => {
    const help = spawnSync('bash', [WRAPPER, '--help'], { encoding: 'utf8' });

    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain(
      '--operation resume-writers-only --resume-mode forward|rollback --run-id UUID'
    );
    expect(help.stdout).not.toContain('--resume-run-root');
    expect(help.stdout).not.toContain('--resume-database-url');
    expect(help.stdout).not.toContain('--resume-capability');
  });

  it('pins the exact normative writer-resume PATH without local executable directories', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    const controller = source('deploy/qdrant/q12-writer-resume.py');

    expect(wrapper).toContain("PATH='/usr/sbin:/usr/bin:/sbin:/bin'");
    expect(controller).toContain('"PATH": "/usr/sbin:/usr/bin:/sbin:/bin"');
    expect(wrapper).not.toContain(
      "PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'"
    );
    expect(controller).not.toContain(
      '"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"'
    );
  });

  it('sanitizes an unapproved launcher variable before entering the exact controller environment', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const result = fixture.resume('forward', {
      UNAPPROVED_WRITER_RESUME_ENVIRONMENT: 'must-not-reach-controller',
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects an inherited descriptor beyond stdin, stdout, stderr, and the canonical FD 9 lease', () => {
    const fixture = writerResumeFixture('forward');
    const forbidden = join(fixture.directory, 'forbidden-resume-fd');
    writeFileSync(forbidden, '', { mode: 0o600 });
    writeResumeTestDockerEnvironment(fixture, {});

    const result = spawnSync(
      'bash',
      [
        '-c',
        'exec 8<>"$1"; exec 9<>"$2"; flock -n 9; shift 2; exec bash "$@"',
        'q12-resume-extra-fd',
        forbidden,
        fixture.cutoverLock,
        WRAPPER,
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        'forward',
        '--run-id',
        Q12_RUN_ID,
      ],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_RUN_ROOT: fixture.q12RunRoot,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: fixture.cutoverLock,
          Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/file descriptor surface is not exact/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects non-canonical whitespace in any stored journal line before Docker inspection', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const journal = join(fixture.q12RunRoot, 'phase.jsonl');
    writeFileSync(journal, readFileSync(journal, 'utf8').replace('\n', ' \n'));

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal line is not canonical/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a recomputed middle journal entry whose successor no longer chains to it', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const journal = join(fixture.q12RunRoot, 'phase.jsonl');
    const entries = readFileSync(journal, 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>);
    const preimage = { ...entries[10] };
    delete preimage.entry_hash;
    preimage.outcome = 'recomputed-but-not-rechained';
    entries[10] = withJournalEntryHash(preimage);
    writeJournal(journal, entries);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal entry projection|previous_hash|journal/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a canonically rehashed resume head with the wrong command ID', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    rewriteResumeJournalHead(fixture, head => {
      head.command_id = 'barrier.prepare-recovery';
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal\/checkpoint binding/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects accepted-object data in a resume-committing head even when checkpoint-bound', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    rewriteResumeJournalHead(fixture, head => {
      head.accepted_object_kind = 'final_writer_manifest';
      head.accepted_object_sha256 = fileSha256(fixture.finalManifest);
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/checkpoint projection|journal\/checkpoint binding/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a second final-writer-manifest pair in the joined prefix before any writer start', async () => {
    // mutate-then-build: append a duplicate prepared_quiesced intent/accepted pair
    // AFTER the last prefix row (barrier.activate) so no Root retained checkpoint
    // shifts, then let W build its suffix over the tampered prefix. The section-5
    // grammar rejects the second FWM acceptance with its native pin.
    const fixture = await joinedWriterResumeFixture('forward', undefined, {}, false, 0, runRoot => {
      const journal = join(runRoot, 'phase.jsonl');
      const entries = readFileSync(journal, 'utf8')
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, any>);
      const intent = entries.find(
        e => e.command_id === 'writers.resume.forward' && e.outcome === 'intent'
      )!;
      const accepted = entries.find(
        e => e.command_id === 'writers.resume.forward' && e.outcome === 'accepted'
      )!;
      const last = entries[entries.length - 1];
      const intentPreimage = { ...intent };
      delete intentPreimage.entry_hash;
      intentPreimage.seq = entries.length + 1;
      intentPreimage.previous_hash = last.entry_hash;
      const dupIntent = withJournalEntryHash(intentPreimage);
      const acceptedPreimage = { ...accepted };
      delete acceptedPreimage.entry_hash;
      acceptedPreimage.seq = entries.length + 2;
      acceptedPreimage.previous_hash = dupIntent.entry_hash;
      const dupAccepted = withJournalEntryHash(acceptedPreimage);
      entries.push(dupIntent, dupAccepted);
      writeJournal(journal, entries);
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exactly one final writer manifest/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a non-safe numeric journal value before chain acceptance', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const journal = join(fixture.q12RunRoot, 'phase.jsonl');
    const entries = readFileSync(journal, 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>);
    const preimage = { ...entries[0] };
    delete preimage.entry_hash;
    preimage.seq = 1.5;
    entries[0] = withJournalEntryHash(preimage);
    writeJournal(journal, entries);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/forbidden JSON value|safe integer/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects escaped non-ASCII bytes when the same journal value has a literal UTF-8 canonical form', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const journal = join(fixture.q12RunRoot, 'phase.jsonl');
    const entries = readFileSync(journal, 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>);
    const preimage = { ...entries[0] };
    delete preimage.entry_hash;
    preimage.outcome = 'готово';
    entries[0] = withJournalEntryHash(preimage);
    writeJournal(journal, entries);
    const escaped = readFileSync(journal, 'utf8').replace(
      'готово',
      '\\u0433\\u043e\\u0442\\u043e\\u0432\\u043e'
    );
    writeFileSync(journal, escaped);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal line is not canonical/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects duplicate keys in a protected JSON authority input before Docker inspection', () => {
    const fixture = writerResumeFixture('forward');
    const barrier = readFileSync(fixture.barrierReceipt, 'utf8').trimEnd();
    chmodSync(fixture.barrierReceipt, 0o600);
    writeFileSync(fixture.barrierReceipt, `${barrier.slice(0, -1)},"zero_guard_residue":true}\n`);
    chmodSync(fixture.barrierReceipt, 0o400);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/duplicate JSON key/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a hash-bound probe receipt with a non-exact nested probe value', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      probeMutator: probe => {
        probe.probes.postgrest_anon = 'rolled_back';
      },
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/probe receipt.*nested|probe receipt.*projection/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('forbids every Docker writer start while the database capability still exists', () => {
    const fixture = writerResumeFixture('forward');
    writeFileSync(fixture.q12Capability, 'still-live-capability\n', { mode: 0o400 });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/capability.*still exists|capability.*must be absent/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects the legacy post-cleanup database receipt v1 before Docker inspection', () => {
    const fixture = writerResumeFixture('forward');
    writeProtectedJson(fixture.barrierReceipt, {
      schema_version: 'megacampus.q12.database-barrier-receipt/v1',
      run_id: Q12_RUN_ID,
      state: 'guard_cleanup_complete',
      zero_guard_residue: true,
      expected_catalog_sha256: 'b'.repeat(64),
      last_command: 'cleanup',
      rollback_probes_verified: true,
      probe_receipt_sha256: fileSha256(fixture.probeReceipt),
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /database.*receipt.*(?:v2|non-exact projection)|terminal.*database.*authority/iu
    );
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it.each(['forward', 'rollback'] as const)(
    'accepts the exact terminal database recovery lifecycle before %s writer resume',
    async mode => {
      const fixture = await joinedWriterResumeFixture(mode, undefined, {
        databaseRecoveryEpoch: true,
      });

      const result = fixture.resume(mode);

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
        state: 'writers_resumed',
        mode,
      });
    }
  );

  it('accepts a recovery capability linked to an immutable pre-issuance database orphan', async () => {
    const fixture = await joinedWriterResumeFixture('forward', undefined, {
      databasePreIssuanceOrphan: true,
    });
    const superseded = join(
      fixture.capabilitiesRoot,
      'superseded',
      'barrier.cleanup--cutover.json'
    );
    const completed = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.cleanup--cutover-recovery-1.json'
    );
    const completedCapability = JSON.parse(readFileSync(completed, 'utf8')) as Record<string, any>;
    const databaseGraph = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(
        entry => entry.phase === 'guard_cleanup_complete' && entry.command_id === 'barrier.cleanup'
      );

    expect(databaseGraph.map(entry => [entry.lease_epoch, entry.outcome])).toEqual([
      ['cutover', 'intent'],
      ['cutover-recovery-1', 'recovery_reacquired'],
      ['cutover-recovery-1', 'capability_claimed'],
      ['cutover-recovery-1', 'capability_completed'],
      ['cutover-recovery-1', 'accepted'],
    ]);
    expect(completedCapability.supersedes_capability_sha256).toBe(fileSha256(superseded));

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
      state: 'writers_resumed',
      mode: 'forward',
    });
  });

  it('accepts a separately journal-bound completed barrier install capability', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const installCapabilityPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover.json'
    );
    const installCapability = JSON.parse(readFileSync(installCapabilityPath, 'utf8')) as Record<
      string,
      any
    >;
    const installJournalEntry = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .find(entry => entry.command_id === 'barrier.install' && entry.outcome === 'completed');

    // Real Root artifacts: install binds the zero quiesce digest (amendment 3)
    // and a real resolved command hash (never the 0*64/9*64 sentinels).
    // install binds the zero quiesce digest (amendment 3) and the EXACT resolved
    // command hash: barrier.install argv substitutes <run-id> and the expected
    // catalog sha, so resolvedCommandSha256 recomputes it — a wrong-command hash
    // must fail, not just a wrong shape.
    expect(installCapability).toMatchObject({
      command_id: 'barrier.install',
      command_sha256: resolvedCommandSha256('barrier.install', fixture.runId, {
        '<expected-post-migration-catalog-sha256>': JOINED_CATALOG_SHA,
      }),
      quiesce_manifest_sha256: '0'.repeat(64),
      lease_epoch: 'cutover',
    });
    expect(installJournalEntry).toMatchObject({
      phase: 'maintenance_guarded',
      outcome: 'completed',
      command_id: 'barrier.install',
      command_sha256: installCapability.command_sha256,
      capability_manifest_sha256: fileSha256(installCapabilityPath),
      quiesce_manifest_sha256: installCapability.quiesce_manifest_sha256,
      lease_epoch: installCapability.lease_epoch,
    });

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
      state: 'writers_resumed',
      mode: 'forward',
    });
  });

  it('accepts an old immutable install result completed in the first recovery journal epoch', async () => {
    const fixture = await joinedWriterResumeFixture(
      'forward',
      installChainSpec({ completionMode: 'move-no-row-reacquired' })
    );
    const capabilityPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover.json'
    );
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<string, any>;
    const capabilityDigest = fileSha256(capabilityPath);
    const installCompleted = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(entry => entry.command_id === 'barrier.install' && entry.outcome === 'completed');

    // The execution capability stays in cutover (no reissue), but its completion
    // row moved into the first recovery epoch — the exact old-result contract.
    expect(capability).toMatchObject({
      command_id: 'barrier.install',
      command_sha256: resolvedCommandSha256('barrier.install', fixture.runId, {
        '<expected-post-migration-catalog-sha256>': JOINED_CATALOG_SHA,
      }),
      lease_epoch: 'cutover',
      supersedes_capability_sha256: null,
      quiesce_manifest_sha256: '0'.repeat(64),
    });
    expect(installCompleted).toHaveLength(1);
    expect(installCompleted[0]).toMatchObject({
      phase: 'maintenance_guarded',
      outcome: 'completed',
      command_id: 'barrier.install',
      command_sha256: capability.command_sha256,
      capability_manifest_sha256: capabilityDigest,
      quiesce_manifest_sha256: capability.quiesce_manifest_sha256,
      lease_epoch: 'cutover-recovery-1',
    });

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(fileSha256(capabilityPath)).toBe(capabilityDigest);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/barrier\.install/iu);
    expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
      state: 'writers_resumed',
      mode: 'forward',
    });
  });

  it('rejects the fabricated retained install recovery chain without Root checkpoint provenance', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'linked-recovery',
    });
    for (const epoch of ['cutover', 'cutover-recovery-1']) {
      rmSync(
        join(fixture.q12RunRoot, `retained-barrier-capability-checkpoint-install-${epoch}.json`)
      );
    }
    const predecessorPath = join(
      fixture.capabilitiesRoot,
      'superseded',
      'barrier.install--cutover.json'
    );
    const tipPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover-recovery-1.json'
    );
    const predecessor = JSON.parse(readFileSync(predecessorPath, 'utf8')) as Record<string, any>;
    const tip = JSON.parse(readFileSync(tipPath, 'utf8')) as Record<string, any>;
    const predecessorDigest = fileSha256(predecessorPath);
    const tipDigest = fileSha256(tipPath);
    const installJournalEntries = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(entry => entry.command_id === 'barrier.install');

    expect(predecessor).toMatchObject({
      command_id: 'barrier.install',
      lease_epoch: 'cutover',
      supersedes_capability_sha256: null,
      quiesce_manifest_sha256: '0'.repeat(64),
    });
    expect(tip).toMatchObject({
      command_id: 'barrier.install',
      command_sha256: predecessor.command_sha256,
      lease_epoch: 'cutover-recovery-1',
      supersedes_capability_sha256: predecessorDigest,
      quiesce_manifest_sha256: '0'.repeat(64),
    });
    expect(installJournalEntries).toEqual([
      expect.objectContaining({
        phase: 'maintenance_guarded',
        outcome: 'completed',
        command_id: 'barrier.install',
        command_sha256: tip.command_sha256,
        capability_manifest_sha256: tipDigest,
        quiesce_manifest_sha256: tip.quiesce_manifest_sha256,
        lease_epoch: 'cutover-recovery-1',
      }),
    ]);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/retained barrier.*(?:checkpoint|provenance).*invalid/iu);
    expect(fileSha256(predecessorPath)).toBe(predecessorDigest);
    expect(fileSha256(tipPath)).toBe(tipDigest);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects a retained install recovery chain whose command hash changes before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'linked-recovery-cross-sha',
    });
    const predecessorPath = join(
      fixture.capabilitiesRoot,
      'superseded',
      'barrier.install--cutover.json'
    );
    const tipPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover-recovery-1.json'
    );
    const predecessor = JSON.parse(readFileSync(predecessorPath, 'utf8')) as Record<string, any>;
    const tip = JSON.parse(readFileSync(tipPath, 'utf8')) as Record<string, any>;

    expect(predecessor.command_sha256).toBe('4'.repeat(64));
    expect(tip).toMatchObject({
      command_sha256: '6'.repeat(64),
      supersedes_capability_sha256: fileSha256(predecessorPath),
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/historical barrier.*command.*(?:contract|hash).*invalid/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('rejects a historical install bound to a later phase and future quiesce context before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'wrong-context',
    });
    const installCapabilityPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover.json'
    );
    const installCapability = JSON.parse(readFileSync(installCapabilityPath, 'utf8')) as Record<
      string,
      any
    >;
    const installJournalEntries = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(entry => entry.command_id === 'barrier.install');

    expect(installCapability.quiesce_manifest_sha256).toBe(fileSha256(fixture.quiesceManifest));
    expect(installCapability.quiesce_manifest_sha256).not.toBe('0'.repeat(64));
    expect(installJournalEntries).toEqual([
      expect.objectContaining({
        phase: 'snapshot_exported',
        outcome: 'completed',
        command_sha256: installCapability.command_sha256,
        capability_manifest_sha256: fileSha256(installCapabilityPath),
        quiesce_manifest_sha256: installCapability.quiesce_manifest_sha256,
        lease_epoch: 'cutover',
      }),
    ]);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/historical barrier.*(?:phase|context).*invalid/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('rejects two independently completed historical install authorities before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'ambiguous',
    });
    const installJournalEntries = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(entry => entry.command_id === 'barrier.install');

    expect(
      ['cutover', 'cutover-recovery-1'].map(epoch => {
        const capabilityPath = join(
          fixture.capabilitiesRoot,
          'completed',
          `barrier.install--${epoch}.json`
        );
        const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<string, any>;
        return [
          capability.lease_epoch,
          capability.command_sha256,
          fileSha256(capabilityPath),
          capability.supersedes_capability_sha256,
        ];
      })
    ).toEqual([
      ['cutover', '4'.repeat(64), expect.stringMatching(/^[a-f0-9]{64}$/u), null],
      ['cutover-recovery-1', '6'.repeat(64), expect.stringMatching(/^[a-f0-9]{64}$/u), null],
    ]);
    expect(
      installJournalEntries.map(entry => [
        entry.phase,
        entry.lease_epoch,
        entry.command_sha256,
        entry.capability_manifest_sha256,
      ])
    ).toEqual([
      ['maintenance_guarded', 'cutover', '4'.repeat(64), expect.stringMatching(/^[a-f0-9]{64}$/u)],
      [
        'snapshot_exported',
        'cutover-recovery-1',
        '6'.repeat(64),
        expect.stringMatching(/^[a-f0-9]{64}$/u),
      ],
    ]);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/historical barrier.*completed.*ambiguous/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('rejects a lone historical recovery capability without its predecessor before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'orphan-recovery',
    });
    const capabilityPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover-recovery-1.json'
    );
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as Record<string, any>;

    expect(capability).toMatchObject({
      command_id: 'barrier.install',
      lease_epoch: 'cutover-recovery-1',
      supersedes_capability_sha256: null,
      quiesce_manifest_sha256: '0'.repeat(64),
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/historical barrier.*lifecycle.*(?:unsupported|ambiguous)/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it.each(['issued', 'claimed', 'completed', 'superseded'])(
    'rejects a canonical unknown barrier command in the %s lifecycle directory before Docker',
    lifecycleDirectory => {
      const fixture = writerResumeFixture('forward');
      const cleanupCapability = join(
        fixture.capabilitiesRoot,
        'completed',
        'barrier.cleanup--cutover.json'
      );
      const unknownCapability = JSON.parse(readFileSync(cleanupCapability, 'utf8')) as Record<
        string,
        any
      >;
      unknownCapability.command_id = 'barrier.evil';
      writeCanonicalProtectedJson(
        join(fixture.capabilitiesRoot, lifecycleDirectory, 'barrier.evil--cutover.json'),
        unknownCapability
      );

      const result = fixture.resume();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/barrier.*(?:command|basename).*invalid/iu);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
    }
  );

  it('rejects a malformed known barrier capability basename before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'valid',
    });
    renameSync(
      join(fixture.capabilitiesRoot, 'completed', 'barrier.install--cutover.json'),
      join(fixture.capabilitiesRoot, 'completed', 'barrier.install-cutover.json')
    );

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/barrier.*basename.*invalid/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('rejects a known historical barrier command cross-wired to another command before Docker', () => {
    const fixture = writerResumeFixture('forward', 5, false, {
      historicalInstallScenario: 'valid',
    });
    const installCapabilityPath = join(
      fixture.capabilitiesRoot,
      'completed',
      'barrier.install--cutover.json'
    );
    const installCapability = JSON.parse(readFileSync(installCapabilityPath, 'utf8')) as Record<
      string,
      any
    >;
    installCapability.command_id = 'barrier.activate';
    writeCanonicalProtectedJson(installCapabilityPath, installCapability);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/barrier.*binding.*invalid/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it.each(['forward', 'rollback'] as const)(
    'accepts existing exact database proof from the old execution epoch before %s writer resume',
    async mode => {
      const fixture = await joinedWriterResumeFixture(mode, undefined, {
        databaseExistingProofCompletionEpoch: true,
      });
      const databaseOperation = mode === 'forward' ? 'cleanup' : 'rollback';
      const databaseGraph = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, any>)
        .filter(
          entry =>
            entry.phase === 'guard_cleanup_complete' &&
            entry.command_id === `barrier.${databaseOperation}`
        );

      expect(databaseGraph.map(entry => [entry.lease_epoch, entry.outcome])).toEqual([
        ['cutover', 'intent'],
        ['cutover', 'capability_issued'],
        ['cutover', 'capability_claimed'],
        ['cutover-recovery-1', 'capability_completed'],
        ['cutover-recovery-1', 'accepted'],
      ]);
      expect(
        existsSync(
          join(fixture.capabilitiesRoot, 'completed', `barrier.${databaseOperation}--cutover.json`)
        )
      ).toBe(true);
      expect(
        existsSync(
          join(
            fixture.capabilitiesRoot,
            'claimed',
            `barrier.${databaseOperation}--cutover-recovery-1.json`
          )
        )
      ).toBe(false);

      const result = fixture.resume(mode);

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
        state: 'writers_resumed',
        mode,
      });
    }
  );

  it.each([
    {
      label: 'unreferenced file',
      mutate: (fixture: ResumeWriterFixture) => {
        const completed = join(
          fixture.capabilitiesRoot,
          'completed',
          'barrier.cleanup--cutover.json'
        );
        const value = JSON.parse(readFileSync(completed, 'utf8')) as Record<string, any>;
        value.lease_epoch = 'cutover-recovery-1';
        value.supersedes_capability_sha256 = fileSha256(completed);
        writeCanonicalProtectedJson(
          join(fixture.capabilitiesRoot, 'superseded', 'barrier.cleanup--cutover-recovery-1.json'),
          value
        );
      },
    },
    {
      label: 'duplicate file',
      mutate: (fixture: ResumeWriterFixture) => {
        const completed = join(
          fixture.capabilitiesRoot,
          'completed',
          'barrier.cleanup--cutover.json'
        );
        writeFileSync(
          join(fixture.capabilitiesRoot, 'superseded', 'barrier.cleanup--cutover.json'),
          readFileSync(completed),
          { mode: 0o400 }
        );
      },
    },
    {
      label: 'cross-operation file',
      mutate: (fixture: ResumeWriterFixture) => {
        const completed = join(
          fixture.capabilitiesRoot,
          'completed',
          'barrier.cleanup--cutover.json'
        );
        writeFileSync(
          join(fixture.capabilitiesRoot, 'superseded', 'barrier.rollback--cutover.json'),
          readFileSync(completed),
          { mode: 0o400 }
        );
      },
    },
  ])('rejects a database barrier host capability $label before Docker inspection', ({ mutate }) => {
    const fixture = writerResumeFixture('forward');
    mutate(fixture);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/database barrier.*capability|capability.*database barrier/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('rejects writer rollback required receipts that differ from the frozen database intent', () => {
    const fixture = writerResumeFixture('rollback', 3, false, {
      rollbackStateRequiredReceiptsTransform: receipts =>
        receipts.map((receipt, index) =>
          index === 0 ? { ...receipt, receipt_sha256: 'f'.repeat(64) } : receipt
        ),
    });

    const result = fixture.resume('rollback');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/rollback.*required.*receipts|rollback.*intent/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
  });

  it('binds one immutable claimed capability to distinct capability and child-input checkpoints', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const capability = JSON.parse(readFileSync(fixture.capability, 'utf8')) as Record<string, any>;

    expect(Object.keys(capability).sort()).toEqual(
      [
        'schema_version',
        'run_id',
        'command_id',
        'command_sha256',
        'release_sha',
        'operator_digest',
        'resource_manifest_sha256',
        'quiesce_manifest_sha256',
        'resume_authority_sha256',
        'capability_input_checkpoint_sha256',
        'lease_epoch',
        'supersedes_capability_sha256',
      ].sort()
    );
    expect(capability).toMatchObject({
      schema_version: 'megacampus.q12.host-command-capability/v1',
      run_id: fixture.runId,
      command_id: 'writers.resume.forward',
      lease_epoch: 'cutover',
      supersedes_capability_sha256: null,
      capability_input_checkpoint_sha256: fileSha256(fixture.capabilityCheckpoint),
    });
    expect(readFileSync(fixture.inputCheckpoint)).toEqual(readFileSync(fixture.checkpoint));
    expect(fileSha256(fixture.inputCheckpoint)).not.toBe(fileSha256(fixture.capabilityCheckpoint));
    for (const directory of ['issued', 'claimed', 'completed', 'superseded']) {
      expect(statSync(join(fixture.capabilitiesRoot, directory)).mode & 0o777).toBe(0o700);
    }
    expect(statSync(fixture.capability).mode & 0o777).toBe(0o400);
    expect(statSync(fixture.capabilityCheckpoint).mode & 0o777).toBe(0o600);
    expect(statSync(fixture.inputCheckpoint).mode & 0o777).toBe(0o600);
    const graph = readFileSync(join(fixture.q12RunRoot, 'phase.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, any>)
      .filter(entry => entry.phase === 'resume_committing_forward');
    expect(graph.map(entry => entry.outcome)).toEqual([
      'intent',
      'capability_issued',
      'capability_claimed',
    ]);

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(receipt.resume_intent_journal_entry_hash).toBe(fixture.resumeIntentHash);
    expect(receipt.input_checkpoint_sha256).toBe(fileSha256(fixture.inputCheckpoint));
  });

  it.each([
    {
      label: 'orphan issued file',
      mutate: (fixture: ResumeWriterFixture) => {
        const orphan = join(
          fixture.capabilitiesRoot,
          'issued',
          'writers.resume.forward--cutover-recovery-99.json'
        );
        writeFileSync(orphan, readFileSync(fixture.capability), { mode: 0o400 });
      },
    },
    {
      label: 'current capability in the wrong directory',
      mutate: (fixture: ResumeWriterFixture) => {
        renameSync(
          fixture.capability,
          join(fixture.capabilitiesRoot, 'issued', 'writers.resume.forward--cutover.json')
        );
      },
    },
    {
      label: 'capability hash mismatch',
      mutate: (fixture: ResumeWriterFixture) => {
        mutateProtectedJson(fixture.capability, value => {
          value.resource_manifest_sha256 = 'f'.repeat(64);
        });
      },
    },
    {
      label: 'duplicate lifecycle file',
      mutate: (fixture: ResumeWriterFixture) => {
        const duplicate = join(
          fixture.capabilitiesRoot,
          'completed',
          'writers.resume.forward--cutover.json'
        );
        writeFileSync(duplicate, readFileSync(fixture.capability), { mode: 0o400 });
      },
    },
    {
      label: 'missing capability checkpoint',
      mutate: (fixture: ResumeWriterFixture) => {
        rmSync(fixture.capabilityCheckpoint);
      },
    },
    {
      label: 'wrong child-input checkpoint',
      mutate: (fixture: ResumeWriterFixture) => {
        mutateProtectedJson(fixture.inputCheckpoint, value => {
          value.journal_entry_hash = 'f'.repeat(64);
        });
      },
    },
    {
      label: 'old claimed capability after lock loss',
      mutate: (fixture: ResumeWriterFixture) => {
        advanceWriterResumeRecoveryEpoch(fixture, 'forward');
        const superseded = join(
          fixture.capabilitiesRoot,
          'superseded',
          'writers.resume.forward--cutover.json'
        );
        const oldClaimed = join(
          fixture.capabilitiesRoot,
          'claimed',
          'writers.resume.forward--cutover.json'
        );
        writeFileSync(oldClaimed, readFileSync(superseded), { mode: 0o400 });
      },
    },
  ])('rejects a $label before Docker inspection', ({ mutate }) => {
    const fixture = writerResumeFixture('forward');
    mutate(fixture);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/capability|checkpoint|lifecycle|supersed/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect /mu);
  });

  it.each(['issued-file', 'claimed-file'] as const)(
    'accepts a superseded resume capability recovered from the %s durable boundary',
    async boundary => {
      const fixture = await joinedWriterResumeFixture('forward');
      rewindWriterResumeToOrphanBoundary(fixture, 'forward', boundary);
      advanceWriterResumeRecoveryEpoch(fixture, 'forward');

      const result = fixture.resume();

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^start /mu);
    }
  );

  it('starts normally from an exact stopped/no recovery boundary without compensation', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    advanceWriterResumeRecoveryEpoch(fixture, 'forward');

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(true);
  });

  // Reshape-to-append (orchestrator ruling): a grammatically porous row appended
  // after the last prefix row (barrier.activate) presents validate_joined_prefix
  // the same per-row defect an in-position row would, without shifting any Root
  // retained checkpoint. These four exercise the four per-row §5 grammar branches
  // (unknown phase for a known command, a rollback phase in a forward run, a
  // non-milestone outcome at migrations_applied, and an accepted-object on an
  // ordinary row); all reject at the native §5 pin.
  //
  // The former phase-ORDER cases (missing / out-of-order / repeated phase) are NOT
  // reshaped: they are graph properties Root guarantees for the joined prefix, and
  // appending a well-formed extra row is accepted (verified: resume exits 0), so an
  // append cannot express them. Their coverage is the Root-side composition-seam
  // 'emits the exact amendment forward chronology' test (order/no-repeat/no-missing)
  // plus the D4 genesis-gate negative for a fabricated prefix. The former 'second
  // object publication pair' case is replaced by the dedicated D2 negative
  // 'rejects a second final-writer-manifest pair in the joined prefix'.
  it.each([
    [
      'an unknown ordinary phase',
      { command_id: 'deploy.commit', outcome: 'completed', phase: 'cutover_prepared' },
    ],
    [
      'a cross-mode phase',
      { command_id: 'deploy.commit', outcome: 'completed', phase: 'rollback_preparing' },
    ],
    [
      'a non-milestone outcome at migrations_applied',
      {
        command_id: 'migration.observability.apply',
        outcome: 'intent',
        phase: 'migrations_applied',
      },
    ],
    [
      'an accepted object on an ordinary phase',
      {
        command_id: 'migration.observability.apply',
        outcome: 'completed',
        phase: 'migrations_applied',
        accepted_object_kind: 'writer_resume_state',
        accepted_object_sha256: 'f'.repeat(64),
      },
    ],
  ] as const)(
    'rejects %s appended to the joined prefix at the section-5 grammar before any start',
    async (_label, overrides) => {
      const fixture = await joinedWriterResumeFixture(
        'forward',
        undefined,
        {},
        false,
        0,
        appendMalformedPrefixRow(overrides)
      );

      const result = fixture.resume();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/outcome\/phase\/command grammar mismatch/iu);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    }
  );

  // D4 (genesis gate): the fabricated legacy prefix is no longer an accepted
  // journal shape. A well-formed fabricated forward run (the exact input that used
  // to ride the removed common_phase_graph path to exit 0) now clears every earlier
  // structural check and is rejected at the genesis gate — the sole acceptance is a
  // genesis-rooted real Root joined prefix. Rejection is total and pre-mutation:
  // exit != 0, the genesis-gate stderr, zero Docker inspect/start, no resume-state
  // file, and the journal bytes are untouched.
  it('rejects a fabricated legacy prefix at the genesis gate before any Docker, database, or writer mutation', () => {
    const fixture = writerResumeFixture('forward');
    const journalPath = join(fixture.q12RunRoot, 'phase.jsonl');
    const journalBefore = readFileSync(journalPath);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/genesis-rooted joined journal prefix/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^inspect |^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
    expect(readFileSync(journalPath)).toEqual(journalBefore);
  });

  it('resumes the exact forward final ten in workers, API, Web order and leaves held five stopped', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const checkpointBefore = readFileSync(fixture.checkpoint, 'utf8');
    const checkpoint = JSON.parse(checkpointBefore) as Record<string, any>;
    expect(Object.keys(checkpoint).sort()).toEqual(
      [
        'schema_version',
        'run_id',
        'seq',
        'phase',
        'journal_entry_hash',
        'previous_journal_entry_hash',
        'journal_device',
        'journal_inode',
        'accepted_object_kind',
        'accepted_object_sha256',
        'resume_authority_sha256',
        'lease_epoch',
      ].sort()
    );
    expect(checkpoint).toMatchObject({
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      run_id: fixture.runId,
      phase: 'resume_committing_forward',
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
      lease_epoch: 'cutover',
    });
    expect(checkpoint.previous_journal_entry_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(checkpoint.journal_device).toMatch(/^(?:0|[1-9][0-9]*)$/u);
    expect(checkpoint.journal_inode).toMatch(/^[1-9][0-9]*$/u);

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.checkpoint, 'utf8')).toBe(checkpointBefore);
    expect(existsSync(fixture.q12Capability)).toBe(false);
    const records = fixture.records();
    const final = records.filter(record => fixture.finalIds.includes(String(record.Id)));
    const held = records.filter(record => fixture.heldIds.includes(String(record.Id)));
    expect(final).toHaveLength(10);
    expect(held).toHaveLength(5);
    expect(
      held.every(
        record => record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
      )
    ).toBe(true);
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    for (const expected of manifest.final_writers as Array<Record<string, any>>) {
      const actual = records.find(record => record.Id === expected.id);
      expect(actual).toBeDefined();
      expect(actual!.State.Running).toBe(expected.intended_running);
      expect(actual!.HostConfig.RestartPolicy).toEqual({
        Name: expected.intended_restart_policy.name,
        MaximumRetryCount: expected.intended_restart_policy.maximum_retry_count,
      });
    }
    const dockerLines = readFileSync(fixture.dockerLog, 'utf8').trim().split('\n');
    const starts = dockerLines.filter(line => line.startsWith('start '));
    const classes = starts.map(line => {
      const id = line.slice('start '.length);
      return (manifest.final_writers as Array<Record<string, any>>).find(writer => writer.id === id)
        ?.class;
    });
    const firstApi = classes.findIndex(value => value?.endsWith('-api'));
    const firstWeb = classes.findIndex(value => value?.endsWith('-web'));
    expect(firstApi).toBeGreaterThan(0);
    expect(firstWeb).toBeGreaterThan(firstApi);
    expect(classes.slice(0, firstApi).every(value => value?.endsWith('-worker'))).toBe(true);
    expect(classes.slice(firstApi, firstWeb).every(value => value?.endsWith('-api'))).toBe(true);
    expect(classes.slice(firstWeb).every(value => value?.endsWith('-web'))).toBe(true);
    const lastStart = dockerLines.reduce(
      (last, line, index) => (line.startsWith('start ') ? index : last),
      -1
    );
    const firstPolicyRestore = dockerLines.findIndex(line =>
      /^update --restart=(?!no\b)/u.test(line)
    );
    expect(firstPolicyRestore).toBeGreaterThan(lastStart);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(Object.keys(receipt).sort()).toEqual(
      [
        'schema_version',
        'run_id',
        'state',
        'mode',
        'expected_catalog_sha256',
        'writer_quiesce_manifest_sha256',
        'final_writer_manifest_sha256',
        'resume_authority_sha256',
        'database_barrier_receipt_sha256',
        'resume_intent_journal_entry_hash',
        'input_checkpoint_sha256',
        'lease_epoch',
        'final_inventory_sha256',
        'held_inventory_sha256',
      ].sort()
    );
    expect(receipt).toMatchObject({
      schema_version: 'megacampus.q12.writer-resume-state/v1',
      run_id: fixture.runId,
      state: 'writers_resumed',
      mode: 'forward',
      lease_epoch: 'cutover',
    });
    expect(receipt.final_inventory_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.held_inventory_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('resumes forward over the real Root joined prefix (D5J), not the fabricated graph', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fixture.q12Capability)).toBe(false);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(receipt).toMatchObject({
      schema_version: 'megacampus.q12.writer-resume-state/v1',
      run_id: fixture.runId,
      state: 'writers_resumed',
      mode: 'forward',
      lease_epoch: 'cutover',
    });
    const records = fixture.records();
    const held = records.filter(record => fixture.heldIds.includes(String(record.Id)));
    expect(held).toHaveLength(5);
    expect(
      held.every(
        record => record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
      )
    ).toBe(true);
  });

  it('resumes rollback over the real Root joined prefix (D5J clean prefix 4)', async () => {
    const fixture = await joinedWriterResumeFixture('rollback');

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fixture.q12Capability)).toBe(false);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(receipt).toMatchObject({
      schema_version: 'megacampus.q12.writer-resume-state/v1',
      run_id: fixture.runId,
      state: 'writers_resumed',
      mode: 'rollback',
      lease_epoch: 'cutover',
    });
    // Clean rollback holds no targets (no deploy.prepare completion): the ten
    // originals are the final set and there are zero held writers.
    expect(fixture.heldIds).toHaveLength(0);
    expect(fixture.finalIds).toHaveLength(10);
  });

  it('resumes forward over a real Root install recovery-reissue chain (was linked-recovery)', async () => {
    const fixture = await joinedWriterResumeFixture(
      'forward',
      installChainSpec({ recoveryReissues: 1 })
    );

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(receipt).toMatchObject({ state: 'writers_resumed', mode: 'forward' });
    // The install lifecycle superseded its cutover capability into a recovery
    // epoch, so the completed barrier.install authority is journal-bound in
    // cutover-recovery-1 with Root checkpoint provenance for both epochs.
    const capabilities = readdirSync(join(fixture.q12RunRoot, 'capabilities', 'superseded'));
    expect(capabilities).toContain('barrier.install--cutover.json');
  });

  it.each([
    ['orphan-recovery', { recoveryReissues: 1 as const, publicationWindowOrphans: 1 as const }],
    ['completion-recovery', { completionMode: 'move-no-row-reacquired' as const }],
  ])('resumes forward over a real Root install %s chain', async (_label, overrides) => {
    const fixture = await joinedWriterResumeFixture('forward', installChainSpec(overrides));

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(receipt).toMatchObject({ state: 'writers_resumed', mode: 'forward' });
  });

  function invokeResumeWrapper(
    fixture: ComposeWriterFixture,
    runIdArg: string,
    runRootEnv: string
  ): ReturnType<typeof spawnSync> {
    const cutoverLock = join(fixture.directory, 'q12-cutover.lock');
    writeFileSync(cutoverLock, '', { mode: 0o600 });
    chmodSync(cutoverLock, 0o600);
    writeResumeTestDockerEnvironment(fixture, {});
    return spawnSync(
      'bash',
      [
        '-c',
        'exec 9<>"$1"; flock -n 9; shift; exec bash "$@"',
        'q12-resume-lease',
        cutoverLock,
        WRAPPER,
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        'forward',
        '--run-id',
        runIdArg,
      ],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_RUN_ROOT: runRootEnv,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: cutoverLock,
          Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
        },
        encoding: 'utf8',
      }
    );
  }

  it('wrapper rejects a resume run-id that is neither UUIDv4 nor UUIDv5', () => {
    const fixture = composeWriterFixture();
    // Version nibble 3 is neither v4 nor v5.
    const result = invokeResumeWrapper(
      fixture,
      '223e4567-e89b-32d3-a456-426614174000',
      fixture.q12RunRoot
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--run-id must be a UUIDv4 or UUIDv5');
  });

  it('wrapper rejects a resume run root matching neither the wrapper nor the joined pattern', () => {
    const fixture = composeWriterFixture();
    const bogusRoot = mkdtempSync('/tmp/mc2-bogus-resume-root-');
    temporaryDirectories.push(bogusRoot);
    // A valid UUIDv5 run id passes the id gate; the run root must still match a
    // known test pattern (wrapper backups/q12 or the joined /tmp/mc2-q12-d5-root-*).
    const result = invokeResumeWrapper(fixture, '223e4567-e89b-52d3-a456-426614174000', bogusRoot);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('protected resume test run root is invalid');
  });

  it.each([0, 1, 2, 3, 4, 5])(
    'resumes rollback original ten while preserving an exact held target set of %i',
    async heldTargetCount => {
      // held 0 = clean prefix 4; 1..5 = the sanctioned partialCaptureTargets crash
      // lever (partial durable capture; k=5 = full capture, no activate). All over
      // the real Root joined prefix; W reads the FWM held set read-only.
      const fixture = await joinedWriterResumeFixture(
        'rollback',
        undefined,
        {},
        false,
        heldTargetCount
      );

      const result = fixture.resume();

      expect(result.status, result.stderr).toBe(0);
      const records = fixture.records();
      expect(fixture.finalIds).toHaveLength(10);
      expect(fixture.heldIds).toHaveLength(heldTargetCount);
      expect(
        records
          .filter(record => fixture.heldIds.includes(String(record.Id)))
          .every(
            record =>
              record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
          )
      ).toBe(true);
      expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
        schema_version: 'megacampus.q12.writer-resume-state/v1',
        run_id: fixture.runId,
        state: 'writers_resumed',
        mode: 'rollback',
      });
    }
  );

  it.each([
    {
      label: 'same active project color',
      mode: 'forward' as const,
      held: 5,
      transform: (records: Array<Record<string, any>>) =>
        records.map((record, index) => {
          if (index > 1) return record;
          return {
            ...record,
            Config: {
              ...record.Config,
              Labels: {
                ...record.Config.Labels,
                'com.docker.compose.project': 'megacampus-blue',
              },
            },
          };
        }),
    },
    {
      label: 'duplicated production worker service',
      mode: 'forward' as const,
      held: 5,
      transform: (records: Array<Record<string, any>>) =>
        records.map((record, index) => {
          if (index !== 2) return record;
          return {
            ...record,
            Config: {
              ...record.Config,
              Labels: {
                ...record.Config.Labels,
                'com.docker.compose.service': 'worker-stage6',
              },
            },
          };
        }),
    },
    {
      label: 'non-prefix rollback target creation set',
      mode: 'rollback' as const,
      held: 3,
      transform: (records: Array<Record<string, any>>) => [
        records[0],
        records[1],
        records[3],
        records[2],
        records[4],
      ],
    },
  ])('rejects a $label before any writer start', ({ mode, held, transform }) => {
    const fixture = writerResumeFixture(mode, held, false, {
      targetRecordsTransform: transform,
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/topology|target creation prefix|project color/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it.each([
    {
      label: 'unknown conditional receipt',
      options: { rollbackRequiredPhases: ['unknown_rollback_verified'] },
    },
    {
      label: 'out-of-order conditional receipt journal',
      options: {
        rollbackJournalPhaseOrderTransform: (phases: string[]) => [
          phases[0],
          phases[2],
          phases[1],
          ...phases.slice(3),
        ],
      },
    },
  ])('rejects an $label before rollback writer start', async ({ options }) => {
    const fixture = await joinedWriterResumeFixture('rollback', undefined, options);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/rollback.*conditional|rollback.*phase receipt/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('compensates every final writer to stopped/no after an ordered resume start failure', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_FAIL_START_AFTER: '2',
      SOURCE_RECOVERY_TEST_START_COUNTER: join(fixture.directory, 'resume-start-counter'),
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
    const relevant = fixture
      .records()
      .filter(record => [...fixture.finalIds, ...fixture.heldIds].includes(String(record.Id)));
    expect(
      relevant.every(
        record => record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
      )
    ).toBe(true);
  });

  it('compensates every final writer when restart-policy restoration fails', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_FAIL_RESTORE_POLICY_AFTER: '2',
      SOURCE_RECOVERY_TEST_RESTORE_POLICY_COUNTER: join(fixture.directory, 'resume-policy-counter'),
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^start /mu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^update --restart=(?!no\b)/mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
    const relevant = fixture
      .records()
      .filter(record => [...fixture.finalIds, ...fixture.heldIds].includes(String(record.Id)));
    expect(
      relevant.every(
        record => record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
      )
    ).toBe(true);
  });

  it('does not start Web after API health verification fails and compensates all final writers', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    const firstApi = (manifest.final_writers as Array<Record<string, any>>).find(writer =>
      String(writer.class).endsWith('-api')
    );
    expect(firstApi).toBeDefined();

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_START_STARTING_ID: String(firstApi!.id),
    });

    expect(result.status).not.toBe(0);
    const dockerLog = readFileSync(fixture.dockerLog, 'utf8');
    expect(dockerLog).toContain(`start ${firstApi!.id}`);
    const webIds = (manifest.final_writers as Array<Record<string, any>>)
      .filter(writer => String(writer.class).endsWith('-web'))
      .map(writer => String(writer.id));
    expect(webIds.every(id => !dockerLog.includes(`start ${id}`))).toBe(true);
    expect(existsSync(fixture.resumeState)).toBe(false);
    const relevant = fixture
      .records()
      .filter(record => [...fixture.finalIds, ...fixture.heldIds].includes(String(record.Id)));
    expect(
      relevant.every(
        record => record.State.Running === false && record.HostConfig.RestartPolicy.Name === 'no'
      )
    ).toBe(true);
  });

  it('compensates when Docker reports a successful start without a running writer', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    const firstRunning = (manifest.final_writers as Array<Record<string, any>>).find(
      writer => writer.intended_running
    );
    expect(firstRunning).toBeDefined();

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_START_NOOP_ID: String(firstRunning!.id),
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toContain(`start ${firstRunning!.id}`);
    expectResumeCompensated(fixture);
  });

  it('compensates a final restart-policy drift after every ordered start', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    const target = (manifest.final_writers as Array<Record<string, any>>).find(
      writer => writer.intended_restart_policy.name !== 'always'
    );
    expect(target).toBeDefined();

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_DRIFT_POLICY_ID: String(target!.id),
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toMatch(/^update --restart=(?!no\b)/mu);
    expectResumeCompensated(fixture);
  });

  it('compensates every final writer when isolated resume receives SIGTERM', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const child = resumeChild(fixture, 'forward', {
      SOURCE_RECOVERY_TEST_SLEEP_AFTER_START: '2',
    });
    const deadline = Date.now() + 2_000;
    while (
      !fixture.records().some(record => record.State.Running === true) &&
      Date.now() < deadline
    ) {
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    expect(fixture.records().some(record => record.State.Running === true)).toBe(true);

    process.kill(child.pid!, 'SIGTERM');
    await new Promise<void>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', () => resolveExit());
    });

    expectResumeCompensated(fixture);
  }, 15_000);

  it('detects an atomic authority-input swap and compensates before receipt publication', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const replacement = join(fixture.directory, 'swapped-resume-barrier.json');
    writeFileSync(replacement, readFileSync(fixture.barrierReceipt), { mode: 0o400 });

    const result = fixture.resume('forward', {
      SOURCE_RECOVERY_TEST_SWAP_FILE_AFTER_INSPECT: '1',
      SOURCE_RECOVERY_TEST_INSPECT_COUNTER: join(fixture.directory, 'resume-inspect-counter'),
      SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT: replacement,
      SOURCE_RECOVERY_TEST_SWAP_TARGET: fixture.barrierReceipt,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed after validation/iu);
    expectResumeCompensated(fixture);
  });

  it('publishes a missing terminal receipt without replay after an exact-terminal crash', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const interrupted = fixture.resume('forward', {
      SOURCE_RECOVERY_RESUME_FAULT_POINT: 'after-terminal-before-receipt',
    });

    expect(interrupted.status).not.toBe(0);
    expect(existsSync(fixture.resumeState)).toBe(false);
    const startsBeforeRecovery = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;
    const leaseEpoch = advanceWriterResumeRecoveryEpoch(fixture, 'forward');

    const recovered = fixture.resume();

    expect(recovered.status, recovered.stderr).toBe(0);
    const startsAfterRecovery = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;
    expect(startsAfterRecovery).toBe(startsBeforeRecovery);
    expect(JSON.parse(readFileSync(fixture.resumeState, 'utf8'))).toMatchObject({
      schema_version: 'megacampus.q12.writer-resume-state/v1',
      state: 'writers_resumed',
      mode: 'forward',
      lease_epoch: leaseEpoch,
    });
  });

  it('leaves one owned terminal receipt and no hard-link temporary residue after rename crash', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const interrupted = fixture.resume('forward', {
      SOURCE_RECOVERY_RESUME_FAULT_POINT: 'after-terminal-rename',
    });

    expect(interrupted.status).not.toBe(0);
    expect(existsSync(fixture.resumeState)).toBe(true);
    expect(
      readdirSync(fixture.q12RunRoot).filter(name => name.startsWith('.writer-resume-state.'))
    ).toEqual([]);
    const terminalStat = statSync(fixture.resumeState);
    expect(terminalStat.uid).toBe(process.getuid?.() ?? 1000);
    expect(terminalStat.gid).toBe(process.getgid?.() ?? 1000);
    expect(terminalStat.mode & 0o777).toBe(0o400);
    const startsBeforeRetry = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;

    const recovered = fixture.resume();

    expect(recovered.status, recovered.stderr).toBe(0);
    const startsAfterRetry = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;
    expect(startsAfterRetry).toBe(startsBeforeRetry);
    const controller = source('deploy/qdrant/q12-writer-resume.py');
    expect(controller).toMatch(/os\.fchown\(fd, uid, gid\)[\s\S]*rename_noreplace/);
  });

  it('fails closed on a deterministic terminal temporary symlink before writer start', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const target = join(fixture.directory, 'terminal-temp-target');
    writeFileSync(target, 'attacker-controlled\n', { mode: 0o400 });
    symlinkSync(target, join(fixture.q12RunRoot, '.writer-resume-state.tmp'));

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/temporary.*(?:regular file|symlink|not canonical)/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('retains a durable deterministic terminal temporary after fsync crash and blocks same-epoch replay', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const terminalTemporary = join(fixture.q12RunRoot, '.writer-resume-state.tmp');

    const interrupted = fixture.resume('forward', {
      SOURCE_RECOVERY_RESUME_FAULT_POINT: 'after-terminal-temp-fsync',
    });

    expect(interrupted.status).not.toBe(0);
    expect(existsSync(fixture.resumeState)).toBe(false);
    expect(existsSync(terminalTemporary)).toBe(true);
    expect(statSync(terminalTemporary).mode & 0o777).toBe(0o400);
    const startsBeforeRetry = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;

    const retry = fixture.resume();

    expect(retry.status).not.toBe(0);
    expect(retry.stderr).toMatch(/temporary residue.*recovery epoch/iu);
    const startsAfterRetry = readFileSync(fixture.dockerLog, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('start ')).length;
    expect(startsAfterRetry).toBe(startsBeforeRetry);
    expect(existsSync(terminalTemporary)).toBe(true);
  });

  it('removes only exact deterministic temporary residue beside an accepted terminal receipt', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const first = fixture.resume();
    expect(first.status, first.stderr).toBe(0);
    const terminalTemporary = join(fixture.q12RunRoot, '.writer-resume-state.tmp');
    writeFileSync(terminalTemporary, readFileSync(fixture.resumeState), { mode: 0o400 });

    const retry = fixture.resume();

    expect(retry.status, retry.stderr).toBe(0);
    expect(existsSync(terminalTemporary)).toBe(false);
  });

  it('compensates a partial SIGKILL resume and requires the next recovery epoch', async () => {
    const fixture = await joinedWriterResumeFixture('forward');

    const interrupted = fixture.resume('forward', {
      SOURCE_RECOVERY_RESUME_FAULT_POINT: 'after-first-start',
    });

    expect(interrupted.status).not.toBe(0);
    expect(fixture.records().some(record => record.State.Running === true)).toBe(true);
    expect(existsSync(fixture.resumeState)).toBe(false);
    advanceWriterResumeRecoveryEpoch(fixture, 'forward');

    const recovered = fixture.resume();

    expect(recovered.status).not.toBe(0);
    expect(recovered.stderr).toMatch(/partial resume.*compensated|new recovery epoch/iu);
    expectResumeCompensated(fixture);
  });

  it('preserves a created writer without a healthcheck through rollback resume', async () => {
    const fixture = await joinedWriterResumeFixture('rollback', undefined, {}, true);
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    // The joined topology has several healthcheck-less workers; the created one
    // is uniquely the never-run entry (intended_running=false + no healthcheck).
    const created = (manifest.final_writers as Array<Record<string, any>>).find(
      writer => writer.healthcheck_present === false && writer.intended_running === false
    );
    expect(created).toMatchObject({ intended_running: false, healthcheck_present: false });

    const result = fixture.resume();

    expect(result.status, result.stderr).toBe(0);
    const actual = fixture.records().find(record => record.Id === created!.id);
    expect(actual).toMatchObject({
      State: { Running: false, Status: 'created', Health: null },
      HostConfig: {
        RestartPolicy: {
          Name: created!.intended_restart_policy.name,
          MaximumRetryCount: created!.intended_restart_policy.maximum_retry_count,
        },
      },
    });
  });

  it('rejects an extra release_sha in the exact fourteen-key terminal receipt', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const initial = fixture.resume();
    expect(initial.status, initial.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
    expect(Object.keys(receipt)).toHaveLength(14);
    receipt.release_sha = 'e'.repeat(40);
    writeProtectedJson(fixture.resumeState, receipt);

    const replay = fixture.resume();

    expect(replay.status).not.toBe(0);
    expect(replay.stderr).toMatch(/ambiguous|writer resume state/iu);
  });

  it('rejects a resume authority superset before any writer start', () => {
    const fixture = writerResumeFixture('forward');
    const authority = JSON.parse(readFileSync(fixture.authority, 'utf8')) as Record<string, any>;
    authority.unreviewed = true;
    writeProtectedJson(fixture.authority, authority);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/resume authority/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it.each([
    {
      label: 'final publication intent hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.finalManifest, value => {
          value.publication_intent_journal_entry_hash = 'not-a-hash';
        }),
    },
    {
      label: 'final predecessor checkpoint hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.finalManifest, value => {
          value.input_checkpoint_sha256 = 'not-a-hash';
        }),
    },
    {
      label: 'handoff release binding',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`),
          value => {
            value.release_sha = 'f'.repeat(40);
          }
        ),
    },
    {
      label: 'handoff catalog binding',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`),
          value => {
            value.expected_catalog_sha256 = 'f'.repeat(64);
          }
        ),
    },
    {
      label: 'handoff database activation hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`),
          value => {
            value.database_activation_receipt_sha256 = 'not-a-hash';
          }
        ),
    },
    {
      label: 'handoff publication intent hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`),
          value => {
            value.publication_intent_journal_entry_hash = 'not-a-hash';
          }
        ),
    },
    {
      label: 'handoff predecessor checkpoint hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`),
          value => {
            value.input_checkpoint_sha256 = 'not-a-hash';
          }
        ),
    },
    {
      label: 'rollback release binding',
      mode: 'rollback' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-rollback-state-${Q12_RUN_ID}.json`),
          value => {
            value.release_sha = 'f'.repeat(40);
          }
        ),
    },
    {
      label: 'rollback barrier receipt hash',
      mode: 'rollback' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-rollback-state-${Q12_RUN_ID}.json`),
          value => {
            value.database_barrier_receipt_sha256 = 'f'.repeat(64);
          }
        ),
    },
    {
      label: 'rollback predecessor checkpoint hash',
      mode: 'rollback' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-rollback-state-${Q12_RUN_ID}.json`),
          value => {
            value.input_checkpoint_sha256 = 'not-a-hash';
          }
        ),
    },
    {
      label: 'rollback publication intent hash',
      mode: 'rollback' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(
          join(fixture.q12RunRoot, `writer-rollback-state-${Q12_RUN_ID}.json`),
          value => {
            value.publication_intent_journal_entry_hash = 'not-a-hash';
          }
        ),
    },
    {
      label: 'authority release binding',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.authority, value => {
          value.release_sha = 'f'.repeat(40);
        }),
    },
    {
      label: 'authority final manifest hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.authority, value => {
          value.final_writer_manifest_sha256 = 'f'.repeat(64);
        }),
    },
    {
      label: 'authority database barrier hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.authority, value => {
          value.database_barrier_receipt_sha256 = 'f'.repeat(64);
        }),
    },
    {
      label: 'authority predecessor checkpoint hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.authority, value => {
          value.input_checkpoint_sha256 = 'not-a-hash';
        }),
    },
    {
      label: 'authority publication intent hash',
      mode: 'forward' as const,
      mutate: (fixture: ResumeWriterFixture) =>
        mutateProtectedJson(fixture.authority, value => {
          value.authority_intent_journal_entry_hash = 'not-a-hash';
        }),
    },
  ])('rejects a broken $label before any writer start', ({ mode, mutate }) => {
    const fixture = writerResumeFixture(mode);
    mutate(fixture);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/binding|invalid|state|manifest|authority/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects cross-mode authority before any writer start', () => {
    const fixture = writerResumeFixture('forward');

    const result = fixture.resume('rollback');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mode|authority|cleanup/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it.each(['postcutover_schedule', 'credential_rotation'])(
    'rejects the non-resume %s lease epoch before any writer start',
    leaseEpoch => {
      const fixture = writerResumeFixture('forward');
      rewriteWriterResumeEpoch(fixture, 'forward', leaseEpoch);

      const result = fixture.resume();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/authority|lease|binding/iu);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
      expect(existsSync(fixture.resumeState)).toBe(false);
    }
  );

  it('rejects a recreated final writer identity before any start', async () => {
    const fixture = await joinedWriterResumeFixture('forward');
    const records = fixture.records();
    records.find(record => record.Id === fixture.finalIds[0])!.Image = `sha256:${'f'.repeat(64)}`;
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/identity|image/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects an unrecorded target identity before any start', async () => {
    // held is incidental to this contract; a target-bearing joined rollback (held=4
    // via the partial-capture lever) gives the target project the unrecorded-inventory
    // check needs.
    const fixture = await joinedWriterResumeFixture('rollback', undefined, {}, false, 4);
    const records = fixture.records();
    records.push({
      ...targetWriterRecords()[4],
      Id: `16${'c'.repeat(62)}`,
      Name: '/megacampus-green-unrecorded-1',
      Config: {
        ...targetWriterRecords()[4].Config,
        Labels: {
          ...targetWriterRecords()[4].Config.Labels,
          'com.docker.compose.service': 'unrecorded',
        },
      },
    });
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unrecorded|inventory/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects resume without the inherited held canonical lease descriptor', () => {
    const fixture = writerResumeFixture('forward');

    const result = spawnSync(
      'bash',
      [
        WRAPPER,
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        'forward',
        '--run-id',
        Q12_RUN_ID,
      ],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_RUN_ROOT: fixture.q12RunRoot,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: fixture.cutoverLock,
          Q12_EXTERNAL_QUIESCE_LEASE_FD: '9',
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inherited lease FD|lease descriptor|descriptor surface/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects the mutable monolithic --stop-writers path for a Q12 run before writer mutation', () => {
    const fixture = composeWriterFixture();

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/quiesce-writers-only|external-quiesce-manifest/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(
      /^(?:inspect|update|stop|start) /mu
    );
  });

  // The ordinary non-Q12 forward is the ONLY route left once the window is retired, and it is
  // reached by dropping the Q12 flags. It requires the writers to be stopped before it collects
  // them, which is exactly the state in which Docker reports a healthcheck-bearing writer
  // `unhealthy`. No suite covered that combination, so a clause no stopped writer could satisfy
  // survived: on 2026-07-31 the real run died at `megacampus-blue/api` with a message that named
  // only itself.
  it('runs an ordinary non-Q12 forward over writers already stopped and therefore unhealthy', () => {
    const fixture = composeWriterFixture();
    const args = [...fixture.args];
    removeOption(args, '--database-barrier-receipt');
    removeOption(args, '--q12-db-capability-file');
    const records = fixture.records();
    for (const record of records) {
      record.State.Running = false;
      record.State.Status = 'exited';
      if (record.State.Health !== null) record.State.Health.Status = 'unhealthy';
    }
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });

    const result = spawnSync('bash', [WRAPPER, ...args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const compose = readFileSync(fixture.composeLog, 'utf8');
    for (const mode of ['plan', 'execute', 'verify', 'apply-dispositions', 'verify-dispositions']) {
      expect(compose).toContain(`source-recovery ${mode}`);
    }
    // The ordinary route never touches a writer; the operator owns the quiesce.
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('refuses an ordinary non-Q12 forward while a writer is still running', () => {
    const fixture = composeWriterFixture();
    const args = [...fixture.args];
    removeOption(args, '--database-barrier-receipt');
    removeOption(args, '--q12-db-capability-file');

    const result = spawnSync('bash', [WRAPPER, ...args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('active Compose writers require');
    expect(existsSync(fixture.composeLog)).toBe(false);
  });

  it('names the failing clause instead of only itself when a writer identity is invalid', () => {
    const fixture = composeWriterFixture();
    const args = [...fixture.args];
    removeOption(args, '--database-barrier-receipt');
    removeOption(args, '--q12-db-capability-file');
    const records = fixture.records();
    for (const record of records) {
      record.State.Running = false;
      record.State.Status = 'exited';
    }
    records[0].State.Restarting = true;
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });

    const result = spawnSync('bash', [WRAPPER, ...args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('writer identity/state/policy is invalid: megacampus-blue/api');
    expect(result.stderr).toContain('container is restarting');
  });

  it('publishes the exact immutable quiesce inventory, transitions, and final evidence', () => {
    const fixture = writerQuiesceFixture();

    const result = fixture.quiesce();

    expect(result.status, result.stderr).toBe(0);
    const inventory = JSON.parse(readFileSync(fixture.inventory, 'utf8')) as Record<string, any>;
    expect(Object.keys(inventory).sort()).toEqual(
      [
        'schema_version',
        'run_id',
        'command_id',
        'lease_epoch',
        'capability_sha256',
        'capability_input_checkpoint_sha256',
        'input_checkpoint_sha256',
        'database_barrier_receipt_sha256',
        'writers',
      ].sort()
    );
    expect(inventory).toMatchObject({
      schema_version: 'megacampus.q12.writer-quiesce-inventory/v1',
      run_id: Q12_RUN_ID,
      command_id: 'writers.quiesce',
      lease_epoch: 'cutover',
      capability_sha256: fileSha256(fixture.capability),
      capability_input_checkpoint_sha256: fileSha256(fixture.capabilityCheckpoint),
      input_checkpoint_sha256: fileSha256(fixture.inputCheckpoint),
      database_barrier_receipt_sha256: fileSha256(fixture.barrierReceipt),
    });
    expect(inventory.writers).toHaveLength(10);
    const planned = JSON.parse(readFileSync(fixture.plannedTransition, 'utf8')) as Record<
      string,
      any
    >;
    const policyNo = JSON.parse(readFileSync(fixture.policyNoTransition, 'utf8')) as Record<
      string,
      any
    >;
    const terminal = JSON.parse(readFileSync(fixture.terminalTransition, 'utf8')) as Record<
      string,
      any
    >;
    expect([planned.state, policyNo.state, terminal.state]).toEqual([
      'policy_change_planned',
      'policy_no_verified',
      'quiesced',
    ]);
    expect(planned.previous_transition_sha256).toBeNull();
    expect(policyNo.previous_transition_sha256).toBe(fileSha256(fixture.plannedTransition));
    expect(terminal.previous_transition_sha256).toBe(fileSha256(fixture.policyNoTransition));
    expect(terminal.writer_quiesce_manifest_sha256).toBe(fileSha256(fixture.quiesceManifest));
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    const operationLog = readFileSync(fixture.dockerLog, 'utf8').trim().split('\n');
    const productionProbe = operationLog.findIndex(line =>
      line.includes('probe https://ai.megacampus.ru/')
    );
    const developmentProbe = operationLog.findIndex(line =>
      line.includes('probe https://dev.ai.megacampus.ru/')
    );
    const firstWorkerStop = operationLog.findIndex(
      line =>
        line.startsWith('stop ') &&
        fixture
          .records()
          .filter(record =>
            String(record.Config.Labels['com.docker.compose.service']).includes('worker')
          )
          .some(record => line.endsWith(record.Id))
    );
    expect(productionProbe).toBeGreaterThan(-1);
    expect(developmentProbe).toBeGreaterThan(productionProbe);
    expect(firstWorkerStop).toBeGreaterThan(developmentProbe);
    expect(
      readdirSync(fixture.q12RunRoot).filter(name => name.includes('quiesce-recovery-overlay'))
    ).toEqual([]);
  });

  it.each([
    ['after-inventory', ['inventory']],
    ['after-planned', ['inventory', 'plannedTransition']],
    ['after-policy-no', ['inventory', 'plannedTransition', 'policyNoTransition']],
  ] as const)(
    'continues the immutable quiesce prefix through a Root-accepted overlay: %s',
    (faultPoint, evidenceNames) => {
      const fixture = writerQuiesceFixture();
      const interrupted = fixture.quiesce({
        SOURCE_RECOVERY_QUIESCE_FAULT_POINT: faultPoint,
      });
      expect(interrupted.status).not.toBe(0);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
      const immutablePrefix = Object.fromEntries(
        evidenceNames.map(name => {
          const path = fixture[name];
          return [path, readFileSync(path)];
        })
      );
      const { overlay } = advanceWriterQuiesceRecoveryEpoch(fixture);
      writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

      const recovered = fixture.quiesce();

      expect(recovered.status, recovered.stderr).toBe(0);
      for (const [path, bytes] of Object.entries(immutablePrefix)) {
        expect(readFileSync(path)).toEqual(bytes);
      }
      expect(existsSync(overlay)).toBe(true);
      expect(
        readdirSync(fixture.q12RunRoot).filter(name =>
          name.startsWith(`writer-quiesce-recovery-overlay-${Q12_RUN_ID}-`)
        )
      ).toHaveLength(1);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
      expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
      expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
        true
      );
    }
  );

  it('reissues before inventory without any recovery overlay or pre-inventory mutation', () => {
    const fixture = writerQuiesceFixture();
    const interrupted = fixture.quiesce({
      SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'before-inventory',
    });
    expect(interrupted.status).not.toBe(0);
    expect(existsSync(fixture.inventory)).toBe(false);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:start|stop|update) /mu);
    const recovery = advanceWriterQuiesceRecoveryEpoch(fixture);
    expect(recovery.overlay).toBe('');
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const recovered = fixture.quiesce();

    expect(recovered.status, recovered.stderr).toBe(0);
    expect(
      readdirSync(fixture.q12RunRoot).filter(name => name.includes('quiesce-recovery-overlay'))
    ).toEqual([]);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it.each(['issued-file', 'claimed-file'] as const)(
    'accepts a superseded quiesce capability recovered from the %s durable boundary',
    boundary => {
      const fixture = writerQuiesceFixture();
      rewindWriterQuiesceToOrphanBoundary(fixture, boundary);
      advanceWriterQuiesceRecoveryEpoch(fixture);

      const result = fixture.quiesce();

      expect(result.status, result.stderr).toBe(0);
      expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    }
  );

  it('reconstructs only the missing terminal transition after an exact final manifest', () => {
    const fixture = writerQuiesceFixture();
    const interrupted = fixture.quiesce({
      SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'after-final',
    });
    expect(interrupted.status).not.toBe(0);
    const immutableFiles = [
      fixture.inventory,
      fixture.plannedTransition,
      fixture.policyNoTransition,
      fixture.quiesceManifest,
    ];
    const immutableBytes = immutableFiles.map(path => readFileSync(path));
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const recovered = fixture.quiesce();

    expect(recovered.status, recovered.stderr).toBe(0);
    expect(existsSync(fixture.terminalTransition)).toBe(true);
    immutableFiles.forEach((path, index) =>
      expect(readFileSync(path)).toEqual(immutableBytes[index])
    );
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:start|stop|update) /mu);
    expect(
      readdirSync(fixture.q12RunRoot).filter(name => name.includes('quiesce-recovery-overlay'))
    ).toEqual([]);
  });

  it('leaves an unaccepted Root overlay immutable and requires the next linked recovery epoch', () => {
    const fixture = writerQuiesceFixture();
    expect(
      fixture.quiesce({ SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'after-inventory' }).status
    ).not.toBe(0);
    const abandoned = advanceWriterQuiesceRecoveryEpoch(fixture, 1, false).overlay;
    const abandonedBytes = readFileSync(abandoned);
    const journalBeforeChild = readFileSync(fixture.journal);
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const forbiddenChild = fixture.quiesce();

    expect(forbiddenChild.status).not.toBe(0);
    expect(readFileSync(fixture.journal)).toEqual(journalBeforeChild);
    expect(readFileSync(abandoned)).toEqual(abandonedBytes);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:start|stop|update) /mu);

    const accepted = advanceWriterQuiesceRecoveryEpoch(fixture, 2).overlay;
    expect(JSON.parse(readFileSync(accepted, 'utf8')).previous_overlay_sha256).toBe(
      fileSha256(abandoned)
    );
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });
    const recovered = fixture.quiesce();

    expect(recovered.status, recovered.stderr).toBe(0);
    expect(readFileSync(abandoned)).toEqual(abandonedBytes);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it.each([
    {
      label: 'overlay replacement',
      mutate: (fixture: WriterQuiesceFixture, overlay: string) => {
        mutateProtectedJson(overlay, value => {
          value.previous_overlay_sha256 = 'f'.repeat(64);
        });
      },
    },
    {
      label: 'cross-capability overlay',
      mutate: (fixture: WriterQuiesceFixture, overlay: string) => {
        mutateProtectedJson(overlay, value => {
          value.new_capability_sha256 = 'f'.repeat(64);
        });
      },
    },
    {
      label: 'unknown temporary residue',
      mutate: (fixture: WriterQuiesceFixture) => {
        writeFileSync(`${fixture.plannedTransition}.tmp`, 'untrusted\n', { mode: 0o400 });
      },
    },
    {
      label: 'invented abandonment object',
      mutate: (fixture: WriterQuiesceFixture) => {
        writeFileSync(
          join(fixture.q12RunRoot, `writer-quiesce-recovery-abandonment-${Q12_RUN_ID}.json`),
          '{}\n',
          { mode: 0o400 }
        );
      },
    },
    {
      label: 'writer identity drift',
      mutate: (fixture: WriterQuiesceFixture) => {
        const records = fixture.records();
        records[0].Name = '/replacement-writer';
        writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });
      },
    },
    {
      label: 'unreferenced capability',
      mutate: (fixture: WriterQuiesceFixture) => {
        writeFileSync(
          join(fixture.capabilitiesRoot, 'issued', 'writers.quiesce--cutover-recovery-99.json'),
          readFileSync(fixture.capability),
          { mode: 0o400 }
        );
      },
    },
  ])('rejects a quiesce recovery $label without child start', ({ mutate }) => {
    const fixture = writerQuiesceFixture();
    expect(
      fixture.quiesce({ SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'after-inventory' }).status
    ).not.toBe(0);
    const { overlay } = advanceWriterQuiesceRecoveryEpoch(fixture);
    mutate(fixture, overlay);
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const rejected = fixture.quiesce();

    expect(rejected.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.quiesceManifest)).toBe(false);
  });

  it('rejects a missing abandoned-overlay chain link', () => {
    const fixture = writerQuiesceFixture();
    expect(
      fixture.quiesce({ SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'after-inventory' }).status
    ).not.toBe(0);
    const abandoned = advanceWriterQuiesceRecoveryEpoch(fixture, 1, false).overlay;
    advanceWriterQuiesceRecoveryEpoch(fixture, 2);
    rmSync(abandoned);
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const rejected = fixture.quiesce();

    expect(rejected.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a mutable final quiesce result without replay', () => {
    const fixture = writerQuiesceFixture();
    expect(fixture.quiesce({ SOURCE_RECOVERY_QUIESCE_FAULT_POINT: 'after-final' }).status).not.toBe(
      0
    );
    chmodSync(fixture.quiesceManifest, 0o600);
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const rejected = fixture.quiesce();

    expect(rejected.status).not.toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:start|stop|update) /mu);
    expect(existsSync(fixture.terminalTransition)).toBe(false);
  });

  it('pins the approved exact ten-writer Compose inventory and external quiesce contract', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    const entrypoint = source('packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh');

    for (const identity of COMPOSE_WRITERS) {
      for (const alternative of identity.split('|')) {
        const [project, service] = alternative.split('/');
        expect(wrapper).toContain(`'${project}:${service}'`);
      }
    }
    expect(wrapper).toContain('megacampus.q12.writer-quiesce/v1');
    expect(wrapper).toContain('--external-quiesce-manifest');
    expect(wrapper).toContain('Q12_EXTERNAL_QUIESCE_LEASE_FD');
    expect(wrapper).toContain('--database-barrier-receipt');
    expect(wrapper).toContain('com.docker.compose.project');
    expect(wrapper).toContain('com.docker.compose.service');
    expect(wrapper).toContain('docker compose down is forbidden');
    expect(wrapper).toContain("readonly CONTROLLER_UID='1000'");
    expect(wrapper).toContain("readonly CONTROLLER_GID='1000'");
    expect(entrypoint).toContain("readonly CONTROLLER_UID='1000'");
    expect(entrypoint).toContain("readonly CONTROLLER_GID='1000'");
  });

  it('accepts an exact external quiesce lease without any automatic Docker start or stop', () => {
    const fixture = composeWriterFixture();
    const before = fixture.records();
    for (const record of before) {
      record.State.Running = false;
      record.State.Status = 'exited';
      record.HostConfig.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
    }
    writeFileSync(fixture.recordsPath, `${JSON.stringify(before)}\n`, { mode: 0o600 });
    const external = fixture.quiesceManifest;
    const externalPayload = {
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: Q12_RUN_ID,
      status: 'quiesced',
      barrier: {
        state: 'recovery_ready_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: 'b'.repeat(64),
        probe_receipt_sha256: createHash('sha256')
          .update(readFileSync(fixture.probeReceipt))
          .digest('hex'),
      },
      writers: before.map((record, index) => ({
        class:
          index === 0
            ? 'production-api'
            : index === 1
              ? 'production-web'
              : index < 5
                ? 'production-worker'
                : index === 5
                  ? 'development-api'
                  : index === 6
                    ? 'development-web'
                    : 'development-worker',
        id: record.Id,
        name: record.Name,
        project: record.Config.Labels['com.docker.compose.project'],
        service: record.Config.Labels['com.docker.compose.service'],
        config_files: record.Config.Labels['com.docker.compose.project.config_files'],
        working_dir: record.Config.Labels['com.docker.compose.project.working_dir'],
        image_id: record.Image,
        image_ref: record.Config.Image,
        prior_running: true,
        prior_status: 'running',
        healthcheck_present: true,
        prior_health_status: 'healthy',
        prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
        temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
      })),
    };
    writeFileSync(
      external,
      `${JSON.stringify({ ...externalPayload, run_id: '123e4567-e89b-42d3-a456-426614174000' })}\n`,
      { mode: 0o400 }
    );
    const lease = join(fixture.directory, 'q12-cutover.lock');
    writeFileSync(lease, '', { mode: 0o600 });
    // The Q12 forward tail now emits the source.forward acceptance authority; stage its
    // operator-held inputs so this lease-focused test still reaches a clean forward exit.
    writeFileSync(
      join(fixture.q12RunRoot, 'accepted-coverage-run'),
      'catalog:123e4567-e89b-42d3-a456-426614174000\n',
      { mode: 0o400 }
    );
    const leaseEnvFile = fixture.args[fixture.args.indexOf('--env-file') + 1];
    writeFileSync(
      leaseEnvFile,
      [
        'QDRANT_OPERATOR_IMAGE_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'SUPABASE_URL=https://synthetic-project.supabase.invalid',
        'SUPABASE_SERVICE_KEY=synthetic-service-role-key-value',
        '',
      ].join('\n')
    );
    const leaseEmitBin = join(fixture.directory, 'bin/emit-acceptance');
    writeFileSync(
      leaseEmitBin,
      `#!/usr/bin/env bash
set -euo pipefail
output=''
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  [[ "\${args[i]}" != --output ]] || output="\${args[i + 1]}"
done
printf '{"schema":"megacampus.q12.source-forward-acceptance/v1"}\n' > "$output"
chmod 0400 "$output"
`,
      { mode: 0o700 }
    );
    const command = `exec {fd}<>"$1"; flock "$fd"; SOURCE_RECOVERY_TEST_FORBIDDEN_FD="$fd" Q12_EXTERNAL_QUIESCE_LEASE_FD="$fd" exec bash "$2" --external-quiesce-manifest "$3" "\${@:4}"`;
    const externalEnvironment = {
      ...fixture.env,
      SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: lease,
      SOURCE_RECOVERY_EMIT_BIN: leaseEmitBin,
    };
    const wrongPath = join(fixture.directory, 'wrong-run-external-quiesce.json');
    writeFileSync(wrongPath, `${JSON.stringify(externalPayload)}\n`, { mode: 0o400 });
    const wrongPathResult = spawnSync(
      'bash',
      ['-c', command, 'q12-external', lease, WRAPPER, wrongPath, ...fixture.args],
      { env: externalEnvironment, encoding: 'utf8' }
    );
    expect(wrongPathResult.status).not.toBe(0);
    expect(wrongPathResult.stderr).toMatch(/fixed active Q12 run path/iu);
    const crosswired = spawnSync(
      'bash',
      ['-c', command, 'q12-external', lease, WRAPPER, external, ...fixture.args],
      { env: externalEnvironment, encoding: 'utf8' }
    );
    expect(crosswired.status).not.toBe(0);
    expect(crosswired.stderr).toMatch(/quiesce manifest.*invalid|cross-wired/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);

    chmodSync(external, 0o600);
    writeFileSync(external, `${JSON.stringify(externalPayload)}\n`);
    chmodSync(external, 0o400);
    const result = spawnSync(
      'bash',
      ['-c', command, 'q12-external', lease, WRAPPER, external, ...fixture.args],
      { env: externalEnvironment, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
    expect(fixture.records()).toEqual(before);
  });

  it('rejects unlocked, arbitrary, and wrong-file external lease descriptors', () => {
    const fixture = composeWriterFixture();
    const stopped = fixture.records();
    for (const record of stopped) {
      record.State.Running = false;
      record.State.Status = 'exited';
      record.HostConfig.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
    }
    writeFileSync(fixture.recordsPath, `${JSON.stringify(stopped)}\n`, { mode: 0o600 });
    const external = fixture.quiesceManifest;
    writeFileSync(
      external,
      `${JSON.stringify({
        schema_version: 'megacampus.q12.writer-quiesce/v1',
        run_id: Q12_RUN_ID,
        status: 'quiesced',
        barrier: {
          state: 'recovery_ready_guarded',
          zero_guard_residue: false,
          expected_catalog_sha256: 'b'.repeat(64),
          probe_receipt_sha256: createHash('sha256')
            .update(readFileSync(fixture.probeReceipt))
            .digest('hex'),
        },
        writers: stopped.map((record, index) => ({
          class:
            index === 0
              ? 'production-api'
              : index === 1
                ? 'production-web'
                : index < 5
                  ? 'production-worker'
                  : index === 5
                    ? 'development-api'
                    : index === 6
                      ? 'development-web'
                      : 'development-worker',
          id: record.Id,
          name: record.Name,
          project: record.Config.Labels['com.docker.compose.project'],
          service: record.Config.Labels['com.docker.compose.service'],
          config_files: record.Config.Labels['com.docker.compose.project.config_files'],
          working_dir: record.Config.Labels['com.docker.compose.project.working_dir'],
          image_id: record.Image,
          image_ref: record.Config.Image,
          prior_running: true,
          prior_status: 'running',
          healthcheck_present: true,
          prior_health_status: 'healthy',
          prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
          temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
        })),
      })}\n`,
      { mode: 0o400 }
    );
    const lease = join(fixture.directory, 'q12-cutover-negative.lock');
    const wrongLease = join(fixture.directory, 'wrong-cutover.lock');
    writeFileSync(lease, '', { mode: 0o600 });
    writeFileSync(wrongLease, '', { mode: 0o600 });
    const environment = {
      ...fixture.env,
      SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: lease,
    };
    const invoke = (setup: string, path: string) =>
      spawnSync(
        'bash',
        [
          '-c',
          `${setup}; Q12_EXTERNAL_QUIESCE_LEASE_FD="$fd" exec bash "$2" --external-quiesce-manifest "$3" "\${@:4}"`,
          'q12-external-negative',
          path,
          WRAPPER,
          external,
          ...fixture.args,
        ],
        { env: environment, encoding: 'utf8' }
      );

    const unlocked = invoke('exec {fd}<>"$1"', lease);
    expect(unlocked.status).not.toBe(0);
    expect(unlocked.stderr).toMatch(/lease.*not held/iu);

    const wrongFile = invoke('exec {fd}<>"$1"; flock "$fd"', wrongLease);
    expect(wrongFile.status).not.toBe(0);
    expect(wrongFile.stderr).toMatch(/lease.*exact.*lock|identity/iu);

    const arbitrary = invoke('exec {fd}</dev/null', lease);
    expect(arbitrary.status).not.toBe(0);
    expect(arbitrary.stderr).toMatch(/lease.*exact.*lock|identity/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('uses the fixed production locks and exact ten-writer inventory', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    // D2 (2026-07-26): the host lock moved off tmpfs /run to the controller-owned Q12
    // backups root so uid 1000 and root can share one mutually exclusive lock path.
    expect(wrapper).toContain('/opt/megacampus/backups/q12/source-recovery.lock');
    expect(wrapper).not.toContain('/run/megacampus-qdrant-source-recovery');
    expect(wrapper).toContain('/opt/megacampus/backups/q12/cutover.lock');
    expect(wrapper).toContain("readonly NODE_UID='1001'");
    expect(wrapper).toContain("readonly NODE_GID='1001'");
    for (const service of SERVICES) expect(wrapper).toContain(service);
    expect(wrapper).toContain('flock -n');
    expect(wrapper).toContain('DOCKER_HOST');
    expect(wrapper).toContain('unix://');
  });

  it('rejects a remote current Docker context even when default is local', () => {
    const fixture = wrapperFixture();
    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: {
        ...fixture.env,
        DOCKER_CURRENT_CONTEXT: 'remote-production',
        DOCKER_DEFAULT_ENDPOINT: 'unix:///var/run/docker.sock',
        DOCKER_CURRENT_ENDPOINT: 'tcp://production.example.invalid:2376',
      },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('active Docker context must use a local Unix socket');
    expect(readFileSync(fixture.dockerLog, 'utf8')).toContain('context show');
  });

  it('pins operator Compose to the exact verified active local context', () => {
    const fixture = wrapperFixture();
    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: {
        ...fixture.env,
        DOCKER_CURRENT_CONTEXT: 'desktop-linux',
        DOCKER_CURRENT_ENDPOINT: 'unix:///home/test/.docker/desktop.sock',
      },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toContain('context inspect desktop-linux');
    expect(readFileSync(fixture.composeLog, 'utf8')).toContain('context=desktop-linux');
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

  it('resumes reviewed protected state without planner-only files or silent replanning', () => {
    const fixture = wrapperFixture();
    prepareReviewedState(fixture, true);

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
    prepareReviewedState(fixture);

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

  it('runs only guarded networkless rollback and restores exact writer state', () => {
    const fixture = wrapperFixture(['megacampus-api-blue', 'megacampus-worker']);
    const before = states(fixture);
    prepareReviewedState(fixture, true);
    const result = spawnSync(
      'bash',
      [WRAPPER, '--operation', 'rollback', '--stop-writers', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(states(fixture)).toEqual(before);
    const composeLines = readFileSync(fixture.composeLog, 'utf8').trim().split('\n');
    expect(composeLines).toHaveLength(1);
    expect(composeLines[0]).toContain(
      'qdrant-source-recovery-executor source-recovery rollback --confirm-run-id 123e4567-e89b-42d3-a456-426614174000'
    );
    expect(composeLines[0]).not.toMatch(
      /source-recovery (?:plan|execute|verify|apply-dispositions|verify-dispositions)/u
    );
  });

  it('propagates rollback phase rejection and still restores exact writer state', () => {
    const fixture = wrapperFixture(['megacampus-api-green']);
    const before = states(fixture);
    prepareReviewedState(fixture, true);
    const result = spawnSync(
      'bash',
      [WRAPPER, '--operation', 'rollback', '--stop-writers', ...fixture.args],
      {
        env: { ...fixture.env, SOURCE_RECOVERY_TEST_FAIL_MODE: 'rollback' },
        encoding: 'utf8',
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('rollback_phase_rejected');
    expect(states(fixture)).toEqual(before);
    const composeLog = readFileSync(fixture.composeLog, 'utf8');
    expect(composeLog).toContain('source-recovery rollback');
    expect(composeLog).not.toMatch(/source-recovery (?:verify|apply-dispositions)/u);
  });

  it('restores exact writer state when guarded rollback receives SIGTERM', async () => {
    const fixture = wrapperFixture(['megacampus-worker-stage7']);
    const before = states(fixture);
    prepareReviewedState(fixture, true);
    const child = spawn(
      'bash',
      [WRAPPER, '--operation', 'rollback', '--stop-writers', ...fixture.args],
      {
        env: { ...fixture.env, SOURCE_RECOVERY_TEST_SLEEP: '5' },
        detached: true,
        stdio: 'ignore',
      }
    );
    const deadline = Date.now() + 2_000;
    while (states(fixture)['megacampus-worker-stage7'] !== 'inactive' && Date.now() < deadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    expect(states(fixture)['megacampus-worker-stage7']).toBe('inactive');
    process.kill(-child.pid!, 'SIGTERM');
    await new Promise<void>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', () => resolveExit());
    });
    expect(states(fixture)).toEqual(before);
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

// OQ1 mode-aware quiesce precondition amendment (P2-1/P2-1b): the run-quiesce
// barrier-receipt gate and the resume-side quiesce-manifest barrier binding
// both branch on a caller-declared run-root marker (quiesce-window-mode.json).
// Marker absent is the recovery gate, byte-for-byte unchanged (the frozen
// positive above stays green, unmodified). Marker present + mode=cutover
// requires the exact join-era maintenance_guarded/install barrier shape.
describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 mode-aware quiesce precondition (OQ1 cutover window)',
  () => {
    it('accepts a cutover-mode maintenance_guarded/install barrier receipt for writers.quiesce when the window marker is present', () => {
      const fixture = writerQuiesceFixture();
      chmodSync(fixture.barrierReceipt, 0o600);
      writeFileSync(
        fixture.barrierReceipt,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.database-barrier-receipt/v1',
          run_id: Q12_RUN_ID,
          state: 'maintenance_guarded',
          zero_guard_residue: false,
          expected_catalog_sha256: 'b'.repeat(64),
          last_command: 'install',
          rollback_probes_verified: false,
          probe_receipt_sha256: null,
        })}\n`
      );
      chmodSync(fixture.barrierReceipt, 0o400);
      const marker = join(fixture.q12RunRoot, 'quiesce-window-mode.json');
      writeFileSync(
        marker,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.quiesce-window-mode/v1',
          run_id: Q12_RUN_ID,
          mode: 'cutover',
        })}\n`,
        { mode: 0o400 }
      );

      const result = fixture.quiesce();

      expect(result.status, result.stderr).toBe(0);
      const manifest = JSON.parse(readFileSync(fixture.quiesceManifest, 'utf8')) as Record<
        string,
        any
      >;
      expect(manifest.barrier).toEqual({
        state: 'maintenance_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: 'b'.repeat(64),
        probe_receipt_sha256: null,
      });
    });

    it('falls back to the recovery gate (and rejects it) for a cutover-shaped receipt when the window marker is missing', () => {
      const fixture = writerQuiesceFixture();
      chmodSync(fixture.barrierReceipt, 0o600);
      writeFileSync(
        fixture.barrierReceipt,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.database-barrier-receipt/v1',
          run_id: Q12_RUN_ID,
          state: 'maintenance_guarded',
          zero_guard_residue: false,
          expected_catalog_sha256: 'b'.repeat(64),
          last_command: 'install',
          rollback_probes_verified: false,
          probe_receipt_sha256: null,
        })}\n`
      );
      chmodSync(fixture.barrierReceipt, 0o400);

      const result = fixture.quiesce();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/quiesce-ready/iu);
    });

    it('rejects a stray cutover window marker over a default recovery-shaped barrier receipt', () => {
      const fixture = writerQuiesceFixture();
      const marker = join(fixture.q12RunRoot, 'quiesce-window-mode.json');
      writeFileSync(
        marker,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.quiesce-window-mode/v1',
          run_id: Q12_RUN_ID,
          mode: 'cutover',
        })}\n`,
        { mode: 0o400 }
      );

      const result = fixture.quiesce();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/cutover-quiesce-ready/iu);
    });

    it('rejects a cutover window marker whose run_id does not match the live run', () => {
      const fixture = writerQuiesceFixture();
      chmodSync(fixture.barrierReceipt, 0o600);
      writeFileSync(
        fixture.barrierReceipt,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.database-barrier-receipt/v1',
          run_id: Q12_RUN_ID,
          state: 'maintenance_guarded',
          zero_guard_residue: false,
          expected_catalog_sha256: 'b'.repeat(64),
          last_command: 'install',
          rollback_probes_verified: false,
          probe_receipt_sha256: null,
        })}\n`
      );
      chmodSync(fixture.barrierReceipt, 0o400);
      const marker = join(fixture.q12RunRoot, 'quiesce-window-mode.json');
      writeFileSync(
        marker,
        `${JSON.stringify({
          schema_version: 'megacampus.q12.quiesce-window-mode/v1',
          run_id: '323e4567-e89b-42d3-a456-426614174000',
          mode: 'cutover',
        })}\n`,
        { mode: 0o400 }
      );

      const result = fixture.quiesce();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/window mode marker/iu);
    });

    it('resumes forward over a real Root joined prefix carrying a cutover-shaped quiesce-manifest barrier binding', async () => {
      const fixture = await joinedWriterResumeFixture(
        'forward',
        undefined,
        {},
        false,
        0,
        undefined,
        {
          manifestBarrier: 'cutover',
          marker: true,
        }
      );

      const result = fixture.resume();

      expect(result.status, result.stderr).toBe(0);
      const receipt = JSON.parse(readFileSync(fixture.resumeState, 'utf8')) as Record<string, any>;
      expect(receipt).toMatchObject({
        schema_version: 'megacampus.q12.writer-resume-state/v1',
        run_id: fixture.runId,
        state: 'writers_resumed',
        mode: 'forward',
      });
    });

    it('rejects a cutover-shaped quiesce-manifest barrier binding at forward resume when the window marker is missing', async () => {
      const fixture = await joinedWriterResumeFixture(
        'forward',
        undefined,
        {},
        false,
        0,
        undefined,
        {
          manifestBarrier: 'cutover',
          marker: false,
        }
      );

      const result = fixture.resume();

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/writer quiesce barrier binding is invalid/iu);
      expect(existsSync(fixture.resumeState)).toBe(false);
    });
  }
);

// Amendment 2026-07-25: the staged authority is the file_catalog token, which must name this run's
// recovery run id (the wrapper's --recovery-run-id) — no org:course:run ledger triple exists.
const COVERAGE_AUTHORITY = 'catalog:123e4567-e89b-42d3-a456-426614174000';
const SYNTHETIC_SUPABASE_URL = 'https://synthetic-project.supabase.invalid';
const SYNTHETIC_SERVICE_KEY = 'synthetic-service-role-key-value';

interface AcceptanceEmitFixture extends ComposeWriterFixture {
  lease: string;
  external: string;
  emitBin: string;
  emitLog: string;
  envFile: string;
  coverageRunFile: string;
  acceptanceOutput: string;
  manifestPath: string;
  journalPath: string;
  run(extraEnv?: NodeJS.ProcessEnv): ReturnType<typeof spawnSync>;
}

// D4 (2026-07-26): source.forward carries no Q12_EXTERNAL_QUIESCE_LEASE_FD in the frozen
// manifest env, so the lease seam must be exercised both ways — an explicitly declared
// arbitrary descriptor (the historical shape) and the canonical descriptor 9 with no
// variable at all, which is what the real launcher hands the wrapper.
interface AcceptanceEmitLeaseOptions {
  leaseDescriptor?: number;
  declareLeaseEnv?: boolean;
  // Opens the descriptor on a held decoy lock instead of the canonical cutover lock, so the
  // "held but wrong file" negative can be driven against the DEFAULTED descriptor too.
  leaseOpensDecoy?: boolean;
}

function acceptanceEmitFixture(
  leaseOptions: AcceptanceEmitLeaseOptions = {}
): AcceptanceEmitFixture {
  const fixture = composeWriterFixture();
  const stopped = fixture.records();
  for (const record of stopped) {
    record.State.Running = false;
    record.State.Status = 'exited';
    record.HostConfig.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
  }
  writeFileSync(fixture.recordsPath, `${JSON.stringify(stopped)}\n`, { mode: 0o600 });
  const external = fixture.quiesceManifest;
  writeFileSync(
    external,
    `${JSON.stringify({
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: Q12_RUN_ID,
      status: 'quiesced',
      barrier: {
        state: 'recovery_ready_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: 'b'.repeat(64),
        probe_receipt_sha256: createHash('sha256')
          .update(readFileSync(fixture.probeReceipt))
          .digest('hex'),
      },
      writers: stopped.map((record, index) => ({
        class:
          index === 0
            ? 'production-api'
            : index === 1
              ? 'production-web'
              : index < 5
                ? 'production-worker'
                : index === 5
                  ? 'development-api'
                  : index === 6
                    ? 'development-web'
                    : 'development-worker',
        id: record.Id,
        name: record.Name,
        project: record.Config.Labels['com.docker.compose.project'],
        service: record.Config.Labels['com.docker.compose.service'],
        config_files: record.Config.Labels['com.docker.compose.project.config_files'],
        working_dir: record.Config.Labels['com.docker.compose.project.working_dir'],
        image_id: record.Image,
        image_ref: record.Config.Image,
        prior_running: true,
        prior_status: 'running',
        healthcheck_present: true,
        prior_health_status: 'healthy',
        prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
        temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
      })),
    })}\n`,
    { mode: 0o400 }
  );
  const lease = join(fixture.directory, 'q12-cutover-emit.lock');
  writeFileSync(lease, '', { mode: 0o600 });
  const envFile = fixture.args[fixture.args.indexOf('--env-file') + 1];
  writeFileSync(
    envFile,
    [
      'QDRANT_OPERATOR_IMAGE_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      `SUPABASE_URL=${SYNTHETIC_SUPABASE_URL}`,
      `SUPABASE_SERVICE_KEY=${SYNTHETIC_SERVICE_KEY}`,
      '',
    ].join('\n')
  );
  const coverageRunFile = join(fixture.q12RunRoot, 'accepted-coverage-run');
  writeFileSync(coverageRunFile, `${COVERAGE_AUTHORITY}\n`, { mode: 0o400 });
  const emitLog = join(fixture.directory, 'emit.log');
  const emitBin = join(fixture.directory, 'bin/emit-acceptance');
  writeFileSync(
    emitBin,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${SOURCE_RECOVERY_TEST_FORBIDDEN_FD:-}" ]]; then
  [[ -z "\${Q12_EXTERNAL_QUIESCE_LEASE_FD:-}" ]]
  [[ ! -e "/proc/self/fd/$SOURCE_RECOVERY_TEST_FORBIDDEN_FD" ]]
fi
printf '%s\n' "$*" >> "$EMIT_LOG"
printf 'env SUPABASE_URL=%s\n' "\${SUPABASE_URL:-unset}" >> "$EMIT_LOG"
printf 'env SUPABASE_SERVICE_KEY=%s\n' "\${SUPABASE_SERVICE_KEY:-unset}" >> "$EMIT_LOG"
if [[ -n "\${SOURCE_RECOVERY_TEST_EMIT_FAIL:-}" ]]; then
  if [[ "\${SOURCE_RECOVERY_TEST_EMIT_FAIL}" == with-output ]]; then
    output=''
    args=("$@")
    for ((i = 0; i < \${#args[@]}; i++)); do
      [[ "\${args[i]}" != --output ]] || output="\${args[i + 1]}"
    done
    printf '{"schema":"partial"}\n' > "$output"
    chmod 0400 "$output"
  fi
  exit 82
fi
output=''
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  [[ "\${args[i]}" != --output ]] || output="\${args[i + 1]}"
done
printf '{"schema":"megacampus.q12.source-forward-acceptance/v1"}\n' > "$output"
if [[ -n "\${SOURCE_RECOVERY_TEST_EMIT_WRONG_MODE:-}" ]]; then
  chmod 0600 "$output"
else
  chmod 0400 "$output"
fi
`,
    { mode: 0o700 }
  );
  const manifestPath = fixture.args[fixture.args.indexOf('--manifest') + 1];
  const journalPath = join(
    fixture.args[fixture.args.indexOf('--progress-directory') + 1],
    'journal.json'
  );
  const leaseSetup =
    leaseOptions.leaseDescriptor === undefined
      ? 'exec {fd}<>"$1"; flock "$fd"'
      : `exec ${leaseOptions.leaseDescriptor}<>"$1"; flock ${leaseOptions.leaseDescriptor}; fd=${leaseOptions.leaseDescriptor}`;
  const leaseVariable =
    leaseOptions.declareLeaseEnv === false ? '' : 'Q12_EXTERNAL_QUIESCE_LEASE_FD="$fd" ';
  const command = `${leaseSetup}; SOURCE_RECOVERY_TEST_FORBIDDEN_FD="$fd" ${leaseVariable}exec bash "$2" --external-quiesce-manifest "$3" "\${@:4}"`;
  const decoyLease = join(fixture.directory, 'q12-cutover-decoy.lock');
  writeFileSync(decoyLease, '', { mode: 0o600 });
  const openedLease = leaseOptions.leaseOpensDecoy === true ? decoyLease : lease;
  const run = (extraEnv: NodeJS.ProcessEnv = {}): ReturnType<typeof spawnSync> =>
    spawnSync(
      'bash',
      ['-c', command, 'q12-emit', openedLease, WRAPPER, external, ...fixture.args],
      {
        env: {
          ...fixture.env,
          SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: lease,
          SOURCE_RECOVERY_EMIT_BIN: emitBin,
          EMIT_LOG: emitLog,
          ...extraEnv,
        },
        encoding: 'utf8',
      }
    );
  return {
    ...fixture,
    lease,
    external,
    emitBin,
    emitLog,
    envFile,
    coverageRunFile,
    acceptanceOutput: join(fixture.q12RunRoot, 'source-forward-acceptance.json'),
    manifestPath,
    journalPath,
    run,
  };
}

describe.runIf(RUN_REAL_CONTROLLER)('Q12 source.forward acceptance emit wiring (W7a)', () => {
  it('emits the acceptance authority after the verified Q12 forward with exact argv and scoped env', () => {
    const fixture = acceptanceEmitFixture();
    const result = fixture.run();
    expect(result.status, result.stderr).toBe(0);
    const emitLog = readFileSync(fixture.emitLog, 'utf8');
    const invocations = emitLog.split('\n').filter(line => line.startsWith('--manifest'));
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toBe(
      [
        '--manifest',
        fixture.manifestPath,
        '--journal',
        fixture.journalPath,
        '--recovery-run-id',
        '123e4567-e89b-42d3-a456-426614174000',
        '--accepted-coverage-run',
        COVERAGE_AUTHORITY,
        '--output',
        fixture.acceptanceOutput,
      ].join(' ')
    );
    expect(emitLog).toContain(`env SUPABASE_URL=${SYNTHETIC_SUPABASE_URL}`);
    expect(emitLog).toContain(`env SUPABASE_SERVICE_KEY=${SYNTHETIC_SERVICE_KEY}`);
    const stat = statSync(fixture.acceptanceOutput);
    expect(stat.mode & 0o777).toBe(0o400);
    const composeLog = readFileSync(fixture.composeLog, 'utf8');
    expect(composeLog).toContain('source-recovery verify-dispositions');
    // The service key must never leak outside the emit child's scoped environment.
    expect(result.stdout).not.toContain(SYNTHETIC_SERVICE_KEY);
    expect(result.stderr).not.toContain(SYNTHETIC_SERVICE_KEY);
    expect(composeLog).not.toContain(SYNTHETIC_SERVICE_KEY);
  });

  it('fails the forward run and removes the leftover when the published authority mode is wrong', () => {
    const fixture = acceptanceEmitFixture();
    const result = fixture.run({ SOURCE_RECOVERY_TEST_EMIT_WRONG_MODE: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not published owner-only 0400/iu);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed without invoking emit when the coverage-run authority is missing', () => {
    const fixture = acceptanceEmitFixture();
    chmodSync(fixture.coverageRunFile, 0o600);
    rmSync(fixture.coverageRunFile);
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/accepted coverage-run authority/iu);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed without invoking emit on a malformed coverage-run triple', () => {
    const fixture = acceptanceEmitFixture();
    chmodSync(fixture.coverageRunFile, 0o600);
    writeFileSync(fixture.coverageRunFile, 'not-a-catalog-token\n');
    chmodSync(fixture.coverageRunFile, 0o400);
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must be catalog:<recovery-run-id> with a lower-case UUIDv4/iu);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed on the retired organization:course:run coverage triple', () => {
    const fixture = acceptanceEmitFixture();
    chmodSync(fixture.coverageRunFile, 0o600);
    writeFileSync(
      fixture.coverageRunFile,
      '123e4567-e89b-42d3-a456-426614174101:123e4567-e89b-42d3-a456-426614174102:123e4567-e89b-42d3-a456-426614174103\n'
    );
    chmodSync(fixture.coverageRunFile, 0o400);
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    // the format guard must be the one that fires, not the single-line or equality guard
    expect(result.stderr).toMatch(/must be catalog:<recovery-run-id> with a lower-case UUIDv4/iu);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed when the staged authority names another recovery run', () => {
    const fixture = acceptanceEmitFixture();
    chmodSync(fixture.coverageRunFile, 0o600);
    writeFileSync(fixture.coverageRunFile, 'catalog:123e4567-e89b-42d3-a456-426614174999\n');
    chmodSync(fixture.coverageRunFile, 0o400);
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/recovery run/iu);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed on a multi-line coverage-run authority even without a trailing newline', () => {
    const fixture = acceptanceEmitFixture();
    chmodSync(fixture.coverageRunFile, 0o600);
    writeFileSync(fixture.coverageRunFile, `${COVERAGE_AUTHORITY}\ntrailing-garbage`);
    chmodSync(fixture.coverageRunFile, 0o400);
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/single newline-terminated/iu);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails the forward run and leaves no acceptance file when emit exits non-zero', () => {
    const fixture = acceptanceEmitFixture();
    const result = fixture.run({ SOURCE_RECOVERY_TEST_EMIT_FAIL: 'with-output' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/acceptance emit failed/iu);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('fails closed without invoking emit when the production env file lacks the Supabase values', () => {
    const fixture = acceptanceEmitFixture();
    writeFileSync(
      fixture.envFile,
      [
        'QDRANT_OPERATOR_IMAGE_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        `SUPABASE_URL=${SYNTHETIC_SUPABASE_URL}`,
        '',
      ].join('\n')
    );
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/SUPABASE_SERVICE_KEY/u);
    expect(existsSync(fixture.emitLog)).toBe(false);
    expect(existsSync(fixture.acceptanceOutput)).toBe(false);
  });

  it('never invokes emit for a non-Q12 forward run', () => {
    const fixture = wrapperFixture();
    const emitLog = join(fixture.directory, 'emit.log');
    const emitBin = join(fixture.directory, 'bin/emit-acceptance');
    writeFileSync(emitBin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$EMIT_LOG"\n`, {
      mode: 0o700,
    });
    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_EMIT_BIN: emitBin, EMIT_LOG: emitLog },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(emitLog)).toBe(false);
  });

  it('keeps the emit override test-only and the production emit on the package tsx shim', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    expect(wrapper).toContain('SOURCE_RECOVERY_EMIT_BIN');
    expect(wrapper).toMatch(
      /\[\[ -z \$\{SOURCE_RECOVERY_WRITER_BACKEND:-\}[^\n]*\$\{SOURCE_RECOVERY_EMIT_BIN:-\}/u
    );
    expect(wrapper).toContain('packages/course-gen-platform/node_modules/.bin/tsx');
    expect(wrapper).toContain(
      'packages/course-gen-platform/tools/qdrant/emit-source-forward-acceptance.ts'
    );
    const verifyDispositions = wrapper.lastIndexOf('source-recovery verify-dispositions');
    const emitBlock = wrapper.indexOf('source-forward-acceptance.json');
    expect(verifyDispositions).toBeGreaterThan(0);
    expect(emitBlock).toBeGreaterThan(verifyDispositions);
  });

  it('pins the production emit tsconfig chain so module resolution is cwd-independent', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    expect(wrapper).toContain(
      'emit_tsconfig="$project_directory/packages/course-gen-platform/tsconfig.json"'
    );
    expect(wrapper).toContain('emit_root_tsconfig="$project_directory/tsconfig.json"');
    expect(wrapper).toMatch(
      /\[\[ -f \$emit_tsconfig && ! -L \$emit_tsconfig && -f \$emit_root_tsconfig && ! -L \$emit_root_tsconfig \]\] \|\|\n\s*fail 'source\.forward acceptance emit requires the package tsconfig chain'/u
    );
    expect(wrapper).toContain(
      'emit_command=("$emit_tsx" --tsconfig "$emit_tsconfig" "$emit_entrypoint")'
    );
  });
});

// Q12 window execution identity (2026-07-26 design D1/D2/D4/D6). The wrapper used to
// refuse every non-root production run, which made `writers.quiesce` structurally
// impossible: its child's closed-inbound probe requires a scratch directory owned by the
// controller identity (q12-writer-resume.py:632-640). `source.forward` in turn genuinely
// needs root, because it reads the 1001-owned operator state at modes it pins itself.
// So the blanket gate becomes a per-operation identity contract, the single host lock
// moves to the controller-owned Q12 backups root, the external-quiesce lease descriptor
// defaults to the canonical 9 (keeping the frozen manifest untouched), and a Q12
// external-quiesce forward publishes the C9 writer recovery state its resume child
// hard-requires (q12-writer-resume.py:1389-1392).
describe.runIf(RUN_REAL_CONTROLLER)('Q12 window execution identity contract', () => {
  const CURRENT_UID = String(process.getuid?.() ?? 1000);
  const FOREIGN_UID = String((process.getuid?.() ?? 1000) + 7);

  it('accepts the controller identity for the writer quiesce operation', () => {
    const fixture = writerQuiesceFixture();

    const result = fixture.quiesce();

    expect(result.status, result.stderr).toBe(0);
  });

  it('refuses the writer quiesce operation for a non-controller identity by its own name', () => {
    const fixture = writerQuiesceFixture();

    const result = fixture.quiesce({ SOURCE_RECOVERY_CONTROLLER_UID: FOREIGN_UID });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must run as the controller identity/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('refuses the writer resume operation for a non-controller identity by its own name', () => {
    const fixture = wrapperFixture();

    const result = spawnSync(
      'bash',
      [
        WRAPPER,
        '--operation',
        'resume-writers-only',
        '--resume-mode',
        'forward',
        '--run-id',
        Q12_RUN_ID,
      ],
      { env: { ...fixture.env, SOURCE_RECOVERY_CONTROLLER_UID: FOREIGN_UID }, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must run as the controller identity/iu);
  });

  it('accepts the privileged identity for a forward run', () => {
    const fixture = wrapperFixture();

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_ROOT_UID: CURRENT_UID },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it('refuses a forward run for a non-privileged identity by its own name before any side effect', () => {
    const fixture = wrapperFixture();

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_ROOT_UID: FOREIGN_UID },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must run as root/iu);
    expect(existsSync(fixture.composeLog)).toBe(false);
  });

  it('accepts the privileged identity for a rollback run', () => {
    const fixture = wrapperFixture(['megacampus-api-blue', 'megacampus-worker']);
    prepareReviewedState(fixture, true);

    const result = spawnSync(
      'bash',
      [WRAPPER, '--operation', 'rollback', '--stop-writers', ...fixture.args],
      { env: { ...fixture.env, SOURCE_RECOVERY_ROOT_UID: CURRENT_UID }, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
  });

  it('refuses a rollback run for a non-privileged identity by its own name', () => {
    const fixture = wrapperFixture(['megacampus-api-blue', 'megacampus-worker']);
    prepareReviewedState(fixture, true);

    const result = spawnSync(
      'bash',
      [WRAPPER, '--operation', 'rollback', '--stop-writers', ...fixture.args],
      { env: { ...fixture.env, SOURCE_RECOVERY_ROOT_UID: FOREIGN_UID }, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must run as root/iu);
    expect(existsSync(fixture.composeLog)).toBe(false);
    expect(states(fixture)['megacampus-api-blue']).toBe('active');
  });

  it('keeps the privileged identity override behind the local-test seam', () => {
    const fixture = wrapperFixture();

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { PATH: process.env.PATH, SOURCE_RECOVERY_ROOT_UID: CURRENT_UID },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('require SOURCE_RECOVERY_LOCAL_TEST=1');
  });

  it('replaces the blanket production root gate with the per-operation identity contract', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    expect(wrapper).not.toContain("fail 'production source recovery must run as root'");
    expect(wrapper).toContain("readonly ROOT_UID='0'");
    expect(wrapper).toMatch(
      /quiesce-writers-only\|resume-writers-only\)\n\s*\[\[ \$EUID -eq \$controller_uid \]\]/u
    );
    expect(wrapper).toMatch(/forward\|rollback\)\n\s*\[\[ \$EUID -eq \$root_uid \]\]/u);
    // The contract must be asserted before the first host mutation the run performs.
    const contract = wrapper.indexOf('must run as the controller identity');
    const firstLockSite = wrapper.indexOf('ensure_host_lock\n');
    expect(contract).toBeGreaterThan(0);
    expect(firstLockSite).toBeGreaterThan(contract);
  });

  it('creates the single host lock as the controller-owned 0600 file at every operation site', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    expect(wrapper).not.toContain('install -d -o root -g root');
    expect(wrapper).toContain(
      'install -d -o "$controller_uid" -g "$controller_gid" -m 0700 -- "$directory"'
    );
    // One helper, one lock path, three operation sites (resume-only, quiesce-only, forward).
    expect(wrapper.match(/^\s*ensure_host_lock$/gmu)).toHaveLength(3);
    expect(wrapper.match(/exec \{[a-z_]*lock_fd\}<>"\$LOCK_FILE"/gu)).toHaveLength(3);
  });

  it('publishes the host lock controller-owned 0600 at the relocated path', () => {
    const fixture = wrapperFixture();
    const lockFile = String(fixture.env.SOURCE_RECOVERY_LOCK_FILE);

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const lock = statSync(lockFile);
    expect(lock.mode & 0o777).toBe(0o600);
    expect(String(lock.uid)).toBe(CURRENT_UID);
  });

  it('normalizes a loosely moded pre-existing host lock to the controller-owned 0600 identity', () => {
    const fixture = wrapperFixture();
    const lockFile = String(fixture.env.SOURCE_RECOVERY_LOCK_FILE);
    mkdirSync(resolve(lockFile, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(lockFile, '', { mode: 0o644 });
    chmodSync(lockFile, 0o644);

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(statSync(lockFile).mode & 0o777).toBe(0o600);
  });

  it('refuses a symlinked host lock by name', () => {
    const fixture = wrapperFixture();
    const lockFile = String(fixture.env.SOURCE_RECOVERY_LOCK_FILE);
    const planted = join(fixture.directory, 'planted-lock');
    writeFileSync(planted, '', { mode: 0o600 });
    mkdirSync(resolve(lockFile, '..'), { recursive: true, mode: 0o700 });
    symlinkSync(planted, lockFile);

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/host lock file must not be a symlink/iu);
    expect(existsSync(fixture.composeLog)).toBe(false);
  });

  it('accepts the canonical descriptor 9 lease without the frozen manifest declaring it', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });

    const result = fixture.run();

    expect(result.status, result.stderr).toBe(0);
    // SOURCE_RECOVERY_TEST_FORBIDDEN_FD=9 makes both children assert the descriptor was
    // closed for them, which only happens when the default reached the close path.
    expect(readFileSync(fixture.emitLog, 'utf8')).toContain('--recovery-run-id');
    expect(readFileSync(fixture.composeLog, 'utf8')).toContain(
      'source-recovery verify-dispositions'
    );
  });

  it('honours an explicitly declared lease descriptor that is not the canonical 9', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 7, declareLeaseEnv: true });

    const result = fixture.run();

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.composeLog, 'utf8')).toContain(
      'source-recovery verify-dispositions'
    );
  });

  it('refuses a set-but-empty lease variable even when the canonical descriptor is held', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });

    const result = fixture.run({ Q12_EXTERNAL_QUIESCE_LEASE_FD: '' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/external quiesce requires an inherited lease FD/iu);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('refuses the defaulted lease descriptor when the canonical lock is not inherited', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 7, declareLeaseEnv: false });

    const result = fixture.run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/external quiesce requires an inherited lease FD/iu);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('publishes the C9 writer recovery state after a verified Q12 external-quiesce forward', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });

    const result = fixture.run();

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fixture.recoveryState)).toBe(true);
    const stat = statSync(fixture.recoveryState);
    expect(stat.mode & 0o777).toBe(0o400);
    expect(String(stat.uid)).toBe(CURRENT_UID);
    expect(String(stat.gid)).toBe(String(process.getgid?.() ?? 1000));
    const state = JSON.parse(readFileSync(fixture.recoveryState, 'utf8')) as Record<string, any>;
    expect(Object.keys(state).sort()).toEqual(
      [
        'expected_catalog_sha256',
        'run_id',
        'schema_version',
        'source_journal_sha256',
        'source_manifest_sha256',
        'state',
        'writer_quiesce_manifest_sha256',
      ].sort()
    );
    expect(state.schema_version).toBe('megacampus.q12.writer-recovery-state/v1');
    expect(state.run_id).toBe(Q12_RUN_ID);
    expect(state.state).toBe('recovery_complete_writers_quiesced');
    expect(state.expected_catalog_sha256).toBe('b'.repeat(64));
    expect(state.writer_quiesce_manifest_sha256).toBe(fileSha256(fixture.external));
    expect(state.source_manifest_sha256).toBe(fileSha256(fixture.manifestPath));
    expect(state.source_journal_sha256).toBe(fileSha256(fixture.journalPath));
  });

  it('does not publish the C9 writer recovery state when the forward fails', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });

    const result = fixture.run({ SOURCE_RECOVERY_TEST_EMIT_FAIL: '1' });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('does not publish the C9 writer recovery state when a disposition phase is rejected', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });

    const result = fixture.run({ SOURCE_RECOVERY_TEST_FAIL_MODE: 'verify-dispositions' });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('fails the forward without publishing when a bound probe receipt changes after validation', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });
    const replacement = join(fixture.directory, 'swapped-probe-receipt.json');
    writeFileSync(replacement, readFileSync(fixture.probeReceipt), { mode: 0o400 });

    const result = fixture.run({
      SOURCE_RECOVERY_TEST_SWAP_AFTER_MODE: 'verify-dispositions',
      SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT: replacement,
      SOURCE_RECOVERY_TEST_SWAP_TARGET: fixture.probeReceipt,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed after validation/iu);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('fails the forward without publishing when a writer stopped being quiesced', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });
    const restarted = fixture.records();
    restarted[4].State.Running = true;
    restarted[4].State.Status = 'running';
    const replacement = join(fixture.directory, 'restarted-docker-records.json');
    writeFileSync(replacement, `${JSON.stringify(restarted)}\n`, { mode: 0o600 });

    const result = fixture.run({
      SOURCE_RECOVERY_TEST_SWAP_AFTER_MODE: 'verify-dispositions',
      SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT: replacement,
      SOURCE_RECOVERY_TEST_SWAP_TARGET: fixture.recordsPath,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/did not remain stopped with restart=no/iu);
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });

  it('publishes no writer recovery state for a non-Q12 forward run', () => {
    const fixture = wrapperFixture();

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(
      readdirSync(fixture.directory).some(entry => entry.startsWith('writer-recovery-state-'))
    ).toBe(false);
  });

  it('publishes the C9 recovery state on the external-quiesce forward branch after the verified chain', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    const verifyDispositions = wrapper.lastIndexOf('source-recovery verify-dispositions');
    const publish = wrapper.indexOf('publish_external_quiesce_recovery_state\n');
    expect(publish).toBeGreaterThan(verifyDispositions);
    expect(wrapper).toMatch(
      /publish_external_quiesce_recovery_state\(\) \{\n\s*assert_all_stopped_with_no_restart/u
    );
    expect(wrapper).toContain('write_recovery_complete_state ||');
  });
});

// Correction wave 2026-07-26 on the execution-identity increment. Three properties the
// independent review asked for, all of them consequences of `source.forward` now being a
// REAL root-executed path over controller-writable directories: every root publish must
// resolve its target exactly once (no path-based chown/chmod after a truncating redirect),
// the shared Q12 backups directory must never be re-moded by a run that merely needs a lock
// in it, and the single lock plus the defaulted lease descriptor must be pinned across both
// identities.
describe.runIf(RUN_REAL_CONTROLLER)('Q12 root-executed publish discipline', () => {
  const CURRENT_UID = String(process.getuid?.() ?? 1000);
  const CURRENT_GID = String(process.getgid?.() ?? 1000);
  const FOREIGN_UID = String((process.getuid?.() ?? 1000) + 7);

  it('opens the host lock without truncating whatever the path resolves to', () => {
    const fixture = wrapperFixture();
    const lockFile = String(fixture.env.SOURCE_RECOVERY_LOCK_FILE);
    writeFileSync(lockFile, 'operator-sentinel\n', { mode: 0o600 });
    chmodSync(lockFile, 0o600);

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    // A truncating `>` open is an arbitrary-truncate primitive for the controller uid the
    // moment root runs the forward; nothing in the protocol needs the lock's bytes.
    expect(readFileSync(lockFile, 'utf8')).toBe('operator-sentinel\n');
  });

  it('publishes root-executed artifacts through one no-follow descriptor', () => {
    const wrapper = source('deploy/qdrant/source-recovery-run.sh');
    // No path-based ownership or mode mutation of a temporary that a controller-uid racer
    // could have replaced between the redirect and the check.
    expect(wrapper).not.toContain('chown "$controller_uid:$controller_gid" "$temporary"');
    expect(wrapper).not.toContain('chmod 0400 "$temporary"');
    expect(wrapper).not.toContain(': >>"$LOCK_FILE"');
    // Both publishes and the lock go through the O_NOFOLLOW descriptor helpers.
    expect(wrapper).toContain('write_controller_temporary');
    expect(wrapper).toContain('ensure_controller_lock_file');
    expect(wrapper.match(/os\.O_NOFOLLOW/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(wrapper).toContain('os.fchown(descriptor');
    expect(wrapper).toContain('os.fchmod(descriptor');
    // The descriptor is validated BEFORE any byte, ownership or mode change, and the
    // payload is validated as JSON so a short read cannot publish a truncated artifact.
    expect(wrapper).toMatch(
      /before = os\.fstat\(descriptor\)\n\s*if not stat\.S_ISREG\(before\.st_mode\) or before\.st_nlink != 1 or before\.st_uid != os\.geteuid\(\):/u
    );
    expect(wrapper).toContain('json.loads(payload)');
    // The lock is opened read-write without O_TRUNC at all three operation sites.
    expect(wrapper.match(/exec \{[a-z_]*lock_fd\}<>"\$LOCK_FILE"/gu)).toHaveLength(3);
    expect(wrapper).not.toMatch(/exec \{[a-z_]*lock_fd\}>"\$LOCK_FILE"/u);
    expect(wrapper.match(/^\s*verify_open_host_lock "/gmu)).toHaveLength(3);
  });

  it('refuses to publish the writer recovery state through a planted symlink', () => {
    const fixture = acceptanceEmitFixture({ leaseDescriptor: 9, declareLeaseEnv: false });
    const planted = join(fixture.directory, 'planted-recovery-state.json');
    writeFileSync(planted, '{}\n', { mode: 0o600 });
    symlinkSync(planted, fixture.recoveryState);

    const result = fixture.run();

    expect(result.status).not.toBe(0);
    expect(readFileSync(planted, 'utf8')).toBe('{}\n');
  });

  it('creates an absent host lock directory as the controller-owned 0700 identity', () => {
    const fixture = wrapperFixture();
    const lockDirectory = join(fixture.directory, 'absent-lock-root');
    const lockFile = join(lockDirectory, 'source-recovery.lock');

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_LOCK_FILE: lockFile },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const directory = statSync(lockDirectory);
    expect(directory.mode & 0o777).toBe(0o700);
    expect(String(directory.uid)).toBe(CURRENT_UID);
    expect(String(directory.gid)).toBe(CURRENT_GID);
  });

  it('leaves an existing shared host lock directory mode untouched', () => {
    const fixture = wrapperFixture();
    const lockDirectory = join(fixture.directory, 'shared-lock-root');
    mkdirSync(lockDirectory, { mode: 0o755 });
    chmodSync(lockDirectory, 0o755);

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_LOCK_FILE: join(lockDirectory, 'source-recovery.lock'),
      },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    // /opt/megacampus/backups/q12 is 0755 on the host and also holds cutover.lock and every
    // run root; retightening it mid-window is an unvalidated mutation of shared state.
    expect(statSync(lockDirectory).mode & 0o777).toBe(0o755);
  });

  it('refuses an existing host lock directory that is not controller-owned by name', () => {
    const fixture = wrapperFixture();

    const result = spawnSync('bash', [WRAPPER, ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_CONTROLLER_UID: FOREIGN_UID },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/host lock directory must be owned by the exact controller/iu);
    expect(existsSync(fixture.composeLog)).toBe(false);
  });

  it('holds the one host lock against the other identity', async () => {
    const forward = wrapperFixture();
    const quiesce = writerQuiesceFixture();
    const sharedLock = join(forward.directory, 'shared-identity.lock');

    const holder = spawn('bash', [WRAPPER, ...forward.args], {
      env: {
        ...forward.env,
        SOURCE_RECOVERY_LOCK_FILE: sharedLock,
        SOURCE_RECOVERY_ROOT_UID: CURRENT_UID,
        SOURCE_RECOVERY_TEST_SLEEP: '0.6',
      },
      stdio: 'pipe',
    });
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
    const contender = quiesce.quiesce({ SOURCE_RECOVERY_LOCK_FILE: sharedLock });

    expect(contender.status).not.toBe(0);
    expect(contender.stderr).toContain('another source-recovery run holds the host lock');
    await new Promise<void>((resolveExit, reject) => {
      holder.once('error', reject);
      holder.once('exit', code => (code === 0 ? resolveExit() : reject(new Error(`exit ${code}`))));
    });
  }, 20_000);

  it('normalizes the host lock mode on the non-privileged branch', () => {
    const fixture = writerQuiesceFixture();
    const lockFile = String(fixture.env.SOURCE_RECOVERY_LOCK_FILE);
    writeFileSync(lockFile, '', { mode: 0o644 });
    chmodSync(lockFile, 0o644);

    // root_uid is deliberately foreign, so the privileged chown branch cannot run and the
    // controller-identity branch has to reach the exact 0600 state on its own.
    const result = fixture.quiesce({ SOURCE_RECOVERY_ROOT_UID: FOREIGN_UID });

    expect(result.status, result.stderr).toBe(0);
    expect(statSync(lockFile).mode & 0o777).toBe(0o600);
  });

  it('refuses the defaulted descriptor 9 when it is held on the wrong file', () => {
    const fixture = acceptanceEmitFixture({
      leaseDescriptor: 9,
      declareLeaseEnv: false,
      leaseOpensDecoy: true,
    });

    const result = fixture.run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /lease FD must reference the exact cutover lock|lease FD identity/iu
    );
    expect(existsSync(fixture.recoveryState)).toBe(false);
  });
});
