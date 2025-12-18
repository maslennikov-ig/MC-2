# Supabase Auth Quick Reference

## Task T045 Completion Summary

**Status**: ✅ COMPLETE

**What was configured:**

1. Email/password authentication provider (enabled by default in Supabase)
2. Test user creation and verification flow
3. JWT token generation and validation
4. Sign in/sign out functionality

**What still needs manual configuration:**

1. Email templates in Supabase Dashboard
2. Site URL and redirect URLs for production
3. Email confirmation settings (for production)
4. Rate limiting configuration

## Test User Credentials

Use these credentials for development and testing:

```
Email: test-auth@megacampus.ai
Password: TestPassword123!
```

## Quick Test Commands

### Run full configuration test:

```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
npx tsx scripts/configure-auth.ts
```

### Check current auth settings:

```bash
npx tsx scripts/check-auth-settings.ts
```

## Integration Example

```typescript
import { createClient } from '@supabase/supabase-js';

// Create client
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test-auth@megacampus.ai',
  password: 'TestPassword123!',
});

if (data.session) {
  console.log('Access Token:', data.session.access_token);
  console.log('User ID:', data.user.id);
}
```

## Environment Variables

Ensure these are set in `.env`:

```bash
SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Next Tasks

- **T046**: Configure OAuth providers (Google, GitHub)
- **T047**: Add custom JWT claims (user_id, role, organization_id)
- **T048**: Integrate auth into tRPC context
- **T049**: Create authentication middleware
- **T050**: Create authorization middleware (role-based)

## Documentation

Full documentation: `docs/AUTH_CONFIGURATION.md`

## Supabase Dashboard Access

URL: https://app.supabase.com/project/diqooqbuchsliypgwksu

Navigate to:

- **Authentication > Users**: View/manage users
- **Authentication > Providers**: Configure OAuth providers
- **Authentication > Email Templates**: Customize email templates
- **Authentication > Settings**: Configure auth settings

## Common Issues

### "Invalid login credentials"

- Verify email/password are correct
- Check if email confirmation is required
- Ensure user exists in auth.users table

### "Email rate limit exceeded"

- Wait for rate limit window to reset
- Adjust rate limits in Dashboard if needed

### "JWT token invalid"

- Verify token hasn't expired (1 hour default)
- Check SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Ensure using correct client for validation

## Files Created

- `scripts/configure-auth.ts` - Full configuration and testing script
- `scripts/check-auth-settings.ts` - Quick status check script
- `docs/AUTH_CONFIGURATION.md` - Comprehensive documentation
- `docs/AUTH_QUICK_REFERENCE.md` - This quick reference guide
