# Data Model: Open edX LMS Integration

**Feature**: 20-openedx-integration
**Date**: 2025-12-11

## Entity Overview

```
┌─────────────────────┐     ┌─────────────────────┐
│  organizations      │     │      courses        │
│  (existing)         │     │     (existing)      │
└─────────┬───────────┘     └──────────┬──────────┘
          │                            │
          │ 1:N                        │ 1:N
          ▼                            ▼
┌─────────────────────┐     ┌─────────────────────┐
│ lms_configurations  │     │   lms_import_jobs   │
│                     │◄────│                     │
│ • OAuth credentials │     │ • Import status     │
│ • LMS URLs          │     │ • Error details     │
│ • Settings          │     │ • Timestamps        │
└─────────────────────┘     └─────────────────────┘
```

---

## 1. lms_configurations

Stores connection settings for Open edX LMS instances.

### Schema

```sql
CREATE TABLE lms_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Display
  name TEXT NOT NULL,
  description TEXT,

  -- Connection
  lms_url TEXT NOT NULL,                    -- e.g., https://lms.example.com
  studio_url TEXT NOT NULL,                 -- e.g., https://studio.example.com

  -- Authentication (encrypted at rest)
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,

  -- Course Defaults
  default_org TEXT NOT NULL,                -- Organization code in Open edX (e.g., "MegaCampus")
  default_run TEXT DEFAULT 'self_paced',    -- Course run identifier

  -- Operational Settings
  import_timeout_seconds INTEGER DEFAULT 300,
  max_retries INTEGER DEFAULT 3,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_connection_test TIMESTAMPTZ,
  last_connection_status TEXT,              -- 'success', 'failed', 'pending'

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT unique_lms_config_name_per_org UNIQUE (organization_id, name),
  CONSTRAINT valid_lms_url CHECK (lms_url ~ '^https?://'),
  CONSTRAINT valid_studio_url CHECK (studio_url ~ '^https?://')
);

-- Indexes
CREATE INDEX idx_lms_configurations_org ON lms_configurations(organization_id);
CREATE INDEX idx_lms_configurations_active ON lms_configurations(is_active) WHERE is_active = true;
```

### RLS Policies

```sql
-- Enable RLS
ALTER TABLE lms_configurations ENABLE ROW LEVEL SECURITY;

-- Organization admins can manage configurations
CREATE POLICY lms_config_org_admin ON lms_configurations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = lms_configurations.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  );

-- Organization members can view configurations (hide secrets)
CREATE POLICY lms_config_org_member_select ON lms_configurations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = lms_configurations.organization_id
        AND om.user_id = auth.uid()
    )
  );
```

### TypeScript Type

```typescript
// packages/shared-types/src/lms-integration.ts

import { z } from 'zod';

export const LmsConfigurationSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),

  // Display
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),

  // Connection
  lms_url: z.string().url(),
  studio_url: z.string().url(),

  // Auth (not exposed to client)
  client_id: z.string().min(1),
  client_secret: z.string().min(1),

  // Defaults
  default_org: z.string().min(1).max(50),
  default_run: z.string().default('self_paced'),

  // Operational
  import_timeout_seconds: z.number().int().min(30).max(600).default(300),
  max_retries: z.number().int().min(1).max(5).default(3),

  // Status
  is_active: z.boolean().default(true),
  last_connection_test: z.coerce.date().nullable(),
  last_connection_status: z.enum(['success', 'failed', 'pending']).nullable(),

  // Audit
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by: z.string().uuid().nullable(),
});

export type LmsConfiguration = z.infer<typeof LmsConfigurationSchema>;

// Client-safe version (no secrets)
export const LmsConfigurationPublicSchema = LmsConfigurationSchema.omit({
  client_id: true,
  client_secret: true,
});

export type LmsConfigurationPublic = z.infer<typeof LmsConfigurationPublicSchema>;
```

---

## 2. lms_import_jobs

Tracks course publishing operations to LMS.

### Schema

