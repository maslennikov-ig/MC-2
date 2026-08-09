#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(moduleDir, '../..');

export function requiredComposeVariables(composeTexts) {
  const required = new Set();
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*):\?[^}]*\}/g;

  for (const text of composeTexts) {
    for (const match of text.matchAll(pattern)) required.add(match[1]);
  }

  return [...required].sort();
}

export function envAssignmentKeys(envText) {
  const keys = new Set();
  const pattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/gm;

  for (const match of envText.matchAll(pattern)) keys.add(match[1]);

  return [...keys].sort();
}

export function colorOverlayKeys(deployScript) {
  const functionMatch = deployScript.match(
    /write_color_env\(\)\s*\{([\s\S]*?)\n\}\n\nrequire_immutable_ref\(\)/
  );
  if (!functionMatch) throw new Error('write_color_env generator contract was not found');

  const keys = new Set();
  const pattern = /printf\s+'([A-Z][A-Z0-9_]*)=%s\\n'/g;
  for (const match of functionMatch[1].matchAll(pattern)) keys.add(match[1]);

  if (keys.size === 0) throw new Error('write_color_env generator emits no environment keys');
  return [...keys].sort();
}

export function missingRequiredByEnvironment(requiredKeys, environments) {
  const missing = new Map();

  for (const [name, keys] of environments) {
    const available = new Set(keys);
    const absent = requiredKeys.filter(key => !available.has(key));
    if (absent.length > 0) missing.set(name, absent);
  }

  return missing;
}

export function repositoryColorEnvContract(repoRoot = rootDir) {
  const requireFromBackend = createRequire(
    resolve(repoRoot, 'packages/course-gen-platform/package.json')
  );
  const yaml = requireFromBackend('js-yaml');
  const workflow = yaml.load(
    readFileSync(resolve(repoRoot, '.github/workflows/ci-cd.yml'), 'utf8')
  );
  const createProductionEnv = workflow?.jobs?.deploy?.steps?.find(
    step => step?.name === 'Create .env.production'
  )?.run;
  if (!createProductionEnv) throw new Error('Create .env.production workflow step was not found');

  const composeTexts = ['docker-compose.app.yml', 'docker-compose.production.yml'].map(path =>
    readFileSync(resolve(repoRoot, path), 'utf8')
  );
  const deployScript = readFileSync(resolve(repoRoot, 'scripts/deploy_blue_green.sh'), 'utf8');
  const requiredKeys = requiredComposeVariables(composeTexts);
  if (requiredKeys.length === 0)
    throw new Error('production Compose files declare no ${VAR:?} keys');

  const generatedKeys = [
    ...new Set([...envAssignmentKeys(createProductionEnv), ...colorOverlayKeys(deployScript)]),
  ].sort();
  const environments = new Map([
    ['.env.blue', generatedKeys],
    ['.env.green', generatedKeys],
  ]);

  return {
    requiredKeys,
    missing: missingRequiredByEnvironment(requiredKeys, environments),
  };
}

function main() {
  try {
    const { requiredKeys, missing } = repositoryColorEnvContract();
    if (missing.size > 0) {
      for (const [name, keys] of missing) {
        console.error(`color env contract failed: ${name} missing ${keys.join(', ')}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `color env contract passed: ${requiredKeys.length} required variables guaranteed in .env.blue and .env.green`
    );
  } catch (error) {
    console.error(`color env contract failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
