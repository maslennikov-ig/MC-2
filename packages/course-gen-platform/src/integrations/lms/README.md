# LMS Integration Module

**Package**: `@megacampus/course-gen-platform`
**Module**: `src/integrations/lms`

## Overview

The LMS Integration module provides a unified interface for publishing AI-generated courses to Learning Management Systems (LMS). It supports multiple LMS platforms through an adapter pattern, with Open edX as the first implementation.

### Key Features

- **Multi-LMS Support**: Extensible adapter architecture for different LMS platforms
- **Open edX Integration**: Complete implementation for Open edX/Tutor deployments
- **OLX Generation**: Converts MegaCampus courses to Open edX OLX format
- **Cyrillic Support**: Handles Russian/Cyrillic content with proper transliteration
- **Validation**: Comprehensive input and structure validation before upload
- **Error Handling**: Clear, actionable error messages for troubleshooting
- **Observability**: Structured logging for all operations

### Supported LMS Platforms

| Platform | Status | Implementation |
|----------|--------|----------------|
| Open edX | ✅ Complete | `openedx/adapter.ts` |
| Moodle | 🔜 Planned | Future release |
| Canvas | 🔜 Planned | Future release |

---

## Architecture

### Adapter Pattern

The module uses the adapter pattern to provide a consistent interface across different LMS platforms:

```
┌─────────────────────────────────────────────────────┐
│          Application Layer (tRPC, BullMQ)           │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   createLMSAdapter()  │ Factory
              │   publishCourse()     │ Convenience
              └───────────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ OpenEdX  │    │  Moodle  │    │  Canvas  │
    │ Adapter  │    │ (Planned)│    │ (Planned)│
    └────┬─────┘    └──────────┘    └──────────┘
         │
    ┌────┴─────────────────────────┐
    │ OLX Generator                │ Open edX Specific
    │ OLX Packager (tar.gz)        │
    │ API Client (OAuth2 + REST)   │
    │ Import Status Poller         │
    └──────────────────────────────┘
```

### Module Structure

```
src/integrations/lms/
├── index.ts                    # Public API (factory, convenience functions)
├── course-mapper.ts            # Database → CourseInput transformer
├── error-mapper.ts             # Error transformation utilities
├── logger.ts                   # LMS operation logger
└── openedx/
    ├── adapter.ts              # OpenEdXAdapter implementation
    ├── utils/
    │   ├── transliterate.ts    # Cyrillic → ASCII conversion
    │   └── xml-escape.ts       # XML character escaping
    ├── olx/
    │   ├── generator.ts        # CourseInput → OLX structure
    │   ├── packager.ts         # OLX → tar.gz archive
    │   ├── validators.ts       # Input/structure validation
    │   ├── url-name-registry.ts # Unique identifier tracking
    │   ├── types.ts            # OLX type definitions
    │   └── templates/          # XML template generators
    │       ├── course.ts
    │       ├── chapter.ts
    │       ├── sequential.ts
    │       ├── vertical.ts
    │       ├── html.ts
    │       └── policies.ts
    └── api/
        ├── client.ts           # OpenEdXClient (HTTP/REST)
        ├── auth.ts             # OAuth2 authentication
        ├── poller.ts           # Import status polling
        └── types.ts            # API request/response types
```

---

## Usage

### 1. Factory Pattern (Recommended for Multiple Operations)

Create an adapter instance once and reuse it for multiple operations:

