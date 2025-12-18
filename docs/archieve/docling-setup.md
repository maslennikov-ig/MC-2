# Docling MCP Server Setup Documentation

**Task ID**: T074.1.2
**Date**: 2025-10-14
**Status**: ✅ COMPLETED
**Agent**: infrastructure-specialist

## Overview

This document describes the setup and configuration of the Docling MCP (Model Context Protocol) server for document processing in the MegaCampusAI platform. Docling enables conversion of various document formats (PDF, DOCX, PPTX, etc.) into structured JSON format for downstream RAG processing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  (User uploads file via tRPC endpoint)                       │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Node.js API (Next.js + tRPC)                    │
│  - Receives file upload (T057)                               │
│  - Creates file_catalog entry (vector_status=pending)        │
│  - Creates BullMQ job: DOCUMENT_PROCESSING                   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 BullMQ Worker (Node.js)                      │
│  - Picks up DOCUMENT_PROCESSING job                          │
│  - Calls DoclingClient                                       │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP POST (Streamable HTTP)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Docling MCP Server (Python + Docker)               │
│  - Processes document with Docling library                   │
│  - Returns DoclingDocument JSON                              │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 BullMQ Worker (continues)                    │
│  - Stores parsed_content in file_catalog                     │
│  - Updates vector_status → 'indexing'                        │
│  - Continues to T075 (chunking)                              │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Docker Service Setup

The Docling MCP server runs as a Docker container. All configuration files are located in `/home/me/code/megacampus2/services/docling-mcp/`.

#### Build and Start

```bash
cd /home/me/code/megacampus2/services/docling-mcp
docker compose build
docker compose up -d
```

#### Verify Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "healthy"}
```

### 2. TypeScript Client Installation

The TypeScript client is already installed in the `course-gen-platform` package.

**Location**: `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/docling/`

**Files**:
- `types.ts` - TypeScript type definitions for DoclingDocument schema v2.0
- `client.ts` - DoclingClient class with connection management and retry logic
- `index.ts` - Module exports

**Dependencies**:
- `@modelcontextprotocol/sdk@^1.20.0` - Installed in `package.json`

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Docling MCP Server Configuration
DOCLING_MCP_URL=http://docling-mcp:8000/mcp
DOCLING_MCP_TIMEOUT=300000  # 5 minutes in milliseconds
```

**For local development** (outside Docker):
```bash
DOCLING_MCP_URL=http://localhost:8000/mcp
```

### Docker Configuration

**File**: `/home/me/code/megacampus2/services/docling-mcp/docker-compose.yml`

Key settings:
- **Port**: 8000 (HTTP)
- **Transport**: Streamable HTTP
- **Memory Limit**: 4GB
- **CPU Limit**: 2 cores
- **Volumes**:
  - `uploads:/app/uploads:ro` (read-only access to documents)
  - `docling-cache:/app/cache` (persistent cache)
  - `docling-models:/app/models` (ML models storage)

### MCP Configuration

For Claude Code integration, the server is configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "docling-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "-v", "/home/me/code/megacampus2/packages/course-gen-platform/uploads:/app/uploads:ro",
        "--network", "megacampus-network",
        "-e", "DOCLING_LOG_LEVEL=INFO",
        "-e", "DOCLING_TIMEOUT=300",
        "docling-mcp:latest"
      ]
    }
  }
}
```

## Usage

### Basic Usage

```typescript
import { getDoclingClient } from '@/shared/docling';

const client = getDoclingClient();
await client.connect();

// Convert to DoclingDocument JSON
const document = await client.convertToDoclingDocument(
  '/app/uploads/org123/course456/file789.pdf'
);

// Convert to Markdown
const markdown = await client.convertToMarkdown(
  '/app/uploads/org123/course456/file789.pdf'
);

await client.disconnect();
```

### Advanced Usage

```typescript
import { DoclingClient } from '@/shared/docling';

const client = new DoclingClient({
  serverUrl: 'http://localhost:8000/mcp',
  timeout: 120000, // 2 minutes
  maxRetries: 5,
  debug: true,
});

await client.connect();

const response = await client.convertDocument({
  file_path: '/app/uploads/test.pdf',
  output_format: 'docling_document',
  enable_ocr: true,
  extract_images: true,
  extract_tables: true,
  force_refresh: false,
});

