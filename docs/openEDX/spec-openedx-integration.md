# Technical Specification: MegaCampusAI LMS Integration

**Version:** 2.0.0
**Status:** Draft
**Created:** 2025-12-07
**Updated:** 2025-12-07
**Author:** Claude Code
**Related Documents:**
- [PRD: MegaCampusAI ↔ Open edX Integration](./PRD_MegaCampusAI_OpenEdX_Integration.md)
- [ADR-001: Choice of Open edX as Primary LMS](./ADR-XXX-Choice-of-Open-edX-as-Primary-LMS.md)
- [Deep Research: Open edX API and OLX](./Open%20edX%20API%20and%20OLX%20Research.md)
- [LMS Integration Roadmap](../FUTURE/LMS-INTEGRATION-ROADMAP.md)

---

## 1. Executive Summary

This specification defines the technical implementation of the **LMS Integration** module for MegaCampusAI. The initial target is Open edX, but the architecture is designed to support multiple LMS backends in the future (Moodle, Canvas, custom systems).

**Key Features:**
1. Converting AI-generated course content into LMS-specific formats (OLX for Open edX)
2. Packaging and uploading courses via LMS APIs
3. Synchronizing course metadata and permissions
4. Production-grade error handling, logging, and monitoring

**Target Package:** `packages/lms-integration/`

**Design Principles:**
- **LMS-agnostic interfaces** — abstract base classes for future LMS support
- **Reuse existing components** — pino logger, error handling patterns, auth middleware
- **Production-ready** — comprehensive validation, retry logic, monitoring

---

## 2. Scope

### 2.1 In Scope (Production)

| Component | Description |
|-----------|-------------|
| **LMS Adapter Interface** | Abstract interface for LMS-agnostic operations |
| **Open edX Adapter** | Concrete implementation for Open edX (OLX + Import API) |
| **OLX Generator** | Convert Stage 5 JSON → OLX directory structure |
| **OLX Packager** | Create valid tar.gz from OLX directory |
| **API Client** | OAuth2 authentication + Course Import API |
| **Transliteration** | Cyrillic → ASCII for `url_name` attributes |
| **Validation** | Pre-packaging OLX validation |
| **Logging** | Pino-based structured logging (reuse from course-gen-platform) |
| **Error Handling** | Consistent error types with DB logging |
| **Unit Tests** | 100% coverage for core functions |
| **Integration Tests** | Mocked API client tests |
| **E2E Tests** | Full pipeline with real Open edX (CI optional) |

**Supported OLX Elements:**
- Course Shell (metadata, policies)
- Chapters (course sections)
- Sequentials (subsections)
- Verticals (units)
- HTML Components (text content)
- Static assets (images via URL references)

### 2.2 Out of Scope (Future Phases)

- Video components (external hosting integration)
- Problem/Quiz components (Capa schema)
- Discussion forums
- Advanced grading policies
- LTI integrations
- Moodle/Canvas adapters
- Multi-tenancy (eox-tenant)

---

## 3. Architecture

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MegaCampusAI                                 │
│  ┌─────────────────┐                                                │
│  │   Stage 5       │                                                │
│  │   Generation    │──────► CourseOutput JSON                       │
│  │   Pipeline      │                                                │
│  └─────────────────┘                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   packages/lms-integration                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    LMS Adapter Interface                    │    │
│  │  publishCourse() | getCourseStatus() | deleteCourse()       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                               │                                     │
│                               ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                   Open edX Adapter                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │    │
│  │  │   OLX       │  │   OLX       │  │   API Client        │ │    │
│  │  │   Generator │─►│   Packager  │─►│   (OAuth2 + Import) │ │    │
│  │  └─────────────┘  └─────────────┘  └──────────┬──────────┘ │    │
│  └───────────────────────────────────────────────┼────────────┘    │
└──────────────────────────────────────────────────┼──────────────────┘
                                                   │
                                                   ▼ HTTPS POST
┌─────────────────────────────────────────────────────────────────────┐
│                        Open edX (Tutor)                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐     │
│  │   CMS       │    │   Celery    │    │   MongoDB           │     │
│  │   (Studio)  │───►│   Worker    │───►│   Modulestore       │     │
│  │   API       │    │   (Async)   │    │                     │     │
│  └─────────────┘    └─────────────┘    └─────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Package Structure

```
packages/lms-integration/
├── src/
│   ├── adapters/
│   │   ├── base.ts               # Abstract LMS adapter interface
│   │   └── openedx/
│   │       ├── adapter.ts        # Open edX adapter implementation
│   │       ├── olx/
│   │       │   ├── generator.ts  # OLX structure generator
│   │       │   ├── packager.ts   # tar.gz creation
│   │       │   ├── templates/
│   │       │   │   ├── course.ts
│   │       │   │   ├── chapter.ts
│   │       │   │   ├── sequential.ts
│   │       │   │   ├── vertical.ts
│   │       │   │   ├── html.ts
│   │       │   │   └── policies.ts
│   │       │   ├── validators.ts # Pre-packaging validation
│   │       │   └── types.ts      # OLX-specific types
│   │       ├── api/
│   │       │   ├── client.ts     # Open edX API client
│   │       │   ├── auth.ts       # OAuth2 authentication
│   │       │   ├── poller.ts     # Import status polling
│   │       │   └── types.ts      # API response types
│   │       └── index.ts          # Open edX adapter exports
│   ├── utils/
│   │   ├── transliterate.ts      # Cyrillic → ASCII
│   │   ├── url-name.ts           # url_name generation
│   │   └── xml.ts                # XML escaping utilities
│   ├── types/
│   │   ├── course-input.ts       # Input types (Stage 5 adapter)
│   │   ├── config.ts             # Configuration schemas
│   │   ├── errors.ts             # Custom error types
│   │   └── index.ts              # Type exports
│   ├── logger.ts                 # Re-export from course-gen-platform
│   └── index.ts                  # Public API exports
├── tests/
│   ├── unit/
│   │   ├── olx-generator.test.ts
│   │   ├── transliterate.test.ts
│   │   ├── url-name.test.ts
│   │   └── validators.test.ts
│   ├── integration/
│   │   ├── api-client.test.ts
│   │   └── full-pipeline.test.ts
│   ├── e2e/
│   │   └── openedx-import.test.ts
│   └── fixtures/
│       ├── sample-course.json
│       └── expected-olx/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 4. Reusable Components

### 4.1 Logger (from course-gen-platform)

**Location:** `packages/course-gen-platform/src/shared/logger/`

```typescript
// packages/lms-integration/src/logger.ts
export { logger } from '@megacampus/course-gen-platform/shared/logger';
export type { ErrorSeverity, CreateErrorLogParams } from '@megacampus/course-gen-platform/shared/logger';
export { logPermanentFailure } from '@megacampus/course-gen-platform/shared/logger';
```

**Usage:**
```typescript
import { logger, logPermanentFailure } from './logger';

