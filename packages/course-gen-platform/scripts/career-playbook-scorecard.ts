#!/usr/bin/env tsx
/**
 * CLI for the Career Playbook quality scorecard (acceptance level L1).
 *
 * Usage:
 *   pnpm smoke:career-playbook:scorecard <guide.md> <role-profile-spec.json> [--json]
 *
 * Exits non-zero when any critical finding survives, so it can gate a release
 * the same way a test does.
 */

import { readFile } from 'node:fs/promises';
import {
  formatCareerPlaybookScorecard,
  scoreCareerPlaybook,
} from '../src/smoke/career-playbook-scorecard.js';

async function main(): Promise<void> {
  const [markdownPath, specPath, ...flags] = process.argv.slice(2);

  if (!markdownPath || !specPath) {
    console.error(
      'Usage: tsx scripts/career-playbook-scorecard.ts <guide.md> <role-profile-spec.json> [--json]'
    );
    process.exitCode = 2;
    return;
  }

  const [markdown, specRaw] = await Promise.all([
    readFile(markdownPath, 'utf8'),
    readFile(specPath, 'utf8'),
  ]);

  const report = scoreCareerPlaybook({
    markdown,
    roleProfileSpec: JSON.parse(specRaw),
  });

  console.log(
    flags.includes('--json')
      ? JSON.stringify(report, null, 2)
      : formatCareerPlaybookScorecard(report)
  );

  if (!report.pass) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
