import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = resolve(__dirname, '../../../../../.github/workflows/ci-cd.yml');
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

function jobBlock(jobName: string): string {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`Workflow job ${jobName} is missing`);

  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.search(/^ {2}[a-z][a-z0-9-]*:\n/mu);
  return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
}

function inlineNeeds(block: string): string[] {
  const match = block.match(/^ {4}needs:\s*\[([^\]]+)\]/mu);
  if (!match) throw new Error('Expected an inline needs list');
  return match[1].split(',').map(value => value.trim());
}

describe('blocking Qdrant workflow contract', () => {
  it('runs integration for pull requests targeting both delivery branches', () => {
    const integration = jobBlock('test-integration');

    expect(integration).toContain("github.event_name == 'pull_request'");
    expect(integration).toContain("github.base_ref == 'develop'");
    expect(integration).toContain("github.base_ref == 'master'");
  });

  it('runs integration for develop and master pushes', () => {
    const integration = jobBlock('test-integration');

    expect(integration).toContain("github.event_name == 'push'");
    expect(integration).toContain("github.ref == 'refs/heads/develop'");
    expect(integration).toContain("github.ref == 'refs/heads/master'");
    expect(inlineNeeds(integration)).toEqual(['setup']);
  });

  it('makes CI success reject integration skips unless skip_tests is explicit', () => {
    const ciSuccess = jobBlock('ci-success');

    expect(inlineNeeds(ciSuccess)).toContain('test-integration');
    expect(ciSuccess).toContain('needs.test-integration.result');
    expect(ciSuccess).toContain('inputs.skip_tests == true');
  });

  it.each(['deploy', 'deploy-dev'])('%s has no delivery path around CI success', jobName => {
    const deploy = jobBlock(jobName);

    expect(inlineNeeds(deploy)).toContain('ci-success');
    expect(deploy).toContain("needs.ci-success.result == 'success'");
  });
});
