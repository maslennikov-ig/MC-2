import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const QDRANT_IMAGE =
  'qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c';
const QDRANT_LINUX_AMD64_DIGEST =
  'sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071';
const COMPOSE_FILES = [
  'docker-compose.dev.yml',
  'docker-compose.infra.yml',
  'docker-compose.app.yml',
  'docker-compose.production.yml',
] as const;
const temporaryDirectories: string[] = [];

function source(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function serviceBlock(compose: string, service: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex(line => line === `  ${service}:`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-zA-Z0-9_-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

function expectOrdered(haystack: string, needles: string[]): void {
  let previous = -1;
  for (const needle of needles) {
    const current = haystack.indexOf(needle);
    expect(current, `missing ${needle}`).toBeGreaterThan(previous);
    previous = current;
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Q6 self-hosted Qdrant runtime contract', () => {
  it('pins every runtime Qdrant occurrence and hardens dev and staging services', () => {
    const dev = serviceBlock(source('docker-compose.dev.yml'), 'qdrant-dev');
    const infra = serviceBlock(source('docker-compose.infra.yml'), 'qdrant');
    const production = serviceBlock(source('docker-compose.production.yml'), 'qdrant');

    for (const block of [dev, infra, production]) {
      expect(block).toContain(`image: ${QDRANT_IMAGE}`);
      expect(block).toContain('platform: linux/amd64');
      expect(block).toContain('/qdrant/storage');
      expect(block).toContain('QDRANT__TELEMETRY_DISABLED=true');
      expect(block).toContain('QDRANT__SERVICE__METRICS_PREFIX=qdrant_');
      expect(block).not.toMatch(/hardware.*report/i);
    }
    expect(dev).toContain("'127.0.0.1:6333:6333'");
    expect(dev).toContain("cpus: '1'");
    expect(dev).toContain('memory: 1G');
    expect(infra).toContain("'127.0.0.1:6335:6333'");
    expect(infra).toContain("cpus: '2'");
    expect(infra).toContain('memory: 2G');
    expect(production).toContain("'127.0.0.1:6335:6333'");

    const all = COMPOSE_FILES.map(source).join('\n');
    expect(all).not.toContain('qdrant/qdrant:latest');
    expect(all).not.toMatch(/['"]?0\.0\.0\.0:633[35]:6333/);

    const imageLock = JSON.parse(source('deploy/qdrant/image-lock.json')) as {
      image: string;
      tag: string;
      index_digest: string;
      platform: string;
      child_digest: string;
    };
    expect(`${imageLock.image}:${imageLock.tag}@${imageLock.index_digest}`).toBe(QDRANT_IMAGE);
    expect(imageLock.platform).toBe('linux/amd64');
    expect(imageLock.child_digest).toBe(QDRANT_LINUX_AMD64_DIGEST);
  });

  it('uses a curl-less unauthenticated readyz healthcheck and file-only secrets', () => {
    const wrapper = source('deploy/qdrant/secret-entrypoint.sh');
    expect(wrapper).toContain('/dev/tcp/127.0.0.1/6333');
    expect(wrapper).toContain('GET /readyz HTTP/1.1');
    expect(wrapper).toContain('[[ $# -eq 1 && "$1" == ./entrypoint.sh ]] && set --');
    expect(wrapper).toContain('exec /qdrant/entrypoint.sh');
    expect(wrapper).not.toMatch(/\b(curl|wget|nc)\b/);
    expect(wrapper).not.toMatch(/set\s+-[^\n]*x/);

    for (const file of [
      'docker-compose.dev.yml',
      'docker-compose.infra.yml',
      'docker-compose.production.yml',
    ]) {
      const qdrant = serviceBlock(
        source(file),
        file === 'docker-compose.dev.yml' ? 'qdrant-dev' : 'qdrant'
      );
      expect(qdrant).toContain(
        "test: ['CMD', '/opt/megacampus/qdrant-secret-entrypoint.sh', 'healthcheck']"
      );
      expect(qdrant).not.toMatch(/healthcheck:[\s\S]*api-key/i);
      expect(qdrant).toContain('/run/secrets/qdrant_api_key');
      expect(qdrant).toContain('/run/secrets/qdrant_read_only_api_key');
      expect(qdrant).not.toMatch(/QDRANT__SERVICE__(READ_ONLY_)?API_KEY=/);
    }
  });

  it('fails closed before startup for missing, empty, and world-readable secrets', () => {
    const directory = mkdtempSync('/tmp/mc2-qdrant-secret-test-');
    temporaryDirectories.push(directory);
    const admin = join(directory, 'admin');
    const readOnly = join(directory, 'read-only');
    const wrapper = resolve(REPO_ROOT, 'deploy/qdrant/secret-entrypoint.sh');

    writeFileSync(readOnly, 'read-only-test\n', { mode: 0o400 });
    const missing = spawnSync('bash', [wrapper], {
      env: { ...process.env, QDRANT_API_KEY_FILE: admin, QDRANT_READ_ONLY_API_KEY_FILE: readOnly },
      encoding: 'utf8',
    });
    expect(missing.status).not.toBe(0);

    writeFileSync(admin, '', { mode: 0o400 });
    const empty = spawnSync('bash', [wrapper], {
      env: { ...process.env, QDRANT_API_KEY_FILE: admin, QDRANT_READ_ONLY_API_KEY_FILE: readOnly },
      encoding: 'utf8',
    });
    expect(empty.status).not.toBe(0);

    chmodSync(admin, 0o600);
    writeFileSync(admin, 'admin-test\n');
    chmodSync(admin, 0o444);
    const unsafe = spawnSync('bash', [wrapper], {
      env: { ...process.env, QDRANT_API_KEY_FILE: admin, QDRANT_READ_ONLY_API_KEY_FILE: readOnly },
      encoding: 'utf8',
    });
    expect(unsafe.status).not.toBe(0);
    expect(
      `${missing.stdout}${missing.stderr}${empty.stdout}${empty.stderr}${unsafe.stdout}${unsafe.stderr}`
    )
      .not.toContain('admin-test')
      .not.toContain('read-only-test');
  });

  it('wires only API, main and Stage 6 consumers to the healthy same-model service', () => {
    const dev = source('docker-compose.dev.yml');
    for (const name of ['api-dev', 'worker-dev', 'worker-stage6-dev']) {
      const block = serviceBlock(dev, name);
      expect(block).toContain('QDRANT_URL=http://qdrant-dev:6333');
      expect(block).toMatch(/qdrant-dev:\n\s+condition: service_healthy/);
    }
    const appApi = serviceBlock(source('docker-compose.app.yml'), 'api');
    expect(appApi).toContain('QDRANT_URL=http://qdrant:6333');
    expect(appApi).not.toContain('depends_on:\n      qdrant:');

    for (const file of ['docker-compose.infra.yml', 'docker-compose.production.yml']) {
      const compose = source(file);
      for (const name of file.includes('infra') ? ['worker'] : ['api', 'worker', 'worker-stage6']) {
        const block = serviceBlock(compose, name);
        expect(block).toContain('QDRANT_URL=http://qdrant:6333');
        expect(block).toMatch(/qdrant:\n\s+condition: service_healthy/);
      }
    }

    for (const file of COMPOSE_FILES) {
      const stage7 = serviceBlock(
        source(file),
        file === 'docker-compose.dev.yml' ? 'worker-stage7-dev' : 'worker-stage7'
      );
      if (!stage7) continue;
      expect(stage7).not.toMatch(/QDRANT|qdrant[_-].*secret|\n\s+qdrant:\s*$/i);
    }
  });

  it('maps staging S3 values without rendering credentials and keeps dev snapshots local', () => {
    const dev = serviceBlock(source('docker-compose.dev.yml'), 'qdrant-dev');
    expect(dev).toContain('QDRANT_SNAPSHOT_STORAGE=local');

    for (const file of ['docker-compose.infra.yml', 'docker-compose.production.yml']) {
      const block = serviceBlock(source(file), 'qdrant');
      expect(block).toContain('QDRANT_SNAPSHOT_STORAGE=s3');
      expect(block).toContain('QDRANT_S3_BUCKET=${QDRANT_S3_BUCKET}');
      expect(block).toContain('QDRANT_S3_REGION=${QDRANT_S3_REGION}');
      expect(block).toContain('QDRANT_S3_ENDPOINT_URL=${QDRANT_S3_ENDPOINT_URL:-}');
      expect(block).toContain('/run/secrets/qdrant_s3_access_key');
      expect(block).toContain('/run/secrets/qdrant_s3_secret_key');
      expect(block).not.toMatch(
        /QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__(ACCESS|SECRET)_KEY=/
      );
    }
  });

  it('gates every RAG-capable recreate before traffic or workers and redacts keys', () => {
    const dev = source('scripts/deploy_dev.sh');
    expect(dev).toContain('configured_path "$BASE_PATH/.env.dev" QDRANT_API_KEY_FILE');
    expect(dev).toContain('configured_path "$BASE_PATH/.env.dev" QDRANT_READ_ONLY_API_KEY_FILE');
    expectOrdered(dev, [
      '$DEV_COMPOSE up -d qdrant-dev',
      '\nqdrant_dev_gate\n',
      'up -d --force-recreate --no-deps "${CORE_SERVICES[@]}"',
    ]);
    expectOrdered(dev, [
      'Qdrant readiness endpoint',
      'Qdrant authenticated collections endpoint',
      'qdrant:verify',
      'up -d --force-recreate --no-deps "${CORE_SERVICES[@]}"',
      'up -d --force-recreate worker-dev worker-stage6-dev',
    ]);

    const staging = source('scripts/deploy_blue_green.sh');
    expect(staging).toContain('configured_path "$BASE_PATH/.env.$ENV" QDRANT_API_KEY_FILE');
    expect(staging).toContain(
      'configured_path "$BASE_PATH/.env.$ENV" QDRANT_READ_ONLY_API_KEY_FILE'
    );
    expectOrdered(staging, [
      '\n    qdrant_staging_gate\n',
      'up -d --force-recreate web api',
      'Switching traffic',
    ]);
    expectOrdered(staging, [
      'Qdrant readiness endpoint',
      'Qdrant authenticated collections endpoint',
      'qdrant:verify',
      'up -d --force-recreate web api',
      'Switching traffic',
      'up -d --force-recreate --no-deps "$SVC"',
    ]);
    for (const script of [dev, staging]) {
      expect(script).not.toMatch(/set\s+-[^\n]*x/);
      expect(script).not.toMatch(/echo[^\n]*(QDRANT_API_KEY|api-key:)/);
    }
  });

  it('documents self-hosted names, secret files, and snapshot storage without Cloud defaults', () => {
    for (const file of ['.env.production.example', 'packages/course-gen-platform/.env.example']) {
      const example = source(file);
      expect(example).not.toMatch(/QDRANT_URL=https?:\/\/[^\n]*(qdrant\.(io|cloud)|cloud)/i);
      expect(example).toContain('QDRANT_URL=http://qdrant:6333');
      expect(example).toContain('QDRANT_COLLECTION_NAME=course_embeddings');
      expect(example).toContain('QDRANT_PHYSICAL_COLLECTION_NAME=course_embeddings_v1');
      expect(example).toContain('QDRANT_API_KEY_FILE=');
      expect(example).toContain('QDRANT_READ_ONLY_API_KEY_FILE=');
      expect(example).toContain('QDRANT_S3_BUCKET=');
      expect(example).toContain('QDRANT_S3_REGION=');
      expect(example).toContain('QDRANT_S3_ENDPOINT_URL=');
      expect(example).toMatch(/external.*unsupported|unsupported.*external/i);
    }
  });

  it('keeps all four Compose models syntactically renderable', () => {
    const directory = mkdtempSync('/tmp/mc2-qdrant-compose-test-');
    temporaryDirectories.push(directory);
    const secretNames = [
      'qdrant_api_key',
      'qdrant_read_only_api_key',
      'qdrant_s3_access_key',
      'qdrant_s3_secret_key',
    ] as const;
    const secretValues = secretNames.map(name => `synthetic-${name}-value`);
    for (const [index, name] of secretNames.entries()) {
      writeFileSync(join(directory, name), `${secretValues[index]}\n`, { mode: 0o400 });
    }
    const envFile = join(directory, 'compose.env');
    writeFileSync(
      envFile,
      [
        `DEV_ENV_FILE=${envFile}`,
        `PRODUCTION_ENV_FILE=${envFile}`,
        `QDRANT_API_KEY_FILE=${join(directory, 'qdrant_api_key')}`,
        `QDRANT_READ_ONLY_API_KEY_FILE=${join(directory, 'qdrant_read_only_api_key')}`,
        `QDRANT_S3_ACCESS_KEY_FILE=${join(directory, 'qdrant_s3_access_key')}`,
        `QDRANT_S3_SECRET_KEY_FILE=${join(directory, 'qdrant_s3_secret_key')}`,
        'QDRANT_S3_BUCKET=synthetic-qdrant-snapshots',
        'QDRANT_S3_REGION=eu-test-1',
        'QDRANT_S3_ENDPOINT_URL=https://s3.example.invalid',
        `QDRANT_METRICS_TEXTFILE_HOST_DIR=${directory}`,
        'QDRANT_METRICS_GID=2001',
        'COLOR=blue',
        'WEB_PORT=3001',
        'API_PORT=4001',
        '',
      ].join('\n'),
      { mode: 0o600 }
    );

    for (const composeFile of COMPOSE_FILES) {
      const rendered = execFileSync(
        'docker',
        ['compose', '-f', composeFile, '--env-file', envFile, 'config'],
        { cwd: REPO_ROOT, encoding: 'utf8' }
      );
      for (const secretValue of secretValues) {
        expect(rendered).not.toContain(secretValue);
      }
      expect(() =>
        execFileSync(
          'docker',
          [
            'compose',
            '-f',
            composeFile,
            '--env-file',
            envFile,
            'config',
            '--no-env-resolution',
            '--quiet',
          ],
          { cwd: REPO_ROOT, stdio: 'pipe' }
        )
      ).not.toThrow();
    }
  });
});
