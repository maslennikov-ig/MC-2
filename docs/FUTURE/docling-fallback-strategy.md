# Docling Fallback Strategy: Two-Tier Approach

**Task ID**: FUTURE-INFRA-002
**Priority**: P1 (High - Reliability)
**Tier**: All tiers (Infrastructure)
**Created**: 2025-10-27
**Estimated Effort**: 1-2 weeks
**Status**: Backlog (Stage 2)

---

## 📋 Overview

Implement a two-tier fallback strategy for robust document conversion when Docling fails or returns empty results.

**Context**: Investigation of Task 008 revealed that Docling can fail to extract text from certain PDFs (e.g., `sample-course-material.pdf`), even though the PDF contains valid text. This requires a fallback mechanism for production reliability.

**Reference**: [Task 008 Investigation](../investigations/008-docling-pdf-export-investigation.md)

---

## 🎯 Goals

### Primary Goals
1. **100% document processing reliability** - No silent failures
2. **Automatic fallback** - No manual intervention required
3. **Performance optimization** - Fast fallback detection (<5 seconds)
4. **Cost optimization** - Use cheapest working method

### Success Metrics
- ✅ Zero empty results for valid documents
- ✅ Fallback triggered within 5 seconds of Docling failure
- ✅ <10% of documents require fallback (Docling should work for 90%+)
- ✅ Cost increase <5% from fallback usage

---

## 🔄 Two-Tier Fallback Architecture

```
User Upload → Docling MCP (Primary)
                  ↓ Success (90%+)
              Markdown ✅

                  ↓ Failure/Empty

         Tier 1: Docling Built-in Fallback
         (anchor extraction via MCP tools)
                  ↓ Success (~5-7%)
              Markdown ✅

                  ↓ Failure/Empty

         Tier 2: External Library Fallback
         (PyMuPDF4LLM, Marker, or MinerU)
                  ↓ Success (~2-3%)
              Markdown ✅

                  ↓ Failure (rare <1%)
              Error + Manual Review
```

---

## 🛠️ Implementation Design

### Tier 0: Primary (Docling MCP)

**Current implementation** - No changes needed

```typescript
async function convertDocument(filePath: string): Promise<ConversionResult> {
  try {
    const markdown = await doclingClient.convertToMarkdown(filePath);

    // Check for empty or invalid result
    if (!markdown || markdown.trim().length < 100) {
      throw new DoclingError('Empty or insufficient content');
    }

    return {
      success: true,
      markdown,
      method: 'docling-primary',
      fallbackUsed: false,
    };
  } catch (error) {
    // Trigger Tier 1 fallback
    return await tier1Fallback(filePath, error);
  }
}
```

**Success Rate**: 90-95% (based on investigation findings)
**Cost**: $0.02-0.05 per document
**Time**: 15-120 seconds

---

### Tier 1: Docling Anchor Extraction Fallback

**New implementation** - Use Docling MCP tools to extract text by anchors

**Approach**:
1. DoclingDocument was created successfully (confirmed by document_key)
2. Markdown export failed (empty string returned)
3. Use `get_overview_of_document_anchors` to get document structure
4. Use `get_text_of_document_item_at_anchor` to extract text piece by piece
5. Manually reconstruct markdown from extracted pieces

**Code**:
```typescript
// packages/course-gen-platform/src/shared/docling/fallback-tier1.ts

export interface DocumentAnchor {
  id: string;
  type: 'heading' | 'paragraph' | 'table' | 'figure' | 'code';
  level?: number;
  position: { page: number; order: number };
}

export class DoclingAnchorFallback {
  constructor(private client: DoclingClient) {}

  async extractViaAnchors(documentKey: string): Promise<string> {
    // Step 1: Get document structure
    const anchorsResult = await this.client['client'].callTool({
      name: 'get_overview_of_document_anchors',
      arguments: { document_key: documentKey },
    });

    const anchors: DocumentAnchor[] = JSON.parse(
      (anchorsResult.content as any).find((c: any) => c.type === 'text').text
    ).anchors;

    // Step 2: Extract text from each anchor
    const fragments: string[] = [];

    for (const anchor of anchors) {
      try {
        const textResult = await this.client['client'].callTool({
          name: 'get_text_of_document_item_at_anchor',
          arguments: {
            document_key: documentKey,
            anchor: anchor.id,
          },
        });

        const text = JSON.parse(
          (textResult.content as any).find((c: any) => c.type === 'text').text
        ).text;

        // Format based on anchor type
        const formatted = this.formatAnchorText(anchor, text);
        fragments.push(formatted);

      } catch (error) {
        // Skip failed anchors, continue with others
        console.warn(`Failed to extract anchor ${anchor.id}:`, error);
      }
    }

    // Step 3: Combine into markdown
    return fragments.filter(f => f.trim().length > 0).join('\n\n');
  }

  private formatAnchorText(anchor: DocumentAnchor, text: string): string {
    switch (anchor.type) {
      case 'heading':
        const prefix = '#'.repeat(anchor.level || 1);
        return `${prefix} ${text}`;

      case 'code':
        return `\`\`\`\n${text}\n\`\`\``;

      case 'table':
        // Already formatted as markdown table by Docling
        return text;

      default:
        return text;
    }
  }
}

