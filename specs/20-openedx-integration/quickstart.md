# Quickstart: Open edX LMS Integration

**Feature**: 20-openedx-integration
**Date**: 2025-12-11

## Prerequisites

### 1. Open edX Instance

You need access to an Open edX instance with:
- Studio URL (e.g., `https://studio.example.com`)
- LMS URL (e.g., `https://lms.example.com`)
- Admin access to create OAuth2 applications

### 2. OAuth2 Credentials

Create an OAuth2 application in Open edX:

1. Go to `https://lms.example.com/admin/oauth2_provider/application/`
2. Click "Add Application"
3. Fill in:
   - **User**: Select a staff user
   - **Client type**: Confidential
   - **Authorization grant type**: Client credentials
   - **Name**: "MegaCampusAI Integration"
4. Save and note the `Client ID` and `Client Secret`

### 3. Course Import API Access

Ensure the Course Import API is enabled (default in Tutor deployments).

---

## Development Setup

### 1. Install Dependencies

```bash
cd packages/course-gen-platform
pnpm add archiver cyrillic-to-translit-js
pnpm add -D @types/archiver
```

### 2. Apply Database Migration

```bash
# Via Supabase CLI
supabase migration new create_lms_integration_tables
# Copy migration SQL from data-model.md

supabase db push
```

### 3. Generate Types

```bash
pnpm run generate:types
```

---

## Quick Test

### 1. Create LMS Configuration (via tRPC)

```typescript
const config = await trpc.lms.config.create.mutate({
  organization_id: 'your-org-id',
  name: 'Local Tutor',
  lms_url: 'http://local.edly.io',
  studio_url: 'http://studio.local.edly.io',
  client_id: 'your-client-id',
  client_secret: 'your-client-secret',
  default_org: 'MegaCampus',
});
```

### 2. Test Connection

```typescript
const result = await trpc.lms.config.testConnection.mutate({
  id: config.id,
});

console.log(result);
// { success: true, latency_ms: 234, message: 'Connection successful' }
```

### 3. Publish a Course

```typescript
// Ensure course is in 'completed' state
const job = await trpc.lms.publish.start.mutate({
  course_id: 'your-course-id',
  lms_configuration_id: config.id,
});

// Poll for status
const status = await trpc.lms.publish.status.query({
  job_id: job.job_id,
});

console.log(status);
// { status: 'succeeded', course_url: 'http://local.edly.io/courses/...', ... }
```

---

## Local Open edX with Tutor

For local development, use [Tutor](https://docs.tutor.edly.io/) to run Open edX:

```bash
# Install Tutor
pip install tutor

# Initialize and start
tutor local launch

# Access URLs
# LMS: http://local.edly.io
# Studio: http://studio.local.edly.io
# Admin: http://local.edly.io/admin (username: admin, password: in tutor config)
```

---

## File Structure Reference

```
packages/course-gen-platform/src/integrations/lms/
├── index.ts                                    # Public exports (createLMSAdapter, publishCourse)
├── course-mapper.ts                            # Database course → CourseInput mapper
├── error-mapper.ts                             # Error transformation utilities
├── logger.ts                                   # LMS operation logging
└── openedx/
    ├── index.ts                                # OpenEdX module exports
    ├── adapter.ts                              # OpenEdXAdapter implementation
    ├── utils/
    │   ├── transliterate.ts                    # Cyrillic → ASCII utilities
    │   └── xml-escape.ts                       # XML character escaping
    ├── olx/
    │   ├── index.ts                            # OLX module exports
    │   ├── generator.ts                        # Course → OLX conversion (OLXGenerator)
    │   ├── packager.ts                         # OLX → tar.gz packaging
    │   ├── validators.ts                       # Input/structure validation
    │   ├── url-name-registry.ts                # Unique identifier tracking
    │   ├── types.ts                            # OLX structure types
    │   └── templates/
    │       ├── index.ts                        # Template exports
    │       ├── course.ts                       # Course XML template
    │       ├── chapter.ts                      # Chapter XML template
    │       ├── sequential.ts                   # Sequential XML template
    │       ├── vertical.ts                     # Vertical XML template
    │       ├── html.ts                         # HTML component templates
    │       └── policies.ts                     # Policy JSON templates
    └── api/
        ├── index.ts                            # API module exports
        ├── client.ts                           # OpenEdXClient HTTP client
        ├── auth.ts                             # OAuth2 authentication
        ├── poller.ts                           # Import status polling
        └── types.ts                            # API request/response types

packages/course-gen-platform/src/server/routers/lms/
├── config.router.ts                            # Configuration routes
├── publish.router.ts                           # Publishing routes
├── course.router.ts                            # Course operations routes
└── history.router.ts                           # Import history routes

packages/shared-types/src/lms/
├── index.ts                                    # LMS exports
├── config.ts                                   # LMS configuration types
├── course-input.ts                             # CourseInput interface
├── import-job.ts                               # Import job types
├── adapter.ts                                  # LMSAdapter base class
├── olx-types.ts                                # OLX structure types
└── errors.ts                                   # LMS error types
```

---

## OLX Structure Overview

Generated OLX follows this structure:

```
course/
├── course.xml
├── chapter/
│   └── section_1.xml         # MegaCampus Section → OLX Chapter
├── sequential/
│   └── lesson_1_1.xml        # MegaCampus Lesson → OLX Sequential
├── vertical/
│   └── lesson_1_1_unit.xml   # OLX Vertical (container)
└── html/
    ├── lesson_1_1_content.xml
    └── lesson_1_1_content.html  # Actual HTML content
```

### Mapping

| MegaCampus | OLX Element | Studio Name |
|------------|-------------|-------------|
| Course | `<course>` | Course |
| Section | `<chapter>` | Section |
| Lesson | `<sequential>` + `<vertical>` | Subsection + Unit |
| Content | `<html>` | HTML Component |

---

## Testing

### Unit Tests

```bash
cd packages/course-gen-platform
pnpm test -- --grep "openedx"
```

### Integration Tests

Requires running Open edX instance:

```bash
# Set environment variables
export OPENEDX_LMS_URL=http://local.edly.io
export OPENEDX_STUDIO_URL=http://studio.local.edly.io
export OPENEDX_CLIENT_ID=your-client-id
export OPENEDX_CLIENT_SECRET=your-client-secret

pnpm test:integration -- --grep "openedx"
```

---

## Troubleshooting

### "Authentication failed"

1. Verify client credentials are correct
2. Check OAuth2 application is set to "Confidential" and "Client credentials"
3. Ensure the user associated with the app has staff permissions

### "Course import failed"

1. Check OLX structure is valid (run `tar -tzf course.tar.gz`)
2. Verify all `url_name` attributes are ASCII-only
3. Check Open edX logs: `tutor local logs --follow cms`

### "Connection timeout"

1. Verify LMS/Studio URLs are accessible
2. Check firewall rules allow outbound connections
3. Increase `import_timeout_seconds` in configuration

### "Cyrillic characters in URLs"

All internal identifiers (url_name) must be ASCII. Display names can contain Cyrillic.

---

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Review [data-model.md](./data-model.md) for database schema
3. Review [contracts/trpc-routes.md](./contracts/trpc-routes.md) for API details
4. Check [research.md](./research.md) for library decisions
