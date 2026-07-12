import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const ACTIVE_VALUES = [
  'DOCUMENT_EVIDENCE_ENABLED=true',
  'DOCUMENT_EVIDENCE_MODE=active',
  'DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100',
] as const;
const ACTIVE_VARIABLES = ACTIVE_VALUES.map(value => value.slice(0, value.indexOf('=')));

function source(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function serviceBlock(compose: string, service: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex(line => line === `  ${service}:`);
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-zA-Z0-9_-]+:$/.test(line));
  return start < 0 ? '' : lines.slice(start, end < 0 ? undefined : end).join('\n');
}

function composeEnvironmentEntries(block: string): Set<string> {
  return new Set(
    block
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^- [A-Z][A-Z0-9_]*=/.test(line))
      .map(line => line.slice(2))
  );
}

function packageEnvironmentEntries(environment: string): Set<string> {
  return new Set(
    environment
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
  );
}

describe('document evidence dev activation contract', () => {
  it('activates every eligible course coherently on both dev workers', () => {
    const dev = source('docker-compose.dev.yml');
    const packageEnvironment = source('packages/course-gen-platform/.env.example');

    for (const service of ['worker-dev', 'worker-stage6-dev']) {
      const entries = composeEnvironmentEntries(serviceBlock(dev, service));
      for (const value of ACTIVE_VALUES) expect(entries.has(value)).toBe(true);
    }
    const packageEntries = packageEnvironmentEntries(packageEnvironment);
    for (const value of ACTIVE_VALUES) expect(packageEntries.has(value)).toBe(true);
  });

  it('declares the approved staging target without hard-coding it in Compose', () => {
    const productionExampleEntries = source('.env.production.example')
      .split('\n')
      .map(line => line.trim())
      .filter(line => ACTIVE_VARIABLES.some(variable => line.startsWith(`${variable}=`)));

    expect(productionExampleEntries).toEqual(ACTIVE_VALUES);

    for (const path of [
      'docker-compose.infra.yml',
      'docker-compose.app.yml',
      'docker-compose.production.yml',
    ]) {
      const compose = source(path);

      expect(compose).toContain('${PRODUCTION_ENV_FILE:-.env.production}');
      for (const value of ACTIVE_VALUES) expect(compose).not.toContain(value);
    }
  });
});
