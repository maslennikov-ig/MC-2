/**
 * Check document processed_content status
 */
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

async function main() {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('file_catalog')
    .select('id, filename, vector_status, processing_method, processed_content')
    .eq('course_id', 'ecb974f4-14e4-43b0-8af8-927056fa2365');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Documents status for COMPACT course:');
  console.log('');
  data?.forEach(d => {
    const hasContent = d.processed_content !== null;
    const contentLen = d.processed_content ? d.processed_content.length : 0;
    console.log(`File: ${d.filename}`);
    console.log(`  vector_status: ${d.vector_status}`);
    console.log(`  processing_method: ${d.processing_method || 'NULL'}`);
    console.log(`  processed_content: ${hasContent ? `YES (${contentLen} chars)` : 'NULL'}`);
    console.log('');
  });

  process.exit(0);
}

main();
