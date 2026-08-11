import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import prettier from 'prettier';

const execFileAsync = promisify(execFile);
const LINTED = [
  /^packages\/course-gen-platform\/src\//,
  /^packages\/shared-types\/src\//,
  /^packages\/web\//,
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
  const lintable = files.filter(file => LINTED.some(root => root.test(repositoryPath(file, cwd))));
  const lintRequired = [];

  for (const file of lintable) {
    if (!(await stagedContentMatchesFormattedHead(file, cwd))) {
      lintRequired.push(file);
    }
  }

  return [
    ...(lintRequired.length ? [`eslint --fix ${quoteFiles(lintRequired)}`] : []),
    `prettier --write ${quoteFiles(files)}`,
  ];
}
