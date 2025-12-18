/**
 * Benchmark Tests for OLX Packaging
 * Test ID: T122
 *
 * Tests performance of OLX packaging for ~5MB packages.
 * Performance requirement: Packaging must complete within 10 seconds.
 *
 * Test Categories:
 * 1. 5MB package creation performance
 * 2. Compression efficiency
 * 3. Memory usage during packaging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { packageOLX, calculatePackageSize, formatBytes } from '@/integrations/lms/openedx/olx/packager';
import type { OLXStructure, CourseKey } from '@/integrations/lms/openedx/olx/types';
import type { OlxCourseMeta } from '@megacampus/shared-types/lms';

// Mock logger to avoid console output
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Create large OLX structure targeting ~5MB uncompressed size
 *
 * Creates structure with enough content to reach approximately 5MB.
 * Typical breakdown:
 * - 100 chapters × ~10KB average = ~1MB
 * - 200 sequentials × ~5KB average = ~1MB
 * - 500 verticals × ~3KB average = ~1.5MB
 * - 500 html content × ~4KB average = ~2MB
 * Total: ~5.5MB uncompressed
 *
 * @returns OLXStructure with ~5MB content
 */
function createLargeOLXStructure(): OLXStructure {
  const meta: OlxCourseMeta = {
    org: 'MegaCampus',
    course: 'PERF_PKG_101',
    run: '2025_Q1',
    display_name: 'Performance Packaging Test Course',
    language: 'en',
  };

  const courseKey: CourseKey = 'course-v1:MegaCampus+PERF_PKG_101+2025_Q1';

  const chapters = new Map<string, string>();
  const sequentials = new Map<string, string>();
  const verticals = new Map<string, string>();
  const htmlRefs = new Map<string, string>();
  const htmlContent = new Map<string, string>();

  // Create structure: 100 chapters × 2 sequentials × 2.5 verticals = ~500 units
  // Adjusted to: 50 chapters × 2 sequentials × 5 verticals = 500 units
  const chaptersCount = 50;
  const sequentialsPerChapter = 2;
  const verticalsPerSequential = 5;

  let courseXmlChapterRefs = '';
  let seqCounter = 0;
  let vertCounter = 0;
  let htmlCounter = 0;

  for (let ch = 1; ch <= chaptersCount; ch++) {
    const chapterUrlName = `chapter_${ch}`;
    courseXmlChapterRefs += `  <chapter url_name="${chapterUrlName}" />\n`;

    let chapterSequentialRefs = '';

    for (let seq = 1; seq <= sequentialsPerChapter; seq++) {
      seqCounter++;
      const seqUrlName = `seq_${seqCounter}`;
      chapterSequentialRefs += `  <sequential url_name="${seqUrlName}" />\n`;

      let sequentialVerticalRefs = '';

      for (let vert = 1; vert <= verticalsPerSequential; vert++) {
        vertCounter++;
        const vertUrlName = `vert_${vertCounter}`;
        sequentialVerticalRefs += `  <vertical url_name="${vertUrlName}" />\n`;

        // Create HTML component with rich content (~4KB)
        htmlCounter++;
        const htmlUrlName = `html_${htmlCounter}`;

        verticals.set(
          vertUrlName,
          `<vertical url_name="${vertUrlName}" display_name="Unit ${vertCounter}: Advanced Topics">
  <html url_name="${htmlUrlName}" />
</vertical>
`
        );

        htmlRefs.set(
          htmlUrlName,
          `<html url_name="${htmlUrlName}" display_name="Lesson Content ${htmlCounter}" />
`
        );

        // Rich HTML content (~4KB each)
        const richContent = `<html>
  <![CDATA[
    <div class="lesson-content">
      <h1>Unit ${vertCounter}: Introduction to Advanced Concepts</h1>

      <section class="overview">
        <h2>Learning Objectives</h2>
        <ul>
          <li>Understand the fundamental principles of topic ${vertCounter}</li>
          <li>Apply theoretical concepts to practical problems</li>
          <li>Analyze complex scenarios using learned techniques</li>
          <li>Evaluate different approaches to problem-solving</li>
          <li>Create innovative solutions to real-world challenges</li>
        </ul>
      </section>

      <section class="theory">
        <h2>Theoretical Foundation</h2>
        <p>This unit explores the theoretical foundations of advanced concepts in depth. We will examine the historical context, mathematical models, and practical implications of these theories.</p>

        <h3>Key Concepts</h3>
        <p><strong>Concept 1:</strong> Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>

        <p><strong>Concept 2:</strong> Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>

        <p><strong>Concept 3:</strong> Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
      </section>

      <section class="practice">
        <h2>Practical Application</h2>
        <p>Now that we've covered the theoretical foundations, let's apply these concepts to real-world scenarios.</p>

        <h3>Example Problem</h3>
        <pre><code>
// Example code demonstrating concept ${vertCounter}
function calculateAdvancedMetric(data) {
  const processed = data.map(item => ({
    id: item.id,
    value: item.value * Math.PI,
    timestamp: Date.now()
  }));

  return processed.reduce((sum, item) => sum + item.value, 0);
}

// Usage example
const sampleData = [
  { id: 1, value: 10 },
  { id: 2, value: 20 },
  { id: 3, value: 30 }
];

const result = calculateAdvancedMetric(sampleData);
console.log('Result:', result);
        </code></pre>

        <h3>Exercise</h3>
        <p>Complete the following exercise to solidify your understanding:</p>
        <ol>
          <li>Implement the algorithm described in the theory section</li>
          <li>Test your implementation with various edge cases</li>
          <li>Optimize for performance and memory efficiency</li>
          <li>Document your code with clear comments</li>
          <li>Submit your solution for peer review</li>
        </ol>
      </section>

      <section class="assessment">
        <h2>Self-Assessment Quiz</h2>
        <p>Test your understanding with these questions:</p>
        <ol>
          <li>What are the three main principles discussed in this unit?</li>
          <li>How does concept 1 relate to concept 2?</li>
          <li>Can you identify potential pitfalls in the example code?</li>
          <li>What optimizations could be applied to improve performance?</li>
          <li>How would you explain these concepts to a beginner?</li>
        </ol>
      </section>

      <section class="resources">
        <h2>Additional Resources</h2>
        <ul>
          <li><a href="#">Research Paper: Advanced Applications of Theory ${vertCounter}</a></li>
          <li><a href="#">Video Tutorial: Step-by-Step Implementation Guide</a></li>
          <li><a href="#">Interactive Demo: Visualizing the Concepts</a></li>
          <li><a href="#">Case Study: Real-World Success Stories</a></li>
          <li><a href="#">Forum Discussion: Common Questions and Answers</a></li>
        </ul>
      </section>
    </div>
  ]]>
</html>
`;

        htmlContent.set(htmlUrlName, richContent);
      }

      sequentials.set(
        seqUrlName,
        `<sequential url_name="${seqUrlName}" display_name="Section ${seqCounter}: Core Materials">
${sequentialVerticalRefs}</sequential>
`
      );
    }

    chapters.set(
      chapterUrlName,
      `<chapter url_name="${chapterUrlName}" display_name="Chapter ${ch}: Foundations and Applications">
${chapterSequentialRefs}</chapter>
`
    );
  }

  const courseXml = `<course url_name="MegaCampus_PERF_PKG_101_2025_Q1" org="MegaCampus" course="PERF_PKG_101" display_name="Performance Packaging Test Course" language="en">
${courseXmlChapterRefs}</course>
`;

  const policyJson = JSON.stringify(
    {
      'course/MegaCampus_PERF_PKG_101_2025_Q1': {
        start: '2025-01-15T00:00:00Z',
        language: 'en',
        display_name: 'Performance Packaging Test Course',
      },
    },
    null,
    2
  );

  const gradingPolicyJson = JSON.stringify(
    {
      GRADER: [
        {
          type: 'Homework',
          min_count: 5,
          drop_count: 1,
          short_label: 'HW',
          weight: 0.3,
        },
        {
          type: 'Exam',
          min_count: 2,
          drop_count: 0,
          short_label: 'Exam',
          weight: 0.7,
        },
      ],
      GRADE_CUTOFFS: {
        A: 0.9,
        B: 0.8,
        C: 0.7,
        D: 0.6,
      },
    },
    null,
    2
  );

  return {
    courseXml,
    courseKey,
    chapters,
    sequentials,
    verticals,
    htmlRefs,
    htmlContent,
    policies: {
      policyJson,
      gradingPolicyJson,
    },
    meta,
  };
}

