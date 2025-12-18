# API Contract: Open edX LMS Integration tRPC Routes

**Feature**: 20-openedx-integration
**Date**: 2025-12-11
**Router Path**: `lms.*`

## Router Structure

```
lms
├── config                    # LMS configuration management
│   ├── list                  # List LMS configurations
│   ├── get                   # Get single configuration
│   ├── create                # Create new configuration
│   ├── update                # Update configuration
│   ├── delete                # Delete configuration
│   └── testConnection        # Test LMS connection
│
├── course                    # Course operations in LMS
│   ├── status                # Get course status in LMS
│   └── delete                # Delete course from LMS
│
├── publish                   # Course publishing
│   ├── start                 # Start publishing job
│   ├── status                # Get job status
│   └── cancel                # Cancel active job
│
└── history                   # Import history
    ├── list                  # List import jobs
    └── get                   # Get job details
```

## Role-Based Authorization

| Operation | Required Role | Middleware |
|-----------|---------------|------------|
| View LMS configs | instructor+ | `requireInstructor` |
| Create/Update/Delete LMS config | admin+ | `requireAdmin` |
| Test LMS connection | admin+ | `requireAdmin` |
| Publish course | instructor+ (course owner) | `requireInstructor` + ownership |
| View publish status | instructor+ | `requireInstructor` |
| Get course status (LMS) | instructor+ | `requireInstructor` |
| Delete course from LMS | admin+ | `requireAdmin` |
| View import history | instructor+ | `requireInstructor` |

---

## 1. Configuration Routes

### `lms.config.list`

List all LMS configurations for the current organization.

**Type**: Query

**Input**:
```typescript
z.object({
  organization_id: z.string().uuid(),
  include_inactive: z.boolean().default(false),
})
```

**Output**:
```typescript
z.array(LmsConfigurationPublicSchema)
// Note: Secrets (client_id, client_secret) are NOT returned
```

**Authorization**: Organization member

**Example**:
```typescript
const configs = await trpc.lms.config.list.query({
  organization_id: 'org-uuid',
});
// Returns: [{ id, name, lms_url, studio_url, ... }]
```

---

### `lms.config.get`

Get a single LMS configuration by ID.

**Type**: Query

**Input**:
```typescript
z.object({
  id: z.string().uuid(),
})
```

**Output**:
```typescript
LmsConfigurationPublicSchema.nullable()
```

**Authorization**: Organization member

**Errors**:
- `NOT_FOUND`: Configuration not found
- `FORBIDDEN`: User not in organization

---

### `lms.config.create`

Create a new LMS configuration.

**Type**: Mutation

**Input**:
```typescript
z.object({
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  lms_url: z.string().url(),
  studio_url: z.string().url(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  default_org: z.string().min(1).max(50),
  default_run: z.string().max(50).default('self_paced'),
  import_timeout_seconds: z.number().int().min(30).max(600).default(300),
  max_retries: z.number().int().min(1).max(5).default(3),
})
```

**Output**:
```typescript
z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string().datetime(),
})
```

**Authorization**: Organization admin

**Errors**:
- `CONFLICT`: Configuration with same name already exists
- `FORBIDDEN`: User not admin of organization
- `BAD_REQUEST`: Invalid URL format

**Example**:
```typescript
const result = await trpc.lms.config.create.mutate({
  organization_id: 'org-uuid',
  name: 'Production LMS',
  lms_url: 'https://lms.example.com',
  studio_url: 'https://studio.example.com',
  client_id: 'my-client-id',
  client_secret: 'my-client-secret',
  default_org: 'MegaCampus',
});
```

---

### `lms.config.update`

Update an existing LMS configuration.

**Type**: Mutation

**Input**:
```typescript
z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  lms_url: z.string().url().optional(),
  studio_url: z.string().url().optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  default_org: z.string().min(1).max(50).optional(),
  default_run: z.string().max(50).optional(),
  import_timeout_seconds: z.number().int().min(30).max(600).optional(),
  max_retries: z.number().int().min(1).max(5).optional(),
  is_active: z.boolean().optional(),
})
```

**Output**:
```typescript
z.object({
  id: z.string().uuid(),
  updated_at: z.string().datetime(),
})
```

**Authorization**: Organization admin

---

### `lms.config.delete`

Delete an LMS configuration.

**Type**: Mutation

**Input**:
```typescript
z.object({
  id: z.string().uuid(),
})
```

**Output**:
```typescript
z.object({
  success: z.boolean(),
})
```

**Authorization**: Organization admin

**Constraints**:
- Cannot delete if active import jobs reference this configuration

---

### `lms.config.testConnection`

Test connectivity to an LMS instance.

**Type**: Mutation

