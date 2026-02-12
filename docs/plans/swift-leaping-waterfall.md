# Plan: Fix Username Editing (GitHub Issue #23)

## Context

GitHub Issue #23 "AIE-6 Add an option to change username". Пользователь не видит обновлённое имя в header после сохранения профиля. Причина — **рассинхронизация двух источников данных**: профиль сохраняет `full_name` в `public.users`, а header читает из `auth.user_metadata.full_name`.

## Solution: Dual-source sync (Approach A)

Добавить синхронизацию `full_name` в auth metadata после успешного обновления БД. Минимальное изменение — **~6 строк в 1 файле**.

Почему НЕ Approach B (single source of truth): потребовалось бы менять 5+ компонентов-потребителей (AuthButton, NavigationSheet, UserbackProvider, auth-helpers). Это отдельный refactoring ticket.

## Changes

### File: `packages/web/app/[locale]/profile/page.tsx`

**Location**: After line 549 (after `if (error) { ... return }` block), before line 550 (closing brace of `if (Object.keys(profileUpdates).length > 0)`).

**Add**:

```typescript
// Sync full_name to auth user_metadata so header/nav update immediately
if (profileUpdates.full_name !== undefined) {
  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: profileUpdates.full_name },
  });
  if (authError) {
    console.warn('Failed to sync full_name to auth metadata:', authError.message);
  }
}
```

### No other files need changes

- `auth-button.tsx` — already re-renders on `session?.user` change (line 99)
- `profile-menu.tsx` — receives `user.name` as prop from AuthButton
- `NavigationSheet.tsx` — reads `user_metadata` which gets updated
- `validation-schemas.ts` — already correct (min 2, max 100)
- No need for `refreshSession()` — `updateUser()` triggers `onAuthStateChange('USER_UPDATED')` automatically

## How it works

1. User saves profile → `updateProfile()` runs
2. Updates `public.users.full_name` in DB (existing code)
3. **NEW**: Updates `auth.user_metadata.full_name` via `supabase.auth.updateUser()`
4. Supabase client fires `onAuthStateChange('USER_UPDATED', newSession)`
5. `SupabaseProvider` calls `setSession(newSession)`
6. `AuthButton`'s `useEffect` re-runs (depends on `session?.user`)
7. Header and ProfileMenu show new name instantly

## Edge cases

- **Auth update fails**: DB is source of truth, logged as `console.warn`, UI still shows success (DB saved)
- **Rapid saves**: Protected by `isSaving` state (line 521)
- **UserbackProvider**: Won't update mid-session (depends on `user.id`, not name). Acceptable — feedback widget name is non-critical

## Beads task

```bash
bd create --type=feature --priority=3 --title="Fix: username edit not reflected in header (gh-23)" --external-ref="gh-23" --files "packages/web/app/[locale]/profile/page.tsx"
```

## Verification

1. Manual test: Login → Profile → change name → Save → header shows new name immediately
2. Refresh page → name persists
3. `pnpm type-check` passes
4. No console errors (only warn if auth sync fails)
