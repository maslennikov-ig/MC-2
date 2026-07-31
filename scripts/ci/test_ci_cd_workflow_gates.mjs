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
const appCompose = readFileSync(resolve(rootDir, 'docker-compose.app.yml'), 'utf8');
const productionCompose = readFileSync(resolve(rootDir, 'docker-compose.production.yml'), 'utf8');

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

const deployContractStep = jobs.lint?.steps?.find(
  step => step?.name === 'Verify deploy contracts'
)?.run;
for (const contractCommand of [
  'node scripts/ci/test_ci_cd_workflow_gates.mjs',
  'bash scripts/ci/test_detect_deploy_changes.sh',
  'bash scripts/ci/test_blue_green_fail_closed.sh',
]) {
  assert(
    deployContractStep?.includes(contractCommand),
    `CI lint job must run deploy contract: ${contractCommand}`
  );
}

for (const jobName of ['deploy', 'deploy-dev']) {
  const job = jobs[jobName];
  const condition = job?.if ?? '';

  assert(job, `${jobName} job must exist`);
  assert(needsList(job).includes('ci-success'), `${jobName} must depend on ci-success`);
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
const createQdrantSecretsStep = stagingDeploy?.steps?.find(
  step => step?.name === 'Create Qdrant secret files'
);
const createQdrantSecrets = createQdrantSecretsStep?.run;
const cleanupQdrantSecretsStep = stagingDeploy?.steps?.find(
  step => step?.name === 'Cleanup Qdrant secret upload'
);
const deployCommand = stagingDeploy?.steps?.find(step => step?.name === 'Deploy')?.run;
const verifyDeployment = stagingDeploy?.steps?.find(
  step => step?.name === 'Verify deployment'
)?.run;
const rollbackCommand = jobs.rollback?.steps?.find(step => step?.name === 'Execute rollback')?.run;

assert(copyDeploymentFiles, 'staging deploy must copy deployment files');
for (const requiredPath of ['deploy/qdrant', 'deploy/systemd', 'ops/qdrant']) {
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
  'QDRANT_SNAPSHOT_STORAGE_MODE=local',
  'PROMETHEUS_QDRANT_READ_ONLY_API_KEY_FILE=/opt/megacampus/secrets/prometheus_qdrant_read_only_api_key',
  'GRAFANA_ADMIN_PASSWORD_FILE=/opt/megacampus/secrets/grafana_admin_password',
  'ALERTMANAGER_TELEGRAM_BOT_TOKEN_FILE=/opt/megacampus/secrets/alertmanager_telegram_bot_token',
  'ALERTMANAGER_TELEGRAM_CHAT_ID_FILE=/opt/megacampus/secrets/alertmanager_telegram_chat_id',
  'QDRANT_METRICS_TEXTFILE_HOST_DIR=/var/lib/megacampus/qdrant-metrics',
  'QDRANT_METRICS_GID=${{ secrets.QDRANT_METRICS_GID }}',
  'DOCUMENT_EVIDENCE_ENABLED=true',
  'DOCUMENT_EVIDENCE_MODE=active',
  'DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100',
]) {
  assert(
    createProductionEnv.includes(requiredLine),
    `staging production env must include ${requiredLine}`
  );
}
assert(createQdrantSecrets, 'staging deploy must materialize Qdrant secret files');
for (const sharedSecret of [
  'QDRANT_API_KEY',
  'QDRANT_READ_ONLY_API_KEY',
  'GRAFANA_ADMIN_PASSWORD',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
]) {
  assert(
    createQdrantSecretsStep?.env?.[sharedSecret] === `\${{ secrets.${sharedSecret} }}`,
    `staging secret materialization must use GitHub ${sharedSecret}`
  );
}
for (const forbiddenS3Input of [
  'QDRANT_S3_BUCKET',
  'QDRANT_S3_REGION',
  'QDRANT_S3_ENDPOINT_URL',
  'QDRANT_S3_ACCESS_KEY',
  'QDRANT_S3_SECRET_KEY',
]) {
  assert(
    !createProductionEnv.includes(forbiddenS3Input) &&
      !createQdrantSecrets.includes(forbiddenS3Input),
    `local staging snapshot mode must not require ${forbiddenS3Input}`
  );
}
assert(
  createQdrantSecrets.includes('sudo install -o 0 -g 0 -m 0400') &&
    createQdrantSecrets.includes('sudo install -o 65534 -g 65534 -m 0400') &&
    createQdrantSecrets.includes('sudo install -o 472 -g 472 -m 0400'),
  'staging secret files must be owner-only for their exact container consumers'
);
assert(
  workflow.jobs?.['build-docker']?.steps?.find(step => step?.name?.startsWith('Build and push'))
    ?.with?.target === '${{ matrix.target }}',
  'Docker matrix builds must honor the qdrant-operator target'
);
assert(
  cleanupQdrantSecretsStep?.if === 'always()' &&
    cleanupQdrantSecretsStep?.run?.includes('.qdrant-secrets-${{ github.run_id }}'),
  'workflow must retry remote plaintext upload cleanup after secret-step failure or cancellation'
);
assert(
  createQdrantSecrets.includes("trap 'rm -rf") && createQdrantSecrets.includes("' EXIT"),
  'remote secret upload directory must be removed on both success and failure'
);
for (const requiredFile of [
  'prometheus_qdrant_read_only_api_key',
  'grafana_admin_password',
  'alertmanager_telegram_bot_token',
  'alertmanager_telegram_chat_id',
]) {
  assert(
    createQdrantSecrets.includes(requiredFile),
    `staging monitoring secret materialization must include ${requiredFile}`
  );
}
assert(
  rollbackCommand?.includes("grep -Eq '^status=(switched|accepted)$'") &&
    rollbackCommand.includes("grep -qx 'commit=${{ github.sha }}'") &&
    rollbackCommand.includes('rollback_blue_green.sh production ${{ github.sha }}'),
  'workflow rollback must run only for the current release after its transaction switched traffic'
);
assert(
  !createProductionEnv.includes('QDRANT_URL=${{ secrets.QDRANT_URL }}'),
  'staging deploy must not restore the retired Qdrant Cloud URL'
);

