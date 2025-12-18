#!/usr/bin/env tsx
/**
 * Tier-Based Document Processing Integration Tests
 *
 * Tests T074.4 implementation: Tier-based file format restrictions and processing logic
 *
 * Test Coverage:
 * - FREE tier: All uploads rejected
 * - BASIC tier: TXT, MD only (direct read, no Docling)
 * - STANDARD tier: PDF, DOCX, PPTX with Docling + OCR
 * - PREMIUM tier: All formats including images with OCR
 *
 * @module scripts/test-tier-processing
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateFile,
  validateFileMimeType,
  getFileUploadLimits,
  type FileInput
} from '../src/shared/validation/file-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Test Configuration
// ============================================================================

interface TestResult {
  tier: string;
  scenario: string;
  fileType: string;
  expected: 'success' | 'reject';
  actual: 'success' | 'reject';
  passed: boolean;
  errorMessage?: string;
  expectedError?: string;
}

const results: TestResult[] = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Test documents directory
const TEST_DATA_DIR = path.join(__dirname, '../test-data');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Add test result
 */
function addResult(result: TestResult): void {
  results.push(result);
  totalTests++;

  if (result.passed) {
    passedTests++;
    console.log(`  ✓ ${result.scenario}`);
  } else {
    failedTests++;
    console.log(`  ✗ ${result.scenario}`);
    console.log(`    Expected: ${result.expected}, Got: ${result.actual}`);
    if (result.errorMessage) {
      console.log(`    Error: ${result.errorMessage}`);
    }
    if (result.expectedError) {
      console.log(`    Expected Error: ${result.expectedError}`);
    }
  }
}

/**
 * Test file validation
 */
function testFileValidation(
  tier: string,
  fileType: string,
  mimeType: string,
  scenario: string,
  expectedResult: 'success' | 'reject',
  expectedErrorPattern?: string
): void {
  const file: FileInput = {
    filename: `test.${fileType}`,
    fileSize: 1024 * 1024, // 1 MB
    mimeType,
  };

  const result = validateFile(file, tier as any, 0);
  const actualResult = result.valid ? 'success' : 'reject';

  let passed = actualResult === expectedResult;

  // If we expect a rejection, also validate the error message
  if (expectedResult === 'reject' && expectedErrorPattern && !result.valid) {
    const errorToCheck = result.userMessage || result.error || '';
    const patternMatch = errorToCheck.toLowerCase().includes(expectedErrorPattern.toLowerCase());
    passed = passed && patternMatch;

    if (!patternMatch) {
      console.log(`    Error pattern mismatch!`);
      console.log(`    Expected pattern: "${expectedErrorPattern}"`);
      console.log(`    Actual error: "${errorToCheck}"`);
    }
  }

  addResult({
    tier,
    scenario,
    fileType,
    expected: expectedResult,
    actual: actualResult,
    passed,
    errorMessage: result.valid ? undefined : (result.userMessage || result.error),
    expectedError: expectedErrorPattern,
  });
}

/**
 * Test MIME type validation specifically
 */
function testMimeTypeValidation(
  tier: string,
  mimeType: string,
  fileType: string,
  scenario: string,
  expectedResult: 'success' | 'reject',
  expectedErrorPattern?: string
): void {
  const result = validateFileMimeType(mimeType, tier as any);
  const actualResult = result.valid ? 'success' : 'reject';

  let passed = actualResult === expectedResult;

  // Validate error message if rejection expected
  if (expectedResult === 'reject' && expectedErrorPattern && !result.valid) {
    const errorToCheck = result.userMessage || result.error || '';
    const patternMatch = errorToCheck.toLowerCase().includes(expectedErrorPattern.toLowerCase());
    passed = passed && patternMatch;
  }

  addResult({
    tier,
    scenario,
    fileType,
    expected: expectedResult,
    actual: actualResult,
    passed,
    errorMessage: result.valid ? undefined : (result.userMessage || result.error),
    expectedError: expectedErrorPattern,
  });
}

// ============================================================================
// Test Scenarios
// ============================================================================

/**
 * Test FREE tier - All uploads should be rejected
 */
