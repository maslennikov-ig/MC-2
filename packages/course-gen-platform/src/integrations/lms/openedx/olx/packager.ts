/**
 * OLX Packager
 * @module integrations/lms/openedx/olx/packager
 *
 * Packages OLX structure into tar.gz archive for Open edX import.
 * Uses archiver library for reliable tar.gz creation.
 */

import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { OLXStructure } from './types';
import { lmsLogger } from '../../logger';
import { OLXValidationError } from '@megacampus/shared-types/lms/errors';

/**
 * Maximum package size in bytes (100 MB)
 *
 * Open edX typically has a 100MB limit for course imports.
 * This limit prevents upload failures and ensures compatibility.
 */
export const MAX_PACKAGE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * Maximum package size in megabytes
 *
 * Human-readable representation of the size limit.
 */
export const MAX_PACKAGE_SIZE_MB = 100;

/**
 * Gzip compression level for OLX packages
 *
 * Level 9 provides maximum compression for minimal package size.
 * Trade-off: Higher CPU usage during packaging, but smaller transfers.
 */
export const GZIP_COMPRESSION_LEVEL = 9;

/**
 * Package result metadata
 *
 * Contains information about the created package.
 */
export interface PackageResult {
  /** Package size in bytes */
  size: number;
  /** Number of files in package */
  fileCount: number;
  /** Time taken to create package (ms) */
  duration: number;
  /** Package buffer data */
  buffer: Buffer;
}

/**
 * Format bytes to human-readable string
 *
 * Converts byte count to MB with one decimal place.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "125.3 MB")
 *
 * @example
 * ```typescript
 * formatBytes(1048576); // "1.0 MB"
 * formatBytes(125829120); // "120.0 MB"
 * ```
 */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Calculate estimated package size before compression
 *
 * Sums the size of all strings in the OLX structure to estimate
 * uncompressed package size. The actual compressed tar.gz will be smaller,
 * but this provides a conservative upper bound for validation.
 *
 * @param structure - OLX structure to measure
 * @returns Estimated size in bytes (uncompressed)
 *
 * @example
 * ```typescript
 * const size = calculatePackageSize(olxStructure);
 * console.log(`Estimated size: ${formatBytes(size)}`);
 * ```
 */
export function calculatePackageSize(structure: OLXStructure): number {
  let totalSize = 0;

  // course.xml
  totalSize += Buffer.byteLength(structure.courseXml, 'utf-8');

  // Chapter files
  for (const content of structure.chapters.values()) {
    totalSize += Buffer.byteLength(content, 'utf-8');
  }

  // Sequential files
  for (const content of structure.sequentials.values()) {
    totalSize += Buffer.byteLength(content, 'utf-8');
  }

  // Vertical files
  for (const content of structure.verticals.values()) {
    totalSize += Buffer.byteLength(content, 'utf-8');
  }

  // HTML reference files
  for (const content of structure.htmlRefs.values()) {
    totalSize += Buffer.byteLength(content, 'utf-8');
  }

  // HTML content files
  for (const content of structure.htmlContent.values()) {
    totalSize += Buffer.byteLength(content, 'utf-8');
  }

  // Policy files
  totalSize += Buffer.byteLength(structure.policies.policyJson, 'utf-8');
  totalSize += Buffer.byteLength(structure.policies.gradingPolicyJson, 'utf-8');

  return totalSize;
}

/**
 * Validate package size before packaging
 *
 * Checks if the OLX structure will exceed the maximum allowed package size.
 * Throws OLXValidationError with detailed guidance if size limit is exceeded.
 *
 * Note: This calculates uncompressed size as a conservative estimate.
 * Actual tar.gz will be smaller due to compression.
 *
 * @param structure - OLX structure to validate
 * @throws {OLXValidationError} If package size exceeds MAX_PACKAGE_SIZE_BYTES
 *
 * @example
 * ```typescript
 * try {
 *   validatePackageSize(olxStructure);
 *   const result = await packageOLX(olxStructure);
 * } catch (error) {
 *   if (error instanceof OLXValidationError) {
 *     console.error('Package too large:', error.message);
 *   }
 * }
 * ```
 */
export function validatePackageSize(structure: OLXStructure): void {
  const estimatedSize = calculatePackageSize(structure);

  if (estimatedSize > MAX_PACKAGE_SIZE_BYTES) {
    const sizeStr = formatBytes(estimatedSize);
    const maxSizeStr = formatBytes(MAX_PACKAGE_SIZE_BYTES);

    const message = `Package size (${sizeStr}) exceeds Open edX limit (${maxSizeStr})

To reduce package size, consider:
  - Removing large media files (images, videos)
  - Using external video hosting (YouTube, Vimeo)
  - Splitting content into multiple smaller courses
  - Compressing images before upload
  - Removing unused HTML content`;

    throw new OLXValidationError(message, [
      {
        path: 'package',
        message: `Package size ${sizeStr} exceeds limit ${maxSizeStr}`,
        severity: 'error',
      },
    ]);
  }
}

