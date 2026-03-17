/**
 * Post-build script: adds .js extensions to relative imports in compiled ESM output.
 *
 * Problem: TypeScript with moduleResolution:"bundler" compiles
 *   export * from './database.types'
 * but Node.js ESM requires explicit extensions:
 *   export * from './database.types.js'
 *
 * Handles both file imports and directory imports (./lms → ./lms/index.js).
 * Runs automatically as part of the build pipeline.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');

let filesFixed = 0;
let importsFixed = 0;

function resolveRelativeImport(importPath, fromFile) {
  const dir = dirname(fromFile);
  const resolved = join(dir, importPath);

  // Already has .js extension — skip
  if (importPath.endsWith('.js')) return importPath;

  // Check if it's a file: ./foo → ./foo.js
  if (existsSync(resolved + '.js')) return importPath + '.js';

  // Check if it's a directory with index.js: ./lms → ./lms/index.js
  if (existsSync(join(resolved, 'index.js'))) return importPath + '/index.js';

  // Fallback: add .js (may not exist, but better than extensionless)
  return importPath + '.js';
}

function fixFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  let count = 0;

  const fixed = content.replace(
    /((?:from|import)\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (match, prefix, importPath, suffix) => {
      if (importPath.endsWith('.js')) return match; // already fixed
      const resolved = resolveRelativeImport(importPath, filePath);
      if (resolved !== importPath) count++;
      return `${prefix}${resolved}${suffix}`;
    }
  );

  if (count > 0) {
    writeFileSync(filePath, fixed);
    filesFixed++;
    importsFixed += count;
  }
}

function walkDir(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.endsWith('.js')) {
      fixFile(fullPath);
    }
  }
}

walkDir(distDir);
console.log(`fix-esm-imports: ${importsFixed} imports fixed in ${filesFixed} files`);