// Integration with main client
export async function tier1Fallback(
  filePath: string,
  primaryError: Error
): Promise<ConversionResult> {
  console.warn('Docling primary export failed, trying Tier 1 fallback', {
    file: filePath,
    error: primaryError.message,
  });

  try {
    // Get document_key from primary conversion
    const conversionResult = await doclingClient['client'].callTool({
      name: 'convert_document_into_docling_document',
      arguments: { source: filePath },
    });

    const documentKey = JSON.parse(
      (conversionResult.content as any).find((c: any) => c.type === 'text').text
    ).document_key;

    // Try anchor extraction
    const fallback = new DoclingAnchorFallback(doclingClient);
    const markdown = await fallback.extractViaAnchors(documentKey);

    if (!markdown || markdown.trim().length < 100) {
      throw new Error('Tier 1 fallback produced insufficient content');
    }

    return {
      success: true,
      markdown,
      method: 'docling-tier1-anchors',
      fallbackUsed: true,
    };

  } catch (error) {
    // Trigger Tier 2 fallback
    return await tier2Fallback(filePath, error);
  }
}
```

**Success Rate**: 5-7% of failures (catches most structured documents with extraction issues)
**Cost**: $0.02-0.05 per document (same as primary, more MCP calls but no additional API costs)
**Time**: +10-30 seconds (multiple MCP tool calls)

---

### Tier 2: External Library Fallback

**New implementation** - Use external PDF libraries as last resort

**Library Options**:

| Library | Speed | Quality | Cost | Use Case |
|---------|-------|---------|------|----------|
| **PyMuPDF4LLM** | Very Fast (2-5s) | Good | Free | Simple PDFs, fallback |
| **Marker** | Slow (30-120s) | Excellent | Free | Complex PDFs, high quality |
| **MinerU** | Medium (15-45s) | Very Good | Free | Table-heavy PDFs |
| **MarkItDown** | Fast (5-10s) | Basic | Free | Simple text extraction |

**Recommendation**: **PyMuPDF4LLM** as default Tier 2, **Marker** as Tier 2b for complex documents

**Code**:
```typescript
// packages/course-gen-platform/src/shared/docling/fallback-tier2.ts

export interface ExternalConverter {
  name: string;
  convert(filePath: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

// PyMuPDF4LLM Converter
export class PyMuPDF4LLMConverter implements ExternalConverter {
  name = 'pymupdf4llm';

  async convert(filePath: string): Promise<string> {
    // Call Python script via child_process
    const result = await execAsync(
      `python3 /path/to/pymupdf-converter.py "${filePath}"`
    );

    return result.stdout;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('python3 -c "import pymupdf4llm"');
      return true;
    } catch {
      return false;
    }
  }
}

// Marker Converter (for complex documents)
export class MarkerConverter implements ExternalConverter {
  name = 'marker';

  async convert(filePath: string): Promise<string> {
    // Call Marker via Docker container
    const result = await execAsync(
      `docker run --rm -v "${path.dirname(filePath)}:/input" marker /input/${path.basename(filePath)}`
    );

    return result.stdout;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('docker image inspect marker:latest');
      return true;
    } catch {
      return false;
    }
  }
}

// Tier 2 Orchestrator
export class Tier2FallbackOrchestrator {
  private converters: ExternalConverter[] = [
    new PyMuPDF4LLMConverter(),
    new MarkerConverter(),
  ];

  async convertWithFallback(filePath: string): Promise<string> {
    for (const converter of this.converters) {
      if (!(await converter.isAvailable())) {
        console.warn(`Converter ${converter.name} not available, skipping`);
        continue;
      }

      try {
        console.log(`Trying Tier 2 converter: ${converter.name}`);
        const markdown = await converter.convert(filePath);

        if (markdown && markdown.trim().length >= 100) {
          return markdown;
        }

      } catch (error) {
        console.warn(`Converter ${converter.name} failed:`, error);
        // Try next converter
      }
    }

    throw new Error('All Tier 2 converters failed');
  }
}

