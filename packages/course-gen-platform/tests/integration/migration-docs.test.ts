/**
 * Migration Documentation Validation Test
 *
 * Validates that the Jina-v3 migration documentation (docs/jina-v3-migration.md)
 * is complete and contains all required sections for production readiness.
 *
 * Test execution: pnpm test tests/integration/migration-docs.test.ts
 *
 * Validation criteria:
 * 1. Documentation file exists
 * 2. All required sections present
 * 3. Validation checklist has minimum 5 items
 * 4. Code examples properly formatted
 * 5. Quantitative metrics provided (numbers, not just text)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Path to migration documentation
 */
const DOCS_PATH = resolve(__dirname, '../../docs/jina-v3-migration.md');

/**
 * Required sections that must be present in documentation
 */
const REQUIRED_SECTIONS = [
  'Overview',
  'Trigger Conditions',
  'Prerequisites',
  'Self-Hosted Setup',
  'API Compatibility',
  'Cost Analysis',
  'Migration Strategy',
  'Testing & Validation',
  'Monitoring & Maintenance',
  'Troubleshooting',
  'Validation Checklist',
];

/**
 * Minimum number of checklist items required
 */
const MIN_CHECKLIST_ITEMS = 5;

/**
 * Code block types that should be present
 */
const REQUIRED_CODE_BLOCKS = [
  'bash',
  'yaml',
  'typescript',
];

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Reads migration documentation file
 */
function readMigrationDocs(): string {
  if (!existsSync(DOCS_PATH)) {
    throw new Error(`Migration documentation not found at: ${DOCS_PATH}`);
  }

  return readFileSync(DOCS_PATH, 'utf-8');
}

/**
 * Extracts section headings from markdown
 */
function extractSections(markdown: string): string[] {
  const headingRegex = /^##\s+(.+)$/gm;
  const sections: string[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    sections.push(match[1].trim());
  }

  return sections;
}

/**
 * Counts checklist items (lines starting with - [ ])
 */
function countChecklistItems(markdown: string): number {
  const checklistRegex = /^-\s+\[[ x]\]/gm;
  const matches = markdown.match(checklistRegex);
  return matches ? matches.length : 0;
}

/**
 * Extracts code block languages from markdown
 */
