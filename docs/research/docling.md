# Docling Integration - Key Decisions

**Date**: 2025-10-14
**Status**: Decided
**Implementation**: T074.1.2 (Complete), T074.3 (Next), T074.4 (OCR)

---

## Core Decision: Docling MCP Server

**Architecture**: Single Docker container, HTTP transport, per-tier configuration

```
TypeScript API → MCP Client → HTTP → Docling MCP Server (Python)
                                    ↓
                            DoclingDocument JSON → Markdown
```

---

## Format Support by Tier

| Tier | Formats | Docling | OCR |
|------|---------|---------|-----|
| **FREE** | TXT, MD | ❌ No | - |
| **BASIC** | TXT, MD | ❌ No | - |
| **STANDARD** | PDF, DOCX, PPTX, HTML, TXT, MD | ✅ Yes | ✅ Docling OCR (free) |
| **PREMIUM** | All + PNG, JPG, GIF | ✅ Yes | ✅ Docling OCR + Vision API* |

*Vision API (Jina/OpenRouter/GPT-4o) for image descriptions - TBD

---

## Key Principles

### 1. No Docling for Plain Text
- **TXT/MD**: Direct `fs.readFile()` - no overhead
- **Complex formats**: Docling MCP (PDF, DOCX, PPTX, HTML)

### 2. Single Container, Dynamic Configuration
- One Docker image with OCR included
- OCR enabled/disabled via API parameter per request
- Memory: 4GB base, 8GB with OCR active

### 3. OCR Levels

**STANDARD tier (Docling OCR - free):**
- Extract text from scanned PDFs
- Process images with text
- Tesseract/EasyOCR (MIT/Apache 2.0)
- Cost: $0 (only infrastructure)

**PREMIUM tier (Vision API - optional):**
- Docling OCR + semantic image descriptions
- Options: Jina Vision API, OpenRouter models, GPT-4o
- Cost: ~$0.001-0.01 per image
- **Status**: Under evaluation - not committed yet

---

## Infrastructure

### Docker Container (Unified)
```dockerfile
FROM python:3.12-slim
RUN apt-get install -y tesseract-ocr  # Always included
RUN pip install "docling-mcp[ocr]>=1.3.2"
CMD ["docling-mcp-server", "--transport", "streamable-http"]
```

**Resources:**
- CPU: 2 cores
- Memory: 4GB base / 8GB with OCR
- Cost: $25-35/month (shared across STANDARD orgs)

### API Control
```typescript
// Same method, different parameters
await client.convertToDoclingDocument(filePath, {
  enableOCR: tier === 'STANDARD' || tier === 'PREMIUM'
});
```

---

## Performance

| Operation | Latency | Memory |
|-----------|---------|--------|
| PDF (text layer) | 1-3s | ~500MB |
| PDF (scanned, OCR) | 5-10s/page | ~2-3GB |
| DOCX/PPTX | 1-5s | ~500MB |
| Image (OCR) | 5-10s | ~2-3GB |

---

## Cost Analysis

**STANDARD tier:**
- Docling infrastructure: $0.20/org/month (amortized)
- OCR: $0 (included, Tesseract)
- Total: $17.70/org/month (64% margin)

**PREMIUM tier:**
- Docling infrastructure: $0.20/org/month
- Vision API (if enabled): ~$0.03-0.10/document
- Total: Variable based on usage

---

## What Docling Does

### ✅ Built-in (Free)
- PDF layout understanding (tables, formulas, reading order)
- Office format parsing (DOCX, PPTX structure)
- HTML structure extraction
- OCR text extraction (Tesseract/EasyOCR)
- Image extraction from documents
- Markdown export

### ❌ Not Included (Requires External API)
- Semantic image descriptions (needs Vision API)
- Image classification beyond basic types
- Content understanding (diagrams, charts analysis)

---

## Integration Points

**T074.1.2** (Complete): MCP Server setup
- Docker container with Streamable HTTP
- TypeScript client with retry logic
- BullMQ handler integration

**T074.3** (Next): Markdown conversion
- DoclingDocument JSON → Markdown
- Image extraction and referencing
- Structure preservation

**T074.4** (New): OCR Configuration
- Enable OCR for STANDARD tier
- Tier-based parameter control
- Error handling for unsupported operations

**T074.5** (Optional): Vision API Integration
- Image description pipeline
- Provider selection (Jina/OpenRouter/GPT-4o)
- **Status**: Deferred to later stage

---

## Decision Log

**Why one container vs two?**
- Simpler infrastructure management
- Dynamic resource allocation
- OCR overhead only when needed

**Why OCR in STANDARD?**
- Most PDFs have text layer (no OCR needed)
- OCR cost is infrastructure only (Tesseract free)
- Clear value differentiator vs BASIC
- Acceptable margin at $49/month

**Why Vision API separate?**
- Significant cost per image ($0.001-0.01)
- Not all documents have images
- Better as optional PREMIUM feature
- Provider flexibility (multiple options)

**Why Markdown pipeline?**
- Unified format for all document types
- Clean heading-based boundaries for chunking
- Human-readable intermediate format
- Simplifies T075 implementation

---

## Open Questions

1. **Vision API provider**: Jina vs OpenRouter vs GPT-4o vs none?
   - Decision: Defer to post-MVP
   - Can add later without breaking changes

2. **OCR language packs**: Which languages to include?
   - Current: eng, rus, spa (covers 80%+ users)
   - Expandable via environment config

3. **Concurrent OCR limit**: Max 2 simultaneous OCR jobs?
   - Prevents memory exhaustion
   - Queue additional requests

---

## Implementation Status

- [x] T074.1.2: Docling MCP Server setup (Complete)
- [ ] T074.3: Markdown conversion pipeline (Next - 2 days)
- [ ] T074.4: OCR tier configuration (1 day)
- [ ] T074.5: Vision API integration (TBD - optional)

---

**Summary**: Single Docling container with OCR, STANDARD tier gets free OCR, PREMIUM gets optional Vision API (provider TBD). Plain text formats bypass Docling entirely.
