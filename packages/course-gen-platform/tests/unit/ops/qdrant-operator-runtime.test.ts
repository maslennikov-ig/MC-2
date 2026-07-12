import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  const end = lines.findIndex(
    (line, index) => index > start && /^ {2}[a-zA-Z0-9_-]+:$/.test(line)
  );
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
    ] as const;

    for (const [env, message] of cases) {
      const result = runEntrypoint(['reindex-worker'], env);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
    }
  });

  it('stages every root-owned restore input for the non-root tool process', () => {
    const entrypoint = source(
      'packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh'
    );

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
        'image: ${QDRANT_OPERATOR_IMAGE:?QDRANT_OPERATOR_IMAGE must be a release SHA or digest}'
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
    }

    expect(operator).toContain('DOCLING_UPLOADS_BASE_PATH=/opt/megacampus/data');
    expect(operator).toContain('/opt/megacampus/data/uploads:ro');
    expect(operator).toContain('BULLMQ_QUEUE_NAME=qdrant-reindex-disabled');
    expect(operator).toContain('WORKER_CONCURRENCY=2');
    expect(operator).toContain('QDRANT_API_KEY=');

    expect(recovery).not.toContain('env_file:');
    expect(restore).not.toContain('env_file:');
    expect(restore).toContain('QDRANT_SNAPSHOT_MANIFEST_FILE=/run/secrets/snapshot_manifest');
    expect(restore).toContain('QDRANT_RECOVERY_PROBE_FILE=/run/secrets/recovery_probe');
    expect(restore).toContain('snapshot_manifest');
    expect(restore).toContain('recovery_probe');
  });
});
