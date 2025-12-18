# Summary: Docling PDF Export Issue - Continuation Context

**Date**: 2025-10-27
**Task**: 008-fix-docling-pdf-export-empty-markdown
**Status**: 🔴 Issue persists - Need alternative solution

---

## 🎯 Problem Summary

Docling MCP Server v1.3.2 (latest) returns **empty markdown** for PDF files, even though:
- ✅ PDF conversion succeeds (19-20 seconds)
- ✅ Document is cached with valid key
- ✅ DOCX and TXT files work perfectly
- ❌ `export_to_markdown()` returns `""` for PDFs

---

## ✅ What We Tested

### 1. Cache Issues ❌
- Cleared all Docling cache (`/app/cache/*`, `/root/.cache/`, `/tmp/`)
- Restarted container
- **Result**: No change

### 2. File Renaming ❌
- Renamed `sample-course-material.pdf` → `sample-course-material-v3.pdf`
- **Result**: Still empty (`Length: 0`)

### 3. Backend Change ❌
- Tried `PyPdfiumDocumentBackend` instead of default
- **Result**: Still empty

### 4. Version Updates ❌
- Already on latest: docling 2.58.0, docling-mcp 1.3.2
- **Result**: No newer versions available

### 5. GitHub Research ✅
- Found similar issues (#2021, #960)
- Users report `export_to_markdown()` failures
- Suggested workaround: Use JSON export instead

---

## 📄 Test Files

**Current problematic file**:
```
/home/me/code/megacampus2/packages/course-gen-platform/tests/integration/fixtures/common/sample-course-material-v3.pdf
- Size: 6.1 MB
- Pages: 10
- Type: Native Word-to-PDF (NOT scanned image)
- Content: Machine Learning course material (EN + RU)
```

**NEW file to test**:
```
/home/me/code/megacampus2/packages/course-gen-platform/tests/integration/fixtures/common/2510.13928v1.pdf
- To be tested in new context
```

**Working alternatives**:
- ✅ `sample-course-material.txt` (8.7K) - works
- ✅ `sample-course-material.docx` (696K) - works

---

## 🔧 Next Actions

### Immediate Priority
1. **Test new PDF file** (`2510.13928v1.pdf`)
   - If works → identify difference between PDFs
   - If fails → confirms systematic issue

### If New PDF Also Fails
**Option A: Implement Workaround** (2-3 hours)
- Use `export_to_dict()` instead of `export_to_markdown()`
- Parse JSON structure manually
- Generate markdown from dict

**Option B: Switch Libraries** (4-6 hours)
- Use PyMuPDF4LLM, Unstructured, or MarkItDown
- Refactor conversion pipeline
- Update tests

**Option C: File Bug Report & Wait** (blocks work)
- Create detailed reproduction
- Submit to docling-project/docling
- Unknown timeline

---

## 📝 Key Code Locations

**Investigation Report**:
- Full report: `docs/investigation/008-docling-pdf-export-investigation.md`

**Client Code**:
- `packages/course-gen-platform/src/shared/docling/client.ts:349-387`
- Export call at line 350-357
- Logging added at lines 368-377

**MCP Server** (inside container):
- Conversion: `/usr/local/lib/python3.12/site-packages/docling_mcp/tools/conversion.py`
- Export: `/usr/local/lib/python3.12/site-packages/docling_mcp/tools/generation.py`

**Tests**:
- Manual: `tests/manual/docling-pdf-direct.test.ts`
- Integration: `tests/integration/document-processing-worker.test.ts:727-750`

---

## 🐛 Root Cause

**Docling's `export_to_markdown()` method has a bug** where it returns empty strings for certain PDF files, even though:
- The PDF contains valid text (verified via TXT conversion)
- The `DoclingDocument` is created successfully
- Other export formats might work (not yet tested)

This is **NOT** a client-side issue - the MCP server correctly calls `doc.export_to_markdown()`, but Docling library itself returns `""`.

---

## 💡 Recommended Approach

1. **Test** `2510.13928v1.pdf` first
2. If fails → **Implement Option A** (JSON workaround)
3. File upstream bug with both PDFs as examples
4. Monitor for Docling fix in future releases

---

**Prepared by**: Claude AI Agent
**For**: New context continuation
**Estimated remaining work**: 3-4 hours with workaround
