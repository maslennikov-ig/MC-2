#!/usr/bin/env tsx
/**
 * Bundle Size Analyzer for BullMQ Processor
 *
 * Checks that processor.js bundle doesn't exceed size threshold.
 * Run after build to catch bundle bloat early.
 *
 * Usage: pnpm analyze:bundle
 * Exit codes: 0 = OK, 1 = Exceeds threshold
 *
 * @module scripts/analyze-processor-bundle
 */

import fs from 'fs';
import path from 'path';

// Configuration
const MAX_BUNDLE_SIZE_MB = 2.0; // Alert threshold
const WARN_BUNDLE_SIZE_MB = 1.5; // Warning threshold
const BUNDLE_PATH = 'dist/orchestrator/processor.js';

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function main(): void {
  const bundlePath = path.resolve(process.cwd(), BUNDLE_PATH);

  // Check if bundle exists
  if (!fs.existsSync(bundlePath)) {
    console.error(`❌ Bundle not found: ${bundlePath}`);
    console.error('   Run "pnpm build" first to generate the processor bundle.');
    process.exit(1);
  }

  const stats = fs.statSync(bundlePath);
  const sizeMB = stats.size / (1024 * 1024);

  console.log('📦 Processor Bundle Analysis');
  console.log('─'.repeat(40));
  console.log(`   Path: ${BUNDLE_PATH}`);
  console.log(`   Size: ${formatSize(stats.size)}`);
  console.log(`   Warn threshold: ${WARN_BUNDLE_SIZE_MB} MB`);
  console.log(`   Max threshold: ${MAX_BUNDLE_SIZE_MB} MB`);
  console.log('─'.repeat(40));

  if (sizeMB > MAX_BUNDLE_SIZE_MB) {
    console.error(
      `❌ FAIL: Bundle size ${formatSize(stats.size)} exceeds max threshold ${MAX_BUNDLE_SIZE_MB} MB`
    );
    console.error('   Action: Audit dependencies, check for unnecessary imports');
    process.exit(1);
  }

  if (sizeMB > WARN_BUNDLE_SIZE_MB) {
    console.warn(
      `⚠️  WARN: Bundle size ${formatSize(stats.size)} exceeds warn threshold ${WARN_BUNDLE_SIZE_MB} MB`
    );
    console.warn('   Consider auditing dependencies if size continues to grow');
  } else {
    console.log(`✅ OK: Bundle size ${formatSize(stats.size)} is within limits`);
  }

  // Output for CI parsing
  console.log(`\n::set-output name=bundle_size_mb::${sizeMB.toFixed(2)}`);
}

main();
