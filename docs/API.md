# MegaCampusAI tRPC API Documentation

**Version**: 0.4.0
**Last Updated**: 2025-12-07

## Table of Contents

1. [Overview](#overview)
2. [Multi-Client Integration (LMS Systems)](#multi-client-integration-lms-systems)
3. [Authentication](#authentication)
4. [Authorization](#authorization)
5. [Error Codes](#error-codes)
6. [File Upload Constraints](#file-upload-constraints)
7. [API Endpoints](#api-endpoints)
   - [Admin Router](#admin-router)
   - [Billing Router](#billing-router)
   - [Generation Router](#generation-router)
   - [Jobs Router](#jobs-router)
   - [Summarization Router](#summarization-router)
   - [Analysis Router](#analysis-router)
   - [Document Processing Router](#document-processing-router)

---

## Overview

### What is tRPC?

MegaCampusAI uses [tRPC](https://trpc.io) for type-safe API communication between client and server. tRPC enables:

- **End-to-end type safety**: TypeScript types are automatically inferred from server to client
- **No code generation**: Types are derived directly from your procedures
- **Runtime validation**: Input/output validation using Zod schemas
- **Automatic serialization**: JSON serialization with proper handling of dates and complex types

### Why tRPC?

- **Developer Experience**: Autocomplete, inline documentation, and compile-time type checking
- **Performance**: Minimal overhead, efficient JSON-RPC protocol
- **Flexibility**: Works with any HTTP client, supports subscriptions via WebSockets

### Base URL

```
Development: http://localhost:3000/api/trpc
Production: https://api.megacampus.ai/api/trpc
```

### API Protocol

tRPC uses HTTP POST for mutations and GET for queries (with base64-encoded input). All requests follow the JSON-RPC 2.0 specification.

---

## Multi-Client Integration (LMS Systems)

### tRPC is Language-Agnostic

**Important**: tRPC endpoints are **standard HTTP POST** requests. Any programming language can call them - PHP, Python, Ruby, Java, Go, etc. You do **NOT** need TypeScript to use this API.

### Quick Start for Non-TypeScript Clients

**PHP Example**:
```php
<?php
$ch = curl_init('https://api.megacampus.ai/trpc/generation.initiate');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $jwt_token,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'courseId' => 'uuid-here',
    'webhookUrl' => 'https://lms.example.com/webhook'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$data = json_decode($response, true);
?>
```

**Python Example**:
```python
import requests

response = requests.post(
    'https://api.megacampus.ai/trpc/generation.initiate',
    headers={
        'Authorization': f'Bearer {jwt_token}',
        'Content-Type': 'application/json'
    },
    json={'courseId': 'uuid-here', 'webhookUrl': 'https://lms.example.com/webhook'}
)
data = response.json()
```

**Ruby Example**:
```ruby
require 'net/http'
require 'json'

uri = URI('https://api.megacampus.ai/trpc/generation.initiate')
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true

request = Net::HTTP::Post.new(uri.path)
request['Authorization'] = "Bearer #{jwt_token}"
request['Content-Type'] = 'application/json'
request.body = { courseId: 'uuid-here' }.to_json

response = http.request(request)
data = JSON.parse(response.body)
```

### LMS Integration Guide

For detailed integration examples (Moodle, Canvas, OpenEdX), see:
- **[LMS Integration Roadmap](./LMS-INTEGRATION-ROADMAP.md)** - Full PHP/Python/Ruby examples
- **Authentication flow** for service accounts
- **Webhook configuration** for async updates
- **Error handling** and retry strategies

### Why tRPC Works for All Languages

1. **Standard HTTP**: POST requests with JSON payloads
2. **JWT Auth**: Bearer tokens work universally
3. **JSON I/O**: All data is JSON (universal format)
4. **No special protocol**: Just HTTP + JSON, no gRPC or proprietary formats

TypeScript clients get **bonus features** (type inference, autocomplete), but the API works identically for all languages.

---

## Authentication

### Authentication Method

MegaCampusAI uses **Supabase Auth** with JWT (JSON Web Tokens) for authentication.

### Obtaining a JWT Token

1. **Sign up or sign in** using Supabase Auth:
   ```typescript
   import { createClient } from '@supabase/supabase-js';

   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

   // Sign in
   const { data, error } = await supabase.auth.signInWithPassword({
     email: 'user@example.com',
     password: 'your-password',
   });

   // Access token is in data.session.access_token
   const accessToken = data.session?.access_token;
   ```

2. **JWT Claims**: The JWT contains custom claims added by the `custom_access_token_hook`:
   - `user_id` (string): User UUID
   - `email` (string): User email address
   - `role` (string): User role (`admin`, `instructor`, `student`)
   - `organization_id` (string): Organization UUID

### Passing Token in Requests

Include the JWT in the `Authorization` header using the Bearer scheme:

```http
Authorization: Bearer <your-jwt-token>
```

**Example with fetch**:
```typescript
const response = await fetch('http://localhost:3000/api/trpc/generation.test', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});
```

**Example with tRPC client**:
```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server/routers';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers() {
        return {
          Authorization: `Bearer ${accessToken}`,
        };
      },
    }),
  ],
});
```

### Token Expiration and Refresh

- **Token Lifetime**: Supabase JWT tokens expire after 1 hour by default
- **Token Refresh**: Use Supabase's `refreshSession()` to obtain a new token:
  ```typescript
  const { data, error } = await supabase.auth.refreshSession();
  const newAccessToken = data.session?.access_token;
  ```
- **Auto-refresh**: The Supabase client SDK automatically refreshes tokens before expiration

### Unauthenticated Endpoints

Some endpoints are **public** and do not require authentication:
- `generation.test` - Health check endpoint

All other endpoints require a valid JWT token.

---

## Authorization

### Role Hierarchy

MegaCampusAI uses a role-based access control (RBAC) system with three roles:

```
admin (highest privilege)
  └─ Full organization access
  └─ Can manage users, courses, billing
  └─ Can view all data within organization

instructor (medium privilege)
  └─ Can create and manage own courses
  └─ Can upload files and generate content
  └─ Can view own students and enrollments

student (lowest privilege)
  └─ Can view enrolled courses
  └─ Can access course content
  └─ Can track own progress
```

### Role Permissions

#### Admin Role (`admin`)

**Can access**:
- All admin-only endpoints (`admin.*`)
- All instructor endpoints (`generation.*`, course management)
- All student endpoints (course viewing, progress tracking)

**Cannot access**:
- Other organizations' data (enforced by RLS policies)

**Use cases**:
- Organization administrators
- Billing managers
- User management

#### Instructor Role (`instructor`)

**Can access**:
- All instructor-level endpoints (`generation.initiate`, `generation.uploadFile`)
- All student endpoints
- Own courses and enrollments

**Cannot access**:
- Admin-only endpoints (`admin.*`)
- Other instructors' courses (enforced by RLS policies)
- Organization-wide data

**Use cases**:
- Course creators
- Content uploaders
- Teaching staff

#### Student Role (`student`)

**Can access**:
- Course viewing endpoints
- Own enrollment data
- Progress tracking

**Cannot access**:
- Admin endpoints (`admin.*`)
- Instructor endpoints (`generation.*`)
- Other students' data

**Use cases**:
- Learners
- Course participants

### Procedure Types

tRPC procedures are protected with middleware that enforce role requirements:

1. **`publicProcedure`**: No authentication required
   - Example: `generation.test`

2. **`protectedProcedure`**: Requires valid JWT (any authenticated user)
   - Example: `billing.getUsage`, `jobs.getStatus`

3. **`instructorProcedure`**: Requires `instructor` or `admin` role
   - Example: `generation.initiate`, `generation.uploadFile`

4. **`adminProcedure`**: Requires `admin` role
   - Example: `admin.listOrganizations`, `admin.listUsers`

### Row-Level Security (RLS)

In addition to role-based authorization, PostgreSQL RLS policies enforce:

- **Multi-tenancy isolation**: Users can only access data from their organization
- **Data ownership**: Users can only modify data they own (e.g., own courses)
- **Audit trails**: RLS policies log all data access for compliance

RLS policies are automatically enforced by Supabase and cannot be bypassed via tRPC.

---

## Error Codes

MegaCampusAI follows tRPC's error code conventions. All errors return a JSON response with:

```typescript
{
  error: {
    code: string,        // tRPC error code (see below)
    message: string,     // Human-readable error message
    data?: {             // Optional additional error data
      httpStatus: number,
      path: string,
      // ... custom fields
    }
  }
}
```

### Common Error Codes

#### `UNAUTHORIZED` (HTTP 401)

**When it occurs**:
- Missing `Authorization` header
- Invalid JWT token
- Expired JWT token
- JWT signature verification failed
- User not found in database

**Example response**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide a valid Bearer token.",
    "data": {
      "httpStatus": 401
    }
  }
}
```

**How to fix**:
1. Ensure you're sending the `Authorization` header
2. Check that the JWT token is valid and not expired
3. Refresh the token using `supabase.auth.refreshSession()`

---

#### `FORBIDDEN` (HTTP 403)

**When it occurs**:
- User is authenticated but lacks required role
- User trying to access another organization's data
- User trying to modify data they don't own

**Example response**:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied. Required role: admin. Your role: instructor",
    "data": {
      "httpStatus": 403
    }
  }
}
```

**How to fix**:
1. Check your user's role in the `users` table
2. Request admin privileges if needed
3. Ensure you're only accessing data within your organization

---

#### `NOT_FOUND` (HTTP 404)

**When it occurs**:
- Requested resource does not exist (course, job, organization, etc.)
- Resource was deleted
- Invalid UUID provided

**Example response**:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Course not found: 123e4567-e89b-12d3-a456-426614174000",
    "data": {
      "httpStatus": 404
    }
  }
}
```

**How to fix**:
1. Verify the UUID is correct
2. Check that the resource exists in the database
3. Ensure you have access to the resource (organization match)

---

#### `BAD_REQUEST` (HTTP 400)

**When it occurs**:
- Invalid input parameters (validation failed)
- File upload errors (wrong format, size exceeded, quota exceeded)
- Already completed/cancelled operation

**Example response**:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "PDF processing requires STANDARD tier or higher. Allowed formats: TXT, MD. Please upgrade.",
    "data": {
      "httpStatus": 400
    }
  }
}
```

**How to fix**:
1. Check input parameter types and formats
2. Review file upload constraints for your tier
3. Ensure operation is valid for current resource state

---

#### `INTERNAL_SERVER_ERROR` (HTTP 500)

**When it occurs**:
- Database connection errors
- External service failures (Qdrant, Jina, Redis)
- Unexpected exceptions in server code

**Example response**:
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Failed to fetch organizations: connection timeout",
    "data": {
      "httpStatus": 500
    }
  }
}
```

**How to fix**:
1. Check server logs for detailed error traces
2. Verify external services are running (Supabase, Qdrant, Redis)
3. Retry the request (may be transient error)
4. Contact support if error persists

---

## File Upload Constraints

File upload capabilities vary by organization tier. Constraints are enforced by the `file-validator` module.

### Tier-Based Constraints

#### FREE Tier

- **Formats allowed**: **NONE** (file uploads prohibited)
- **File count limit**: 0 files per course
- **Storage quota**: 10 MB (reserved but unused)
- **Processing**: N/A

**Error message**:
```
File uploads are not available on FREE tier. Please upgrade to BASIC or higher.
```

---

#### BASIC Tier (`basic_plus`)

- **Formats allowed**: `TXT`, `MD` only (plain text)
- **File count limit**: 1 file per course
- **Storage quota**: 100 MB per organization
- **Processing**: Direct file read (no document parsing, no OCR)

**Allowed MIME types**:
- `text/plain` (TXT)
- `text/markdown` (MD)

**Error messages**:
```
PDF processing requires STANDARD tier or higher. Allowed formats: TXT, MD. Please upgrade.
DOCX processing requires STANDARD tier or higher. Allowed formats: TXT, MD. Please upgrade.
Image processing requires PREMIUM tier. Allowed formats: TXT, MD. Please upgrade.
```

---

#### STANDARD Tier

- **Formats allowed**: `PDF`, `DOCX`, `PPTX`, `HTML`, `TXT`, `MD`
- **File count limit**: 3 files per course
- **Storage quota**: 1 GB per organization
- **Processing**: Docling document parsing with OCR enabled (Tesseract/EasyOCR)

**Allowed MIME types**:
- `application/pdf` (PDF)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` (PPTX)
- `text/html` (HTML)
- `text/plain` (TXT)
- `text/markdown` (MD)

**Error message** (for images):
```
Image processing requires PREMIUM tier. Please upgrade.
```

---

#### TRIAL Tier

- **Formats allowed**: Same as STANDARD (`PDF`, `DOCX`, `PPTX`, `HTML`, `TXT`, `MD`)
- **File count limit**: 1 file per course
- **Storage quota**: 1 GB per organization
- **Processing**: Same as STANDARD (Docling + OCR)

---

#### PREMIUM Tier

- **Formats allowed**: All formats including images
- **File count limit**: 10 files per course
- **Storage quota**: 10 GB per organization
- **Processing**: Docling + OCR + full image extraction

**Allowed MIME types** (in addition to STANDARD):
- `image/png` (PNG)
- `image/jpeg` (JPEG/JPG)
- `image/gif` (GIF)
- `image/svg+xml` (SVG)
- `image/webp` (WebP)

---

### File Size Limits

- **Maximum file size**: 100 MB per file (enforced at upload time)
- **Storage quota**: Cumulative across all files in organization

### Quota Enforcement

Storage quota is enforced via the `quota-enforcer` module:

1. **Pre-upload check**: `checkQuota()` verifies available space
2. **Post-upload update**: `incrementQuota()` updates `storage_used_bytes`
3. **Atomic updates**: Uses PostgreSQL function `increment_storage_quota()`

**Quota exceeded error**:
```
Storage quota exceeded. Using 950 MB of 1 GB. Available: 50 MB. File size: 75 MB.
```

---

## API Endpoints

### Admin Router

Base path: `admin.*`

**Authorization**: Requires `admin` role

---

#### `admin.listOrganizations`

**Type**: Query
**Authorization**: Admin only

**Description**: List all organizations in the system with storage usage and tier information.

**Input**:
```typescript
{
  limit?: number;   // 1-100, default: 20
  offset?: number;  // default: 0
}
```

**Output**:
```typescript
Array<{
  id: string;                      // Organization UUID
  name: string;                    // Organization name
  tier: 'free' | 'basic_plus' | 'standard' | 'premium';
  storageQuotaBytes: number;       // Total quota in bytes
  storageUsedBytes: number;        // Current usage in bytes
  storageUsedPercentage: number;   // 0-100
  createdAt: string;               // ISO 8601 timestamp
  updatedAt: string | null;        // ISO 8601 timestamp
}>
```

**Example request**:
```typescript
const orgs = await client.admin.listOrganizations.query({
  limit: 50,
  offset: 0,
});
```

**Example response**:
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Acme University",
    "tier": "premium",
    "storageQuotaBytes": 10737418240,
    "storageUsedBytes": 5368709120,
    "storageUsedPercentage": 50,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-10-16T12:00:00Z"
  }
]
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not admin role
- `INTERNAL_SERVER_ERROR` (500): Database error

---

#### `admin.listUsers`

**Type**: Query
**Authorization**: Admin only

**Description**: List all users across organizations with filtering by organization and role.

**Input**:
```typescript
{
  limit?: number;           // 1-100, default: 20
  offset?: number;          // default: 0
  organizationId?: string;  // Filter by organization UUID
  role?: 'admin' | 'instructor' | 'student';  // Filter by role
}
```

**Output**:
```typescript
Array<{
  id: string;                // User UUID
  email: string;             // User email
  role: 'admin' | 'instructor' | 'student';
  organizationId: string;    // Organization UUID
  organizationName: string;  // Organization name (from JOIN)
  createdAt: string;         // ISO 8601 timestamp
  updatedAt: string | null;  // ISO 8601 timestamp
}>
```

**Example request**:
```typescript
const users = await client.admin.listUsers.query({
  organizationId: '123e4567-e89b-12d3-a456-426614174000',
  role: 'instructor',
  limit: 50,
});
```

**Example response**:
```json
[
  {
    "id": "user-uuid-1",
    "email": "instructor@acme.edu",
    "role": "instructor",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "organizationName": "Acme University",
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-10-16T12:00:00Z"
  }
]
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not admin role
- `INTERNAL_SERVER_ERROR` (500): Database error

---

#### `admin.listCourses`

**Type**: Query
**Authorization**: Admin only

**Description**: List all courses across organizations with filtering by organization and status.

**Input**:
```typescript
{
  limit?: number;           // 1-100, default: 20
  offset?: number;          // default: 0
  organizationId?: string;  // Filter by organization UUID
  status?: 'draft' | 'published' | 'archived';  // Filter by status
}
```

**Output**:
```typescript
Array<{
  id: string;                  // Course UUID
  title: string;               // Course title
  slug: string;                // URL-friendly slug
  status: 'draft' | 'published' | 'archived';
  instructorId: string;        // User UUID
  instructorEmail: string;     // Instructor email (from JOIN)
  organizationId: string;      // Organization UUID
  organizationName: string;    // Organization name (from JOIN)
  createdAt: string;           // ISO 8601 timestamp
  updatedAt: string | null;    // ISO 8601 timestamp
}>
```

**Example request**:
```typescript
const courses = await client.admin.listCourses.query({
  organizationId: '123e4567-e89b-12d3-a456-426614174000',
  status: 'published',
  limit: 50,
});
```

**Example response**:
```json
[
  {
    "id": "course-uuid-1",
    "title": "Introduction to Python",
    "slug": "intro-to-python",
    "status": "published",
    "instructorId": "user-uuid-1",
    "instructorEmail": "instructor@acme.edu",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000",
    "organizationName": "Acme University",
    "createdAt": "2025-02-01T09:00:00Z",
    "updatedAt": "2025-10-10T14:30:00Z"
  }
]
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not admin role
- `INTERNAL_SERVER_ERROR` (500): Database error

---

### Billing Router

Base path: `billing.*`

**Authorization**: Requires authentication (any role)

---

#### `billing.getUsage`

**Type**: Query
**Authorization**: Protected (any authenticated user)

**Description**: Get current storage usage metrics for the authenticated user's organization.

**Input**: None (uses user's `organization_id` from JWT)

**Output**:
```typescript
{
  storageUsedBytes: number;        // Raw bytes used
  storageQuotaBytes: number;       // Raw bytes allowed
  storageUsedFormatted: string;    // "50.00 MB"
  storageQuotaFormatted: string;   // "100.00 MB"
  usagePercentage: number;         // 0-100 (2 decimal places)
  fileCount: number;               // Total files uploaded
  tier: 'free' | 'basic_plus' | 'standard' | 'premium';
}
```

**Example request**:
```typescript
const usage = await client.billing.getUsage.query();
```

**Example response**:
```json
{
  "storageUsedBytes": 52428800,
  "storageQuotaBytes": 104857600,
  "storageUsedFormatted": "50.00 MB",
  "storageQuotaFormatted": "100.00 MB",
  "usagePercentage": 50.00,
  "fileCount": 5,
  "tier": "basic_plus"
}
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Organization not found
- `INTERNAL_SERVER_ERROR` (500): Database error

---

#### `billing.getQuota`

**Type**: Query
**Authorization**: Protected (any authenticated user)

**Description**: Get tier information and quota limits for the authenticated user's organization.

**Input**: None (uses user's `organization_id` from JWT)

**Output**:
```typescript
{
  tier: 'free' | 'basic_plus' | 'standard' | 'premium';
  tierDisplayName: string;         // "Basic Plus", "Standard", etc.
  storageQuotaBytes: number;       // Storage limit in bytes
  storageQuotaFormatted: string;   // "1.00 GB"
  fileCountLimit: number;          // Max files per course
  fileCountLimitDisplay: string;   // "3 files per course"
  canUpgrade: boolean;             // Whether upgrade available
  nextTier: string | null;         // Next tier in upgrade path
  upgradePrompt: string | null;    // Upgrade message
}
```

**Example request**:
```typescript
const quota = await client.billing.getQuota.query();
```

**Example response**:
```json
{
  "tier": "basic_plus",
  "tierDisplayName": "Basic Plus",
  "storageQuotaBytes": 104857600,
  "storageQuotaFormatted": "100.00 MB",
  "fileCountLimit": 1,
  "fileCountLimitDisplay": "1 file per course",
  "canUpgrade": true,
  "nextTier": "standard",
  "upgradePrompt": "Upgrade to Standard for 1.00 GB storage and 3 files per course"
}
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Organization not found
- `INTERNAL_SERVER_ERROR` (500): Database error

---

### Generation Router

Base path: `generation.*`

**Authorization**: Mixed (test is public, others require instructor/admin)

---

#### `generation.test`

**Type**: Query
**Authorization**: Public (no authentication required)

**Description**: Health check endpoint to verify tRPC server is operational.

**Input**:
```typescript
{
  message?: string;  // Optional test message to echo
}
```

**Output**:
```typescript
{
  message: string;     // "tRPC server is operational"
  timestamp: string;   // Current server time (ISO 8601)
  echo?: string;       // Echoed input message
}
```

**Example request**:
```typescript
const result = await client.generation.test.query({ message: 'Hello' });
```

**Example response**:
```json
{
  "message": "tRPC server is operational",
  "timestamp": "2025-10-16T12:00:00Z",
  "echo": "Hello"
}
```

**Error codes**: None (public endpoint, always succeeds)

---

#### `generation.initiate`

**Type**: Mutation
**Authorization**: Instructor or Admin

**Description**: Initiate course generation workflow by creating a BullMQ INITIALIZE job.

**Input**:
```typescript
{
  courseId: string;  // UUID of course to generate content for
  settings?: {
    enableAI?: boolean;                        // default: true
    level?: 'beginner' | 'intermediate' | 'advanced';
    maxSections?: number;                      // 1-20
    metadata?: Record<string, unknown>;        // Custom metadata
  };
}
```

**Output**:
```typescript
{
  jobId: string;     // BullMQ job ID for tracking
  status: string;    // "pending"
  message: string;   // Success message
  courseId: string;  // Course UUID
}
```

**Example request**:
```typescript
const result = await client.generation.initiate.mutate({
  courseId: '123e4567-e89b-12d3-a456-426614174000',
  settings: {
    enableAI: true,
    level: 'intermediate',
    maxSections: 10,
  },
});
```

**Example response**:
```json
{
  "jobId": "1",
  "status": "pending",
  "message": "Course generation initiated successfully for course 123e4567-e89b-12d3-a456-426614174000",
  "courseId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not instructor/admin role
- `BAD_REQUEST` (400): Invalid courseId
- `INTERNAL_SERVER_ERROR` (500): Job creation failed

---

#### `generation.uploadFile`

**Type**: Mutation
**Authorization**: Instructor or Admin

**Description**: Upload a file for course generation with tier-based validation and storage quota enforcement.

**Input**:
```typescript
{
  courseId: string;     // UUID of course to associate file with
  filename: string;     // Original filename (1-255 chars)
  fileSize: number;     // File size in bytes (max 100 MB)
  mimeType: string;     // MIME type of file
  fileContent: string;  // Base64 encoded file content
}
```

**Output**:
```typescript
{
  fileId: string;       // UUID of created file record
  storagePath: string;  // Relative file system path
  message: string;      // Success message
}
```

**Example request**:
```typescript
const result = await client.generation.uploadFile.mutate({
  courseId: '123e4567-e89b-12d3-a456-426614174000',
  filename: 'syllabus.pdf',
  fileSize: 1024000,
  mimeType: 'application/pdf',
  fileContent: 'base64EncodedContent...',
});
```

**Example response**:
```json
{
  "fileId": "file-uuid-1",
  "storagePath": "uploads/org-uuid/course-uuid/file-uuid-1.pdf",
  "message": "File \"syllabus.pdf\" uploaded successfully to course \"Introduction to Python\""
}
```

**Validation steps**:
1. Course exists and belongs to user's organization
2. File type allowed for organization tier (see [File Upload Constraints](#file-upload-constraints))
3. File count within tier limits
4. Storage quota not exceeded
5. Base64 content valid
6. File saved to disk
7. Metadata stored in database
8. Storage quota updated

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Course belongs to different organization
- `NOT_FOUND` (404): Course not found
- `BAD_REQUEST` (400): File validation failed, quota exceeded, or invalid input
- `INTERNAL_SERVER_ERROR` (500): File system or database error

---

### Jobs Router

Base path: `jobs.*`

**Authorization**: Protected (role-based access)

---

#### `jobs.cancel`

**Type**: Mutation
**Authorization**: Job owner or Admin

**Description**: Cancel a running job. Job owner can cancel their own jobs, admins can cancel any job in their organization.

**Input**:
```typescript
{
  jobId: string;  // BullMQ job ID
}
```

**Output**:
```typescript
{
  success: boolean;      // true
  message: string;       // Confirmation message
  jobId: string;         // Job ID
  cancelledBy?: string;  // User UUID who cancelled
  cancelledAt?: string;  // ISO 8601 timestamp
}
```

**Example request**:
```typescript
const result = await client.jobs.cancel.mutate({
  jobId: '1',
});
```

**Example response**:
```json
{
  "success": true,
  "message": "Job 1 has been cancelled",
  "jobId": "1",
  "cancelledBy": "user-uuid-1",
  "cancelledAt": "2025-10-16T12:00:00Z"
}
```

**Authorization rules**:
- Job owner (user_id matches) can cancel own jobs
- Admin can cancel any job in their organization
- Cannot cancel already completed/failed jobs

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not job owner or admin
- `NOT_FOUND` (404): Job not found
- `BAD_REQUEST` (400): Job already completed/failed

---

#### `jobs.getStatus`

**Type**: Query
**Authorization**: Job owner, Instructor (same org), or Admin (same org)

**Description**: Get full status of a job including cancellation info.

**Input**:
```typescript
{
  jobId: string;  // BullMQ job ID
}
```

**Output**:
```typescript
{
  id: string;                    // Database record UUID
  job_id: string;                // BullMQ job ID
  job_type: string;              // Job type (e.g., "INITIALIZE")
  status: 'pending' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  organization_id: string;       // Organization UUID
  user_id: string | null;        // User UUID who created job
  course_id: string | null;      // Course UUID (if applicable)
  cancelled: boolean;            // Cancellation flag
  cancelled_at: string | null;   // ISO 8601 timestamp
  cancelled_by: string | null;   // User UUID who cancelled
  attempts: number;              // Retry attempts
  max_attempts: number;          // Max retry limit
  progress: object | null;       // Job progress data
  error_message: string | null;  // Error message (if failed)
  error_stack: string | null;    // Error stack trace (if failed)
  created_at: string;            // ISO 8601 timestamp
  started_at: string | null;     // ISO 8601 timestamp
  completed_at: string | null;   // ISO 8601 timestamp
  failed_at: string | null;      // ISO 8601 timestamp
  updated_at: string | null;     // ISO 8601 timestamp
}
```

**Example request**:
```typescript
const status = await client.jobs.getStatus.query({ jobId: '1' });
```

**Example response**:
```json
{
  "id": "job-status-uuid-1",
  "job_id": "1",
  "job_type": "INITIALIZE",
  "status": "active",
  "organization_id": "org-uuid-1",
  "user_id": "user-uuid-1",
  "course_id": "course-uuid-1",
  "cancelled": false,
  "cancelled_at": null,
  "cancelled_by": null,
  "attempts": 1,
  "max_attempts": 3,
  "progress": { "step": 2, "totalSteps": 5 },
  "error_message": null,
  "error_stack": null,
  "created_at": "2025-10-16T11:00:00Z",
  "started_at": "2025-10-16T11:01:00Z",
  "completed_at": null,
  "failed_at": null,
  "updated_at": "2025-10-16T11:05:00Z"
}
```

**Authorization rules**:
- Job owner can view own jobs
- Instructor can view all jobs in their organization
- Admin can view all jobs in their organization
- Student can only view own jobs

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): No access to this job
- `NOT_FOUND` (404): Job not found

---

#### `jobs.list`

**Type**: Query
**Authorization**: Admin/Instructor (all org jobs), Student (own jobs only)

**Description**: List jobs with filtering by status and cancellation state.

**Input**:
```typescript
{
  status?: 'pending' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  cancelled?: boolean;    // Filter by cancellation status
  limit?: number;         // 1-100, default: 50
  offset?: number;        // default: 0
}
```

**Output**:
```typescript
{
  jobs: Array<JobStatus>;  // Array of job status objects (same as getStatus)
  total: number;           // Total count matching filters
  limit: number;           // Limit from request
  offset: number;          // Offset from request
}
```

**Example request**:
```typescript
const result = await client.jobs.list.query({
  status: 'active',
  limit: 20,
  offset: 0,
});
```

**Example response**:
```json
{
  "jobs": [
    {
      "id": "job-status-uuid-1",
      "job_id": "1",
      "job_type": "INITIALIZE",
      "status": "active",
      ...
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

**Authorization rules**:
- Admin: See all jobs in organization
- Instructor: See all jobs in organization
- Student: See only own jobs

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `INTERNAL_SERVER_ERROR` (500): Database error

---

### Summarization Router

Base path: `summarization.*`

**Authorization**: Protected (instructor/admin for mutations, authenticated for queries)

**Description**: Stage 3 document summarization endpoints for LLM-based hierarchical chunking and adaptive compression workflow.

---

#### `summarization.start`

**Type**: Mutation
**Authorization**: Instructor or Admin
**Rate Limit**: 10 requests/minute

**Description**: Start document summarization job for a course. Performs hierarchical chunking (115K token chunks) with adaptive compression (DETAILED → BALANCED → AGGRESSIVE) and quality validation (0.75+ semantic similarity).

**Input**:
```typescript
{
  courseId: string;         // Course UUID
  forceRestart?: boolean;   // Optional: Restart if already in progress (default: false)
}
```

**Output**:
```typescript
{
  jobId: string;     // BullMQ job ID
  status: 'started'; // Job status
}
```

**Example request**:
```typescript
const result = await client.summarization.start.mutate({
  courseId: 'course-uuid-1',
  forceRestart: false,
});
```

**Example response**:
```json
{
  "jobId": "5678",
  "status": "started"
}
```

**Workflow**:
1. Validates course exists and user has access (organization_id filter)
2. Checks if summarization already in progress
3. Fetches documents from file_catalog (Stage 2 completed: vector_status = 'completed')
4. Creates SUMMARIZATION BullMQ job with tier-based priority
5. Returns job ID for status tracking

**Job Processing**:
- **Small documents (<3K tokens)**: Bypass LLM, zero cost, 100% fidelity
- **Large documents (≥3K tokens)**: Hierarchical chunking + adaptive compression
  - **Chunk size**: 115K tokens with 5% overlap
  - **Compression strategy**: DETAILED (30%) → BALANCED (50%) → AGGRESSIVE (70%)
  - **Max iterations**: 5 attempts to fit context window
  - **Quality validation**: Semantic similarity ≥0.75 via Jina-v3 embeddings
  - **Cost**: $0.45-1.00 per 500 documents (99.8% cheaper than GPT-4)

**Tier-Based Priority**:
- Free: 1
- Basic: 3
- Standard: 5
- Premium: 7
- Enterprise: 10

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not instructor/admin
- `NOT_FOUND` (404): Course not found or no access
- `BAD_REQUEST` (400): Summarization already in progress (use forceRestart=true) or no documents to process
- `INTERNAL_SERVER_ERROR` (500): Job creation failed

---

#### `summarization.getStatus`

**Type**: Query
**Authorization**: Authenticated (course owner or same organization)

**Description**: Get real-time summarization progress for a course.

**Input**:
```typescript
{
  courseId: string;  // Course UUID
}
```

**Output**:
```typescript
{
  status: string;               // generation_status value (e.g., 'processing_documents')
  progress: number;             // 0-100 percentage
  documentsProcessed: number;   // Count of completed documents
  documentsTotal: number;       // Total documents to process
}
```

**Example request**:
```typescript
const status = await client.summarization.getStatus.query({
  courseId: 'course-uuid-1',
});
```

**Example response**:
```json
{
  "status": "processing_documents",
  "progress": 66,
  "documentsProcessed": 2,
  "documentsTotal": 3
}
```

**Status Values**:
- `processing_documents`: Summarization in progress
- `processing_complete`: Summarization finished successfully
- `processing_failed`: Summarization failed

**Progress Calculation**:
```
progress = (documentsProcessed / documentsTotal) * 100
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Course not found or no access

---

#### `summarization.getResult`

**Type**: Query
**Authorization**: Authenticated (course owner or same organization)

**Description**: Get summarization results for all documents. Returns processed_content and summary_metadata from file_catalog.

**Input**:
```typescript
{
  courseId: string;  // Course UUID
}
```

**Output**:
```typescript
{
  documents: Array<{
    documentId: string;           // Document UUID
    filename: string;             // Original filename
    processingStatus: string;     // 'completed' | 'failed' | 'processing'
    processingMethod: string;     // 'bypass' | 'detailed' | 'balanced' | 'aggressive'
    processedContent: string;     // Summarized markdown content
    summaryMetadata: {
      original_tokens: number;    // Token count before summarization
      summary_tokens: number;     // Token count after summarization
      compression_ratio: number;  // 0.0-1.0 (0.3 = 70% reduction)
      iterations: number;         // Number of compression iterations
      strategy_used: string;      // 'detailed' | 'balanced' | 'aggressive' | 'bypass'
      quality_score: number;      // Semantic similarity 0-1
      cost_usd: number;          // LLM cost for this document
      model_used: string;         // e.g., 'openai/gpt-oss-20b'
      duration_ms: number;        // Processing time
    };
  }>;
  totalCost: number;              // Total USD cost for all documents
  totalDuration: number;          // Total processing time (ms)
  qualityAverage: number;         // Average quality score across all documents
}
```

**Example request**:
```typescript
const result = await client.summarization.getResult.query({
  courseId: 'course-uuid-1',
});
```

**Example response**:
```json
{
  "documents": [
    {
      "documentId": "doc-uuid-1",
      "filename": "syllabus.pdf",
      "processingStatus": "completed",
      "processingMethod": "balanced",
      "processedContent": "# Chapter 1: Introduction...",
      "summaryMetadata": {
        "original_tokens": 50000,
        "summary_tokens": 25000,
        "compression_ratio": 0.5,
        "iterations": 2,
        "strategy_used": "balanced",
        "quality_score": 0.82,
        "cost_usd": 0.0025,
        "model_used": "openai/gpt-oss-20b",
        "duration_ms": 15000
      }
    }
  ],
  "totalCost": 0.0075,
  "totalDuration": 45000,
  "qualityAverage": 0.81
}
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Course not found or no access

**Use Cases**:
1. Display summarization results to user before analysis
2. Show compression ratios and quality scores
3. Export summarized content
4. Debug summarization issues
5. Track LLM costs per document

---

### Analysis Router

Base path: `analysis.*`

**Authorization**: Protected (instructor/admin for mutations, authenticated for queries)

**Description**: Stage 4 course content analysis endpoints for multi-phase LLM-based analysis workflow.

---

#### `analysis.start`

**Type**: Mutation
**Authorization**: Instructor or Admin
**Rate Limit**: 10 requests/minute

**Description**: Start multi-phase analysis job for a course. Performs 6-phase analysis (pre-flight, classification, scope, expert, synthesis, assembly) with real-time progress tracking.

**Input**:
```typescript
{
  courseId: string;         // Course UUID
  forceRestart?: boolean;   // Optional: Restart if already in progress (default: false)
}
```

**Output**:
```typescript
{
  jobId: string;     // BullMQ job ID
  status: 'started'; // Job status
}
```

**Example request**:
```typescript
const result = await client.analysis.start.mutate({
  courseId: 'course-uuid-1',
  forceRestart: false,
});
```

**Example response**:
```json
{
  "jobId": "1234",
  "status": "started"
}
```

**Workflow**:
1. Validates course exists and user has access (organization_id filter)
2. Checks if analysis already in progress
3. Fetches document summaries from file_catalog (Stage 3 completed documents)
4. Creates STRUCTURE_ANALYSIS BullMQ job with tier-based priority
5. Returns job ID for status tracking

**Job Payload** (sent to BullMQ):
```typescript
{
  course_id: string;
  organization_id: string;
  user_id: string;
  input: {
    topic: string;
    language: string;              // Target language (e.g., 'ru', 'en')
    style: string;
    answers?: string;              // User requirements
    target_audience: string;       // beginner | intermediate | advanced | mixed
    difficulty: string;
    lesson_duration_minutes: number; // 3-45 minutes
    document_summaries: Array<{   // From Stage 3
      document_id: string;
      file_name: string;
      processed_content: string;
      processing_method: string;
      summary_metadata: object;
    }>;
  };
  priority: number;               // 1-10 (tier-based)
  attempt_count: number;
  created_at: string;             // ISO 8601
}
```

**Tier-Based Priority**:
- Free: 1
- Basic: 3
- Standard: 5
- Premium: 7
- Enterprise: 10

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Not instructor/admin
- `NOT_FOUND` (404): Course not found or no access
- `BAD_REQUEST` (400): Analysis already in progress (use forceRestart=true)
- `INTERNAL_SERVER_ERROR` (500): Job creation failed

---

#### `analysis.getStatus`

**Type**: Query
**Authorization**: Authenticated (course owner or same organization)

**Description**: Get real-time analysis progress for a course.

**Input**:
```typescript
{
  courseId: string;  // Course UUID
}
```

**Output**:
```typescript
{
  status: string;    // generation_status value (e.g., 'analyzing_task')
  progress: number;  // 0-100 percentage
}
```

**Example request**:
```typescript
const status = await client.analysis.getStatus.query({
  courseId: 'course-uuid-1',
});
```

**Example response**:
```json
{
  "status": "analyzing_task",
  "progress": 45
}
```

**Progress Ranges** (from orchestrator):
- 0-10%: Pre-flight validation (Stage 3 barrier check)
- 10-25%: Phase 1 - Basic classification
- 25-45%: Phase 2 - Scope analysis
- 45-75%: Phase 3 - Deep expert analysis
- 75-90%: Phase 4 - Document synthesis
- 90-100%: Phase 5 - Final assembly

**Status Values**:
- `analyzing_task`: Analysis in progress
- `analyzing_complete`: Analysis finished successfully
- `analyzing_failed`: Analysis failed

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Course not found or no access

---

#### `analysis.getResult`

**Type**: Query
**Authorization**: Authenticated (course owner or same organization)

**Description**: Get complete analysis result from courses.analysis_result JSONB column.

**Input**:
```typescript
{
  courseId: string;  // Course UUID
}
```

**Output**:
```typescript
{
  analysisResult: AnalysisResult | null;  // Null if not yet completed
}
```

**AnalysisResult Structure**:
```typescript
{
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number;          // 0-1
    reasoning: string;
    secondary?: string | null;
  };

  contextual_language: {
    why_matters_context: string;
    motivators: string;
    experience_prompt: string;
    problem_statement_context: string;
    knowledge_bridge: string;
    practical_benefit_focus: string;
  };

  topic_analysis: {
    determined_topic: string;
    information_completeness: number; // 0-100%
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string;
    target_audience: string;
    missing_elements: string[] | null;
    key_concepts: string[];         // 3-10 items
    domain_keywords: string[];      // 5-15 items
  };

  recommended_structure: {
    estimated_content_hours: number;    // 0.5-200h
    scope_reasoning: string;
    lesson_duration_minutes: number;    // 3-45 minutes
    calculation_explanation: string;
    total_lessons: number;              // 10-100 (minimum: 10)
    total_sections: number;             // 1-30
    scope_warning: string | null;
    sections_breakdown: Array<{
      area: string;
      estimated_lessons: number;
      importance: 'core' | 'important' | 'optional';
      learning_objectives: string[];
      key_topics: string[];
      pedagogical_approach: string;
      difficulty_progression: 'flat' | 'gradual' | 'steep';
    }>;
  };

  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string;
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string;
    interactivity_level: 'high' | 'medium' | 'low';
  };

  scope_instructions: string;         // For Stage 5 generation
  content_strategy: 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing';
  expansion_areas: Array<{
    area: string;
    priority: 'critical' | 'important' | 'nice-to-have';
    specific_requirements: string[];
    estimated_lessons: number;
  }> | null;

  research_flags: Array<{
    topic: string;
    reason: string;
    context: string;
  }>;

  metadata: {
    analysis_version: string;
    total_duration_ms: number;
    phase_durations_ms: Record<string, number>;
    model_usage: Record<string, string>;  // e.g., { phase_1: 'openai/gpt-oss-20b' }
    total_tokens: { input: number; output: number; total: number };
    total_cost_usd: number;
    retry_count: number;
    quality_scores: Record<string, number>;
    created_at: string;  // ISO 8601
  };
}
```

**Example request**:
```typescript
const result = await client.analysis.getResult.query({
  courseId: 'course-uuid-1',
});
```

**Example response**:
```json
{
  "analysisResult": {
    "course_category": {
      "primary": "professional",
      "confidence": 0.92,
      "reasoning": "Technical course with professional skill development focus"
    },
    "topic_analysis": {
      "determined_topic": "React Hooks Fundamentals",
      "information_completeness": 85,
      "complexity": "medium",
      "key_concepts": ["useState", "useEffect", "Custom Hooks"],
      "domain_keywords": ["React", "JavaScript", "Frontend", "State Management"]
    },
    "recommended_structure": {
      "total_lessons": 15,
      "total_sections": 4,
      "estimated_content_hours": 3.5
    }
  }
}
```

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `NOT_FOUND` (404): Course not found or no access

**Use Cases**:
1. Display analysis results to user before starting generation
2. Show course structure preview
3. Export analysis report
4. Debug analysis issues

---

### Document Processing Router

Base path: `documentProcessing.*`

**Authorization**: Protected (instructor/admin)

**Description**: Stage 2 document processing retry operations for failed document processing jobs.

---

#### `documentProcessing.retryDocument`

**Type**: Mutation
**Authorization**: Protected (course owner or same organization)
**Rate Limit**: 10 requests/minute

**Description**: Retry processing of a single failed document in Stage 2. This endpoint allows retrying document processing for files that failed during chunking, embedding, or Qdrant upload. It verifies the document status is 'failed', cleans up existing vectors from Qdrant, resets the document to 'pending', and enqueues a new DOCUMENT_PROCESSING job with high priority.

**Input**:
```typescript
{
  courseId: string;  // Course UUID the document belongs to
  fileId: string;    // File UUID to retry processing
}
```

**Output**:
```typescript
{
  success: true;
  jobId: string;     // BullMQ job ID for tracking
}
```

**Example request**:
```typescript
const result = await client.documentProcessing.retryDocument.mutate({
  courseId: '123e4567-e89b-12d3-a456-426614174000',
  fileId: '987fcdeb-51a2-43f7-9c6d-123456789abc',
});
console.log(`Retry job enqueued: ${result.jobId}`);
```

**Example response**:
```json
{
  "success": true,
  "jobId": "5678"
}
```

**Processing Flow**:
1. Verify course access (user owns course or same organization)
2. Verify document exists and belongs to the course
3. Verify document status is 'failed' (vector_status = 'failed')
4. **Delete existing vectors from Qdrant** (cleanup before retry)
5. Reset document status to 'pending' and clear processed data
6. Enqueue new DOCUMENT_PROCESSING job with high priority (priority: 1)
7. Return job ID for status tracking

**Qdrant Cleanup Behavior**:
- Deletes vectors by `document_id` + `course_id` filter
- Uses `wait: true` for guaranteed deletion before retry
- Non-fatal on errors (logs warning but doesn't fail the operation)
- Prevents orphaned vectors from accumulating on retries

**Integration with restartFromStage**:
When restarting from Stage 2 via `generation.restartFromStage`, the system:
- Cleans up vectors for ALL documents in the course
- Resets all document statuses to 'pending'
- Enqueues DOCUMENT_PROCESSING jobs for each file

**Error codes**:
- `UNAUTHORIZED` (401): Not authenticated
- `FORBIDDEN` (403): Course belongs to different organization
- `NOT_FOUND` (404): Course or document not found
- `BAD_REQUEST` (400): Document status is not 'failed' (e.g., 'pending', 'indexed')
- `INTERNAL_SERVER_ERROR` (500): Job enqueue failed or database error

**Rate Limiting**:
- 10 requests per minute (strict limit for retries)
- Prevents abuse of retry functionality
- Applies per user session

**Use Cases**:
1. Retry document processing after fixing corrupted files
2. Re-process documents after Qdrant downtime
3. Retry after embedding API rate limit errors
4. Re-index documents after chunking configuration changes

**Related Operations**:
- `generation.restartFromStage` - Restart entire stage (all documents)
- `jobs.getStatus` - Track retry job progress
- `jobs.cancel` - Cancel retry job if needed

**Best Practices**:
- Always check document status before retry (should be 'failed')
- Monitor job status via `jobs.getStatus` after retry
- Allow at least 30 seconds between retries for same document
- Check Qdrant/embedding service health before retrying
- Review error logs to identify root cause before retrying

---

## Best Practices

### Client Setup

**Recommended client configuration**:
```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@megacampus/course-gen-platform';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',

      // Batch multiple requests
      maxURLLength: 2083,

      // Add authentication headers
      headers() {
        const token = getAccessToken(); // Your token retrieval logic
        return {
          Authorization: token ? `Bearer ${token}` : '',
        };
      },

      // Handle errors globally
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});
```

### Error Handling

**Recommended error handling pattern**:
```typescript
try {
  const result = await client.admin.listOrganizations.query({ limit: 50 });
  // Handle success
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        // Redirect to login or refresh token
        break;
      case 'FORBIDDEN':
        // Show permission denied message
        break;
      case 'NOT_FOUND':
        // Show not found message
        break;
      default:
        // Show generic error message
        console.error('API Error:', error.message);
    }
  }
}
```

### Rate Limiting

Currently, there is **no rate limiting** enforced at the API level. This will be added in future stages.

**Recommended client-side best practices**:
- Batch requests when possible (tRPC supports batching)
- Cache responses on the client
- Implement exponential backoff for retries
- Use pagination for large result sets

### Type Safety

**Leverage tRPC's type inference**:
```typescript
// ✅ Good: Types are automatically inferred
const orgs = await client.admin.listOrganizations.query({ limit: 50 });
// orgs is typed as Array<OrganizationListItem>

// ❌ Bad: Don't manually type responses
const orgs: any = await client.admin.listOrganizations.query({ limit: 50 });
```

---

## Changelog

**v0.4.0** (2025-12-07):
- **NEW**: Document Processing Router (Stage 2) with 1 endpoint
  - `documentProcessing.retryDocument` - Retry failed document processing with Qdrant cleanup
- **ENHANCED**: `generation.restartFromStage` now cleans up Qdrant vectors for Stage 2
- Documented Qdrant vector cleanup behavior (prevents orphaned vectors)
- Added rate limiting documentation for retry operations (10 req/min)
- Documented integration between retry and restart operations

**v0.3.0** (2025-11-04):
- **NEW**: Summarization Router (Stage 3) with 3 endpoints
  - `summarization.start` - Start document summarization job
  - `summarization.getStatus` - Get real-time progress with document counts
  - `summarization.getResult` - Get summarization results with quality metrics
- Documented hierarchical chunking strategy (115K token chunks, 5% overlap)
- Documented adaptive compression workflow (DETAILED → BALANCED → AGGRESSIVE)
- Documented quality validation with semantic similarity (≥0.75 threshold)
- Added cost tracking per document ($0.45-1.00 per 500 docs)
- Added small document bypass (<3K tokens, zero LLM cost)
- Documented summary_metadata structure (compression_ratio, quality_score, cost_usd)

**v0.2.0** (2025-11-01):
- **NEW**: Analysis Router (Stage 4) with 3 endpoints
  - `analysis.start` - Start multi-phase analysis job
  - `analysis.getStatus` - Get real-time progress (0-100%)
  - `analysis.getResult` - Get complete analysis result (JSONB)
- Added tier-based priority system for analysis jobs
- Documented 6-phase analysis workflow with progress ranges
- Added comprehensive AnalysisResult structure documentation

**v0.1.0** (2025-10-16):
- Initial API documentation
- Documented admin, billing, generation, and jobs routers
- Added authentication and authorization sections
- Added file upload constraints per tier
- Added error code reference
