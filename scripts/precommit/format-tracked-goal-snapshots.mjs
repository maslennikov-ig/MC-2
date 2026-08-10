import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import prettier from 'prettier';

const execFileAsync = promisify(execFile);
const SNAPSHOT_PATH = /^\.codex\/goals\/[^/]+\/scope-criterion-snapshot\.json$/;

export async function formatTrackedGoalSnapshots({
  cwd = process.cwd(),
} = {}) {
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--', '.codex/goals'],
    { cwd, encoding: 'utf8' }
  );
  const snapshots = stdout.split('\0').filter(file => SNAPSHOT_PATH.test(file));

  if (snapshots.length === 0) {
    return [];
  }

  for (const snapshot of snapshots) {
    const absolute = path.join(cwd, snapshot);
    const source = await readFile(absolute, 'utf8');
    const formatted = await prettier.format(source, { filepath: absolute });
    await writeFile(absolute, formatted, 'utf8');
  }
  await execFileAsync('git', ['add', '-f', '--', ...snapshots], { cwd });
  return snapshots;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  formatTrackedGoalSnapshots().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