console.log(`Processed ${response.metadata?.pages_processed} pages`);
console.log(`Processing time: ${response.metadata?.processing_time_ms}ms`);
```

## Supported Formats

| Format | Extension | Status | Notes |
|--------|-----------|--------|-------|
| PDF | `.pdf` | ✅ Primary | Advanced layout understanding |
| Word | `.docx` | ✅ Supported | Full document structure |
| PowerPoint | `.pptx` | ✅ Supported | Slide content extraction |
| Excel | `.xlsx` | ✅ Supported | Table extraction |
| HTML | `.html` | ✅ Supported | Web content |
| Markdown | `.md` | ✅ Supported | Plain text markup |
| Images | `.png`, `.jpg`, `.gif` | ✅ Supported | OCR required (T074.4) |
| XML | `.xml`, `.jats` | ✅ Supported | Structured documents |

## DoclingDocument Schema

### Schema Version: 2.0

```typescript
interface DoclingDocument {
  schema_version: string;
  name: string;
  pages: DoclingPage[];
  texts: DoclingText[];
  pictures: DoclingPicture[];
  tables: DoclingTable[];
  metadata: DoclingMetadata;
}
```

### Key Fields

- **pages**: Array of pages with layout information
- **texts**: Extracted text elements with positioning and styling
- **pictures**: Images with optional OCR text and captions
- **tables**: Structured table data with cells
- **metadata**: Document-level information (page count, language, etc.)

## Error Handling

### Error Codes

The client maps errors to specific error codes:

```typescript
enum DoclingErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  TIMEOUT = 'TIMEOUT',
  OCR_ERROR = 'OCR_ERROR',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  NETWORK_ERROR = 'NETWORK_ERROR',
}
```

### Retry Strategy

- **Retryable errors**: TIMEOUT, OUT_OF_MEMORY, NETWORK_ERROR, PROCESSING_ERROR, OCR_ERROR
- **Non-retryable errors**: FILE_NOT_FOUND, UNSUPPORTED_FORMAT, CORRUPTED_FILE
- **Max retries**: 3 (configurable)
- **Backoff**: Exponential (2^attempt * retryDelay)

## Performance

### Latency Estimates

| Document Size | Expected Processing Time |
|---------------|-------------------------|
| 1-page PDF | 1-3 seconds |
| 10-page PDF | 5-15 seconds |
| 50-page PDF | 15-60 seconds |
| 100-page PDF | 30-120 seconds |

### Resource Requirements

- **Base Memory**: 500MB-1GB (Python + models)
- **Per Document**: +100-500MB (depends on complexity)
- **ML Models**: ~1-2GB (cached after first load)
- **CPU**: Multi-core beneficial (2 cores recommended)

## Testing

### Unit Tests

**Location**: `/home/me/code/megacampus2/packages/course-gen-platform/tests/shared/docling/`

Run tests:
```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
pnpm test docling
```

### Manual Testing

#### 1. Check Server Health

```bash
curl http://localhost:8000/health
```

#### 2. List Available Tools

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

#### 3. Convert Test Document

```bash
# Place a test PDF
cp test.pdf /home/me/code/megacampus2/packages/course-gen-platform/uploads/test/

# Convert document
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/test.pdf",
        "output_format": "docling_document"
      }
    },
    "id": 2
  }' | jq
```

## Troubleshooting

### Container Won't Start

**Check logs**:
```bash
docker compose logs docling-mcp
```

**Common issues**:
- Port 8000 already in use → Change port in `docker-compose.yml`
- Out of memory → Increase memory limit
- Volume mount issues → Check uploads directory exists

### Processing Timeouts

Increase timeout in `docker-compose.yml`:
```yaml
environment:
  - DOCLING_TIMEOUT=600  # 10 minutes
```

### Out of Memory

Increase memory limit:
```yaml
deploy:
  resources:
    limits:
      memory: 6G
```

### Connection Refused

```bash
# Check if server is running
docker ps | grep docling-mcp

# Check network connectivity
docker exec -it your-app-container ping docling-mcp

# Check logs
docker compose logs docling-mcp
```

## Integration with RAG Pipeline

### Workflow

1. **T057**: File upload → Creates file_catalog entry (vector_status='pending')
2. **T074.1.2** (this task): Document processing → parsed_content stored (vector_status='indexing')
3. **T075**: Document chunking → Reads parsed_content, creates chunks
4. **T076**: Embedding generation → Creates embeddings for chunks
5. **T077**: Vector indexing → Inserts embeddings into Qdrant

### Database Schema

**Table**: `file_catalog`

Updated fields:
- `parsed_content` (JSONB): Stores DoclingDocument JSON
- `vector_status`: Updated to 'indexing' after processing
- `metadata.docling`: Processing metadata

## Files Created

### Docker Infrastructure
- `/home/me/code/megacampus2/services/docling-mcp/Dockerfile`
- `/home/me/code/megacampus2/services/docling-mcp/docker-compose.yml`
- `/home/me/code/megacampus2/services/docling-mcp/.dockerignore`
- `/home/me/code/megacampus2/services/docling-mcp/.env.example`
- `/home/me/code/megacampus2/services/docling-mcp/README.md`

### TypeScript Client
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/docling/types.ts`
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/docling/client.ts`
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/docling/index.ts`

### Tests
- `/home/me/code/megacampus2/packages/course-gen-platform/tests/shared/docling/client.test.ts`

### Configuration
- `/home/me/code/megacampus2/.mcp.json` (updated)
- `/home/me/code/megacampus2/packages/course-gen-platform/.env.example` (updated)
- `/home/me/code/megacampus2/packages/course-gen-platform/package.json` (updated)

### Documentation
- `/home/me/code/megacampus2/docs/docling-setup.md` (this file)

## Next Steps

### Immediate (T074.3, T074.4)
1. **T074.3**: Implement markdown conversion for document preview
2. **T074.4**: Implement OCR tier control for Premium users

### Short Term (T075, T076, T077)
1. **T075**: Implement document chunking (reads parsed_content)
2. **T076**: Implement embedding generation (Jina AI)
3. **T077**: Implement vector indexing (Qdrant)

### Future Enhancements
1. **Caching Layer**: Redis cache for DoclingDocument JSON
2. **Horizontal Scaling**: Multiple Docling instances with load balancer
3. **Advanced OCR**: Enable OCR for scanned PDFs and images
4. **Image Extraction**: Extract and store images separately
5. **Monitoring Dashboard**: Grafana dashboard for metrics

## References

- **Docling MCP GitHub**: https://github.com/docling-project/docling-mcp
- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Docling Documentation**: https://docling-project.github.io/docling/
- **MCP Specification**: https://spec.modelcontextprotocol.io/
- **Task Documentation**: `/home/me/code/megacampus2/docs/T074-docling-mcp-implementation/`

## Support

For issues or questions, refer to:
1. This documentation
2. Docker logs: `docker compose logs docling-mcp`
3. Test suite: `pnpm test docling`
4. Existing implementation docs in `/home/me/code/megacampus2/docs/T074-docling-mcp-implementation/`

---

**Implementation Date**: 2025-10-14
**Task**: T074.1.2
**Status**: ✅ COMPLETED
