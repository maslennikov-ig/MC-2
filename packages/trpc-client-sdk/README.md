# @megacampus/trpc-client-sdk

Official TypeScript client SDK for the MegaCampusAI tRPC API.

This package provides a fully type-safe, production-ready client for consuming the MegaCampusAI API with comprehensive authentication, error handling, and TypeScript support.

## Features

- **Full Type Safety**: Leverages tRPC for complete end-to-end type safety
- **JWT Authentication**: Built-in support for Supabase Auth JWT tokens
- **Request Batching**: Automatic batching of multiple requests for performance
- **Error Handling**: Comprehensive error utilities with type guards
- **TypeScript First**: Written in TypeScript with extensive JSDoc documentation
- **Zero Configuration**: Works out of the box with sensible defaults
- **Framework Agnostic**: Use with React, Vue, Node.js, or any JavaScript environment

## Installation

```bash
npm install @megacampus/trpc-client-sdk @trpc/client
# or
yarn add @megacampus/trpc-client-sdk @trpc/client
# or
pnpm add @megacampus/trpc-client-sdk @trpc/client
```

## Quick Start

### Basic Usage

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

// Create client with authentication
const client = createMegaCampusClient({
  url: 'https://api.megacampus.ai/trpc',
  token: 'your-jwt-token',
});

// Make type-safe API calls
const result = await client.generation.test.query({ message: 'Hello' });
console.log(result);
// { message: 'tRPC server is operational', timestamp: '...', echo: 'Hello' }
```

### With TypeScript (Recommended)

For full type inference, import the `AppRouter` type from the server package:

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

const client = createMegaCampusClient<AppRouter>({
  url: process.env.NEXT_PUBLIC_API_URL,
  token: session.access_token,
});

// Now TypeScript knows all available procedures and their types!
const usage = await client.billing.getUsage.query();
//    ^? { storageUsedBytes: number, storageQuotaBytes: number, ... }
```

## Configuration

### Client Options

```typescript
interface MegaCampusClientConfig {
  url: string;              // API endpoint URL (required)
  token?: string;           // JWT authentication token
  headers?: Record<string, string>; // Custom headers
  batch?: boolean;          // Enable request batching (default: true)
  batchInterval?: number;   // Batch wait time in ms (default: 10)
  timeout?: number;         // Request timeout in ms (default: 30000)
  debug?: boolean;          // Enable debug logging (default: false)
}
```

### Examples

#### Development Configuration

```typescript
const client = createMegaCampusClient({
  url: 'http://localhost:3000/trpc',
  token: authToken,
  debug: true, // Enable detailed logging
});
```

#### Production Configuration

```typescript
const client = createMegaCampusClient({
  url: process.env.API_URL,
  token: getAuthToken(),
  timeout: 60000, // 60 second timeout for large uploads
  batch: true,    // Enable batching for performance
});
```

#### Custom Headers

```typescript
const client = createMegaCampusClient({
  url: 'https://api.megacampus.ai/trpc',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Organization-ID': organizationId,
    'X-Request-ID': uuid(),
  },
});
```

## API Reference

The SDK provides access to four main routers:

### 1. Generation Router

Course generation workflow operations.

```typescript
// Test endpoint (public, no auth required)
const health = await client.generation.test.query({
  message: 'Hello API',
});

// Initiate course generation (instructor/admin only)
const job = await client.generation.initiate.mutate({
  courseId: 'uuid-here',
  settings: {
    enableAI: true,
    level: 'intermediate',
    maxSections: 10,
  },
});

// Upload file for course generation (instructor/admin only)
const upload = await client.generation.uploadFile.mutate({
  courseId: 'uuid-here',
  filename: 'syllabus.pdf',
  fileSize: 1024000,
  mimeType: 'application/pdf',
  fileContent: base64EncodedContent,
});
```

### 2. Jobs Router

Job management and monitoring operations.

```typescript
// Get job status
const status = await client.jobs.getStatus.query({
  jobId: 'job-id-here',
});

// Cancel a job
const result = await client.jobs.cancel.mutate({
  jobId: 'job-id-here',
});

// List jobs with filters
const jobs = await client.jobs.list.query({
  status: 'active',
  cancelled: false,
  limit: 50,
  offset: 0,
});
```

### 3. Admin Router

Administrative operations (admin role required).

```typescript
// List all organizations
const orgs = await client.admin.listOrganizations.query({
  limit: 100,
  offset: 0,
});

// List all users with filters
const users = await client.admin.listUsers.query({
  organizationId: 'org-uuid',
  role: 'instructor',
  limit: 50,
});

// List all courses
const courses = await client.admin.listCourses.query({
  organizationId: 'org-uuid',
  status: 'published',
  limit: 50,
});
```

### 4. Billing Router

Billing and usage tracking operations.

