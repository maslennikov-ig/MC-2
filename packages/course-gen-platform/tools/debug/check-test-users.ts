import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

import { getSupabaseAdmin } from '../../src/shared/supabase/admin.ts';

async function checkTestUsers() {
  const supabase = getSupabaseAdmin();

  // Check auth users
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Error listing auth users:', authError);
    process.exit(1);
  }

  const testAuthUsers = authData.users.filter(u => u.email?.includes('test-'));
  console.log('Test users in auth.users:');
  testAuthUsers.forEach(u => console.log(`  - ${u.email} (${u.id})`));

  // Check public users
  const { data: publicData, error: publicError } = await supabase
    .from('users')
    .select('id, email, role, organization_id')
    .like('email', 'test-%');

  if (publicError) {
    console.error('Error listing public users:', publicError);
    process.exit(1);
  }

  console.log('\nTest users in public.users:');
  publicData?.forEach(u => console.log(`  - ${u.email} (${u.id}, ${u.role})`));
}

checkTestUsers();