// Integration
export async function tier2Fallback(
  filePath: string,
  tier1Error: Error
): Promise<ConversionResult> {
  console.error('Tier 1 fallback failed, trying Tier 2', {
    file: filePath,
    tier1Error: tier1Error.message,
  });

  try {
    const orchestrator = new Tier2FallbackOrchestrator();
    const markdown = await orchestrator.convertWithFallback(filePath);

    return {
      success: true,
      markdown,
      method: 'tier2-external-library',
      fallbackUsed: true,
    };

  } catch (error) {
    // Complete failure - manual intervention required
    return {
      success: false,
      error: new DoclingError(
        DoclingErrorCode.COMPLETE_FAILURE,
        'All conversion methods failed',
        { primaryError, tier1Error, tier2Error: error }
      ),
      method: 'none',
      fallbackUsed: true,
    };
  }
}
```

**Success Rate**: 2-3% of failures (catches remaining edge cases)
**Cost**: Free (open-source libraries)
**Time**: 2-120 seconds (depending on library and document complexity)

---

## 📊 Expected Outcomes

### Success Rate Distribution

| Tier | Success Rate | Cumulative | Documents per 1000 |
|------|--------------|------------|-------------------|
| **Tier 0 (Docling Primary)** | 90-95% | 90-95% | 900-950 |
| **Tier 1 (Anchors)** | 3-7% | 93-99% | 30-70 |
| **Tier 2 (External)** | 1-3% | 95-99.5% | 10-30 |
| **Complete Failure** | <0.5% | <99.5% | <5 |

**Target**: <5 failures per 1000 documents (<0.5%)

### Performance Impact

| Metric | Primary | With Fallback | Change |
|--------|---------|---------------|--------|
| **Avg Processing Time** | 30-60s | 35-70s | +5-10s (+10-15%) |
| **P95 Processing Time** | 120s | 180s | +60s (+50%) |
| **Success Rate** | 90-95% | >99% | +5-9pp |
| **Cost per Document** | $0.03 | $0.031 | +$0.001 (+3%) |

### Cost Analysis

| Scenario | Frequency | Cost | Notes |
|----------|-----------|------|-------|
| **Primary Success** | 92% | $0.03 | Standard Docling |
| **Tier 1 Fallback** | 6% | $0.03 | Same cost (Docling MCP tools) |
| **Tier 2 Fallback** | 2% | $0.00 | Free (OSS libraries) |
| **Average** | 100% | $0.0306 | +2% vs primary only |

**Conclusion**: Fallback adds minimal cost (~2%) while dramatically improving reliability (90% → 99%+)

---

## 🔧 Implementation Plan

### Phase 1: Tier 1 Fallback (Week 1)

**Days 1-2**: Research & Design
- [ ] Study Docling MCP anchor tools
- [ ] Design anchor extraction algorithm
- [ ] Create test cases with problematic PDFs

**Days 3-4**: Implementation
- [ ] Implement `DoclingAnchorFallback` class
- [ ] Integrate with main conversion flow
- [ ] Add logging and monitoring

**Day 5**: Testing & Validation
- [ ] Test with `sample-course-material.pdf`
- [ ] Test with other edge case PDFs
- [ ] Measure performance impact

### Phase 2: Tier 2 Fallback (Week 2)

**Days 1-2**: External Library Setup
- [ ] Install PyMuPDF4LLM (Python package)
- [ ] Set up Marker Docker image
- [ ] Create Python wrapper scripts

**Days 3-4**: Implementation
- [ ] Implement `ExternalConverter` interface
- [ ] Implement `Tier2FallbackOrchestrator`
- [ ] Integrate with fallback chain

**Day 5**: Testing & Validation
- [ ] Test all fallback paths end-to-end
- [ ] Benchmark performance
- [ ] Validate cost tracking

### Phase 3: Monitoring & Rollout (2-3 days)

- [ ] Add fallback metrics to monitoring
- [ ] Create alerts for high fallback rate (>10%)
- [ ] Document fallback behavior
- [ ] Gradual rollout (PREMIUM → STANDARD → BASIC)

**Total Timeline**: 2 weeks

---

## 🧪 Testing Strategy

### Test Cases

#### TC1: Docling Primary Success (Happy Path)
```typescript
test('primary conversion succeeds', async () => {
  const result = await convertDocument('valid-pdf.pdf');

  expect(result.success).toBe(true);
  expect(result.method).toBe('docling-primary');
  expect(result.fallbackUsed).toBe(false);
  expect(result.markdown.length).toBeGreaterThan(100);
});
```

#### TC2: Tier 1 Fallback Triggered
```typescript
test('tier 1 fallback on empty markdown', async () => {
  // Use sample-course-material.pdf (known to fail primary)
  const result = await convertDocument('sample-course-material.pdf');

  expect(result.success).toBe(true);
  expect(result.method).toBe('docling-tier1-anchors');
  expect(result.fallbackUsed).toBe(true);
  expect(result.markdown.length).toBeGreaterThan(100);
});
```

#### TC3: Tier 2 Fallback Triggered
```typescript
test('tier 2 fallback when tier 1 fails', async () => {
  // Mock Tier 1 to fail
  jest.spyOn(DoclingAnchorFallback.prototype, 'extractViaAnchors')
    .mockRejectedValue(new Error('Tier 1 failed'));

  const result = await convertDocument('problematic.pdf');

  expect(result.success).toBe(true);
  expect(result.method).toMatch(/tier2-/);
  expect(result.fallbackUsed).toBe(true);
});
```

#### TC4: Complete Failure
```typescript
test('complete failure with error', async () => {
  // Mock all tiers to fail
  const result = await convertDocument('completely-broken.pdf');

  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.method).toBe('none');
  expect(result.fallbackUsed).toBe(true);
});
```

### Integration Tests
- [ ] End-to-end test with 100 diverse PDFs
- [ ] Measure fallback rate (should be <10%)
- [ ] Validate markdown quality from each tier
- [ ] Test performance under load

---

## 📈 Monitoring & Alerts

### Metrics to Track

```typescript
// Prometheus metrics
export const conversionMetrics = {
  totalConversions: new Counter({
    name: 'docling_conversions_total',
    help: 'Total document conversions',
    labelNames: ['method', 'success'],
  }),

  fallbackRate: new Gauge({
    name: 'docling_fallback_rate',
    help: 'Percentage of conversions using fallback',
  }),

  processingTime: new Histogram({
    name: 'docling_processing_seconds',
    help: 'Time taken for document processing',
    labelNames: ['method'],
    buckets: [1, 5, 10, 30, 60, 120, 300],
  }),
};
```

### Alerts

```yaml
# Alert if fallback rate >10% (indicates Docling issues)
- alert: HighDoclingFallbackRate
  expr: docling_fallback_rate > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High Docling fallback rate detected"
    description: "{{ $value }}% of conversions are using fallback"