logger.info({ courseId, lmsType: 'openedx' }, 'Starting course publish');

// On permanent failure
await logPermanentFailure({
  organization_id: orgId,
  error_message: 'LMS import failed after 3 retries',
  severity: 'ERROR',
  job_type: 'LMS_IMPORT',
  metadata: { lmsType: 'openedx', courseKey }
});
```

### 4.2 Authentication & Authorization

**Current System (from course-gen-platform):**
- Roles: `superadmin` | `admin` | `instructor` | `student`
- Middleware: `isAuthenticated`, `hasRole()`, `requireInstructor`

**LMS Integration Permissions:**
- **Publish Course:** `requireInstructor` (instructor, admin, superadmin)
- **View Import Status:** `requireInstructor`
- **Delete Course from LMS:** `requireAdmin` (admin, superadmin)
- **Configure LMS Connection:** `requireSuperadmin`

### 4.3 Database Types

**Location:** `packages/shared-types/src/database.types.ts`

```typescript
// Role enum
type Role = 'admin' | 'superadmin' | 'instructor' | 'student';
```

---

## 5. Data Models

### 5.1 Course Input Schema (Stage 5 Adapter)

> **Note:** This interface defines the contract between Stage 5 output and LMS integration.
> When Stage 5 schema stabilizes, this adapter will map to the canonical format.

```typescript
// src/types/course-input.ts
import { z } from 'zod';

/**
 * Minimum required input for LMS course publishing.
 * Adapter layer maps Stage 5 output to this interface.
 */
export const CourseInputSchema = z.object({
  /** Unique course identifier (ASCII, no spaces) */
  courseId: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** Course title (UTF-8, displayed to users) */
  title: z.string().min(1).max(255),

  /** Course description (UTF-8, optional) */
  description: z.string().optional(),

  /** Organization identifier (ASCII) */
  org: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** Course run identifier (e.g., "2025_Q1") */
  run: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** ISO 8601 course start date */
  startDate: z.string().datetime().optional(),

  /** ISO 8601 enrollment start date */
  enrollmentStart: z.string().datetime().optional(),

  /** ISO 8601 enrollment end date */
  enrollmentEnd: z.string().datetime().optional(),

  /** Course language code (e.g., "ru", "en") */
  language: z.enum(['ru', 'en']).default('ru'),

  /** Course chapters (sections) */
  chapters: z.array(z.lazy(() => ChapterInputSchema)).min(1),
});

export const ChapterInputSchema = z.object({
  /** Chapter identifier (will be transliterated if needed) */
  id: z.string(),

  /** Chapter title (UTF-8) */
  title: z.string().min(1),

  /** Subsections within this chapter */
  sections: z.array(z.lazy(() => SectionInputSchema)).min(1),
});

export const SectionInputSchema = z.object({
  /** Section identifier */
  id: z.string(),

  /** Section title (UTF-8) */
  title: z.string().min(1),

  /** Units within this section */
  units: z.array(z.lazy(() => UnitInputSchema)).min(1),
});

export const UnitInputSchema = z.object({
  /** Unit identifier */
  id: z.string(),

  /** Unit title (UTF-8) */
  title: z.string().min(1),

  /** HTML content (UTF-8, can include Cyrillic) */
  content: z.string(),

  /** Static assets referenced in content (URLs) */
  assets: z.array(z.string().url()).optional(),
});

export type CourseInput = z.infer<typeof CourseInputSchema>;
export type ChapterInput = z.infer<typeof ChapterInputSchema>;
export type SectionInput = z.infer<typeof SectionInputSchema>;
export type UnitInput = z.infer<typeof UnitInputSchema>;
```

### 5.2 Configuration Schema

```typescript
// src/types/config.ts
import { z } from 'zod';

/**
 * Base LMS configuration (shared across adapters)
 */
