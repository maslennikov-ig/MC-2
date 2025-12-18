# T071: Enable Password Protection (Leaked Password Detection)

**Priority**: P2 - Medium (Security - User protection)
**Status**: ⏳ **PENDING**
**Created**: 2025-10-13
**Completed**: -
**Parent Task**: Stage 0 Foundation - Security Hardening
**Impact**: Security - Prevent users from setting compromised passwords
**Estimated Effort**: 5 minutes (configuration only)
**Actual Effort**: -

---

## 📋 Executive Summary

Supabase Security Advisor identified that **Leaked Password Protection is disabled**, allowing users to set passwords that have been compromised in data breaches. This feature integration with HaveIBeenPwned.org to prevent weak/leaked passwords.

**Risk**:
- ⚠️ Users can set passwords exposed in data breaches
- ⚠️ Account takeover risk from credential stuffing attacks
- ⚠️ Reduced overall platform security

**Solution**: Enable "Leaked Password Protection" in Supabase Dashboard (5 minute configuration).

---

## 🔍 Security Issue Analysis

### What is Leaked Password Protection?

**Feature**: Supabase Auth integrates with [HaveIBeenPwned.org](https://haveibeenpwned.com/) API to check if passwords have been exposed in known data breaches.

**How it Works**:
1. User attempts to set a password (signup or password reset)
2. Supabase hashes the password using k-anonymity model
3. Sends first 5 characters of hash to HaveIBeenPwned API
4. Receives list of matching hashes (no password sent!)
5. Checks if full hash matches any leaked password
6. Rejects password if found in breach database

**Privacy**: Only partial hash sent to API - your actual password never leaves Supabase.

### Current State: DISABLED ❌

**What Users Can Do Now**:
```typescript
// User can set these passwords (all leaked in breaches):
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',  // ❌ Leaked 37M+ times
});

await supabase.auth.signUp({
  email: 'user@example.com',
  password: '123456',  // ❌ Leaked 23M+ times
});

await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'qwerty',  // ❌ Leaked 3.8M+ times
});
```

**Result**: All accepted ❌ (security risk)

### After Enabling: PROTECTED ✅

**What Happens**:
```typescript
// User attempts to set leaked password:
const { error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
});

console.log(error);
// {
//   message: "Password found in breach database. Please choose a different password.",
//   status: 422
// }
```

**Result**: Password rejected ✅ (user protected)

---

## 💡 Solution

### Enable in Supabase Dashboard (5 minutes)

**Steps**:

1. **Go to Supabase Dashboard**
   - URL: `https://supabase.com/dashboard/project/diqooqbuchsliypgwksu`
   - Login with your Supabase account

2. **Navigate to Authentication Settings**
   - Sidebar: Click "Authentication"
   - Tab: Click "Policies" or "Security"
   - Look for "Password Security" section

3. **Enable Leaked Password Protection**
   - Toggle: "Enable password breach detection"
   - Description: "Prevent users from setting passwords exposed in data breaches"
   - Save changes

4. **Optional: Configure Password Strength Requirements**
   - Minimum password length: 8 characters (recommended: 12+)
   - Require uppercase letters: ✅
   - Require lowercase letters: ✅
   - Require numbers: ✅
   - Require special characters: ❌ (optional, can reduce usability)

5. **Verify Configuration**
   ```bash
   # Test with known leaked password
   curl -X POST 'https://diqooqbuchsliypgwksu.supabase.co/auth/v1/signup' \
     -H "Content-Type: application/json" \
     -H "apikey: YOUR_ANON_KEY" \
     -d '{
       "email": "test@example.com",
       "password": "password123"
     }'

   # Expected response:
   # {"error": "Password found in breach database"}
   ```

---

## 🎯 Implementation Plan

### Step 1: Enable Feature (5 minutes)

**Action**: Manual configuration in Supabase Dashboard

**Location**: Authentication > Security > Password Protection

**Toggle**: "Enable password breach detection"

### Step 2: Update Documentation (5 minutes)

**File**: `docs/AUTH_CONFIGURATION.md`

Add section:

```markdown
## Password Security

### Leaked Password Protection

**Status**: ✅ ENABLED

**Feature**: Integration with HaveIBeenPwned.org to prevent users from setting passwords that have been exposed in data breaches.

**How it Works**:
- User attempts to set password
- Supabase checks against breach database (using k-anonymity)
- Rejects password if found in known breaches
- User must choose different password

**Privacy**: Only partial hash sent to API - actual password never leaves Supabase.

**Error Handling**:
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'user_chosen_password',
});

if (error?.status === 422) {
  // Password found in breach database
  showError('This password has been exposed in a data breach. Please choose a different password.');
}
```

**Testing**:
```bash
# Test with known leaked password (should fail)
curl -X POST 'https://YOUR_PROJECT.supabase.co/auth/v1/signup' \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"email": "test@example.com", "password": "password123"}'

# Expected: {"error": "Password found in breach database"}
```

**Recommended Password Requirements**:
- Minimum length: 12 characters
- Mix of uppercase and lowercase letters
- Include numbers
- Special characters optional (but recommended)
- Not found in breach database (enforced)
```

### Step 3: Update Client Error Handling (Optional)

**File**: Future frontend code (Stage 1+)

```typescript
// Example: Client-side error handling
async function handleSignUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    if (error.status === 422) {
      // Password found in breach database
      return {
        success: false,
        message: 'This password has been exposed in a data breach. Please choose a different, more secure password.',
      };
    }

    return {
      success: false,
      message: error.message,
    };
  }

  return { success: true, data };
}
```

### Step 4: Verify Feature Active (5 minutes)

```bash
# Test 1: Known leaked password (should fail)
pnpm tsx scripts/test-password-protection.ts

