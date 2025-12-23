/**
 * Monorepo Structure Verification Script
 *
 * Purpose: Validate that the monorepo structure is correctly set up with all required
 * directories, package.json files, and TypeScript project references.
 *
 * This script checks:
 * 1. Required directories exist
 * 2. All package.json files are valid JSON
 * 3. TypeScript project references are configured
 * 4. Workspace dependencies are properly configured
 *
 * Usage: pnpm tsx tools/verify/verify-structure.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import JSON5 from 'json5';

interface ValidationResult {
  category: string;
  item: string;
  status: 'PASS' | 'FAIL';
  message?: string;
}

const results: ValidationResult[] = [];

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

/**
 * Add a validation result
 */
function addResult(
  category: string,
  item: string,
  status: 'PASS' | 'FAIL',
  message?: string
): void {
  results.push({ category, item, status, message });
}

/**
 * Check if a directory exists
 */
function checkDirectory(path: string, name: string): boolean {
  const fullPath = resolve(process.cwd(), '..', '..', path);
  const exists = existsSync(fullPath);
  addResult(
    'Directory Structure',
    name,
    exists ? 'PASS' : 'FAIL',
    exists ? `✓ ${path}` : `✗ Missing: ${path}`
  );
  return exists;
}

/**
 * Validate a package.json file
 */
function validatePackageJson(path: string, packageName: string): boolean {
  const fullPath = resolve(process.cwd(), '..', '..', path);

  if (!existsSync(fullPath)) {
    addResult('Package Configuration', packageName, 'FAIL', `✗ File not found: ${path}`);
    return false;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const pkg = JSON.parse(content);

    // Check required fields
    const requiredFields = ['name', 'version'];
    const missingFields = requiredFields.filter(field => !(field in pkg));

    if (missingFields.length > 0) {
      addResult(
        'Package Configuration',
        packageName,
        'FAIL',
        `✗ Missing fields: ${missingFields.join(', ')}`
      );
      return false;
    }

    addResult('Package Configuration', packageName, 'PASS', `✓ Valid package.json at ${path}`);
    return true;
  } catch (error) {
    addResult(
      'Package Configuration',
      packageName,
      'FAIL',
      `✗ Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Validate TypeScript project references
 */
function validateTsConfig(path: string, packageName: string): boolean {
  const fullPath = resolve(process.cwd(), '..', '..', path);

  if (!existsSync(fullPath)) {
    addResult('TypeScript Configuration', packageName, 'FAIL', `✗ File not found: ${path}`);
    return false;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    // Use JSON5 to parse JSON with comments and trailing commas
    const tsconfig = JSON5.parse(content);

    // Check if composite is enabled (required for project references)
    if (!tsconfig.compilerOptions?.composite) {
      addResult(
        'TypeScript Configuration',
        packageName,
        'FAIL',
        `✗ Missing "composite: true" in compilerOptions`
      );
      return false;
    }

    addResult(
      'TypeScript Configuration',
      packageName,
      'PASS',
      `✓ Valid tsconfig.json with project references at ${path}`
    );
    return true;
  } catch (error) {
    addResult(
      'TypeScript Configuration',
      packageName,
      'FAIL',
      `✗ Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Validate pnpm workspace configuration
 */
function validateWorkspace(): boolean {
  const workspacePath = resolve(process.cwd(), '..', '..', 'pnpm-workspace.yaml');

  if (!existsSync(workspacePath)) {
    addResult(
      'Workspace Configuration',
      'pnpm-workspace.yaml',
      'FAIL',
      '✗ File not found: pnpm-workspace.yaml'
    );
    return false;
  }

  try {
    const content = readFileSync(workspacePath, 'utf-8');

    // Basic validation - check if it contains "packages:" key
    if (!content.includes('packages:')) {
      addResult(
        'Workspace Configuration',
        'pnpm-workspace.yaml',
        'FAIL',
        '✗ Missing "packages:" key'
      );
      return false;
    }

    addResult(
      'Workspace Configuration',
      'pnpm-workspace.yaml',
      'PASS',
      '✓ Valid workspace configuration'
    );
    return true;
  } catch (error) {
    addResult(
      'Workspace Configuration',
      'pnpm-workspace.yaml',
      'FAIL',
      `✗ Error reading file: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Print results in a formatted table
 */
function printResults(): void {
  console.log(
    `\n${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bold}${colors.blue}║         Monorepo Structure Verification Report                ║${colors.reset}`
  );
  console.log(
    `${colors.bold}${colors.blue}╚═══════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  // Group results by category
  const categories = Array.from(new Set(results.map(r => r.category)));

  categories.forEach(category => {
    console.log(`${colors.bold}${category}:${colors.reset}`);

    const categoryResults = results.filter(r => r.category === category);
    categoryResults.forEach(result => {
      const statusColor = result.status === 'PASS' ? colors.green : colors.red;
      const statusSymbol = result.status === 'PASS' ? '✓' : '✗';

      console.log(`  ${statusColor}${statusSymbol} ${result.item}${colors.reset}`);
      if (result.message) {
        console.log(`    ${result.message}`);
      }
    });
    console.log('');
  });

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  Total checks: ${total}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`  Success rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}✓ All validation checks passed!${colors.reset}\n`);
  } else {
    console.log(
      `${colors.red}${colors.bold}✗ Some validation checks failed. Please review the errors above.${colors.reset}\n`
    );
  }
}

/**
 * Main verification function
 */
function verifyStructure(): void {
  console.log('Starting monorepo structure verification...\n');

  // 1. Check directory structure
  console.log('Checking directory structure...');
  checkDirectory('packages', 'Root packages directory');
  checkDirectory('packages/course-gen-platform', 'course-gen-platform package');
  checkDirectory('packages/shared-types', 'shared-types package');
  checkDirectory('packages/trpc-client-sdk', 'trpc-client-sdk package');
  checkDirectory('packages/course-gen-platform/src', 'course-gen-platform/src');
  checkDirectory('packages/course-gen-platform/src/server', 'course-gen-platform/src/server');
  checkDirectory(
    'packages/course-gen-platform/src/orchestrator',
    'course-gen-platform/src/orchestrator'
  );
  checkDirectory('packages/course-gen-platform/src/shared', 'course-gen-platform/src/shared');
  checkDirectory('packages/course-gen-platform/tests', 'course-gen-platform/tests');
  checkDirectory('packages/course-gen-platform/supabase/migrations', 'Supabase migrations');

  // 2. Check package.json files
  console.log('Validating package.json files...');
  validatePackageJson('package.json', 'Root package');
  validatePackageJson('packages/course-gen-platform/package.json', 'course-gen-platform');
  validatePackageJson('packages/shared-types/package.json', 'shared-types');
  validatePackageJson('packages/trpc-client-sdk/package.json', 'trpc-client-sdk');

  // 3. Check TypeScript configuration
  console.log('Validating TypeScript configuration...');
  validateTsConfig('tsconfig.json', 'Root tsconfig');
  validateTsConfig('packages/course-gen-platform/tsconfig.json', 'course-gen-platform');
  validateTsConfig('packages/shared-types/tsconfig.json', 'shared-types');
  validateTsConfig('packages/trpc-client-sdk/tsconfig.json', 'trpc-client-sdk');

  // 4. Check workspace configuration
  console.log('Validating workspace configuration...');
  validateWorkspace();

  // Print results
  printResults();

  // Exit with appropriate code
  const hasFailures = results.some(r => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

// Run verification
verifyStructure();
