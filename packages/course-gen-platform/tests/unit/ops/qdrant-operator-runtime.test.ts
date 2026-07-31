import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const ENTRYPOINT = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
);

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

function runEntrypoint(
  args: string[],
  env: Record<string, string | undefined> = {}
): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [ENTRYPOINT, ...args], {
    env: {
      PATH: process.env.PATH,
      QDRANT_COLLECTION_NAME: 'course_embeddings',
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('Q12 reproducible Qdrant operator runtime', () => {
  it('builds a distinct operator target from the proven production runner', () => {
    const dockerfile = source('packages/course-gen-platform/Dockerfile');

    expect(dockerfile).toContain('FROM runner AS qdrant-operator');
    expect(dockerfile).toContain('RUN npm install -g tsx@4.21.0');
    expect(dockerfile).toContain(
      'COPY --from=builder --chown=nodejs:nodejs /app/packages/course-gen-platform/src ./src'
    );
    expect(dockerfile).toContain(
      'COPY --from=builder --chown=nodejs:nodejs /app/packages/course-gen-platform/tools ./tools'
    );
    expect(dockerfile).toContain(
      'COPY packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh /opt/megacampus/qdrant-operator-entrypoint.sh'
    );
    expect(dockerfile).toContain(
      'ENTRYPOINT ["/usr/bin/dumb-init", "--", "/opt/megacampus/qdrant-operator-entrypoint.sh"]'
    );
    expect(dockerfile).toContain('CMD ["--help"]');
    expect(dockerfile).toContain('qdrant-operator-entrypoint.sh self-check');
    expect(dockerfile).not.toMatch(/^ARG\s+.*(?:API_KEY|SECRET|TOKEN|PASSWORD)/mu);
    expect(dockerfile).not.toMatch(/^ENV\s+QDRANT_API_KEY=/mu);
    expect(dockerfile).not.toMatch(/^ENV\s+.*(?:SECRET|TOKEN|PASSWORD)=/mu);
  });

  it('documents every approved command without loading credentials', () => {
    const result = runEntrypoint(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('bootstrap');
    expect(result.stdout).toContain('verify');
    expect(result.stdout).toContain('reindex plan|execute|verify');
    expect(result.stdout).toContain('snapshot');
    expect(result.stdout).toContain('restore-drill');
    expect(result.stdout).toContain('reindex-worker');
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/api.?key|secret value/i);
  });

  it('fails closed for the live queue, the logical alias, and a wrong source root', () => {
    const liveQueue = runEntrypoint(
      ['reindex', 'execute', '--target-collection', 'course_embeddings_v1'],
      {
        BULLMQ_QUEUE_NAME: 'course-generation',
        DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
        QDRANT_URL: 'http://qdrant:6333',
      }
    );
    expect(liveQueue.status).not.toBe(0);
    expect(liveQueue.stderr).toContain('dedicated qdrant-reindex-<uuid> queue');

    const alias = runEntrypoint(
      ['reindex', 'execute', '--target-collection', 'course_embeddings'],
      {
        BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
        DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
        QDRANT_URL: 'http://qdrant:6333',
      }
    );
    expect(alias.status).not.toBe(0);
    expect(alias.stderr).toContain('physical collection, not the stable alias');

    const sourceRoot = runEntrypoint(
      ['reindex', 'execute', '--target-collection', 'course_embeddings_v1'],
      {
        BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
        DOCLING_UPLOADS_BASE_PATH: '/app',
        QDRANT_URL: 'http://qdrant:6333',
      }
    );
    expect(sourceRoot.status).not.toBe(0);
    expect(sourceRoot.stderr).toContain(
      'DOCLING_UPLOADS_BASE_PATH must equal /opt/megacampus/data'
    );
  });

  it('refuses a reindex worker unless its queue, source root, and Qdrant URL are isolated', () => {
    const cases = [
      [
        {
          BULLMQ_QUEUE_NAME: 'course-generation',
          DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
          QDRANT_URL: 'http://qdrant:6333',
        },
        'dedicated qdrant-reindex-<uuid> queue',
      ],
      [
        {
          BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
          DOCLING_UPLOADS_BASE_PATH: '/app',
          QDRANT_URL: 'http://qdrant:6333',
        },
        'DOCLING_UPLOADS_BASE_PATH must equal /opt/megacampus/data',
      ],
      [
        {
          BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
          DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
          QDRANT_URL: 'https://retired.example.invalid',
        },
        'QDRANT_URL must equal http://qdrant:6333',
      ],
      [
        {
          BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
          DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
          QDRANT_URL: 'http://qdrant:6333',
        },
        'QDRANT_REINDEX_TARGET_COLLECTION must name an explicit physical collection',
      ],
      [
        {
          BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
          DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
          QDRANT_URL: 'http://qdrant:6333',
          QDRANT_REINDEX_TARGET_COLLECTION: 'course_embeddings',
        },
        'QDRANT_REINDEX_TARGET_COLLECTION must not equal the stable alias',
      ],
    ] as const;

    for (const [env, message] of cases) {
      const result = runEntrypoint(['reindex-worker'], env);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
    }
  });

  it('requires a durable run-bound artifact path before reindex execution', () => {
    const baseEnv = {
      BULLMQ_QUEUE_NAME: 'qdrant-reindex-123e4567-e89b-42d3-a456-426614174000',
      DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
      QDRANT_URL: 'http://qdrant:6333',
    };
    const missingRun = runEntrypoint(
      ['reindex', 'execute', '--target-collection', 'course_embeddings_v2'],
      baseEnv
    );
    expect(missingRun.status).not.toBe(0);
    expect(missingRun.stderr).toContain('--run-id must be an explicit UUIDv4');

    const wrongArtifact = runEntrypoint(
      [
        'reindex',
        'execute',
        '--target-collection',
        'course_embeddings_v2',
        '--run-id',
        '123e4567-e89b-42d3-a456-426614174000',
        '--artifact',
        '/app/reindex.json',
      ],
      baseEnv
    );
    expect(wrongArtifact.status).not.toBe(0);
    expect(wrongArtifact.stderr).toContain(
      '--artifact must equal /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json'
    );
  });

  // Recovery-bound verify reads the SAME durable artifact execute wrote, so it needs the same
  // pinning. It did not have it: on 2026-07-31 a 234/234 execute verified only after --artifact was
  // supplied by hand, because verify fell back to the tool's relative default inside a --rm
  // container that no longer existed.
  it('requires the same durable run-bound artifact path before reindex verify', () => {
    const baseEnv = {
      DOCLING_UPLOADS_BASE_PATH: '/opt/megacampus/data',
      QDRANT_URL: 'http://qdrant:6333',
    };
    const missingRun = runEntrypoint(
      ['reindex', 'verify', '--target-collection', 'course_embeddings_v2'],
      baseEnv
    );
    expect(missingRun.status).not.toBe(0);
    expect(missingRun.stderr).toContain('--run-id must be an explicit UUIDv4');

    const wrongArtifact = runEntrypoint(
      [
        'reindex',
        'verify',
        '--target-collection',
        'course_embeddings_v2',
        '--run-id',
        '123e4567-e89b-42d3-a456-426614174000',
        '--artifact',
        '/app/reindex.json',
      ],
      baseEnv
    );
    expect(wrongArtifact.status).not.toBe(0);
    expect(wrongArtifact.stderr).toContain(
      '--artifact must equal /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json'
    );
  });

  it('requires exact root-owned mode-0400 input secrets', () => {
    const directory = mkdtempSync('/tmp/mc2-q12o-secret-');
    const secret = resolve(directory, 'qdrant_api_key');
    writeFileSync(secret, 'synthetic-only', { mode: 0o400 });
    chmodSync(secret, 0o400);
    try {
      const result = runEntrypoint(['snapshot'], {
        QDRANT_API_KEY_FILE: secret,
        QDRANT_URL: 'http://qdrant:6333',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('must be root:root mode 0400');
      expect(`${result.stdout}${result.stderr}`).not.toContain('synthetic-only');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a malformed operator digest before Docker Compose runs', () => {
    const wrapper = resolve(REPO_ROOT, 'deploy/qdrant/operator-compose.sh');
    const result = spawnSync('bash', [wrapper, 'config', '--quiet'], {
      env: {
        PATH: process.env.PATH,
        QDRANT_OPERATOR_IMAGE_SHA256: 'latest',
      },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'QDRANT_OPERATOR_IMAGE_SHA256 must be exactly 64 lowercase hexadecimal characters'
    );
    expect(result.stderr).not.toMatch(/docker daemon|cannot connect/iu);
  });

  it('stages every root-owned restore input for the non-root tool process', () => {
    const entrypoint = source('packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh');

    expect(entrypoint).toContain('stage_owner_only_file()');
    expect(entrypoint).toContain(
      'stage_owner_only_file "$QDRANT_SNAPSHOT_MANIFEST_FILE" "$STAGED_MANIFEST_FILE"'
    );
    expect(entrypoint).toContain(
      'stage_owner_only_file "$QDRANT_RECOVERY_PROBE_FILE" "$STAGED_PROBE_FILE"'
    );
    expect(entrypoint).toContain('export QDRANT_SNAPSHOT_MANIFEST_FILE="$STAGED_MANIFEST_FILE"');
    expect(entrypoint).toContain('export QDRANT_RECOVERY_PROBE_FILE="$STAGED_PROBE_FILE"');
  });

  it('keeps operator services profile-only, non-public, immutable, and file-secret-backed', () => {
    const compose = source('docker-compose.infra.yml');
    const operator = serviceBlock(compose, 'qdrant-operator');
    const recovery = serviceBlock(compose, 'qdrant-recovery-operator');
    const restore = serviceBlock(compose, 'qdrant-restore-operator');

    for (const block of [operator, recovery, restore]) {
      expect(block).toContain(
        'image: ghcr.io/maslennikov-ig/mc-2/qdrant-operator@sha256:${QDRANT_OPERATOR_IMAGE_SHA256:?QDRANT_OPERATOR_IMAGE_SHA256 must be the 64-character release digest}'
      );
      expect(block).toContain("profiles: ['operator']");
      expect(block).toContain('pull_policy: never');
      expect(block).toContain("user: '0:0'");
      expect(block).toContain('read_only: true');
      expect(block).toContain('cap_drop:');
      expect(block).toContain('cap_add:');
      expect(block).toContain('- CHOWN');
      expect(block).toContain('- SETGID');
      expect(block).toContain('- SETUID');
      expect(block).toContain('QDRANT_URL=http://qdrant:6333');
      expect(block).toContain('QDRANT_API_KEY_FILE=/run/secrets/qdrant_api_key');
      expect(block).toContain('qdrant_api_key');
      expect(block).not.toContain('ports:');
      expect(block).not.toMatch(/latest/i);
      expect(block).toContain('QDRANT_RECOVERY_LOCK_HELD=0');
      expect(block).toContain(
        'QDRANT_RECOVERY_LOCK_PATH=/var/lib/megacampus-qdrant-recovery/recovery.lock'
      );
    }

    expect(operator).toContain('DOCLING_UPLOADS_BASE_PATH=/opt/megacampus/data');
    expect(operator).toContain('/opt/megacampus/data/uploads:ro');
    expect(operator).toContain('BULLMQ_QUEUE_NAME=qdrant-reindex-disabled');
    expect(operator).toContain('QDRANT_REINDEX_TARGET_COLLECTION=');
    expect(operator).toContain('WORKER_CONCURRENCY=2');
    expect(operator).toContain('QDRANT_API_KEY=');

    expect(recovery).not.toContain('env_file:');
    expect(restore).not.toContain('env_file:');
    expect(restore).toContain('QDRANT_SNAPSHOT_MANIFEST_FILE=/run/secrets/snapshot_manifest');
    expect(restore).toContain('QDRANT_RECOVERY_PROBE_FILE=/run/secrets/recovery_probe');
    expect(restore).toContain('snapshot_manifest');
    expect(restore).toContain('recovery_probe');

    const entrypoint = source('packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh');
    expect(entrypoint).toContain("[[ $identity == '0:0:400' ]]");
    expect(entrypoint).toContain('metrics-check)');

    const wrapper = source('deploy/qdrant/operator-compose.sh');
    expect(wrapper).toContain('^[0-9a-f]{64}$');
    expect(wrapper).toContain('exec /usr/bin/docker compose');
  });
});
