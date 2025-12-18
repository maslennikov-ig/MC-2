# Usage Examples

This document provides practical examples for using the @megacampus/trpc-client-sdk.

## Table of Contents

- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Authentication](#authentication)
- [API Operations](#api-operations)
- [Error Handling](#error-handling)
- [React Integration](#react-integration)
- [Node.js Usage](#nodejs-usage)

## Installation

```bash
npm install @megacampus/trpc-client-sdk @trpc/client
```

For TypeScript projects, also install the server package as a dev dependency for full type inference:

```bash
npm install -D @megacampus/course-gen-platform
```

## Basic Setup

### Minimal Example

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

const client = createMegaCampusClient({
  url: 'https://api.megacampus.ai/trpc',
  token: 'your-jwt-token',
});

// Test the connection
const result = await client.generation.test.query({ message: 'Hello' });
console.log(result);
```

### With Full Type Safety

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

const client = createMegaCampusClient<AppRouter>({
  url: process.env.NEXT_PUBLIC_API_URL!,
  token: session.access_token,
});
```

## Authentication

### With Supabase Auth

```typescript
import { createClient } from '@supabase/supabase-js';
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Get current session
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  throw new Error('Not authenticated');
}

// Create authenticated client
const client = createMegaCampusClient({
  url: process.env.NEXT_PUBLIC_API_URL!,
  token: session.access_token,
});
```

### Custom Headers

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

const client = createMegaCampusClient({
  url: 'https://api.megacampus.ai/trpc',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Organization-ID': organizationId,
    'X-Client-Version': '1.0.0',
  },
});
```

## API Operations

### Generation Router

#### Test Endpoint (Public)

```typescript
// No authentication required
const health = await client.generation.test.query({
  message: 'Checking server status',
});

console.log(health.message); // "tRPC server is operational"
console.log(health.timestamp); // "2025-10-16T..."
console.log(health.echo); // "Checking server status"
```

#### Initiate Course Generation

```typescript
// Requires instructor or admin role
const job = await client.generation.initiate.mutate({
  courseId: 'uuid-of-course',
  settings: {
    enableAI: true,
    level: 'intermediate',
    maxSections: 15,
    metadata: {
      customKey: 'customValue',
    },
  },
});

console.log(`Job ${job.jobId} started with status: ${job.status}`);
```

#### Upload File

```typescript
// Convert file to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:...,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload the file
const fileContent = await fileToBase64(file);

const upload = await client.generation.uploadFile.mutate({
  courseId: 'uuid-of-course',
  filename: file.name,
  fileSize: file.size,
  mimeType: file.type,
  fileContent,
});

console.log(`File uploaded: ${upload.fileId}`);
console.log(`Storage path: ${upload.storagePath}`);
```

### Jobs Router

#### Get Job Status

```typescript
const status = await client.jobs.getStatus.query({
  jobId: 'job-id-here',
});

console.log(`Job ${status.job_id} is ${status.status}`);
if (status.cancelled) {
  console.log(`Cancelled at ${status.cancelled_at} by ${status.cancelled_by}`);
}
```

#### List Jobs

```typescript
const jobs = await client.jobs.list.query({
  status: 'active',
  cancelled: false,
  limit: 50,
  offset: 0,
});

console.log(`Total jobs: ${jobs.total}`);
jobs.jobs.forEach(job => {
  console.log(`- ${job.job_id}: ${job.status}`);
});
```

#### Cancel Job

```typescript
const result = await client.jobs.cancel.mutate({
  jobId: 'job-id-to-cancel',
});

console.log(result.message);
```

### Billing Router

#### Get Usage

```typescript
const usage = await client.billing.getUsage.query();

console.log(`Storage: ${usage.storageUsedFormatted} / ${usage.storageQuotaFormatted}`);
console.log(`Usage: ${usage.usagePercentage}%`);
console.log(`Files: ${usage.fileCount}`);
console.log(`Tier: ${usage.tier}`);

// Check if approaching limit
if (usage.usagePercentage > 90) {
  console.warn('Storage quota almost full!');
}
```

#### Get Quota Information

```typescript
const quota = await client.billing.getQuota.query();

console.log(`Current Tier: ${quota.tierDisplayName}`);
console.log(`Storage Quota: ${quota.storageQuotaFormatted}`);
console.log(`File Limit: ${quota.fileCountLimitDisplay}`);

if (quota.canUpgrade) {
  console.log(`Upgrade Available: ${quota.upgradePrompt}`);
  console.log(`Next Tier: ${quota.nextTier}`);
}
```

### Admin Router (Admin Role Required)

#### List Organizations

```typescript
const orgs = await client.admin.listOrganizations.query({
  limit: 100,
  offset: 0,
});

orgs.forEach(org => {
  console.log(`${org.name} (${org.tier}): ${org.storageUsedPercentage}% used`);
});
```

#### List Users

```typescript
// All users
const allUsers = await client.admin.listUsers.query({
  limit: 100,
});

// Filter by organization
const orgUsers = await client.admin.listUsers.query({
  organizationId: 'org-uuid',
  limit: 50,
});

// Filter by role
const instructors = await client.admin.listUsers.query({
  role: 'instructor',
  limit: 50,
});
```

#### List Courses

```typescript
// All published courses
const published = await client.admin.listCourses.query({
  status: 'published',
  limit: 100,
});

// Courses for specific organization
const orgCourses = await client.admin.listCourses.query({
  organizationId: 'org-uuid',
  limit: 50,
});
```

## Error Handling

### Basic Error Handling

```typescript
import {
  getErrorMessage,
  getErrorCode,
} from '@megacampus/trpc-client-sdk';

try {
  await client.generation.uploadFile.mutate({ ... });
} catch (error) {
  console.error(`Error: ${getErrorMessage(error)}`);
  console.error(`Code: ${getErrorCode(error)}`);
}
```

### Type Guards

```typescript
import {
  isAuthError,
  isPermissionError,
  isValidationError,
  isNotFoundError,
  getErrorMessage,
} from '@megacampus/trpc-client-sdk';

try {
  await client.admin.listUsers.query({ limit: 50 });
} catch (error) {
  if (isAuthError(error)) {
    // Redirect to login
    window.location.href = '/login';
  } else if (isPermissionError(error)) {
    alert('You do not have permission to perform this action');
  } else if (isValidationError(error)) {
    alert(`Validation error: ${getErrorMessage(error)}`);
  } else if (isNotFoundError(error)) {
    alert('Resource not found');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Complete Error Handler

```typescript
import {
  isTRPCError,
  getErrorCode,
  getErrorMessage,
  isAuthError,
  isPermissionError,
  isValidationError,
} from '@megacampus/trpc-client-sdk';

async function handleApiCall<T>(
  apiCall: () => Promise<T>,
  options?: {
    onAuth?: () => void;
    onPermission?: () => void;
    onValidation?: (message: string) => void;
    onError?: (error: unknown) => void;
  }
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    if (isAuthError(error)) {
      options?.onAuth?.();
      return null;
    }

    if (isPermissionError(error)) {
      options?.onPermission?.();
      return null;
    }

    if (isValidationError(error)) {
      options?.onValidation?.(getErrorMessage(error));
      return null;
    }

    if (isTRPCError(error)) {
      console.error(`API Error [${getErrorCode(error)}]: ${getErrorMessage(error)}`);
    }

    options?.onError?.(error);
    return null;
  }
}

// Usage
const usage = await handleApiCall(
  () => client.billing.getUsage.query(),
  {
    onAuth: () => router.push('/login'),
    onPermission: () => toast.error('Access denied'),
    onValidation: (msg) => toast.error(msg),
    onError: (err) => console.error('Unexpected error:', err),
  }
);
```

## React Integration

### Custom Hook

```typescript
import { useMemo } from 'react';
import { useSession } from '@/hooks/useSession';
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

export function useMegaCampusClient() {
  const { session } = useSession();

  const client = useMemo(() => {
    return createMegaCampusClient<AppRouter>({
      url: process.env.NEXT_PUBLIC_API_URL!,
      token: session?.access_token,
      debug: process.env.NODE_ENV === 'development',
    });
  }, [session?.access_token]);

  return client;
}
```

### Using in Components

```typescript
import { useState, useEffect } from 'react';
import { useMegaCampusClient } from '@/hooks/useMegaCampusClient';
import { getErrorMessage } from '@megacampus/trpc-client-sdk';

function UsageDisplay() {
  const client = useMegaCampusClient();
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.billing.getUsage.query()
      .then(setUsage)
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [client]);

  if (loading) return <Spinner />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!usage) return null;

  return (
    <div>
      <h2>Storage Usage</h2>
      <p>{usage.storageUsedFormatted} / {usage.storageQuotaFormatted}</p>
      <ProgressBar value={usage.usagePercentage} />
    </div>
  );
}
```

### File Upload Component

```typescript
import { useState } from 'react';
import { useMegaCampusClient } from '@/hooks/useMegaCampusClient';
import { getErrorMessage, isValidationError } from '@megacampus/trpc-client-sdk';

function FileUploader({ courseId }: { courseId: string }) {
  const client = useMegaCampusClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload
      const result = await client.generation.uploadFile.mutate({
        courseId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileContent: base64,
      });

      alert(`File uploaded successfully: ${result.fileId}`);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);

      if (isValidationError(err)) {
        // Show validation-specific UI
        console.log('Validation error:', message);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        disabled={uploading}
      />
      {uploading && <Spinner />}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
```

## Node.js Usage

### Server-Side Script

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

const client = createMegaCampusClient<AppRouter>({
  url: process.env.MEGACAMPUS_API_URL!,
  token: process.env.MEGACAMPUS_SERVICE_KEY!,
  timeout: 120000, // 2 minutes for long operations
});

async function syncOrganizations() {
  const orgs = await client.admin.listOrganizations.query({
    limit: 100,
  });

  for (const org of orgs) {
    console.log(`Processing ${org.name}...`);

    // Get storage metrics
    const usagePercent = org.storageUsedPercentage;

    if (usagePercent > 90) {
      console.warn(`⚠️  ${org.name} is at ${usagePercent}% capacity`);
    }
  }
}

syncOrganizations().catch(console.error);
```

### Batch Operations

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

const client = createMegaCampusClient({
  url: process.env.API_URL!,
  token: process.env.SERVICE_TOKEN!,
  batch: true, // Enable batching for performance
});

async function getBatchData() {
  // These three requests will be batched into a single HTTP call
  const [usage, quota, jobs] = await Promise.all([
    client.billing.getUsage.query(),
    client.billing.getQuota.query(),
    client.jobs.list.query({ limit: 10 }),
  ]);

  console.log('Usage:', usage);
  console.log('Quota:', quota);
  console.log('Jobs:', jobs.total);
}

getBatchData().catch(console.error);
```

### CLI Tool

```typescript
#!/usr/bin/env node
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import { Command } from 'commander';

const program = new Command();

program
  .name('megacampus')
  .description('MegaCampus API CLI')
  .version('1.0.0');

program
  .command('status')
  .description('Check API status')
  .action(async () => {
    const client = createMegaCampusClient({
      url: process.env.MEGACAMPUS_API_URL!,
      token: process.env.MEGACAMPUS_TOKEN!,
    });

    const result = await client.generation.test.query({
      message: 'CLI health check',
    });

    console.log('✓ API is operational');
    console.log(`Server time: ${result.timestamp}`);
  });

program
  .command('usage')
  .description('Show storage usage')
  .action(async () => {
    const client = createMegaCampusClient({
      url: process.env.MEGACAMPUS_API_URL!,
      token: process.env.MEGACAMPUS_TOKEN!,
    });

    const usage = await client.billing.getUsage.query();

    console.log(`Storage: ${usage.storageUsedFormatted} / ${usage.storageQuotaFormatted}`);
    console.log(`Usage: ${usage.usagePercentage}%`);
    console.log(`Files: ${usage.fileCount}`);
  });

program.parse();
```

## TypeScript Tips

### Inferring Types

```typescript
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';

// Infer output types
type RouterOutput = inferRouterOutputs<AppRouter>;
type UsageOutput = RouterOutput['billing']['getUsage'];

// Infer input types
type RouterInput = inferRouterInputs<AppRouter>;
type UploadInput = RouterInput['generation']['uploadFile'];

// Use in your code
function displayUsage(usage: UsageOutput) {
  console.log(`${usage.storageUsedFormatted} used`);
}

function validateUpload(input: UploadInput): boolean {
  return input.fileSize < 100 * 1024 * 1024; // 100MB
}
```

### Creating Type-Safe Wrappers

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

class MegaCampusAPI {
  private client: ReturnType<typeof createMegaCampusClient<AppRouter>>;

  constructor(token: string) {
    this.client = createMegaCampusClient<AppRouter>({
      url: process.env.API_URL!,
      token,
    });
  }

  async getStorageUsage() {
    return this.client.billing.getUsage.query();
  }

  async uploadFile(courseId: string, file: File) {
    const base64 = await this.fileToBase64(file);
    return this.client.generation.uploadFile.mutate({
      courseId,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileContent: base64,
    });
  }

  private async fileToBase64(file: File): Promise<string> {
    // Implementation...
    return '';
  }
}
```