```sql
CREATE TYPE lms_import_status AS ENUM (
  'pending',      -- Job created, not yet started
  'uploading',    -- Uploading tar.gz to LMS
  'processing',   -- LMS is processing the import
  'succeeded',    -- Import completed successfully
  'failed'        -- Import failed
);

CREATE TABLE lms_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lms_configuration_id UUID NOT NULL REFERENCES lms_configurations(id) ON DELETE CASCADE,

  -- Open edX Identifiers
  edx_course_key TEXT NOT NULL,             -- e.g., "course-v1:MegaCampus+AI101+self_paced"
  edx_task_id TEXT,                         -- Open edX async task ID

  -- Status
  status lms_import_status DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Results
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Links (populated on success)
  course_url TEXT,                          -- LMS student view URL
  studio_url TEXT,                          -- Studio authoring URL

  -- Metadata
  metadata JSONB DEFAULT '{}',              -- Additional info (version, stats, etc.)

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- Indexes
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- Indexes
CREATE INDEX idx_lms_import_jobs_course ON lms_import_jobs(course_id);
CREATE INDEX idx_lms_import_jobs_status ON lms_import_jobs(status);
CREATE INDEX idx_lms_import_jobs_created ON lms_import_jobs(created_at DESC);
CREATE INDEX idx_lms_import_jobs_active ON lms_import_jobs(status)
  WHERE status IN ('pending', 'uploading', 'processing');
```

### RLS Policies

```sql
-- Enable RLS
ALTER TABLE lms_import_jobs ENABLE ROW LEVEL SECURITY;

-- Course owner can manage their import jobs
CREATE POLICY lms_import_jobs_owner ON lms_import_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lms_import_jobs.course_id
        AND c.user_id = auth.uid()
    )
  );

-- Organization admins can view all import jobs
CREATE POLICY lms_import_jobs_org_admin ON lms_import_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      JOIN organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = lms_import_jobs.course_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  );
```

### TypeScript Type

```typescript
// packages/shared-types/src/lms-integration.ts

export const LmsImportStatusSchema = z.enum([
  'pending',
  'uploading',
  'processing',
  'succeeded',
  'failed',
]);

export type LmsImportStatus = z.infer<typeof LmsImportStatusSchema>;

export const LmsImportJobSchema = z.object({
  id: z.string().uuid(),

  // References
  course_id: z.string().uuid(),
  lms_configuration_id: z.string().uuid(),

  // Open edX
  edx_course_key: z.string(),
  edx_task_id: z.string().nullable(),

  // Status
  status: LmsImportStatusSchema,
  progress_percent: z.number().int().min(0).max(100),

  // Timing
  started_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
  duration_ms: z.number().int().nullable(),

  // Results
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  error_details: z.record(z.unknown()).nullable(),

  // Links
  course_url: z.string().url().nullable(),
  studio_url: z.string().url().nullable(),

  // Metadata
  metadata: z.record(z.unknown()).default({}),

  // Audit
  created_at: z.coerce.date(),
  created_by: z.string().uuid().nullable(),
});

export type LmsImportJob = z.infer<typeof LmsImportJobSchema>;
```

---

## 3. OLX Types (In-Memory Only)

Types for OLX generation - not persisted to database.

### TypeScript Types

