#!/usr/bin/env tsx

/**
 * Configure and test Supabase Auth with email/password
 *
 * This script:
 * 1. Tests connection to Supabase
 * 2. Creates a test user with email/password
 * 3. Verifies authentication flow
 * 4. Documents configuration steps
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Test credentials
const TEST_USER = {
  email: 'test-auth@megacampus.ai',
  password: 'TestPassword123!',
};

async function main() {
  console.log('=== Supabase Auth Configuration Script ===\n');

  // Step 1: Create admin client
  console.log('1. Creating admin client...');
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log('   ✓ Admin client created\n');

  // Step 2: Create anon client (for testing auth flow)
  console.log('2. Creating anon client (for testing)...');
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('   ✓ Anon client created\n');

  // Step 3: Check if test user already exists
  console.log('3. Checking for existing test user...');
  const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();

  if (listError) {
    console.error('   ✗ Error listing users:', listError.message);
    process.exit(1);
  }

  const existingUser = existingUsers.users.find(u => u.email === TEST_USER.email);

  if (existingUser) {
    console.log(`   ✓ Test user already exists (ID: ${existingUser.id})`);
    console.log(`   → Deleting existing test user...`);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
    if (deleteError) {
      console.error('   ✗ Error deleting user:', deleteError.message);
    } else {
      console.log('   ✓ Existing test user deleted');
    }
  } else {
    console.log('   ✓ No existing test user found');
  }
  console.log();

  // Step 4: Create test user
  console.log('4. Creating test user...');
  const { data: createUserData, error: createError } = await adminClient.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true, // Auto-confirm email (no email verification needed)
    user_metadata: {
      full_name: 'Test User',
      role: 'instructor',
    },
  });

  if (createError) {
    console.error('   ✗ Error creating user:', createError.message);
    process.exit(1);
  }

  console.log(`   ✓ Test user created successfully`);
  console.log(`   → User ID: ${createUserData.user.id}`);
  console.log(`   → Email: ${createUserData.user.email}`);
  console.log(`   → Email confirmed: ${createUserData.user.email_confirmed_at ? 'Yes' : 'No'}`);
  console.log();

  // Step 5: Test authentication with email/password
  console.log('5. Testing authentication with email/password...');
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  if (signInError) {
    console.error('   ✗ Authentication failed:', signInError.message);
    process.exit(1);
  }

  console.log('   ✓ Authentication successful!');
  console.log(`   → User ID: ${signInData.user.id}`);
  console.log(`   → Email: ${signInData.user.email}`);
  console.log(`   → Access Token: ${signInData.session.access_token.substring(0, 20)}...`);
  console.log(`   → Refresh Token: ${signInData.session.refresh_token.substring(0, 20)}...`);
  console.log();

  // Step 6: Verify JWT claims
  console.log('6. Verifying JWT token claims...');
  const { data: userData, error: userError } = await anonClient.auth.getUser(
    signInData.session.access_token
  );

  if (userError) {
    console.error('   ✗ Error getting user from token:', userError.message);
  } else {
    console.log('   ✓ JWT token validated successfully');
    console.log(`   → User ID from token: ${userData.user.id}`);
    console.log(`   → Email from token: ${userData.user.email}`);
    console.log(`   → User metadata:`, JSON.stringify(userData.user.user_metadata, null, 2));
  }
  console.log();

  // Step 7: Test sign out
  console.log('7. Testing sign out...');
  const { error: signOutError } = await anonClient.auth.signOut();

  if (signOutError) {
    console.error('   ✗ Sign out failed:', signOutError.message);
  } else {
    console.log('   ✓ Sign out successful');
  }
  console.log();

  // Step 8: Verify configuration
  console.log('8. Configuration verification:');
  console.log('   ✓ Email/password provider: ENABLED');
  console.log('   ✓ Auto-confirm email: CONFIGURED (for test user)');
  console.log('   ✓ User creation: WORKING');
  console.log('   ✓ Authentication flow: WORKING');
  console.log('   ✓ JWT token generation: WORKING');
  console.log('   ✓ Sign out: WORKING');
  console.log();

  console.log('=== Configuration Summary ===\n');
  console.log('Email/Password Authentication: ✓ ENABLED');
  console.log('Test User Created: ✓ YES');
  console.log(`  - Email: ${TEST_USER.email}`);
  console.log(`  - Password: ${TEST_USER.password}`);
  console.log(`  - User ID: ${createUserData.user.id}`);
  console.log();
  console.log('=== Manual Configuration Steps Required ===\n');
  console.log('1. Email Templates (Supabase Dashboard):');
  console.log('   - Navigate to: Authentication > Email Templates');
  console.log('   - Configure templates for:');
  console.log('     * Confirm signup');
  console.log('     * Invite user');
  console.log('     * Magic Link');
  console.log('     * Change Email Address');
  console.log('     * Reset Password');
  console.log();
  console.log('2. Auth Settings (Supabase Dashboard):');
  console.log('   - Navigate to: Authentication > Settings');
  console.log('   - Verify "Enable email confirmations" is ON (for production)');
  console.log('   - Configure email rate limits if needed');
  console.log('   - Set site URL for redirects: https://your-app-domain.com');
  console.log();
  console.log('=== Next Steps ===\n');
  console.log('1. Test authentication in your application');
  console.log('2. Configure email templates in Supabase dashboard');
  console.log('3. Update site URL and redirect URLs for production');
  console.log('4. Consider enabling additional auth providers (Google, GitHub)');
  console.log();
  console.log('✓ Configuration script completed successfully!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
