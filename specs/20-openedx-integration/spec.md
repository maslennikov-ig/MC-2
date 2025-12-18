# Feature Specification: Open edX LMS Integration

**Feature Branch**: `feature/openedx-integration`
**Created**: 2025-12-11
**Status**: Draft
**Input**: Technical specification for MegaCampusAI ↔ Open edX integration module

## Clarifications

### Session 2025-12-13

- Q: When a course contains unsupported content types (e.g., video, quizzes), how should the system behave? → A: Fail the entire import with a clear message listing all unsupported elements
- Q: Which OLX format version should the system target for Open edX course generation? → A: Latest stable OLX version supported by Open edX
- Q: What state transitions should the Import Job status support? → A: Simple 4-state model: Pending → Processing → Completed / Failed
- Q: How frequently should the system poll Open edX for import completion status? → A: Every 2-5 seconds (balanced responsiveness and API load)
- Q: How should the system handle OAuth2 token expiration during long-running import operations? → A: Refresh token proactively before expiry
- Q: What is the maximum course package size that should be validated before upload? → A: 100 MB (matches Open edX default limit)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish AI-Generated Course to LMS (Priority: P1)

As an instructor, I want to publish my AI-generated course to Open edX LMS so that students can access and complete the course content through the learning management system.

**Why this priority**: This is the core value proposition of the integration. Without course publishing, there is no integration. This enables the complete workflow from AI generation to student delivery.

**Independent Test**: Can be fully tested by generating a sample course in MegaCampusAI, clicking "Publish to LMS", and verifying the course appears and is navigable in Open edX. Delivers immediate value by enabling course delivery to students.

**Acceptance Scenarios**:

1. **Given** a completed AI-generated course with chapters, sections, and units, **When** the instructor initiates course publishing to Open edX, **Then** the system converts the course to LMS format, uploads it, and returns a success confirmation with direct links to view the course.

2. **Given** a course with Cyrillic (Russian) content, **When** publishing to Open edX, **Then** all text content displays correctly in the LMS while internal identifiers use ASCII characters only.

3. **Given** a course with 50+ units, **When** publishing completes, **Then** the entire process takes less than 30 seconds from initiation to confirmation.

4. **Given** a course that already exists in Open edX with the same identifier, **When** the instructor publishes an updated version, **Then** the existing course is replaced with the new content.

---

### User Story 2 - Monitor Course Import Status (Priority: P2)

As an instructor, I want to see the real-time status of my course import so that I know when my course is ready for students or if there are any issues I need to address.

**Why this priority**: Essential for user experience and troubleshooting, but the course can technically be published without real-time status updates (polling could happen in background).

**Independent Test**: Can be tested by initiating a publish operation and observing status updates from "Processing" through "Completed" or "Failed" states. Delivers value by providing transparency into the publishing process.

**Acceptance Scenarios**:

1. **Given** a course import is in progress, **When** the instructor views the import status, **Then** they see a clear status indicator showing "Pending", "Processing", "Completed", or "Failed".

2. **Given** a course import succeeds, **When** the process completes, **Then** the instructor sees a success message with clickable links to view the course in both the authoring interface and student interface.

3. **Given** a course import fails, **When** the failure is detected, **Then** the instructor sees an actionable error message explaining what went wrong (e.g., "Invalid content format", "LMS connection timeout", "Insufficient permissions").

---

### User Story 3 - Test LMS Connection (Priority: P3)

As a system administrator, I want to test the connection to the Open edX instance so that I can verify the integration is properly configured before instructors attempt to publish courses.

**Why this priority**: Important for initial setup and troubleshooting, but most users will not need this functionality after initial configuration.

**Independent Test**: Can be tested by clicking "Test Connection" in admin settings and verifying it returns success or a specific error. Delivers value by enabling quick diagnosis of configuration issues.

**Acceptance Scenarios**:

1. **Given** valid LMS credentials are configured, **When** the administrator tests the connection, **Then** the system displays "Connection successful" within 10 seconds.

2. **Given** invalid credentials are configured, **When** the administrator tests the connection, **Then** the system displays a specific error (e.g., "Authentication failed - check client ID and secret").

3. **Given** the LMS is unreachable, **When** the administrator tests the connection, **Then** the system displays "Cannot reach LMS - check URL and network connectivity".

---

### User Story 4 - View Import History (Priority: P4)

As an instructor, I want to view the history of my course publications so that I can track when courses were last updated and review any past issues.

**Why this priority**: Nice-to-have for audit and troubleshooting purposes, but not essential for core publishing functionality.

**Independent Test**: Can be tested by viewing a list of past imports showing date, course name, status, and duration. Delivers value by providing an audit trail.

**Acceptance Scenarios**:

1. **Given** an instructor has published multiple courses, **When** they view their import history, **Then** they see a list showing course name, publish date, status, and duration for each import.

