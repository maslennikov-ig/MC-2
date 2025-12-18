#!/usr/bin/env tsx

/**
 * JWT Custom Claims Verification Script
 *
 * This script verifies that JWT tokens issued by Supabase Auth contain
 * the custom claims added via the custom_access_token_hook:
 * - user_id
 * - role
 * - organization_id
 *
 * Usage:
 *   pnpm tsx scripts/verify-jwt-claims.ts
 *
 * Prerequisites:
 *   1. Custom Access Token Hook must be enabled in Supabase Dashboard
 *   2. Test user must exist (test-auth@megacampus.ai from T045)
 *   3. Test user must have a corresponding record in public.users table
 */

import { createClient } from '@supabase/supabase-js';
import { jwtDecode } from 'jwt-decode';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Test user credentials (from T045)
const TEST_EMAIL = 'test-auth@megacampus.ai';
const TEST_PASSWORD = 'SecureTestPass123!'; // You may need to adjust this

interface CustomJWTClaims {
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email: string;
  phone: string;
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  role: string;
  aal: string;
  amr: Array<{ method: string; timestamp: number }>;
  session_id: string;
  is_anonymous: boolean;
  // Custom claims added by our hook
  user_id?: string;
  organization_id?: string;
}

async function verifyJWTClaims() {
  console.log('🔐 JWT Custom Claims Verification\n');
  console.log('Configuration:');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Test Email: ${TEST_EMAIL}\n`);

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Step 1: Sign in with test user
    console.log('📝 Step 1: Signing in with test user...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (authError || !authData.session) {
      console.error('❌ Authentication failed:', authError?.message);
      console.log('\n💡 Tip: Make sure the test user exists and the password is correct.');
      console.log('   You may need to create the user first using T045 setup.');
      process.exit(1);
    }

    console.log('✅ Successfully authenticated');
    console.log(`   User ID: ${authData.user?.id}`);
    console.log(`   Email: ${authData.user?.email}\n`);

    // Step 2: Extract and decode JWT
    console.log('📝 Step 2: Decoding JWT access token...');
    const accessToken = authData.session.access_token;

    try {
      const decodedToken = jwtDecode<CustomJWTClaims>(accessToken);

      console.log('✅ JWT decoded successfully\n');
      console.log('📄 JWT Claims:');
      console.log('   Standard Claims:');
      console.log(`     - aud: ${decodedToken.aud}`);
      console.log(`     - sub: ${decodedToken.sub}`);
      console.log(`     - email: ${decodedToken.email}`);
      console.log(`     - role (JWT): ${decodedToken.role}`);
      console.log(`     - session_id: ${decodedToken.session_id}\n`);

      // Step 3: Verify custom claims
      console.log('📝 Step 3: Verifying custom claims...');

      const hasUserId = 'user_id' in decodedToken && decodedToken.user_id;
      const hasRole =
        'role' in decodedToken && decodedToken.role && decodedToken.role !== 'authenticated';
      const hasOrgId = 'organization_id' in decodedToken && decodedToken.organization_id;

      console.log('   Custom Claims:');
      console.log(`     - user_id: ${hasUserId ? '✅ ' + decodedToken.user_id : '❌ MISSING'}`);
      console.log(`     - role: ${hasRole ? '✅ ' + decodedToken.role : '❌ MISSING or default'}`);
      console.log(
        `     - organization_id: ${hasOrgId ? '✅ ' + decodedToken.organization_id : '❌ MISSING'}\n`
      );

      // Step 4: Compare with database
      console.log('📝 Step 4: Comparing with database record...');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, role, organization_id')
        .eq('id', authData.user?.id)
        .single();

      if (userError || !userData) {
        console.error('❌ Failed to fetch user from database:', userError?.message);
        console.log('\n💡 Tip: Make sure the user exists in the public.users table.');
        console.log('   The custom_access_token_hook requires a record in public.users.');
      } else {
        console.log('✅ Database record found:');
        console.log(`     - id: ${userData.id}`);
        console.log(`     - email: ${userData.email}`);
        console.log(`     - role: ${userData.role}`);
        console.log(`     - organization_id: ${userData.organization_id}\n`);

        // Verify claims match database
        const claimsMatch =
          decodedToken.user_id === userData.id &&
          decodedToken.role === userData.role &&
          decodedToken.organization_id === userData.organization_id;

        if (claimsMatch) {
          console.log('✅ JWT claims match database record perfectly!\n');
        } else {
          console.log('⚠️  JWT claims do NOT match database record:');
          if (decodedToken.user_id !== userData.id) {
            console.log(`     - user_id: JWT=${decodedToken.user_id}, DB=${userData.id}`);
          }
          if (decodedToken.role !== userData.role) {
            console.log(`     - role: JWT=${decodedToken.role}, DB=${userData.role}`);
          }
          if (decodedToken.organization_id !== userData.organization_id) {
            console.log(
              `     - organization_id: JWT=${decodedToken.organization_id}, DB=${userData.organization_id}`
            );
          }
          console.log('\n💡 Tip: Try refreshing the token or re-authenticating.');
        }
      }

      // Step 5: Final summary
      console.log('📝 Step 5: Final Summary\n');

      if (hasUserId && hasRole && hasOrgId) {
        console.log('✅ SUCCESS: All custom JWT claims are present and populated!');
        console.log('   The custom_access_token_hook is working correctly.\n');

        console.log('📚 Next Steps:');
        console.log('   1. These claims are now available in your tRPC API context');
        console.log('   2. You can access them via the JWT without additional DB queries');
        console.log('   3. Use them in RLS policies for fine-grained access control\n');

        process.exit(0);
      } else {
        console.log('❌ FAILURE: Some custom JWT claims are missing!');
        console.log('\n🔍 Troubleshooting:');
        console.log(
          '   1. Make sure the custom_access_token_hook is enabled in Supabase Dashboard'
        );
        console.log('   2. Navigate to: Authentication > Hooks (Beta)');
        console.log('   3. Select "custom_access_token_hook" from the dropdown');
        console.log('   4. The user must have a record in public.users table');
        console.log('   5. Try signing out and signing in again to get a fresh token\n');

        process.exit(1);
      }
    } catch (decodeError) {
      console.error('❌ Failed to decode JWT:', decodeError);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the verification
verifyJWTClaims().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