function extractCodeBlockLanguages(markdown: string): string[] {
  const codeBlockRegex = /```(\w+)/g;
  const languages: string[] = [];
  let match;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    languages.push(match[1]);
  }

  return languages;
}

/**
 * Checks if markdown contains quantitative metrics (numbers)
 */
function hasQuantitativeMetrics(markdown: string): boolean {
  // Look for patterns like "20GB", "100K", "$150", ">500ms", "8 vCPU", "16GB RAM"
  const quantitativePatterns = [
    /\d+\s*GB/gi,           // Storage/RAM sizes (20GB)
    /\d+K/gi,               // Thousands (100K)
    /\$\d+/gi,              // Costs ($150)
    />\s*\d+\s*ms/gi,       // Latency (>500ms)
    /\d+\s*vCPU/gi,         // CPU cores (4 vCPU)
    /\d+\s*GB\s*RAM/gi,     // RAM (8GB RAM)
    /\d+%/gi,               // Percentages (90%)
    /\d+,\d+/gi,            // Large numbers with commas (100,000)
  ];

  return quantitativePatterns.some(pattern => pattern.test(markdown));
}

/**
 * Checks if section contains specific keywords
 */
function sectionContainsKeywords(markdown: string, sectionName: string, keywords: string[]): boolean {
  // Split document into sections by ## headings
  const sections = markdown.split(/\n## /);

  // Find the section that matches the section name
  const targetSection = sections.find(section => {
    const firstLine = section.split('\n')[0].toLowerCase();
    return firstLine.includes(sectionName.toLowerCase());
  });

  if (!targetSection) {
    return false;
  }

  const sectionContent = targetSection.toLowerCase();
  return keywords.every(keyword => sectionContent.includes(keyword.toLowerCase()));
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Migration Documentation Validation', () => {
  let docsContent: string;

  // Read documentation once before all tests
  try {
    docsContent = readMigrationDocs();
  } catch (error) {
    console.error('Failed to read migration documentation:', error);
    docsContent = '';
  }

  // ==========================================================================
  // Test 1: Documentation File Exists
  // ==========================================================================

  it('should have migration documentation file at docs/jina-v3-migration.md', () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
    expect(docsContent.length).toBeGreaterThan(0);

    console.log(`✓ Documentation file exists: ${DOCS_PATH}`);
    console.log(`✓ File size: ${(docsContent.length / 1024).toFixed(1)} KB`);
  });

  // ==========================================================================
  // Test 2: All Required Sections Present
  // ==========================================================================

  it('should contain all required sections', () => {
    const sections = extractSections(docsContent);

    console.log(`\nFound ${sections.length} sections:`);

    for (const requiredSection of REQUIRED_SECTIONS) {
      const found = sections.some(section => section.includes(requiredSection));
      expect(found).toBe(true);

      if (found) {
        console.log(`  ✓ ${requiredSection}`);
      } else {
        console.log(`  ✗ ${requiredSection} (MISSING)`);
      }
    }

    // Verify we have all required sections
    const missingSections = REQUIRED_SECTIONS.filter(
      required => !sections.some(section => section.includes(required))
    );

    expect(missingSections).toHaveLength(0);
  });

  // ==========================================================================
  // Test 3: Validation Checklist Present
  // ==========================================================================

  it('should have validation checklist with at least 5 items', () => {
    const checklistCount = countChecklistItems(docsContent);

    expect(checklistCount).toBeGreaterThanOrEqual(MIN_CHECKLIST_ITEMS);

    console.log(`✓ Validation checklist has ${checklistCount} items (minimum: ${MIN_CHECKLIST_ITEMS})`);
  });

  // ==========================================================================
  // Test 4: Code Examples Properly Formatted
  // ==========================================================================

  it('should have properly formatted code examples', () => {
    const codeBlockLanguages = extractCodeBlockLanguages(docsContent);
    const uniqueLanguages = Array.from(new Set(codeBlockLanguages));

    console.log(`\nFound ${codeBlockLanguages.length} code blocks with ${uniqueLanguages.length} unique languages:`);
    console.log(`  Languages: ${uniqueLanguages.join(', ')}`);

    // Check for required code block types
    for (const requiredLang of REQUIRED_CODE_BLOCKS) {
      const found = uniqueLanguages.includes(requiredLang);
      expect(found).toBe(true);

      if (found) {
        const count = codeBlockLanguages.filter(lang => lang === requiredLang).length;
        console.log(`  ✓ ${requiredLang} (${count} blocks)`);
      } else {
        console.log(`  ✗ ${requiredLang} (MISSING)`);
      }
    }

    // Verify no unclosed code blocks
    const openingBlocks = (docsContent.match(/```/g) || []).length;
    expect(openingBlocks % 2).toBe(0); // Even number means all blocks are closed

    console.log(`✓ All code blocks properly closed (${openingBlocks / 2} total blocks)`);
  });

  // ==========================================================================
  // Test 5: Trigger Conditions Section Has Quantitative Metrics
  // ==========================================================================

  it('should define trigger conditions with quantitative metrics', () => {
    // Check for specific numeric triggers
    const triggerMetrics = [
      /20\s*GB/i,                    // Data volume threshold
      /100,?000|100K/i,              // Query volume threshold
      /\$150/i,                      // Cost threshold
      /500\s*ms/i,                   // Latency threshold
      /1,?500\s*embeddings/i,        // Throughput threshold
    ];

    console.log('\nChecking trigger condition metrics:');

    for (const metric of triggerMetrics) {
      const found = metric.test(docsContent);
      expect(found).toBe(true);

      if (found) {
        const match = docsContent.match(metric);
        console.log(`  ✓ Found trigger metric: ${match?.[0]}`);
      }
    }

    console.log('✓ All trigger conditions have quantitative metrics');
  });

  // ==========================================================================
  // Test 6: Infrastructure Requirements Specified
  // ==========================================================================

  it('should specify infrastructure requirements (Docker, RAM, CPU)', () => {
    // Check for specific hardware specs anywhere in document
    const hardwareSpecs = [
      /8\s*GB\s*RAM|8GB|16GB RAM/i,  // RAM requirement
      /4\s*vCPU|8 vCPU/i,              // CPU requirement
      /docker/i,                       // Docker requirement
    ];

    console.log('\nChecking infrastructure specifications:');

    for (const spec of hardwareSpecs) {
      const found = spec.test(docsContent);
      expect(found).toBe(true);

      if (found) {
        const match = docsContent.match(spec);
        console.log(`  ✓ Found spec: ${match?.[0]}`);
      }
    }

    console.log('✓ Infrastructure requirements properly specified');
  });

  // ==========================================================================
  // Test 7: Zero-Downtime Migration Strategy Documented
  // ==========================================================================

  it('should document zero-downtime migration strategy', () => {
    // Check for phased rollout percentages anywhere in document
    const rolloutPhases = [
      /10%/i,
      /25%/i,
      /50%/i,
      /100%/i,
    ];

    console.log('\nChecking migration phases:');

    let phasesFound = 0;
    for (const phase of rolloutPhases) {
      if (phase.test(docsContent)) {
        phasesFound++;
        const match = docsContent.match(phase);
        console.log(`  ✓ Found phase: ${match?.[0]} traffic`);
      }
    }

    expect(phasesFound).toBeGreaterThanOrEqual(3); // At least 3 phases

    // Check for key migration concepts
    expect(/zero-downtime|fallback|rollback/i.test(docsContent)).toBe(true);

    console.log('✓ Zero-downtime migration strategy documented');
  });

  // ==========================================================================
  // Test 8: Cost Comparison Present
  // ==========================================================================

  it('should include cost comparison (hosted vs self-hosted)', () => {
    const costKeywords = ['cost', 'hosted', 'self-hosted', 'pricing', 'savings'];

    const hasCostAnalysis = sectionContainsKeywords(
      docsContent,
      'Cost Analysis',
      costKeywords
    );

    expect(hasCostAnalysis).toBe(true);

    // Check for cost calculations
    const costMetrics = [
      /\$\d+\/month/i,               // Monthly cost
      /\d+%\s*savings/i,             // Percentage savings
      /break-?even/i,                // Break-even analysis
    ];

    console.log('\nChecking cost analysis metrics:');

    for (const metric of costMetrics) {
      const found = metric.test(docsContent);
      expect(found).toBe(true);

      if (found) {
        const match = docsContent.match(metric);
        console.log(`  ✓ Found cost metric: ${match?.[0]}`);
      }
    }

    console.log('✓ Cost comparison properly documented');
  });

  // ==========================================================================
  // Test 9: API Compatibility Strategy Documented
  // ==========================================================================

  it('should document API compatibility strategy', () => {
    const compatibilityKeywords = [
      'api',
      'compatibility',
      'endpoint',
      'request',
      'response',
      'environment variable',
    ];

    const hasCompatibilitySection = sectionContainsKeywords(
      docsContent,
      'API Compatibility',
      compatibilityKeywords
    );

    expect(hasCompatibilitySection).toBe(true);

    // Check for code examples showing endpoint switching
    const hasEndpointExample = /JINA_ENDPOINT/i.test(docsContent);
    expect(hasEndpointExample).toBe(true);

    console.log('✓ API compatibility strategy documented');
    console.log('✓ Environment variable switching example present');
  });

  // ==========================================================================
  // Test 10: Testing & Validation Section Complete
  // ==========================================================================

  it('should have testing and validation procedures', () => {
    // Check for specific test types in the entire document
    const testTypes = [
      /embedding\s+consistency/i,
      /load\s+test/i,
      /performance/i,
      /latency/i,
    ];

    console.log('\nChecking test coverage:');

    for (const testType of testTypes) {
      const found = testType.test(docsContent);
      expect(found).toBe(true);

      if (found) {
        const match = docsContent.match(testType);
        console.log(`  ✓ Found test type: ${match?.[0]}`);
      }
    }

    console.log('✓ Testing and validation procedures documented');
  });

  // ==========================================================================
  // Test 11: Monitoring Section Present
  // ==========================================================================

  it('should document monitoring and maintenance procedures', () => {
    const monitoringKeywords = [
      'monitoring',
      'metrics',
      'alerts',
      'logging',
      'health check',
    ];

    const hasMonitoringSection = sectionContainsKeywords(
      docsContent,
      'Monitoring & Maintenance',
      monitoringKeywords
    );

    expect(hasMonitoringSection).toBe(true);

    // Check for specific monitoring tools/metrics
    const monitoringTools = [
      /cloudwatch|prometheus|grafana/i,
      /cpu\s+utilization/i,
      /latency/i,
      /error\s+rate/i,
    ];

    console.log('\nChecking monitoring coverage:');

    for (const tool of monitoringTools) {
      const found = tool.test(docsContent);
      expect(found).toBe(true);

      if (found) {
        const match = docsContent.match(tool);
        console.log(`  ✓ Found monitoring element: ${match?.[0]}`);
      }
    }

    console.log('✓ Monitoring and maintenance procedures documented');
  });

  // ==========================================================================
  // Test 12: Troubleshooting Guide Present
  // ==========================================================================

  it('should include troubleshooting guide', () => {
    // Count number of troubleshooting scenarios (look for "Issue" headings)
    const issueCount = (docsContent.match(/####+\s+Issue\s+\d+:/gi) || []).length;
    expect(issueCount).toBeGreaterThanOrEqual(3); // At least 3 common issues

    // Check for troubleshooting-related content
    expect(/symptoms?|diagnosis|solutions?/i.test(docsContent)).toBe(true);

    console.log(`✓ Troubleshooting guide with ${issueCount} documented issues`);
  });

  // ==========================================================================
  // Test 13: Document Metadata Present
  // ==========================================================================

  it('should have document metadata (version, date, status)', () => {
    const metadataPatterns = [
      /\*\*version\*\*:\s*\d+\.\d+/i,
      /\*\*last\s+updated\*\*:\s*\d{4}-\d{2}-\d{2}/i,
      /\*\*status\*\*:/i,
    ];

    console.log('\nChecking document metadata:');

    let foundCount = 0;
    for (const pattern of metadataPatterns) {
      const found = pattern.test(docsContent);
      if (found) {
        foundCount++;
        const match = docsContent.match(pattern);
        console.log(`  ✓ ${match?.[0]}`);
      }
    }

    // Require at least 2 out of 3 metadata fields
    expect(foundCount).toBeGreaterThanOrEqual(2);

    console.log('✓ Document metadata present');
  });

  // ==========================================================================
  // Test 14: Table of Contents Present
  // ==========================================================================

  it('should have table of contents for navigation', () => {
    const hasTOC = /##\s+Table\s+of\s+Contents/i.test(docsContent);
    expect(hasTOC).toBe(true);

    // Count TOC entries (lines with numbered list and links)
    const tocEntries = (docsContent.match(/^\d+\.\s+\[.+?\]\(#.+?\)$/gm) || []).length;
    expect(tocEntries).toBeGreaterThanOrEqual(10); // At least 10 sections in TOC

    console.log(`✓ Table of contents with ${tocEntries} entries`);
  });

  // ==========================================================================
  // Test 15: Overall Documentation Quality
  // ==========================================================================

  it('should meet overall documentation quality standards', () => {
    // Check document length (should be comprehensive)
    const wordCount = docsContent.split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(5000); // At least 5000 words

    // Check for quantitative metrics throughout document
    expect(hasQuantitativeMetrics(docsContent)).toBe(true);

    // Check for proper markdown formatting (no broken links)
    const brokenLinks = docsContent.match(/\[([^\]]+)\]\(\)/g);
    expect(brokenLinks).toBeNull(); // No empty links

    console.log('\n✓ Documentation Quality Summary:');
    console.log(`  - Word count: ${wordCount.toLocaleString()} words`);
    console.log(`  - Sections: ${REQUIRED_SECTIONS.length} required sections`);
    console.log(`  - Code blocks: ${extractCodeBlockLanguages(docsContent).length} examples`);
    console.log(`  - Checklist items: ${countChecklistItems(docsContent)} validation items`);
    console.log(`  - File size: ${(docsContent.length / 1024).toFixed(1)} KB`);
    console.log('\n✅ All documentation validation tests passed!');
  });
});
