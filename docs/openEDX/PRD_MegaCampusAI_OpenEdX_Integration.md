# Product Requirements Document (PRD)

## MegaCampusAI ↔ Open edX Integration Proof-of-Concept

---

**Document Version:** 1.0.0  
**Status:** Draft  
**Created:** 2025-11-30  
**Target Audience:** Implementation Agent (Claude Code)  
**Framework:** Spec-Driven Development  

---

## 1. Executive Summary

### 1.1 Purpose

This PRD defines the technical requirements for a **Proof-of-Concept (PoC)** integration between the **MegaCampusAI course generation pipeline** (Stage 5) and **Open edX LMS** (via Tutor deployment). The integration enables automated course publishing by converting AI-generated content into Open edX-compatible OLX (Open Learning XML) format and importing it via REST API.

### 1.2 Success Criteria

- [ ] A valid OLX course package can be programmatically generated from MegaCampusAI output
- [ ] The package can be successfully imported into a running Open edX instance via API
- [ ] The imported course is visible and navigable in Open edX Studio and LMS
- [ ] End-to-end flow completes in <30 seconds for a 5-section course

---

## 2. Context & Background

### 2.1 Current State

- **MegaCampusAI:** Stage 5 Generation Pipeline is production-ready and outputs structured JSON course data
- **Open edX:** Local Tutor instance is deployed and accessible at `http://local.openedx.io`
- **Gap:** No automated bridge exists between the AI output and the LMS

### 2.2 Target Architecture

```
┌─────────────────────┐
│  MegaCampusAI       │
│  (Stage 5 Output)   │
│  JSON Course Data   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  OLX Adapter        │◄─── NEW COMPONENT (This PoC)
│  (Converter Service)│
└──────────┬──────────┘
           │
           ▼ HTTP POST (tar.gz)
┌─────────────────────┐
│  Open edX LMS       │
│  Import API         │
│  /api/courses/v0/   │
└─────────────────────┘
```

---

## 3. Canonical Documentation Sources

### 3.1 Required Reading

Before implementation, the agent **MUST** use the **Context7 MCP Server** to ingest the following documentation:

1. **Open edX OLX Specification:**
   - URL: `https://docs.openedx.org/en/latest/educators/olx/`
   - Focus Areas: Directory structure, course.xml format, component types

2. **Tutor Documentation:**
   - URL: `https://docs.tutor.edly.io/`
   - Focus Areas: Local deployment, API access, plugin development

3. **Open edX REST API:**
   - URL: `https://docs.openedx.org/en/latest/`
   - Focus Areas: Course import endpoints, authentication methods

4. **MegaCampusAI Repository:**
   - URL: `https://github.com/maslennikov-ig/MegaCampusAI`
   - Focus Areas: Stage 5 output schema, architectural decision records (ADRs)

### 3.2 Context7 MCP Server Usage

```bash
# Add documentation sources to Context7
<use_mcp_tool>
<server_name>context7</server_name>
<tool_name>add-context</tool_name>
<arguments>
{
  "url": "https://docs.openedx.org/en/latest/educators/olx/",
  "type": "documentation"
}
</arguments>
</use_mcp_tool>
```

Repeat for all 4 URLs above before beginning implementation.

---

## 4. Technical Requirements

### 4.1 Integration Pattern

**Pattern:** Push Model via REST API  
**Rationale:** Decouples services, supports future cloud deployment, aligns with SaaS architecture.

### 4.2 Authentication Strategy

**Method:** Static API Token (Superuser credentials for PoC)  
**Rationale:** Simplest approach for initial integration. OAuth2 deferred to production phase.

**Implementation:**

```python
# Use Open edX Management Command to generate token
tutor local run lms ./manage.py lms drf_create_token <superuser_username>
```

### 4.3 Content Scope (MVP)

The PoC must support the following OLX structure:

**Supported Elements:**

- ✅ Course Shell (metadata, grading policy)
- ✅ Chapters (course sections)
- ✅ Sequentials (subsections)
- ✅ Verticals (units)
- ✅ HTML Components (text content)

**Deferred to Future Phases:**

- ❌ Video components
- ❌ Problem/Quiz components
- ❌ Discussions
- ❌ Advanced grading

