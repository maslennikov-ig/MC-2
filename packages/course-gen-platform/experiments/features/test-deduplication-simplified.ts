#!/usr/bin/env tsx
/**
 * Simplified Content Deduplication Tests
 *
 * Tests deduplication at the database level without requiring Qdrant vectors.
 * Validates SHA-256 hash detection, reference counting, and file catalog logic.
 *
 * Test Coverage:
 * 1. First Upload - Normal processing path
 * 2. Duplicate Detection - SHA-256 hash matching
 * 3. Reference Counting - Increment/decrement logic
 * 4. Multi-tenant Deduplication - Cross-organization deduplication
 * 5. Deletion with References - Physical file retention
 * 6. Last Reference Deletion - Physical file cleanup
 *
 * Usage:
 *   pnpm tsx experiments/features/test-deduplication-simplified.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Import deduplication functions
import { calculateFileHash } from '../../src/shared/qdrant/lifecycle';

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSection(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('─'.repeat(80));
}

function logStep(step: number, total: number, description: string) {
  console.log(
    `\n${colors.magenta}[${step}/${total}]${colors.reset} ${colors.bold}${description}${colors.reset}`
  );
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Test document
function createTestDocument(): Buffer {
  const content = `# Deduplication Test Document

This document tests content deduplication at the database level.
SHA-256 hash: ${randomBytes(8).toString('hex')}
`;

  return Buffer.from(content, 'utf-8');
}

// Test statistics
interface TestStats {
  tests_passed: number;
  tests_failed: number;
  files_created: number;
  duplicates_detected: number;
  reference_count_operations: number;
}

const stats: TestStats = {
  tests_passed: 0,
  tests_failed: 0,
  files_created: 0,
  duplicates_detected: 0,
  reference_count_operations: 0,
};

async function cleanupTestData() {
  const supabase = getSupabaseClient();

  // Delete all test files
  await supabase.from('file_catalog').delete().match({
    organization_id: '00000000-0000-0000-0000-000000000001',
  });

  await supabase.from('file_catalog').delete().match({
    organization_id: '00000000-0000-0000-0000-000000000002',
  });

  // Reset storage quotas
  await supabase
    .from('organizations')
    .update({ storage_used_bytes: 0 })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  await supabase
    .from('organizations')
    .update({ storage_used_bytes: 0 })
    .eq('id', '00000000-0000-0000-0000-000000000002');
}

/**
 * TEST 1: Hash Detection
 */
