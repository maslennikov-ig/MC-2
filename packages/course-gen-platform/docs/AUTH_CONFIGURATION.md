# Supabase Authentication Configuration

## Overview

This document provides detailed configuration steps for Supabase Auth with email/password authentication for the MegaCampusAI course generation platform.

## Status: CONFIGURED

- **Email/Password Provider**: ✓ ENABLED
- **Test User Created**: ✓ YES
- **Authentication Flow**: ✓ VERIFIED
- **JWT Token Generation**: ✓ WORKING

## Automated Configuration (Completed)

The following configuration was completed automatically via the `scripts/configure-auth.ts` script:

1. ✓ Email/password authentication provider enabled (default in Supabase)
2. ✓ Test user created with email confirmation
3. ✓ Authentication flow verified (sign in, sign out)
4. ✓ JWT token generation and validation tested

## Test User Credentials

A test user has been created for development and testing:

- **Email**: `test-auth@megacampus.ai`
- **Password**: `TestPassword123!`
- **User ID**: `bbac8f20-3c52-43ef-a0e5-4030a74227ac`
- **Role**: `instructor` (set in user_metadata)
- **Email Confirmed**: Yes (auto-confirmed for testing)

## Manual Configuration Steps (Supabase Dashboard)

The following steps should be performed in the Supabase Dashboard for production deployment:

### 1. Email Templates Configuration

Navigate to: **Authentication > Email Templates**

Configure the following email templates:

#### A. Confirm Signup Template

```html
<h2>Confirm your signup</h2>
<p>Welcome to MegaCampusAI! Please confirm your email address by clicking the link below:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>If you did not create an account, you can safely ignore this email.</p>
```

#### B. Reset Password Template

```html
<h2>Reset your password</h2>
<p>You requested to reset your password for MegaCampusAI. Click the link below to proceed:</p>
<p><a href="{{ .ConfirmationURL }}">Reset your password</a></p>
<p>If you did not request a password reset, you can safely ignore this email.</p>
<p>This link will expire in 24 hours.</p>
```

#### C. Invite User Template

```html
<h2>You've been invited to MegaCampusAI</h2>
<p>
  You have been invited to join an organization on MegaCampusAI. Click the link below to set up your
  account:
</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
<p>This invitation will expire in 7 days.</p>
```

#### D. Magic Link Template

```html
<h2>Your magic link</h2>
<p>Click the link below to sign in to MegaCampusAI:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>If you did not request this link, you can safely ignore this email.</p>
<p>This link will expire in 1 hour.</p>
```

#### E. Change Email Address Template

```html
<h2>Confirm your new email address</h2>
<p>You requested to change your email address for MegaCampusAI. Click the link below to confirm:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email change</a></p>
<p>If you did not request this change, please contact support immediately.</p>
```

### 2. Authentication Settings

Navigate to: **Authentication > Settings**

Configure the following settings:

#### General Settings

- **Site URL**: Set to your production domain (e.g., `https://megacampus.ai`)
- **Redirect URLs**: Add allowed redirect URLs for your frontend:
  - `http://localhost:3000/*` (development)
  - `https://your-app.vercel.app/*` (staging)
  - `https://megacampus.ai/*` (production)

#### Email Settings

- **Enable email confirmations**: ✓ ON (for production)
  - For development: Can be OFF (users auto-confirmed)
- **Enable email change confirmations**: ✓ ON
- **Secure email change**: ✓ ON (requires both old and new email confirmation)

#### Security Settings

- **Minimum password length**: 8 characters
- **Password requirements**: Consider enabling:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character

#### Rate Limiting

- **Email sign-ups**: 10 per hour per IP (default)
- **Password resets**: 5 per hour per email (default)
- **Email confirmations**: 5 per hour per email (default)

Adjust these limits based on your application's needs.

### 3. Email Provider Configuration (Production)

Navigate to: **Authentication > Settings > Email Provider**

For production, you should configure a custom SMTP provider instead of using Supabase's default email service:

**Recommended Providers:**

- SendGrid
- AWS SES
- Mailgun
- Postmark

**Configuration:**

1. Choose "Custom SMTP"
2. Enter SMTP credentials:
   - SMTP Host
   - SMTP Port
   - SMTP Username
   - SMTP Password
   - Sender Email
   - Sender Name: "MegaCampusAI"

### 4. OAuth Providers (Optional - Future Task T046)

For Google and GitHub OAuth, you'll need to:

1. Create OAuth applications in respective platforms
2. Configure OAuth provider settings in Supabase Dashboard
3. Add redirect URLs

This will be covered in Task T046.

## Testing Authentication Flow

### Using the Configuration Script

Run the automated test script:

```bash
npx tsx scripts/configure-auth.ts
```

This script will:

1. Create a test user (if not exists)
2. Test sign in with email/password
3. Verify JWT token claims
4. Test sign out
5. Display configuration summary

### Manual Testing

You can also test authentication manually using the Supabase client:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Sign up
const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

// Sign in
const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

// Get current user
const { data: userData, error: userError } = await supabase.auth.getUser();

// Sign out
const { error: signOutError } = await supabase.auth.signOut();
```

## JWT Token Claims

The JWT tokens generated by Supabase Auth include the following claims:

**Standard Claims:**

- `sub`: User ID (UUID)
- `email`: User's email address
- `iss`: Issuer (Supabase)
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

**Custom Claims (for multi-tenancy):**
Custom claims will be added in Task T047 via database triggers:

- `user_id`: User ID from users table
- `role`: User role (admin, instructor, student)
- `organization_id`: Organization ID for RLS policies

## Security Considerations

### Password Requirements

- Minimum length: 8 characters
- Recommended: Include uppercase, lowercase, numbers, and special characters
- Stored securely using bcrypt hashing

### JWT Token Security

- Tokens expire after 1 hour (default)
- Refresh tokens valid for 30 days (default)
- Always use HTTPS in production
- Store tokens securely in httpOnly cookies or secure storage

### Email Confirmation

- Production: Email confirmation required for new signups
- Development: Can be disabled for faster testing
- Use auto-confirm only for test users created via admin API

### Rate Limiting

- Prevents brute force attacks
- Limits password reset attempts
- Protects against email enumeration

## Troubleshooting

### Issue: "Invalid login credentials"

- Verify email/password are correct
- Check if email is confirmed (if email confirmations enabled)
- Ensure user exists in auth.users table

### Issue: "Email rate limit exceeded"

- Wait for rate limit window to reset
- Check Supabase Dashboard > Authentication > Settings > Rate Limiting
- Adjust rate limits if needed

### Issue: "Invalid JWT token"

- Verify token hasn't expired
- Check that SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Ensure using correct Supabase client for validation

## Next Steps

1. **Task T046**: Configure OAuth providers (Google, GitHub)
2. **Task T047**: Add custom JWT claims for multi-tenancy (user_id, role, organization_id)
3. **Task T048**: Integrate Supabase Auth into tRPC context
4. **Task T049**: Create authentication middleware for tRPC
5. **Task T050**: Create authorization middleware (role-based access control)

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Email Templates Guide](https://supabase.com/docs/guides/auth/auth-email-templates)
- [JWT Claims Documentation](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-deep-dive-jwts)
- [Security Best Practices](https://supabase.com/docs/guides/auth/auth-security)

## Change Log

- **2025-10-11**: Initial configuration completed
  - Email/password authentication enabled
  - Test user created and verified
  - Configuration script implemented
  - Documentation created
