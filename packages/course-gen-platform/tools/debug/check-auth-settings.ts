#!/usr/bin/env tsx

/**
 * Check current Supabase Auth settings
 *
 * This script retrieves and displays the current authentication configuration
 * including enabled providers, email settings, and other auth-related settings.
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

async function main() {
  console.log('=== Supabase Auth Settings Check ===\n');

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // List all users
  console.log('1. Checking auth users...');
  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers();

  if (usersError) {
    console.error('   ✗ Error listing users:', usersError.message);
  } else {
    console.log(`   ✓ Total users: ${usersData.users.length}`);
    usersData.users.forEach(user => {
      const provider = user.app_metadata?.provider || 'email';
      console.log(`     - ${user.email} (ID: ${user.id})`);
      console.log(`       Provider: ${provider}`);
      console.log(`       Role: ${user.role || 'none'}`);
      console.log(`       Email confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log(`       Created: ${new Date(user.created_at).toLocaleString()}`);
      console.log(
        `       Last sign in: ${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}`
      );
    });
  }
  console.log();

  // Check OAuth provider configuration from environment
  console.log('2. Auth Provider Status:');
  console.log('   ✓ Email/Password: ENABLED (default)');

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

  // Google OAuth status
  if (
    googleClientId &&
    googleClientId !== 'your-google-client-id' &&
    googleClientSecret &&
    googleClientSecret !== 'your-google-client-secret'
  ) {
    console.log('   ✓ Google OAuth: CREDENTIALS CONFIGURED IN .ENV');
    console.log(`     - Client ID: ${googleClientId.substring(0, 20)}...`);
    console.log(
      '     - Next step: Add credentials to Supabase Dashboard > Authentication > Providers > Google'
    );
  } else {
    console.log('   ⏳ Google OAuth: NOT CONFIGURED (manual setup required)');
    console.log('     - See docs/OAUTH_CONFIGURATION.md for setup instructions');
  }

  // GitHub OAuth status
  if (
    githubClientId &&
    githubClientId !== 'your-github-client-id' &&
    githubClientSecret &&
    githubClientSecret !== 'your-github-client-secret'
  ) {
    console.log('   ✓ GitHub OAuth: CREDENTIALS CONFIGURED IN .ENV');
    console.log(`     - Client ID: ${githubClientId.substring(0, 20)}...`);
    console.log(
      '     - Next step: Add credentials to Supabase Dashboard > Authentication > Providers > GitHub'
    );
  } else {
    console.log('   ⏳ GitHub OAuth: NOT CONFIGURED (manual setup required)');
    console.log('     - See docs/OAUTH_CONFIGURATION.md for setup instructions');
  }
  console.log();

  console.log('3. OAuth Callback URLs:');
  console.log(`   - Supabase Callback: ${SUPABASE_URL}/auth/v1/callback`);
  console.log('   - This URL must be configured in Google Cloud Console and GitHub OAuth App');
  console.log();

  console.log('4. Configuration Notes:');
  console.log('   - Email templates: Must be configured in Supabase Dashboard');
  console.log('   - Site URL: Must be set in Dashboard for production');
  console.log('   - Redirect URLs: Must be configured for OAuth flow');
  console.log('   - Custom JWT claims: Will be added in Task T047');
  console.log();

  console.log('=== Manual Configuration Required ===\n');
  console.log('Please visit the Supabase Dashboard to configure:');
  console.log(`URL: ${SUPABASE_URL.replace('https://', 'https://app.supabase.com/project/')}`);
  console.log();
  console.log('1. OAuth Providers (Task T046)');
  console.log('   Navigate to: Authentication > Providers');
  console.log('   - Google: Enable and add Client ID/Secret');
  console.log('   - GitHub: Enable and add Client ID/Secret');
  console.log('   See docs/OAUTH_CONFIGURATION.md for complete setup instructions');
  console.log();
  console.log('2. Email Templates');
  console.log('   Navigate to: Authentication > Email Templates');
  console.log('   - Confirm signup');
  console.log('   - Reset password');
  console.log('   - Invite user');
  console.log('   - Magic link');
  console.log('   - Change email address');
  console.log();
  console.log('3. URL Configuration');
  console.log('   Navigate to: Authentication > URL Configuration');
  console.log('   - Site URL: Set to production domain');
  console.log('   - Redirect URLs: Add all allowed callback URLs');
  console.log();
  console.log('Documentation:');
  console.log('   - Email/Password Auth: docs/AUTH_CONFIGURATION.md');
  console.log('   - OAuth Setup: docs/OAUTH_CONFIGURATION.md');
  console.log();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
