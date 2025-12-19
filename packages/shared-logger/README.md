# @megacampus/shared-logger

Centralized structured logging for the MegaCampus monorepo using [Pino](https://getpino.io/) with [Axiom](https://axiom.co/) integration.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Basic Logging](#basic-logging)
  - [Module Logger](#module-logger)
  - [Request Logger](#request-logger)
  - [Child Logger](#child-logger)
- [Environment Variables](#environment-variables)
- [Transports](#transports)
  - [Development](#development)
  - [Production](#production)
- [Axiom Setup](#axiom-setup)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

## Features

- **Structured JSON Logging** - Consistent, machine-parseable log output with Pino
- **Axiom Integration** - Cloud log aggregation and analysis for production environments
- **Pretty Development Output** - Human-readable colorized logs with pino-pretty
- **Factory Functions** - Create contextual loggers for modules, requests, and custom contexts
- **Context Propagation** - Automatic inclusion of service, environment, and version metadata
- **TypeScript Support** - Full type definitions for all exports

## Installation

Add the package as a workspace dependency in your `package.json`:

```json
{
  "dependencies": {
    "@megacampus/shared-logger": "workspace:*"
  }
}
```

Then install dependencies:

```bash
pnpm install
```

## Quick Start

```typescript
import logger from '@megacampus/shared-logger';

// Log messages at different levels
logger.info('Application started');
logger.error({ err: new Error('Connection failed') }, 'Database error');
```

## Usage

### Basic Logging

Import the default logger instance for simple logging needs:

```typescript
import logger from '@megacampus/shared-logger';

// Info level (default)
logger.info('User logged in');

// With structured data
logger.info({ userId: '123', action: 'login' }, 'User authentication successful');

// Warning level
logger.warn({ threshold: 80, current: 85 }, 'Memory usage high');

// Error level with error object
logger.error({ err: error }, 'Failed to process request');

// Debug level (requires LOG_LEVEL=debug)
logger.debug({ payload: data }, 'Processing webhook payload');
```

### Module Logger

Create a logger scoped to a specific module or service component:

```typescript
import { createModuleLogger } from '@megacampus/shared-logger';

const log = createModuleLogger('course-generator');

log.info('Starting course generation');
log.error({ courseId: 'abc123' }, 'Generation failed');

// Output includes: { "module": "course-generator", ... }
```

**Use cases:**
- Service modules (authentication, payments, notifications)
- Background workers (queue processors, scheduled tasks)
- API route handlers

### Request Logger

Create a logger with HTTP request correlation:

```typescript
import { createRequestLogger } from '@megacampus/shared-logger';

// In an API handler or middleware
function handleRequest(req: Request) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const userId = getCurrentUserId(req);

  const log = createRequestLogger(requestId, userId);

  log.info({ method: req.method, path: req.url }, 'Request received');

  // ... handle request

  log.info({ status: 200, duration: 45 }, 'Request completed');
}

// Output includes: { "requestId": "abc-123", "userId": "user-456", ... }
```

**Use cases:**
- HTTP request handlers
- GraphQL resolvers
- tRPC procedures
- WebSocket message handlers

### Child Logger

Create a logger with custom context for complex operations:

```typescript
import { createChildLogger } from '@megacampus/shared-logger';

// For course generation pipeline
const log = createChildLogger({
  module: 'stage-4-analysis',
  courseId: 'course-abc',
  jobId: 'job-xyz',
  stageNumber: 4,
});

log.info('Starting analysis phase');
log.debug({ phaseId: 'expert-review' }, 'Phase completed');

// Output includes all context fields in every log entry
```

**Available context fields:**
- `module` - Module or component name
- `requestId` - HTTP request correlation ID
- `userId` - Current user identifier
- `courseId` - Course being processed
- `jobId` - Background job identifier
- `stageNumber` - Pipeline stage number
- `[key: string]` - Any additional custom fields

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Minimum log level to output | `info` | No |
| `NODE_ENV` | Environment name (development/production) | `development` | No |
| `SERVICE_NAME` | Service identifier in log metadata | `megacampus` | No |
| `APP_VERSION` | Application version in log metadata | `0.0.0` | No |
| `AXIOM_TOKEN` | Axiom API token for log ingestion | - | Production |
| `AXIOM_DATASET` | Axiom dataset name | - | Production |

**Log Levels (in order of severity):**
- `fatal` - Application crash
- `error` - Error conditions
- `warn` - Warning conditions
- `info` - Informational messages (default)
- `debug` - Debug information
- `trace` - Fine-grained debug information

## Transports

### Development

When `NODE_ENV !== 'production'`, logs are formatted with `pino-pretty`:

```
[14:32:15.123] INFO (megacampus): User logged in
    userId: "user-123"
    action: "login"
```

Features:
- Colorized output
- Human-readable timestamps (`SYS:standard` format)
- Excluded fields: `pid`, `hostname`

### Production

When `NODE_ENV === 'production'`, logs are sent to multiple destinations:

1. **Axiom** (if configured) - Cloud log aggregation at `info` level and above
2. **stdout** - Container logs for orchestration platforms (Docker, Kubernetes)

Log output is JSON format:

```json
{
  "level": 30,
  "time": 1703001135123,
  "service": "megacampus",
  "environment": "production",
  "version": "1.2.3",
  "module": "auth",
  "msg": "User logged in",
  "userId": "user-123"
}
```

## Axiom Setup

[Axiom](https://axiom.co/) provides cloud-based log aggregation, search, and analytics.

### 1. Create an Axiom Account

Sign up at [axiom.co](https://axiom.co/) (free tier available).

### 2. Create a Dataset

1. Navigate to **Datasets** in the Axiom dashboard
2. Click **New Dataset**
3. Name it (e.g., `megacampus-logs` or `megacampus-production`)
4. Select retention period

### 3. Generate an API Token

1. Navigate to **Settings** > **API Tokens**
2. Click **New API Token**
3. Name it (e.g., `megacampus-ingest`)
4. Select **Ingest** permission for your dataset
5. Copy the generated token

### 4. Configure Environment Variables

Add to your `.env` or deployment configuration:

```bash
AXIOM_TOKEN=xaat-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AXIOM_DATASET=megacampus-production
```

### 5. Verify Integration

Deploy your application and check the Axiom dashboard for incoming logs.

## API Reference

### Default Export

```typescript
import logger from '@megacampus/shared-logger';
```

The root Pino logger instance with base configuration.

### Named Exports

#### `logger`

```typescript
import { logger } from '@megacampus/shared-logger';
```

Same as default export - the root logger instance.

#### `createModuleLogger(module: string): Logger`

Creates a child logger with a `module` field.

```typescript
const log = createModuleLogger('auth');
```

#### `createRequestLogger(requestId: string, userId?: string): Logger`

Creates a child logger with `requestId` and optional `userId` fields.

```typescript
const log = createRequestLogger('req-123', 'user-456');
```

#### `createChildLogger(context: ChildLoggerContext): Logger`

Creates a child logger with arbitrary context fields.

```typescript
const log = createChildLogger({
  module: 'pipeline',
  jobId: 'job-123',
  customField: 'value',
});
```

### Type Exports

```typescript
import type { Logger, ChildLoggerContext, LoggerOptions } from '@megacampus/shared-logger';
```

- `Logger` - Pino Logger type (re-exported from `pino`)
- `ChildLoggerContext` - Interface for child logger context fields
- `LoggerOptions` - Interface for logger configuration options

## Best Practices

### 1. Use Contextual Loggers

Prefer factory functions over the root logger for better log correlation:

```typescript
// Good - contextual logging
const log = createModuleLogger('payment-service');
log.info({ orderId }, 'Processing payment');

// Avoid - root logger without context
logger.info('Processing payment');
```

### 2. Include Structured Data

Add relevant data as the first argument for searchability:

```typescript
// Good - structured data
log.error({ userId, orderId, amount, err }, 'Payment failed');

// Avoid - data in message string
log.error(`Payment failed for user ${userId} order ${orderId}`);
```

### 3. Use Appropriate Log Levels

- `error` - Failures requiring attention
- `warn` - Potential issues, degraded performance
- `info` - Business events, state changes
- `debug` - Development troubleshooting

### 4. Include Error Objects

Pass errors using the `err` key for proper serialization:

```typescript
try {
  await processOrder(order);
} catch (error) {
  log.error({ err: error, orderId: order.id }, 'Order processing failed');
  throw error;
}
```

### 5. PII Redaction (Automatic)

The logger automatically redacts sensitive fields to prevent PII exposure:

**Redacted fields:**
- `password`, `token`, `apiKey`, `api_key`, `secret`
- `access_token`, `refresh_token`, `accessToken`, `refreshToken`
- Nested variants: `*.password`, `*.token`, `*.apiKey`, `*.secret`
- Headers: `req.headers.authorization`, `req.headers.cookie`

```typescript
// Safe - password will be automatically redacted
log.info({ userId: user.id, password: user.password }, 'User created');
// Output: { userId: "123", password: "[REDACTED]", msg: "User created" }

// Still recommended - avoid logging PII when possible
log.info({ userId: user.id }, 'User created');
```

## License

Private - MegaCampus internal use only.