```typescript
import { createLMSAdapter } from '@/integrations/lms';
import type { OpenEdXConfig, CourseInput } from '@megacampus/shared-types/lms';

// Create adapter
const config: OpenEdXConfig = {
  instanceId: 'uuid-here',
  name: 'Production Open edX',
  type: 'openedx',
  organization: 'MegaCampus',
  lmsUrl: 'https://lms.example.com',
  cmsUrl: 'https://studio.example.com',
  clientId: process.env.OPENEDX_CLIENT_ID!,
  clientSecret: process.env.OPENEDX_CLIENT_SECRET!,
  timeout: 300000,      // 5 minutes
  maxRetries: 3,
  pollInterval: 5000,   // 5 seconds
  enabled: true,
  autoCreateCourse: true,
};

const adapter = createLMSAdapter('openedx', config);

// Validate configuration
await adapter.validateConfig();

// Test connection
const connectionResult = await adapter.testConnection();
if (!connectionResult.success) {
  throw new Error(`LMS connection failed: ${connectionResult.message}`);
}

// Publish course
const courseInput: CourseInput = {
  courseId: 'AI101',
  title: 'Основы искусственного интеллекта',
  org: 'MegaCampus',
  run: 'self_paced_2025',
  language: 'ru',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  description: 'Введение в ИИ для начинающих',
  chapters: [
    {
      id: 'ch1',
      title: 'Глава 1: Введение',
      sections: [
        {
          id: 'sec1_1',
          title: 'Что такое ИИ?',
          content: '<h1>Что такое искусственный интеллект?</h1><p>Искусственный интеллект...</p>',
        },
        {
          id: 'sec1_2',
          title: 'История ИИ',
          content: '<h1>История искусственного интеллекта</h1><p>ИИ начался в 1950-х...</p>',
        },
      ],
    },
    {
      id: 'ch2',
      title: 'Глава 2: Машинное обучение',
      sections: [
        {
          id: 'sec2_1',
          title: 'Основы МО',
          content: '<h1>Основы машинного обучения</h1><p>Машинное обучение...</p>',
        },
      ],
    },
  ],
};

const result = await adapter.publishCourse(courseInput);

console.log('Course published successfully!');
console.log(`- LMS URL: ${result.lmsUrl}`);
console.log(`- Studio URL: ${result.studioUrl}`);
console.log(`- LMS Course ID: ${result.lmsCourseId}`);
console.log(`- Duration: ${result.duration}ms`);
```

### 2. Convenience Function (One-Time Operations)

For simple scripts or one-time publishing:

```typescript
import { publishCourse } from '@/integrations/lms';

const result = await publishCourse('openedx', openEdxConfig, courseInput);

if (result.success) {
  console.log(`Published: ${result.lmsUrl}`);
} else {
  console.error('Publish failed');
}
```

### 3. Database Course Mapping

Convert a MegaCampus database course to CourseInput:

```typescript
import { mapCourseToInput } from '@/integrations/lms/course-mapper';
import { getAdminClient } from '@/lib/supabase/client-factory';

const supabase = getAdminClient();

// Map database course to CourseInput
const courseInput = await mapCourseToInput('course-uuid-here', supabase);

// Publish mapped course
const adapter = createLMSAdapter('openedx', config);
const result = await adapter.publishCourse(courseInput);
```

### 4. tRPC Integration

The module integrates with tRPC routers for frontend/API usage:

```typescript
// In tRPC router
import { mapCourseToInput } from '@/integrations/lms/course-mapper';
import { createLMSAdapter } from '@/integrations/lms';

export const publishCourseRouter = router({
  start: protectedProcedure
    .input(z.object({
      courseId: z.string().uuid(),
      lmsConfigurationId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Fetch LMS config from database
      const config = await fetchLMSConfig(input.lmsConfigurationId);

      // Map course from database
      const courseInput = await mapCourseToInput(input.courseId, ctx.supabase);

      // Create adapter and publish
      const adapter = createLMSAdapter(config.type, config);
      const result = await adapter.publishCourse(courseInput);

      // Save import job to database
      await saveImportJob({
        courseId: input.courseId,
        lmsConfigurationId: input.lmsConfigurationId,
        taskId: result.taskId,
        status: 'succeeded',
        lmsCourseId: result.lmsCourseId,
        duration: result.duration,
      });

      return result;
    }),
});
```

---

## Configuration

### OpenEdXConfig