export const BaseLMSConfigSchema = z.object({
  /** Unique identifier for this LMS instance */
  instanceId: z.string().uuid(),

  /** Human-readable name */
  name: z.string(),

  /** LMS type */
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

export type BaseLMSConfig = z.infer<typeof BaseLMSConfigSchema>;
export type OpenEdXConfig = z.infer<typeof OpenEdXConfigSchema>;
```

### 5.3 OLX Internal Types

```typescript
// src/adapters/openedx/olx/types.ts

/**
 * Valid characters for url_name: [a-zA-Z0-9_-]
 */
export type UrlName = string;

/**
 * Course key format: course-v1:Org+Course+Run
 */
export type CourseKey = `course-v1:${string}+${string}+${string}`;

/**
 * Generated OLX structure (in-memory before packaging)
 */
export interface OLXStructure {
  /** Root course.xml content */
  courseXml: string;

  /** Map of file paths to content */
  files: Map<string, string>;

  /** Course key for API calls */
  courseKey: CourseKey;

  /** Metadata for logging/debugging */
  metadata: {
    totalChapters: number;
    totalSections: number;
    totalUnits: number;
    totalAssets: number;
    generatedAt: string;
  };
}

/**
 * url_name registry for uniqueness tracking
 */
export interface UrlNameRegistry {
  chapters: Set<string>;
  sequentials: Set<string>;
  verticals: Set<string>;
  html: Set<string>;
}
```

### 5.4 API Response Types

```typescript
// src/adapters/openedx/api/types.ts

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

export interface ImportInitResponse {
  task_id: string;
}

export type ImportStatus = 'Pending' | 'In Progress' | 'Succeeded' | 'Failed';

export interface ImportStatusResponse {
  state: ImportStatus;
  result?: string;
  error?: string;
}

export interface PublishResult {
  success: boolean;
  taskId: string;
  courseKey: CourseKey;
  duration: number;
  lmsUrl: string;
  studioUrl: string;
  error?: string;
}
```

---

## 6. LMS Adapter Interface

### 6.1 Abstract Base Adapter

```typescript
// src/adapters/base.ts
import type { CourseInput } from '../types/course-input';
import type { BaseLMSConfig } from '../types/config';

/**
 * Result of a course publish operation
 */
export interface PublishResult {
  success: boolean;
  courseId: string;
  lmsCourseId: string;
  lmsUrl: string;
  duration: number;
  error?: string;
}

/**
 * Course status in LMS
 */
export interface CourseStatus {
  exists: boolean;
  published: boolean;
  lastModified?: string;
  enrollmentCount?: number;
}

/**
 * Abstract LMS adapter interface.
 * All LMS implementations must implement this interface.
 */
export abstract class LMSAdapter<TConfig extends BaseLMSConfig = BaseLMSConfig> {
  constructor(protected readonly config: TConfig) {}

  /**
   * Get adapter type identifier
   */
  abstract get type(): string;

  /**
   * Publish a course to the LMS
   */
  abstract publishCourse(input: CourseInput): Promise<PublishResult>;

  /**
   * Get course status in LMS
   */
  abstract getCourseStatus(courseId: string): Promise<CourseStatus>;

  /**
   * Delete course from LMS
   */
  abstract deleteCourse(courseId: string): Promise<boolean>;

  /**
   * Validate configuration
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Test connection to LMS
   */
  abstract testConnection(): Promise<boolean>;
}
```

### 6.2 Open edX Adapter

```typescript
// src/adapters/openedx/adapter.ts
import { LMSAdapter, PublishResult, CourseStatus } from '../base';
import { OpenEdXConfig } from '../../types/config';
import { CourseInput } from '../../types/course-input';
import { OLXGenerator } from './olx/generator';
import { packageOLX } from './olx/packager';
import { OpenEdXClient } from './api/client';
import { logger } from '../../logger';

export class OpenEdXAdapter extends LMSAdapter<OpenEdXConfig> {
  private client: OpenEdXClient;
  private generator: OLXGenerator;

  constructor(config: OpenEdXConfig) {
    super(config);
    this.client = new OpenEdXClient(config);
    this.generator = new OLXGenerator({ organization: config.organization });
  }

  get type(): string {
    return 'openedx';
  }

  async publishCourse(input: CourseInput): Promise<PublishResult> {
    const startTime = Date.now();

    logger.info({
      courseId: input.courseId,
      org: input.org,
      run: input.run,
    }, 'Starting Open edX course publish');

    try {
      // 1. Generate OLX structure
      const structure = this.generator.generate(input);

      logger.debug({
        courseKey: structure.courseKey,
        ...structure.metadata,
      }, 'OLX structure generated');

      // 2. Package as tar.gz
      const tarGz = await packageOLX(structure, input.courseId);

      logger.debug({
        packageSize: tarGz.length,
      }, 'OLX package created');

      // 3. Upload to Open edX
      const importResult = await this.client.importCourse(
        structure.courseKey,
        tarGz
      );

      const duration = Date.now() - startTime;

      logger.info({
        courseKey: structure.courseKey,
        taskId: importResult.taskId,
        duration,
      }, 'Course published to Open edX successfully');

      return {
        success: true,
        courseId: input.courseId,
        lmsCourseId: structure.courseKey,
        lmsUrl: `${this.config.lmsUrl}/courses/${structure.courseKey}/about`,
        studioUrl: `${this.config.cmsUrl}/course/${structure.courseKey}`,
        taskId: importResult.taskId,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        courseId: input.courseId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }, 'Failed to publish course to Open edX');

      throw error;
    }
  }

  async getCourseStatus(courseId: string): Promise<CourseStatus> {
    return this.client.getCourseStatus(courseId);
  }

  async deleteCourse(courseId: string): Promise<boolean> {
    return this.client.deleteCourse(courseId);
  }

  async validateConfig(): Promise<boolean> {
    // Validate URLs are reachable
    // Validate credentials format
    return true;
  }

  async testConnection(): Promise<boolean> {
    return this.client.testConnection();
  }
}
```

---

## 7. Component Specifications

### 7.1 URL Name Generator

**File:** `src/utils/url-name.ts`

**Requirements:**
- Output must match regex: `^[a-zA-Z0-9_-]+$`
- Must be unique within element type (tracked via registry)
- Maximum length: 50 characters

**Implementation:**

```typescript
import { transliterate } from './transliterate';

/**
 * Registry to track used url_names and ensure uniqueness
 */
export class UrlNameRegistry {
  private used: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize for known element types
    this.used.set('chapter', new Set());
    this.used.set('sequential', new Set());
    this.used.set('vertical', new Set());
    this.used.set('html', new Set());
  }

  /**
   * Generate a unique url_name for given element type
   */
  generate(elementType: string, input: string): string {
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
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);

    // 3. Ensure uniqueness with numeric suffix
    let candidate = base || 'item';
    let counter = 1;

    while (set.has(candidate)) {
      candidate = `${base}_${counter}`;
      counter++;
    }

    set.add(candidate);
    return candidate;
  }

  /**
   * Clear registry (for testing)
   */
  clear(): void {
    this.used.forEach(set => set.clear());
  }
}
```

### 7.2 Transliteration

**File:** `src/utils/transliterate.ts`

```typescript
/**
 * Cyrillic → Latin transliteration map (GOST 7.79-2000 System B)
 */
