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
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const WRAPPER = resolve(REPO_ROOT, 'deploy/qdrant/source-recovery-run.sh');
const ENTRYPOINT = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
);
const Q12_RUN_ID = '223e4567-e89b-42d3-a456-426614174000';
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
  jq --arg id "$id" 'map(if .Id == $id then .State.Running=false | .State.Status="exited" else . end)' "$DOCKER_RECORDS_FILE" > "$DOCKER_RECORDS_FILE.tmp"
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

function composeWriterFixture(): ComposeWriterFixture {
  const fixture = wrapperFixture();
  const recordsPath = join(fixture.directory, 'docker-records.json');
  const curlLog = join(fixture.directory, 'curl.log');
  const curl = join(fixture.directory, 'bin/curl');
  const progress = fixture.args[fixture.args.indexOf('--progress-directory') + 1];
  const q12RunRoot = join(fixture.directory, `backups/q12/${Q12_RUN_ID}`);
  const barrierReceipt = join(q12RunRoot, 'database-barrier-receipt.json');
  const q12Capability = join(q12RunRoot, 'secrets/db-capability');
  const quiesceManifest = join(q12RunRoot, `writer-quiesce-${Q12_RUN_ID}.json`);
  const recoveryState = join(q12RunRoot, `writer-recovery-state-${Q12_RUN_ID}.json`);
  const oldCrossedQuiesceManifest = join(progress, `writer-quiesce-${Q12_RUN_ID}.json`);
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
      run_id: Q12_RUN_ID,
      state: 'recovery_ready_guarded',
      zero_guard_residue: false,
      expected_catalog_sha256: 'b'.repeat(64),
      last_command: 'prepare-recovery',
      rollback_probes_verified: true,
      probe_receipt_sha256: 'c'.repeat(64),
    })}\n`,
    { mode: 0o400 }
  );
  writeFileSync(q12Capability, 'q12-wrapper-secret-sentinel\n', { mode: 0o400 });
  chmodSync(q12Capability, 0o400);
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

function markBarrierCleanupComplete(fixture: ComposeWriterFixture): void {
  const receipt = JSON.parse(readFileSync(fixture.barrierReceipt, 'utf8')) as Record<string, any>;
  Object.assign(receipt, {
    state: 'guard_cleanup_complete',
    zero_guard_residue: true,
    last_command: 'cleanup',
    rollback_probes_verified: true,
  });
  chmodSync(fixture.barrierReceipt, 0o600);
  writeFileSync(fixture.barrierReceipt, `${JSON.stringify(receipt)}\n`);
  chmodSync(fixture.barrierReceipt, 0o400);
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
  checkpoint: string;
  cutoverLock: string;
  finalIds: string[];
  finalManifest: string;
  heldIds: string[];
  resumeState: string;
  resume(
    modeOverride?: 'forward' | 'rollback',
    env?: NodeJS.ProcessEnv
  ): ReturnType<typeof spawnSync>;
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
  duplicateFinalPair?: boolean;
  entryMutator?: (entry: Record<string, any>) => void;
  probeMutator?: (probe: Record<string, any>) => void;
  rollbackJournalPhaseOrderTransform?: (phases: string[]) => string[];
  rollbackRequiredPhases?: string[];
  targetRecordsTransform?: (records: Array<Record<string, any>>) => Array<Record<string, any>>;
}

function writerResumeFixture(
  mode: 'forward' | 'rollback',
  heldTargetCount = mode === 'forward' ? 5 : 3,
  createdNoHealth = false,
  journalOptions: ResumeJournalFixtureOptions = {}
): ResumeWriterFixture {
  const fixture = composeWriterFixture();
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
  const originalQuiesce = originalRecords.map(quiesceWriter);
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
  writeProtectedJson(fixture.quiesceManifest, {
    schema_version: 'megacampus.q12.writer-quiesce/v1',
    run_id: Q12_RUN_ID,
    status: 'quiesced',
    barrier: readinessBarrier,
    writers: originalQuiesce,
  });
  const quiesceSha = fileSha256(fixture.quiesceManifest);
  if (mode === 'forward') {
    writeProtectedJson(fixture.recoveryState, {
      schema_version: 'megacampus.q12.writer-recovery-state/v1',
      run_id: Q12_RUN_ID,
      state: 'recovery_complete_writers_quiesced',
      expected_catalog_sha256: 'b'.repeat(64),
      writer_quiesce_manifest_sha256: quiesceSha,
      source_manifest_sha256: 'c'.repeat(64),
      source_journal_sha256: 'd'.repeat(64),
    });
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
  writeFileSync(
    fixture.recordsPath,
    `${JSON.stringify([...stoppedOriginal, ...liveTargets], null, 2)}\n`,
    { mode: 0o600 }
  );

  const originalProduction = originalRecords.slice(0, 5);
  const originalDevelopment = originalRecords.slice(5);
  const finalRecords =
    mode === 'forward' ? [...targetRecords, ...originalDevelopment] : originalRecords;
  const heldRecords = mode === 'forward' ? originalProduction : capturedTargets;
  const finalWriters = finalRecords.map(record => {
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
  });
  const heldWriters = heldRecords.map(record => manifestWriter(record, false));
  const finalManifest = join(fixture.q12RunRoot, `final-writer-manifest-${Q12_RUN_ID}.json`);
  const handoffState = join(fixture.q12RunRoot, `writer-handoff-state-${Q12_RUN_ID}.json`);
  const rollbackState = join(fixture.q12RunRoot, `writer-rollback-state-${Q12_RUN_ID}.json`);
  const authority = join(fixture.q12RunRoot, `writer-resume-authority-${Q12_RUN_ID}.json`);
  const resumeState = join(fixture.q12RunRoot, `writer-resume-state-${Q12_RUN_ID}.json`);
  const checkpoint = join(fixture.q12RunRoot, 'phase-checkpoint.json');
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const cutoverLock = join(fixture.directory, 'q12-cutover.lock');
  const releaseSha = 'e'.repeat(40);
  const leaseEpoch = 'cutover';
  const resourceManifestSha = 'd'.repeat(64);
  const journalEntries: Array<Record<string, any>> = [];
  let previousHash = '0'.repeat(64);
  const appendJournalEntry = (
    phase: string,
    outcome: string,
    acceptedObjectKind = 'none',
    acceptedObjectSha256: string | null = null,
    entryLeaseEpoch = leaseEpoch
  ): Record<string, any> => {
    const seq = journalEntries.length + 1;
    const preimage = {
      schema: 'megacampus.q12.cutover-journal/v1',
      run_id: Q12_RUN_ID,
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
      resource_manifest_sha256: resourceManifestSha,
      quiesce_manifest_sha256: quiesceSha,
      capability_manifest_sha256: '0'.repeat(64),
      accepted_object_kind: acceptedObjectKind,
      accepted_object_sha256: acceptedObjectSha256,
    };
    journalOptions.entryMutator?.(preimage);
    const entry = withJournalEntryHash(preimage);
    journalEntries.push(entry);
    previousHash = String(entry.entry_hash);
    return entry;
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
  for (const phase of commonPrefix) appendJournalEntry(phase, 'completed');
  const finalPhase = mode === 'forward' ? 'prepared_quiesced' : 'rollback_preparing';
  const finalIntent = appendJournalEntry(finalPhase, 'intent');
  writeProtectedJson(finalManifest, {
    schema_version: 'megacampus.q12.final-writer-manifest/v1',
    run_id: Q12_RUN_ID,
    mode,
    release_sha: releaseSha,
    expected_catalog_sha256: 'b'.repeat(64),
    writer_quiesce_manifest_sha256: quiesceSha,
    publication_intent_journal_entry_hash: finalIntent.entry_hash,
    input_checkpoint_sha256: '1'.repeat(64),
    lease_epoch: leaseEpoch,
    final_writers: finalWriters,
    held_writers: heldWriters,
  });
  const finalManifestSha = fileSha256(finalManifest);
  appendJournalEntry(finalPhase, 'accepted', 'final_writer_manifest', finalManifestSha);
  if (journalOptions.duplicateFinalPair) {
    appendJournalEntry(finalPhase, 'intent');
    appendJournalEntry(finalPhase, 'accepted', 'final_writer_manifest', finalManifestSha);
  }
  let handoffStateSha: string | null = null;
  let rollbackStateSha: string | null = null;
  const statePhase =
    mode === 'forward' ? 'handoff_ready_writers_quiesced' : 'rollback_ready_writers_quiesced';
  let stateIntent: Record<string, any>;
  if (mode === 'forward') {
    for (const phase of ['activation_ready', 'activation_committing', 'activated']) {
      appendJournalEntry(phase, 'completed');
    }
    stateIntent = appendJournalEntry(statePhase, 'intent');
    writeProtectedJson(handoffState, {
      schema_version: 'megacampus.q12.writer-handoff-state/v1',
      run_id: Q12_RUN_ID,
      state: 'handoff_ready_writers_quiesced',
      mode,
      release_sha: releaseSha,
      expected_catalog_sha256: 'b'.repeat(64),
      writer_quiesce_manifest_sha256: quiesceSha,
      final_writer_manifest_sha256: finalManifestSha,
      database_activation_receipt_sha256: '3'.repeat(64),
      publication_intent_journal_entry_hash: stateIntent.entry_hash,
      input_checkpoint_sha256: '2'.repeat(64),
      lease_epoch: leaseEpoch,
    });
    handoffStateSha = fileSha256(handoffState);
    appendJournalEntry(statePhase, 'accepted', 'writer_handoff_state', handoffStateSha);
    markBarrierCleanupComplete(fixture);
    appendJournalEntry('guard_cleanup_complete', 'completed');
  } else {
    Object.assign(barrier, {
      state: 'guard_cleanup_complete',
      zero_guard_residue: true,
      last_command: 'rollback',
      rollback_probes_verified: false,
      probe_receipt_sha256: null,
    });
    writeProtectedJson(fixture.barrierReceipt, barrier);
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
    const requiredPhaseReceiptsSha = createHash('sha256')
      .update(canonicalJson(requiredPhaseReceipts))
      .digest('hex');
    const rollbackJournalPhaseOrder =
      journalOptions.rollbackJournalPhaseOrderTransform?.(rollbackPhaseOrder) ?? rollbackPhaseOrder;
    for (const phase of rollbackJournalPhaseOrder) {
      if (requiredPhaseNames.includes(phase)) appendJournalEntry(phase, 'completed');
    }
    appendJournalEntry('guard_cleanup_complete', 'completed');
    stateIntent = appendJournalEntry(statePhase, 'intent');
    writeProtectedJson(rollbackState, {
      schema_version: 'megacampus.q12.writer-rollback-state/v1',
      run_id: Q12_RUN_ID,
      state: 'rollback_ready_writers_quiesced',
      mode,
      release_sha: releaseSha,
      expected_catalog_sha256: 'b'.repeat(64),
      writer_quiesce_manifest_sha256: quiesceSha,
      final_writer_manifest_sha256: finalManifestSha,
      database_barrier_receipt_sha256: fileSha256(fixture.barrierReceipt),
      required_phase_receipts: requiredPhaseReceipts,
      required_phase_receipts_sha256: requiredPhaseReceiptsSha,
      publication_intent_journal_entry_hash: stateIntent.entry_hash,
      input_checkpoint_sha256: '2'.repeat(64),
      lease_epoch: leaseEpoch,
    });
    rollbackStateSha = fileSha256(rollbackState);
    appendJournalEntry(statePhase, 'accepted', 'writer_rollback_state', rollbackStateSha);
  }
  const barrierSha = fileSha256(fixture.barrierReceipt);
  const authorityPhase = `resume_authority_${mode}`;
  const authorityLeaseEpoch = journalOptions.authorityLeaseEpoch ?? leaseEpoch;
  const authorityIntent = appendJournalEntry(
    authorityPhase,
    'intent',
    'none',
    null,
    authorityLeaseEpoch
  );
  const authorityValue = {
    schema_version: 'megacampus.q12.writer-resume-authority/v1',
    run_id: Q12_RUN_ID,
    state:
      mode === 'forward' ? 'handoff_ready_writers_quiesced' : 'rollback_ready_writers_quiesced',
    mode,
    release_sha: releaseSha,
    expected_catalog_sha256: 'b'.repeat(64),
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
    authorityLeaseEpoch
  );
  const resumeHead = withJournalEntryHash({
    schema: 'megacampus.q12.cutover-journal/v1',
    run_id: Q12_RUN_ID,
    seq: journalEntries.length + 1,
    phase: `resume_committing_${mode}`,
    outcome: 'intent',
    timestamp: '2026-07-13T12:00:42.000Z',
    release_sha: releaseSha,
    operator_digest: '8'.repeat(64),
    command_id: `writers.resume.${mode}`,
    command_sha256: '9'.repeat(64),
    lease_epoch: authorityLeaseEpoch,
    previous_hash: previousHash,
    rotation_required: true,
    resource_manifest_sha256: resourceManifestSha,
    quiesce_manifest_sha256: quiesceSha,
    capability_manifest_sha256: '0'.repeat(64),
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
  });
  journalEntries.push(resumeHead);
  writeJournal(journal, journalEntries);
  const journalStat = statSync(journal);
  writeProtectedJson(
    checkpoint,
    {
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      run_id: Q12_RUN_ID,
      seq: resumeHead.seq,
      phase: `resume_committing_${mode}`,
      journal_entry_hash: resumeHead.entry_hash,
      previous_journal_entry_hash: resumeHead.previous_hash,
      journal_device: String(journalStat.dev),
      journal_inode: String(journalStat.ino),
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
      resume_authority_sha256: authoritySha,
      lease_epoch: authorityLeaseEpoch,
    },
    0o600
  );
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
    authority,
    checkpoint,
    cutoverLock,
    finalIds: finalWriters.map(writer => String(writer.id)),
    finalManifest,
    heldIds: heldWriters.map(writer => String(writer.id)),
    resumeState,
    resume,
  };
}

function rewriteWriterResumeEpoch(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  leaseEpoch: string
): string {
  const checkpointBefore = JSON.parse(readFileSync(fixture.checkpoint, 'utf8')) as Record<
    string,
    any
  >;
  const checkpointBeforeSha = fileSha256(fixture.checkpoint);
  const journal = join(fixture.q12RunRoot, 'phase.jsonl');
  const journalEntries = readFileSync(journal, 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, any>);
  const previousHead = journalEntries.at(-1)!;
  const previousPreimage = { ...previousHead };
  delete previousPreimage.entry_hash;
  const authorityIntent = withJournalEntryHash({
    ...previousPreimage,
    seq: Number(checkpointBefore.seq) + 1,
    phase: `resume_authority_${mode}`,
    outcome: 'intent',
    timestamp: '2026-07-13T12:01:00.000Z',
    command_id: `writers.resume.${mode}`,
    lease_epoch: leaseEpoch,
    previous_hash: checkpointBefore.journal_entry_hash,
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
  });
  const authority = JSON.parse(readFileSync(fixture.authority, 'utf8')) as Record<string, any>;
  authority.authority_intent_journal_entry_hash = authorityIntent.entry_hash;
  authority.input_checkpoint_sha256 = checkpointBeforeSha;
  authority.lease_epoch = leaseEpoch;
  writeProtectedJson(fixture.authority, authority);
  const authoritySha = fileSha256(fixture.authority);
  const authorityAccepted = withJournalEntryHash({
    ...previousPreimage,
    seq: authorityIntent.seq + 1,
    phase: authorityIntent.phase,
    outcome: 'accepted',
    timestamp: '2026-07-13T12:01:01.000Z',
    command_id: `writers.resume.${mode}`,
    lease_epoch: leaseEpoch,
    previous_hash: authorityIntent.entry_hash,
    resource_manifest_sha256: previousPreimage.resource_manifest_sha256,
    accepted_object_kind: 'writer_resume_authority',
    accepted_object_sha256: authoritySha,
  });
  const journalHead = withJournalEntryHash({
    ...previousPreimage,
    seq: authorityAccepted.seq + 1,
    phase: `resume_committing_${mode}`,
    outcome: 'intent',
    timestamp: '2026-07-13T12:01:02.000Z',
    command_id: `writers.resume.${mode}`,
    lease_epoch: leaseEpoch,
    previous_hash: authorityAccepted.entry_hash,
    resource_manifest_sha256: previousPreimage.resource_manifest_sha256,
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
  });
  journalEntries.push(authorityIntent, authorityAccepted, journalHead);
  writeJournal(journal, journalEntries);
  const journalStat = statSync(journal);
  Object.assign(checkpointBefore, {
    seq: journalHead.seq,
    phase: journalHead.phase,
    journal_entry_hash: journalHead.entry_hash,
    previous_journal_entry_hash: journalHead.previous_hash,
    journal_device: String(journalStat.dev),
    journal_inode: String(journalStat.ino),
    resume_authority_sha256: authoritySha,
    lease_epoch: leaseEpoch,
  });
  writeProtectedJson(fixture.checkpoint, checkpointBefore, 0o600);
  return leaseEpoch;
}

function advanceWriterResumeRecoveryEpoch(
  fixture: ResumeWriterFixture,
  mode: 'forward' | 'rollback',
  ordinal = 1
): string {
  return rewriteWriterResumeEpoch(fixture, mode, `cutover-recovery-${ordinal}`);
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
      Q12_RUN_ID,
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

describe('Q12 source-recovery host lock and writer restoration', () => {
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

  it('sanitizes an unapproved launcher variable before entering the exact controller environment', () => {
    const fixture = writerResumeFixture('forward');

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

  it('rejects non-canonical whitespace in any stored journal line before Docker inspection', () => {
    const fixture = writerResumeFixture('forward');
    const journal = join(fixture.q12RunRoot, 'phase.jsonl');
    writeFileSync(journal, readFileSync(journal, 'utf8').replace('\n', ' \n'));

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal line is not canonical/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a recomputed middle journal entry whose successor no longer chains to it', () => {
    const fixture = writerResumeFixture('forward');
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

  it('rejects a canonically rehashed resume head with the wrong command ID', () => {
    const fixture = writerResumeFixture('forward');
    rewriteResumeJournalHead(fixture, head => {
      head.command_id = 'barrier.prepare-recovery';
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal\/checkpoint binding/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects accepted-object data in a resume-committing head even when checkpoint-bound', () => {
    const fixture = writerResumeFixture('forward');
    rewriteResumeJournalHead(fixture, head => {
      head.accepted_object_kind = 'final_writer_manifest';
      head.accepted_object_sha256 = fileSha256(fixture.finalManifest);
    });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/checkpoint projection|journal\/checkpoint binding/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects a non-safe numeric journal value before chain acceptance', () => {
    const fixture = writerResumeFixture('forward');
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

  it('rejects escaped non-ASCII bytes when the same journal value has a literal UTF-8 canonical form', () => {
    const fixture = writerResumeFixture('forward');
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

  it.each([
    {
      label: 'missing phase',
      options: {
        commonPrefixTransform: (phases: string[]) =>
          phases.filter(phase => phase !== 'restore_verified'),
      },
    },
    {
      label: 'out-of-order phase',
      options: {
        commonPrefixTransform: (phases: string[]) => {
          const changed = [...phases];
          const backup = changed.indexOf('backup_committed');
          const restore = changed.indexOf('restore_verified');
          [changed[backup], changed[restore]] = [changed[restore], changed[backup]];
          return changed;
        },
      },
    },
    {
      label: 'repeated phase',
      options: {
        commonPrefixTransform: (phases: string[]) => [
          ...phases.slice(0, 6),
          'restore_verified',
          ...phases.slice(6),
        ],
      },
    },
    {
      label: 'unknown phase',
      options: {
        commonPrefixTransform: (phases: string[]) =>
          phases.map(phase => (phase === 'restore_verified' ? 'cutover_prepared' : phase)),
      },
    },
    {
      label: 'cross-mode phase',
      options: {
        commonPrefixTransform: (phases: string[]) => [
          ...phases.slice(0, 6),
          'rollback_complete',
          ...phases.slice(6),
        ],
      },
    },
    {
      label: 'wrong ordinary outcome',
      options: {
        entryMutator: (entry: Record<string, any>) => {
          if (entry.phase === 'migrations_applied') entry.outcome = 'accepted';
        },
      },
    },
    {
      label: 'accepted object on an ordinary phase',
      options: {
        entryMutator: (entry: Record<string, any>) => {
          if (entry.phase === 'migrations_applied') {
            entry.accepted_object_kind = 'writer_resume_state';
            entry.accepted_object_sha256 = 'f'.repeat(64);
          }
        },
      },
    },
    {
      label: 'second object publication pair',
      options: { duplicateFinalPair: true },
    },
  ])('rejects a $label in the exact forward journal prefix', ({ options }) => {
    const fixture = writerResumeFixture('forward', 5, false, options);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/phase graph|journal prefix/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('resumes the exact forward final ten in workers, API, Web order and leaves held five stopped', () => {
    const fixture = writerResumeFixture('forward');
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
      run_id: Q12_RUN_ID,
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
      run_id: Q12_RUN_ID,
      state: 'writers_resumed',
      mode: 'forward',
      lease_epoch: 'cutover',
    });
    expect(receipt.final_inventory_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.held_inventory_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([0, 3, 5])(
    'resumes rollback original ten while preserving an exact held target set of %i',
    heldTargetCount => {
      const fixture = writerResumeFixture('rollback', heldTargetCount);

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
        run_id: Q12_RUN_ID,
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
  ])('rejects an $label before rollback writer start', ({ options }) => {
    const fixture = writerResumeFixture('rollback', 3, false, options);

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/rollback.*conditional|rollback.*phase receipt/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('compensates every final writer to stopped/no after an ordered resume start failure', () => {
    const fixture = writerResumeFixture('forward');

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

  it('compensates every final writer when restart-policy restoration fails', () => {
    const fixture = writerResumeFixture('forward');

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

  it('does not start Web after API health verification fails and compensates all final writers', () => {
    const fixture = writerResumeFixture('forward');
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

  it('compensates when Docker reports a successful start without a running writer', () => {
    const fixture = writerResumeFixture('forward');
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

  it('compensates a final restart-policy drift after every ordered start', () => {
    const fixture = writerResumeFixture('forward');
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
    const fixture = writerResumeFixture('forward');
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

  it('detects an atomic authority-input swap and compensates before receipt publication', () => {
    const fixture = writerResumeFixture('forward');
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

  it('publishes a missing terminal receipt without replay after an exact-terminal crash', () => {
    const fixture = writerResumeFixture('forward');

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

  it('leaves one owned terminal receipt and no hard-link temporary residue after rename crash', () => {
    const fixture = writerResumeFixture('forward');

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

  it('fails closed on a deterministic terminal temporary symlink before writer start', () => {
    const fixture = writerResumeFixture('forward');
    const target = join(fixture.directory, 'terminal-temp-target');
    writeFileSync(target, 'attacker-controlled\n', { mode: 0o400 });
    symlinkSync(target, join(fixture.q12RunRoot, '.writer-resume-state.tmp'));

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/temporary.*(?:regular file|symlink|not canonical)/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('retains a durable deterministic terminal temporary after fsync crash and blocks same-epoch replay', () => {
    const fixture = writerResumeFixture('forward');
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

  it('removes only exact deterministic temporary residue beside an accepted terminal receipt', () => {
    const fixture = writerResumeFixture('forward');
    const first = fixture.resume();
    expect(first.status, first.stderr).toBe(0);
    const terminalTemporary = join(fixture.q12RunRoot, '.writer-resume-state.tmp');
    writeFileSync(terminalTemporary, readFileSync(fixture.resumeState), { mode: 0o400 });

    const retry = fixture.resume();

    expect(retry.status, retry.stderr).toBe(0);
    expect(existsSync(terminalTemporary)).toBe(false);
  });

  it('compensates a partial SIGKILL resume and requires the next recovery epoch', () => {
    const fixture = writerResumeFixture('forward');

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

  it('preserves a created writer without a healthcheck through rollback resume', () => {
    const fixture = writerResumeFixture('rollback', 0, true);
    const manifest = JSON.parse(readFileSync(fixture.finalManifest, 'utf8')) as Record<string, any>;
    const created = (manifest.final_writers as Array<Record<string, any>>).find(
      writer => writer.healthcheck_present === false
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

  it('rejects an extra release_sha in the exact fourteen-key terminal receipt', () => {
    const fixture = writerResumeFixture('forward');
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

  it('rejects a recreated final writer identity before any start', () => {
    const fixture = writerResumeFixture('forward');
    const records = fixture.records();
    records.find(record => record.Id === fixture.finalIds[0])!.Image = `sha256:${'f'.repeat(64)}`;
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });

    const result = fixture.resume();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/identity|image/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(existsSync(fixture.resumeState)).toBe(false);
  });

  it('rejects an unrecorded target identity before any start', () => {
    const fixture = writerResumeFixture('rollback', 3);
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

  it('completes standalone recovery with every writer still quiesced and a controller receipt', () => {
    const fixture = composeWriterFixture();

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
    const state = JSON.parse(readFileSync(fixture.recoveryState, 'utf8')) as Record<string, any>;
    expect(state).toMatchObject({
      schema_version: 'megacampus.q12.writer-recovery-state/v1',
      run_id: Q12_RUN_ID,
      state: 'recovery_complete_writers_quiesced',
      expected_catalog_sha256: 'b'.repeat(64),
    });
    for (const field of [
      'writer_quiesce_manifest_sha256',
      'source_manifest_sha256',
      'source_journal_sha256',
    ]) {
      expect(state[field]).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('never replaces a pre-existing non-exact immutable writer recovery receipt', () => {
    const fixture = composeWriterFixture();
    const existing = '{"preexisting":"must-not-be-replaced"}\n';
    writeFileSync(fixture.recoveryState, existing, { mode: 0o400 });

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/recovery.*already exists|recovery.*non-exact/iu);
    expect(readFileSync(fixture.recoveryState, 'utf8')).toBe(existing);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
  });

  it.each([
    'maintenance_guarded',
    '20260711151000_guard_verified',
    'activated',
    'guard_cleanup_complete',
  ])('rejects non-ready database barrier state %s before writer mutation', state => {
    const fixture = composeWriterFixture();
    const receipt = JSON.parse(readFileSync(fixture.barrierReceipt, 'utf8')) as Record<string, any>;
    receipt.state = state;
    if (state === 'guard_cleanup_complete') {
      receipt.zero_guard_residue = true;
      receipt.last_command = 'cleanup';
    }
    chmodSync(fixture.barrierReceipt, 0o600);
    writeFileSync(fixture.barrierReceipt, `${JSON.stringify(receipt)}\n`);
    chmodSync(fixture.barrierReceipt, 0o400);

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/recovery_ready_guarded/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('fails closed without a recovery-complete receipt when a recovery child fails', () => {
    const fixture = composeWriterFixture();

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_TEST_FAIL_MODE: 'execute' },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.recoveryState)).toBe(false);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
  });

  it('rejects an immutable source manifest replacement after the final recovery child', () => {
    const fixture = composeWriterFixture();
    const sourceManifest = fixture.args[fixture.args.indexOf('--manifest') + 1];
    const replacement = join(fixture.directory, 'replacement-source-manifest.json');
    writeFileSync(replacement, '{"replacement":true}\n', { mode: 0o400 });

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_TEST_SWAP_AFTER_MODE: 'verify-dispositions',
        SOURCE_RECOVERY_TEST_SWAP_TARGET: sourceManifest,
        SOURCE_RECOVERY_TEST_SWAP_REPLACEMENT: replacement,
      },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.recoveryState)).toBe(false);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
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

  it('binds a validated Q12 capability file into every ephemeral operator without reading it', () => {
    const fixture = composeWriterFixture();
    const sentinel = 'q12-wrapper-secret-sentinel';

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const composeLog = readFileSync(fixture.composeLog, 'utf8');
    expect(composeLog).toContain(
      `-v ${fixture.q12Capability}:/run/secrets/q12_db_capability:ro -e Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability`
    );
    expect(composeLog).toContain(
      `-v ${fixture.probeReceipt}:/run/secrets/q12_database_barrier_probe_receipt:ro`
    );
    expect(composeLog).not.toContain(sentinel);
    expect(readFileSync(fixture.q12Capability, 'utf8').trim()).toBe(sentinel);
  });

  it('quiesces the exact ten writers and hard-stops pending an approved resume contract', () => {
    const fixture = composeWriterFixture();
    const before = fixture.records();

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(
      result.status,
      `${result.stderr}\nreceipt=${readFileSync(fixture.barrierReceipt, 'utf8')}\nmanifest=${readFileSync(fixture.quiesceManifest, 'utf8')}`
    ).toBe(0);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
    expect(existsSync(fixture.oldCrossedQuiesceManifest)).toBe(false);
    const manifest = JSON.parse(readFileSync(fixture.quiesceManifest, 'utf8')) as Record<
      string,
      any
    >;
    expect(manifest).toMatchObject({
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: Q12_RUN_ID,
      status: 'quiesced',
      barrier: { state: 'recovery_ready_guarded', zero_guard_residue: false },
    });
    expect(manifest.writers).toHaveLength(10);
    expect(new Set(manifest.writers.map((writer: Record<string, string>) => writer.id)).size).toBe(
      10
    );
    const dockerLines = readFileSync(fixture.dockerLog, 'utf8').trim().split('\n');
    const mutationLines = dockerLines.filter(line => /^(?:update|stop|start) /u.test(line));
    const knownIds = new Set(before.map(record => record.Id));
    for (const line of mutationLines) {
      expect([...knownIds].some(id => line.includes(id))).toBe(true);
    }
    const firstStop = mutationLines.findIndex(line => line.startsWith('stop '));
    expect(mutationLines.slice(0, firstStop)).toHaveLength(10);
    expect(
      mutationLines.slice(0, firstStop).every(line => line.startsWith('update --restart=no '))
    ).toBe(true);
    const stopLines = mutationLines.filter(line => line.startsWith('stop '));
    const apiWebIds = new Set([before[0].Id, before[1].Id, before[5].Id, before[6].Id]);
    expect(stopLines.slice(0, 4).every(line => [...apiWebIds].some(id => line.includes(id)))).toBe(
      true
    );
    expect(mutationLines.some(line => line.startsWith('start '))).toBe(false);
    const curlLog = readFileSync(fixture.curlLog, 'utf8');
    expect(curlLog).toContain('ai.megacampus.ru');
    expect(curlLog).toContain('dev.ai.megacampus.ru');
  });

  it('proves the production cleanup-to-resume handoff is blocked after capability deletion', () => {
    const fixture = composeWriterFixture();
    const quiesced = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(quiesced.status).toBe(0);
    markBarrierCleanupComplete(fixture);
    rmSync(fixture.q12Capability, { force: true });
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const resumed = spawnSync(
      'bash',
      [WRAPPER, '--resume-from', 'verify-dispositions', '--stop-writers', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );

    expect(resumed.status).not.toBe(0);
    expect(resumed.stderr).toMatch(/capability.*existing absolute non-symlink file/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^start /mu);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
  });

  it('accepts the exact Nginx 502/503 pages when server_tokens is disabled', () => {
    const fixture = composeWriterFixture();
    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_TEST_NGINX_VARIANT: 'tokens-off' },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toMatch(/inbound Nginx response signature/iu);
    expect(JSON.parse(readFileSync(fixture.quiesceManifest, 'utf8'))).toMatchObject({
      status: 'quiesced',
    });
    expect(readFileSync(fixture.curlLog, 'utf8')).toContain('dev.ai.megacampus.ru');
  });

  it.each([
    'custom-body',
    'wrong-reason',
    'wrong-status',
    'mismatched-footer',
    'lf-only',
    'extra-bytes',
    'oversized',
    'json',
    'wrong-content-type',
    'missing-content-type',
    'duplicate-content-type',
    'missing-content-length',
    'duplicate-content-length',
    'missing-server',
    'duplicate-server',
    'chunked',
  ])('rejects a non-standard Nginx maintenance response: %s', variant => {
    const fixture = composeWriterFixture();
    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: { ...fixture.env, SOURCE_RECOVERY_TEST_NGINX_VARIANT: variant },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inbound.*signature|inbound.*probe/iu);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
  });

  it('re-quiesces every captured writer when an exact stop boundary fails', () => {
    const fixture = composeWriterFixture();
    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_TEST_FAIL_STOP_AFTER: '2',
        SOURCE_RECOVERY_TEST_STOP_COUNTER: join(fixture.directory, 'stop-counter'),
      },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(fixture.records().every(record => record.State.Running === false)).toBe(true);
    expect(fixture.records().every(record => record.HostConfig.RestartPolicy.Name === 'no')).toBe(
      true
    );
  });

  it('does not follow a crash-stale predictable writer-manifest temporary symlink', () => {
    const fixture = composeWriterFixture();
    const victim = join(fixture.directory, 'manifest-symlink-victim');
    writeFileSync(victim, 'unchanged\n', { mode: 0o400 });
    const result = spawnSync(
      'bash',
      [
        '-c',
        'victim="$1"; manifest="$2"; wrapper="$3"; shift 3; ln -s -- "$victim" "$manifest.tmp.$$"; exec bash "$wrapper" --stop-writers "$@"',
        'q12-manifest-stale-temp',
        victim,
        fixture.quiesceManifest,
        WRAPPER,
        ...fixture.args,
      ],
      { env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(victim, 'utf8')).toBe('unchanged\n');
    expect(JSON.parse(readFileSync(fixture.quiesceManifest, 'utf8'))).toMatchObject({
      status: 'quiesced',
    });
  });

  it('rejects recovery/Q12 UUID cross-wiring before any Compose writer mutation', () => {
    const fixture = composeWriterFixture();
    const receipt = JSON.parse(readFileSync(fixture.barrierReceipt, 'utf8')) as Record<string, any>;
    receipt.run_id = '123e4567-e89b-42d3-a456-426614174000';
    chmodSync(fixture.barrierReceipt, 0o600);
    writeFileSync(fixture.barrierReceipt, `${JSON.stringify(receipt)}\n`);
    chmodSync(fixture.barrierReceipt, 0o400);

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/barrier receipt/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('rejects extra receipt and quiesce-manifest fields instead of accepting supersets', () => {
    const receiptFixture = composeWriterFixture();
    const receipt = JSON.parse(readFileSync(receiptFixture.barrierReceipt, 'utf8')) as Record<
      string,
      any
    >;
    receipt.unreviewed = true;
    chmodSync(receiptFixture.barrierReceipt, 0o600);
    writeFileSync(receiptFixture.barrierReceipt, `${JSON.stringify(receipt)}\n`);
    chmodSync(receiptFixture.barrierReceipt, 0o400);
    const receiptResult = spawnSync('bash', [WRAPPER, '--stop-writers', ...receiptFixture.args], {
      env: receiptFixture.env,
      encoding: 'utf8',
    });
    expect(receiptResult.status).not.toBe(0);
    expect(receiptResult.stderr).toMatch(/barrier receipt/iu);
    expect(readFileSync(receiptFixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);

    const manifestFixture = composeWriterFixture();
    const quiesced = spawnSync('bash', [WRAPPER, '--stop-writers', ...manifestFixture.args], {
      env: manifestFixture.env,
      encoding: 'utf8',
    });
    expect(quiesced.status).toBe(0);
    const manifest = JSON.parse(readFileSync(manifestFixture.quiesceManifest, 'utf8')) as Record<
      string,
      any
    >;
    manifest.unreviewed = true;
    chmodSync(manifestFixture.quiesceManifest, 0o600);
    writeFileSync(manifestFixture.quiesceManifest, `${JSON.stringify(manifest)}\n`);
    chmodSync(manifestFixture.quiesceManifest, 0o400);
    writeFileSync(manifestFixture.dockerLog, '', { mode: 0o600 });
    const manifestResult = spawnSync(
      'bash',
      [WRAPPER, '--resume-from', 'execute', '--stop-writers', ...manifestFixture.args],
      { env: manifestFixture.env, encoding: 'utf8' }
    );
    expect(manifestResult.status).not.toBe(0);
    expect(manifestResult.stderr).toMatch(/quiesce manifest.*invalid|cross-wired/iu);
    expect(readFileSync(manifestFixture.dockerLog, 'utf8')).not.toMatch(
      /^(?:update|stop|start) /mu
    );
  });

  it.each(['class', 'service', 'config_files'] as const)(
    'rejects a durable writer manifest with a changed immutable %s projection',
    field => {
      const fixture = composeWriterFixture();
      const quiesced = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });
      expect(quiesced.status).toBe(0);
      const manifest = JSON.parse(readFileSync(fixture.quiesceManifest, 'utf8')) as Record<
        string,
        any
      >;
      if (field === 'class') manifest.writers[0].class = 'production-worker';
      if (field === 'service') manifest.writers[0].service = 'web';
      if (field === 'config_files') manifest.writers[0].config_files = '/srv/tampered/compose.yml';
      chmodSync(fixture.quiesceManifest, 0o600);
      writeFileSync(fixture.quiesceManifest, `${JSON.stringify(manifest)}\n`);
      chmodSync(fixture.quiesceManifest, 0o400);
      writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

      const result = spawnSync(
        'bash',
        [WRAPPER, '--resume-from', 'execute', '--stop-writers', ...fixture.args],
        { env: fixture.env, encoding: 'utf8' }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/quiesce manifest.*invalid|cross-wired|inventory differs/iu);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
    }
  );

  it('rejects host Q12 artifacts owned as operator state instead of controller state', () => {
    const fixture = composeWriterFixture();
    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_CONTROLLER_UID: String(Number(process.getuid?.() ?? 1000) + 1),
      },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/capability.*exact owner and mode/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it('fails before Docker mutation for duplicate or mismatched Compose identity', () => {
    const fixture = composeWriterFixture();
    const records = fixture.records();
    records.push({ ...records[2], Id: `ff${'b'.repeat(62)}`, Name: '/duplicate-worker' });
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });

    const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exactly one|duplicate|identity/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
  });

  it.each(['unhealthy', 'starting'])(
    'fails closed for a %s writer before changing restart policy',
    health => {
      const fixture = composeWriterFixture();
      const records = fixture.records();
      records[4].State.Health.Status = health;
      writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });

      const result = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/unhealthy|identity|inspect/iu);
      expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
    }
  );

  it('rejects a recreated container ID against a durable partial-policy manifest', () => {
    const fixture = composeWriterFixture();
    const updateCounter = join(fixture.directory, 'update-counter-recreated');
    const interrupted = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: {
        ...fixture.env,
        SOURCE_RECOVERY_TEST_FAIL_UPDATE_AFTER: '2',
        SOURCE_RECOVERY_TEST_UPDATE_COUNTER: updateCounter,
      },
      encoding: 'utf8',
    });
    expect(interrupted.status).not.toBe(0);
    const records = fixture.records();
    records[0].Id = `ff${'c'.repeat(62)}`;
    writeFileSync(fixture.recordsPath, `${JSON.stringify(records)}\n`, { mode: 0o600 });
    writeFileSync(fixture.dockerLog, '', { mode: 0o600 });

    const resumed = spawnSync('bash', [WRAPPER, '--stop-writers', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(resumed.status).not.toBe(0);
    expect(resumed.stderr).toMatch(/durable writer inventory|identity/iu);
    expect(readFileSync(fixture.dockerLog, 'utf8')).not.toMatch(/^(?:update|stop|start) /mu);
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
    const command = `exec {fd}<>"$1"; flock "$fd"; SOURCE_RECOVERY_TEST_FORBIDDEN_FD="$fd" Q12_EXTERNAL_QUIESCE_LEASE_FD="$fd" exec bash "$2" --external-quiesce-manifest "$3" "\${@:4}"`;
    const externalEnvironment = {
      ...fixture.env,
      SOURCE_RECOVERY_Q12_CUTOVER_LOCK_FILE: lease,
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
    expect(wrapper).toContain('/run/megacampus-qdrant-source-recovery/source-recovery.lock');
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
