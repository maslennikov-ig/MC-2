# Docling MCP Server

Docker service for document processing using Docling with Model Context Protocol (MCP).

## Features

- Converts documents (PDF, DOCX, PPTX, XLSX, HTML, MD, images) to structured DoclingDocument JSON
- Runs as standalone HTTP service using Streamable HTTP transport
- Integrated with BullMQ for async job processing
- Docker containerized for isolation and reproducibility
- Built-in health checks and monitoring

## Quick Start

### Build and run with Docker Compose

```bash
cd packages/course-gen-platform/docker/docling-mcp
docker compose up -d
```

### Test the service

```bash
curl http://localhost:8000/health
```

### View logs

```bash
docker compose logs -f docling-mcp
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCLING_CACHE_DIR` | `/app/cache` | Directory for document cache |
| `DOCLING_MODELS_PATH` | `/app/models` | Directory for ML models |
| `DOCLING_LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `DOCLING_MAX_FILE_SIZE` | `104857600` | Maximum file size in bytes (100MB) |
| `DOCLING_TIMEOUT` | `300` | Processing timeout in seconds |
| `MCP_TRANSPORT` | `streamable-http` | MCP transport protocol |
| `MCP_HOST` | `0.0.0.0` | Server host |
| `MCP_PORT` | `8000` | Server port |

## Resource Requirements

- **CPU**: 1-2 cores (2 recommended for concurrent processing)
- **Memory**: 2-4GB RAM (4GB recommended)
- **Disk**: 5-10GB for models and cache
- **Network**: Internal Docker network

## Supported Formats

- PDF (primary format with advanced understanding)
- Microsoft Office: DOCX, PPTX, XLSX
- Web: HTML
- Markup: Markdown
- Images: PNG, JPEG, GIF (via OCR)
- Structured: XML/JATS

## Performance

- 1-page PDF: ~1-3 seconds
- 10-page PDF: ~5-15 seconds
- 100-page PDF: ~30-120 seconds

## Health Check

The container includes a built-in health check that runs every 30 seconds:

```bash
curl http://localhost:8000/health
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker compose logs docling-mcp
```

### Out of memory

Increase memory limit in docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      memory: 6G
```

### Processing timeout

Increase timeout environment variable:
```bash
DOCLING_TIMEOUT=600
```

## Integration

This service is designed to be called by BullMQ workers in the Node.js backend through the TypeScript MCP client located at:
`src/stages/stage2-document-processing/docling/client.ts`

## License

Part of MegaCampusAI Platform