const CYRILLIC_MAP: Record<string, string> = {
  // Lowercase
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Uppercase
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
  'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
  'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
  'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
  'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch',
  'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
  'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  // Ukrainian specific
  'і': 'i', 'І': 'I', 'ї': 'yi', 'Ї': 'Yi',
  'є': 'ye', 'Є': 'Ye', 'ґ': 'g', 'Ґ': 'G',
};

/**
 * Transliterate text containing Cyrillic characters to Latin
 */
export function transliterate(text: string): string {
  return text
    .split('')
    .map(char => CYRILLIC_MAP[char] ?? char)
    .join('');
}
```

### 7.3 OLX Generator

**File:** `src/adapters/openedx/olx/generator.ts`

```typescript
import { CourseInput } from '../../../types/course-input';
import { OLXStructure, CourseKey, UrlNameRegistry } from './types';
import { generateCourseXml } from './templates/course';
import { generateChapterXml } from './templates/chapter';
import { generateSequentialXml } from './templates/sequential';
import { generateVerticalXml } from './templates/vertical';
import { generateHtmlXml, generateHtmlContent } from './templates/html';
import { generatePolicies } from './templates/policies';
import { validateOLXStructure } from './validators';
import { UrlNameRegistry as Registry } from '../../../utils/url-name';

interface GeneratorConfig {
  organization: string;
}

export class OLXGenerator {
  private config: GeneratorConfig;

  constructor(config: GeneratorConfig) {
    this.config = config;
  }