```typescript
// packages/shared-types/src/olx-types.ts

import { z } from 'zod';

/**
 * OLX Course metadata
 */
export const OlxCourseMetaSchema = z.object({
  org: z.string().min(1).max(50),           // Organization code
  course: z.string().min(1).max(50),        // Course code (ASCII)
  run: z.string().min(1).max(50),           // Course run
  display_name: z.string().min(1),          // Human-readable name (supports Cyrillic)
  language: z.string().length(2).default('ru'),
  start: z.string().optional(),              // ISO date
  end: z.string().optional(),                // ISO date
});

export type OlxCourseMeta = z.infer<typeof OlxCourseMetaSchema>;

/**
 * OLX Chapter (maps to MegaCampus Section)
 */
export const OlxChapterSchema = z.object({
  url_name: z.string().min(1).max(100),     // ASCII identifier
  display_name: z.string().min(1),          // Human-readable (Cyrillic OK)
  sequentials: z.array(z.lazy(() => OlxSequentialSchema)),
});

export type OlxChapter = z.infer<typeof OlxChapterSchema>;

/**
 * OLX Sequential (maps to MegaCampus Lesson - subsection level)
 */
export const OlxSequentialSchema = z.object({
  url_name: z.string().min(1).max(100),
  display_name: z.string().min(1),
  verticals: z.array(z.lazy(() => OlxVerticalSchema)),
});

export type OlxSequential = z.infer<typeof OlxSequentialSchema>;

/**
 * OLX Vertical (Unit - container for components)
 */
export const OlxVerticalSchema = z.object({
  url_name: z.string().min(1).max(100),
  display_name: z.string().min(1),
  components: z.array(z.lazy(() => OlxComponentSchema)),
});

export type OlxVertical = z.infer<typeof OlxVerticalSchema>;

/**
 * OLX Component (HTML content)
 */
export const OlxComponentSchema = z.object({
  type: z.literal('html'),                   // Future: 'video', 'problem', etc.
  url_name: z.string().min(1).max(100),
  display_name: z.string().min(1),
  content: z.string(),                       // HTML content
});

export type OlxComponent = z.infer<typeof OlxComponentSchema>;

/**
 * Complete OLX Course structure
 */
export const OlxCourseSchema = z.object({
  meta: OlxCourseMetaSchema,
  chapters: z.array(OlxChapterSchema),
});

export type OlxCourse = z.infer<typeof OlxCourseSchema>;
```

---

## 4. API Input/Output Types

### Publish Course Input

```typescript
export const PublishCourseInputSchema = z.object({
  course_id: z.string().uuid(),
  lms_configuration_id: z.string().uuid(),
  options: z.object({
    overwrite_existing: z.boolean().default(true),
    course_code_override: z.string().max(50).optional(),
    run_override: z.string().max(50).optional(),
  }).default({}),
});

export type PublishCourseInput = z.infer<typeof PublishCourseInputSchema>;
```

### Publish Course Output

```typescript
export const PublishCourseOutputSchema = z.object({
  job_id: z.string().uuid(),
  edx_course_key: z.string(),
  status: LmsImportStatusSchema,
});

export type PublishCourseOutput = z.infer<typeof PublishCourseOutputSchema>;
```

### Connection Test Input/Output

```typescript
export const TestConnectionInputSchema = z.object({
  lms_configuration_id: z.string().uuid(),
});

export const TestConnectionOutputSchema = z.object({
  success: z.boolean(),
  latency_ms: z.number().int(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type TestConnectionInput = z.infer<typeof TestConnectionInputSchema>;
export type TestConnectionOutput = z.infer<typeof TestConnectionOutputSchema>;
```

---

## 5. Validation Rules

### LMS Configuration
- `name`: Unique per organization, 1-100 characters
- `lms_url`, `studio_url`: Valid HTTPS URLs
- `client_id`, `client_secret`: Non-empty, encrypted at rest
- `default_org`: ASCII only, 1-50 characters
- `import_timeout_seconds`: 30-600

### Import Job
- `edx_course_key`: Valid Open edX course key format (`course-v1:Org+Course+Run`)
- `progress_percent`: 0-100
- Cannot create new job if active job exists for same course

### OLX Identifiers
- `url_name`: ASCII only, lowercase, underscores allowed
- Max length: 100 characters
- Must be unique within scope (chapter names unique within course, etc.)
- Generated via transliteration from Cyrillic display names

---

## 6. State Transitions

### Import Job Status

```
pending → uploading → processing → succeeded
    │         │           │
    └─────────┴───────────┴──────→ failed
```

Valid transitions:
- `pending` → `uploading` (upload started)
- `uploading` → `processing` (upload complete, LMS processing)
- `processing` → `succeeded` (import complete)
- `pending` → `failed` (pre-upload validation failed)
- `uploading` → `failed` (upload failed)
- `processing` → `failed` (LMS import failed)

---

## 7. Migration File

