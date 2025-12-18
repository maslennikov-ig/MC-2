/**
 * Test script: Measure token impact of Zod schema descriptions in prompts
 *
 * Compares token counts before/after zodToPromptSchema() integration
 */

import { zodToPromptSchema, estimateSchemaTokens } from '../src/shared/utils/zod-to-prompt-schema';
import {
  Phase1OutputSchema,
  Phase2OutputSchema,
} from '@megacampus/shared-types/analysis-schemas';
import { CourseMetadataSchema, SectionSchema } from '@megacampus/shared-types/generation-result';

console.log('=== Zod Schema Token Impact Analysis ===\n');

// Test Phase 1 Schema
const phase1Schema = zodToPromptSchema(Phase1OutputSchema);
const phase1Tokens = estimateSchemaTokens(phase1Schema);
console.log('Phase 1 Classification Schema:');
console.log(`- Token count: ${phase1Tokens}`);
console.log(`- Character count: ${phase1Schema.length}`);
console.log(`- Preview (first 200 chars):\n${phase1Schema.substring(0, 200)}...\n`);

// Test Phase 2 Schema
const phase2Schema = zodToPromptSchema(Phase2OutputSchema);
const phase2Tokens = estimateSchemaTokens(phase2Schema);
console.log('Phase 2 Scope Schema:');
console.log(`- Token count: ${phase2Tokens}`);
console.log(`- Character count: ${phase2Schema.length}`);
console.log(`- Preview (first 200 chars):\n${phase2Schema.substring(0, 200)}...\n`);

// Test Course Metadata Schema
const metadataSchema = zodToPromptSchema(CourseMetadataSchema);
const metadataTokens = estimateSchemaTokens(metadataSchema);
console.log('Course Metadata Schema:');
console.log(`- Token count: ${metadataTokens}`);
console.log(`- Character count: ${metadataSchema.length}`);
console.log(`- Preview (first 200 chars):\n${metadataSchema.substring(0, 200)}...\n`);

// Test Section Schema
const sectionSchema = zodToPromptSchema(SectionSchema);
const sectionTokens = estimateSchemaTokens(sectionSchema);
console.log('Section Schema:');
console.log(`- Token count: ${sectionTokens}`);
console.log(`- Character count: ${sectionSchema.length}`);
console.log(`- Preview (first 200 chars):\n${sectionSchema.substring(0, 200)}...\n`);

// Estimated baseline prompt sizes (from investigation of existing prompts)
const baselinePromptEstimates = {
  phase1: 1500, // Existing Phase 1 prompt with hardcoded JSON structure
  phase2: 2000, // Existing Phase 2 prompt
  metadata: 1800, // Existing metadata prompt
  section: 2500, // Existing section prompt
};

console.log('=== Token Impact Comparison ===\n');
console.log('| Generator | Baseline Tokens | Schema Tokens | Total After | % Increase |');
console.log('|-----------|-----------------|---------------|-------------|------------|');
console.log(`| Phase 1   | ${baselinePromptEstimates.phase1.toString().padEnd(15)} | ${phase1Tokens.toString().padEnd(13)} | ${(baselinePromptEstimates.phase1 + phase1Tokens).toString().padEnd(11)} | ${((phase1Tokens / baselinePromptEstimates.phase1) * 100).toFixed(1)}% |`);
console.log(`| Phase 2   | ${baselinePromptEstimates.phase2.toString().padEnd(15)} | ${phase2Tokens.toString().padEnd(13)} | ${(baselinePromptEstimates.phase2 + phase2Tokens).toString().padEnd(11)} | ${((phase2Tokens / baselinePromptEstimates.phase2) * 100).toFixed(1)}% |`);
console.log(`| Metadata  | ${baselinePromptEstimates.metadata.toString().padEnd(15)} | ${metadataTokens.toString().padEnd(13)} | ${(baselinePromptEstimates.metadata + metadataTokens).toString().padEnd(11)} | ${((metadataTokens / baselinePromptEstimates.metadata) * 100).toFixed(1)}% |`);
console.log(`| Section   | ${baselinePromptEstimates.section.toString().padEnd(15)} | ${sectionTokens.toString().padEnd(13)} | ${(baselinePromptEstimates.section + sectionTokens).toString().padEnd(11)} | ${((sectionTokens / baselinePromptEstimates.section) * 100).toFixed(1)}% |`);

console.log('\n=== Full Schema Examples ===\n');
console.log('Phase 1 Schema:\n', phase1Schema);
console.log('\nMetadata Schema:\n', metadataSchema);
