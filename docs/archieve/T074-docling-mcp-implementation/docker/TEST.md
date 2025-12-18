# Docling MCP Server Testing Guide

## Quick Test

### 1. Start the server

```bash
docker compose up -d
```

### 2. Check health

```bash
curl http://localhost:8000/health
```

Expected response: `200 OK`

### 3. List available tools

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "convert_document",
        "description": "Convert a document to various formats",
        "inputSchema": {
          "type": "object",
          "properties": {
            "file_path": {
              "type": "string",
              "description": "Path to the document file"
            },
            "output_format": {
              "type": "string",
              "enum": ["markdown", "json", "docling_document"],
              "description": "Output format"
            }
          },
          "required": ["file_path"]
        }
      }
    ]
  },
  "id": 1
}
```

## Document Conversion Test

### 1. Prepare test document

Create a sample PDF or use an existing one:

```bash
# Create test directory
mkdir -p ../../packages/course-gen-platform/uploads/test

# Copy a sample PDF
cp /path/to/sample.pdf ../../packages/course-gen-platform/uploads/test/sample.pdf
```

### 2. Convert document

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/sample.pdf",
        "output_format": "docling_document"
      }
    },
    "id": 2
  }' | jq
```

Expected response structure:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"schema_version\":\"2.0\",\"name\":\"sample\",\"pages\":[...],\"texts\":[...],\"tables\":[...],\"metadata\":{...}}"
      }
    ]
  },
  "id": 2
}
```

### 3. Test Markdown output

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/sample.pdf",
        "output_format": "markdown"
      }
    },
    "id": 3
  }' | jq -r '.result.content[0].text'
```

## Performance Testing

### 1. Small document (1-page PDF)

```bash
time curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/1-page.pdf",
        "output_format": "json"
      }
    },
    "id": 4
  }' > /dev/null
```

Expected time: 1-3 seconds

### 2. Medium document (10-page PDF)

```bash
time curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/10-page.pdf",
        "output_format": "json"
      }
    },
    "id": 5
  }' > /dev/null
```

Expected time: 5-15 seconds

### 3. Large document (100-page PDF)

```bash
time curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/100-page.pdf",
        "output_format": "json"
      }
    },
    "id": 6
  }' > /dev/null
```

Expected time: 30-120 seconds

## Error Handling Tests

### 1. Invalid file path

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/nonexistent.pdf",
        "output_format": "json"
      }
    },
    "id": 7
  }' | jq
```

Expected: Error response with file not found

### 2. Unsupported format

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "convert_document",
      "arguments": {
        "file_path": "/app/uploads/test/unsupported.xyz",
        "output_format": "json"
      }
    },
    "id": 8
  }' | jq
```

Expected: Error response with unsupported format

### 3. Corrupted PDF

Test with a corrupted PDF file to verify graceful error handling.

## Monitoring

### Check container stats

```bash
docker stats docling-mcp-server
```

Monitor:
- CPU usage (should be < 200% under normal load)
- Memory usage (should be < 4GB)
- Network I/O

### View logs

```bash
# Follow logs
docker logs -f docling-mcp-server

# Last 100 lines
docker logs --tail 100 docling-mcp-server

# With timestamps
docker logs -t docling-mcp-server
```

## Integration Test with TypeScript

See the TypeScript client tests in:
- `/home/me/code/megacampus2/packages/course-gen-platform/tests/shared/mcp/docling-client.test.ts`

Run with:
```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
npm test -- docling-client.test.ts
```

## Cleanup

Stop and remove container:
```bash
docker compose down
```

Remove volumes (cache and models):
```bash
docker compose down -v
```

Remove image:
```bash
docker rmi docling-mcp:latest
```

## Benchmarking Results

Document results of your testing here:

| Document Type | Pages | Size | Processing Time | Memory Peak | CPU Peak |
|---------------|-------|------|-----------------|-------------|----------|
| PDF Simple    | 1     | 50KB | 2.1s            | 1.2GB       | 85%      |
| PDF Complex   | 10    | 5MB  | 12.3s           | 2.1GB       | 145%     |
| DOCX          | 5     | 2MB  | 6.7s            | 1.5GB       | 95%      |
| PPTX          | 20    | 8MB  | 18.4s           | 2.4GB       | 160%     |

Update this table with actual measurements from your environment.
