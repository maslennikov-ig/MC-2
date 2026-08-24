import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import prettier from 'prettier';

const execFileAsync = promisify(execFile);

// Each entry is the package whose OWN eslint config must judge the file, because that is the
// config `pnpm -r lint` uses in CI. Only `web` has a config of its own; the other two inherit
// the root one by walking up, so routing them through their package directory changes nothing
// and keeps this list uniform.
//
// Running everything from the repository root, as this used to, checks web files against a
// config that has never heard of `eslint-config-next`. That is not merely a weaker check: an
// `eslint-disable-next-line @next/next/...` comment — the repository's own recorded way of
// saying "this rule does not apply here", used at four sites — becomes
// "Definition for rule was not found", which is an ERROR, so the hook refuses the commit.
// Measured on a file nobody had touched: `eslint packages/web/components/course/viewer/
// enrichments/InfographicViewer.tsx` from the root exits 1 with two such errors. Editing one
// line of it was therefore impossible without `--no-verify`.
const LINTED = [
  { root: /^packages\/course-gen-platform\/src\//, dir: 'packages/course-gen-platform' },
  { root: /^packages\/shared-types\/src\//, dir: 'packages/shared-types' },
  { root: /^packages\/web\//, dir: 'packages/web' },
];

const quoteFiles = files => files.map(file => JSON.stringify(file)).join(' ');

function repositoryPath(file, cwd) {
  return path.relative(cwd, file).split(path.sep).join('/');
}

async function stagedContentMatchesFormattedHead(file, cwd) {
  const relative = repositoryPath(file, cwd);
  let head;
  let staged;

  try {
    ({ stdout: head } = await execFileAsync('git', ['show', `HEAD:${relative}`], {
      cwd,
      encoding: 'utf8',
    }));
    ({ stdout: staged } = await execFileAsync('git', ['show', `:${relative}`], {
      cwd,
      encoding: 'utf8',
    }));
  } catch {
    return false;
  }

  const canonical = await prettier.format(head, { filepath: file });
  return staged === canonical;
}

export async function buildTypeScriptCommands(files, { cwd = process.cwd() } = {}) {
  const byPackage = new Map();

  for (const file of files) {
    const relative = repositoryPath(file, cwd);
    const owner = LINTED.find(entry => entry.root.test(relative));
    if (!owner) continue;
    if (await stagedContentMatchesFormattedHead(file, cwd)) continue;
    const group = byPackage.get(owner.dir);
    if (group) group.push(file);
    else byPackage.set(owner.dir, [file]);
  }

  // `pnpm --dir` rather than one root invocation: eslint resolves its flat config from the
  // working directory, so this is what picks up `packages/web/eslint.config.mjs`. Paths stay
  // absolute, which is what lint-staged passes and what eslint accepts from any directory.
  const lintCommands = [...byPackage].map(
    ([dir, group]) => `pnpm --dir=${dir} exec eslint --fix ${quoteFiles(group)}`
  );

  return [...lintCommands, `prettier --write ${quoteFiles(files)}`];
}