# Alert if any tier completely fails
- alert: DoclingTierFailure
  expr: rate(docling_conversions_total{success="false"}[5m]) > 0.01
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Docling tier failures detected"
```

---

## 🚨 Risks & Mitigation

### Risk 1: Tier 2 Libraries Not Installed
**Probability**: Medium
**Impact**: High (Tier 2 fallback fails)

**Mitigation**:
- Add availability checks (`isAvailable()`)
- Graceful degradation (skip unavailable converters)
- Docker-based deployment (bundle everything)
- CI/CD validation (ensure all dependencies present)

### Risk 2: Performance Degradation
**Probability**: Low
**Impact**: Medium

**Mitigation**:
- Fast failure detection (<5s for empty result)
- Parallel processing where possible
- Caching of successful conversions
- Monitoring and alerting

### Risk 3: Quality Variance Between Tiers
**Probability**: Medium
**Impact**: Low-Medium

**Mitigation**:
- Validate minimum quality threshold (>100 chars)
- Log quality metrics per tier
- A/B test quality in production
- Allow manual review for critical documents

---

## ✅ Success Criteria

### Functional
- [ ] All three tiers implemented and tested
- [ ] Fallback chain works end-to-end
- [ ] Success rate >99% (vs 90-95% without fallback)
- [ ] Each tier properly logs method used

### Non-Functional
- [ ] Processing time increase <15% (avg)
- [ ] Cost increase <5%
- [ ] No memory leaks or resource exhaustion
- [ ] Monitoring and alerting in place

### Business
- [ ] Zero customer complaints about "empty results"
- [ ] <5 manual interventions per 1000 documents
- [ ] Positive feedback on reliability improvement

---

## 📚 References

### Internal
- [Task 008 Investigation](../investigations/008-docling-pdf-export-investigation.md)
- [Docling Best Practices](../investigations/docling-optimal-strategies.md)
- [PRICING-TIERS.md](../PRICING-TIERS.md)

### External Libraries
- [PyMuPDF4LLM](https://github.com/pymupdf/PyMuPDF4LLM) - Fast, simple PDF to Markdown
- [Marker](https://github.com/VikParuchuri/marker) - High-quality PDF conversion
- [MinerU](https://github.com/opendatalab/MinerU) - Table-focused PDF extraction
- [MarkItDown](https://github.com/microsoft/markitdown) - Microsoft's PDF converter

---

**Created**: 2025-10-27
**Status**: Backlog (Stage 2)
**Priority**: P1 (High - Reliability)
**Assignee**: TBD