**Input**:
```typescript
z.object({
  id: z.string().uuid(),
})
```

**Output**:
```typescript
z.object({
  success: z.boolean(),
  latency_ms: z.number().int(),
  message: z.string(),
  lms_version: z.string().optional(),
  api_version: z.string().optional(),
})
```

**Authorization**: Organization admin

**Behavior**:
1. Retrieve configuration by ID
2. Attempt OAuth2 token acquisition
3. Make test API call to LMS
4. Update `last_connection_test` and `last_connection_status`
5. Return result

**Timeout**: 10 seconds

**Example Response (Success)**:
```json
{
  "success": true,
  "latency_ms": 234,
  "message": "Connection successful",
  "lms_version": "open-release/redwood",
  "api_version": "v1"
}
```

**Example Response (Failure)**:
```json
{
  "success": false,
  "latency_ms": 5000,
  "message": "Authentication failed - check client ID and secret"
}
```

---

## 2. Course Routes

### `lms.course.status`

Get the current status of a course in the LMS.

**Type**: Query

**Input**:
```typescript
z.object({
  course_id: z.string().uuid(),
  lms_configuration_id: z.string().uuid(),
})
```

**Output**:
```typescript
z.object({
  exists: z.boolean(),
  published: z.boolean(),
  edx_course_key: z.string().nullable(),
  last_modified: z.string().datetime().nullable(),
  lms_url: z.string().url().nullable(),
  studio_url: z.string().url().nullable(),
  enrollment_count: z.number().int().optional(),
})
```

**Authorization**: Course owner or instructor

**Behavior**:
1. Retrieve LMS configuration
2. Build expected course key from course metadata
3. Query Open edX API for course existence
4. Return status with URLs if course exists

**Errors**:
- `NOT_FOUND`: Course or LMS configuration not found
- `LMS_CONNECTION_FAILED`: Cannot connect to LMS

**Example**:
```typescript
const status = await trpc.lms.course.status.query({
  course_id: 'course-uuid',
  lms_configuration_id: 'config-uuid',
});
// Returns: { exists: true, published: true, edx_course_key: 'course-v1:MegaCampus+AI101+self_paced', ... }
```

---

### `lms.course.delete`

Delete a course from the LMS.

**Type**: Mutation

**Input**:
```typescript
z.object({
  course_id: z.string().uuid(),
  lms_configuration_id: z.string().uuid(),
  confirm: z.literal(true), // Explicit confirmation required
})
```

**Output**:
```typescript
z.object({
  success: z.boolean(),
  message: z.string(),
  edx_course_key: z.string(),
})
```

**Authorization**: Organization admin (requireAdmin)

**Behavior**:
1. Verify course exists in LMS
2. Check no active enrollments (optional warning)
3. Delete course via Open edX API
4. Update local import job records
5. Return result

**Errors**:
- `NOT_FOUND`: Course not found in LMS
- `FORBIDDEN`: User not admin
- `PRECONDITION_FAILED`: Course has active enrollments (if configured)
- `LMS_CONNECTION_FAILED`: Cannot connect to LMS

**Example**:
```typescript
const result = await trpc.lms.course.delete.mutate({
  course_id: 'course-uuid',
  lms_configuration_id: 'config-uuid',
  confirm: true,
});
// Returns: { success: true, message: 'Course deleted', edx_course_key: 'course-v1:MegaCampus+AI101+self_paced' }
```

---

## 3. Publishing Routes

### `lms.publish.start`

Start a course publishing job to Open edX.

**Type**: Mutation

**Input**:
```typescript
z.object({
  course_id: z.string().uuid(),
  lms_configuration_id: z.string().uuid(),
  options: z.object({
    overwrite_existing: z.boolean().default(true),
    course_code_override: z.string().max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
    run_override: z.string().max(50).optional(),
  }).default({}),
})
```

**Output**:
```typescript
z.object({
  job_id: z.string().uuid(),
  edx_course_key: z.string(),
  status: LmsImportStatusSchema,
  estimated_duration_seconds: z.number().int().optional(),
})
```

**Authorization**: Course owner

**Behavior**:
1. Validate course exists and is in `completed` state
2. Check no active import job exists for this course
3. Generate OLX structure from course data
4. Package as tar.gz
5. Create import job record
6. Start async upload to Open edX
7. Return job details

**Errors**:
- `NOT_FOUND`: Course or LMS configuration not found
- `PRECONDITION_FAILED`: Course not in completed state
- `CONFLICT`: Active import job already exists
- `BAD_REQUEST`: Course has no content

