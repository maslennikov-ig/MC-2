# Task: Implement Supabase Storage for User Preferences

## Context
Currently, user preferences from `/profile` page are stored only in localStorage. Need to migrate to Supabase for persistence across devices and sessions.

## Current State
- Preferences stored in localStorage under key `userPreferences`
- Data includes: theme, language, notifications, privacy settings, learning preferences
- No sync between devices
- Data loss risk on cache clear

## Requirements

### 1. Database Schema
Create `user_preferences` table:
```sql
-- Table structure
user_preferences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
)

-- Indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- RLS Policies
- SELECT: users can read own preferences
- INSERT: users can create own preferences
- UPDATE: users can update own preferences
- DELETE: users can delete own preferences
```

### 2. Migration Steps
- Use `mcp__supabase__apply_migration` to create table
- Enable RLS: `ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY`
- Create trigger for `updated_at` auto-update

### 3. Code Updates

#### Files to modify:
- `/app/profile/page.tsx` - main logic updates
- `/app/profile/components/AccountSettingsSection.tsx` - save handler
- `/app/profile/components/PersonalInfoSection.tsx` - save handler
- `/app/profile/components/LearningPreferencesSection.tsx` - save handler

#### New file to create:
- `/lib/user-preferences.ts` - centralized preference management

#### Key functions to implement:
```typescript
// /lib/user-preferences.ts
export async function loadUserPreferences(supabase, userId): Promise<UserPreferences>
export async function saveUserPreferences(supabase, userId, preferences): Promise<void>
export async function mergePreferences(remote, local): Promise<UserPreferences>
```

### 4. Sync Logic
```
On Load:
1. Try Supabase fetch
2. If success -> update localStorage
3. If fail -> use localStorage
4. Merge if both exist (Supabase wins)

On Save:
1. Save to Supabase (primary)
2. On success -> update localStorage (cache)
3. On fail -> save to localStorage + show warning
```

### 5. Preference Structure
```typescript
interface UserPreferences {
  // Theme & UI
  theme_preference: 'light' | 'dark'
  language: string
  font_size: string
  high_contrast: boolean
  reduce_motion: boolean

  // Notifications
  email_notifications: boolean
  email_course_updates: boolean
  push_notifications: boolean

  // Privacy
  profile_visibility: 'public' | 'private'
  show_achievements: boolean
  data_collection: boolean

  // Learning
  difficulty_level: string
  learning_style: string
  daily_goal_minutes: number

  // Meta
  version: number // for future migrations
}
```

### 6. Error Handling
- Network failures -> fallback to localStorage
- Validation errors -> show specific messages
- Conflict resolution -> Supabase timestamp wins
- Migration from existing localStorage data

### 7. Tools to Use
- `mcp__supabase__list_tables` - check existing schema
- `mcp__supabase__apply_migration` - create table
- `mcp__supabase__execute_sql` - test queries
- `mcp__context7__get-library-docs` with "supabase" for latest docs
- Check existing patterns in `/lib/supabase/` folder

### 8. Testing Checklist
- [ ] Table created with correct schema
- [ ] RLS policies work (user can only access own data)
- [ ] Preferences load on profile page mount
- [ ] Save updates both Supabase and localStorage
- [ ] Offline mode uses localStorage
- [ ] Cross-device sync works
- [ ] Existing localStorage data migrates on first load
- [ ] Theme changes apply immediately via next-themes
- [ ] No console errors or warnings
- [ ] Loading states show during async operations

## Success Criteria
1. ✅ Preferences persist across devices/sessions
2. ✅ Offline support maintained via localStorage
3. ✅ No breaking changes to existing UI
4. ✅ Smooth migration from localStorage
5. ✅ Real-time sync when online
6. ✅ Proper error messages for failures

## Additional Issues to Fix

### 9. Theme Sync Bug
**Problem**: When user changes theme via site controls (not in profile settings), the profile settings page shows incorrect selected theme.

**Solution**:
- Profile page must read current theme from `useTheme()` hook, not from saved preferences
- On mount, sync the actual theme to the RadioGroup value
- When RadioGroup changes, immediately update both next-themes AND save to preferences
- Code pattern:
```typescript
const { theme: currentTheme } = useTheme()
// Use currentTheme for RadioGroup value, not profile.theme_preference
```

### 10. Navigation & UX Pattern

**Best Practice Decision: Use Dedicated Page (Current) ✅**

**Reasoning**:
- Profile settings are complex with multiple sections
- Users expect dedicated space for account management (like GitHub, Google, etc.)
- Better accessibility with URL routing
- Allows deep linking to specific settings
- Better for SEO and browser history

**Required Navigation Improvements**:
1. Add breadcrumb navigation at top: `Главная > Профиль`
2. Add "Back" button with arrow icon in header
3. Add "Close" (X) button in top-right corner
4. Implement unsaved changes warning on navigation attempt
5. Add keyboard shortcut (ESC) to go back

**Implementation**:
```typescript
// Add to profile page header
<div className="flex items-center justify-between mb-6">
  <div className="flex items-center gap-4">
    <Button variant="ghost" size="icon" onClick={() => router.back()}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
    <Breadcrumb>
      <Link href="/">Главная</Link> >
      <span>Профиль</span>
    </Breadcrumb>
  </div>
  <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
    <X className="h-4 w-4" />
  </Button>
</div>
```

**Alternative for Simple Settings**:
- Use Sheet/Drawer for quick settings (theme toggle, language)
- Keep full page for comprehensive profile management

## Additional Notes
- Keep localStorage as cache for performance
- Consider adding version field for future schema migrations
- Theme preference should sync with next-themes immediately
- Bio and avatar are already in profiles table - don't duplicate
- Use transactions for complex updates if needed
- Add proper loading states during save operations
- Consider adding auto-save with debounce for better UX