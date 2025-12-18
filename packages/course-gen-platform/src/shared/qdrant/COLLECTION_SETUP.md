# Qdrant Collection Setup Documentation

## Overview

This document describes the `course_embeddings` collection setup for MegaCampusAI's RAG (Retrieval-Augmented Generation) infrastructure.

## Collection Details

### Basic Configuration

- **Collection Name**: `course_embeddings`
- **Vector Size**: 768 dimensions (Jina-v3 embedding model)
- **Distance Metric**: Cosine similarity
- **Purpose**: Store and search course content embeddings for semantic retrieval

### HNSW Index Configuration

The collection uses Hierarchical Navigable Small World (HNSW) algorithm for efficient approximate nearest neighbor search.

```typescript
{
  m: 16,              // Bi-directional links per node
  ef_construct: 100   // Construction-time search depth
}
```

**Parameter Rationale**:
- `m=16`: Balanced trade-off between accuracy and memory usage
  - Lower values (4-8): Less memory, faster indexing, lower accuracy
  - Higher values (32-64): More memory, slower indexing, higher accuracy
  - 16 is the recommended default for most production use cases

- `ef_construct=100`: Controls index quality during construction
  - Higher values result in better quality index but slower build time
  - 100 provides good balance for most workloads
  - Can be increased to 200+ for maximum accuracy if needed

### Optimizer Configuration

```typescript
{
  indexing_threshold: 20000  // Start HNSW indexing after 20K vectors
}
```

**Rationale**:
- Below 20K vectors, linear scan is often faster than HNSW
- After 20K vectors, HNSW indexing kicks in automatically
- This threshold can be adjusted based on query patterns

### Payload Indexes

Two payload indexes are created for efficient filtering:

1. **course_id** (UUID)
   - Type: `uuid`
   - Purpose: Filter vectors by specific course
   - Use case: Retrieve only embeddings from a particular course

2. **organization_id** (UUID)
   - Type: `uuid`
   - Purpose: Multi-tenant isolation
   - Use case: Ensure each organization only accesses their own data

## Usage

### Creating the Collection

Run the collection creation script:

```bash
pnpm qdrant:create-collection
```

The script is idempotent and will skip creation if the collection already exists.

### Programmatic Usage

```typescript
import { createCourseEmbeddingsCollection, COLLECTION_CONFIG } from '@/shared/qdrant';

// Create the collection
await createCourseEmbeddingsCollection();

// Access configuration
console.log(COLLECTION_CONFIG.name); // 'course_embeddings'
console.log(COLLECTION_CONFIG.vectors.size); // 768
```

### Inserting Vectors

```typescript
import { qdrantClient } from '@/shared/qdrant';

await qdrantClient.upsert('course_embeddings', {
  points: [
    {
      id: 'unique-chunk-id-1',
      vector: [0.1, 0.2, ...], // 768-dimensional vector
      payload: {
        course_id: 'uuid-of-course',
        organization_id: 'uuid-of-organization',
        chunk_text: 'Original text content',
        chunk_index: 0,
        total_chunks: 10,
        metadata: {
          section: 'Introduction',
          page: 1
        }
      }
    }
  ]
});
```

### Searching Vectors

```typescript
import { qdrantClient } from '@/shared/qdrant';

// Search with organization filtering
const results = await qdrantClient.search('course_embeddings', {
  vector: queryEmbedding, // 768-dimensional query vector
  limit: 10,
  filter: {
    must: [
      {
        key: 'organization_id',
        match: { value: 'uuid-of-organization' }
      }
    ]
  }
});

// Search within a specific course
const courseResults = await qdrantClient.search('course_embeddings', {
  vector: queryEmbedding,
  limit: 5,
  filter: {
    must: [
      {
        key: 'course_id',
        match: { value: 'uuid-of-specific-course' }
      }
    ]
  }
});
```

## Performance Characteristics

### Expected Metrics

Based on Qdrant Cloud Free Tier (1GB storage):

- **Storage Capacity**: ~50,000 vectors (768-dim, float32)
- **Query Latency**: <30ms (p95) for filtered searches
- **Indexing Speed**: ~1,000 vectors/second
- **Memory Usage**: ~200MB for HNSW index at 50K vectors

### Scaling Considerations

For production scale beyond free tier:

1. **Vertical Scaling**:
   - Upgrade to larger Qdrant Cloud instance
   - Increase memory for better HNSW performance
   - Add more CPU cores for parallel indexing

2. **Horizontal Scaling**:
   - Use sharding for collections >1M vectors
   - Implement replication for high availability
   - Consider collection-per-tenant for largest customers

3. **Optimization Strategies**:
   - Use scalar quantization to reduce storage by 75%
   - Enable on-disk vectors for large collections
   - Tune `ef_construct` and `m` based on query patterns

## Validation

### Health Check

```bash
pnpm verify:qdrant
```

This script will:
1. Verify environment variables
2. Test connection to Qdrant Cloud
3. List existing collections
4. Validate collection configuration

### Manual Verification

```typescript
import { qdrantClient } from '@/shared/qdrant';

// Get collection info
const info = await qdrantClient.getCollection('course_embeddings');

console.log('Collection status:', info.status); // Should be 'green'
console.log('Vector count:', info.points_count);
console.log('Indexed vectors:', info.indexed_vectors_count);
console.log('Payload schema:', info.payload_schema);
```

## Troubleshooting

### Collection Creation Fails

**Issue**: Script fails with connection error

**Solution**:
1. Verify `.env` file has correct `QDRANT_URL` and `QDRANT_API_KEY`
2. Check Qdrant Cloud dashboard for cluster status
3. Ensure firewall/network allows HTTPS traffic to Qdrant Cloud

### Search Performance Degradation

**Issue**: Queries become slower as data grows

**Diagnosis**:
```typescript
const info = await qdrantClient.getCollection('course_embeddings');
console.log('Indexed percentage:',
  info.indexed_vectors_count / info.points_count * 100);
```

**Solutions**:
1. Wait for indexing to complete (happens in background)
2. Increase `ef_construct` for better index quality
3. Consider enabling scalar quantization
4. Monitor memory usage and upgrade if needed

### Multi-Tenant Isolation Issues

**Issue**: Organization sees another organization's data

**Diagnosis**:
- Verify payload indexes are created correctly
- Check filter is applied in all queries
- Audit payload data for correct `organization_id`

**Prevention**:
```typescript
// Always use filter wrapper
async function searchWithOrgFilter(
  queryVector: number[],
  organizationId: string,
  limit: number = 10
) {
  return qdrantClient.search('course_embeddings', {
    vector: queryVector,
    limit,
    filter: {
      must: [
        {
          key: 'organization_id',
          match: { value: organizationId }
        }
      ]
    }
  });
}
```

## Next Steps

After collection setup:

1. **T074**: Configure Jina-v3 embeddings API client
2. **T075**: Implement document chunking strategy (512 tokens, 50 token overlap)
3. **T076**: Implement embedding generation service
4. **T077**: Create batch upload pipeline (100-500 vectors per batch)

## References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [Jina AI Embeddings](https://jina.ai/embeddings/)
- [T000 Research Document](../../../docs/T000-research.md)
