/**
 * Setup test authentication users for integration tests
 * Creates users in Supabase Auth matching the test users in the database
 */

import { getSupabaseAdmin } from '../src/shared/supabase/admin.ts';

interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
}

const TEST_USERS: TestUser[] = [
  {
    id: '00000000-0000-0000-0000-000000000012',
    email: 'test-instructor1@megacampus.com',
    password: 'test-password-123',
    role: 'instructor',
  },
  {
    id: '00000000-0000-0000-0000-000000000013',
    email: 'test-instructor2@megacampus.com',
    password: 'test-password-456',
    role: 'instructor',
  },
  {
    id: '00000000-0000-0000-0000-000000000014',
    email: 'test-student@megacampus.com',
    password: 'test-password-789',
    role: 'student',
  },
];

async function setupTestAuthUsers() {
  const supabase = getSupabaseAdmin();

  console.log('Starting test auth user setup...\n');

  // Step 1: List existing users
  console.log('Step 1: Checking for existing test users...');
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error('Error listing users:', listError);
    process.exit(1);
  }

  console.log(`Found ${existingUsers.users.length} total users in Auth\n`);

  // Step 2: Cleanup existing test users
  console.log('Step 2: Cleaning up existing test users...');
  for (const testUser of TEST_USERS) {
    const existingUser = existingUsers.users.find((u) => u.email === testUser.email || u.id === testUser.id);

    if (existingUser) {
      console.log(`  Deleting existing user: ${existingUser.email} (${existingUser.id})`);
      const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);

      if (deleteError) {
        console.error(`  ❌ Failed to delete user ${existingUser.email}:`, deleteError);
      } else {
        console.log(`  ✅ Successfully deleted ${existingUser.email}`);
      }
    }
  }

  console.log('\nStep 3: Creating test auth users...');

  // Step 3: Create new test users
  const results = [];
  for (const testUser of TEST_USERS) {
    console.log(`  Creating user: ${testUser.email} (${testUser.id}, role: ${testUser.role})`);

    const { data, error } = await supabase.auth.admin.createUser({
      id: testUser.id,
      email: testUser.email,
      password: testUser.password,
      email_confirm: true,
      user_metadata: {
        role: testUser.role,
      },
    });

    if (error) {
      console.error(`  ❌ Failed to create user ${testUser.email}:`, error);
      results.push({ user: testUser.email, success: false, error });
    } else {
      console.log(`  ✅ Successfully created ${testUser.email}`);
      results.push({ user: testUser.email, success: true, data });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`✅ Successfully created: ${successCount}/${TEST_USERS.length}`);
  console.log(`❌ Failed: ${failCount}/${TEST_USERS.length}`);

  if (failCount > 0) {
    console.log('\nFailed users:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.user}: ${r.error?.message || 'Unknown error'}`);
      });
  }

  console.log('\nTest auth users are ready!');
  console.log('You can now run the integration tests.');
  process.exit(failCount > 0 ? 1 : 0);
}

setupTestAuthUsers().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