2. **Given** an import failed in the past, **When** viewing the history entry, **Then** the instructor can see the error details from that failed attempt.

---

### Edge Cases

- What happens when the LMS is temporarily unavailable during import? System should retry automatically with increasing delays, up to 3 attempts total.
- What happens when a course contains unsupported content types (e.g., video, quizzes)? System MUST fail the entire import with a clear error message listing all unsupported elements, preventing partial course publication.
- What happens when network connection is lost mid-upload? System should fail gracefully and allow retry without corrupting partial data.
- What happens when course content exceeds LMS size limits? System MUST validate course package size before upload (maximum 100 MB) and provide clear error message with guidance on content reduction if limit is exceeded.
- What happens when two instructors try to publish the same course simultaneously? System should handle conflicts gracefully, potentially with a locking mechanism.
- What happens when course content contains duplicate internal identifiers? System should detect and resolve duplicates during conversion (e.g., by appending suffixes).
- What happens when the authenticated user lacks permissions for the target course in LMS? System should surface a clear "Insufficient permissions" error with guidance on required access levels.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST convert AI-generated course content into OLX format using the latest stable version supported by the target Open edX instance.
- **FR-002**: System MUST support course structures with chapters (sections), subsections, and units containing HTML content with embedded images referenced via URLs.
- **FR-003**: System MUST authenticate with Open edX using OAuth2 client credentials and refresh tokens proactively before expiry during long-running operations.
- **FR-004**: System MUST upload course packages to Open edX via the Course Import API.
- **FR-005**: System MUST poll for import completion status every 2-5 seconds until the operation succeeds or fails. Import Job status transitions: Pending → Processing → Completed (or Failed).
- **FR-006**: System MUST transliterate Cyrillic characters to ASCII for internal identifiers while preserving original text for display purposes.
- **FR-006a**: System MUST ensure all internal identifiers are unique within their scope (no duplicates for chapters, sections, or units).
- **FR-007**: System MUST validate course content before attempting upload to fail fast on structural errors, unsupported content types, and package size limits (maximum 100 MB).
- **FR-008**: System MUST retry failed network operations up to 3 times with exponential backoff.
- **FR-009**: System MUST log all import operations including successes, failures, and performance metrics.
- **FR-010**: System MUST provide clear, actionable error messages for all failure scenarios.
- **FR-011**: System MUST support configuration of multiple LMS instances (for future multi-region deployment).
- **FR-012**: System MUST enforce role-based access: instructors can publish their own courses, admins can configure LMS connections.

### Key Entities

- **Course**: The AI-generated course content including metadata (title, description, language, dates), structure (chapters, sections, units), and content (HTML text).
- **LMS Configuration**: Connection settings for an Open edX instance including URLs, credentials, organization identifier, and operational parameters (timeouts, retry settings, polling interval: 2-5 seconds).
- **Import Job**: A record of a course publishing operation including status (Pending → Processing → Completed/Failed), timestamps, duration, error details if failed, and links to the published course.
- **Chapter**: Top-level course division (equivalent to "Week" or "Module" in Open edX).
- **Section**: Subdivision within a chapter (equivalent to "Subsection" or "Lesson" in Open edX).
- **Unit**: Individual learning unit containing HTML content (equivalent to "Vertical" with "HTML Component" in Open edX).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Instructors can publish a course with 50 units from MegaCampusAI to Open edX in under 30 seconds end-to-end.
- **SC-002**: 99% of valid courses publish successfully on the first attempt (excluding LMS infrastructure issues).
- **SC-003**: All Cyrillic content displays correctly in Open edX without character encoding issues.
- **SC-004**: Failed imports provide error messages that allow users to resolve issues without contacting support in 80% of cases.
- **SC-005**: Connection test provides diagnosis results within 10 seconds.
- **SC-006**: System supports concurrent publishing operations without data corruption or conflicts.
- **SC-007**: Integration supports future expansion to additional LMS platforms without major architectural changes (adapter pattern).

## Assumptions

- Open edX instance is deployed via Tutor and has the Course Import API enabled (default configuration).
- LMS administrator has created OAuth2 application credentials with appropriate permissions.
- MegaCampusAI Stage 5 output schema is stable and provides all necessary course data.
- Network connectivity between MegaCampusAI and Open edX is reliable with reasonable latency.
- Open edX instance supports the latest stable OLX format version (system will generate courses using this version).
- Course content is primarily HTML text; video and quiz components are out of scope for initial release.

## Out of Scope (Future Phases)

- Course deletion from LMS (admin-level cleanup operations)
- Video component integration with external hosting services
- Quiz/problem component support (Capa schema)
- Discussion forum integration
- Advanced grading policies and rubrics
- LTI tool integrations
- Moodle adapter
- Canvas adapter
- Multi-tenancy support (eox-tenant)
- Course analytics and completion tracking
- Bulk course import operations