  generate(input: CourseInput): OLXStructure {
    const registry = new Registry();
    const files = new Map<string, string>();

    // Build course key
    const courseKey: CourseKey = `course-v1:${input.org}+${input.courseId}+${input.run}`;

    // Track structure for course.xml
    const chapterRefs: { urlName: string; displayName: string }[] = [];

    // Generate chapters
    for (const chapter of input.chapters) {
      const chapterUrlName = registry.generate('chapter', chapter.id);
      chapterRefs.push({ urlName: chapterUrlName, displayName: chapter.title });

      const sectionRefs: { urlName: string }[] = [];

      // Generate sections (sequentials)
      for (const section of chapter.sections) {
        const seqUrlName = registry.generate('sequential', section.id);
        sectionRefs.push({ urlName: seqUrlName });

        const unitRefs: { urlName: string }[] = [];

        // Generate units (verticals)
        for (const unit of section.units) {
          const vertUrlName = registry.generate('vertical', unit.id);
          unitRefs.push({ urlName: vertUrlName });

          // Generate HTML component
          const htmlUrlName = registry.generate('html', unit.id);

          // Add vertical XML
          files.set(
            `vertical/${vertUrlName}.xml`,
            generateVerticalXml(unit.title, [{ urlName: htmlUrlName }])
          );

          // Add HTML XML pointer
          files.set(
            `html/${htmlUrlName}.xml`,
            generateHtmlXml(unit.title, htmlUrlName)
          );

          // Add HTML content
          files.set(
            `html/${htmlUrlName}.html`,
            generateHtmlContent(unit.content)
          );
        }

        // Add sequential XML
        files.set(
          `sequential/${seqUrlName}.xml`,
          generateSequentialXml(section.title, unitRefs)
        );
      }

      // Add chapter XML
      files.set(
        `chapter/${chapterUrlName}.xml`,
        generateChapterXml(chapter.title, sectionRefs)
      );
    }

    // Add policies
    const policies = generatePolicies(input);
    files.set(`policies/${input.run}/policy.json`, policies.policy);
    files.set(`policies/${input.run}/grading_policy.json`, policies.grading);

    // Generate course.xml
    const courseXml = generateCourseXml(input, chapterRefs);

    const structure: OLXStructure = {
      courseXml,
      files,
      courseKey,
      metadata: {
        totalChapters: input.chapters.length,
        totalSections: input.chapters.reduce((sum, ch) => sum + ch.sections.length, 0),
        totalUnits: input.chapters.reduce(
          (sum, ch) => sum + ch.sections.reduce((s, sec) => s + sec.units.length, 0),
          0
        ),
        totalAssets: 0,
        generatedAt: new Date().toISOString(),
      },
    };

    // Validate before returning
    const validation = validateOLXStructure(structure);
    if (!validation.valid) {
      throw new OLXValidationError(
        `OLX validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        validation.errors
      );
    }

    return structure;
  }
}
```

### 7.4 OLX Templates

#### 7.4.1 course.xml

```typescript
// src/adapters/openedx/olx/templates/course.ts
import { CourseInput } from '../../../../types/course-input';
import { escapeXml } from '../../../../utils/xml';

interface ChapterRef {
  urlName: string;
  displayName: string;
}

export function generateCourseXml(
  input: CourseInput,
  chapters: ChapterRef[]
): string {
  const chapterElements = chapters
    .map(ch => `    <chapter url_name="${ch.urlName}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<course
    org="${escapeXml(input.org)}"
    course="${escapeXml(input.courseId)}"
    url_name="${escapeXml(input.run)}"
    display_name="${escapeXml(input.title)}"
    ${input.startDate ? `start="${input.startDate}"` : ''}
    ${input.enrollmentStart ? `enrollment_start="${input.enrollmentStart}"` : ''}
    ${input.enrollmentEnd ? `enrollment_end="${input.enrollmentEnd}"` : ''}
    language="${input.language}">

${chapterElements}
</course>
`;
}
```

#### 7.4.2 chapter.xml

```typescript
// src/adapters/openedx/olx/templates/chapter.ts
import { escapeXml } from '../../../../utils/xml';

interface SequentialRef {
  urlName: string;
}

export function generateChapterXml(
  title: string,
  sequentials: SequentialRef[]
): string {
  const seqElements = sequentials
    .map(s => `    <sequential url_name="${s.urlName}"/>`)
    .join('\n');

  return `<chapter display_name="${escapeXml(title)}">
${seqElements}
</chapter>
`;
}
```

#### 7.4.3 sequential.xml

```typescript
// src/adapters/openedx/olx/templates/sequential.ts
import { escapeXml } from '../../../../utils/xml';

interface VerticalRef {
  urlName: string;
}

export function generateSequentialXml(
  title: string,
  verticals: VerticalRef[]
): string {
  const vertElements = verticals
    .map(v => `    <vertical url_name="${v.urlName}"/>`)
    .join('\n');

  return `<sequential display_name="${escapeXml(title)}">
${vertElements}
</sequential>
`;
}
```

#### 7.4.4 vertical.xml

```typescript
// src/adapters/openedx/olx/templates/vertical.ts
import { escapeXml } from '../../../../utils/xml';

interface HtmlRef {
  urlName: string;
}

export function generateVerticalXml(
  title: string,
  htmlComponents: HtmlRef[]
): string {
  const htmlElements = htmlComponents
    .map(h => `    <html url_name="${h.urlName}"/>`)
    .join('\n');

  return `<vertical display_name="${escapeXml(title)}">
${htmlElements}
</vertical>
`;
}
```

#### 7.4.5 html.xml + html.html

```typescript
// src/adapters/openedx/olx/templates/html.ts
import { escapeXml } from '../../../../utils/xml';

export function generateHtmlXml(title: string, filename: string): string {
  return `<html display_name="${escapeXml(title)}" filename="${filename}"/>
`;
}

export function generateHtmlContent(content: string): string {
  // Content is already HTML, just return as-is
  // Validation happens separately
  return content;
}
```

### 7.5 OLX Packager

```typescript
// src/adapters/openedx/olx/packager.ts
import archiver from 'archiver';
import { OLXStructure } from './types';

export async function packageOLX(
  structure: OLXStructure,
  courseName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('tar', { gzip: true });
    const chunks: Buffer[] = [];

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add course.xml at root of course directory
    archive.append(structure.courseXml, {
      name: `${courseName}/course.xml`
    });

    // Add all other files
    for (const [path, content] of structure.files) {
      archive.append(content, {
        name: `${courseName}/${path}`
      });
    }

    archive.finalize();
  });
}
```

### 7.6 Open edX API Client

```typescript
// src/adapters/openedx/api/client.ts
import axios, { AxiosInstance } from 'axios';
import { OpenEdXConfig } from '../../../types/config';
import {
  TokenResponse,
  ImportInitResponse,
  ImportStatus,
  ImportStatusResponse,
  CourseKey,
} from './types';
import { logger } from '../../../logger';

export class OpenEdXClient {
  private config: OpenEdXConfig;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: OpenEdXConfig) {
    this.config = config;
    this.httpClient = axios.create({
      timeout: config.timeout,
    });
  }

  /**
   * Authenticate and get JWT token
   */
  private async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return; // Token still valid (with 1 minute buffer)
    }

    logger.debug({ lmsUrl: this.config.lmsUrl }, 'Authenticating with Open edX');

    const response = await this.httpClient.post<TokenResponse>(
      `${this.config.lmsUrl}/oauth2/access_token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        token_type: 'jwt',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + response.data.expires_in * 1000;

    logger.debug({ expiresIn: response.data.expires_in }, 'Authentication successful');
  }

  /**
   * Import course package into Open edX
   */
  async importCourse(
    courseKey: CourseKey,
    tarGzBuffer: Buffer
  ): Promise<{ success: boolean; taskId: string }> {
    await this.authenticate();

    const url = `${this.config.cmsUrl}/api/courses/v0/import/${courseKey}/`;

    logger.info({ courseKey, packageSize: tarGzBuffer.length }, 'Uploading course to Open edX');

    // Create form data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('course_data', tarGzBuffer, {
      filename: 'course.tar.gz',
      contentType: 'application/gzip',
    });

    // Upload
    const response = await this.httpClient.post<ImportInitResponse>(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `JWT ${this.accessToken}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const taskId = response.data.task_id;

    logger.info({ taskId }, 'Upload successful, polling for completion');

    // Poll for completion
    const result = await this.pollImportStatus(courseKey, taskId);

    return {
      success: result.state === 'Succeeded',
      taskId,
    };
  }

  /**
   * Poll import status until completion
   */
  private async pollImportStatus(
    courseKey: CourseKey,
    taskId: string
  ): Promise<ImportStatusResponse> {
    const startTime = Date.now();
    const maxWait = this.config.timeout;

    while (Date.now() - startTime < maxWait) {
      await this.authenticate();

      const url = `${this.config.cmsUrl}/api/courses/v0/import/${courseKey}/?task_id=${taskId}`;

      const response = await this.httpClient.get<ImportStatusResponse>(url, {
        headers: {
          Authorization: `JWT ${this.accessToken}`,
        },
      });

      const { state } = response.data;

      logger.debug({ taskId, state }, 'Import status');

      if (state === 'Succeeded') {
        return response.data;
      }

      if (state === 'Failed') {
        throw new OpenEdXImportError(
          `Import failed: ${response.data.error || 'Unknown error'}`,
          taskId,
          state
        );
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }

    throw new OpenEdXImportError(
      `Import timed out after ${maxWait}ms`,
      taskId,
      'Pending'
    );
  }

  /**
   * Test connection to Open edX
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get course status
   */
  async getCourseStatus(courseKey: string): Promise<CourseStatus> {
    await this.authenticate();

    try {
      const response = await this.httpClient.get(
        `${this.config.cmsUrl}/api/courses/v1/courses/${courseKey}/`,
        {
          headers: {
            Authorization: `JWT ${this.accessToken}`,
          },
        }
      );

      return {
        exists: true,
        published: true,
        lastModified: response.data.modified,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { exists: false, published: false };
      }
      throw error;
    }
  }

  /**
   * Delete course from Open edX
   */
  async deleteCourse(courseKey: string): Promise<boolean> {
    await this.authenticate();

    // Note: Open edX doesn't have a direct delete API
    // This would require using management commands or marking as archived
    logger.warn({ courseKey }, 'Course deletion not implemented - mark as archived instead');
    return false;
  }
}
```

---

## 8. Error Handling

### 8.1 Custom Error Classes

```typescript
// src/types/errors.ts

/**
 * Base error for LMS integration
 */
export class LMSIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly lmsType: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LMSIntegrationError';
  }
}

/**
 * OLX validation error
 */
export class OLXValidationError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }>
  ) {
    super(message, 'OLX_VALIDATION_ERROR', 'openedx');
  }
}

/**
 * Open edX authentication error
 */
export class OpenEdXAuthError extends LMSIntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', 'openedx', cause);
  }
}

/**
 * Open edX import error
 */
export class OpenEdXImportError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly state: string,
    cause?: Error
  ) {
    super(message, 'IMPORT_ERROR', 'openedx', cause);
  }
}

/**
 * Network error
 */
export class NetworkError extends LMSIntegrationError {
  constructor(message: string, lmsType: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', lmsType, cause);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends LMSIntegrationError {
  constructor(message: string, lmsType: string, public readonly duration: number) {
    super(message, 'TIMEOUT_ERROR', lmsType);
  }
}
```

### 8.2 Error Codes

| Code | Description | HTTP | Recovery |
|------|-------------|------|----------|
| `OLX_VALIDATION_ERROR` | Invalid OLX structure | 400 | Fix input data |
| `AUTH_ERROR` | OAuth2 authentication failed | 401 | Check credentials |
| `IMPORT_ERROR` | Course import failed | 500 | Check error details |
| `NETWORK_ERROR` | Connection failed | 503 | Retry with backoff |
| `TIMEOUT_ERROR` | Import timed out | 504 | Increase timeout |
| `PERMISSION_ERROR` | Insufficient permissions | 403 | Check LMS user roles |

---

## 9. Validation

### 9.1 Pre-Packaging Validation

```typescript
// src/adapters/openedx/olx/validators.ts
import { OLXStructure } from './types';
import { logger } from '../../../logger';

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

export function validateOLXStructure(structure: OLXStructure): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Validate course.xml exists and is valid
  if (!structure.courseXml) {
    errors.push({
      path: 'course.xml',
      message: 'Missing course.xml',
      severity: 'error',
    });
  }

  // 2. Validate all file references
  const referencedFiles = extractFileReferences(structure.courseXml);
  for (const ref of referencedFiles) {
    if (!structure.files.has(ref)) {
      errors.push({
        path: ref,
        message: `Referenced file not found: ${ref}`,
        severity: 'error',
      });
    }
  }

  // 3. Check for large HTML content
  for (const [path, content] of structure.files) {
    if (path.endsWith('.html') && content.length > 1024 * 1024) {
      warnings.push({
        path,
        message: `Large HTML content (${Math.round(content.length / 1024)}KB) may cause performance issues`,
        severity: 'warning',
      });
    }
  }

  // 4. Validate UTF-8 encoding
  for (const [path, content] of structure.files) {
    if (!isValidUtf8(content)) {
      errors.push({
        path,
        message: 'Invalid UTF-8 encoding',
        severity: 'error',
      });
    }
  }

  // 5. Check for broken image references
  for (const [path, content] of structure.files) {
    if (path.endsWith('.html')) {
      const brokenImages = findBrokenImageRefs(content);
      for (const img of brokenImages) {
        warnings.push({
          path,
          message: `Potentially broken image reference: ${img}`,
          severity: 'warning',
        });
      }
    }
  }

  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length }, 'OLX validation found errors');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function extractFileReferences(courseXml: string): string[] {
  // Extract url_name references from XML
  const refs: string[] = [];
  const regex = /url_name="([^"]+)"/g;
  let match;

  while ((match = regex.exec(courseXml)) !== null) {
    refs.push(`chapter/${match[1]}.xml`);
  }

  return refs;
}

function isValidUtf8(str: string): boolean {
  try {
    decodeURIComponent(encodeURIComponent(str));
    return true;
  } catch {
    return false;
  }
}

function findBrokenImageRefs(html: string): string[] {
  const broken: string[] = [];
  const regex = /<img[^>]+src="([^"]+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    // Check for relative paths that won't work in Open edX
    if (src.startsWith('./') || src.startsWith('../') || (!src.startsWith('http') && !src.startsWith('/static/'))) {
      broken.push(src);
    }
  }

  return broken;
}
```

---

## 10. Public API

```typescript
// src/index.ts

// Adapters
export { LMSAdapter, PublishResult, CourseStatus } from './adapters/base';
export { OpenEdXAdapter } from './adapters/openedx/adapter';

// Types
export type {
  CourseInput,
  ChapterInput,
  SectionInput,
  UnitInput,
} from './types/course-input';
export {
  CourseInputSchema,
  ChapterInputSchema,
  SectionInputSchema,
  UnitInputSchema,
} from './types/course-input';

export type { BaseLMSConfig, OpenEdXConfig } from './types/config';
export { BaseLMSConfigSchema, OpenEdXConfigSchema } from './types/config';

// Errors
export {
  LMSIntegrationError,
  OLXValidationError,
  OpenEdXAuthError,
  OpenEdXImportError,
  NetworkError,
  TimeoutError,
} from './types/errors';

// Utilities
export { transliterate } from './utils/transliterate';
export { UrlNameRegistry } from './utils/url-name';

/**
 * Factory function to create appropriate LMS adapter
 */
export function createLMSAdapter(config: BaseLMSConfig): LMSAdapter {
  switch (config.type) {
    case 'openedx':
      return new OpenEdXAdapter(config as OpenEdXConfig);
    default:
      throw new Error(`Unsupported LMS type: ${config.type}`);
  }
}

/**
 * Convenience function for publishing a course
 */
export async function publishCourse(
  input: CourseInput,
  config: BaseLMSConfig
): Promise<PublishResult> {
  const adapter = createLMSAdapter(config);
  return adapter.publishCourse(input);
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Test File | Coverage |
|-----------|----------|
| `transliterate.test.ts` | All Cyrillic characters, Ukrainian, edge cases |
| `url-name.test.ts` | Generation, uniqueness, registry, length limits |
| `validators.test.ts` | All validation rules, error messages |
| `templates/*.test.ts` | XML generation for all element types |
| `olx-generator.test.ts` | Full generation pipeline |

### 11.2 Integration Tests

| Test File | Coverage |
|-----------|----------|
| `api-client.test.ts` | Mocked HTTP, auth flow, error handling |
| `full-pipeline.test.ts` | JSON → OLX → tar.gz (in-memory) |

### 11.3 E2E Tests

| Test File | Coverage |
|-----------|----------|
| `openedx-import.test.ts` | Real Open edX instance (CI optional) |

---

## 12. Non-Functional Requirements

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-001 | OLX generation time (50 units) | <5 seconds | Benchmark test |
| NFR-002 | Package upload time (5MB) | <10 seconds | Integration test |
| NFR-003 | End-to-end pipeline | <30 seconds | E2E test |
| NFR-004 | Retry on failure | 3 attempts with exponential backoff | Config + test |
| NFR-005 | Pre-packaging validation | Fail fast on errors | Unit tests |
| NFR-006 | Structured logging | All operations logged | Pino output |
| NFR-007 | Error persistence | Failed imports logged to DB | Error service |

---

## 13. Dependencies

### 13.1 Runtime Dependencies

```json
{
  "dependencies": {
    "archiver": "^7.0.0",
    "axios": "^1.6.0",
    "form-data": "^4.0.0",
    "zod": "^3.22.0"
  },
  "peerDependencies": {
    "@megacampus/course-gen-platform": "workspace:*",
    "@megacampus/shared-types": "workspace:*"
  }
}
```

### 13.2 Development Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@types/archiver": "^6.0.0",
    "@types/node": "^20.0.0",
    "nock": "^13.0.0"
  }
}
```

---

## 14. Risks and Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-001 | OLX schema changes in future Open edX releases | Low | High | Pin Tutor version; monitor release notes |
| R-002 | API rate limiting | Medium | Medium | Exponential backoff; request queuing |
| R-003 | Cyrillic encoding issues | High | Medium | UTF-8 everywhere; comprehensive transliteration tests |
| R-004 | Course ID collisions | Medium | Low | Registry-based uniqueness tracking |
| R-005 | Stage 5 schema changes | High | Medium | Adapter layer to isolate changes |
| R-006 | Large course packages (>100MB) | Low | High | Size validation; chunking in future |
| R-007 | Broken static asset references | Medium | Medium | Validation warnings; URL-only references |
| R-008 | LMS permissions mismatch | Medium | High | Clear error messages; permission docs |

---

## 15. Implementation Plan

### Phase 1: Foundation (2 days)

1. Initialize `packages/lms-integration/` with TypeScript config
2. Set up pino logger integration
3. Implement transliteration and url_name utilities
4. Write unit tests for utilities

### Phase 2: OLX Generator (2 days)

1. Implement XML templates for all element types
2. Implement `OLXGenerator` class with registry
3. Implement `packageOLX` function
4. Implement validators
5. Write unit tests with fixtures

### Phase 3: API Client (2 days)

1. Implement OAuth2 authentication with token caching
2. Implement import endpoint client
3. Implement polling with timeout and retries
4. Write integration tests with mocks

### Phase 4: Adapter & Integration (2 days)

1. Implement `LMSAdapter` abstract class
2. Implement `OpenEdXAdapter`
3. Implement factory function
4. Write full pipeline tests
5. Create README with examples

### Phase 5: E2E & Documentation (1 day)

1. Set up E2E test with real Open edX (optional CI)
2. Performance benchmarks
3. API documentation
4. Integration guide

**Total Estimated Effort:** 7-9 days

---

## 16. Acceptance Criteria

| ID | Criterion | Validation Method |
|----|-----------|-------------------|
| AC-001 | Unit test suite passes at 100% | `pnpm test` |
| AC-002 | Integration tests pass | `pnpm test:integration` |
| AC-003 | TypeScript strict mode compiles | `pnpm build` |
| AC-004 | README contains usage examples | Manual review |
| AC-005 | Cyrillic content generates valid OLX | Fixture tests |
| AC-006 | Generated OLX imports via Studio UI | Manual E2E test |
| AC-007 | Performance meets NFRs | Benchmark tests |
| AC-008 | Errors logged to database | Error service test |
| AC-009 | Adapter interface supports future LMS | Code review |

---

## 17. Future Enhancements

Post-production features for consideration:

1. **Moodle Adapter:** MBCZ format support
2. **Canvas Adapter:** QTI format support
3. **Video Components:** Integration with external video hosting
4. **Problem Components:** Capa schema support for quizzes
5. **Grading Policies:** Advanced grading configuration
6. **Course Updates:** Partial updates instead of full replace
7. **Multi-tenancy:** eox-tenant integration
8. **Webhooks:** Callback on import completion
9. **Bulk Import:** Queue multiple courses
10. **Analytics:** Track import success rates

---

## Appendix A: Sample Usage

```typescript
import {
  publishCourse,
  CourseInput,
  OpenEdXConfig,
} from '@megacampus/lms-integration';

const config: OpenEdXConfig = {
  instanceId: 'prod-openedx-1',
  name: 'Production Open edX',
  type: 'openedx',
  enabled: true,
  organization: 'MegaCampus',
  timeout: 300000,
  maxRetries: 3,
  lmsUrl: process.env.OPENEDX_LMS_URL!,
  cmsUrl: process.env.OPENEDX_CMS_URL!,
  clientId: process.env.OPENEDX_CLIENT_ID!,
  clientSecret: process.env.OPENEDX_CLIENT_SECRET!,
  pollInterval: 5000,
  autoCreateCourse: true,
};

const course: CourseInput = {
  courseId: 'AI101',
  title: 'Введение в искусственный интеллект',
  description: 'Базовый курс по основам ИИ',
  org: 'MegaCampus',
  run: '2025_Q1',
  startDate: '2025-01-15T00:00:00Z',
  language: 'ru',
  chapters: [
    {
      id: 'ch1',
      title: 'Основы ИИ',
      sections: [
        {
          id: 'sec1',
          title: 'Что такое ИИ?',
          units: [
            {
              id: 'unit1',
              title: 'Определение',
              content: '<h2>Введение</h2><p>Искусственный интеллект — это...</p>',
            },
          ],
        },
      ],
    },
  ],
};

async function main() {
  try {
    const result = await publishCourse(course, config);

    console.log('Course published successfully!');
    console.log(`LMS URL: ${result.lmsUrl}`);
    console.log(`Studio URL: ${result.studioUrl}`);
    console.log(`Duration: ${result.duration}ms`);
  } catch (error) {
    console.error('Publish failed:', error);
  }
}

main();
```

---

## Appendix B: Environment Variables

```bash
# .env.local

# Open edX Configuration
OPENEDX_LMS_URL=https://lms.megacampus.io
OPENEDX_CMS_URL=https://studio.megacampus.io
OPENEDX_CLIENT_ID=your_client_id
OPENEDX_CLIENT_SECRET=your_client_secret
OPENEDX_ORGANIZATION=MegaCampus

# Optional overrides
OPENEDX_TIMEOUT=300000
OPENEDX_POLL_INTERVAL=5000
OPENEDX_MAX_RETRIES=3
```

---

## Appendix C: Permissions Matrix

| Operation | Required Role | Notes |
|-----------|---------------|-------|
| Publish Course | `instructor` | Instructors can publish own courses |
| View Import Status | `instructor` | Can view status of own imports |
| Delete from LMS | `admin` | Org admins can delete any course |
| Configure LMS Connection | `superadmin` | Platform-level configuration |
| Bulk Import | `admin` | Batch operations require admin |

---

## Appendix D: Glossary

| Term | Definition |
|------|------------|
| **OLX** | Open Learning XML — Open edX's native course format |
| **CMS** | Content Management System (Studio) — authoring interface |
| **LMS** | Learning Management System — student-facing interface |
| **Tutor** | Official Docker-based deployment tool for Open edX |
| **Chapter** | Top-level course section (Week 1, Module 1) |
| **Sequential** | Subsection within a chapter (Lesson, Topic) |
| **Vertical** | Single learning unit (page with components) |
| **Component** | Individual content block (HTML, Video, Problem) |
| **url_name** | ASCII identifier used in URLs and file names |
| **Course Key** | Unique identifier: `course-v1:Org+Course+Run` |
| **Adapter** | Implementation of LMS-specific publishing logic |

---

**Document Status:** Ready for Review
**Next Steps:**
1. Review and approve specification
2. Wait for Stage 5 JSON schema stabilization
3. Begin implementation per Phase 1

---

*Generated for MegaCampusAI Project*
*Spec-Driven Development Framework*
