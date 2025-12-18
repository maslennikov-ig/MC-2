# OAuth Provider Configuration for Supabase Auth

## Overview

This document provides step-by-step instructions for configuring OAuth authentication providers (Google and GitHub) for the MegaCampusAI course generation platform. OAuth providers allow users to sign in using their existing Google or GitHub accounts.

## Status: MANUAL CONFIGURATION REQUIRED

- **Google OAuth**: ⏳ PENDING (requires Google Cloud Console setup)
- **GitHub OAuth**: ⏳ PENDING (requires GitHub OAuth App creation)
- **Supabase OAuth Config**: ⏳ PENDING (requires provider credentials)

## Prerequisites

Before starting, ensure you have:

1. Access to the Supabase Dashboard for your project
2. A Google Cloud Platform account (for Google OAuth)
3. A GitHub account (for GitHub OAuth)
4. Admin permissions to create OAuth applications

## Supabase Callback URLs

Both OAuth providers require a callback URL that Supabase will use to handle the OAuth flow.

**Your Supabase Callback URL:**

```
https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback
```

**Important:** This URL is specific to your Supabase project. You'll need to add this exact URL to both Google and GitHub OAuth application configurations.

---

## Part 1: Google OAuth Configuration

### Step 1: Create Google Cloud Project

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click on the project dropdown in the top navigation bar
4. Click **"New Project"**
5. Enter project details:
   - **Project Name**: `MegaCampusAI` (or your preferred name)
   - **Organization**: (optional)
   - **Location**: (optional)
6. Click **"Create"**
7. Wait for project creation to complete
8. Select your new project from the project dropdown

### Step 2: Enable Google+ API

1. In the Google Cloud Console, navigate to **"APIs & Services" > "Library"**
2. Search for **"Google+ API"**
3. Click on **"Google+ API"**
4. Click **"Enable"**
5. Wait for the API to be enabled

### Step 3: Configure OAuth Consent Screen

1. Navigate to **"APIs & Services" > "OAuth consent screen"**
2. Select **User Type**:
   - **Internal**: Only for Google Workspace users in your organization
   - **External**: For all users with a Google account (recommended for public apps)
3. Click **"Create"**

4. **Fill in App Information:**
   - **App name**: `MegaCampusAI`
   - **User support email**: Select your email address
   - **App logo**: (optional) Upload your application logo
   - **Application home page**: `https://megacampus.ai` (or your domain)
   - **Application privacy policy link**: `https://megacampus.ai/privacy` (required)
   - **Application terms of service link**: `https://megacampus.ai/terms` (required)
   - **Authorized domains**: Add your domains:
     - `megacampus.ai`
     - `supabase.co`
   - **Developer contact information**: Enter your email address

5. Click **"Save and Continue"**

6. **Configure Scopes:**
   - Click **"Add or Remove Scopes"**
   - Select the following scopes:
     - `openid`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Click **"Update"**
   - Click **"Save and Continue"**

7. **Test Users (for External apps in Testing mode):**
   - Add test user emails if your app is in testing mode
   - Click **"Save and Continue"**

8. **Review Summary:**
   - Review all settings
   - Click **"Back to Dashboard"**

### Step 4: Create OAuth 2.0 Credentials

1. Navigate to **"APIs & Services" > "Credentials"**
2. Click **"+ Create Credentials"** at the top
3. Select **"OAuth client ID"**
4. **Application type**: Select **"Web application"**
5. **Name**: `MegaCampusAI Web Client`
6. **Authorized JavaScript origins**: Add the following URLs:
   - `http://localhost:3000` (for local development)
   - `https://megacampus.ai` (your production domain)
   - `https://diqooqbuchsliypgwksu.supabase.co` (your Supabase project URL)
7. **Authorized redirect URIs**: Add the following URLs:
   - `http://localhost:3000/auth/callback` (for local development)
   - `https://megacampus.ai/auth/callback` (your production domain)
   - `https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback` (REQUIRED - Supabase callback)
