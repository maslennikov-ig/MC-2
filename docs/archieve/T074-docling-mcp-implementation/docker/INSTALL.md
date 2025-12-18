# Docling MCP Server Installation Guide

## Prerequisites

- Docker and Docker Compose installed
- Python 3.10+ (for local development only)
- Node.js 18+ (for TypeScript client)

## Installation Options

### Option 1: Docker (RECOMMENDED)

This is the recommended approach for both development and production.

#### 1. Build the Docker image

```bash
cd /home/me/code/megacampus2/services/docling-mcp
docker build -t docling-mcp:latest .
```

#### 2. Start the service

```bash
docker compose up -d
```

#### 3. Check health status

```bash
curl http://localhost:8000/health
```

#### 4. View logs

```bash
docker logs -f docling-mcp-server
```

### Option 2: Local Python Installation

For local development and testing without Docker.

#### 1. Install system dependencies (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y python3.12-venv libgl1-mesa-glx libglib2.0-0
```

#### 2. Create virtual environment

```bash
cd /home/me/code/megacampus2/services/docling-mcp
python3 -m venv venv
source venv/bin/activate
```

#### 3. Install docling-mcp

```bash
pip install --upgrade pip
pip install "docling-mcp>=1.3.2"
```

#### 4. Run the server

```bash
docling-mcp-server --transport streamable-http --host 0.0.0.0 --port 8000
```

## Verification

### Test with curl

```bash
# Health check
curl http://localhost:8000/health

# List available tools (MCP protocol)
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

### Expected Response

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "convert_document",
        "description": "Convert document to structured format",
        "inputSchema": {...}
      }
    ]
  },
  "id": 1
}
```

## Troubleshooting

### Python venv not available

If you get "ensurepip is not available" error:

```bash
sudo apt install python3.12-venv
```

### Docker container fails to start

Check logs:
```bash
docker logs docling-mcp-server
```

Common issues:
- Port 8000 already in use: Change port in docker-compose.yml
- Out of memory: Increase memory limit in deploy.resources.limits
- Volume mount issues: Check that uploads directory exists

### Processing timeouts

For large documents, increase timeout:

```yaml
# In docker-compose.yml
environment:
  - DOCLING_TIMEOUT=600  # 10 minutes
```

## Next Steps

1. Test with sample documents (see TEST.md)
2. Integrate with TypeScript client (see ../packages/course-gen-platform/src/shared/mcp/)
3. Configure BullMQ workers for async processing

## Resources

- Docling MCP GitHub: https://github.com/docling-project/docling-mcp
- MCP Specification: https://spec.modelcontextprotocol.io/
- Docling Documentation: https://docling-project.github.io/docling/
