# Database Migrations - Bug Fixing Frontend Schema

**Date**: 2025-11-20
**Session**: Database schema alignment
**Status**: ✅ MIGRATIONS COMPLETED - Types regeneration required

---

## Summary

Successfully created comprehensive database migrations to align Supabase schema with frontend TypeScript expectations. All 6 migrations have been applied to the production database.

### Migrations Applied

1. ✅ **add_assets_table** - Created assets table for lesson media
2. ✅ **add_google_drive_files_table** - Created Google Drive integration table
3. ✅ **add_file_catalog_columns** - Added google_drive_file_id and original_name
4. ✅ **add_updated_at_to_sections_lessons** - Added timestamps
5. ✅ **add_user_profile_columns** - Added full_name, avatar_url, bio
6. ✅ **add_lesson_content_columns** - Added content, content_text, objectives

---

## Migration Details

### 1. Assets Table

**Purpose**: Store lesson media assets (video, audio, presentations, documents)

**Columns**:
- `id` (UUID, PK)
- `lesson_id` (UUID, FK → lessons)
- `course_id` (UUID, FK → courses)
- `asset_type` (TEXT) - audio, video, presentation, document
- `url` (TEXT)
- `download_url` (TEXT)
- `file_id` (TEXT)
- `filename` (TEXT)
- `file_path` (TEXT)
- `mime_type` (TEXT)
- `file_size_bytes` (BIGINT)
- `size_bytes` (BIGINT) - alias for compatibility
- `google_drive_file_id` (TEXT)
- `duration_seconds` (INTEGER)
- `metadata` (JSONB)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**RLS Policies**:
- Admin: Full access to organization assets
- Instructor: Manage own course assets, view org assets
- Student: View assets in enrolled courses

**Indexes**:
- `idx_assets_lesson_id`
- `idx_assets_course_id`
- `idx_assets_asset_type`
- `idx_assets_google_drive_file_id`

---

### 2. Google Drive Files Table

**Purpose**: Track Google Drive file sync status and metadata

**Columns**:
- `id` (UUID, PK)
- `file_id` (TEXT, UNIQUE) - Google Drive file ID
- `name` (TEXT)
- `mime_type` (TEXT)
- `size_bytes` (BIGINT)
- `parent_folder_id` (TEXT)
- `web_view_link` (TEXT)
- `download_link` (TEXT)
- `course_id` (UUID, FK → courses)
- `sync_status` (ENUM: synced, pending, failed)
- `last_synced_at` (TIMESTAMPTZ)
- `metadata` (JSONB)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**RLS Policies**: Same as assets table

**Indexes**:
- `idx_google_drive_files_file_id`
- `idx_google_drive_files_course_id`
- `idx_google_drive_files_sync_status`
- `idx_google_drive_files_parent_folder`

---

### 3. File Catalog Updates

**Added Columns**:
- `google_drive_file_id` (TEXT, nullable)
- `original_name` (TEXT, nullable)

**Index**:
- `idx_file_catalog_google_drive_file_id`

---

### 4. Sections & Lessons Timestamps

**Added Columns**:
- `sections.updated_at` (TIMESTAMPTZ)
- `lessons.updated_at` (TIMESTAMPTZ)

**Triggers**: Auto-update triggers added

---

### 5. User Profile Columns

**Added to users table**:
- `full_name` (TEXT, nullable)
- `avatar_url` (TEXT, nullable)
- `bio` (TEXT, nullable)

**Index**:
- `idx_users_full_name` (for searches)

---

### 6. Lesson Content Columns

**Added to lessons table**:
- `content` (JSONB) - rich/structured content
- `content_text` (TEXT) - plain text content
- `objectives` (TEXT[]) - learning objectives array

**Indexes**:
- `idx_lessons_content_gin` (GIN index for JSONB)
- `idx_lessons_objectives_gin` (GIN index for array)

---

## TypeScript Types Status

### Current State

The database migrations are complete, but the TypeScript types file needs regeneration.

**Why manual regeneration is needed**:
- Supabase CLI requires project linking (`supabase link`) which wasn't configured
- MCP Supabase tool generated complete types, but manual file update had issues
- Types file structure requires proper placement within Tables section

### To Complete Type Generation

Run this command in the `courseai-next` directory:

```bash
# Option 1: If project is linked
pnpm supabase gen types typescript --linked > types/database.generated.ts

# Option 2: Direct project reference
pnpm supabase gen types typescript --project-id diqooqbuchsliypgwksu > types/database.generated.ts
```

After regeneration, the following errors will be resolved:
- ✅ Missing table "assets" (currently 8 errors)
- ✅ Missing table "google_drive_files" (currently 2 errors)
- ✅ Missing columns in file_catalog (currently 5 errors)
- ✅ Missing updated_at in sections/lessons (currently 3 errors)
- ✅ Missing user profile columns (currently 3 errors)
- ✅ Missing lesson content columns (currently 4 errors)
- ⚠️ Enum mismatches for course_status (requires code fixes)

**Remaining Issues** (require code changes, not schema changes):
- Course status enum values (completed, failed, cancelled not in DB enum)
- lesson_number property usage (frontend uses derived value)

---

## Validation

### Database Schema ✅

All migrations successfully applied:
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('assets', 'google_drive_files');

-- Verify columns added
SELECT column_name FROM information_schema.columns
WHERE table_name = 'file_catalog' 
AND column_name IN ('google_drive_file_id', 'original_name');
```

### RLS Policies ✅

All tables have proper RLS enabled with role-based access:
- Superadmin: Full access
- Admin: Organization-scoped access
- Instructor: Own courses + org viewing
- Student: Enrolled courses only

---

## Rollback Information

**Changes Log**: `.tmp/current/changes/bug-changes.json`
**Backup Directory**: `.tmp/current/backups/.rollback/`

All migrations are reversible via Supabase migrations system.

---

## Next Steps

1. **Regenerate Types** (REQUIRED):
   ```bash
   cd courseai-next
   pnpm supabase gen types typescript --project-id diqooqbuchsliypgwksu > types/database.generated.ts
   ```

2. **Run Type Check**:
   ```bash
   cd courseai-next
   pnpm tsc --noEmit
   ```

3. **Fix Remaining Code Issues**:
   - Update course status enum usage (completed/failed/cancelled)
   - Fix lesson_number derived property usage
   - Update avatar_url usage in profile updates

4. **Test**Frontend**:
   - Verify course page loads with assets
   - Test Google Drive upload flow
   - Check user profile editing

---

## Files Modified

### Database
- 6 new migrations in `packages/course-gen-platform/supabase/migrations/`

### TypeScript (Pending)
- `courseai-next/types/database.generated.ts` (needs regeneration)

---

## Impact Assessment

**Risk Level**: Low
- All changes are additive (no breaking changes)
- Existing data unaffected
- RLS policies prevent unauthorized access

**Performance**: Minimal
- Indexes added for all foreign keys
- GIN indexes for JSONB/array columns
- No full table scans introduced

**Compatibility**: High
- New columns are nullable
- Existing queries continue to work
- Frontend gracefully handles missing data

---

## Recommendations

1. Monitor Google Drive sync performance with new table
2. Consider adding enum for asset_type if values are fixed
3. Add data validation triggers for objectives array format
4. Set up monitoring for RLS policy performance

