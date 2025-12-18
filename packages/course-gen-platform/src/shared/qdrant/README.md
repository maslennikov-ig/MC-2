# Qdrant Vector Database Client

This module provides a singleton client for interacting with Qdrant Cloud vector database.

## Overview

The Qdrant client is configured to use the REST API for communication with Qdrant Cloud. It provides a simple, typed interface for vector database operations including collection management, vector search, and data operations.

## Configuration

The client requires the following environment variables:

- `QDRANT_URL`: The full URL to your Qdrant Cloud cluster (including port)
- `QDRANT_API_KEY`: Your Qdrant Cloud API key

Example:
```bash
QDRANT_URL=https://b66349de-ad5f-4d43-aa6e-8a2aab53542a.eu-central-1-0.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Usage

### Basic Import

```typescript
import { qdrantClient } from '@/shared/qdrant';
```

### List Collections

```typescript
const result = await qdrantClient.getCollections();
console.log('Collections:', result.collections);
```

### Get Collection Info

```typescript
const info = await qdrantClient.getCollection('course-embeddings');
console.log('Collection info:', info);
```

### Direct API Access

For more advanced operations, you can access the raw API:

```typescript
await qdrantClient.api('collections').getCollections();
```

## Error Handling

The client throws descriptive errors if environment variables are missing:

```typescript
try {
  const { qdrantClient } = await import('@/shared/qdrant');
  // Use client...
} catch (error) {
  if (error.message.includes('Missing required Qdrant environment variables')) {
    console.error('Qdrant is not configured properly');
  }
}
```

For API errors, use the typed error handling pattern:

```typescript
try {
  const collection = await qdrantClient.getCollection('my-collection');
} catch (e) {
  if (e instanceof qdrantClient.getCollection.Error) {
    const error = e.getActualType();
    if (error.status === 404) {
      console.error('Collection not found');
    } else if (error.status === 500) {
      console.error('Server error:', error.data);
    }
  }
}
```

## Architecture

- **Singleton Pattern**: The client is instantiated once and reused across the application
- **REST API**: Uses REST for simplicity and broad compatibility
- **Type Safety**: Full TypeScript support with types from `@qdrant/js-client-rest`
- **Environment-based Config**: Configuration is managed through environment variables

## Next Steps

After setting up the client:

1. Create collections with appropriate schemas (see T073)
2. Configure embedding pipelines (see T074)
3. Implement vector search functionality

## Resources

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Qdrant JS Client GitHub](https://github.com/qdrant/qdrant-js)
- [Qdrant Cloud Console](https://cloud.qdrant.io/)
