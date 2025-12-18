# MegaCampusAI Pricing Tiers & Feature Distribution

**Version**: 2.1.0
**Date**: 2025-10-14
**Status**: Draft (Stage 0 Foundation)
**Changes**: Added Docling MCP Server integration, moved PDF to STANDARD tier

---

## 📋 Executive Summary

This document defines the feature distribution across MegaCampusAI pricing tiers. Each tier is designed to provide clear value propositions while enabling sustainable growth and infrastructure scaling.

**Philosophy**:
- **TRIAL**: 7-day trial with full STANDARD features (no export)
- **FREE**: Functional MVP for individual learners (minimal cost, no export)
- **BASIC**: Entry-level paid tier with basic export (simple workflow)
- **STANDARD (Optimum)**: Production-ready optimal implementation (PRIMARY DEVELOPMENT FOCUS)
- **PREMIUM (Maximum)**: Maximum quality with all advanced AI techniques

**Development Strategy**:
- ✅ **Implement STANDARD tier first** (optimal ROI, Stage 0-1 primary target) ⭐
- ⏸️ **Defer TRIAL restrictions** (export blocking, 7-day expiration)
- ⏸️ **Defer FREE/BASIC simplifications** (create tasks, implement in Stage 2)
- ⏸️ **Defer PREMIUM enhancements** (create tasks, implement in Stage 3)

---

## 🎯 Tier Overview

| Tier | Target Audience | Monthly Price | Duration | Storage Quota | Export | Key Differentiator |
|------|----------------|---------------|----------|---------------|--------|-------------------|
| **TRIAL** | Evaluation users | $0 | 7 days | 1 GB | ❌ No | Full STANDARD features, time-limited |
| **FREE** | Individual learners | $0 | Unlimited | 10 MB | ❌ No | Platform-only access, basic AI |
| **BASIC** | Hobbyists, educators | $19/month | Unlimited | 100 MB | ✅ Limited | Entry-level paid, simple workflow |
| **STANDARD (Optimum)** | Small teams, businesses | $49/month | Unlimited | 1 GB | ✅ Full | **Optimal implementation (dev focus)** |
| **PREMIUM (Maximum)** | Institutions, enterprises | $149/month | Unlimited | 10 GB | ✅ Full + API | Maximum quality, advanced AI |

**Critical Note**: STANDARD tier is our PRIMARY development target. All other tiers are simplified (FREE/BASIC) or enhanced (PREMIUM) versions of STANDARD.

---

## 📊 Feature Distribution Matrix

### 1. 🗂️ Storage & File Handling

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Storage Quota** | 1 GB | 10 MB | 100 MB | 1 GB | 10 GB | ✅ Implemented (T064) |
| **File Upload** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Implemented |
| **Supported Formats** | All w/o images (STANDARD) | TXT, MD | TXT, MD | **PDF, DOCX, PPTX, HTML, TXT, MD** (no images) | All formats + **Images** (PNG, JPG, GIF) | ⏸️ Task: T075.1-TIER |
| **Document Processing** | Docling MCP + OCR (STANDARD) | Manual only | Manual only | **Docling MCP + OCR** (no images) | **Docling MCP + OCR + Vision API*** (with images) | ✅ T074.1.2, ⏸️ T074.4-PREMIUM |
| **Max File Size** | 10 MB (STANDARD) | 5 MB | 10 MB | **10 MB** (no images) | **100 MB** (with PDF chunking + images) | ⏸️ Task: T075.1-TIER, T075.17-CHUNKING |
| **Concurrent Uploads** | 5 files | 1 file | 2 files | 5 files | 10 files | ⏸️ Task: T075.2-PREMIUM |

**OCR Details:**
- **TRIAL/STANDARD**: Docling built-in OCR (Tesseract/EasyOCR) for scanned PDFs - files WITHOUT images only
- **BASIC**: No OCR (text-only formats TXT, MD)
- **PREMIUM**: Docling built-in OCR + *Vision API for semantic image descriptions (provider TBD: Jina/OpenRouter/GPT-4o) - files WITH images supported

---