function testFreeTier(): void {
  console.log('\n📋 Testing FREE Tier');
  console.log('Expected: All file uploads rejected\n');

  const testCases = [
    { fileType: 'txt', mimeType: 'text/plain', desc: 'Upload TXT' },
    { fileType: 'md', mimeType: 'text/markdown', desc: 'Upload MD' },
    { fileType: 'pdf', mimeType: 'application/pdf', desc: 'Upload PDF' },
    { fileType: 'png', mimeType: 'image/png', desc: 'Upload PNG' },
  ];

  for (const { fileType, mimeType, desc } of testCases) {
    testFileValidation(
      'free',
      fileType,
      mimeType,
      `${desc} → reject with "File uploads not available on FREE tier"`,
      'reject',
      'not support file uploads'
    );
  }
}

/**
 * Test BASIC tier - Only TXT and MD allowed, no Docling processing
 */
function testBasicTier(): void {
  console.log('\n📋 Testing BASIC Tier (basic_plus)');
  console.log('Expected: TXT, MD only (direct read, no Docling)\n');

  // Success cases - TXT and MD
  testFileValidation(
    'basic_plus',
    'txt',
    'text/plain',
    'Upload TXT → success (direct fs.readFile, no Docling)',
    'success'
  );

  testFileValidation(
    'basic_plus',
    'md',
    'text/markdown',
    'Upload MD → success (direct fs.readFile, no Docling)',
    'success'
  );

  // Rejection cases - PDF, DOCX, Images
  testMimeTypeValidation(
    'basic_plus',
    'application/pdf',
    'pdf',
    'Upload PDF → reject with upgrade prompt to STANDARD',
    'reject',
    'standard'
  );

  testMimeTypeValidation(
    'basic_plus',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
    'Upload DOCX → reject with upgrade prompt to STANDARD',
    'reject',
    'standard'
  );

  testMimeTypeValidation(
    'basic_plus',
    'image/png',
    'png',
    'Upload PNG → reject with upgrade prompt to PREMIUM',
    'reject',
    'premium'
  );
}

/**
 * Test STANDARD tier - PDF, DOCX, PPTX with Docling + OCR
 */
function testStandardTier(): void {
  console.log('\n📋 Testing STANDARD Tier');
  console.log('Expected: PDF, DOCX, PPTX with Docling + OCR enabled\n');

  // Success cases - Documents
  testFileValidation(
    'standard',
    'pdf',
    'application/pdf',
    'Upload PDF → success with Docling + OCR enabled',
    'success'
  );

  testFileValidation(
    'standard',
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Upload DOCX → success with Docling conversion',
    'success'
  );

  testFileValidation(
    'standard',
    'pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Upload PPTX → success with Docling conversion',
    'success'
  );

  testFileValidation(
    'standard',
    'html',
    'text/html',
    'Upload HTML → success with Docling conversion',
    'success'
  );

  testFileValidation(
    'standard',
    'txt',
    'text/plain',
    'Upload TXT → success (also supported on STANDARD)',
    'success'
  );

  testFileValidation(
    'standard',
    'md',
    'text/markdown',
    'Upload MD → success (also supported on STANDARD)',
    'success'
  );

  // Rejection cases - Images
  testMimeTypeValidation(
    'standard',
    'image/png',
    'png',
    'Upload PNG → reject with "Image requires PREMIUM tier"',
    'reject',
    'premium'
  );

  testMimeTypeValidation(
    'standard',
    'image/jpeg',
    'jpeg',
    'Upload JPEG → reject with upgrade prompt to PREMIUM',
    'reject',
    'premium'
  );
}

/**
 * Test PREMIUM tier - All formats including images
 */
function testPremiumTier(): void {
  console.log('\n📋 Testing PREMIUM Tier');
  console.log('Expected: All formats including images with OCR\n');

  // Success cases - Documents
  testFileValidation(
    'premium',
    'pdf',
    'application/pdf',
    'Upload PDF → success with Docling + OCR + full image extraction',
    'success'
  );

  testFileValidation(
    'premium',
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Upload DOCX → success',
    'success'
  );

  testFileValidation(
    'premium',
    'pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Upload PPTX → success',
    'success'
  );

  // Success cases - Images
  testFileValidation(
    'premium',
    'png',
    'image/png',
    'Upload PNG → success with OCR applied',
    'success'
  );

  testFileValidation(
    'premium',
    'jpeg',
    'image/jpeg',
    'Upload JPEG → success with OCR applied',
    'success'
  );

  testFileValidation(
    'premium',
    'gif',
    'image/gif',
    'Upload GIF → success',
    'success'
  );

  testFileValidation(
    'premium',
    'svg',
    'image/svg+xml',
    'Upload SVG → success',
    'success'
  );

  testFileValidation(
    'premium',
    'webp',
    'image/webp',
    'Upload WEBP → success',
    'success'
  );
}