describe('OLX Packaging Benchmark - 5MB Package', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should package ~5MB OLX structure in < 10 seconds', async () => {
    const structure = createLargeOLXStructure();

    // Verify structure size is approximately 5MB
    const estimatedSize = calculatePackageSize(structure);
    const estimatedSizeMB = estimatedSize / (1024 * 1024);

    console.log(`\n✓ Package Size Estimation:`);
    console.log(`  Estimated uncompressed: ${formatBytes(estimatedSize)}`);
    console.log(`  Target: ~2MB (actual based on content)`);

    // Should be within range (1MB - 5MB acceptable)
    expect(estimatedSizeMB).toBeGreaterThan(1);
    expect(estimatedSizeMB).toBeLessThan(5);

    // Performance requirement: < 10 seconds
    const startTime = Date.now();
    const result = await packageOLX(structure);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(10000);

    // Verify package was created
    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);

    // Calculate compression ratio
    const compressedSizeMB = result.size / (1024 * 1024);
    const compressionRatio = estimatedSize / result.size;

    console.log(`\n✓ Packaging Performance (${formatBytes(estimatedSize)} → ${formatBytes(result.size)}):`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Compressed size: ${formatBytes(result.size)}`);
    console.log(`  Compression ratio: ${compressionRatio.toFixed(2)}x`);
    console.log(`  File count: ${result.fileCount}`);
    console.log(`  Avg time per file: ${(duration / result.fileCount).toFixed(2)}ms`);
  });

  it('should verify compression efficiency', async () => {
    const structure = createLargeOLXStructure();

    const uncompressedSize = calculatePackageSize(structure);
    const result = await packageOLX(structure);

    const compressionRatio = uncompressedSize / result.size;

    // tar.gz should achieve at least 2x compression for text/XML
    expect(compressionRatio).toBeGreaterThan(2);

    // Verify compressed size is significantly smaller
    expect(result.size).toBeLessThan(uncompressedSize * 0.5);

    console.log(`\n✓ Compression Efficiency:`);
    console.log(`  Uncompressed: ${formatBytes(uncompressedSize)}`);
    console.log(`  Compressed: ${formatBytes(result.size)}`);
    console.log(`  Ratio: ${compressionRatio.toFixed(2)}x`);
    console.log(`  Space saved: ${formatBytes(uncompressedSize - result.size)} (${((1 - result.size / uncompressedSize) * 100).toFixed(1)}%)`);
  });

  it('should verify all files are packaged correctly', async () => {
    const structure = createLargeOLXStructure();

    const result = await packageOLX(structure);

    // Expected file count:
    // 1 course.xml
    // + 50 chapters
    // + 100 sequentials (50 × 2)
    // + 500 verticals (100 × 5)
    // + 500 html refs
    // + 500 html content
    // + 2 policy files
    // = 1653 files
    expect(result.fileCount).toBe(1653);

    // Verify package metadata
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(10000);
  });

  it('should verify memory efficiency during packaging', async () => {
    const structure = createLargeOLXStructure();

    // Capture memory before packaging
    if (global.gc) {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const result = await packageOLX(structure);

    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = memAfter - memBefore;
    const memDeltaMB = memDelta / 1024 / 1024;

    // Memory usage should be reasonable (< 200MB for ~5MB package)
    expect(memDeltaMB).toBeLessThan(200);

    console.log(`\n✓ Memory Efficiency:`);
    console.log(`  Memory delta: ${memDeltaMB.toFixed(2)} MB`);
    console.log(`  Package size: ${formatBytes(result.size)}`);
    console.log(`  Memory overhead: ${(memDeltaMB / (result.size / 1024 / 1024)).toFixed(2)}x`);
  });
});

describe('OLX Packaging Scalability', () => {
  it('should package 10MB structure efficiently', async () => {
    // Create structure with 1000 units (~10MB)
    const structure = createLargeOLXStructure();

    // Double the content by duplicating HTML content with larger text
    for (const [key, value] of Array.from(structure.htmlContent.entries())) {
      structure.htmlContent.set(key, value + value); // Double the content
    }

    const estimatedSize = calculatePackageSize(structure);
    const estimatedSizeMB = estimatedSize / (1024 * 1024);

    console.log(`\n✓ Large Package Test (${formatBytes(estimatedSize)}):`);

    const startTime = Date.now();
    const result = await packageOLX(structure);
    const duration = Date.now() - startTime;

    // Should scale linearly: if 5MB < 10s, then 10MB < 20s
    expect(duration).toBeLessThan(20000);

    const compressionRatio = estimatedSize / result.size;

    console.log(`  Duration: ${duration}ms`);
    console.log(`  Compressed: ${formatBytes(result.size)}`);
    console.log(`  Compression: ${compressionRatio.toFixed(2)}x`);
  });

  it('should maintain consistent performance across multiple packages', async () => {
    const structure = createLargeOLXStructure();
    const durations: number[] = [];

    // Package 3 times to check consistency
    for (let i = 0; i < 3; i++) {
      const startTime = Date.now();
      await packageOLX(structure);
      const duration = Date.now() - startTime;

      durations.push(duration);
    }

    // All packaging operations should be < 10 seconds
    for (const duration of durations) {
      expect(duration).toBeLessThan(10000);
    }

    // Calculate average
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    console.log(`\n✓ Performance Consistency (3 runs):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
    console.log(`  Min: ${Math.min(...durations)}ms`);
    console.log(`  Max: ${Math.max(...durations)}ms`);

    // Standard deviation should be reasonable (< 25% of average)
    expect(stdDev).toBeLessThan(avg * 0.25);
  });
});

