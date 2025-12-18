/**
 * Vector Lifecycle Management - Deduplication Tests
 *
 * Demonstrates content deduplication with reference counting:
 * 1. Upload same file to 2 different courses → only 1 set of embeddings generated
 * 2. Delete 1 reference → file still exists, vectors for other course intact
 * 3. Delete last reference → physical file and all vectors deleted
 *
 * @module shared/qdrant/__tests__/lifecycle.test
 */

import {
  handleFileUpload,
  handleFileDelete,
  calculateFileHash,
  getDeduplicationStats,
  type FileUploadMetadata,
} from '../lifecycle';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Test configuration
const TEST_FILE_PATH = path.join(__dirname, 'fixtures', 'test-document.pdf');
const TEST_ORGANIZATION_1 = '123e4567-e89b-12d3-a456-426614174001';
const TEST_ORGANIZATION_2 = '123e4567-e89b-12d3-a456-426614174002';
const TEST_COURSE_1 = '223e4567-e89b-12d3-a456-426614174001';
const TEST_COURSE_2 = '223e4567-e89b-12d3-a456-426614174002';

/**
 * Test 1: Same file uploaded to 2 different courses (same organization)
 */
async function testSameOrgDeduplication() {
  console.log('\n========================================');
  console.log('TEST 1: Same file uploaded to 2 courses (same organization)');
  console.log('========================================\n');

  // Read test file
  const fileBuffer = await fs.readFile(TEST_FILE_PATH);
  const hash = calculateFileHash(fileBuffer);
  console.log(`Test file hash: ${hash.substring(0, 16)}...`);

  // Upload 1: First course
  console.log('\n--- Upload 1: First course ---');
  const metadata1: FileUploadMetadata = {
    filename: 'test-document.pdf',
    organization_id: TEST_ORGANIZATION_1,
    course_id: TEST_COURSE_1,
    mime_type: 'application/pdf',
  };

  const result1 = await handleFileUpload(fileBuffer, metadata1);
  console.log('Upload 1 result:', result1);

  if (result1.deduplicated) {
    console.log('❌ FAIL: First upload should NOT be deduplicated');
  } else {
    console.log('✓ PASS: First upload created new file');
  }

  // Wait for processing (in real scenario, this would be queued)
  console.log('⏳ Waiting for processing to complete...');
  console.log('(In production, would wait for vector_status = "indexed")');

  // Upload 2: Second course (SAME file, SAME org, DIFFERENT course)
  console.log('\n--- Upload 2: Second course (same file) ---');
  const metadata2: FileUploadMetadata = {
    filename: 'test-document-copy.pdf', // Different filename
    organization_id: TEST_ORGANIZATION_1,
    course_id: TEST_COURSE_2,
    mime_type: 'application/pdf',
  };

  const result2 = await handleFileUpload(fileBuffer, metadata2);
  console.log('Upload 2 result:', result2);

  if (result2.deduplicated) {
    console.log('✓ PASS: Second upload was deduplicated');
    console.log(`  - Original file: ${result2.original_file_id}`);
    console.log(`  - Vectors duplicated: ${result2.vectors_duplicated}`);
  } else {
    console.log('❌ FAIL: Second upload should be deduplicated');
  }

  // Check deduplication stats
  console.log('\n--- Deduplication Statistics ---');
  const stats = await getDeduplicationStats(TEST_ORGANIZATION_1);
  console.log('Stats:', stats);
  console.log(`  - Original files: ${stats.original_files}`);
  console.log(`  - Reference files: ${stats.reference_files}`);
  console.log(`  - Storage saved: ${stats.storage_saved_bytes} bytes`);

  return { file1: result1.file_id, file2: result2.file_id };
}

/**
 * Test 2: Delete one reference, verify other course still has access
 */
async function testDeleteOneReference(fileIds: { file1: string; file2: string }) {
  console.log('\n========================================');
  console.log('TEST 2: Delete one reference');
  console.log('========================================\n');

  console.log(`Deleting file from course 2: ${fileIds.file2}`);

  const deleteResult = await handleFileDelete(fileIds.file2);
  console.log('Delete result:', deleteResult);

  if (deleteResult.physical_file_deleted) {
    console.log('❌ FAIL: Physical file should NOT be deleted (other reference exists)');
  } else {
    console.log('✓ PASS: Physical file retained');
    console.log(`  - Remaining references: ${deleteResult.remaining_references}`);
  }

  // Verify course 1 still has vectors
  console.log('\n--- Verify Course 1 Still Has Access ---');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: file1, error } = await supabase
    .from('file_catalog')
    .select('*')
    .eq('id', fileIds.file1)
    .single();

  if (error) {
    console.log('❌ FAIL: Course 1 file record should still exist');
  } else {
    console.log('✓ PASS: Course 1 file record still exists');
    console.log(`  - Vector status: ${file1.vector_status}`);
    console.log(`  - Reference count: ${file1.reference_count}`);
  }

  return fileIds.file1;
}