```sql
-- Migration: 20241211_create_lms_integration_tables.sql

-- Create enum type
CREATE TYPE lms_import_status AS ENUM (
  'pending',
  'uploading',
  'processing',
  'succeeded',
  'failed'
);

-- Create lms_configurations table
CREATE TABLE lms_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  lms_url TEXT NOT NULL,
  studio_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  default_org TEXT NOT NULL,
  default_run TEXT DEFAULT 'self_paced',
  import_timeout_seconds INTEGER DEFAULT 300,
  max_retries INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  last_connection_test TIMESTAMPTZ,
  last_connection_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT unique_lms_config_name_per_org UNIQUE (organization_id, name),
  CONSTRAINT valid_lms_url CHECK (lms_url ~ '^https?://'),
  CONSTRAINT valid_studio_url CHECK (studio_url ~ '^https?://')
);

CREATE INDEX idx_lms_configurations_org ON lms_configurations(organization_id);
CREATE INDEX idx_lms_configurations_active ON lms_configurations(is_active) WHERE is_active = true;

-- Create lms_import_jobs table
CREATE TABLE lms_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lms_configuration_id UUID NOT NULL REFERENCES lms_configurations(id) ON DELETE CASCADE,
  edx_course_key TEXT NOT NULL,
  edx_task_id TEXT,
  status lms_import_status DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,
  course_url TEXT,
  studio_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX idx_lms_import_jobs_course ON lms_import_jobs(course_id);
CREATE INDEX idx_lms_import_jobs_status ON lms_import_jobs(status);
CREATE INDEX idx_lms_import_jobs_created ON lms_import_jobs(created_at DESC);
CREATE INDEX idx_lms_import_jobs_active ON lms_import_jobs(status)
  WHERE status IN ('pending', 'uploading', 'processing');

-- Enable RLS
ALTER TABLE lms_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lms_configurations (simplified - expand as needed)
CREATE POLICY lms_config_org_access ON lms_configurations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = lms_configurations.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- RLS Policies for lms_import_jobs
CREATE POLICY lms_import_jobs_access ON lms_import_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lms_import_jobs.course_id
        AND c.user_id = auth.uid()
    )
  );
```

---

## 8. CourseInput Adapter Schema

Intermediate schema for mapping MegaCampus DB entities to LMS-agnostic format.

```typescript
// packages/shared-types/src/lms/course-input.ts

import { z } from 'zod';

/**
 * Unit (single content block within a section)
 */
export const UnitInputSchema = z.object({
  /** Unit identifier (ASCII or will be transliterated) */
  id: z.string(),
  /** Unit title (UTF-8, supports Cyrillic) */
  title: z.string().min(1),
  /** HTML content */
  content: z.string(),
  /** Static asset URLs (images, etc.) */
  assets: z.array(z.string().url()).optional(),
});

export type UnitInput = z.infer<typeof UnitInputSchema>;

/**
 * Section (subsection in Open edX terminology)
 */
export const SectionInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  units: z.array(UnitInputSchema).min(1),
});

export type SectionInput = z.infer<typeof SectionInputSchema>;

/**
 * Chapter (top-level course division)
 */
export const ChapterInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  sections: z.array(SectionInputSchema).min(1),
});

export type ChapterInput = z.infer<typeof ChapterInputSchema>;

/**
 * Complete course input for LMS publishing
 * Maps from MegaCampus Stage 5/6 output
 */
export const CourseInputSchema = z.object({
  /** Unique course identifier (ASCII, no spaces) */
  courseId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Course ID must be ASCII alphanumeric'),

  /** Course title (UTF-8, displayed to users) */
  title: z.string().min(1).max(255),

  /** Course description (optional) */
  description: z.string().optional(),

  /** Organization identifier (ASCII) */
  org: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** Course run identifier (e.g., "2025_Q1", "self_paced") */
  run: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** ISO 8601 course start date */
  startDate: z.string().datetime().optional(),

  /** ISO 8601 enrollment start date */
  enrollmentStart: z.string().datetime().optional(),

  /** ISO 8601 enrollment end date */
  enrollmentEnd: z.string().datetime().optional(),

  /** Course language code - uses shared languageSchema (19 languages) */
  language: languageSchema.default('ru'), // From @megacampus/shared-types

  /** Course chapters (sections) */
  chapters: z.array(ChapterInputSchema).min(1),
});

export type CourseInput = z.infer<typeof CourseInputSchema>;

/**
 * Maps MegaCampus DB course to CourseInput
 */
export function mapCourseToInput(
  course: { id: string; title: string; description?: string; language: string },
  sections: Array<{ id: string; title: string; order_index: number }>,
  lessons: Array<{ id: string; section_id: string; title: string; content: unknown; order_index: number }>,
  config: { org: string; run: string }
): CourseInput {
  // Implementation will be in course-gen-platform
  // This signature defines the contract
  throw new Error('Implemented in course-gen-platform');
}
```

