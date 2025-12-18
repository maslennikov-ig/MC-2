#!/usr/bin/env tsx
/**
 * Script to systematically replace console.log statements with structured logger
 *
 * This script:
 * 1. Finds all source files with console.* statements
 * 2. Adds logger import if not present
 * 3. Replaces console statements with appropriate logger calls
 * 4. Preserves the logger's own console statements
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

interface ReplaceStats {
  filesProcessed: number;
  filesModified: number;
  consoleStatementsReplaced: number;
  errors: string[];
}

const stats: ReplaceStats = {
  filesProcessed: 0,
  filesModified: 0,
  consoleStatementsReplaced: 0,
  errors: [],
};

/**
 * Check if file should be skipped
 */
function shouldSkipFile(filePath: string): boolean {
  const skipPatterns = [
    /node_modules/,
    /dist\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__\//,
    /\/tests\//,
    /\/examples\//,
    /\/scripts\//,
    /logger\/index\.ts$/, // Skip the logger file itself
    /example.*\.ts$/,
    /\.example\.ts$/,
  ];

  return skipPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Check if file already has logger import
 */
function hasLoggerImport(content: string): boolean {
  return /import\s+.*logger.*from\s+['"].*logger/.test(content);
}

/**
 * Add logger import to file
 */
function addLoggerImport(content: string): string {
  // Find the last import statement
  const importRegex = /^import\s+.+;$/gm;
  const imports = content.match(importRegex);

  if (!imports || imports.length === 0) {
    // No imports found, add at the top after any leading comments
    const firstNonCommentLine = content.split('\n').findIndex((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    });

    if (firstNonCommentLine === -1) {
      return `import { logger } from '../logger/index.js';\n\n${content}`;
    }

    const lines = content.split('\n');
    lines.splice(firstNonCommentLine, 0, "import { logger } from '../logger/index.js';", '');
    return lines.join('\n');
  }

  // Find the position of the last import
  let lastImportIndex = 0;
  let match;
  const regex = new RegExp(importRegex);
  while ((match = regex.exec(content)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }

  // Calculate relative path to logger
  // This is a simplified version - may need adjustment based on file location
  const loggerImport = "import { logger } from '../logger/index.js';";

  return content.slice(0, lastImportIndex) + '\n' + loggerImport + content.slice(lastImportIndex);
}

/**
 * Replace console statements with logger calls
 */
function replaceConsoleStatements(content: string): { content: string; count: number } {
  let count = 0;
  let newContent = content;

  // Pattern 1: console.error('message', error) -> logger.error('message', { error })
  newContent = newContent.replace(
    /console\.error\(['"]([^'"]+)['"],\s*(\w+)\);?/g,
    (match, message, errorVar) => {
      count++;
      return `logger.error('${message}', { error: ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}) });`;
    }
  );

  // Pattern 2: console.error(`template ${var}`) -> logger.error('message', { var })
  newContent = newContent.replace(
    /console\.error\(`([^`]*)\$\{([^}]+)\}([^`]*)`\);?/g,
    (match, before, varName, after) => {
      count++;
      const message = (before + after).trim();
      const cleanVar = varName.trim();
      return `logger.error('${message}', { value: ${cleanVar} });`;
    }
  );

  // Pattern 3: console.log(`message: ${value}`) -> logger.info('message', { value })
  newContent = newContent.replace(
    /console\.log\(`([^:]+):\s*\$\{([^}]+)\}([^`]*)`\);?/g,
    (match, message, varName, after) => {
      count++;
      const cleanMessage = message.trim();
      const cleanVar = varName.trim();
      const extraMessage = after.trim();
      return `logger.info('${cleanMessage}${extraMessage}', { value: ${cleanVar} });`;
    }
  );

  // Pattern 4: Simple console.log/info/debug
  newContent = newContent.replace(
    /console\.(log|info|debug)\(['"]([^'"]+)['"]\);?/g,
    (match, level, message) => {
      count++;
      const logLevel = level === 'log' ? 'info' : level;
      return `logger.${logLevel}('${message}');`;
    }
  );

  // Pattern 5: console.warn
  newContent = newContent.replace(
    /console\.warn\(['"]([^'"]+)['"]\);?/g,
    (match, message) => {
      count++;
      return `logger.warn('${message}');`;
    }
  );

  return { content: newContent, count };
}

/**
 * Process a single file
 */
async function processFile(filePath: string): Promise<void> {
  stats.filesProcessed++;

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Check if file has console statements
    if (!/console\.(log|error|warn|info|debug)/.test(content)) {
      return; // No console statements
    }

    let newContent = content;

    // Add logger import if not present
    if (!hasLoggerImport(content)) {
      newContent = addLoggerImport(newContent);
    }

    // Replace console statements
    const { content: replacedContent, count } = replaceConsoleStatements(newContent);

    if (count > 0) {
      newContent = replacedContent;
      await fs.writeFile(filePath, newContent, 'utf-8');
      stats.filesModified++;
      stats.consoleStatementsReplaced += count;
      console.log(`✓ Fixed ${count} console statements in ${filePath}`);
    }
  } catch (error) {
    stats.errors.push(`Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Finding source files with console statements...\n');

  // Find all TypeScript files in src/shared (excluding tests and examples)
  const files = await glob('src/shared/**/*.ts', {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**', '**/examples/**', '**/*example*.ts'],
  });

  console.log(`Found ${files.length} source files to process\n`);

  for (const file of files) {
    if (!shouldSkipFile(file)) {
      await processFile(file);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Console statements replaced: ${stats.consoleStatementsReplaced}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${stats.errors.length}`);
    stats.errors.forEach((error) => console.log(`  - ${error}`));
  }

  console.log('\n✅ Console log cleanup complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