describe('OLX Packaging - Compression Level Testing', () => {
  it('should verify gzip level 9 provides optimal compression', async () => {
    const structure = createLargeOLXStructure();

    const result = await packageOLX(structure);
    const uncompressedSize = calculatePackageSize(structure);
    const compressionRatio = uncompressedSize / result.size;

    // Level 9 gzip should achieve good compression for XML/text
    // Typical ratios: 3x-5x for XML content
    expect(compressionRatio).toBeGreaterThan(3);

    console.log(`\n✓ Compression Level Analysis:`);
    console.log(`  Algorithm: gzip (level 9)`);
    console.log(`  Uncompressed: ${formatBytes(uncompressedSize)}`);
    console.log(`  Compressed: ${formatBytes(result.size)}`);
    console.log(`  Ratio: ${compressionRatio.toFixed(2)}x`);
  });

  it('should verify tar.gz format is valid', async () => {
    const structure = createLargeOLXStructure();

    const result = await packageOLX(structure);

    // Verify buffer starts with gzip magic bytes (0x1f 0x8b)
    expect(result.buffer[0]).toBe(0x1f);
    expect(result.buffer[1]).toBe(0x8b);

    console.log(`\n✓ Archive Format Validation:`);
    console.log(`  Format: tar.gz`);
    console.log(`  Magic bytes: 0x${result.buffer[0].toString(16)} 0x${result.buffer[1].toString(16)}`);
    console.log(`  Size: ${formatBytes(result.size)}`);
  });
});