8. Click **"Create"**

### Step 5: Save Google OAuth Credentials

After creation, Google will display a modal with your credentials:

- **Client ID**: `XXXXXXXX.apps.googleusercontent.com`
- **Client Secret**: `XXXXXXXXXXXXXXXXXXXX`

**Important:** Save these credentials securely. You'll need them to configure Supabase.

**Add to `.env` file:**

```bash
GOOGLE_CLIENT_ID=your-actual-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret-here
```

---

## Part 2: GitHub OAuth Configuration

### Step 1: Create GitHub OAuth App

1. Visit [GitHub Developer Settings](https://github.com/settings/developers)
2. Sign in with your GitHub account
3. Click **"OAuth Apps"** in the left sidebar
4. Click **"New OAuth App"** button

### Step 2: Configure OAuth App Details

Fill in the following information:

1. **Application name**: `MegaCampusAI`
2. **Homepage URL**: `https://megacampus.ai` (or your domain)
3. **Application description**: (optional)
   ```
   AI-powered course generation platform that helps educators create comprehensive courses from documents.
   ```
4. **Authorization callback URL**:
   ```
   https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback
   ```
   **Important:** This MUST be your exact Supabase callback URL
5. **Enable Device Flow**: Leave unchecked
6. Click **"Register application"**

### Step 3: Generate Client Secret

1. After registration, you'll see your **Client ID** displayed
2. Click **"Generate a new client secret"**
3. Confirm the action (you may need to enter your password)
4. **Important:** Copy the client secret immediately - it will only be shown once

### Step 4: Save GitHub OAuth Credentials

- **Client ID**: `Ov23abcdefghijklmn`
- **Client Secret**: `1234567890abcdef1234567890abcdef12345678`

**Add to `.env` file:**

```bash
GITHUB_CLIENT_ID=your-actual-github-client-id
GITHUB_CLIENT_SECRET=your-actual-github-client-secret
```

### Step 5: Optional - Add Development Callback URL

If you want to test OAuth locally:

1. In your GitHub OAuth App settings, find **"Authorization callback URLs"**
2. Click **"Add URL"**
3. Add: `http://localhost:3000/auth/callback`
4. Click **"Update application"**

**Note:** GitHub allows multiple callback URLs, making it easier to test locally and in production.

---

## Part 3: Configure OAuth Providers in Supabase

Once you have obtained the OAuth credentials from Google and GitHub, configure them in your Supabase project.

### Step 1: Access Supabase Dashboard

1. Visit [Supabase Dashboard](https://app.supabase.com/)
2. Sign in to your account
3. Select your project: `diqooqbuchsliypgwksu`

### Step 2: Configure Google OAuth Provider

1. Navigate to **"Authentication" > "Providers"**
2. Find **"Google"** in the list of providers
3. Click on **"Google"** to expand settings
4. **Enable Google provider**: Toggle to **ON**
5. **Configure settings:**
   - **Client ID (for OAuth)**: Paste your Google Client ID
     ```
     XXXXXXXX.apps.googleusercontent.com
     ```
   - **Client Secret (for OAuth)**: Paste your Google Client Secret
     ```
     XXXXXXXXXXXXXXXXXXXX
     ```
6. **Advanced Settings (optional):**
   - **Skip nonce check**: Leave unchecked (recommended)
   - **Additional Scopes**: Add any additional Google API scopes you need
7. Click **"Save"**

### Step 3: Configure GitHub OAuth Provider

1. In the same **"Authentication" > "Providers"** page
2. Find **"GitHub"** in the list of providers
3. Click on **"GitHub"** to expand settings
4. **Enable GitHub provider**: Toggle to **ON**
5. **Configure settings:**
   - **Client ID (for OAuth)**: Paste your GitHub Client ID
     ```
     Ov23abcdefghijklmn
     ```
   - **Client Secret (for OAuth)**: Paste your GitHub Client Secret
     ```
     1234567890abcdef1234567890abcdef12345678
     ```
6. **Additional Scopes (optional):**
   - Default scopes: `user:email` (included by default)
   - Add additional scopes if needed: `read:user`, `read:org`, etc.
7. Click **"Save"**

### Step 4: Verify Redirect URLs Configuration

1. Navigate to **"Authentication" > "URL Configuration"**
2. **Site URL**: Set to your production domain
   ```
   https://megacampus.ai
   ```
3. **Redirect URLs**: Add all allowed redirect URLs:
   ```
   http://localhost:3000/**
   https://megacampus.ai/**
   https://diqooqbuchsliypgwksu.supabase.co/**
   ```
   **Note:** The `**` wildcard allows all paths under the domain
4. Click **"Save"**

---

## Part 4: Testing OAuth Flow

### Test Google OAuth

1. Use the Supabase client to initiate Google OAuth:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Initiate Google OAuth flow
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'http://localhost:3000/auth/callback',
  },
});

