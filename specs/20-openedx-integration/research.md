# Research: Open edX LMS Integration

**Feature**: 20-openedx-integration
**Date**: 2025-12-11

## 1. Open edX Course Import API

### Decision: Use Course Import REST API

**Rationale**: The Open edX platform provides a REST API endpoint for programmatic course import, enabling automation without manual Studio uploads.

**API Endpoint**:
```
POST /api/courses/v0/import/{course_key}/
```

**Request**:
- Method: POST
- Content-Type: multipart/form-data
- Body: `course_data=@/path/to/course.tar.gz`
- Authentication: Bearer token (JWT)

**Response**:
```json
{"task_id": "91e249a1-8145-47bb-afe2-7aa88758c089"}
```

**Status Polling**:
```
GET /api/courses/v0/import/{course_key}/?task_id={task_id}
```

**Response**:
```json
{"state": "Succeeded"}  // or "Failed", "Pending", "Running"
```

**Alternatives Considered**:
- OLX REST API (`open-craft/openedx-olx-rest-api`): Export-only, doesn't support import
- Studio manual upload: Not automatable
- Management command (`python manage.py cms import`): Requires server access

**Sources**:
- [Create REST API for importing a course](https://github.com/openedx/edx-platform/pull/14899)
- [How To Use the REST API](https://docs.openedx.org/projects/edx-platform/en/latest/how-tos/use_the_api.html)
- [edx-rest-api-client](https://github.com/openedx/edx-rest-api-client)

---

## 2. OAuth2 Authentication

### Decision: Use Client Credentials Grant with JWT

**Rationale**: Open edX supports OAuth2 client credentials for service-to-service authentication, providing JWT tokens for API access.

**Token Acquisition**:
```python
POST /oauth2/access_token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&token_type=jwt
```

**Response**:
```json
{
  "access_token": "eyJ...",
  "token_type": "JWT",
  "expires_in": 3600,
  "scope": "..."
}
```

**Implementation Notes**:
- Store client_id and client_secret encrypted in lms_configurations table
- Implement token caching with expiry-based refresh
- Handle token refresh on 401 responses

**Sources**:
- [Getting Started With Open edX APIs](https://blog.lawrencemcdaniel.com/getting-started-with-open-edx-apis/)
- [Open edX API Documentation](https://courses.edx.org/api-docs/)

---

## 3. OLX (Open Learning XML) Format

### Decision: Build Custom OLX Generator

**Rationale**: No existing TypeScript/JavaScript library for OLX generation. The format is well-documented and straightforward to implement.

**OLX Structure**:
```
course/
├── course.xml                 # Root element with chapters
├── chapter/                   # Chapter (Section in Studio)
│   └── {chapter_id}.xml
├── sequential/                # Sequential (Subsection in Studio)
│   └── {sequential_id}.xml
├── vertical/                  # Vertical (Unit in Studio)
│   └── {vertical_id}.xml
└── html/                      # HTML components
    └── {html_id}.xml
    └── {html_id}.html         # Actual content
```

**course.xml Example**:
```xml
<course url_name="my_course" org="MegaCampus" course="AI101" display_name="Introduction to AI">
  <chapter url_name="chapter_1"/>
  <chapter url_name="chapter_2"/>
</course>
```

**Vertical (Unit) Example**:
```xml
<vertical display_name="Lesson 1.1">
  <html url_name="lesson_1_1_content"/>
</vertical>
```

**HTML Component Example**:
```xml
<!-- html/{id}.xml -->
<html filename="{id}" display_name="Lesson Content"/>

<!-- html/{id}.html -->
<h1>Lesson Title</h1>
<p>Content goes here...</p>
```

**Hierarchy Mapping**:
| MegaCampus | Open edX OLX | Studio Name |
|------------|--------------|-------------|
| Section | chapter | Section |
| Lesson | sequential + vertical | Subsection + Unit |
| Content | html | HTML Component |

**Sources**:
- [OLX Course Building Blocks](https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-structure-overview.html)
- [The OLX Courseware Structure](https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-xml-file.html)
- [The OLX Structure of a Sample Course](https://docs.openedx.org/en/latest/educators/olx/example-course/insider-structure.html)

---

## 4. Cyrillic Transliteration

### Decision: Use `cyrillic-to-translit-js`

**Rationale**: Ultra-lightweight, TypeScript support since v2.0.0, supports Russian preset, handles special rules for letter combinations.

**Installation**:
```bash
pnpm add cyrillic-to-translit-js
```

**Usage**:
```typescript
import CyrillicToTranslit from 'cyrillic-to-translit-js';

const translit = new CyrillicToTranslit({ preset: 'ru' });

// For display names (preserved Cyrillic)
const displayName = "Введение в машинное обучение";

// For OLX identifiers (ASCII only)
const urlName = translit.transform(displayName, '_')
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .substring(0, 50);
// Result: "vvedenie_v_mashinnoe_obuchenie"
```

**Alternatives Considered**:
- `transliteration`: More universal but less accurate for Russian
- `iuliia`: More standards-compliant but heavier
- Custom implementation: Unnecessary given library quality

**Sources**:
- [cyrillic-to-translit-js npm](https://www.npmjs.com/package/cyrillic-to-translit-js)
- [GitHub - cyrillic-to-translit-js](https://github.com/greybax/cyrillic-to-translit-js)

---

## 5. Archive Generation

### Decision: Use `archiver` Library

**Rationale**: High benchmark score (92.6), streaming interface, native tar.gz support, well-maintained.

**Installation**:
```bash
pnpm add archiver
pnpm add -D @types/archiver
```

**Usage**:
```typescript
import archiver from 'archiver';
import { createWriteStream } from 'fs';

async function createCourseTarGz(courseDir: string, outputPath: string): Promise<void> {
  const output = createWriteStream(outputPath);
  const archive = archiver('tar', { gzip: true });

  archive.pipe(output);
  archive.directory(courseDir, false);
  await archive.finalize();
}
```

**Memory Considerations**:
- For large courses, use streaming API
- Avoid loading entire course into memory
- Process files in chunks

**Alternatives Considered**:
- `tar-stream`: Lower level, more control but more code
- `modern-tar`: Newer but less adoption
- Node.js built-in: No tar.gz support

**Sources**:
- [archiver npm](https://www.npmjs.com/package/archiver)
- [Context7 - Archiver Library](https://context7.com/archiverjs/node-archiver)

---

## 6. Existing Codebase Integration Points

### Database Schema (courses table)
- `id`: UUID - course identifier
- `title`: string - course title (Cyrillic supported)
- `course_structure`: JSONB - contains section/lesson structure
- `status`: enum - course generation status
- `generation_status`: enum - stage completion status

### Database Schema (sections table)
- `id`: UUID
- `course_id`: FK to courses
- `title`: string
- `description`: string (nullable)
- `order_index`: number
- `metadata`: JSONB

### Database Schema (lessons table)
- `id`: UUID
- `section_id`: FK to sections
- `title`: string
- `content`: JSONB - contains lesson body (HTML)
- `content_text`: string - plain text version
- `order_index`: number
- `status`: enum

### Content Structure (from lesson-content.ts)
```typescript
interface LessonContentBody {
  intro: string;      // Markdown introduction
  sections: Array<{
    title: string;
    content: string;  // Markdown content
    examples?: Array<...>;
  }>;
  exercises?: Array<...>;
}
```

### Integration Approach
1. Query course with sections and lessons via Supabase
2. Convert Markdown to HTML (if not already HTML)
3. Generate OLX structure with transliterated identifiers
4. Package as tar.gz
5. Upload via Course Import API
6. Store import job status in new `lms_import_jobs` table

---

## 7. Security Considerations

### Credential Storage
- LMS client_id and client_secret stored in `lms_configurations` table
- Encrypted at rest using Supabase encryption
- RLS policies restrict access to organization admins

### API Communication
- All API calls use HTTPS
- JWT tokens cached with short TTL (< token expiry)
- Retry logic excludes 4xx errors (except 401 for token refresh)

### Input Validation
- Course content sanitized before OLX generation
- File paths validated to prevent directory traversal
- Archive size validated before upload

---

## 8. Error Handling Strategy

### Network Errors
- Retry up to 3 times with exponential backoff (1s, 2s, 4s)
- Circuit breaker pattern for repeated failures

### Import Failures
- Parse error message from Open edX response
- Map to user-friendly error messages
- Log detailed error for debugging

### Common Error Scenarios
| Error | Cause | Resolution |
|-------|-------|------------|
| "Invalid content format" | OLX schema violation | Validate before upload |
| "LMS connection timeout" | Network issue | Retry with backoff |
| "Insufficient permissions" | OAuth scope issue | Check credentials |
| "Course already exists" | Duplicate course key | Use update mode |

---

## 9. Performance Optimization

### OLX Generation
- Stream XML generation (don't buffer entire course)
- Parallel processing of independent components
- Cache transliteration results

### Upload
- Use streaming upload for large files
- Implement progress tracking via chunked upload if available

### Status Polling
- Initial poll after 2 seconds
- Exponential backoff: 2s, 4s, 8s, 16s (max)
- Maximum poll duration: 5 minutes

---

## 10. OLX Policy Files

### Decision: Generate Minimal Policy Files

**Rationale**: Open edX requires policy files for course configuration. We generate minimal policies suitable for self-paced courses without advanced grading.

**Required Files**:
```
course/
├── policies/
│   └── {run}/
│       ├── policy.json           # Course policies
│       └── grading_policy.json   # Grading configuration
```

**policy.json Template**:
```json
{
  "course/{run}": {
    "start": "2024-01-01T00:00:00+00:00",
    "end": null,
    "enrollment_start": null,
    "enrollment_end": null,
    "advertised_start": null,
    "course_image": "",
    "language": "ru",
    "self_paced": true,
    "certificates_display_behavior": "end",
    "tabs": [
      {"type": "courseware"},
      {"type": "course_info", "name": "Course Info"}
    ]
  }
}
```

**grading_policy.json Template**:
```json
{
  "GRADER": [],
  "GRADE_CUTOFFS": {
    "Pass": 0.5
  }
}
```

**Configuration Notes**:
- `start`: Course start date (default: immediate)
- `self_paced`: Set to `true` for non-cohort courses
- `language`: ISO language code (`ru`, `en`)
- `GRADE_CUTOFFS`: Simplified pass/fail threshold

**Future Enhancements**:
- Advanced grading with weighted categories
- Certificate configuration
- Enrollment restrictions

**Sources**:
- [Course Policies](https://docs.openedx.org/en/latest/educators/olx/running-course/course-policies.html)
- [Grading Policy](https://docs.openedx.org/en/latest/educators/olx/running-course/grading-policy.html)

---

## 11. Static Assets Handling

### Decision: Use Absolute URLs Only (Phase 1)

**Rationale**: Open edX supports static file uploads, but for Phase 1 we avoid complexity by using absolute URLs for all media references.

**Approach**:
1. Images in lesson content must use absolute URLs
2. No local file upload in initial implementation
3. Validator warns on relative paths or broken references

**Validation Rules**:
```typescript
// Pre-packaging validation
const VALIDATION_RULES = {
  // Warn on relative image paths
  relativeImagePath: /!\[.*?\]\((?!https?:\/\/)/,

  // Warn on broken external URLs
  validateExternalUrls: true,

  // Max image recommendations
  maxImageSizeKb: 500,
  recommendedFormats: ['jpg', 'png', 'webp'],
};
```

**HTML Content Requirements**:
```html
<!-- VALID: Absolute URL -->
<img src="https://storage.example.com/images/diagram.png" alt="Diagram">

<!-- INVALID: Relative path (will trigger warning) -->
<img src="/static/images/diagram.png" alt="Diagram">
<img src="diagram.png" alt="Diagram">
```

**Future Enhancement (Phase 2+)**:
- Upload static files to Open edX `/static/` directory
- Support for video embedding
- Course banner/image upload
- Asset manifest generation

**OLX Static Files Structure (Future)**:
```
course/
├── static/
│   ├── images/
│   │   └── diagram.png
│   └── documents/
│       └── syllabus.pdf
└── assets.xml         # Asset manifest
```

**Sources**:
- [OLX Static Files](https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-assets.html)

---

## 12. URL Name Registry Pattern

### Decision: Implement Centralized url_name Registry

**Rationale**: OLX requires globally unique `url_name` attributes within a course. A registry ensures uniqueness and provides deterministic identifier generation.

**Implementation Pattern**:
```typescript
class UrlNameRegistry {
  private usedNames = new Set<string>();

  generate(displayName: string, prefix?: string): string {
    // 1. Transliterate Cyrillic to ASCII
    // 2. Normalize (lowercase, replace special chars)
    // 3. Truncate to 50 chars
    // 4. Ensure uniqueness via suffix

    let baseName = this.normalize(displayName);
    if (prefix) baseName = `${prefix}_${baseName}`;

    let candidate = baseName;
    let counter = 1;

    while (this.usedNames.has(candidate)) {
      candidate = `${baseName}_${counter}`;
      counter++;
    }

    this.usedNames.add(candidate);
    return candidate;
  }

  private normalize(name: string): string {
    return transliterate(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50);
  }
}
```

**Usage**:
```typescript
const registry = new UrlNameRegistry();

// Chapter names
registry.generate('Введение', 'chapter');  // → 'chapter_vvedenie'
registry.generate('Введение', 'chapter');  // → 'chapter_vvedenie_1' (duplicate)

// Sequential/Lesson names
registry.generate('Урок 1.1', 'seq');       // → 'seq_urok_1_1'
```

**Uniqueness Guarantee**:
- Registry is created per course generation
- All `url_name` attributes must go through registry
- Collision resolution via numeric suffix

**Sources**:
- [OLX Identifiers](https://docs.openedx.org/en/latest/educators/olx/organizing-course/url-names.html)