---

## 9. Error Class Hierarchy

Custom error types for LMS integration with proper error codes.

```typescript
// packages/shared-types/src/lms/errors.ts

/**
 * Error codes for LMS integration
 */
export const LMS_ERROR_CODES = {
  // Validation errors (4xx)
  OLX_VALIDATION_ERROR: 'OLX_VALIDATION_ERROR',
  INVALID_COURSE_INPUT: 'INVALID_COURSE_INPUT',
  COURSE_NOT_READY: 'COURSE_NOT_READY',

  // Authentication errors (401)
  AUTH_ERROR: 'AUTH_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Import errors (5xx)
  IMPORT_ERROR: 'IMPORT_ERROR',
  IMPORT_TIMEOUT: 'IMPORT_TIMEOUT',
  IMPORT_REJECTED: 'IMPORT_REJECTED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_ERROR: 'DNS_ERROR',

  // Timeout errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UPLOAD_TIMEOUT: 'UPLOAD_TIMEOUT',
  POLL_TIMEOUT: 'POLL_TIMEOUT',

  // Permission errors
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
} as const;

export type LmsErrorCode = typeof LMS_ERROR_CODES[keyof typeof LMS_ERROR_CODES];

/**
 * Base error class for all LMS integration errors
 */
export class LMSIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: LmsErrorCode,
    public readonly lmsType: string,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LMSIntegrationError';

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      lmsType: this.lmsType,
      metadata: this.metadata,
      cause: this.cause?.message,
    };
  }
}

/**
 * OLX validation failed
 */
export class OLXValidationError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>
  ) {
    super(message, 'OLX_VALIDATION_ERROR', 'openedx', undefined, { errors });
    this.name = 'OLXValidationError';
  }
}

/**
 * OAuth2 authentication failed
 */
export class OpenEdXAuthError extends LMSIntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', 'openedx', cause);
    this.name = 'OpenEdXAuthError';
  }
}

/**
 * Course import process failed
 */
export class OpenEdXImportError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly state: string,
    cause?: Error
  ) {
    super(message, 'IMPORT_ERROR', 'openedx', cause, { taskId, state });
    this.name = 'OpenEdXImportError';
  }
}

/**
 * Network/connection error
 */
export class LMSNetworkError extends LMSIntegrationError {
  constructor(message: string, lmsType: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', lmsType, cause);
    this.name = 'LMSNetworkError';
  }
}

/**
 * Operation timeout
 */
export class LMSTimeoutError extends LMSIntegrationError {
  constructor(
    message: string,
    lmsType: string,
    public readonly duration: number,
    public readonly operation: 'upload' | 'poll' | 'connect'
  ) {
    super(message, 'TIMEOUT_ERROR', lmsType, undefined, { duration, operation });
    this.name = 'LMSTimeoutError';
  }
}

/**
 * Type guard for LMS errors
 */
export function isLMSError(error: unknown): error is LMSIntegrationError {
  return error instanceof LMSIntegrationError;
}

/**
 * Error code to HTTP status mapping
 */
export const ERROR_CODE_TO_HTTP: Record<LmsErrorCode, number> = {
  OLX_VALIDATION_ERROR: 400,
  INVALID_COURSE_INPUT: 400,
  COURSE_NOT_READY: 412,
  AUTH_ERROR: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  IMPORT_ERROR: 500,
  IMPORT_TIMEOUT: 504,
  IMPORT_REJECTED: 422,
  NETWORK_ERROR: 503,
  CONNECTION_REFUSED: 503,
  DNS_ERROR: 503,
  TIMEOUT_ERROR: 504,
  UPLOAD_TIMEOUT: 504,
  POLL_TIMEOUT: 504,
  PERMISSION_ERROR: 403,
  INSUFFICIENT_ROLE: 403,
};
```

---

## 10. UrlNameRegistry

Tracks unique identifiers for OLX elements.