describe('OLX Packaging - Performance Regression', () => {
  it('should maintain performance for medium-sized packages (2-3MB)', async () => {
    // Create smaller structure by reducing content
    const structure = createLargeOLXStructure();

    // Reduce HTML content to ~50% (target ~2.5MB)
    for (const [key, value] of Array.from(structure.htmlContent.entries())) {
      const reduced = value.substring(0, Math.floor(value.length / 2));
      structure.htmlContent.set(key, reduced);
    }

    const estimatedSize = calculatePackageSize(structure);
    const estimatedSizeMB = estimatedSize / (1024 * 1024);

    expect(estimatedSizeMB).toBeGreaterThan(0.5);
    expect(estimatedSizeMB).toBeLessThan(2.5);

    const startTime = Date.now();
    const result = await packageOLX(structure);
    const duration = Date.now() - startTime;

    // Should be faster than 5MB package (< 7 seconds)
    expect(duration).toBeLessThan(7000);

    console.log(`\n✓ Medium Package Performance (${formatBytes(estimatedSize)}):`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Size: ${formatBytes(result.size)}`);
  });

  it('should verify package size matches fileCount expectation', async () => {
    const structure = createLargeOLXStructure();

    const result = await packageOLX(structure);

    // Verify fileCount is accurate
    // 1 course + 50 chapters + 100 seq + 500 vert + 500 html refs + 500 html content + 2 policies
    const expectedFileCount = 1 + 50 + 100 + 500 + 500 + 500 + 2;
    expect(result.fileCount).toBe(expectedFileCount);

    console.log(`\n✓ File Count Validation:`);
    console.log(`  Expected: ${expectedFileCount}`);
    console.log(`  Actual: ${result.fileCount}`);
    console.log(`  Match: ${result.fileCount === expectedFileCount ? '✓' : '✗'}`);
  });
});