```typescript
interface OpenEdXConfig {
  instanceId: string;        // Unique ID for this LMS instance
  name: string;              // Human-readable name
  type: 'openedx';           // LMS platform type
  organization: string;      // Default org for courses (e.g., 'MegaCampus')
  lmsUrl: string;            // LMS base URL (e.g., 'https://lms.example.com')
  cmsUrl: string;            // Studio base URL (e.g., 'https://studio.example.com')
  clientId: string;          // OAuth2 client ID
  clientSecret: string;      // OAuth2 client secret
  timeout: number;           // Upload timeout in ms (default: 300000 = 5 min)
  maxRetries: number;        // Max retry attempts (default: 3)
  pollInterval: number;      // Status poll interval in ms (default: 5000 = 5 sec)
  enabled: boolean;          // Whether this config is active
  autoCreateCourse: boolean; // Auto-create course if doesn't exist
}
```

### Environment Variables

For security, store credentials in environment variables:

```bash
# .env.local
OPENEDX_LMS_URL=https://lms.example.com
OPENEDX_STUDIO_URL=https://studio.example.com
OPENEDX_CLIENT_ID=your-oauth2-client-id
OPENEDX_CLIENT_SECRET=your-oauth2-client-secret
OPENEDX_DEFAULT_ORG=MegaCampus
```

Load in code:

```typescript
const config: OpenEdXConfig = {
  instanceId: 'production-openedx',
  name: 'Production',
  type: 'openedx',
  organization: process.env.OPENEDX_DEFAULT_ORG || 'MegaCampus',
  lmsUrl: process.env.OPENEDX_LMS_URL!,
  cmsUrl: process.env.OPENEDX_STUDIO_URL!,
  clientId: process.env.OPENEDX_CLIENT_ID!,
  clientSecret: process.env.OPENEDX_CLIENT_SECRET!,
  timeout: 300000,
  maxRetries: 3,
  pollInterval: 5000,
  enabled: true,
  autoCreateCourse: true,
};
```

---

## CourseInput Structure

The `CourseInput` interface is LMS-agnostic and represents the minimal course structure needed for publishing:

```typescript
interface CourseInput {
  // Course metadata
  courseId: string;          // Unique identifier (e.g., 'AI101')
  title: string;             // Display title (Cyrillic supported)
  org: string;               // Organization (e.g., 'MegaCampus')
  run: string;               // Course run ID (e.g., 'self_paced_2025')
  language: Language;        // Course language ('ru' | 'en')

  // Optional metadata
  description?: string;      // Course description
  startDate?: Date;          // Course start date
  endDate?: Date;            // Course end date

  // Course structure
  chapters: Chapter[];       // Top-level course divisions
}

interface Chapter {
  id: string;                // Unique chapter ID
  title: string;             // Chapter title (Cyrillic supported)
  sections: Section[];       // Sections within chapter
}

interface Section {
  id: string;                // Unique section ID
  title: string;             // Section title (Cyrillic supported)
  content: string;           // HTML content (Cyrillic supported)
}
```

### Mapping to Open edX

| MegaCampus | Open edX | Studio UI Name |
|------------|----------|----------------|
| Course | `<course>` | Course |
| Chapter | `<chapter>` | Section |
| Section | `<sequential>` + `<vertical>` | Subsection + Unit |
| content (HTML) | `<html>` | HTML Component |

---

## Open edX Integration Details

### OLX Generation

The OLX generator converts CourseInput to Open edX's XML-based course format:

```typescript
import { OLXGenerator } from '@/integrations/lms/openedx/olx/generator';

const generator = new OLXGenerator();
const olxStructure = generator.generate(courseInput);

// OLXStructure contains:
// - courseKey: 'course-v1:MegaCampus+AI101+self_paced_2025'
// - files: Map of file paths to content
//   - 'course.xml'
//   - 'chapter/chapter_1.xml'
//   - 'sequential/section_1_1.xml'
//   - 'vertical/section_1_1_unit.xml'
//   - 'html/section_1_1_content.xml'
//   - 'html/section_1_1_content.html'
//   - 'policies/course/policy.json'
//   - 'policies/course/grading_policy.json'
```