```typescript
// packages/course-gen-platform/src/integrations/lms/openedx/olx/url-name-registry.ts

import { transliterate } from '../utils/transliterate';

/**
 * Element types that require unique url_name
 */
export type OlxElementType = 'chapter' | 'sequential' | 'vertical' | 'html';

/**
 * Registry for tracking unique url_name values within a course
 * Ensures no duplicate identifiers within each element type scope
 */
export class UrlNameRegistry {
  private used: Map<OlxElementType, Set<string>> = new Map();

  constructor() {
    // Initialize sets for each element type
    this.used.set('chapter', new Set());
    this.used.set('sequential', new Set());
    this.used.set('vertical', new Set());
    this.used.set('html', new Set());
  }

  /**
   * Generate a unique url_name for given element type
   *
   * @param elementType - Type of OLX element
   * @param input - Display name (may contain Cyrillic)
   * @returns ASCII-only url_name, unique within element type
   */
  generate(elementType: OlxElementType, input: string): string {
    const set = this.used.get(elementType);
    if (!set) {
      throw new Error(`Unknown element type: ${elementType}`);
    }

    // 1. Transliterate Cyrillic to ASCII
    const ascii = transliterate(input);

    // 2. Slugify: remove invalid characters, replace spaces
    const base = ascii
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')           // Collapse multiple underscores
      .replace(/^_|_$/g, '')         // Trim leading/trailing underscores
      .slice(0, 40);                 // Max 40 chars for base (leave room for suffix)

    // 3. Ensure uniqueness with numeric suffix
    let candidate = base || 'item';
    let counter = 1;

    while (set.has(candidate)) {
      candidate = `${base}_${counter}`;
      counter++;

      // Safety limit
      if (counter > 10000) {
        throw new Error(`Too many duplicate url_names for base: ${base}`);
      }
    }

    set.add(candidate);
    return candidate;
  }

  /**
   * Check if url_name is already used
   */
  has(elementType: OlxElementType, urlName: string): boolean {
    return this.used.get(elementType)?.has(urlName) ?? false;
  }

  /**
   * Get count of registered names for element type
   */
  count(elementType: OlxElementType): number {
    return this.used.get(elementType)?.size ?? 0;
  }

  /**
   * Clear registry (for testing)
   */
  clear(): void {
    this.used.forEach(set => set.clear());
  }

  /**
   * Get all registered names for element type (for debugging)
   */
  getAll(elementType: OlxElementType): string[] {
    return Array.from(this.used.get(elementType) ?? []);
  }
}
```

---

## 11. LMS Adapter Interface Types

Abstract interface for LMS-agnostic operations.

