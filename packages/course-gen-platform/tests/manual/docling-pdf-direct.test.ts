/**
 * Minimal test to check if Docling can process PDF directly
 * Run with: pnpm test tests/manual/docling-pdf-direct.test.ts
 */

import { describe, it, expect } from 'vitest'
import { getDoclingClient } from '../../src/shared/docling/client'
import path from 'path'

// Helper to check if Docling server is available
async function isDoclingServerAvailable(): Promise<boolean> {
  try {
    const client = getDoclingClient()
    await client.connect()
    await client.disconnect()
    return true
  } catch {
    return false
  }
}

const serverAvailable = await isDoclingServerAvailable()

describe('Docling Direct PDF Test', () => {
  it.skipIf(!serverAvailable)('should process PDF file and return markdown', async () => {
    const pdfPath = path.join(__dirname, '../integration/fixtures/common/2510.13928v1.pdf')

    console.log('\n🔍 Testing Docling with PDF file directly...')
    console.log('📄 PDF path:', pdfPath)

    const doclingClient = getDoclingClient()
    const startTime = Date.now()

    const result = await doclingClient.convertToMarkdown(pdfPath, {
      include_images: false,
      include_tables: true,
      include_formulas: true,
      include_ocr: true,
    })

    const duration = Date.now() - startTime

    console.log('\n✅ Docling processed successfully!')
    console.log('⏱️  Duration:', duration, 'ms')
    console.log('\n📊 Results:')
    console.log('  - document_key:', result.document_key)
    console.log('  - from_cache:', result.from_cache)
    console.log('  - markdown_length:', result.markdown.length, 'chars')
    console.log('  - images:', result.images.length)
    console.log('  - sections:', result.sections.length)
    console.log('\n📝 Markdown preview (first 500 chars):')
    console.log('---')
    console.log(result.markdown.substring(0, 500))
    console.log('---\n')

    // Assertions
    expect(result.document_key).toBe('46be4ff2b5f7df2d5a6e89fb24808e00')
    expect(result.markdown.length).toBeGreaterThan(130000) // Should be ~131,564 chars
    expect(result.markdown).toContain('BRAIN ROT') // Should contain content from the paper
  }, 120000) // 2 minute timeout
})
