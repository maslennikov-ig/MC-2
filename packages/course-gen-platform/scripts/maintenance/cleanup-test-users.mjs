import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const testEmails = [
  'test-instructor1@megacampus.com',
  'test-instructor2@megacampus.com',
  'test-student@megacampus.com',
];

// Delete database users
for (const email of testEmails) {
  const { error } = await supabase.from('users').delete().eq('email', email);
  console.log(`Deleted database user ${email}:`, error ? error.message : 'OK');
}

// Delete auth users
const { data: { users } } = await supabase.auth.admin.listUsers();
for (const user of users) {
  if (user.email && testEmails.includes(user.email)) {
    await supabase.auth.admin.deleteUser(user.id);
    console.log(`Deleted auth user: ${user.email}`);
  }
}

console.log('Cleanup complete!');