### 2. 🤖 Course Generation (LLM)

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **LLM Model** | GPT-4 Turbo | GPT-3.5 Turbo | GPT-4 | GPT-4 Turbo | GPT-4 Turbo | ✅ Implemented (configurable) |
| **Max Lessons/Course** | Unlimited | 5 lessons | 20 lessons | Unlimited | Unlimited | ⏸️ Task: T075.3-TIER |
| **Generation Strategy** | Single-shot | Single-shot | Single-shot | Single-shot | **Multi-agent** (3→judge) | ⏸️ Task: T075.4-PREMIUM |
| **Quality Validation** | ✅ Comprehensive | Basic | ✅ Comprehensive | ✅ Comprehensive | ✅ Comprehensive + Human-in-loop | ⏸️ Task: T075.5-PREMIUM |
| **Regeneration Attempts** | 3 attempts | 1 attempt | 2 attempts | 5 attempts | Unlimited | ⏸️ Task: T075.6-TIER |
| **Custom Prompts** | ✅ Yes | ❌ No | ✅ Basic | ✅ Yes | ✅ Yes + Templates | ⏸️ Task: T075.7-PREMIUM |

**Multi-Agent Generation (PREMIUM)**:
```
Agent 1 (Structured) → Draft A
Agent 2 (Creative)   → Draft B
Agent 3 (Concise)    → Draft C
        ↓
Judge Agent → Selects best sections → Final Lesson
```
- **Cost**: 3x LLM calls per lesson (+judge call)
- **Quality**: +20-30% student satisfaction (estimated)
- **Use case**: High-value courses, corporate training

---

### 3. 🔍 RAG (Retrieval-Augmented Generation)

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Chunking Strategy** | **Hierarchical** | Fixed (2000 chars) | Hierarchical (basic) | **Hierarchical** (parent-child) | Hierarchical + Structure-aware | ✅ STANDARD (T075), ⏸️ PREMIUM (T075.8) |
| **Chunk Size** | 400/1500 tokens | 2000 chars (naive) | 400/1500 tokens | 400 tokens (child), 1500 tokens (parent) | Dynamic based on content | ✅ STANDARD (T075) |
| **Embeddings Model** | **Jina-v3** (768D) | text-embedding-3-small | text-embedding-3-small | **Jina-v3** (768D) | Jina-v3 (768D) | ✅ Implemented (T074) |
| **Late Chunking** | ✅ **Yes** | ❌ No | ❌ No | ✅ **Yes** | ✅ Yes | ✅ STANDARD (T075) |
| **Search Type** | **Hybrid** (BM25) | Semantic only | Semantic only | **Hybrid** (semantic + BM25) | Hybrid + **Reranking** | ✅ STANDARD (T075), ⏸️ PREMIUM (T075.9) |
| **Source Attribution** | Position + headings | None | Basic | Position + headings + pages | Position + headings + pages | ✅ STANDARD (T075) |
| **Contextual Enrichment** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ **Yes** (LLM-generated context) | ⏸️ Task: T075.10-PREMIUM |
| **Metadata Schema** | Comprehensive | Minimal | Basic | Comprehensive | Comprehensive + Versioning | ✅ STANDARD (T075) |
| **Multilingual Support** | ✅ 89 languages | English only | English + Spanish + Russian | ✅ 89 languages | ✅ 89 languages + Optimized | ✅ STANDARD (T075) |

**Improvement Estimates** (vs naive baseline):

| Metric | TRIAL | FREE | BASIC | STANDARD | PREMIUM |
|--------|-------|------|-------|----------|---------|
| Retrieval Failures | <2% (-67%) | 5-6% (baseline) | 3-4% (-40%) | <2% (-67%) | <1% (-83%) |
| Precision@10 | 82-85% | 70% | 75-78% (+5-8pp) | 82-85% (+12-15pp) | 90%+ (+20pp) |
| Cost per 1M tokens | $0.02-0.025 | $0.01 | $0.015 | $0.02-0.025 | $0.03-0.04 |

---

### 4. 📈 Vector Database (Qdrant)

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Collection Strategy** | Shared (filtered) | Shared (filtered) | Shared (filtered) | Shared (filtered) | Shared (filtered) | ✅ Implemented (T073) |
| **Vector Dimensions** | 768 | 768 | 768 | 768 | 768 | ✅ Implemented |
| **Index Type** | HNSW | HNSW | HNSW | HNSW | HNSW | ✅ Implemented |
| **Max Vectors** | 50,000 vectors | 1,000 vectors | 10,000 vectors | 50,000 vectors | 1,000,000 vectors | ⏸️ Task: T075.11-enforcement |
| **Similarity Metric** | Cosine | Cosine | Cosine | Cosine | Cosine | ✅ Implemented |
| **Sparse Vectors (BM25)** | ✅ **Yes** | ❌ No | ❌ No | ✅ **Yes** | ✅ Yes | ✅ STANDARD (T075) |
| **Payload Indexing** | ✅ Optimized | Basic | Basic | ✅ Optimized | ✅ Optimized | ✅ STANDARD (T075) |

---