**Sample Course Structure:**

```
course/
├── course.xml                    # Root manifest
├── course/2025_Q1.xml           # Course run definition
├── chapter/
│   ├── intro.xml                # Chapter 1
│   └── main_content.xml         # Chapter 2
├── sequential/
│   ├── week1.xml                # Subsection
│   └── week2.xml
├── vertical/
│   ├── unit1.xml                # Learning unit
│   └── unit2.xml
└── html/
    ├── welcome.xml              # HTML component
    └── lesson1.xml
```

---

## 5. Functional Requirements

### 5.1 FR-001: OLX Package Generator

**Description:** Create a service that converts MegaCampusAI JSON to OLX tar.gz.

**Input Schema (MegaCampusAI Stage 5 Output):**

```json
{
  "course_id": "AI101",
  "title": "Introduction to AI",
  "org": "MegaCampus",
  "chapters": [
    {
      "id": "ch1",
      "title": "Foundations",
      "sections": [
        {
          "id": "sec1",
          "title": "What is AI?",
          "units": [
            {
              "id": "unit1",
              "title": "Definition",
              "content": "<p>Artificial Intelligence is...</p>"
            }
          ]
        }
      ]
    }
  ]
}
```

**Output:** Valid `course.tar.gz` file containing:

- Correct directory structure per OLX spec
- Valid XML files with proper namespace declarations
- UTF-8 encoding for all text files

**Acceptance Criteria:**

- [ ] Generated package passes `tar -tzf course.tar.gz` validation
- [ ] XML files validate against Open edX schema
- [ ] Package can be manually imported via Studio UI

### 5.2 FR-002: Course Import API Client

**Description:** Implement HTTP client to upload OLX package to Open edX.

**API Endpoint:**

```
POST https://local.openedx.io/api/courses/v0/import/{org}/{course_id}/{run_id}
Headers:
  Authorization: Bearer <token>
  Content-Type: multipart/form-data
Body:
  course_data: <course.tar.gz binary>
```

**Error Handling:**

- HTTP 400: Log validation errors and return structured error response
- HTTP 401: Refresh token and retry once
- HTTP 500: Log full stack trace and fail gracefully

**Acceptance Criteria:**

- [ ] Successful import returns HTTP 200 with task ID
- [ ] Client polls import status until completion
- [ ] Failed imports surface actionable error messages

### 5.3 FR-003: End-to-End Integration Test

**Description:** Automated test that validates the full pipeline.

**Test Flow:**

1. Load sample JSON from MegaCampusAI fixtures
2. Generate OLX package
3. Upload to Open edX
4. Verify course appears in Studio course list
5. Verify course is accessible in LMS

**Acceptance Criteria:**

- [ ] Test completes in <30 seconds
- [ ] Test can run in CI/CD pipeline
- [ ] Test cleanup removes generated courses

---

## 6. Implementation Guide

### 6.1 Phase 1: Environment Setup (Day 1)

#### Step 1.1: Deploy Open edX with Tutor

```bash
# Install Tutor (if not already installed)
pip install "tutor[full]"

# Initialize configuration
tutor config save --interactive
# Set LMS_HOST to: local.openedx.io
# Set CMS_HOST to: studio.local.openedx.io

# Launch Open edX
tutor local launch

# Create superuser for API access
tutor local do createuser --staff --superuser admin admin@megacampus.ai
```

#### Step 1.2: Configure Hosts File

**Windows:** `C:\Windows\System32\drivers\etc\hosts`  
**Linux/Mac:** `/etc/hosts`

Add:

```
127.0.0.1 local.openedx.io
127.0.0.1 studio.local.openedx.io
```

#### Step 1.3: Generate API Token

```bash
tutor local run lms ./manage.py lms drf_create_token admin
# Save token to environment variable: OPENEDX_API_TOKEN
```

### 6.2 Phase 2: OLX Deep Dive (Day 1-2)

#### Step 2.1: Study OLX Structure

**Action:** Use Context7 to ingest <https://docs.openedx.org/en/latest/educators/olx/directory-structure.html>

**Key Concepts to Understand:**

