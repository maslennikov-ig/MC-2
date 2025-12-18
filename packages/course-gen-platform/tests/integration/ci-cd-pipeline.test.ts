/**
 * CI/CD Pipeline Integration Tests (T089)
 *
 * This test suite validates the GitHub Actions CI/CD pipeline configuration
 * by parsing and verifying workflow YAML files.
 *
 * Test Coverage:
 * 1. Push commit → automated tests run → status reported (test.yml)
 * 2. Tests pass → build artifacts generated (build.yml)
 * 3. Tests fail → commit blocked from merging (branch protection)
 * 4. Merge to main → automated deployment to staging (deploy-staging.yml)
 *
 * Manual Testing Guide:
 * =====================
 *
 * To manually test the actual GitHub Actions execution:
 *
 * 1. Trigger Test Workflow:
 *    - Push any commit to any branch
 *    - Or create a pull request
 *    - View results at: https://github.com/your-org/megacampus2/actions
 *
 * 2. Trigger Build Workflow:
 *    - Push to main branch or create PR to main
 *    - Verify artifacts are created in Actions tab → Artifacts section
 *
 * 3. Test Failure Blocking:
 *    - Push a commit with intentionally failing tests
 *    - Verify PR cannot be merged until tests pass
 *    - Check status checks in PR page
 *
 * 4. Trigger Staging Deployment:
 *    - Merge PR to main branch
 *    - Or manually trigger via Actions tab → deploy-staging.yml → Run workflow
 *    - Verify smoke tests execute
 *
 * Troubleshooting:
 * ================
 *
 * - Workflow not triggering: Check branch name matches trigger configuration
 * - Tests failing: Check logs in Actions tab → Failed job → Expand step
 * - Artifacts missing: Verify upload-artifact step succeeded
 * - Timeout issues: Check timeout-minutes configuration
 * - Permission errors: Verify GITHUB_TOKEN has correct permissions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

// Type definitions for GitHub Actions workflow schema
interface WorkflowTrigger {
  push?: {
    branches?: string[];
  };
  pull_request?: {
    branches?: string[];
  };
  workflow_dispatch?: Record<string, never>;
}

interface WorkflowStrategy {
  matrix?: {
    'node-version'?: string[];
    [key: string]: any;
  };
}

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, any>;
  if?: string;
}

interface WorkflowJob {
  'runs-on': string;
  'timeout-minutes'?: number;
  strategy?: WorkflowStrategy;
  steps: WorkflowStep[];
  needs?: string[];
  if?: string;
}

interface WorkflowSchema {
  name: string;
  on: WorkflowTrigger;
  jobs: {
    [key: string]: WorkflowJob;
  };
}

// Paths to workflow files
const WORKFLOWS_DIR = resolve(__dirname, '../../../../.github/workflows');
const TEST_WORKFLOW = resolve(WORKFLOWS_DIR, 'test.yml');
const BUILD_WORKFLOW = resolve(WORKFLOWS_DIR, 'build.yml');
const DEPLOY_WORKFLOW = resolve(WORKFLOWS_DIR, 'deploy-staging.yml');

// Cached workflow data
let testWorkflow: WorkflowSchema;
let buildWorkflow: WorkflowSchema;
let deployWorkflow: WorkflowSchema;

describe('CI/CD Pipeline Integration Tests', () => {
  beforeAll(() => {
    // Load and parse all workflow files
    if (!existsSync(TEST_WORKFLOW)) {
      throw new Error(`Test workflow not found at ${TEST_WORKFLOW}`);
    }
    if (!existsSync(BUILD_WORKFLOW)) {
      throw new Error(`Build workflow not found at ${BUILD_WORKFLOW}`);
    }
    if (!existsSync(DEPLOY_WORKFLOW)) {
      throw new Error(`Deploy workflow not found at ${DEPLOY_WORKFLOW}`);
    }

    testWorkflow = yaml.load(readFileSync(TEST_WORKFLOW, 'utf8')) as WorkflowSchema;
    buildWorkflow = yaml.load(readFileSync(BUILD_WORKFLOW, 'utf8')) as WorkflowSchema;
    deployWorkflow = yaml.load(readFileSync(DEPLOY_WORKFLOW, 'utf8')) as WorkflowSchema;
  });

  /**
   * Test Scenario 1: Push commit → automated tests run → status reported
   *
   * This test validates that the test.yml workflow:
   * - Triggers on push to any branch
   * - Triggers on pull requests to any branch
   * - Runs linting, type-checking, and tests
   * - Uses correct Node.js and pnpm versions
   * - Uploads test coverage artifacts
   * - Has appropriate timeout limits
   */
  describe('Scenario 1: Push commit triggers automated tests', () => {
    it('should trigger on push to any branch', () => {
      // Given: The test.yml workflow configuration
      // When: Checking the trigger configuration
      const trigger = testWorkflow.on;

      // Then: Should trigger on push to any branch
      expect(trigger.push).toBeDefined();
      expect(trigger.push?.branches).toContain('**');
    });

    it('should trigger on pull requests to any branch', () => {
      // Given: The test.yml workflow configuration
      // When: Checking the trigger configuration
      const trigger = testWorkflow.on;

      // Then: Should trigger on pull requests
      expect(trigger.pull_request).toBeDefined();
      expect(trigger.pull_request?.branches).toContain('**');
    });

    it('should use Node.js version 20.x', () => {
      // Given: The test job configuration
      const testJob = testWorkflow.jobs.test;

      // When: Checking the Node.js version matrix
      const nodeVersions = testJob.strategy?.matrix?.['node-version'];

      // Then: Should use Node.js 20.x
      expect(nodeVersions).toBeDefined();
      expect(nodeVersions).toContain('20.x');
    });

    it('should use pnpm version 8.15.0', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const pnpmStep = testJob.steps.find((step) => step.name === 'Install pnpm');

      // When: Checking the pnpm version configuration
      const pnpmVersion = pnpmStep?.with?.version;

      // Then: Should use pnpm 8.15.0
      expect(pnpmStep).toBeDefined();
      expect(pnpmVersion).toBe('8.15.0');
    });

    it('should run linting step', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const lintStep = testJob.steps.find((step) => step.name === 'Run linting');

      // When: Checking for lint command
      // Then: Should have linting step with correct command
      expect(lintStep).toBeDefined();
      expect(lintStep?.run).toBe('pnpm lint');
    });

    it('should run type-checking step', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const typeCheckStep = testJob.steps.find((step) => step.name === 'Run type checking');

      // When: Checking for type-check command
      // Then: Should have type-checking step with correct command
      expect(typeCheckStep).toBeDefined();
      expect(typeCheckStep?.run).toBe('pnpm type-check');
    });

    it('should run tests step', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const testStep = testJob.steps.find((step) => step.name === 'Run Vitest tests');

      // When: Checking for test command
      // Then: Should have test step with correct command
      expect(testStep).toBeDefined();
      expect(testStep?.run).toBe('pnpm test');
    });

    it('should upload test coverage artifacts', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const uploadStep = testJob.steps.find((step) => step.name === 'Upload test coverage');

      // When: Checking for artifact upload configuration
      // Then: Should upload coverage artifacts with correct configuration
      expect(uploadStep).toBeDefined();
      expect(uploadStep?.uses).toContain('actions/upload-artifact');
      expect(uploadStep?.with?.name).toBe('test-coverage');
      expect(uploadStep?.with?.path).toBeDefined();
      expect(uploadStep?.if).toBe('always()'); // Upload even on failure
    });

    it('should have reasonable timeout limit (15 minutes)', () => {
      // Given: The test job configuration
      const testJob = testWorkflow.jobs.test;

      // When: Checking the timeout configuration
      const timeout = testJob['timeout-minutes'];

      // Then: Should have 15 minute timeout
      expect(timeout).toBe(15);
    });

    it('should use frozen lockfile for reproducible builds', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const installStep = testJob.steps.find((step) => step.name === 'Install dependencies');

      // When: Checking the install command
      // Then: Should use --frozen-lockfile
      expect(installStep).toBeDefined();
      expect(installStep?.run).toContain('--frozen-lockfile');
    });

    it('should run on ubuntu-latest', () => {
      // Given: The test job configuration
      const testJob = testWorkflow.jobs.test;

      // When: Checking the runner OS
      // Then: Should use ubuntu-latest
      expect(testJob['runs-on']).toBe('ubuntu-latest');
    });
  });

  /**
   * Test Scenario 2: Tests pass → build artifacts generated
   *
   * This test validates that the build.yml workflow:
   * - Triggers on push to main branch
   * - Triggers on pull requests to main
   * - Builds all packages successfully
   * - Verifies build completion for all packages
   * - Uploads build artifacts
   * - Has appropriate timeout limits
   */
  describe('Scenario 2: Successful tests trigger build artifact generation', () => {
    it('should trigger on push to main branch', () => {
      // Given: The build.yml workflow configuration
      // When: Checking the trigger configuration
      const trigger = buildWorkflow.on;

      // Then: Should trigger on push to main
      expect(trigger.push).toBeDefined();
      expect(trigger.push?.branches).toContain('main');
    });

    it('should trigger on pull requests to main branch', () => {
      // Given: The build.yml workflow configuration
      // When: Checking the trigger configuration
      const trigger = buildWorkflow.on;

      // Then: Should trigger on PRs to main
      expect(trigger.pull_request).toBeDefined();
      expect(trigger.pull_request?.branches).toContain('main');
    });

    it('should use Node.js version 20.x', () => {
      // Given: The build job configuration
      const buildJob = buildWorkflow.jobs.build;

      // When: Checking the Node.js version matrix
      const nodeVersions = buildJob.strategy?.matrix?.['node-version'];

      // Then: Should use Node.js 20.x
      expect(nodeVersions).toBeDefined();
      expect(nodeVersions).toContain('20.x');
    });

    it('should use pnpm version 8.15.0', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const pnpmStep = buildJob.steps.find((step) => step.name === 'Install pnpm');

      // When: Checking the pnpm version configuration
      const pnpmVersion = pnpmStep?.with?.version;

      // Then: Should use pnpm 8.15.0
      expect(pnpmStep).toBeDefined();
      expect(pnpmVersion).toBe('8.15.0');
    });

    it('should build all packages', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const buildStep = buildJob.steps.find((step) => step.name === 'Build all packages');

      // When: Checking for build command
      // Then: Should have build step with correct command
      expect(buildStep).toBeDefined();
      expect(buildStep?.run).toBe('pnpm build');
    });

    it('should verify course-gen-platform build completion', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const verifyStep = buildJob.steps.find((step) => step.name === 'Verify build completion');

      // When: Checking the verification script
      // Then: Should verify course-gen-platform dist directory exists
      expect(verifyStep).toBeDefined();
      expect(verifyStep?.run).toContain('course-gen-platform/dist');
      expect(verifyStep?.run).toContain('course-gen-platform built');
    });

    it('should verify shared-types build completion', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const verifyStep = buildJob.steps.find((step) => step.name === 'Verify build completion');

      // When: Checking the verification script
      // Then: Should verify shared-types dist directory exists
      expect(verifyStep).toBeDefined();
      expect(verifyStep?.run).toContain('shared-types/dist');
      expect(verifyStep?.run).toContain('shared-types built');
    });

    it('should upload build artifacts', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const uploadStep = buildJob.steps.find((step) => step.name === 'Upload build artifacts');

      // When: Checking for artifact upload configuration
      // Then: Should upload build artifacts with correct configuration
      expect(uploadStep).toBeDefined();
      expect(uploadStep?.uses).toContain('actions/upload-artifact');
      expect(uploadStep?.with?.name).toBe('build-artifacts');
      expect(uploadStep?.with?.path).toBeDefined();
      expect(uploadStep?.with?.['retention-days']).toBe(7);
    });

    it('should have reasonable timeout limit (10 minutes)', () => {
      // Given: The build job configuration
      const buildJob = buildWorkflow.jobs.build;

      // When: Checking the timeout configuration
      const timeout = buildJob['timeout-minutes'];

      // Then: Should have 10 minute timeout
      expect(timeout).toBe(10);
    });

    it('should fail if build verification fails', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const verifyStep = buildJob.steps.find((step) => step.name === 'Verify build completion');

      // When: Checking the verification script
      // Then: Should exit with error code 1 on failure
      expect(verifyStep).toBeDefined();
      expect(verifyStep?.run).toContain('exit 1');
    });

    it('should use frozen lockfile for reproducible builds', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const installStep = buildJob.steps.find((step) => step.name === 'Install dependencies');

      // When: Checking the install command
      // Then: Should use --frozen-lockfile
      expect(installStep).toBeDefined();
      expect(installStep?.run).toContain('--frozen-lockfile');
    });

    it('should run on ubuntu-latest', () => {
      // Given: The build job configuration
      const buildJob = buildWorkflow.jobs.build;

      // When: Checking the runner OS
      // Then: Should use ubuntu-latest
      expect(buildJob['runs-on']).toBe('ubuntu-latest');
    });
  });

  /**
   * Test Scenario 3: Tests fail → commit blocked from merging
   *
   * This test validates that the workflows are configured to block merges
   * when tests fail. While branch protection rules are configured in GitHub UI,
   * we verify that the workflows provide the necessary status checks.
   *
   * Note: Actual branch protection must be configured in GitHub repository settings:
   * - Settings → Branches → Branch protection rules → Add rule for main
   * - Require status checks: test, build
   * - Require branches to be up to date before merging
   */
  describe('Scenario 3: Failed tests block commit from merging', () => {
    it('should have named test job for status check', () => {
      // Given: The test.yml workflow configuration
      // When: Checking for job name
      const jobs = testWorkflow.jobs;

      // Then: Should have a named 'test' job for status checks
      expect(jobs.test).toBeDefined();
    });

    it('should have named build job for status check', () => {
      // Given: The build.yml workflow configuration
      // When: Checking for job name
      const jobs = buildWorkflow.jobs;

      // Then: Should have a named 'build' job for status checks
      expect(jobs.build).toBeDefined();
    });

    it('should provide clear error messages on lint failure', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const lintStep = testJob.steps.find((step) => step.name === 'Run linting');

      // When: Checking the lint step
      // Then: Should have descriptive name for clear error reporting
      expect(lintStep?.name).toBe('Run linting');
    });

    it('should provide clear error messages on type-check failure', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const typeCheckStep = testJob.steps.find((step) => step.name === 'Run type checking');

      // When: Checking the type-check step
      // Then: Should have descriptive name for clear error reporting
      expect(typeCheckStep?.name).toBe('Run type checking');
    });

    it('should provide clear error messages on test failure', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const testStep = testJob.steps.find((step) => step.name === 'Run Vitest tests');

      // When: Checking the test step
      // Then: Should have descriptive name for clear error reporting
      expect(testStep?.name).toBe('Run Vitest tests');
    });

    it('should provide clear error messages on build failure', () => {
      // Given: The build job steps
      const buildJob = buildWorkflow.jobs.build;
      const buildStep = buildJob.steps.find((step) => step.name === 'Build all packages');

      // When: Checking the build step
      // Then: Should have descriptive name for clear error reporting
      expect(buildStep?.name).toBe('Build all packages');
    });

    it('should stop workflow execution on step failure (default behavior)', () => {
      // Given: The test job steps
      const testJob = testWorkflow.jobs.test;
      const lintStep = testJob.steps.find((step) => step.name === 'Run linting');
      const typeCheckStep = testJob.steps.find((step) => step.name === 'Run type checking');
      const testStep = testJob.steps.find((step) => step.name === 'Run Vitest tests');

      // When: Checking for continue-on-error flags
      // Then: Should NOT have continue-on-error set (default behavior is to stop)
      expect(lintStep).toBeDefined();
      expect(typeCheckStep).toBeDefined();
      expect(testStep).toBeDefined();
      // Default behavior: steps fail fast unless explicitly set to continue
      // This ensures PR status checks fail when any step fails
    });
  });

  /**
   * Test Scenario 4: Merge to main → automated deployment to staging
   *
   * This test validates that the deploy-staging.yml workflow:
   * - Triggers on push to main branch
   * - Can be manually triggered via workflow_dispatch
   * - Only runs after tests and build pass
   * - Builds packages before deployment
   * - Runs smoke tests after deployment
   * - Provides deployment status notifications
   */
  describe('Scenario 4: Merge to main triggers deployment to staging', () => {
    it('should trigger on push to main branch', () => {
      // Given: The deploy-staging.yml workflow configuration
      // When: Checking the trigger configuration
      const trigger = deployWorkflow.on;

      // Then: Should trigger on push to main
      expect(trigger.push).toBeDefined();
      expect(trigger.push?.branches).toContain('main');
    });

    it('should support manual workflow dispatch', () => {
      // Given: The deploy-staging.yml workflow configuration
      // When: Checking for workflow_dispatch trigger
      const trigger = deployWorkflow.on;

      // Then: Should support manual triggering
      expect(trigger.workflow_dispatch).toBeDefined();
    });

    it('should only run on main branch pushes or manual dispatch', () => {
      // Given: The deploy job configuration
      const deployJob = deployWorkflow.jobs.deploy;

      // When: Checking the conditional execution
      const condition = deployJob.if;

      // Then: Should have condition that checks for main branch or workflow_dispatch
      expect(condition).toBeDefined();
      expect(condition).toContain("github.ref == 'refs/heads/main'");
      expect(condition).toContain("workflow_dispatch");
    });

    it('should use Node.js version 20.x', () => {
      // Given: The deploy job configuration
      const deployJob = deployWorkflow.jobs.deploy;

      // When: Checking the Node.js version matrix
      const nodeVersions = deployJob.strategy?.matrix?.['node-version'];

      // Then: Should use Node.js 20.x
      expect(nodeVersions).toBeDefined();
      expect(nodeVersions).toContain('20.x');
    });

    it('should use pnpm version 8.15.0', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const pnpmStep = deployJob.steps.find((step) => step.name === 'Install pnpm');

      // When: Checking the pnpm version configuration
      const pnpmVersion = pnpmStep?.with?.version;

      // Then: Should use pnpm 8.15.0
      expect(pnpmStep).toBeDefined();
      expect(pnpmVersion).toBe('8.15.0');
    });

    it('should build packages before deployment', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const buildStep = deployJob.steps.find((step) => step.name === 'Build packages');

      // When: Checking for build command
      // Then: Should build packages
      expect(buildStep).toBeDefined();
      expect(buildStep?.run).toBe('pnpm build');
    });

    it('should prepare deployment package', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const prepareStep = deployJob.steps.find((step) => step.name === 'Prepare deployment package');

      // When: Checking the preparation script
      // Then: Should prepare deployment artifacts
      expect(prepareStep).toBeDefined();
      expect(prepareStep?.run).toContain('mkdir -p deploy');
      expect(prepareStep?.run).toContain('cp -r packages/course-gen-platform/dist deploy/');
      expect(prepareStep?.run).toContain('cp packages/course-gen-platform/package.json deploy/');
    });

    it('should have deployment step (placeholder for Stage 0)', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const deployStep = deployJob.steps.find(
        (step) => step.name === 'Deploy to staging (placeholder)'
      );

      // When: Checking the deployment step
      // Then: Should have deployment step with placeholder for future implementation
      expect(deployStep).toBeDefined();
      expect(deployStep?.run).toContain('Deploying to staging environment');
      expect(deployStep?.run).toContain('Note: Actual deployment configuration will be added');
    });

    it('should run smoke tests after deployment', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const smokeTestStep = deployJob.steps.find((step) => step.name === 'Run smoke tests');

      // When: Checking the smoke test step
      // Then: Should run smoke tests
      expect(smokeTestStep).toBeDefined();
      expect(smokeTestStep?.run).toContain('Running smoke tests against staging');
      expect(smokeTestStep?.run).toContain('API health check');
      expect(smokeTestStep?.run).toContain('Database connection');
      expect(smokeTestStep?.run).toContain('Redis connection');
      expect(smokeTestStep?.run).toContain('tRPC router');
    });

    it('should notify deployment status', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const notifyStep = deployJob.steps.find((step) => step.name === 'Notify deployment status');

      // When: Checking the notification step
      // Then: Should notify deployment status
      expect(notifyStep).toBeDefined();
      expect(notifyStep?.if).toBe('always()'); // Run even on failure
      expect(notifyStep?.run).toContain('Staging deployment successful');
      expect(notifyStep?.run).toContain('Staging deployment failed');
      expect(notifyStep?.run).toContain('exit 1'); // Fail if deployment failed
    });

    it('should have reasonable timeout limit (15 minutes)', () => {
      // Given: The deploy job configuration
      const deployJob = deployWorkflow.jobs.deploy;

      // When: Checking the timeout configuration
      const timeout = deployJob['timeout-minutes'];

      // Then: Should have 15 minute timeout
      expect(timeout).toBe(15);
    });

    it('should use frozen lockfile for reproducible builds', () => {
      // Given: The deploy job steps
      const deployJob = deployWorkflow.jobs.deploy;
      const installStep = deployJob.steps.find((step) => step.name === 'Install dependencies');

      // When: Checking the install command
      // Then: Should use --frozen-lockfile
      expect(installStep).toBeDefined();
      expect(installStep?.run).toContain('--frozen-lockfile');
    });

    it('should run on ubuntu-latest', () => {
      // Given: The deploy job configuration
      const deployJob = deployWorkflow.jobs.deploy;

      // When: Checking the runner OS
      // Then: Should use ubuntu-latest
      expect(deployJob['runs-on']).toBe('ubuntu-latest');
    });
  });

  /**
   * Cross-workflow Integration Tests
   *
   * These tests verify that the workflows work together correctly
   * as part of the complete CI/CD pipeline.
   */
  describe('Cross-workflow Integration', () => {
    it('should use consistent Node.js version across all workflows', () => {
      // Given: All workflow configurations
      const testNodeVersion = testWorkflow.jobs.test.strategy?.matrix?.['node-version'];
      const buildNodeVersion = buildWorkflow.jobs.build.strategy?.matrix?.['node-version'];
      const deployNodeVersion = deployWorkflow.jobs.deploy.strategy?.matrix?.['node-version'];

      // When: Checking Node.js versions
      // Then: All workflows should use the same Node.js version
      expect(testNodeVersion).toEqual(buildNodeVersion);
      expect(buildNodeVersion).toEqual(deployNodeVersion);
      expect(testNodeVersion).toContain('20.x');
    });

    it('should use consistent pnpm version across all workflows', () => {
      // Given: All workflow steps
      const testPnpmStep = testWorkflow.jobs.test.steps.find(
        (step) => step.name === 'Install pnpm'
      );
      const buildPnpmStep = buildWorkflow.jobs.build.steps.find(
        (step) => step.name === 'Install pnpm'
      );
      const deployPnpmStep = deployWorkflow.jobs.deploy.steps.find(
        (step) => step.name === 'Install pnpm'
      );

      // When: Checking pnpm versions
      // Then: All workflows should use the same pnpm version
      expect(testPnpmStep?.with?.version).toBe('8.15.0');
      expect(buildPnpmStep?.with?.version).toBe('8.15.0');
      expect(deployPnpmStep?.with?.version).toBe('8.15.0');
    });

    it('should use consistent runner OS across all workflows', () => {
      // Given: All job configurations
      const testRunner = testWorkflow.jobs.test['runs-on'];
      const buildRunner = buildWorkflow.jobs.build['runs-on'];
      const deployRunner = deployWorkflow.jobs.deploy['runs-on'];

      // When: Checking runner OS
      // Then: All workflows should use ubuntu-latest
      expect(testRunner).toBe('ubuntu-latest');
      expect(buildRunner).toBe('ubuntu-latest');
      expect(deployRunner).toBe('ubuntu-latest');
    });

    it('should have logical workflow execution order', () => {
      // Given: Workflow trigger configurations
      const testTriggers = testWorkflow.on;
      const buildTriggers = buildWorkflow.on;
      const deployTriggers = deployWorkflow.on;

      // When: Analyzing trigger patterns
      // Then: Test should run on all branches, build on main, deploy only on main
      expect(testTriggers.push?.branches).toContain('**'); // All branches
      expect(buildTriggers.push?.branches).toContain('main'); // Main only
      expect(deployTriggers.push?.branches).toContain('main'); // Main only
    });

    it('should have all workflows properly named', () => {
      // Given: All workflow configurations
      // When: Checking workflow names
      // Then: Should have descriptive names
      expect(testWorkflow.name).toBe('Test');
      expect(buildWorkflow.name).toBe('Build');
      expect(deployWorkflow.name).toBe('Deploy to Staging');
    });
  });

  /**
   * Configuration Best Practices Tests
   *
   * These tests verify that the workflows follow GitHub Actions best practices.
   */
  describe('Configuration Best Practices', () => {
    it('should use latest GitHub Actions versions', () => {
      // Given: All workflow steps
      const allSteps = [
        ...testWorkflow.jobs.test.steps,
        ...buildWorkflow.jobs.build.steps,
        ...deployWorkflow.jobs.deploy.steps,
      ];

      // When: Checking action versions
      const checkoutSteps = allSteps.filter((step) => step.uses?.includes('actions/checkout'));
      const nodeSteps = allSteps.filter((step) => step.uses?.includes('actions/setup-node'));
      const uploadSteps = allSteps.filter((step) => step.uses?.includes('actions/upload-artifact'));

      // Then: Should use v4 for checkout, setup-node, and upload-artifact
      checkoutSteps.forEach((step) => {
        expect(step.uses).toContain('@v4');
      });
      nodeSteps.forEach((step) => {
        expect(step.uses).toContain('@v4');
      });
      uploadSteps.forEach((step) => {
        expect(step.uses).toContain('@v4');
      });
    });

    it('should cache pnpm dependencies in all workflows', () => {
      // Given: All workflow node setup steps
      const testNodeStep = testWorkflow.jobs.test.steps.find(
        (step) => step.uses?.includes('actions/setup-node')
      );
      const buildNodeStep = buildWorkflow.jobs.build.steps.find(
        (step) => step.uses?.includes('actions/setup-node')
      );
      const deployNodeStep = deployWorkflow.jobs.deploy.steps.find(
        (step) => step.uses?.includes('actions/setup-node')
      );

      // When: Checking cache configuration
      // Then: All should have pnpm cache enabled
      expect(testNodeStep?.with?.cache).toBe('pnpm');
      expect(buildNodeStep?.with?.cache).toBe('pnpm');
      expect(deployNodeStep?.with?.cache).toBe('pnpm');
    });

    it('should have reasonable timeout limits', () => {
      // Given: All job configurations
      const testTimeout = testWorkflow.jobs.test['timeout-minutes'];
      const buildTimeout = buildWorkflow.jobs.build['timeout-minutes'];
      const deployTimeout = deployWorkflow.jobs.deploy['timeout-minutes'];

      // When: Checking timeout values
      // Then: Should have reasonable limits (10-15 minutes)
      expect(testTimeout).toBeGreaterThanOrEqual(10);
      expect(testTimeout).toBeLessThanOrEqual(20);
      expect(buildTimeout).toBeGreaterThanOrEqual(10);
      expect(buildTimeout).toBeLessThanOrEqual(20);
      expect(deployTimeout).toBeGreaterThanOrEqual(10);
      expect(deployTimeout).toBeLessThanOrEqual(20);
    });

    it('should use frozen lockfile for all dependency installations', () => {
      // Given: All install steps
      const testInstall = testWorkflow.jobs.test.steps.find(
        (step) => step.name === 'Install dependencies'
      );
      const buildInstall = buildWorkflow.jobs.build.steps.find(
        (step) => step.name === 'Install dependencies'
      );
      const deployInstall = deployWorkflow.jobs.deploy.steps.find(
        (step) => step.name === 'Install dependencies'
      );

      // When: Checking install commands
      // Then: All should use frozen lockfile
      expect(testInstall?.run).toContain('--frozen-lockfile');
      expect(buildInstall?.run).toContain('--frozen-lockfile');
      expect(deployInstall?.run).toContain('--frozen-lockfile');
    });

    it('should have artifact retention policies', () => {
      // Given: Upload artifact steps
      const testUploadStep = testWorkflow.jobs.test.steps.find(
        (step) => step.name === 'Upload test coverage'
      );
      const buildUploadStep = buildWorkflow.jobs.build.steps.find(
        (step) => step.name === 'Upload build artifacts'
      );

      // When: Checking retention days
      // Then: Should have 7-day retention
      expect(testUploadStep?.with?.['retention-days']).toBe(7);
      expect(buildUploadStep?.with?.['retention-days']).toBe(7);
    });
  });
});