### 5. 🎓 Course Features

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Courses per Organization** | 100 courses | 2 courses | 20 courses | 100 courses | Unlimited | ⏸️ Task: T076-enforcement |
| **Collaborators** | 10 users | 1 user | 3 users | 10 users | Unlimited | ⏸️ Task: T077-RBAC |
| **Course Templates** | 20 templates | 3 basic | 10 templates | 20 templates | Unlimited + Custom | ⏸️ Task: T078-templates |
| **Analytics** | ✅ Advanced (engagement, time) | Basic | Basic | ✅ Advanced (engagement, time) | ✅ Advanced + Predictions | ⏸️ Task: T080-analytics |
| **API Access** | ✅ Limited (200 req/day) | ❌ No | ✅ Limited (50 req/day) | ✅ Limited (200 req/day) | ✅ Unlimited | ⏸️ Task: T081-API |

---

### 6. 📤 Course Export & Integrations

**⚠️ CRITICAL DIFFERENTIATOR**: TRIAL and FREE tiers have NO export capabilities (platform-only access)

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Export Capability** | ❌ **BLOCKED** | ❌ **BLOCKED** | ✅ Limited | ✅ Full | ✅ Full + API | ⏸️ Task: T079-export |
| **PDF Export** | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ⏸️ Task: T079.1-PDF |
| **DOCX Export** | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ⏸️ Task: T079.2-DOCX |
| **SCORM 1.2** | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ⏸️ Task: T079.3-SCORM |
| **SCORM 2004** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ⏸️ Task: T079.4-SCORM2004 |
| **HTML Standalone** | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ⏸️ Task: T079.5-HTML |
| **Moodle Integration** | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes + Auto-sync | ⏸️ Task: T079.6-Moodle |
| **Canvas LMS** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ⏸️ Task: T079.7-Canvas |
| **API Export** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes (programmatic) | ⏸️ Task: T079.8-API |
| **Watermarking** | N/A | N/A | ✅ Yes (mandatory) | ✅ Yes (optional) | ✅ Customizable | ⏸️ Task: T079.9-watermark |
| **Export Frequency** | N/A | N/A | 5 exports/month | 50 exports/month | Unlimited | ⏸️ Task: T079.10-limits |

**Export Restrictions:**
- **TRIAL**: Full STANDARD functionality BUT export blocked (platform-only) for 7-day evaluation period
- **FREE**: Platform-only access (no export) to encourage upgrades
- **BASIC**: Basic export (PDF, DOCX) with mandatory watermark, 5 exports/month limit
- **STANDARD**: Full LMS integration (SCORM, Moodle, HTML), optional watermark, 50 exports/month
- **PREMIUM**: All formats + API export + advanced LMS (Canvas, Blackboard) + custom branding + unlimited exports

**Critical**: TRIAL and STANDARD are functionally identical except TRIAL cannot export courses for 7 days.

---

### 7. 🔐 Security & Compliance

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Row-Level Security (RLS)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Implemented (T072.1) |
| **Data Encryption** | At-rest + In-transit | At-rest | At-rest + In-transit | At-rest + In-transit | At-rest + In-transit | ✅ Implemented |
| **Audit Logs** | ✅ 90 days | ❌ No | ✅ 30 days | ✅ 90 days | ✅ 1 year + Export | ⏸️ Task: T082-audit-logs |
| **SSO/SAML** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ **Yes** | ⏸️ Task: T083-SSO |
| **Custom Domain** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ⏸️ Task: T084-custom-domain |
| **SLA** | 99.5% uptime | None | 99% uptime | 99.5% uptime | 99.9% uptime + Support | ⏸️ Task: T085-SLA |
| **Data Residency** | Region selection | Shared | Shared | Region selection | Region selection + Private | ⏸️ Task: T085.1-residency |
| **Compliance Certifications** | SOC 2 Type II | None | None | SOC 2 Type II | SOC 2 + GDPR + HIPAA | ⏸️ Task: T085.2-compliance |

---

### 8. 💰 Billing & Usage

| Feature | TRIAL | FREE | BASIC | STANDARD | PREMIUM | Implementation Status |
|---------|-------|------|-------|----------|---------|----------------------|
| **Billing Cycle** | N/A (7 days) | N/A | Monthly/Annual | Monthly/Annual | Monthly/Annual + Custom | ⏸️ Task: T086-billing |
| **Trial Duration** | **7 days** | N/A | N/A | N/A | N/A | ⏸️ Task: T086.1-trial |
| **Usage Dashboard** | ✅ Yes + Forecasting | ❌ No | ✅ Yes | ✅ Yes + Forecasting | ✅ Yes + Forecasting + Alerts | ⏸️ Task: T087-usage-dashboard |
| **Cost Alerts** | ✅ Yes + Budget Controls | ❌ No | ✅ Yes | ✅ Yes + Budget Controls | ✅ Yes + Budget Controls + Webhooks | ⏸️ Task: T088-cost-alerts |
| **Invoice Export** | N/A | N/A | ✅ PDF | ✅ PDF + CSV | ✅ PDF + CSV + API | ⏸️ Task: T089-invoicing |
| **Payment Methods** | N/A | N/A | Card | Card + ACH | Card + ACH + Invoice | ⏸️ Task: T086.2-payment |