# Test 2: Strong unique password (should succeed)
# Test 3: Check Supabase Security Advisor
mcp__supabase__get_advisors --type=security
```

**Test Script**: `scripts/test-password-protection.ts`
```typescript
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

async function testPasswordProtection() {
  const supabase = getSupabaseAdmin();

  console.log('Testing leaked password detection...\n');

  // Test 1: Known leaked password (should fail)
  console.log('Test 1: Leaked password');
  const { data: data1, error: error1 } = await supabase.auth.admin.createUser({
    email: `test-leak-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });

  if (error1) {
    console.log('✅ PASS: Leaked password rejected');
    console.log('Error:', error1.message);
  } else {
    console.log('❌ FAIL: Leaked password accepted');
  }

  // Test 2: Strong unique password (should succeed)
  console.log('\nTest 2: Strong password');
  const { data: data2, error: error2 } = await supabase.auth.admin.createUser({
    email: `test-strong-${Date.now()}@example.com`,
    password: `Secure!Pass${Date.now()}#Random`,
    email_confirm: true,
  });

  if (error2) {
    console.log('❌ FAIL: Strong password rejected');
    console.log('Error:', error2.message);
  } else {
    console.log('✅ PASS: Strong password accepted');
    // Cleanup
    if (data2.user) {
      await supabase.auth.admin.deleteUser(data2.user.id);
    }
  }
}

testPasswordProtection();
```

---

## 📊 Security Impact

### Before Enabling

**Password Security**:
- ❌ Users can set passwords from breach databases
- ❌ No protection against credential stuffing
- ❌ Higher account takeover risk
- ⚠️ **1 security warning** from Supabase Advisor

**Attack Vector**:
```
1. User sets password "password123" (leaked 37M+ times)
2. Attacker has this password from breach database
3. Attacker tries credential stuffing attack
4. Account compromised ❌
```

### After Enabling

**Password Security**:
- ✅ Leaked passwords rejected automatically
- ✅ Protection against credential stuffing
- ✅ Lower account takeover risk
- ✅ **0 security warnings** from Supabase Advisor

**Attack Prevention**:
```
1. User attempts "password123"
2. Supabase checks HaveIBeenPwned
3. Password rejected
4. User must choose unique password
5. Account protected ✅
```

### Statistics

**HaveIBeenPwned Database**:
- 11.8 billion+ breached accounts
- 613 million+ unique passwords
- Updated continuously with new breaches

**Common Leaked Passwords**:
| Password | Times Leaked |
|----------|--------------|
| 123456 | 23,597,311 |
| password | 3,730,471 |
| 12345678 | 2,889,860 |
| qwerty | 3,812,683 |
| password123 | 37,000,000+ |

---

## ✅ Acceptance Criteria

### Configuration
- [ ] Leaked Password Protection enabled in Supabase Dashboard
- [ ] Password strength requirements configured (min 8-12 chars)
- [ ] Feature verified active via test script

### Documentation
- [ ] AUTH_CONFIGURATION.md updated with password protection section
- [ ] Error handling examples documented
- [ ] Testing instructions provided

### Testing
- [ ] Test script runs successfully
- [ ] Leaked password rejected (e.g., "password123")
- [ ] Strong password accepted
- [ ] Supabase Security Advisor shows 0 warnings for password protection

### User Experience
- [ ] Clear error message for leaked passwords
- [ ] Guidance on choosing secure passwords
- [ ] No UX friction for legitimate users

---

## 🔗 Related Tasks

- **T069**: Fix Function Search Paths - Security hardening
- **T070**: Move Extensions to Schema - Security hardening
- **Stage 0 Foundation**: Security improvements

---

## 📚 References

### Supabase Documentation
- [Password Security and Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Database Linter - auth_leaked_password_protection](https://supabase.com/docs/guides/database/database-linter?lint=auth_leaked_password_protection)

### HaveIBeenPwned
- [Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords)
- [k-Anonymity Model](https://en.wikipedia.org/wiki/K-anonymity)
- [Privacy and Security](https://haveibeenpwned.com/Privacy)

### Security Best Practices
- [OWASP Password Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#password-requirements)
- [NIST Password Guidance](https://pages.nist.gov/800-63-3/sp800-63b.html)

---

## 🚀 Next Steps

1. Review this task document
2. Login to Supabase Dashboard
3. Navigate to Authentication > Security
4. Enable "Leaked Password Protection"
5. Configure password strength requirements (min 12 chars recommended)
6. Create test script (`scripts/test-password-protection.ts`)
7. Run test script to verify feature active
8. Update `docs/AUTH_CONFIGURATION.md`
9. Verify Supabase Security Advisor shows 0 warnings
10. Document in commit message

---

**Created By**: Claude Code (Anthropic)
**Research Duration**: 20 minutes
**Priority**: P2 - Medium (Security - User protection)
**Complexity**: Very Low (Configuration only, no code changes)
**Estimated Effort**: 5 minutes (+ 10 min documentation)
**Confidence Level**: 🟢 **HIGH (100%)** - Simple configuration with clear documentation