**Example**:
```typescript
const job = await trpc.lms.publish.start.mutate({
  course_id: 'course-uuid',
  lms_configuration_id: 'config-uuid',
  options: {
    overwrite_existing: true,
  },
});
// Returns: { job_id: 'job-uuid', edx_course_key: 'course-v1:MegaCampus+AI101+self_paced', status: 'pending' }
```

---

### `lms.publish.status`

Get the current status of a publishing job.

**Type**: Query

**Input**:
```typescript
z.object({
  job_id: z.string().uuid(),
})
```

**Output**:
```typescript
z.object({
  id: z.string().uuid(),
  status: LmsImportStatusSchema,
  progress_percent: z.number().int().min(0).max(100),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  duration_ms: z.number().int().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  course_url: z.string().url().nullable(),
  studio_url: z.string().url().nullable(),
})
```

**Authorization**: Course owner or org admin

**Polling Recommendation**:
- Initial poll: 2 seconds after job creation
- Subsequent polls: Exponential backoff (2s, 4s, 8s, 16s max)
- Stop polling when status is `succeeded` or `failed`

---

### `lms.publish.cancel`

Cancel an active publishing job.

**Type**: Mutation

**Input**:
```typescript
z.object({
  job_id: z.string().uuid(),
})
```

**Output**:
```typescript
z.object({
  success: z.boolean(),
  message: z.string(),
})
```

**Authorization**: Course owner

**Constraints**:
- Can only cancel jobs in `pending` or `uploading` status
- Cannot cancel once LMS processing has started

---

## 4. History Routes

### `lms.history.list`

List import job history for a course or organization.

**Type**: Query

**Input**:
```typescript
z.object({
  course_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  status: LmsImportStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})
```

**Output**:
```typescript
z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    course_id: z.string().uuid(),
    course_title: z.string(),
    lms_name: z.string(),
    edx_course_key: z.string(),
    status: LmsImportStatusSchema,
    created_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
    duration_ms: z.number().int().nullable(),
  })),
  total: z.number().int(),
  has_more: z.boolean(),
})
```

**Authorization**: Course owner (if course_id) or org admin (if organization_id)

---

### `lms.history.get`

Get detailed information about a specific import job.

**Type**: Query

**Input**:
```typescript
z.object({
  job_id: z.string().uuid(),
})
```

**Output**:
```typescript
LmsImportJobSchema.extend({
  course_title: z.string(),
  lms_name: z.string(),
})
```

**Authorization**: Course owner or org admin

---

## 5. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `LMS_CONFIG_NOT_FOUND` | 404 | LMS configuration not found |
| `LMS_CONFIG_CONFLICT` | 409 | Configuration name already exists |
| `LMS_CONNECTION_FAILED` | 502 | Failed to connect to LMS |
| `LMS_AUTH_FAILED` | 401 | OAuth authentication failed |
| `LMS_IMPORT_FAILED` | 500 | Import process failed on LMS side |
| `LMS_TIMEOUT` | 504 | Operation timed out |
| `COURSE_NOT_READY` | 412 | Course not in completed state |
| `IMPORT_IN_PROGRESS` | 409 | Active import job exists |
| `INVALID_OLX` | 400 | Generated OLX is invalid |

---

## 6. Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| `publish.start` | 5 | per minute per course |
| `config.testConnection` | 10 | per minute per config |
| `publish.status` | 60 | per minute per job |

---

## 7. Webhook Events (Future)

For real-time updates, the following webhook events will be supported:

```typescript
// lms.import.started
{
  type: 'lms.import.started',
  job_id: string,
  course_id: string,
  edx_course_key: string,
  timestamp: string,
}

// lms.import.progress
{
  type: 'lms.import.progress',
  job_id: string,
  progress_percent: number,
  stage: 'uploading' | 'processing',
  timestamp: string,
}

// lms.import.completed
{
  type: 'lms.import.completed',
  job_id: string,
  course_id: string,
  edx_course_key: string,
  status: 'succeeded' | 'failed',
  course_url?: string,
  studio_url?: string,
  error_message?: string,
  duration_ms: number,
  timestamp: string,
}
```

---

## 8. Implementation Notes

### File Locations

```
packages/course-gen-platform/src/server/routers/lms/
├── index.ts              # Router export
├── config.router.ts      # Configuration routes
├── course.router.ts      # Course status/delete routes
├── publish.router.ts     # Publishing routes
└── history.router.ts     # History routes
```

### Dependencies

- Existing: `@trpc/server`, `zod`, `@supabase/supabase-js`
- New: Integration module from `../../integrations/openedx`

### Middleware

```typescript
// Require authenticated user
const protectedProcedure = t.procedure.use(requireAuth);

// Require organization admin
const adminProcedure = protectedProcedure.use(requireOrgAdmin);
```