---

## 🚀 Implementation Roadmap

### Stage 0 (Current): STANDARD Tier Foundation ⭐

**Goal**: Implement STANDARD (Optimum) tier as primary offering (optimal quality/cost ratio)

**Critical**: STANDARD tier is our PRIMARY development target. All other tiers are variations of STANDARD.

| Task ID | Description | Status |
|---------|-------------|--------|
| T074 | ✅ Jina-v3 embeddings client | ✅ Complete |
| T074.1 | ✅ Chunking strategy research | ✅ Complete |
| **T074.1.2** | **✅ Docling MCP Server integration** (Docker + TypeScript client + BullMQ handler) | ✅ **Complete** |
| T074.2 | ✅ Define unified pricing tiers (5 tiers) | ✅ Complete |
| **T074.3** | **Implement Markdown conversion pipeline** (Docling MCP → Markdown → T075) | ⏸️ Next (blocks T075) |
| **T075** | **Implement STANDARD RAG** (hierarchical + late + BM25 hybrid + Markdown-based) | ⏸️ Pending T074.3 |
| T076 | Implement embedding generation service | ⏸️ Pending T075 |
| T077 | Implement vector upload service | ⏸️ Pending T075 |
| T078 | Implement semantic search service | ⏸️ Pending T075 |
| T079 | Implement vector lifecycle management | ⏸️ Pending T075 |

**T074.1.2 Details** (COMPLETE - Docling MCP Server Integration):
- **Development**: ✅ Complete (3 days)
- **Scope**: Docker infrastructure, TypeScript MCP client, BullMQ handler, type definitions
- **Components**:
  - Docker: Python 3.12 + Docling MCP Server (Streamable HTTP transport)
  - TypeScript: MCP client wrapper with retry logic (3 attempts, exponential backoff)
  - BullMQ: Document processing handler with progress tracking
  - Types: 2,400+ lines of DoclingDocument TypeScript definitions
- **Infrastructure**: $25-35/month per instance (2 CPU, 4GB RAM)
- **Performance**: 1-page PDF: 1-3s, 100-page PDF: 30-120s
- **Deliverables**: 7 files created, comprehensive documentation (3 guides)

**T074.3 Details** (NEXT - Markdown Conversion):
- **Development**: 2 days
- **Scope**: Convert DoclingDocument JSON → Markdown, Image extraction, Structure preservation
- **Input**: DoclingDocument JSON (from T074.1.2 MCP Server)
- **Output**: Clean Markdown text + metadata enrichment
- **Advantages**: Unified format for all document types, heading-based boundaries, human-readable
- **Cost**: $0 runtime (Docling native Markdown export)

