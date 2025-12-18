# T074 - Docling MCP Integration (ARCHIVED)

**Status**: 🗄️ Archived - Implementation Deferred
**Task**: T074.1.1 - Docling MCP Research & Implementation
**Date Archived**: 2025-10-13
**Reason**: Deferred for future implementation

---

## Overview

This folder contains a complete implementation of Docling MCP Server integration for document processing. The implementation includes Docker configuration, TypeScript client, BullMQ worker handler, and comprehensive documentation.

**Implementation Status**: ✅ Complete and tested (in development environment)
**Production Status**: ⏸️ Not deployed - awaiting future activation

---

## What is Docling MCP?

Docling MCP is a Model Context Protocol server that processes documents (PDF, DOCX, PPTX, etc.) and converts them into structured JSON format (DoclingDocument). This enables:

- Parsing complex PDFs with tables, images, and layouts
- Converting Office documents (DOCX, PPTX, XLSX)
- Extracting structured data for RAG pipelines
- OCR for scanned documents

**Technology**: Python 3.12 + Docling library + MCP protocol + Docker

---

## Folder Structure

```
T074-docling-mcp-implementation/
├── README.md                   # This file
├── docs/                       # Documentation
│   ├── T074.1.1-TECHNICAL-REQUIREMENTS.md     # Complete technical guide (main)
│   ├── T074.1.2-DOCLING-MCP-SETUP.md          # Detailed setup instructions
│   └── T074.1.2-MANUAL-INTEGRATION-STEPS.md   # Integration checklist
├── docker/                     # Docker configuration
│   ├── Dockerfile              # Python 3.12 + docling-mcp
│   ├── docker-compose.yml      # Service definition
│   ├── .dockerignore           # Build optimization
│   ├── .env.example            # Environment variables template
│   ├── README.md               # Docker service docs
│   ├── INSTALL.md              # Installation guide
│   └── TEST.md                 # Testing procedures
├── typescript/                 # TypeScript MCP Client
│   ├── types.ts                # 2,400+ lines: DoclingDocument types
│   ├── docling-client.ts       # MCP client with retry logic
│   └── index.ts                # Exports
└── handlers/                   # BullMQ Worker Handler
    └── document-processing.ts  # DOCUMENT_PROCESSING job handler
```

---

## Key Implementation Decisions

### 1. Transport Protocol: Streamable HTTP
**Chosen over stdio** because:
- Supports multiple concurrent clients
- Works with Docker containers
- HTTP-native (no process spawning needed)
- Scales horizontally
- Compatible with Node.js/TypeScript

### 2. Deployment: Docker
**Chosen over native Python** because:
- Isolated Python environment
- Reproducible builds
- Resource limits (2 CPU, 4GB RAM)
- Security sandboxing
- Easy to scale

### 3. Architecture: MCP Client in TypeScript
**Singleton pattern** with:
- Automatic retry (3 attempts, exponential backoff)
- Connection pooling
- Error handling for all failure modes
- Type-safe DoclingDocument interface

---

## File Inventory

### Documentation (3 files)

1. **T074.1.1-TECHNICAL-REQUIREMENTS.md** (⭐ START HERE)
   - Executive summary and architecture
   - Complete technical specifications
   - Integration guide with code examples
   - Performance characteristics
   - Quick start commands
   - ~600 lines, concentrated format

2. **T074.1.2-DOCLING-MCP-SETUP.md**
   - Detailed setup procedures
   - Deployment strategies
   - Troubleshooting guide
   - ~7,000 words

3. **T074.1.2-MANUAL-INTEGRATION-STEPS.md**
   - Step-by-step integration checklist
   - Testing procedures
   - Verification steps

### Docker Configuration (7 files)

1. **Dockerfile**
   - Base: python:3.12-slim
   - Package: docling-mcp>=1.3.2
   - Ports: 8000
   - Health checks

2. **docker-compose.yml**
   - Service definition
   - Volume mounts (uploads, cache, models)
   - Network: megacampus-network
   - Resource limits: 2 CPU, 4GB RAM

3. **README.md**
   - Service overview
   - Quick start
   - Architecture diagram

4. **INSTALL.md**
   - Installation steps
   - Troubleshooting

5. **TEST.md**
   - Testing procedures
   - Sample commands

6. **.dockerignore**
   - Build optimization

7. **.env.example**
   - Environment variables template

### TypeScript Client (3 files)

1. **types.ts** (2,400+ lines)
   - Complete DoclingDocument interface
   - Error types and codes
   - Helper functions
   - Type guards

2. **docling-client.ts**
   - DoclingClient class
   - Connection management
   - Retry logic (3x, exponential backoff)
   - Error handling
   - Singleton pattern

3. **index.ts**
   - Centralized exports

### BullMQ Handler (1 file)

1. **document-processing.ts**
   - DOCUMENT_PROCESSING job handler
   - Progress tracking
   - Cancellation support
   - Supabase integration
   - Error handling

---

## Integration Requirements

### Prerequisites
- Python 3.10+ (for Docker image)
- Node.js with TypeScript
- Docker & Docker Compose
- PostgreSQL (file_catalog table)
- BullMQ (Redis)

### Environment Variables Required
```bash
DOCLING_MCP_URL=http://docling-mcp:8000/mcp
DOCLING_MCP_TIMEOUT=300000  # 5 minutes
```