if (error) {
  console.error('OAuth error:', error);
} else {
  console.log('Redirect URL:', data.url);
  // User should be redirected to data.url to complete OAuth flow
}
```

2. **Expected Flow:**
   - User clicks "Sign in with Google"
   - User is redirected to Google's consent screen
   - User grants permissions
   - User is redirected back to your application
   - Supabase validates the OAuth token
   - User session is created with JWT token

3. **Verify JWT Token:**

```typescript
// After OAuth callback
const {
  data: { user },
  error,
} = await supabase.auth.getUser();

if (user) {
  console.log('User authenticated via Google:', user.email);
  console.log('User ID:', user.id);
  console.log('Provider:', user.app_metadata.provider); // 'google'
}
```

### Test GitHub OAuth

1. Use the Supabase client to initiate GitHub OAuth:

```typescript
// Initiate GitHub OAuth flow
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: 'http://localhost:3000/auth/callback',
  },
});

if (error) {
  console.error('OAuth error:', error);
} else {
  console.log('Redirect URL:', data.url);
  // User should be redirected to data.url to complete OAuth flow
}
```

2. **Expected Flow:**
   - User clicks "Sign in with GitHub"
   - User is redirected to GitHub's authorization page
   - User grants permissions
   - User is redirected back to your application
   - Supabase validates the OAuth token
   - User session is created with JWT token

3. **Verify JWT Token:**

```typescript
// After OAuth callback
const {
  data: { user },
  error,
} = await supabase.auth.getUser();