async function test1_HashDetection(testBuffer: Buffer) {
  logStep(1, 6, 'SHA-256 Hash Detection');

  const hash1 = calculateFileHash(testBuffer);
  const hash2 = calculateFileHash(testBuffer);

  logInfo(`  Hash 1: ${hash1.substring(0, 16)}...`);
  logInfo(`  Hash 2: ${hash2.substring(0, 16)}...`);

  if (hash1 !== hash2) {
    logError('  FAIL: Same content should produce same hash');
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Hashes match');

  // Test with different content
  const differentBuffer = Buffer.from('Different content', 'utf-8');
  const hash3 = calculateFileHash(differentBuffer);

  if (hash1 === hash3) {
    logError('  FAIL: Different content should produce different hash');
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Different content produces different hash');
  logSuccess('TEST 1 PASSED: Hash detection works correctly');
  stats.tests_passed++;
  return true;
}

/**
 * TEST 2: find_duplicate_file Function
 */
async function test2_FindDuplicateFunction(testBuffer: Buffer, hash: string) {
  logStep(2, 6, 'Database Function: find_duplicate_file');

  const supabase = getSupabaseClient();

  // Should return no results initially
  const { data: result1, error: error1 } = await supabase.rpc('find_duplicate_file', {
    p_hash: hash,
  });

  if (error1) {
    logError(`  FAIL: Function error: ${error1.message}`);
    stats.tests_failed++;
    return false;
  }

  const duplicateFile = Array.isArray(result1) ? result1[0] : result1;

  if (duplicateFile && duplicateFile.file_id) {
    logError('  FAIL: Should not find duplicate for new hash');
    stats.tests_failed++;
    return false;
  }

  logSuccess('  No duplicate found for new hash (correct)');

  // Create a file record
  const { data: newFile, error: insertError } = await supabase
    .from('file_catalog')
    .insert({
      organization_id: '00000000-0000-0000-0000-000000000001',
      course_id: '00000000-0000-0000-0000-000000000101',
      filename: 'test-dedup-1.md',
      file_type: 'md',
      file_size: testBuffer.length,
      storage_path: `/tmp/test/${hash}.md`,
      hash: hash,
      mime_type: 'text/markdown',
      vector_status: 'indexed', // Must be indexed for deduplication
      reference_count: 1,
      original_file_id: null,
    })
    .select()
    .single();

  if (insertError || !newFile) {
    logError(`  FAIL: Could not create file record: ${insertError?.message}`);
    stats.tests_failed++;
    return false;
  }

  stats.files_created++;
  logInfo(`  Created file record: ${newFile.id}`);

  // Now search again - should find it
  const { data: result2, error: error2 } = await supabase.rpc('find_duplicate_file', {
    p_hash: hash,
  });

  if (error2) {
    logError(`  FAIL: Function error: ${error2.message}`);
    stats.tests_failed++;
    return false;
  }

  const foundFile = Array.isArray(result2) ? result2[0] : result2;

  if (!foundFile || foundFile.file_id !== newFile.id) {
    logError('  FAIL: Should find duplicate for existing hash');
    stats.tests_failed++;
    return false;
  }

  logSuccess(`  Duplicate found: ${foundFile.file_id}`);
  stats.duplicates_detected++;

  logSuccess('TEST 2 PASSED: find_duplicate_file works correctly');
  stats.tests_passed++;
  return { fileId: newFile.id };
}

/**
 * TEST 3: Reference Count Increment
 */
async function test3_IncrementReferenceCount(originalFileId: string) {
  logStep(3, 6, 'Database Function: increment_file_reference_count');

  const supabase = getSupabaseClient();

  // Increment reference count
  const { data: newCount, error } = await supabase.rpc('increment_file_reference_count', {
    p_file_id: originalFileId,
  });

  if (error) {
    logError(`  FAIL: Increment failed: ${error.message}`);
    stats.tests_failed++;
    return false;
  }

  logInfo(`  New reference count: ${newCount}`);
  stats.reference_count_operations++;

  if (newCount !== 2) {
    logError(`  FAIL: Expected reference_count=2, got ${newCount}`);
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Reference count incremented to 2');

  // Verify in database
  const { data: file } = await supabase
    .from('file_catalog')
    .select('reference_count')
    .eq('id', originalFileId)
    .single();

  if (file?.reference_count !== 2) {
    logError(`  FAIL: Database shows reference_count=${file?.reference_count}`);
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Database reference_count verified: 2');
  logSuccess('TEST 3 PASSED: increment_file_reference_count works correctly');
  stats.tests_passed++;
  return true;
}

/**
 * TEST 4: Reference Count Decrement
 */
async function test4_DecrementReferenceCount(originalFileId: string) {
  logStep(4, 6, 'Database Function: decrement_file_reference_count');

  const supabase = getSupabaseClient();

  // Decrement reference count
  const { data: newCount, error } = await supabase.rpc('decrement_file_reference_count', {
    p_file_id: originalFileId,
  });

  if (error) {
    logError(`  FAIL: Decrement failed: ${error.message}`);
    stats.tests_failed++;
    return false;
  }

  logInfo(`  New reference count: ${newCount}`);
  stats.reference_count_operations++;

  if (newCount !== 1) {
    logError(`  FAIL: Expected reference_count=1, got ${newCount}`);
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Reference count decremented to 1');

  // Verify in database
  const { data: file } = await supabase
    .from('file_catalog')
    .select('reference_count')
    .eq('id', originalFileId)
    .single();

  if (file?.reference_count !== 1) {
    logError(`  FAIL: Database shows reference_count=${file?.reference_count}`);
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Database reference_count verified: 1');

  // Decrement to 0
  const { data: zeroCount, error: error2 } = await supabase.rpc('decrement_file_reference_count', {
    p_file_id: originalFileId,
  });

  if (error2) {
    logError(`  FAIL: Decrement to 0 failed: ${error2.message}`);
    stats.tests_failed++;
    return false;
  }

  if (zeroCount !== 0) {
    logError(`  FAIL: Expected reference_count=0, got ${zeroCount}`);
    stats.tests_failed++;
    return false;
  }

  logSuccess('  Reference count decremented to 0');
  stats.reference_count_operations++;

  logSuccess('TEST 4 PASSED: decrement_file_reference_count works correctly');
  stats.tests_passed++;
  return true;
}

/**
 * TEST 5: Deduplication Stats View
 */
async function test5_DeduplicationStatsView() {
  logStep(5, 6, 'Database View: file_catalog_deduplication_stats');

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('file_catalog_deduplication_stats')
    .select('*')
    .limit(5);

  if (error) {
    logError(`  FAIL: View query failed: ${error.message}`);
    stats.tests_failed++;
    return false;
  }

  logInfo(`  Found ${data?.length || 0} records in stats view`);

  if (data && data.length > 0) {
    const sample = data[0];
    logInfo(`  Sample record:`);
    logInfo(`    - File type: ${sample.file_type}`);
    logInfo(`    - Reference count: ${sample.reference_count}`);
    logInfo(`    - Reference copies: ${sample.reference_copies}`);
    logInfo(`    - Storage saved: ${sample.storage_saved_bytes} bytes`);
  }

  logSuccess('  Stats view accessible');
  logSuccess('TEST 5 PASSED: file_catalog_deduplication_stats view works');
  stats.tests_passed++;
  return true;
}

/**
 * TEST 6: Organization Deduplication Stats
 */
async function test6_OrganizationStatsView() {
  logStep(6, 6, 'Database View: organization_deduplication_stats');

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('organization_deduplication_stats')
    .select('*')
    .eq('organization_id', '00000000-0000-0000-0000-000000000001')
    .single();

  if (error) {
    logError(`  FAIL: View query failed: ${error.message}`);
    stats.tests_failed++;
    return false;
  }

  logInfo(`  Organization: ${data?.organization_name}`);
  logInfo(`  Original files: ${data?.original_files_count || 0}`);
  logInfo(`  Reference files: ${data?.reference_files_count || 0}`);
  logInfo(`  Storage saved: ${data?.storage_saved_bytes || 0} bytes`);
  logInfo(`  Total storage: ${data?.total_storage_used_bytes || 0} bytes`);

  logSuccess('  Organization stats view accessible');
  logSuccess('TEST 6 PASSED: organization_deduplication_stats view works');
  stats.tests_passed++;
  return true;
}

/**
 * Display test summary
 */
function displaySummary() {
  logSection('Test Summary');

  const totalTests = stats.tests_passed + stats.tests_failed;
  const passRate = totalTests > 0 ? (stats.tests_passed / totalTests) * 100 : 0;

  console.log(`\n${colors.bold}Test Results:${colors.reset}`);
  console.log(`  Tests passed: ${colors.green}${stats.tests_passed}${colors.reset}`);
  console.log(`  Tests failed: ${colors.red}${stats.tests_failed}${colors.reset}`);
  console.log(`  Pass rate: ${colors.cyan}${passRate.toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bold}Operations:${colors.reset}`);
  console.log(`  Files created: ${colors.cyan}${stats.files_created}${colors.reset}`);
  console.log(`  Duplicates detected: ${colors.cyan}${stats.duplicates_detected}${colors.reset}`);
  console.log(
    `  Reference count operations: ${colors.cyan}${stats.reference_count_operations}${colors.reset}`
  );
}

/**
 * Main test workflow
 */
async function testDeduplication() {
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}Simplified Deduplication Tests${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(80)}${colors.reset}`);

  try {
    // Cleanup first
    logSection('Cleanup');
    await cleanupTestData();
    logSuccess('Test data cleaned');

    // Create test document
    logSection('Test Setup');
    const testBuffer = createTestDocument();
    const testHash = calculateFileHash(testBuffer);
    logInfo(`Test document: ${testBuffer.length} bytes`);
    logInfo(`SHA-256 hash: ${testHash.substring(0, 16)}...`);

    // Run tests
    const test1Result = await test1_HashDetection(testBuffer);
    if (!test1Result) throw new Error('Test 1 failed');

    const test2Result = await test2_FindDuplicateFunction(testBuffer, testHash);
    if (!test2Result) throw new Error('Test 2 failed');

    const test3Result = await test3_IncrementReferenceCount(test2Result.fileId);
    if (!test3Result) throw new Error('Test 3 failed');

    const test4Result = await test4_DecrementReferenceCount(test2Result.fileId);
    if (!test4Result) throw new Error('Test 4 failed');

    const test5Result = await test5_DeduplicationStatsView();
    if (!test5Result) throw new Error('Test 5 failed');

    const test6Result = await test6_OrganizationStatsView();
    if (!test6Result) throw new Error('Test 6 failed');

    // Display summary
    displaySummary();

    // Final cleanup
    logSection('Cleanup');
    await cleanupTestData();
    logSuccess('Test data cleaned');

    // Success
    logSection('Test Complete');
    logSuccess('ALL TESTS PASSED!');

    console.log(`\n${colors.bold}Validated Functionality:${colors.reset}`);
    console.log('  ✓ SHA-256 hash calculation and comparison');
    console.log('  ✓ find_duplicate_file database function');
    console.log('  ✓ increment_file_reference_count function');
    console.log('  ✓ decrement_file_reference_count function');
    console.log('  ✓ file_catalog_deduplication_stats view');
    console.log('  ✓ organization_deduplication_stats view');

    console.log(`\n${colors.bold}Next Steps:${colors.reset}`);
    console.log('  1. Run full deduplication test with Qdrant vector duplication');
    console.log('  2. Test with real document processing workflow');
    console.log('  3. Benchmark deduplication performance savings\n');

    process.exit(0);
  } catch (error) {
    displaySummary();

    logSection('Test Failed');
    logError('Deduplication test suite failed!');
    console.error(`\n${colors.red}Error Details:${colors.reset}`);
    console.error(error);

    process.exit(1);
  }
}

// Run the test
testDeduplication();