### Packaging

Package OLX structure into tar.gz archive:

```typescript
import { packageOLX } from '@/integrations/lms/openedx/olx/packager';

const packageResult = await packageOLX(olxStructure);

console.log(`Package size: ${packageResult.size} bytes`);
console.log(`File count: ${packageResult.fileCount}`);
console.log(`Duration: ${packageResult.duration}ms`);

// packageResult.buffer contains the tar.gz data
```

### Upload and Polling

Upload package and poll for import completion:

```typescript
import { OpenEdXClient } from '@/integrations/lms/openedx/api/client';
import { pollImportStatus } from '@/integrations/lms/openedx/api/poller';

const client = new OpenEdXClient({
  baseUrl: 'https://lms.example.com',
  studioUrl: 'https://studio.example.com',
  auth: {
    tokenUrl: 'https://lms.example.com/oauth2/access_token',
    clientId: 'your-client-id',
    clientSecret: 'your-secret',
  },
  uploadTimeout: 300000,
  statusTimeout: 10000,
  maxRetries: 3,
  retryDelayMs: 1000,
});

// Upload
const { taskId } = await client.importCourse(
  packageResult.buffer,
  'course-v1:MegaCampus+AI101+self_paced_2025'
);

// Poll status
const importResult = await pollImportStatus(client, taskId, {
  maxAttempts: 60,
  intervalMs: 5000,
  onProgress: (status) => {
    console.log(`Import status: ${status.state} (${status.progress_percent}%)`);
  },
});

console.log(`Import completed: ${importResult.state}`);
console.log(`Course URL: ${importResult.courseUrl}`);
```

---

## Error Handling

### Error Types

```typescript
import {
  LMSIntegrationError,
  OLXValidationError,
  LMSAuthenticationError,
  LMSNetworkError,
} from '@megacampus/shared-types/lms';

// Generic LMS error
try {
  await adapter.publishCourse(courseInput);
} catch (error) {
  if (error instanceof LMSIntegrationError) {
    console.error(`LMS Error [${error.code}]: ${error.message}`);
    console.error(`Platform: ${error.platform}`);
    console.error(`Context:`, error.context);
  }
}

// Validation error (before upload)
catch (error) {
  if (error instanceof OLXValidationError) {
    console.error('Validation failed:');
    error.errors.forEach((err) => {
      console.error(`- [${err.severity}] ${err.path}: ${err.message}`);
    });
  }
}

// Authentication error
catch (error) {
  if (error instanceof LMSAuthenticationError) {
    console.error('Authentication failed - check credentials');
    console.error(`Token URL: ${error.context?.tokenUrl}`);
  }
}

// Network error
catch (error) {
  if (error instanceof LMSNetworkError) {
    console.error(`Network error: ${error.message}`);
    console.error(`URL: ${error.context?.url}`);
    console.error(`Status: ${error.context?.statusCode}`);
  }
}
```

### Common Error Scenarios

| Error Code | Message | Solution |
|------------|---------|----------|
| `INVALID_COURSE_INPUT` | Validation failed | Check CourseInput structure, ensure required fields present |
| `AUTH_FAILED` | Authentication failed | Verify client ID and secret, check OAuth2 app configuration |
| `NETWORK_ERROR` | Network request failed | Check LMS URLs, verify network connectivity, check firewall |
| `IMPORT_ERROR` | Course import failed | Check OLX structure, verify LMS logs, check permissions |
| `TIMEOUT` | Operation timed out | Increase timeout value, check LMS performance |
| `PERMISSION_DENIED` | Insufficient permissions | Ensure OAuth2 user has staff permissions |

---

## Transliteration and Identifiers

### Cyrillic Support

The module handles Cyrillic content (Russian) throughout:

- **Display Names**: Preserved as-is (e.g., "Основы ИИ")
- **Internal Identifiers**: Transliterated to ASCII (e.g., "osnovy_ii")

```typescript
import { transliterate, toUrlName, toCourseKey } from '@/integrations/lms/openedx/utils/transliterate';

// Basic transliteration
const result = transliterate('Основы искусственного интеллекта');
// => 'Osnovy iskusstvennogo intellekta'

// URL-safe identifier
const urlName = toUrlName('Введение в ИИ');
// => 'vvedenie_v_ii'

// Course key
const courseKey = toCourseKey('МегаКампус', 'ИИ101', 'поток_1');
// => 'course-v1:MegaKampus+II101+potok_1'
```

### Unique Identifier Registry

Ensures all url_name attributes are unique within their scope:

```typescript
import { UrlNameRegistry } from '@/integrations/lms/openedx/olx/url-name-registry';

const registry = new UrlNameRegistry();

// First chapter
const ch1 = registry.registerChapter('Введение');
// => 'vvedenie'

// Duplicate chapter title
const ch2 = registry.registerChapter('Введение');
// => 'vvedenie_2'

// Third duplicate
const ch3 = registry.registerChapter('Введение');
// => 'vvedenie_3'
```

---

## Validation

### Input Validation

Validates CourseInput before processing:

```typescript
import { validateCourseInput } from '@/integrations/lms/openedx/olx/validators';

const validationResult = validateCourseInput(courseInput);

if (!validationResult.valid) {
  console.error('Validation errors:');
  validationResult.errors.forEach((error) => {
    console.error(`- ${error}`);
  });
  throw new Error('Invalid course input');
}
```

**Validation Checks**:
- Required fields: courseId, title, org, run, language
- Non-empty chapters array
- Each chapter has id, title, and sections
- Each section has id, title, and content
- No duplicate chapter/section IDs
- Valid language code

### Structure Validation

Validates generated OLX structure:

```typescript
import { validateOLXStructure } from '@/integrations/lms/openedx/olx/validators';

const structureResult = validateOLXStructure(olxStructure);

if (!structureResult.valid) {
  throw new OLXValidationError('Invalid OLX structure', structureResult.errors);
}
```

**Validation Checks**:
- Course key format: `course-v1:Org+Course+Run`
- All required XML files present
- All url_name attributes are ASCII-only
- No duplicate url_name values within scope
- File paths follow OLX conventions

### Size Validation

Validates package size limits:

```typescript
import { MAX_PACKAGE_SIZE_BYTES } from '@/integrations/lms/openedx/olx/packager';

if (packageResult.size > MAX_PACKAGE_SIZE_BYTES) {
  throw new Error(`Package too large: ${packageResult.size} bytes (max: ${MAX_PACKAGE_SIZE_BYTES})`);
}
```

**Size Limits**:
- Maximum package size: 100 MB
- Typical course size: 1-10 MB
- 50-unit course: ~2-5 MB

---

## Logging

### Structured Logging

All LMS operations are logged with structured data:

```typescript
import { lmsLogger } from '@/integrations/lms/logger';

lmsLogger.info(
  {
    courseId: 'AI101',
    org: 'MegaCampus',
    run: 'self_paced_2025',
    instanceId: 'prod-openedx',
  },
  'Starting course publish'
);

lmsLogger.error(
  {
    courseId: 'AI101',
    error: error.message,
    stack: error.stack,
    duration: 15234,
  },
  'Course publish failed'
);
```

### Log Levels

- `debug`: Detailed internal operations (OLX generation, polling updates)
- `info`: Normal operations (publish start, completion, test connection)
- `warn`: Non-critical issues (missing optional fields, deprecation warnings)
- `error`: Operation failures (validation errors, network errors, auth failures)

### Key Log Fields

