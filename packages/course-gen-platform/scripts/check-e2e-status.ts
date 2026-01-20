/**
 * Check E2E test course statuses
 */
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

async function main() {
  const db = getSupabaseAdmin();

  const ids = [
    'bde705b8-08f9-4899-b688-9ce9772cfa08', // MICRO
    'df2edc4f-8585-4685-be41-4ca6a11f05b0', // MINI
    'ecb974f4-14e4-43b0-8af8-927056fa2365', // COMPACT
  ];

  const { data, error } = await db
    .from('courses')
    .select('id, course_size, generation_status, title')
    .in('id', ids);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('=== E2E Test Course Statuses ===');
  data?.forEach(c => {
    const label = (c.course_size || '?').toUpperCase().padEnd(8);
    console.log(`${label}: ${c.generation_status}`);
  });

  process.exit(0);
}

main();
