# Integration Test Fixtures

## Required Test Files

This directory should contain the following test files for integration tests:

### 1. sample-course-material.pdf
- **Size**: ~2MB
- **Content**: Multilingual (English + Russian) course material
- **Structure**: Hierarchical with headings and paragraphs
- **Purpose**: Test PDF processing through Docling + chunking + vectorization
- **Expected chunks**: ~15 (5 parents, 15 children)

### 2. sample-course-material.docx
- **Size**: ~500KB
- **Content**: Multilingual (English + Russian) course material
- **Structure**: Hierarchical with headings and paragraphs
- **Purpose**: Test DOCX processing through Docling
- **Expected chunks**: ~10 (3 parents, 10 children)

### 3. sample-course-material.txt
- **Size**: ~50KB
- **Content**: Plain text course material
- **Structure**: Simple paragraphs (no complex formatting)
- **Purpose**: Test TXT processing (baseline, no Docling needed)
- **Expected chunks**: ~5 (2 parents, 5 children)

### 4. sample-course-material.md
- **Size**: ~50KB
- **Content**: Markdown formatted course material
- **Structure**: Headings (# ## ###) + paragraphs + lists
- **Purpose**: Test Markdown processing with hierarchy
- **Expected chunks**: ~5 (2 parents, 5 children)

## How to Add Test Files

### Option A: Use Existing Test Files from Stage 0-1
If test files were created in earlier stages:
```bash
# Copy from earlier test directories
cp path/to/existing/fixtures/*.pdf ./
cp path/to/existing/fixtures/*.docx ./
cp path/to/existing/fixtures/*.txt ./
cp path/to/existing/fixtures/*.md ./
```

### Option B: Create New Test Files
1. **PDF**: Create a document in Word/LibreOffice, add multilingual content, export to PDF
2. **DOCX**: Create a Word document with headings and paragraphs
3. **TXT**: Create a plain text file with course content
4. **MD**: Create a Markdown file with # headings and paragraphs

### Content Requirements
- **Multilingual**: Include both English and Russian text (tests Jina-v3 multilingual embeddings)
- **Hierarchical**: Use headings (H1, H2, H3) to create parent/child chunk structure
- **Length**: Sufficient to generate expected chunk counts (see above)

Example Markdown content:
```markdown
# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence...

## Supervised Learning

Supervised learning uses labeled training data...

### Classification

Classification algorithms predict discrete categories...

### Regression

Regression algorithms predict continuous values...
```

## Verification

After adding files, verify they exist:
```bash
ls -lh fixtures/common/
# Should show 4 files: .pdf, .docx, .txt, .md
```

Run integration tests to validate fixtures work:
```bash
pnpm test:integration document-processing-worker.test.ts
```

## Notes

- These fixtures are shared across all tier tests (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
- File formats must match tier restrictions (see PRICING-TIERS.md)
- Test cleanup will delete uploaded copies, but fixtures remain in this directory

## Important Notes

### PDF File Versions
- **sample-course-material.pdf**: Original PDF file (6.1MB)
  - **Reason**: Docling MCP caches document conversions by file path hash
  - **Issue**: Cached empty result for original PDF filename
  - **Solution**: Using different filename generates different cache key
  - **Date**: 2025-10-26
  - **Investigation**: See `docs/investigations/docling-cache-pdf-investigation.md`

