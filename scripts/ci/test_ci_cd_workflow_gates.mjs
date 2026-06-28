#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromBackend = createRequire(
  resolve(rootDir, 'packages/course-gen-platform/package.json')
);
const yaml = requireFromBackend('js-yaml');

const workflowPath = resolve(rootDir, '.github/workflows/ci-cd.yml');
const workflow = yaml.load(readFileSync(workflowPath, 'utf8'));
const jobs = workflow?.jobs ?? {};

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function needsList(job) {
  if (!job?.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

for (const jobName of ['deploy', 'deploy-dev']) {
  const job = jobs[jobName];
  const condition = job?.if ?? '';

  assert(job, `${jobName} job must exist`);
  assert(
    needsList(job).includes('ci-success'),
    `${jobName} must depend on ci-success`
  );
  assert(
    condition.includes("needs.ci-success.result == 'success'"),
    `${jobName} must require ci-success to pass`
  );
  assert(
    condition.includes(
      "(needs.build-docker.result == 'skipped' && needs.changes.outputs.should_build_docker != 'true')"
    ),
    `${jobName} must allow skipped build-docker only when Docker was not required`
  );
}

console.log('CI/CD workflow deploy gate test passed');