if (user) {
  console.log('User authenticated via GitHub:', user.email);
  console.log('User ID:', user.id);
  console.log('Provider:', user.app_metadata.provider); // 'github'
  console.log('GitHub Username:', user.user_metadata.user_name);
}
```

---

## Part 5: Frontend Integration

### React Example

```typescript
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error('Error:', error.message);
  };

  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error('Error:', error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (user) {
    return (
      <div>
        <p>Welcome, {user.email}!</p>
        <p>Provider: {user.app_metadata.provider}</p>
        <button onClick={signOut}>Sign Out</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Sign in to MegaCampusAI</h1>
      <button onClick={signInWithGoogle}>
        Sign in with Google
      </button>
      <button onClick={signInWithGitHub}>
        Sign in with GitHub
      </button>
    </div>
  );
}
```

### OAuth Callback Route (Next.js)

Create `/app/auth/callback/route.ts`:

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to home page or dashboard
  return NextResponse.redirect(requestUrl.origin);
}
```

---

## Security Considerations

### OAuth Tokens

- **Access Tokens**: OAuth providers issue access tokens that Supabase validates
- **JWT Tokens**: Supabase issues its own JWT tokens after successful OAuth
- **Token Expiry**: JWT tokens expire after 1 hour (default), refresh tokens valid for 30 days
- **Secure Storage**: Store tokens in httpOnly cookies or secure storage (never localStorage for sensitive data)

### Redirect URL Security

- **Whitelist URLs**: Only add trusted domains to the redirect URL whitelist
- **HTTPS Required**: Always use HTTPS for production redirect URLs
- **Wildcard Caution**: Use wildcard paths (`**`) carefully to prevent redirect vulnerabilities

### Provider Permissions

- **Minimal Scopes**: Only request OAuth scopes you actually need
- **User Consent**: Users must explicitly grant permissions
- **Revocation**: Users can revoke OAuth access at any time via their Google/GitHub account settings

### Account Linking

- **Email Matching**: If a user signs up with email/password, then later uses OAuth with the same email, Supabase will automatically link accounts
- **Provider Field**: Check `user.app_metadata.provider` to see which provider was used for authentication
- **Multiple Providers**: Users can link multiple OAuth providers to the same account

---

## Troubleshooting

### Issue: "OAuth error: redirect_uri_mismatch"

**Cause**: The redirect URI configured in your OAuth app doesn't match the one Supabase is using.

**Solution**:

1. Verify your Supabase callback URL is correct: `https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback`
2. Check Google Cloud Console or GitHub OAuth app settings
3. Ensure the callback URL is added exactly as shown (no trailing slashes)
4. Wait a few minutes for changes to propagate

### Issue: "OAuth error: invalid_client"

**Cause**: Incorrect Client ID or Client Secret in Supabase configuration.

**Solution**:

1. Double-check the Client ID and Client Secret you copied from Google/GitHub
2. Ensure there are no extra spaces or characters
3. Regenerate Client Secret if needed and update in Supabase
4. Save changes in Supabase and try again

### Issue: "User email not available"

**Cause**: OAuth provider didn't return the user's email address.

**Solution**:

1. Ensure you requested the `email` scope in OAuth settings
2. For Google: Ensure `userinfo.email` scope is enabled
3. For GitHub: Ensure the user's email is public or the `user:email` scope is requested
4. Some GitHub users set their email to private - handle this gracefully in your app

### Issue: "Access denied"

**Cause**: User denied permissions during OAuth consent screen.

**Solution**:

1. User must grant permissions for OAuth to work
2. Provide clear explanation of why you need access
3. Use minimal scopes to reduce user concerns
4. Allow users to retry the OAuth flow

### Issue: "OAuth flow redirects to wrong URL"

**Cause**: Site URL or Redirect URLs misconfigured in Supabase.

**Solution**:

1. Navigate to **Authentication > URL Configuration**
2. Set Site URL to your production domain
3. Add all necessary redirect URLs with `**` wildcard
4. Test with different environments (local, staging, production)

---

## Verification Script

A verification script is available to check OAuth provider status:

```bash
npx tsx scripts/check-auth-settings.ts
```

This script will:

1. Check enabled authentication providers
2. Verify OAuth provider configuration status
3. List any test users with OAuth providers
4. Display callback URLs for reference

---

## Next Steps

After configuring OAuth providers:

1. **Task T047**: Configure custom JWT claims (user_id, role, organization_id)
2. **Task T048**: Integrate OAuth authentication into tRPC context
3. **Task T049**: Create authentication middleware for protected routes
4. **Task T050**: Implement role-based authorization
5. **Frontend**: Add "Sign in with Google/GitHub" buttons to login page

---

## Additional Resources

### Google OAuth Documentation

- [Google Identity Platform](https://developers.google.com/identity)
- [OAuth 2.0 for Web Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OAuth Consent Screen](https://support.google.com/cloud/answer/10311615)

### GitHub OAuth Documentation

- [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Authorizing OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
- [OAuth Scopes](https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps)

### Supabase OAuth Documentation

- [OAuth with Supabase](https://supabase.com/docs/guides/auth/social-login)
- [Google OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [GitHub OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [OAuth Callback URLs](https://supabase.com/docs/guides/auth/redirect-urls)

---

## Change Log

- **2025-10-11**: Initial OAuth configuration documentation created
  - Google OAuth setup instructions
  - GitHub OAuth setup instructions
  - Supabase OAuth provider configuration steps
  - Testing and troubleshooting guides
  - Frontend integration examples