- `courseId`: MegaCampus course ID
- `lmsCourseId`: LMS course identifier (course key)
- `instanceId`: LMS configuration instance ID
- `taskId`: Import task ID from LMS
- `duration`: Operation duration in milliseconds
- `packageSize`: Package size in bytes
- `fileCount`: Number of files in package
- `error`: Error message
- `stack`: Stack trace for errors

---

## Testing

### Unit Tests

Run LMS integration tests:

```bash
cd packages/course-gen-platform

# All LMS tests
pnpm test -- tests/unit/integrations/lms

# Specific test file
pnpm test -- tests/unit/integrations/lms/openedx/olx/generator.test.ts

# Watch mode
pnpm test -- --watch tests/unit/integrations/lms
```

### Test Coverage

**20 test files, 100+ test cases**:
- OLX generation and templates (7 files)
- Validation (input, structure, size, content) (3 files)
- API client and authentication (3 files)
- Utilities (transliteration, XML escaping, URL registry) (3 files)
- Adapter integration (1 file)
- Configuration and history (2 files)
- Packaging (1 file)

### Integration Testing

For testing with a real Open edX instance:

```typescript
import { OpenEdXAdapter } from '@/integrations/lms/openedx/adapter';

describe('Open edX Integration', () => {
  let adapter: OpenEdXAdapter;

  beforeAll(() => {
    adapter = new OpenEdXAdapter({
      instanceId: 'test-instance',
      name: 'Test Open edX',
      type: 'openedx',
      organization: 'TestOrg',
      lmsUrl: process.env.TEST_OPENEDX_LMS_URL!,
      cmsUrl: process.env.TEST_OPENEDX_CMS_URL!,
      clientId: process.env.TEST_OPENEDX_CLIENT_ID!,
      clientSecret: process.env.TEST_OPENEDX_CLIENT_SECRET!,
      timeout: 300000,
      maxRetries: 3,
      pollInterval: 5000,
      enabled: true,
      autoCreateCourse: true,
    });
  });

  it('should publish a course successfully', async () => {
    const courseInput = createTestCourseInput();
    const result = await adapter.publishCourse(courseInput);

    expect(result.success).toBe(true);
    expect(result.lmsUrl).toContain('courses');
    expect(result.duration).toBeLessThan(30000); // < 30 seconds
  });
});
```

---

## Troubleshooting

### "Authentication failed"

**Symptoms**: Error code `AUTH_FAILED`, message about client credentials

**Solutions**:
1. Verify `clientId` and `clientSecret` are correct
2. Check OAuth2 application in Open edX admin:
   - User: Must be staff user
   - Client type: Confidential
   - Authorization grant type: Client credentials
3. Verify token URL is accessible: `{lmsUrl}/oauth2/access_token`

### "Course import failed"

**Symptoms**: Upload succeeds but import task fails

**Solutions**:
1. Check Open edX logs: `tutor local logs --follow cms`
2. Verify OLX structure:
   ```bash
   tar -tzf course.tar.gz  # List archive contents
   tar -xzf course.tar.gz  # Extract for inspection
   ```
3. Ensure all `url_name` attributes are ASCII-only (no Cyrillic)
4. Check for duplicate identifiers in course structure

### "Connection timeout"

**Symptoms**: Error code `TIMEOUT`, operation exceeds timeout limit

**Solutions**:
1. Verify LMS/Studio URLs are accessible from server
2. Check firewall rules allow outbound HTTPS (443)
3. Increase `timeout` in configuration:
   ```typescript
   timeout: 600000,  // 10 minutes instead of 5
   ```
4. Check Open edX performance and load

### "Package too large"

**Symptoms**: Error about exceeding 100MB limit

**Solutions**:
1. Reduce course content size
2. Optimize images (use external hosting, compress)
3. Split into multiple smaller courses
4. Remove unnecessary HTML/CSS

### "Invalid course input"

**Symptoms**: `OLXValidationError` with validation failures

**Solutions**:
1. Review validation error messages
2. Ensure all required fields are present:
   - `courseId`, `title`, `org`, `run`, `language`
   - Each chapter has `id`, `title`, `sections`
   - Each section has `id`, `title`, `content`