### Dependencies to Add
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0"
  }
}
```

---

## How to Activate (Future)

### Step 1: Copy Files
```bash
# From archive to project
cp -r docs/archieve/T074-docling-mcp-implementation/docker/* services/docling-mcp/
cp -r docs/archieve/T074-docling-mcp-implementation/typescript/* packages/course-gen-platform/src/shared/mcp/
cp docs/archieve/T074-docling-mcp-implementation/handlers/document-processing.ts packages/course-gen-platform/src/orchestrator/handlers/
```

### Step 2: Update package.json
```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.20.0"
}
```
Then run: `npm install`

### Step 3: Update .env.example
```bash
# Add to packages/course-gen-platform/.env.example
DOCLING_MCP_URL=http://docling-mcp:8000/mcp
DOCLING_MCP_TIMEOUT=300000
```

### Step 4: Register Handler
**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`
```typescript
import { documentProcessingHandler } from './handlers/document-processing';

const jobHandlers = {
  [JobType.DOCUMENT_PROCESSING]: documentProcessingHandler,
};
```

### Step 5: Build & Deploy
```bash
cd services/docling-mcp
docker compose build
docker compose up -d

# Verify
curl http://localhost:8000/health
```

### Step 6: Integration Test
- Upload a PDF file
- Check BullMQ queue for DOCUMENT_PROCESSING job
- Verify file_catalog entry has parsed_content
- Check vector_status transitions: pending → indexing

---

## Performance Expectations

### Processing Time
- 1-page PDF: 1-3 seconds
- 10-page PDF: 5-15 seconds
- 100-page PDF: 30-120 seconds

### Resource Usage
- RAM: 2-4GB per instance
- CPU: 2 cores
- Disk: 5GB (ML models + cache)

### Throughput
- Single instance: 2-4 concurrent documents
- Scaling: Add more instances for higher throughput

---

## Supported Formats

✅ PDF (primary format, advanced layout understanding)
✅ DOCX (Microsoft Word)
✅ PPTX (PowerPoint)
✅ XLSX (Excel)
✅ HTML
✅ Markdown
✅ PNG, JPEG, GIF (via OCR)
✅ XML/JATS

---

## Architecture Flow

```
User Upload (tRPC)
    ↓
File saved: /uploads/{orgId}/{courseId}/{fileId}.ext
    ↓
file_catalog entry: vector_status='pending'
    ↓
BullMQ Job: DOCUMENT_PROCESSING
    ↓
Worker picks up job
    ↓
TypeScript DoclingClient.connect()
    ↓
HTTP POST → http://docling-mcp:8000/mcp
    ↓
Docling MCP Server (Docker)
    ↓
Docling Library processes document
    ↓
Returns: DoclingDocument JSON
    ↓
Store: file_catalog.parsed_content
    ↓
Update: vector_status='indexing'
    ↓
Continue to T075 (Chunking)
```

---

## Security Considerations

- ✅ Docker isolation (2 CPU, 4GB RAM limits)
- ✅ Read-only access to /uploads
- ✅ No host filesystem access
- ✅ Internal network only (not exposed publicly)
- ✅ File size limits (100MB max)
- ✅ MIME type validation

---

## Why Archived?

This implementation was completed but deferred for future activation. Reasons:
1. **Not immediately critical** for MVP launch
2. **Complete implementation** available for quick activation
3. **Well-documented** for future reference
4. **Tested in development** environment

**Activation Effort**: ~2-4 hours (copy files, test, deploy)

---

## Related Tasks

- **T057**: File upload endpoint (already implemented)
- **T034-T044**: BullMQ job queue (already implemented)
- **T071-T073**: Qdrant vector storage (already implemented)
- **T075**: Document chunking (next step after this)
- **T076**: Embedding generation (depends on T075)

---

## Technical Highlights

### MCP Protocol
- Industry-standard protocol for AI tool integration
- JSON-RPC 2.0 over HTTP
- Supported by Anthropic, Docker, and major AI platforms

### Type Safety
- 2,400+ lines of TypeScript types
- Complete DoclingDocument schema
- Type guards for runtime validation

### Error Handling
- 14 distinct error types
- Retry logic with exponential backoff
- Graceful degradation

### Performance
- Caching for ML models (persistent volumes)
- Efficient memory usage
- Horizontal scaling support

---

## Cost Estimation (Future)

### Single Instance
- Docker container (2 CPU, 4GB): ~$25-35/month
- Storage (5GB): ~$5/month
- **Total**: ~$30-40/month

### Scaled (3 instances)
- 3x containers: ~$75-105/month
- Load balancer: +$10-20/month
- **Total**: ~$85-125/month

---

## References

- Docling MCP: https://github.com/docling-project/docling-mcp
- MCP Protocol: https://spec.modelcontextprotocol.io/
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Docling Library: https://docling-project.github.io/docling/

---

## Notes

- ✅ All code is production-ready
- ✅ Comprehensive documentation
- ✅ Tested in development
- ⏸️ Awaiting activation decision
- 🔄 Ready to activate in 2-4 hours

---

**For activation instructions, see**: `docs/T074.1.1-TECHNICAL-REQUIREMENTS.md`

**Questions?** Check the detailed guides:
1. TECHNICAL-REQUIREMENTS.md - Technical overview
2. DOCLING-MCP-SETUP.md - Setup procedures
3. MANUAL-INTEGRATION-STEPS.md - Integration checklist

---

**Archived by**: Infrastructure Specialist (via Research Agent)
**Date**: 2025-10-13
**Status**: Complete but deferred