**T075 Details** (UPDATED - Uses Markdown):
- **Development**: 5-7 days
- **Scope**: Markdown-based hierarchical chunking, Late chunking, BM25 hybrid, Comprehensive metadata
- **Input**: Markdown text from T074.3 + DoclingDocument JSON for metadata
- **Strategy**: Heading-based boundaries (#, ##, ###) via LangChain MarkdownHeaderTextSplitter
- **Expected**: -67% retrieval failures, 85-90% precision@10
- **Storage**: +55% overhead (parent + child + sparse + metadata)
- **Cost**: $0.02-0.025 per 1M tokens

---

### Stage 1: TRIAL & Tier Restrictions

**Goal**: Implement TRIAL tier (7-day limit) and tier-specific restrictions

| Task ID | Description | Defer to |
|---------|-------------|----------|
| T086.1-TRIAL | Implement 7-day trial duration enforcement | Stage 1 |
| T079.0-TRIAL | Block export for TRIAL tier (platform-only access) | Stage 1 |
| T075.1-TIER | Implement tier-based file format restrictions | Stage 1 |
| T075.3-TIER | Enforce lesson count limits per tier | Stage 1 |
| T075.11-TIER | Enforce vector count limits per tier | Stage 1 |

**Rationale**: TRIAL = STANDARD functionality with time limit + export blocking

---

### Stage 2: FREE/BASIC Simplifications

**Goal**: Create simplified/downgraded versions for lower tiers

| Task ID | Description | Defer to |
|---------|-------------|----------|
| T079.0-FREE | Block export for FREE tier (platform-only access) | Stage 2 |
| T075.12-FREE | Simplify RAG to fixed-size chunking (FREE tier) | Stage 2 |
| T075.13-FREE | Use cheaper embeddings for FREE (text-embedding-3-small) | Stage 2 |
| T075.14-FREE | Remove BM25 hybrid search (FREE tier) | Stage 2 |
| T075.15-BASIC | Implement basic hierarchical chunking (BASIC tier) | Stage 2 |
| T075.16-BASIC | Downgrade to GPT-4 (not Turbo) for BASIC tier | Stage 2 |

**Rationale**: FREE/BASIC = cost-optimized versions of STANDARD. Implement STANDARD first, then simplify.

---

### Stage 3: PREMIUM Tier Enhancements

**Goal**: Add advanced features for PREMIUM tier (maximum quality)

| Task ID | Description | Defer to | ROI |
|---------|-------------|----------|-----|
| **T075.4-PREMIUM** | **Multi-agent course generation (3 agents → judge)** | Stage 3 | **High** |
| T075.5-PREMIUM | Quality validation + human-in-loop | Stage 3 | Medium |
| T075.8-PREMIUM | Structure-aware chunking (advanced parsing) | Stage 3 | Medium |
| **T075.9-PREMIUM** | **Add reranking (Jina Reranker)** | Stage 3 | **High** |
| **T075.10-PREMIUM** | **Contextual enrichment (LLM-generated context)** | Stage 3 | **Medium** |
| T079.4-PREMIUM | SCORM 2004 export | Stage 3 | Low |
| T079.7-PREMIUM | Canvas LMS integration | Stage 3 | Medium |
| T079.8-PREMIUM | Programmatic API export | Stage 3 | High |
| T082-PREMIUM | Audit logs (1 year retention + export) | Stage 3 | Low |
| T083-PREMIUM | SSO/SAML integration | Stage 3-4 | High |

**Prioritization**:
1. **Must-have**: Multi-agent generation, Reranking (high quality impact)
2. **Should-have**: Contextual enrichment, Structure-aware chunking, API export
3. **Nice-to-have**: Audit logs, SSO, advanced SCORM (enterprise features)

---

## 💡 Feature Justification

### Why Hierarchical RAG in STANDARD (Optimum Strategy)

**Rationale**:
- ✅ **67% improvement** in retrieval quality (5-6% failures → <2%)
- ✅ **Minimal cost increase** ($0.02 → $0.02-0.025 per 1M tokens)
- ✅ **Production-ready** (5-7 days implementation for full STANDARD tier)
- ✅ **Competitive advantage**: Most competitors use naive chunking
- ✅ **BM25 hybrid search**: Zero cost (Qdrant sparse vectors included)
- ✅ **Late chunking**: Zero cost (Jina-v3 API parameter)

**BASIC tier alternative** (Stage 2 - simplified from STANDARD):
- Remove BM25 sparse vectors → semantic search only
- Simplify metadata schema (fewer fields, less storage)
- Remove document structure parsing
- Cost: $0.015-0.02/1M tokens (25% cheaper)
- Quality: Still good (hierarchical + late chunking retained)

**FREE tier alternative** (Stage 2 - minimal implementation):
- Fixed-size chunking (2000 chars, no hierarchy)
- No BM25 hybrid search
- Minimal metadata
- Cost: $0.01/1M tokens (50% cheaper storage)
- Quality: Acceptable for trial users
- Implementation: Use existing n8n baseline

---

### Why Multi-Agent Generation in PREMIUM?

**Rationale**:
- ✅ **Quality improvement**: +20-30% student satisfaction (estimated)
- ✅ **Cost**: 3x LLM calls (acceptable for $99/month tier)
- ✅ **Differentiation**: Clear value prop vs BASIC
- ✅ **Enterprise appeal**: Higher quality for corporate training

**BASIC tier alternative**: Single-shot generation (GPT-4 Turbo)
- Cost: 1x LLM call per lesson
- Quality: Still excellent with hierarchical RAG
- Implementation: Same infrastructure, simpler prompt

---

### Why Reranking in PREMIUM (not BASIC)?

**Rationale**:
- ⚠️ **Cost**: $30-300/month ongoing (vs one-time dev cost)
- ⚠️ **Improvement**: +7-10pp precision (82% → 90%) = marginal for most
- ✅ **PREMIUM use case**: High-stakes courses (medical, legal) need >90% accuracy

**BASIC tier sufficient**: Hierarchical + Hybrid already achieves 82-85% precision

---

### Why BM25 Hybrid in STANDARD?

**Rationale**:
- ✅ **Zero cost**: Qdrant sparse vectors included (no additional infrastructure)
- ✅ **Easy implementation**: Included in T075 (1-2 days within overall 5-7 day timeline)
- ✅ **High value**: +7-10pp precision improvement (82% → 89-92%)
- ✅ **Educational content fit**: Excellent for code snippets, formulas, technical terms
- ✅ **Production-ready**: Part of STANDARD (Optimum) tier

**BASIC tier**: Remove BM25 (semantic search only) to reduce storage costs by 15-20%

---

## 📐 Technical Architecture by Tier

### FREE Tier Stack

```
Simple Text Uploads ONLY (TXT, MD - max 5MB)
    ↓
Manual text paste or basic file upload
    ↓
NO ADVANCED DOCUMENT PROCESSING (no Docling)
    ↓
Fixed-size chunking (2000 chars, naive split)
    ↓
GPT-3.5 Turbo Course Generation (single-shot)
  - Template-based generation with basic text context
  - No semantic search / No RAG retrieval
  - Max 5 lessons per course
```

**Cost**: ~$0.005 per course (minimal LLM cost only)
**Storage**: 10 MB quota (text files only)
**Quality**: Basic courses with simple text context
**Note**: FREE tier supports TXT/MD only → no PDF/DOCX → no Docling → no advanced RAG

---

### STANDARD Tier Stack ⭐ (Primary Implementation - T075)

```
User Upload (PDF, DOCX, PPTX, HTML, TXT, MD - max 10MB WITHOUT images)
    ↓
Document Processing Pipeline:
  - Complex formats (PDF, DOCX, PPTX, HTML) → **Docling MCP Server** (T074.1.2)
  - Simple formats (TXT, MD) → Direct fs.readFile (no Docling overhead)
    ↓
Docling MCP Server (Python, Docker, Streamable HTTP):
  - Advanced PDF understanding (layout, reading order, tables, formulas)
  - Office formats parsing (DOCX, PPTX structure preservation)
  - HTML structure extraction
  - **Built-in OCR** (Tesseract/EasyOCR) for scanned PDFs - FREE
  - ⚠️ **NO image processing** (images ignored/removed)
  - Returns: DoclingDocument JSON → Markdown export
    ↓
Document Structure Parsing:
  - Extract headings (H1/H2/H3) from parsed Markdown
  - Identify sections, chapters, page numbers
    ↓
Hierarchical Chunking:
  - Parent: 1500 tokens (returned to LLM)
  - Child: 400 tokens (indexed in Qdrant)
  - Overlap: 50 tokens
  - Token-aware sizing (tiktoken)
  - Sentence boundaries (LangChain TokenTextSplitter)
    ↓
Jina-v3 Embeddings (768D, late_chunking=true)
  + BM25 Sparse Vectors (Qdrant native)
    ↓
Hybrid Search:
  - Semantic: Qdrant dense vectors (cosine similarity)
  - Lexical: Qdrant sparse vectors (BM25)
  - Fusion: Reciprocal Rank Fusion (RRF)
    ↓
Comprehensive Metadata:
  - Document hierarchy (chapter > section > heading)
  - Source location (page_number, page_range)
  - Content analysis (token_count, has_code, has_formulas)
  - Multi-tenancy (organization_id, course_id)
    ↓
GPT-4 Turbo Course Generation (single-shot)
```

**Cost**: ~$0.05-0.10 per course (includes Docling)
**Storage overhead**: +55% (parent chunks + metadata + sparse vectors)
**Quality**: 85-90% retrieval precision, <2% failures (-67%)
**Limitation**: Files WITHOUT images only (images → PREMIUM tier)
**Development**: 5-7 days (T075)

---

### BASIC Tier Stack (Stage 2 - Simplified from STANDARD)

```
User Upload (TXT, MD ONLY - max 10MB)
    ↓
Direct file read (fs.readFile - no Docling)
    ↓
Hierarchical Chunking:
  - Parent: 1500 tokens
  - Child: 400 tokens (indexed)
  - Overlap: 50 tokens
  - Token-aware sizing
  - Sentence boundaries (LangChain)
    ↓
Jina-v3 Embeddings (768D, late_chunking=true)
    ↓
Semantic Search ONLY:
  - Qdrant dense vectors (cosine similarity)
  - NO BM25 sparse vectors (removed)
    ↓
Simplified Metadata:
  - Basic info: document_id, chunk_index
  - NO structure parsing, NO heading hierarchy
  - NO Docling metadata (no page numbers, no tables)
    ↓
GPT-4 Course Generation (single-shot)
```

**Cost**: ~$0.02-0.03 per course (60% cheaper than STANDARD - no Docling overhead)
**Storage overhead**: +35% (parent chunks + minimal metadata)
**Quality**: 75-80% retrieval precision (text-only, no complex documents)
**Limitation**: TXT/MD only → no PDF/DOCX/PPTX → no Docling needed
**Implementation**: T075.15-BASIC (Stage 2)

---

### PREMIUM Tier Stack

```
User Upload (PDF, DOCX, PPTX, HTML, Images: PNG/JPG/GIF - max 100MB)
    ↓
PDF Chunking Pre-processor (for large files >10 MB):
  - Split large PDFs into 10 MB chunks (pdf-lib)
  - Process each chunk through Docling independently
  - Merge Markdown results with page continuity markers
  - Enables 100 MB file support (⏸️ Task: T075.XX-CHUNKING)
    ↓
Docling MCP Server (for PDF/DOCX/PPTX/HTML/Images):
  - Advanced PDF understanding (layout, reading order, tables, formulas)
  - Office formats parsing (DOCX, PPTX, XLSX)
  - HTML structure extraction
  - **Built-in OCR** for images and scanned PDFs (Tesseract/EasyOCR)
  - Image extraction
  - **Vision API*** for semantic image descriptions (Jina/OpenRouter/GPT-4o - TBD)
  - Returns: DoclingDocument JSON → Markdown + extracted images + descriptions
    ↓
Structure-Aware Hierarchical Chunking:
  - Parse document structure (headings, sections, tables)
  - Parent: 1500 tokens (section boundaries)
  - Child: 400 tokens (paragraph boundaries)
  - Razdel/jieba for multilingual sentence detection
    ↓
Contextual Enrichment (optional, for complex docs):
  - LLM generates 50-100 token context per chunk
  - Cost: +$1-10 per 1000 chunks (one-time)
    ↓
Jina-v3 Embeddings (768D, late_chunking=true)
    ↓
Hybrid Search + Reranking:
  - Stage 1: Retrieve 100 candidates (semantic + BM25)
  - Stage 2: Rerank with Jina Reranker (top 10)
    ↓
Multi-Agent Course Generation:
  - Agent 1 (Structured): Outline-focused
  - Agent 2 (Creative): Engagement-focused
  - Agent 3 (Concise): Brevity-focused
  - Judge Agent: Selects best sections → Final
```

**Cost**: ~$0.40-0.70 per course (includes OCR overhead + optional Vision API)
**Quality**: 90%+ retrieval precision, <1% failures
**OCR**: Supports scanned PDFs and image-based documents (PNG, JPEG, GIF)
**Vision API***: Optional semantic image descriptions (~$0.001-0.01 per image) - provider TBD

---

## 📊 Cost Analysis

### Infrastructure Costs (Monthly per org)

| Component | TRIAL | FREE | BASIC | STANDARD | PREMIUM |
|-----------|-------|------|-------|----------|---------|
| **Qdrant Storage** | $0.50 | $0 (shared) | $0.02 | $0.50 | $5 |
| **Jina Embeddings** | $2 | $0.05 | $0.20 | $2 | $8 |
| **LLM (GPT)** | $15 | $2 | $5 | $15 | $40 |
| **Docling MCP Server** | $0.20 (shared) | - | - | $0.20 (shared) | $0.20 (shared) |
| **Vision API (optional)** | - | - | - | - | $0.03-0.10/doc* |
| **Reranking** | - | - | - | - | $30-300 |
| **Total** | $17.70 | $2.05 | $5.22 | $17.70 | $83-353 |

*Vision API for image descriptions - provider TBD (Jina/OpenRouter/GPT-4o), feature under evaluation

**Docling MCP Infrastructure**:
- **Shared Instance** (TRIAL/STANDARD): Single Docker container (2 CPU, 8GB RAM with OCR) → ~$25-35/month → $0.20 per org (amortized over 150 orgs) - processes files WITHOUT images
- **No Docling** (FREE/BASIC): Text-only formats (TXT, MD), no complex document processing needed
- **PREMIUM**: Uses same shared instance + optional Vision API (~$0.001-0.01 per image, provider TBD) - processes files WITH images

**Margin Analysis**:
- **TRIAL**: $0 revenue - $17.70 cost (7 days only) = -$17.70 loss (acquisition cost)
- **FREE**: $0 revenue - $2.05 cost = -$2.05 (loss leader, subsidized by paid tiers)
- **BASIC**: $19 revenue - $5.22 cost = **$13.78 profit (72% margin)** ✅ (text-only, no Docling)
- **STANDARD**: $49 revenue - $17.70 cost = **$31.30 profit (64% margin)** ⭐ Best ROI (includes Docling + OCR, files WITHOUT images)
- **PREMIUM**: $149 revenue - $83 cost = **$66 profit (44% margin)** (includes Docling + OCR + Vision API + reranking, files WITH images)

**Break-even Analysis**:
- Need ~15% users on BASIC or 7% on STANDARD to subsidize FREE users
- TRIAL users convert at estimated 20-30% to paid tiers (industry standard)
- STANDARD tier provides best margin-to-value ratio (64% margin, optimal quality)
- PREMIUM highly profitable even with expensive features ($66 profit per org)

---

## 🔄 Migration Paths

### FREE → BASIC Upgrade

**Triggers**:
- Hit 10 MB storage limit
- Need more than 10 lessons/course
- Want better quality (lower retrieval failures)
- Need team collaboration (>1 user)

**Migration**:
1. Re-index vectors with Jina-v3 + hierarchical chunking
2. Enable BM25 hybrid search
3. Unlock GPT-4 Turbo
4. Increase storage quota: 10 MB → 100 MB

---

### BASIC → PREMIUM Upgrade

**Triggers**:
- Need >90% retrieval precision (high-stakes content)
- Want multi-agent generation (maximum quality)
- Hit 100 MB storage limit
- Need SSO/SAML (enterprise requirement)

**Migration**:
1. Enable reranking (Jina Reranker)
2. Enable multi-agent generation
3. Optionally: Re-index with contextual enrichment
4. Increase storage quota: 100 MB → 10 GB

---

## 📝 Open Questions & Future Work

### Questions for Product Team

1. **Pricing Confirmation**: Are $19 (BASIC) and $99 (PREMIUM) acceptable?
2. **FREE Tier Sustainability**: Can we support loss-leader with BASIC margins?
3. **STANDARD Tier**: Keep or remove? (currently unused, 1GB at $1073741824)
4. **Annual Discounts**: Offer 2 months free for annual plans?
5. **Usage-Based Pricing**: Should PREMIUM be usage-based instead of flat $99?

### Future Enhancements

- **Tier Auto-Upgrade**: Automatically upgrade FREE users hitting limits
- **A/B Testing**: Multi-agent vs single-shot quality comparison
- **Cost Monitoring**: Real-time cost tracking per organization
- **Feature Flags**: Toggle PREMIUM features individually for testing

---

## 🔗 Related Tasks

### Implementation Tasks
- T074: ✅ Jina-v3 embeddings client
- T074.1: ✅ Chunking research
- **T074.2**: 🔄 This document (pricing tiers)
- **T075**: ⏸️ Implement BASIC RAG (hierarchical + late + hybrid)
- T076: ⏸️ Course generation (single-shot)

### Deferred Tasks (FREE Simplifications)
- T075.1-FREE: ⏸️ Limit file formats (PDF, TXT)
- T075.3-FREE: ⏸️ Enforce 10 lessons/course
- T075.12-FREE: ⏸️ Simplify to fixed-size chunking
- T075.13-FREE: ⏸️ Use cheaper embeddings
- T075.14-FREE: ⏸️ Remove BM25 hybrid

### Deferred Tasks (PREMIUM Enhancements)
- **T075.4-PREMIUM**: ⏸️ Multi-agent generation (HIGH PRIORITY)
- T075.5-PREMIUM: ⏸️ Quality validation + human-in-loop
- T075.8-PREMIUM: ⏸️ Structure-aware chunking
- **T075.9-PREMIUM**: ⏸️ Add reranking (HIGH PRIORITY)
- T075.10-PREMIUM: ⏸️ Contextual enrichment
- T082-PREMIUM: ⏸️ Audit logs
- T083-PREMIUM: ⏸️ SSO/SAML

---

## ✅ Approval & Sign-Off

**Document Status**: Draft
**Review Date**: 2025-01-14
**Approved By**: Pending

**Next Steps**:
1. Review this document with product/business team
2. Confirm pricing ($0, $19, $99) and margins
3. Approve feature distribution
4. Proceed with T075 (BASIC RAG implementation)

---

**Version History**:
- v2.1.0 (2025-10-14): Added Docling MCP Server integration, moved PDF to STANDARD tier, updated cost analysis
- v2.0.0 (2025-01-14): Added TRIAL tier, updated to 5-tier system
- v1.0.0 (2025-01-14): Initial draft with FREE/BASIC/PREMIUM tiers