3. Check for duplicate IDs in chapters/sections
4. Verify language is valid: `'ru'` or `'en'`

---

## API Reference

### Factory Functions

#### `createLMSAdapter(type, config)`

Create LMS adapter instance.

**Parameters**:
- `type: 'openedx'` - LMS platform type
- `config: OpenEdXConfig` - Platform-specific configuration

**Returns**: `LMSAdapter<OpenEdXConfig>`

**Throws**: `Error` if type is unsupported

---

#### `publishCourse(type, config, input)`

Convenience function to publish course in one step.

**Parameters**:
- `type: 'openedx'` - LMS platform type
- `config: OpenEdXConfig` - Platform configuration
- `input: CourseInput` - Course content and metadata

**Returns**: `Promise<PublishResult>`

**Throws**: `LMSIntegrationError`, `OLXValidationError`

---

### LMSAdapter Interface

#### `validateConfig()`

Validate adapter configuration without network calls.

**Returns**: `Promise<boolean>`

**Throws**: `LMSIntegrationError` if invalid

---

#### `testConnection()`

Test connection to LMS platform.

**Returns**: `Promise<TestConnectionResult>`

```typescript
interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  lmsVersion?: string;
  apiVersion?: string;
}
```

---

#### `publishCourse(input)`

Publish course to LMS.

**Parameters**:
- `input: CourseInput` - Course content and metadata

**Returns**: `Promise<PublishResult>`

```typescript
interface PublishResult {
  success: boolean;
  courseId: string;        // MegaCampus course ID
  lmsCourseId: string;     // LMS course identifier
  lmsUrl: string;          // Student-facing course URL
  studioUrl: string;       // Instructor/editor URL
  taskId: string;          // Import task ID
  duration: number;        // Duration in ms
}
```

**Throws**: `LMSIntegrationError`, `OLXValidationError`

---

#### `getCourseStatus(courseId)`

Get course status in LMS (placeholder for Open edX).

**Parameters**:
- `courseId: string` - MegaCampus course ID

**Returns**: `Promise<LmsCourseStatus>`

**Note**: Open edX implementation returns placeholder data. Full implementation requires Open edX Course API.

---

#### `deleteCourse(courseId)`

Delete course from LMS (not supported for Open edX).

**Parameters**:
- `courseId: string` - MegaCampus course ID

**Returns**: `Promise<boolean>` - Always `false` for Open edX

**Note**: Open edX does not provide course deletion API. Must use Django admin or Studio UI.

---

### Course Mapper

#### `mapCourseToInput(courseId, supabase)`

Convert database course to CourseInput format.

**Parameters**:
- `courseId: string` - Course UUID from database
- `supabase: SupabaseClient` - Supabase client instance

**Returns**: `Promise<CourseInput>`

**Throws**: `Error` if course not found or invalid structure

---

## Related Documentation

- **Quickstart Guide**: `/specs/20-openedx-integration/quickstart.md`
- **Feature Specification**: `/specs/20-openedx-integration/spec.md`
- **Acceptance Criteria**: `/specs/20-openedx-integration/ACCEPTANCE-CRITERIA-VERIFICATION.md`
- **Data Model**: `/specs/20-openedx-integration/data-model.md`
- **tRPC Routes**: `/specs/20-openedx-integration/contracts/trpc-routes.md`

---

## Contributing

When adding new LMS adapters:

1. Create adapter class extending `LMSAdapter<YourConfig>`
2. Implement all required methods:
   - `validateConfig()`
   - `testConnection()`
   - `publishCourse(input)`
   - `getCourseStatus(courseId)`
   - `deleteCourse(courseId)`
3. Add factory case in `createLMSAdapter()`
4. Add comprehensive unit tests
5. Document in this README

---

**Last Updated**: 2025-12-12
**Maintainer**: MegaCampusAI Team