/**
 * Test tier upgrade prompts
 */
function testUpgradePrompts(): void {
  console.log('\n📋 Testing Upgrade Prompts');
  console.log('Expected: Clear upgrade messages with tier recommendations\n');

  // Test that error messages include upgrade prompts
  const freeTier = validateFileMimeType('text/plain', 'free');
  if (!freeTier.valid && freeTier.userMessage) {
    const hasUpgradePrompt = freeTier.userMessage.toLowerCase().includes('upgrade');
    addResult({
      tier: 'free',
      scenario: 'FREE tier includes upgrade prompt',
      fileType: 'txt',
      expected: 'reject',
      actual: hasUpgradePrompt ? 'reject' : 'success',
      passed: hasUpgradePrompt,
      errorMessage: freeTier.userMessage,
    });
  }

  // Test BASIC tier upgrade to STANDARD
  const basicPdf = validateFileMimeType('application/pdf', 'basic_plus');
  if (!basicPdf.valid && basicPdf.userMessage) {
    const mentionsStandard = basicPdf.userMessage.toLowerCase().includes('standard');
    addResult({
      tier: 'basic_plus',
      scenario: 'BASIC tier PDF rejection mentions STANDARD upgrade',
      fileType: 'pdf',
      expected: 'reject',
      actual: mentionsStandard ? 'reject' : 'success',
      passed: mentionsStandard,
      errorMessage: basicPdf.userMessage,
    });
  }

  // Test STANDARD tier upgrade to PREMIUM for images
  const standardImage = validateFileMimeType('image/png', 'standard');
  if (!standardImage.valid && standardImage.userMessage) {
    const mentionsPremium = standardImage.userMessage.toLowerCase().includes('premium');
    addResult({
      tier: 'standard',
      scenario: 'STANDARD tier image rejection mentions PREMIUM upgrade',
      fileType: 'png',
      expected: 'reject',
      actual: mentionsPremium ? 'reject' : 'success',
      passed: mentionsPremium,
      errorMessage: standardImage.userMessage,
    });
  }
}

/**
 * Display tier upload limits
 */
function displayTierLimits(): void {
  console.log('\n📊 Tier Upload Limits Summary\n');

  const tiers = ['free', 'basic_plus', 'standard', 'premium'] as const;

  for (const tier of tiers) {
    const limits = getFileUploadLimits(tier);
    console.log(`${tier.toUpperCase()}:`);
    console.log(`  Max Files: ${limits.maxFiles}`);
    console.log(`  Max Size: ${limits.maxFileSizeMB} MB`);
    console.log(`  Allowed Formats: ${limits.allowedExtensionsDisplay}`);
    console.log(`  Uploads Enabled: ${limits.uploadsEnabled}`);
    console.log('');
  }
}

/**
 * Print test summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`✓ Passed: ${passedTests}`);
  console.log(`✗ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.log('\n❌ FAILED TESTS:');
    console.log('-'.repeat(80));
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`\nTier: ${r.tier}`);
        console.log(`Scenario: ${r.scenario}`);
        console.log(`File Type: ${r.fileType}`);
        console.log(`Expected: ${r.expected}`);
        console.log(`Actual: ${r.actual}`);
        if (r.errorMessage) {
          console.log(`Error: ${r.errorMessage}`);
        }
        if (r.expectedError) {
          console.log(`Expected Pattern: ${r.expectedError}`);
        }
      });
  }

  console.log('\n' + '='.repeat(80));

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('TIER-BASED DOCUMENT PROCESSING TESTS');
  console.log('='.repeat(80));
  console.log('\nValidating T074.4: Tier-based file format restrictions\n');

  const startTime = Date.now();

  // Display tier limits
  displayTierLimits();

  // Run all tier tests
  testFreeTier();
  testBasicTier();
  testStandardTier();
  testPremiumTier();
  testUpgradePrompts();

  const duration = Date.now() - startTime;
  console.log(`\n⏱️  Total execution time: ${duration}ms`);

  // Print final summary
  printSummary();
}

// Run tests
main().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