```typescript
// Get storage usage for current organization
const usage = await client.billing.getUsage.query();
console.log(`Using ${usage.storageUsedFormatted} of ${usage.storageQuotaFormatted}`);
console.log(`${usage.usagePercentage}% used`);

// Get tier quota information
const quota = await client.billing.getQuota.query();
console.log(`Current tier: ${quota.tierDisplayName}`);
console.log(`File limit: ${quota.fileCountLimitDisplay}`);
if (quota.canUpgrade) {
  console.log(`Upgrade option: ${quota.upgradePrompt}`);
}
```

## Error Handling

The SDK provides comprehensive error handling utilities:

### Basic Error Handling

```typescript
import {
  getErrorMessage,
  getErrorCode,
  isAuthError,
  isPermissionError,
  isValidationError,
} from '@megacampus/trpc-client-sdk';

try {
  await client.generation.uploadFile.mutate({ ... });
} catch (error) {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  console.error(`Error [${code}]: ${message}`);
}
```

### Type-Safe Error Guards

```typescript
try {
  await client.billing.getUsage.query();
} catch (error) {
  if (isAuthError(error)) {
    // Redirect to login
    router.push('/login');
  } else if (isPermissionError(error)) {
    // Show permission denied message
    toast.error('You do not have permission to access this resource');
  } else if (isValidationError(error)) {
    // Show validation errors
    setFormErrors(getErrorMessage(error));
  } else {
    // Handle other errors
    console.error('Unexpected error:', error);
  }
}
```

### React Error Handling Example

```typescript
import { useState } from 'react';
import { getErrorMessage, isAuthError } from '@megacampus/trpc-client-sdk';

function UploadForm() {
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    try {
      setError(null);

      const result = await client.generation.uploadFile.mutate({
        courseId: courseId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileContent: await fileToBase64(file),
      });

      toast.success('File uploaded successfully!');
    } catch (err) {
      if (isAuthError(err)) {
        router.push('/login');
      } else {
        setError(getErrorMessage(err));
      }
    }
  };

  return (
    <div>
      {error && <Alert variant="error">{error}</Alert>}
      {/* Upload form UI */}
    </div>
  );
}
```

## Authentication

### Using Supabase Auth

```typescript
import { createClient } from '@supabase/supabase-js';
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Get session
const { data: { session } } = await supabase.auth.getSession();

// Create authenticated client
const client = createMegaCampusClient({
  url: process.env.NEXT_PUBLIC_API_URL,
  token: session?.access_token,
});
```

### Dynamic Token Updates

```typescript
class ApiClient {
  private getToken: () => Promise<string>;

  constructor(getToken: () => Promise<string>) {
    this.getToken = getToken;
  }

  async getClient() {
    const token = await this.getToken();
    return createMegaCampusClient({
      url: process.env.API_URL,
      token,
    });
  }
}

// Usage
const apiClient = new ApiClient(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session.access_token;
});

const client = await apiClient.getClient();
const usage = await client.billing.getUsage.query();
```

## React Integration

### React Hook Example

```typescript
import { useMemo } from 'react';
import { useSession } from '@/hooks/useSession';
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

export function useTRPCClient() {
  const { session } = useSession();

  const client = useMemo(() => {
    return createMegaCampusClient<AppRouter>({
      url: process.env.NEXT_PUBLIC_API_URL!,
      token: session?.access_token,
    });
  }, [session?.access_token]);

  return client;
}

// Usage in components
function MyComponent() {
  const client = useTRPCClient();
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    client.billing.getUsage.query()
      .then(setUsage)
      .catch(console.error);
  }, [client]);

  return <div>{usage?.storageUsedFormatted}</div>;
}
```

### React Query Integration

For optimal React integration with caching and automatic refetching, use `@trpc/react-query`:

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

export const trpc = createTRPCReact<AppRouter>();

// Then use in components
function UsageDisplay() {
  const { data: usage, isLoading } = trpc.billing.getUsage.useQuery();

  if (isLoading) return <Spinner />;

  return (
    <div>
      <p>Storage Used: {usage?.storageUsedFormatted}</p>
      <p>Quota: {usage?.storageQuotaFormatted}</p>
    </div>
  );
}
```

## Node.js Usage

### Server-Side Example

```typescript
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

// Service role token for server-side operations
const serviceClient = createMegaCampusClient<AppRouter>({
  url: process.env.MEGACAMPUS_API_URL,
  token: process.env.MEGACAMPUS_SERVICE_KEY,
  timeout: 60000,
});

// Batch operations
async function syncOrganizations() {
  const orgs = await serviceClient.admin.listOrganizations.query({
    limit: 100,
  });

  for (const org of orgs) {
    console.log(`Syncing organization: ${org.name}`);
    // Process each organization
  }
}
```

### CLI Tool Example

```typescript
#!/usr/bin/env node
import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
import { Command } from 'commander';