1. **URL Names:** Each component has a unique `url_name` attribute
2. **Referencing:** Parent components reference children via `url_name`
3. **Namespaces:** XML files use `xblock-v1` namespace
4. **Policies:** Grading and settings stored in `policies/` directory

#### Step 2.2: Manual OLX Testing

**Objective:** Create a minimal course by hand to understand the format.

**Procedure:**

1. Download example from: <https://docs.openedx.org/en/latest/educators/olx/studio-example/manual-testing-structure.html>
2. Unzip and inspect structure
3. Modify one HTML component
4. Re-zip: `tar -czf test_course.tar.gz course/`
5. Import via Studio: Settings → Import
6. Verify changes appear in Studio

**Expected Outcome:** Confidence in OLX structure before automation.

### 6.3 Phase 3: Build the Adapter (Day 3-5)

#### Step 3.1: Create Service Scaffold

**Decision Point:** Consult MegaCampusAI repository structure to determine placement:

- Option A: `services/course-publisher/`
- Option B: `libs/olx-adapter/`
- Option C: `packages/openedx-integration/`

**Technologies:**

- Language: TypeScript (align with MegaCampusAI stack)
- Framework: Minimal (no Express needed for PoC)
- Libraries: `archiver` (for tar.gz), `axios` (for HTTP), `zod` (for validation)

#### Step 3.2: Implement OLX Generator

**File:** `src/generators/olx-generator.ts`

**Responsibilities:**

1. Parse MegaCampusAI JSON schema
2. Generate directory structure in memory (use `tmp` module)
3. Create XML files for each component type
4. Apply UUID-based `url_name` generation
5. Package into tar.gz

**Critical Implementation Detail:**

```typescript
// Correct XML structure for HTML component
const htmlComponent = `
<html display_name="${title}" url_name="${urlName}">
  <![CDATA[${htmlContent}]]>
</html>
`;
```

#### Step 3.3: Implement Import Client

**File:** `src/clients/openedx-import-client.ts`

**Methods:**

- `uploadCourse(tarBuffer: Buffer, courseId: string): Promise<ImportResult>`
- `pollImportStatus(taskId: string): Promise<ImportStatus>`

**Configuration:**

```typescript
interface OpenEdXConfig {
  baseUrl: string;          // http://local.openedx.io
  apiToken: string;         // From env var
  organization: string;     // "MegaCampus"
  timeout: number;          // 30000ms
}
```

### 6.4 Phase 4: Integration Testing (Day 6-7)

#### Step 4.1: Create Test Fixtures

**File:** `tests/fixtures/sample-course.json`

Minimal valid course with 2 chapters, 3 sections, 5 HTML units.

#### Step 4.2: Write E2E Test

**File:** `tests/e2e/openedx-integration.test.ts`

**Test Cases:**

1. ✅ Generate OLX from fixture
2. ✅ Upload to Open edX
3. ✅ Verify course exists via API
4. ✅ Cleanup (delete course)

**Assertion Example:**

```typescript
const courseList = await openedx.getCourses();
expect(courseList).toContainEqual(
  expect.objectContaining({
    id: 'course-v1:MegaCampus+AI101+2025_Q1',
    display_name: 'Introduction to AI'
  })
);
```

---

## 7. Non-Functional Requirements

### 7.1 Performance

- **NFR-001:** OLX generation for 50-unit course: <5 seconds
- **NFR-002:** API upload for 5MB package: <10 seconds
- **NFR-003:** End-to-end pipeline: <30 seconds

### 7.2 Reliability

- **NFR-004:** Retry failed uploads with exponential backoff (max 3 attempts)
- **NFR-005:** Validate all XML before packaging (fail fast)

### 7.3 Observability

- **NFR-006:** Log all API requests/responses at DEBUG level
- **NFR-007:** Emit structured events for monitoring:
  - `olx.generation.started`
  - `olx.generation.completed`
  - `openedx.import.started`
  - `openedx.import.completed`

---

## 8. Dependencies & Constraints

### 8.1 Technical Dependencies

- Node.js ≥18.0 (MegaCampusAI standard)
- Open edX Redwood release (Tutor 20.x)
- Network access to `local.openedx.io`

### 8.2 Assumptions