/**
 * Package OLX structure into tar.gz buffer
 *
 * Creates a tar.gz archive with the complete OLX course structure.
 * Archive follows Open edX OLX directory structure:
 *
 * ```
 * course/
 *   course.xml
 *   chapter/{url_name}.xml
 *   sequential/{url_name}.xml
 *   vertical/{url_name}.xml
 *   html/{url_name}.xml (reference files)
 *   html/{url_name}.html (content files)
 *   policies/{run}/policy.json
 *   policies/{run}/grading_policy.json
 * ```
 *
 * @param structure - OLX structure to package
 * @returns Promise resolving to package result with buffer and metadata
 * @throws {Error} If archiver encounters errors during packaging
 *
 * @example
 * ```typescript
 * const generator = new OLXGenerator();
 * const olxStructure = generator.generate(courseInput);
 *
 * const result = await packageOLX(olxStructure);
 * console.log(`Package created: ${result.size} bytes, ${result.fileCount} files`);
 *
 * // Write to file
 * await fs.promises.writeFile('course.tar.gz', result.buffer);
 *
 * // Or upload directly
 * await uploadToOpenEdX(result.buffer);
 * ```
 */
export async function packageOLX(structure: OLXStructure): Promise<PackageResult> {
  const startTime = Date.now();

  // Validate package size before creating archive
  validatePackageSize(structure);

  lmsLogger.info(
    {
      courseKey: structure.courseKey,
      chapters: structure.chapters.size,
      sequentials: structure.sequentials.size,
      verticals: structure.verticals.size,
      htmlFiles: structure.htmlContent.size,
    },
    'Starting OLX packaging'
  );

  return new Promise((resolve, reject) => {
    // Create buffer stream to collect archive data
    const bufferStream = new PassThrough();
    const chunks: Buffer[] = [];

    bufferStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    bufferStream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const duration = Date.now() - startTime;

      lmsLogger.info(
        {
          courseKey: structure.courseKey,
          size: buffer.length,
          fileCount: archive.pointer(),
          duration,
        },
        'OLX packaging completed'
      );

      resolve({
        size: buffer.length,
        fileCount: fileCount,
        duration,
        buffer,
      });
    });

    // Create archiver instance with tar + gzip
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: GZIP_COMPRESSION_LEVEL,
      },
    });

    // Track file count
    let fileCount = 0;

    // Handle archiver errors
    archive.on('error', (err: Error) => {
      lmsLogger.error(
        {
          courseKey: structure.courseKey ?? 'unknown',
          error: err.message,
        },
        'OLX packaging failed'
      );
      reject(err);
    });

    // Pipe archive to buffer stream
    archive.pipe(bufferStream);

    // Add course.xml
    archive.append(structure.courseXml, { name: 'course/course.xml' });
    fileCount++;

    // Add chapter files
    for (const [urlName, content] of Array.from(structure.chapters.entries())) {
      archive.append(content, { name: `course/chapter/${urlName}.xml` });
      fileCount++;
    }

    // Add sequential files
    for (const [urlName, content] of Array.from(structure.sequentials.entries())) {
      archive.append(content, { name: `course/sequential/${urlName}.xml` });
      fileCount++;
    }

    // Add vertical files
    for (const [urlName, content] of Array.from(structure.verticals.entries())) {
      archive.append(content, { name: `course/vertical/${urlName}.xml` });
      fileCount++;
    }

    // Add HTML reference files (.xml)
    for (const [urlName, content] of Array.from(structure.htmlRefs.entries())) {
      archive.append(content, { name: `course/html/${urlName}.xml` });
      fileCount++;
    }

    // Add HTML content files (.html)
    for (const [urlName, content] of Array.from(structure.htmlContent.entries())) {
      archive.append(content, { name: `course/html/${urlName}.html` });
      fileCount++;
    }

    // Add policy files
    const run = structure.meta.run;
    archive.append(structure.policies.policyJson, {
      name: `course/policies/${run}/policy.json`,
    });
    fileCount++;

    archive.append(structure.policies.gradingPolicyJson, {
      name: `course/policies/${run}/grading_policy.json`,
    });
    fileCount++;

    // Finalize archive (triggers compression and stream end)
    // Handle finalize() promise to catch any errors during finalization
    archive.finalize().catch((err: Error) => {
      lmsLogger.error(
        { courseKey: structure.courseKey ?? 'unknown', error: err.message },
        'Archive finalization failed'
      );
      reject(err);
    });
  });
}

/**
 * Get file list for OLX package
 *
 * Returns array of all file paths that will be included in the package.
 * Useful for debugging, logging, or displaying package contents.
 *
 * @param structure - OLX structure to inspect
 * @returns Array of file paths in the package
 *
 * @example
 * ```typescript
 * const fileList = getOLXFileList(olxStructure);
 * console.log('Package will contain:');
 * fileList.forEach(path => console.log(`  - ${path}`));
 * ```
 */
export function getOLXFileList(structure: OLXStructure): string[] {
  const files: string[] = [];

  // Add course.xml
  files.push('course/course.xml');

  // Add chapter files
  for (const urlName of Array.from(structure.chapters.keys())) {
    files.push(`course/chapter/${urlName}.xml`);
  }

  // Add sequential files
  for (const urlName of Array.from(structure.sequentials.keys())) {
    files.push(`course/sequential/${urlName}.xml`);
  }

  // Add vertical files
  for (const urlName of Array.from(structure.verticals.keys())) {
    files.push(`course/vertical/${urlName}.xml`);
  }

  // Add HTML reference files
  for (const urlName of Array.from(structure.htmlRefs.keys())) {
    files.push(`course/html/${urlName}.xml`);
  }

  // Add HTML content files
  for (const urlName of Array.from(structure.htmlContent.keys())) {
    files.push(`course/html/${urlName}.html`);
  }

  // Add policy files
  const run = structure.meta.run;
  files.push(`course/policies/${run}/policy.json`);
  files.push(`course/policies/${run}/grading_policy.json`);

  return files.sort();
}
