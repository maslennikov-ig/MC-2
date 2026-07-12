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
const deployScript = readFileSync(resolve(rootDir, 'scripts/deploy_blue_green.sh'), 'utf8');
const rollbackScript = readFileSync(resolve(rootDir, 'scripts/rollback_blue_green.sh'), 'utf8');

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

const stagingDeploy = jobs.deploy;
const copyDeploymentFiles = stagingDeploy?.steps?.find(
  step => step?.name === 'Copy deployment files'
)?.run;
const createProductionEnv = stagingDeploy?.steps?.find(
  step => step?.name === 'Create .env.production'
)?.run;

assert(copyDeploymentFiles, 'staging deploy must copy deployment files');
for (const requiredPath of [
  'deploy/qdrant',
  'deploy/systemd',
  'ops/qdrant',
]) {
  assert(
    copyDeploymentFiles.includes(requiredPath),
    `staging deploy package must include ${requiredPath}`
  );
}

assert(createProductionEnv, 'staging deploy must create .env.production');
for (const requiredLine of [
  'QDRANT_URL=http://qdrant:6333',
  'QDRANT_API_KEY_FILE=/opt/megacampus/secrets/qdrant_api_key',
  'QDRANT_READ_ONLY_API_KEY_FILE=/opt/megacampus/secrets/qdrant_read_only_api_key',
  'QDRANT_S3_BUCKET=${{ secrets.QDRANT_S3_BUCKET }}',
  'QDRANT_S3_REGION=${{ secrets.QDRANT_S3_REGION }}',
  'QDRANT_S3_ENDPOINT_URL=${{ secrets.QDRANT_S3_ENDPOINT_URL }}',
  'QDRANT_METRICS_TEXTFILE_HOST_DIR=/var/lib/megacampus/qdrant-metrics',
  'DOCUMENT_EVIDENCE_ENABLED=true',
  'DOCUMENT_EVIDENCE_MODE=active',
  'DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100',
]) {
  assert(
    createProductionEnv.includes(requiredLine),
    `staging production env must include ${requiredLine}`
  );
}
assert(
  !createProductionEnv.includes('QDRANT_URL=${{ secrets.QDRANT_URL }}'),
  'staging deploy must not restore the retired Qdrant Cloud URL'
);

for (const service of ['qdrant', 'prometheus', 'grafana']) {
  assert(
    new RegExp(`\\b${service}\\b`).test(
      deployScript.match(/up -d redis[\s\S]*?\necho "   Infrastructure ready\."/)?.[0] ?? ''
    ),
    `staging infrastructure startup must include ${service}`
  );
}

for (const line of deployScript.split('\n')) {
  if (line.includes('docker compose -f "$INFRA_COMPOSE"')) {
    assert(
      line.includes('--env-file "$BASE_PATH/.env.$ENV"'),
      'every staging infra update must use the production env file'
    );
  }
}
assert(
  rollbackScript.includes(
    'docker compose -f "$BASE_PATH/docker-compose.infra.yml" --env-file "$BASE_PATH/.env.$ENV" up -d'
  ),
  'rollback infra startup must use the selected environment file'
);
assert(
  rollbackScript.includes('PRODUCTION_ENV_FILE="$BASE_PATH/.env.$TARGET_COLOR"') &&
    rollbackScript.includes(
      'docker compose -f "$BASE_PATH/docker-compose.production.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate --no-deps worker worker-stage6'
    ),
  'rollback must recreate main and Stage 6 workers with the target color environment'
);

console.log('CI/CD workflow deploy gate test passed');