const program = new Command();

program
  .name('megacampus-cli')
  .description('MegaCampus API CLI tool')
  .version('1.0.0');

program
  .command('list-jobs')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <limit>', 'Number of results', '50')
  .action(async (options) => {
    const client = createMegaCampusClient({
      url: process.env.MEGACAMPUS_API_URL!,
      token: process.env.MEGACAMPUS_TOKEN!,
    });

    const jobs = await client.jobs.list.query({
      status: options.status,
      limit: parseInt(options.limit),
    });

    console.table(jobs.jobs);
  });

program.parse();
```

## Type Safety

### Full Type Inference

```typescript
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';

const client = createMegaCampusClient<AppRouter>({ ... });

// TypeScript knows the exact return type
const usage = await client.billing.getUsage.query();
//    ^? {
//         storageUsedBytes: number;
//         storageQuotaBytes: number;
//         storageUsedFormatted: string;
//         ...
//       }

// TypeScript validates input parameters
await client.generation.initiate.mutate({
  courseId: 'valid-uuid',
  settings: {
    level: 'advanced', // ✓ Valid enum value
    // level: 'expert',  // ✗ TypeScript error: invalid enum
  },
});
```

### Inferring Types

```typescript
import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';

// Infer output types
type RouterOutput = inferRouterOutputs<AppRouter>;
type UsageOutput = RouterOutput['billing']['getUsage'];

// Infer input types
type RouterInput = inferRouterInputs<AppRouter>;
type UploadFileInput = RouterInput['generation']['uploadFile'];

// Use in your code
function displayUsage(usage: UsageOutput) {
  console.log(`Using ${usage.storageUsedFormatted}`);
}
```

## Performance Tips

### Request Batching

By default, the SDK batches multiple simultaneous requests into a single HTTP call:

```typescript
// These three queries will be batched into one HTTP request
const [usage, quota, jobs] = await Promise.all([
  client.billing.getUsage.query(),
  client.billing.getQuota.query(),
  client.jobs.list.query({ limit: 10 }),
]);
```

### Disable Batching for Real-Time Updates

```typescript
// For WebSocket-like behavior or real-time updates
const realtimeClient = createMegaCampusClient({
  url: process.env.API_URL,
  token: authToken,
  batch: false, // Disable batching
});
```

### Caching with React Query

Use `@trpc/react-query` for automatic caching and refetching:

```typescript
const { data } = trpc.billing.getUsage.useQuery(undefined, {
  staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  refetchOnWindowFocus: false,
});
```

## Troubleshooting

### Common Issues

#### 401 Unauthorized

```typescript
// Check if token is valid and not expired
const client = createMegaCampusClient({
  url: API_URL,
  token: yourToken,
  debug: true, // Enable debug logging
});
```

#### 403 Forbidden

Ensure your user has the correct role for the endpoint:
- Admin endpoints require `role: 'admin'`
- Instructor endpoints require `role: 'instructor'` or `'admin'`
- Protected endpoints require authentication

#### Network Errors

```typescript
// Increase timeout for slow networks or large uploads
const client = createMegaCampusClient({
  url: API_URL,
  token: authToken,
  timeout: 120000, // 2 minutes
});
```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
const client = createMegaCampusClient({
  url: API_URL,
  token: authToken,
  debug: true, // Logs all requests and errors
});
```

## API Endpoints

### Available Routers

| Router | Endpoints | Auth Required | Description |
|--------|-----------|---------------|-------------|
| `generation` | test, initiate, uploadFile | Partial | Course generation operations |
| `jobs` | cancel, getStatus, list | Yes | Job management |
| `admin` | listOrganizations, listUsers, listCourses | Admin only | Administrative operations |
| `billing` | getUsage, getQuota | Yes | Usage and billing info |

### Authorization Matrix

| Endpoint | Public | Student | Instructor | Admin |
|----------|--------|---------|------------|-------|
| generation.test | ✓ | ✓ | ✓ | ✓ |
| generation.initiate | ✗ | ✗ | ✓ | ✓ |
| generation.uploadFile | ✗ | ✗ | ✓ | ✓ |
| jobs.* | ✗ | Own jobs | Org jobs | Org jobs |
| admin.* | ✗ | ✗ | ✗ | ✓ |
| billing.* | ✗ | ✓ | ✓ | ✓ |

## Contributing

This SDK is part of the MegaCampusAI monorepo. For contributions, please see the main repository.

## License

Proprietary - MegaCampusAI

## Support

For issues or questions:
- GitHub Issues: https://github.com/megacampus/megacampus2/issues
- Documentation: https://docs.megacampus.ai
- Email: support@megacampus.ai

---

**Version**: 0.3.0
**Last Updated**: October 2025
**Maintained by**: MegaCampusAI Team