- MegaCampusAI Stage 5 JSON schema is stable
- Open edX instance has Import API enabled (default in Tutor)
- Superuser account has course creation permissions

### 8.3 Out of Scope (Deferred)

- Video transcoding and hosting
- Advanced grading policies
- Multi-region deployment
- Production authentication (OAuth2)
- Multi-tenancy support

---

## 9. Acceptance Criteria (Definition of Done)

The PoC is complete when:

- [ ] **AC-001:** Automated test suite passes at 100%
- [ ] **AC-002:** Manual demo shows course generation → import → viewing in LMS
- [ ] **AC-003:** Code passes TypeScript strict mode compilation
- [ ] **AC-004:** README contains setup instructions for developers
- [ ] **AC-005:** Architecture Decision Record (ADR) documents integration approach
- [ ] **AC-006:** Performance benchmarks meet NFRs (logged in test output)

---

## 10. Risk Register

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-001 | OLX schema changes in Open edX | Low | High | Pin Tutor version; subscribe to Open edX release notes |
| R-002 | Import API rate limits | Medium | Medium | Implement request queuing |
| R-003 | Encoding issues (Cyrillic text) | High | Medium | Force UTF-8 everywhere; add encoding tests |
| R-004 | Course ID collisions | Medium | Low | Use UUID-based course IDs |

---

## 11. Glossary

- **OLX (Open Learning XML):** Open edX's native course format
- **Tutor:** Official Docker-based deployment tool for Open edX
- **Studio:** Open edX course authoring interface
- **LMS:** Learning Management System (student-facing interface)
- **Chapter:** Top-level course section (Week 1, Module 1, etc.)
- **Sequential:** Subsection within a chapter (Lesson, Topic)
- **Vertical:** Single learning unit (page containing components)
- **Component:** Individual content block (HTML, Video, Problem)

---

## 12. References

### 12.1 Documentation Links

1. **Open edX OLX Guide:** <https://docs.openedx.org/en/latest/educators/olx/>
2. **OLX Directory Structure:** <https://docs.openedx.org/en/latest/educators/olx/directory-structure.html>
3. **Manual Testing Guide:** <https://docs.openedx.org/en/latest/educators/olx/studio-example/manual-testing-structure.html>
4. **Tutor Documentation:** <https://docs.tutor.edly.io/>
5. **Tutor Quickstart:** <https://docs.tutor.edly.io/quickstart.html>
6. **Open edX GitHub:** <https://github.com/openedx/>
7. **Tutor GitHub:** <https://github.com/overhangio/tutor>
8. **MegaCampusAI Repository:** <https://github.com/maslennikov-ig/MegaCampusAI>

### 12.2 Related ADRs

- ADR-XXX: Choice of Open edX as primary LMS (included)
- ADR-XXX: Push vs. Pull integration pattern (to be created)

---

## 13. Appendix: Quick Start Commands

### For Implementation Agent (Claude Code)

```bash
# 1. Ingest documentation via Context7 MCP
# (Use Context7 tool to add all URLs from Section 3.1)

# 2. Set up Open edX
tutor local launch
tutor local do createuser --staff --superuser admin admin@megacampus.ai
tutor local run lms ./manage.py lms drf_create_token admin

# 3. Create adapter service
# (Location: TBD by development partner)
mkdir -p services/olx-adapter
cd services/olx-adapter
npm init -y
npm install typescript @types/node archiver axios zod tmp

# 4. Implement core modules
# - src/generators/olx-generator.ts
# - src/clients/openedx-import-client.ts
# - src/index.ts

# 5. Write tests
# - tests/unit/olx-generator.test.ts
# - tests/e2e/integration.test.ts

# 6. Run integration test
npm test

# 7. Manual verification
# Visit http://studio.local.openedx.io and verify course exists
```

---

**Document Status:** Ready for Implementation  
**Next Action:** Agent should acknowledge receipt and begin Phase 1  
**Estimated Effort:** 5-7 developer days  
**Priority:** P0 (Blocking March 2026 launch)

---

*Generated for MegaCampusAI Project | Spec-Driven Development Framework*  
*For questions, contact: Dahgoth via GitHub*
