# File Validation Module

This module provides tier-based file validation for the MegaCampusAI course generation platform.

## Features

- **File Size Validation**: Enforces 100MB maximum file size for paid tiers
- **MIME Type Validation**: Tier-based file type restrictions
- **File Count Validation**: Per-course file upload limits based on tier
- **Descriptive Error Messages**: User-friendly messages with upgrade prompts

## Tier Restrictions

| Tier           | Allowed Formats                         | Max Files per Course |
| -------------- | --------------------------------------- | -------------------- |
| **Free**       | None (no uploads)                       | 0                    |
| **Basic Plus** | PDF, TXT, MD                            | 1                    |
| **Standard**   | PDF, TXT, MD, DOCX, HTML, PPTX          | 3                    |
| **Premium**    | All standard + PNG, JPG, GIF, SVG, WebP | 10                   |

## Usage

### Basic Validation

```typescript
import { validateFile } from './shared/validation/file-validator';

// Validate a file upload
const file = {
  filename: 'document.pdf',
  fileSize: 1024 * 1024, // 1 MB
  mimeType: 'application/pdf',
};

const result = validateFile(file, 'basic_plus', 0);

if (!result.valid) {
  console.error(result.userMessage);
  // Output: "File upload limit reached. Your Basic Plus plan allows 1 file per course."
}
```

### Throwing Errors

```typescript
import { validateFileOrThrow } from './shared/validation/file-validator';
import { ValidationError } from '../server/errors/typed-errors';

try {
  validateFileOrThrow(file, tier, currentFileCount);
  // Proceed with upload
} catch (error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message });
  }
  throw error;
}
```

### Individual Validation Checks

```typescript
import {
  validateFileSize,
  validateFileMimeType,
  validateFileCount,
} from './shared/validation/file-validator';

// Check only file size
const sizeResult = validateFileSize(fileSize, tier);

// Check only MIME type
const mimeResult = validateFileMimeType(mimeType, tier);

// Check only file count
const countResult = validateFileCount(currentCount, tier);
```

### Getting Tier Limits

```typescript
import { getFileUploadLimits } from './shared/validation/file-validator';

const limits = getFileUploadLimits('standard');
console.log(`Max files: ${limits.maxFiles}`); // 3
console.log(`Max size: ${limits.maxFileSizeMB} MB`); // 100
console.log(`Allowed: ${limits.allowedExtensionsDisplay}`); // "PDF, TXT, MD, DOCX, HTML, PPTX"
console.log(`Uploads enabled: ${limits.uploadsEnabled}`); // true
```

### Checking File Type Support

```typescript
import { isFileTypeSupported, getMinimumTierForFileType } from './shared/validation/file-validator';

// Check if any tier supports this file type
if (isFileTypeSupported('image/png')) {
  const minTier = getMinimumTierForFileType('image/png');
  console.log(`PNG requires: ${minTier}`); // 'premium'
}
```

## API Reference

### Main Functions

#### `validateFile(file, tier, currentFileCount)`

Validates a file against all tier-based restrictions.

**Parameters:**

- `file: FileInput` - File to validate
- `tier: Tier` - Organization tier
- `currentFileCount: number` - Current number of files in the course

**Returns:** `FileValidationResult` with detailed validation results

#### `validateFileOrThrow(file, tier, currentFileCount)`

Same as `validateFile` but throws `ValidationError` on failure.

### Individual Validation Functions

#### `validateFileSize(fileSize, tier)`

Validates file size against maximum limit (100MB).

#### `validateFileMimeType(mimeType, tier)`

Validates file MIME type against tier restrictions.

#### `validateFileCount(currentCount, tier)`

Validates file count against tier limits.

### Utility Functions

#### `getFileUploadLimits(tier)`

Returns all file upload limits and restrictions for a tier.

#### `isFileTypeSupported(mimeType)`

Checks if a MIME type is supported by any tier.

#### `getMinimumTierForFileType(mimeType)`

Returns the minimum tier required for a file type.

## Validation Result Structure

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string; // Technical error message
  userMessage?: string; // User-friendly message
  suggestedTier?: Tier; // Suggested tier for upgrade
}

interface FileValidationResult extends ValidationResult {
  checks: {
    size: ValidationResult;
    mimeType: ValidationResult;
    count: ValidationResult;
  };
}
```

## Error Messages

The validator provides descriptive, user-friendly error messages:

- **Free Tier**: "Your Free tier plan does not support file uploads. Upgrade to Basic Plus to unlock this feature."
- **File Too Large**: "File is too large. Maximum file size is 100 MB (your file: 150 MB)."
- **Invalid MIME Type**: "File type not supported. Your Basic Plus plan allows: PDF, TXT, MD. Upgrade to Standard to upload this file type."
- **Count Limit Reached**: "File upload limit reached. Your Basic Plus plan allows 1 file per course. Upgrade to Standard to upload more files (up to 3 per course)."

## Integration with tRPC

```typescript
// In tRPC procedure
export const uploadFile = protectedProcedure
  .input(fileUploadInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { tier } = ctx.user.organization;
    const currentFileCount = await getFileCountForCourse(input.courseId);

    // Validate file
    const validationResult = validateFile(
      {
        filename: input.filename,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
      },
      tier,
      currentFileCount
    );

    if (!validationResult.valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: validationResult.userMessage || 'File validation failed',
      });
    }

    // Proceed with upload...
  });
```

## Testing

The module includes comprehensive tests covering:

- All tier restrictions
- File size limits
- MIME type validation
- File count limits
- Error messages and upgrade prompts
- Edge cases (boundary values, invalid inputs)

Run tests with:

```bash
npm test -- file-validator.test.ts
```

## Related Files

- `packages/shared-types/src/zod-schemas.ts` - Tier-based constants and schemas
- `packages/course-gen-platform/src/server/errors/typed-errors.ts` - Custom error classes
- `packages/course-gen-platform/tests/file-validator.test.ts` - Test suite