```typescript
// packages/shared-types/src/lms/adapter.ts

import { z } from 'zod';
import type { CourseInput } from './course-input';

/**
 * Result of a course publish operation
 */
export const PublishResultSchema = z.object({
  success: z.boolean(),
  courseId: z.string(),
  lmsCourseId: z.string(),
  lmsUrl: z.string().url(),
  studioUrl: z.string().url().optional(),
  taskId: z.string().optional(),
  duration: z.number().int(),
  error: z.string().optional(),
});

export type PublishResult = z.infer<typeof PublishResultSchema>;

/**
 * Course status in LMS
 */
export const CourseStatusSchema = z.object({
  exists: z.boolean(),
  published: z.boolean(),
  lastModified: z.string().datetime().optional(),
  enrollmentCount: z.number().int().optional(),
  lmsUrl: z.string().url().optional(),
  studioUrl: z.string().url().optional(),
});

export type CourseStatus = z.infer<typeof CourseStatusSchema>;

/**
 * Connection test result
 */
export const TestConnectionResultSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number().int(),
  message: z.string(),
  lmsVersion: z.string().optional(),
  apiVersion: z.string().optional(),
});

export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;

/**
 * Base LMS configuration (shared across all LMS types)
 */
export const BaseLMSConfigSchema = z.object({
  /** Unique instance identifier */
  instanceId: z.string().uuid(),
  /** Human-readable name */
  name: z.string(),
  /** LMS type discriminator */
  type: z.enum(['openedx', 'moodle', 'canvas']),
  /** Is this instance active? */
  enabled: z.boolean().default(true),
  /** Default organization for courses */
  organization: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  /** Request timeout in milliseconds */
  timeout: z.number().positive().default(300000),
  /** Maximum retry attempts */
  maxRetries: z.number().int().positive().default(3),
});

export type BaseLMSConfig = z.infer<typeof BaseLMSConfigSchema>;

/**
 * Open edX specific configuration
 */
export const OpenEdXConfigSchema = BaseLMSConfigSchema.extend({
  type: z.literal('openedx'),
  /** LMS base URL (for OAuth2 token) */
  lmsUrl: z.string().url(),
  /** CMS/Studio base URL (for Import API) */
  cmsUrl: z.string().url(),
  /** OAuth2 Client ID */
  clientId: z.string().min(1),
  /** OAuth2 Client Secret */
  clientSecret: z.string().min(1),
  /** Poll interval in milliseconds */
  pollInterval: z.number().positive().default(5000),
  /** Auto-create course if not exists */
  autoCreateCourse: z.boolean().default(true),
});

export type OpenEdXConfig = z.infer<typeof OpenEdXConfigSchema>;

/**
 * Abstract LMS adapter interface
 * All LMS implementations must implement this interface
 */
export abstract class LMSAdapter<TConfig extends BaseLMSConfig = BaseLMSConfig> {
  constructor(protected readonly config: TConfig) {}

  /** Get adapter type identifier */
  abstract get type(): string;

  /** Publish a course to the LMS */
  abstract publishCourse(input: CourseInput): Promise<PublishResult>;

  /** Get course status in LMS */
  abstract getCourseStatus(courseId: string): Promise<CourseStatus>;

  /** Delete course from LMS (if supported) */
  abstract deleteCourse(courseId: string): Promise<boolean>;

  /** Validate configuration */
  abstract validateConfig(): Promise<boolean>;

  /** Test connection to LMS */
  abstract testConnection(): Promise<TestConnectionResult>;
}
```

---

## 12. Pre-Packaging Validation Rules

Detailed validation performed before OLX packaging.

```typescript
// packages/course-gen-platform/src/integrations/lms/openedx/olx/validators.ts

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validation rules applied before packaging
 */
export const VALIDATION_RULES = {
  // Structure validation
  COURSE_XML_REQUIRED: 'course.xml must exist',
  MIN_ONE_CHAPTER: 'Course must have at least one chapter',
  MIN_ONE_SEQUENTIAL: 'Each chapter must have at least one sequential',
  MIN_ONE_VERTICAL: 'Each sequential must have at least one vertical',

  // File reference validation
  REFERENCED_FILE_EXISTS: 'All url_name references must have corresponding files',
  NO_ORPHAN_FILES: 'All files should be referenced (warning)',

  // Content validation
  VALID_UTF8: 'All content must be valid UTF-8',
  HTML_SIZE_LIMIT: 'HTML content should be <1MB (warning if exceeded)',
  NO_SCRIPT_TAGS: 'HTML should not contain <script> tags (warning)',

  // Asset validation
  ABSOLUTE_IMAGE_URLS: 'Image src should be absolute URLs or /static/ paths',
  NO_LOCAL_FILE_REFS: 'No file:// or relative ../ paths allowed',

  // Identifier validation
  ASCII_URL_NAMES: 'url_name attributes must be ASCII only',
  URL_NAME_MAX_LENGTH: 'url_name must be ≤100 characters',
  URL_NAME_PATTERN: 'url_name must match /^[a-zA-Z0-9_-]+$/',
  UNIQUE_URL_NAMES: 'url_name must be unique within element type scope',

  // Policy validation
  VALID_POLICY_JSON: 'policy.json must be valid JSON',
  VALID_GRADING_POLICY: 'grading_policy.json must be valid JSON',
};

/**
 * Image reference patterns that need validation
 */
export const IMAGE_PATTERNS = {
  VALID: [
    /^https?:\/\//,           // Absolute HTTP(S) URLs
    /^\/static\//,            // Open edX static files
    /^\/asset-v1:/,           // Open edX asset keys
  ],
  INVALID: [
    /^file:\/\//,             // Local file references
    /^\.\.\//,                // Parent directory traversal
    /^\.\/(?!static)/,        // Relative paths (except ./static)
    /^[a-zA-Z]:\\/,           // Windows absolute paths
  ],
};
```
