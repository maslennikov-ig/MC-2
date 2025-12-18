import { getDoclingClient } from './src/shared/docling/client'

async function debugExport() {
  const client = getDoclingClient()
  const pdfPath = '/home/me/code/megacampus2/packages/course-gen-platform/tests/integration/fixtures/common/sample-course-material.pdf'
  
  console.log('🔍 Debug: Testing Docling export for PDF')
  console.log('📄 PDF path:', pdfPath)
  
  try {
    const result = await client['convertDocument']({
      file_path: pdfPath,
      output_format: 'markdown'
    })
    
    console.log('\n✅ Result object:', JSON.stringify(result, null, 2))
    console.log('\n📊 Result keys:', Object.keys(result))
    console.log('📊 Result.success:', result.success)
    console.log('📊 Result.content type:', typeof result.content)
    console.log('📊 Result.content length:', result.content?.length || 0)
    console.log('📊 Result.content preview:', result.content?.substring(0, 200))
  } catch (error) {
    console.error('\n❌ Error:', error)
  }
}

debugExport()