assert(
  workflow.jobs?.['build-docker']?.steps
    ?.find(step => step?.name === 'Extract metadata')
    ?.with?.tags?.includes('type=raw,value=${{ github.sha }}'),
  'application images must publish a full commit SHA tag'
);
assert(
  deployCommand?.includes('deploy_blue_green.sh production ${{ github.sha }}'),
  'staging deploy must request the immutable commit image tag'
);
assert(
  verifyDeployment?.includes('status=accepted') &&
    verifyDeployment.includes('/opt/megacampus/deploy_state'),
  'successful external verification must accept the rollback transaction marker'
);
assert(
  appCompose.includes('image: ${WEB_IMAGE:?WEB_IMAGE must be an immutable image reference}') &&
    appCompose.includes('image: ${API_IMAGE:?API_IMAGE must be an immutable image reference}'),
  'blue/green application compose must require immutable image references'
);
assert(
  productionCompose.includes('image: ${API_IMAGE:?API_IMAGE must be an immutable image reference}'),
  'API-backed worker compose must require the same immutable API image'
);
for (const requiredGuard of [
  'TAG must be an immutable commit tag',
  'resolve_repo_digest',
  'WEB_IMAGE=',
  'API_IMAGE=',
  'write_deploy_state preparing',
  'write_deploy_state switched',
  'write_color_env "$CURRENT_COLOR"',
  'write_color_env "$NEW_COLOR"',
  'if [ "$APP_DEPLOY_NEEDED" = "true" ]; then',
  'OPERATOR_REPOSITORY="ghcr.io/maslennikov-ig/mc-2/qdrant-operator"',
  'QDRANT_OPERATOR_IMAGE_SHA256',
]) {
  assert(
    deployScript.includes(requiredGuard),
    `deploy script must include immutable rollback guard: ${requiredGuard}`
  );
}
// The Q12 handoff mode (prepare-quiesced) also brings up shared infrastructure
// earlier in the file, consuming the operator digest already persisted to
// .env by a prior main-flow deploy. Scope this ordering check to the main
// blue/green flow (after "# 1. Determine Active Color"), which is the path that
// actually resolves and persists the digest, so the earlier Q12-mode occurrence
// does not produce a false position mismatch.
const mainDeployFlowStart = deployScript.indexOf('# 1. Determine Active Color');
assert(
  mainDeployFlowStart !== -1,
  'deploy script must contain the main blue/green flow marker "# 1. Determine Active Color"'
);
assert(
  deployScript.indexOf('QDRANT_OPERATOR_IMAGE_SHA256', mainDeployFlowStart) <
    deployScript.indexOf('up -d redis qdrant prometheus grafana', mainDeployFlowStart),
  'operator image digest must be resolved and persisted before infrastructure Compose starts'
);
assert(
  deployScript.indexOf('write_deploy_state preparing') <
    deployScript.indexOf('OPERATOR_IMAGE="$(resolve_repo_digest'),
  'app/config deploy transaction must enter preparing before operator image resolution'
);
const appSwitchSection = deployScript.slice(
  deployScript.indexOf(
    'if [ "$APP_DEPLOY_NEEDED" = "true" ]; then',
    deployScript.indexOf('# 4. Ensure Infrastructure')
  ),
  deployScript.indexOf('# 12. Update Workers')
);
assert(
  appSwitchSection.includes('if [ "$APP_DEPLOY_NEEDED" = "true" ]; then') &&
    appSwitchSection.includes('write_color_env "$CURRENT_COLOR"') &&
    appSwitchSection.includes('write_color_env "$NEW_COLOR"'),
  'color environment snapshots must be rewritten only inside an actual app switch'
);
const workerSection = deployScript.slice(deployScript.indexOf('# 12. Update Workers'));
assert(
  workerSection.includes('if [ "$APP_DEPLOY_NEEDED" = "true" ]; then') &&
    workerSection.includes('WORKER_ENV_FILE="$BASE_PATH/.env.$WORKER_COLOR"'),
  'every app switch, including web-only, must recreate workers with the active color env'
);
for (const requiredGuard of [
  'status=switched',
  'active color does not match the switched deployment',
  'WEB_IMAGE',
  'API_IMAGE',
  'ghcr.io/maslennikov-ig/mc-2/web',
  'ghcr.io/maslennikov-ig/mc-2/api',
]) {
  assert(
    rollbackScript.includes(requiredGuard),
    `rollback script must fail closed with guard: ${requiredGuard}`
  );
}

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
      'docker compose -p megacampus -f "$BASE_PATH/docker-compose.production.yml" --env-file "$BASE_PATH/.env.$TARGET_COLOR" up -d --force-recreate --no-deps worker worker-stage6'
    ),
  'rollback must recreate main and Stage 6 workers with the target color environment'
);
// The colour env files set COMPOSE_PROJECT_NAME=megacampus-<colour>, but the workers carry fixed
// container_names in the single `megacampus` project — they are not colour-scoped. Without -p the
// 2026-07-30 deploy AND its rollback both died on "container name is already in use", which is the
// worst combination: a half-applied deploy with no way back. Assert the pinning everywhere it is
// load-bearing, so the literal above cannot be "fixed" by dropping it again.
for (const [label, script] of [
  ['deploy', deployScript],
  ['rollback', rollbackScript],
]) {
  for (const line of script.split('\n')) {
    if (!line.includes('docker compose')) continue;
    // The worker compose is named literally in the rollback and through WORKER_COMPOSE /
    // Q12_WORKER_COMPOSE in the deploy; catch both, or this guard silently covers only half of it.
    const isWorkerCompose =
      line.includes('docker-compose.production.yml') || /\$\{?Q12_WORKER_COMPOSE|\$\{?WORKER_COMPOSE/.test(line);
    if (!isWorkerCompose) continue;
    assert(
      line.includes('docker compose -p megacampus '),
      `${label} must pin the worker compose to the megacampus project, not the colour one: ${line.trim()}`
    );
  }
}

console.log('CI/CD workflow deploy gate test passed');