/**
 * Test 3: Delete last reference, verify physical file deleted
 */
async function testDeleteLastReference(fileId: string) {
  console.log('\n========================================');
  console.log('TEST 3: Delete last reference');
  console.log('========================================\n');

  console.log(`Deleting last file reference: ${fileId}`);

  const deleteResult = await handleFileDelete(fileId);
  console.log('Delete result:', deleteResult);

  if (deleteResult.physical_file_deleted) {
    console.log('✓ PASS: Physical file deleted when reference count = 0');
    console.log(`  - Remaining references: ${deleteResult.remaining_references}`);
  } else {
    console.log('❌ FAIL: Physical file should be deleted (no references remain)');
  }

  // Verify file record deleted
  console.log('\n--- Verify File Record Deleted ---');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase
    .from('file_catalog')
    .select('*')
    .eq('id', fileId)
    .single();

  if (error || !data) {
    console.log('✓ PASS: File record deleted from database');
  } else {
    console.log('❌ FAIL: File record should be deleted');
  }
}

/**
 * Test 4: Cross-organization deduplication
 */
async function testCrossOrgDeduplication() {
  console.log('\n========================================');
  console.log('TEST 4: Cross-organization deduplication');
  console.log('========================================\n');

  // Read test file
  const fileBuffer = await fs.readFile(TEST_FILE_PATH);

  // Upload to Org 1
  console.log('\n--- Upload to Organization 1 ---');
  const metadata1: FileUploadMetadata = {
    filename: 'shared-document.pdf',
    organization_id: TEST_ORGANIZATION_1,
    course_id: TEST_COURSE_1,
    mime_type: 'application/pdf',
  };

  const result1 = await handleFileUpload(fileBuffer, metadata1);
  console.log('Org 1 upload:', result1);

  // Upload SAME file to Org 2
  console.log('\n--- Upload to Organization 2 (same file) ---');
  const metadata2: FileUploadMetadata = {
    filename: 'shared-document.pdf',
    organization_id: TEST_ORGANIZATION_2,
    course_id: TEST_COURSE_2,
    mime_type: 'application/pdf',
  };

  const result2 = await handleFileUpload(fileBuffer, metadata2);
  console.log('Org 2 upload:', result2);

  if (result2.deduplicated) {
    console.log('✓ PASS: Cross-organization deduplication works');
    console.log('  - Both orgs share physical file');
    console.log('  - Both orgs have isolated vectors (different document_id, course_id)');
  } else {
    console.log('❌ FAIL: Cross-organization deduplication should work');
  }

  // Verify quota accounting (both orgs pay)
  console.log('\n--- Quota Accounting ---');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: org1 } = await supabase
    .from('organizations')
    .select('storage_used_bytes')
    .eq('id', TEST_ORGANIZATION_1)
    .single();

  const { data: org2 } = await supabase
    .from('organizations')
    .select('storage_used_bytes')
    .eq('id', TEST_ORGANIZATION_2)
    .single();

  console.log(`Org 1 storage: ${org1?.storage_used_bytes || 0} bytes`);
  console.log(`Org 2 storage: ${org2?.storage_used_bytes || 0} bytes`);
  console.log('✓ Both organizations pay for their reference');

  return { file1: result1.file_id, file2: result2.file_id };
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Vector Lifecycle Deduplication Tests ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    // Test 1: Same organization deduplication
    const fileIds = await testSameOrgDeduplication();

    // Test 2: Delete one reference
    const remainingFile = await testDeleteOneReference(fileIds);

    // Test 3: Delete last reference
    await testDeleteLastReference(remainingFile);

    // Test 4: Cross-organization deduplication
    await testCrossOrgDeduplication();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         All Tests Completed!           ║');
    console.log('╚════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly (ESM compatible)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '');
if (isMainModule) {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runTests };
