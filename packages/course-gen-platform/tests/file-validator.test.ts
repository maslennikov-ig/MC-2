/**
 * Tests for file validation utility
 * @module shared/validation/file-validator.test
 */

import { describe, it, expect } from 'vitest';
import {
  validateFileSize,
  validateFileMimeType,
  validateFileCount,
  validateFile,
  validateFileOrThrow,
  getFileUploadLimits,
  isFileTypeSupported,
  getMinimumTierForFileType,
  type FileInput,
} from '../src/shared/validation/file-validator';
import { ValidationError } from '../src/server/errors/typed-errors';
import { MAX_FILE_SIZE_BYTES } from '@megacampus/shared-types';

// ============================================================================
// Test Data
// ============================================================================

const validPdf: FileInput = {
  filename: 'document.pdf',
  fileSize: 1024 * 1024, // 1 MB
  mimeType: 'application/pdf',
};

const validImage: FileInput = {
  filename: 'image.png',
  fileSize: 500 * 1024, // 500 KB
  mimeType: 'image/png',
};

const validDocx: FileInput = {
  filename: 'document.docx',
  fileSize: 2 * 1024 * 1024, // 2 MB
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const oversizedFile: FileInput = {
  filename: 'large.pdf',
  fileSize: 150 * 1024 * 1024, // 150 MB
  mimeType: 'application/pdf',
};

const invalidFile: FileInput = {
  filename: 'video.mp4',
  fileSize: 1024 * 1024,
  mimeType: 'video/mp4',
};

// ============================================================================
// validateFileSize Tests
// ============================================================================

describe('validateFileSize', () => {
  it('should reject files for free tier', () => {
    const result = validateFileSize(validPdf.fileSize, 'free');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed for free tier');
    expect(result.suggestedTier).toBe('basic_plus');
  });

  it('should accept valid file size for paid tiers', () => {
    const result = validateFileSize(validPdf.fileSize, 'basic_plus');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject files exceeding maximum size', () => {
    const result = validateFileSize(oversizedFile.fileSize, 'premium');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum allowed size');
    expect(result.userMessage).toContain('100 MB');
  });

  it('should reject zero or negative file sizes', () => {
    const result = validateFileSize(0, 'standard');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be positive');
  });

  it('should accept file at maximum size limit', () => {
    const result = validateFileSize(MAX_FILE_SIZE_BYTES, 'standard');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// validateFileMimeType Tests
// ============================================================================

describe('validateFileMimeType', () => {
  it('should reject all files for free tier', () => {
    const result = validateFileMimeType('application/pdf', 'free');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed for free tier');
    expect(result.suggestedTier).toBe('basic_plus');
  });

  it('should reject PDF for basic_plus tier (requires STANDARD)', () => {
    const result = validateFileMimeType('application/pdf', 'basic_plus');
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('standard');
    expect(result.userMessage).toContain('Standard');
  });

  it('should accept TXT for basic_plus tier', () => {
    const result = validateFileMimeType('text/plain', 'basic_plus');
    expect(result.valid).toBe(true);
  });

  it('should accept Markdown for basic_plus tier', () => {
    const result = validateFileMimeType('text/markdown', 'basic_plus');
    expect(result.valid).toBe(true);
  });

  it('should reject DOCX for basic_plus tier', () => {
    const result = validateFileMimeType(validDocx.mimeType, 'basic_plus');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed for basic_plus tier');
    expect(result.suggestedTier).toBe('standard');
  });

  it('should accept DOCX for standard tier', () => {
    const result = validateFileMimeType(validDocx.mimeType, 'standard');
    expect(result.valid).toBe(true);
  });

  it('should reject images for standard tier', () => {
    const result = validateFileMimeType('image/png', 'standard');
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('premium');
  });

  it('should accept images for premium tier', () => {
    const result = validateFileMimeType('image/png', 'premium');
    expect(result.valid).toBe(true);
  });

  it('should accept all image formats for premium tier', () => {
    const imageFormats = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];

    for (const format of imageFormats) {
      const result = validateFileMimeType(format, 'premium');
      expect(result.valid).toBe(true);
    }
  });

  it('should reject unsupported MIME types', () => {
    const result = validateFileMimeType('video/mp4', 'premium');
    expect(result.valid).toBe(false);
    expect(result.userMessage).toContain('not supported');
  });

  it('should provide helpful error message with allowed formats', () => {
    const result = validateFileMimeType(validDocx.mimeType, 'basic_plus');
    expect(result.valid).toBe(false);
    expect(result.userMessage).toContain('TXT, MD');
  });
});

// ============================================================================
// validateFileCount Tests
// ============================================================================

describe('validateFileCount', () => {
  it('should reject files for free tier', () => {
    const result = validateFileCount(0, 'free');
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('basic_plus');
  });

  it('should accept 0 files for basic_plus tier (limit 1)', () => {
    const result = validateFileCount(0, 'basic_plus');
    expect(result.valid).toBe(true);
  });

  it('should reject 1 file when limit is reached for basic_plus', () => {
    const result = validateFileCount(1, 'basic_plus');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('limit reached');
    expect(result.suggestedTier).toBe('standard');
  });

  it('should accept 2 files for standard tier (limit 3)', () => {
    const result = validateFileCount(2, 'standard');
    expect(result.valid).toBe(true);
  });

  it('should reject 3 files when limit is reached for standard', () => {
    const result = validateFileCount(3, 'standard');
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('premium');
  });

  it('should accept 9 files for premium tier (limit 10)', () => {
    const result = validateFileCount(9, 'premium');
    expect(result.valid).toBe(true);
  });

  it('should reject 10 files when limit is reached for premium', () => {
    const result = validateFileCount(10, 'premium');
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBeUndefined(); // No higher tier
  });

  it('should provide helpful error message with upgrade prompt', () => {
    const result = validateFileCount(1, 'basic_plus');
    expect(result.valid).toBe(false);
    expect(result.userMessage).toContain('1 file per course');
    expect(result.userMessage).toContain('Upgrade to Standard');
  });
});

// ============================================================================
// validateFile Tests
// ============================================================================

describe('validateFile', () => {
  it('should validate all checks for valid file', () => {
    // Use TXT file which is valid for basic_plus tier
    const txtFile: FileInput = {
      filename: 'document.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    const result = validateFile(txtFile, 'basic_plus', 0);
    expect(result.valid).toBe(true);
    expect(result.checks.size.valid).toBe(true);
    expect(result.checks.mimeType.valid).toBe(true);
    expect(result.checks.count.valid).toBe(true);
  });

  it('should fail validation for free tier', () => {
    const result = validateFile(validPdf, 'free', 0);
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('basic_plus');
  });

  it('should fail validation for oversized file', () => {
    const result = validateFile(oversizedFile, 'premium', 0);
    expect(result.valid).toBe(false);
    expect(result.checks.size.valid).toBe(false);
    expect(result.checks.mimeType.valid).toBe(true);
    expect(result.checks.count.valid).toBe(true);
  });

  it('should fail validation for invalid MIME type', () => {
    // PDF not allowed on basic_plus, requires standard tier
    const result = validateFile(validPdf, 'basic_plus', 0);
    expect(result.valid).toBe(false);
    expect(result.checks.size.valid).toBe(true);
    expect(result.checks.mimeType.valid).toBe(false);
    expect(result.checks.count.valid).toBe(true);
  });

  it('should fail validation when file count limit reached', () => {
    // Use TXT which is valid on basic_plus
    const txtFile: FileInput = {
      filename: 'notes.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    const result = validateFile(txtFile, 'basic_plus', 1);
    expect(result.valid).toBe(false);
    expect(result.checks.size.valid).toBe(true);
    expect(result.checks.mimeType.valid).toBe(true);
    expect(result.checks.count.valid).toBe(false);
  });

  it('should prioritize count error over other errors', () => {
    // Use invalid file type with count limit reached
    const result = validateFile(validPdf, 'basic_plus', 1);
    expect(result.valid).toBe(false);
    // Count error should be reported first
    expect(result.error).toContain('limit reached');
  });

  it('should prioritize MIME type error over size error', () => {
    const oversizedInvalidFile: FileInput = {
      filename: 'large-video.mp4',
      fileSize: 150 * 1024 * 1024,
      mimeType: 'video/mp4',
    };
    const result = validateFile(oversizedInvalidFile, 'premium', 0);
    expect(result.valid).toBe(false);
    // MIME type error should be reported before size error
    expect(result.error).toContain('not allowed') ||
      expect(result.error).toContain('not supported');
  });

  it('should accept valid image for premium tier', () => {
    const result = validateFile(validImage, 'premium', 5);
    expect(result.valid).toBe(true);
  });

  it('should accept valid DOCX for standard tier', () => {
    const result = validateFile(validDocx, 'standard', 1);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// validateFileOrThrow Tests
// ============================================================================

describe('validateFileOrThrow', () => {
  it('should not throw for valid file', () => {
    // Use TXT file which is valid for basic_plus tier
    const txtFile: FileInput = {
      filename: 'document.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    expect(() => {
      validateFileOrThrow(txtFile, 'basic_plus', 0);
    }).not.toThrow();
  });

  it('should throw ValidationError for invalid file', () => {
    expect(() => {
      validateFileOrThrow(validPdf, 'free', 0);
    }).toThrow(ValidationError);
  });

  it('should throw ValidationError with user message', () => {
    expect(() => {
      validateFileOrThrow(oversizedFile, 'premium', 0);
    }).toThrow(/too large/i);
  });

  it('should throw ValidationError for count limit', () => {
    expect(() => {
      validateFileOrThrow(validPdf, 'basic_plus', 1);
    }).toThrow(ValidationError);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getFileUploadLimits', () => {
  it('should return correct limits for free tier', () => {
    const limits = getFileUploadLimits('free');
    expect(limits.maxFiles).toBe(0);
    expect(limits.allowedExtensions).toHaveLength(0);
    expect(limits.uploadsEnabled).toBe(false);
  });

  it('should return correct limits for basic_plus tier', () => {
    const limits = getFileUploadLimits('basic_plus');
    expect(limits.maxFiles).toBe(1);
    expect(limits.allowedExtensions).toEqual(['txt', 'md']);
    expect(limits.uploadsEnabled).toBe(true);
  });

  it('should return correct limits for standard tier', () => {
    const limits = getFileUploadLimits('standard');
    expect(limits.maxFiles).toBe(3);
    expect(limits.allowedExtensions).toHaveLength(6);
    expect(limits.uploadsEnabled).toBe(true);
  });

  it('should return correct limits for premium tier', () => {
    const limits = getFileUploadLimits('premium');
    expect(limits.maxFiles).toBe(10);
    expect(limits.allowedExtensions.length).toBeGreaterThan(6);
    expect(limits.uploadsEnabled).toBe(true);
  });

  it('should include max file size information', () => {
    const limits = getFileUploadLimits('standard');
    expect(limits.maxFileSize).toBe(MAX_FILE_SIZE_BYTES);
    expect(limits.maxFileSizeMB).toBe(100);
  });
});

describe('isFileTypeSupported', () => {
  it('should return true for PDF', () => {
    expect(isFileTypeSupported('application/pdf')).toBe(true);
  });

  it('should return true for PNG', () => {
    expect(isFileTypeSupported('image/png')).toBe(true);
  });

  it('should return false for video files', () => {
    expect(isFileTypeSupported('video/mp4')).toBe(false);
  });

  it('should return false for unsupported MIME types', () => {
    expect(isFileTypeSupported('application/x-custom')).toBe(false);
  });
});

describe('getMinimumTierForFileType', () => {
  it('should return standard for PDF', () => {
    expect(getMinimumTierForFileType('application/pdf')).toBe('standard');
  });

  it('should return basic_plus for TXT', () => {
    expect(getMinimumTierForFileType('text/plain')).toBe('basic_plus');
  });

  it('should return standard for DOCX', () => {
    expect(
      getMinimumTierForFileType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe('standard');
  });

  it('should return premium for images', () => {
    expect(getMinimumTierForFileType('image/png')).toBe('premium');
    expect(getMinimumTierForFileType('image/jpeg')).toBe('premium');
  });

  it('should return null for unsupported MIME types', () => {
    expect(getMinimumTierForFileType('video/mp4')).toBeNull();
  });

  it('should return null for free tier types (none exist)', () => {
    // Free tier has no allowed types, so this tests the edge case
    const result = getMinimumTierForFileType('text/plain');
    expect(result).not.toBe('free');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: File upload workflow', () => {
  it('should validate complete basic_plus workflow', () => {
    // TXT file - should succeed
    const txtFile: FileInput = {
      filename: 'notes.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    const result1 = validateFile(txtFile, 'basic_plus', 0);
    expect(result1.valid).toBe(true);

    // Second file - should fail due to count limit
    const result2 = validateFile(txtFile, 'basic_plus', 1);
    expect(result2.valid).toBe(false);
    expect(result2.checks.count.valid).toBe(false);
  });

  it('should validate complete standard workflow', () => {
    // Upload 3 different file types
    const pdf = validateFile(validPdf, 'standard', 0);
    expect(pdf.valid).toBe(true);

    const docx = validateFile(validDocx, 'standard', 1);
    expect(docx.valid).toBe(true);

    const txt: FileInput = {
      filename: 'notes.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
    };
    const txtResult = validateFile(txt, 'standard', 2);
    expect(txtResult.valid).toBe(true);

    // Fourth file - should fail
    const fourth = validateFile(validPdf, 'standard', 3);
    expect(fourth.valid).toBe(false);
  });

  it('should validate premium workflow with images', () => {
    const png = validateFile(validImage, 'premium', 0);
    expect(png.valid).toBe(true);

    const jpg: FileInput = {
      filename: 'photo.jpg',
      fileSize: 2 * 1024 * 1024,
      mimeType: 'image/jpeg',
    };
    const jpgResult = validateFile(jpg, 'premium', 1);
    expect(jpgResult.valid).toBe(true);
  });

  it('should provide upgrade path for insufficient tier', () => {
    // Try to upload image on standard tier
    const result = validateFile(validImage, 'standard', 0);
    expect(result.valid).toBe(false);
    expect(result.suggestedTier).toBe('premium');
    expect(result.userMessage).toContain('Upgrade to Premium');
  });
});
