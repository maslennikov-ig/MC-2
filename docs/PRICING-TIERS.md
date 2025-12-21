# MegaCampusAI Pricing Tiers & Feature Distribution

**Version**: 3.0.0
**Date**: 2025-12-21
**Status**: Implemented

---

## Executive Summary

This document defines the feature distribution across MegaCampusAI pricing tiers. The tier system is now fully database-driven with admin management capabilities.

**Tier Philosophy**:
- **TRIAL**: 14-day trial with full STANDARD features (no export)
- **FREE**: Minimal tier for exploration (no file uploads)
- **BASIC**: Entry-level paid tier (text files only)
- **STANDARD (Optimum)**: Production-ready optimal tier (PRIMARY FOCUS)
- **PREMIUM (Maximum)**: Maximum features with image support

---

## Implementation Architecture

### Database-Driven Configuration

All tier settings are stored in the `tier_settings` database table, replacing hardcoded TypeScript constants.

**Table Schema** (`tier_settings`):

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tier_key` | TEXT | Tier identifier: trial, free, basic, standard, premium |
| `display_name` | TEXT | Human-readable tier name |
| `storage_quota_bytes` | BIGINT | Maximum storage per organization |
| `max_file_size_bytes` | BIGINT | Maximum size per uploaded file |
| `max_files_per_course` | INTEGER | Maximum files per course (0 = no uploads) |
| `max_concurrent_jobs` | INTEGER | Parallel generation job limit |
| `allowed_mime_types` | TEXT[] | Allowed file MIME types |
| `allowed_extensions` | TEXT[] | Allowed file extensions |
| `monthly_price_cents` | INTEGER | Monthly price in cents |
| `features` | JSONB | Additional features |
| `is_active` | BOOLEAN | Tier availability |

### Tier Settings Service

**Location**: `packages/course-gen-platform/src/shared/tier/tier-settings-service.ts`

**Key Functions**:
- `getTierSettings(tierKey)` - Get settings for a specific tier
- `getAllTierSettings()` - Get all active tier settings
- `getEffectiveTierSettings(userRole, orgTier)` - Get settings with superadmin bypass
- `refreshCache()` - Force refresh the cache

**Caching**:
- 5-minute in-memory cache (TTL)
- Automatic fallback to hardcoded defaults if database unavailable
- Cache refresh on admin updates

```typescript
// Example usage
import { getTierSettings, getEffectiveTierSettings } from '@/shared/tier/tier-settings-service';

// Get tier settings
const settings = await getTierSettings('standard');
console.log(`Max file size: ${settings.maxFileSizeBytes} bytes`);

// Get effective settings (superadmin bypass)
const effective = await getEffectiveTierSettings(user.role, org.tier);
```

### SuperAdmin Bypass

**Location**: `packages/course-gen-platform/src/shared/tier/superadmin-bypass.ts`

SuperAdmin users automatically receive premium tier limits regardless of their organization's tier.

**Bypass Applied In**:
- File validator (file size, MIME types)
- Quota enforcer (storage limits)
- Concurrency tracker (job limits)

**Helper Functions**:
- `isSuperAdmin(userRole)` - Check if user is superadmin
- `getEffectiveTier(userRole, orgTier)` - Get effective tier (premium for superadmin)
- `shouldBypassTierRestrictions(userRole)` - Boolean check for bypass

```typescript
import { getEffectiveTier, isSuperAdmin } from '@/shared/tier/superadmin-bypass';

// Superadmin always gets premium tier
const tier = getEffectiveTier('superadmin', 'basic'); // Returns 'premium'

// Regular user gets org tier
const tier = getEffectiveTier('instructor', 'basic'); // Returns 'basic'
```

### Admin Management UI

**Route**: `/admin/pricing`
**Access**: SuperAdmin only

**tRPC Router** (`admin.tiers`):
- `admin.tiers.list` - List all tier settings
- `admin.tiers.get` - Get single tier settings
- `admin.tiers.update` - Update tier settings
- `admin.tiers.resetTierToDefaults` - Reset tier to defaults

---

## Tier Overview

| Tier | Target Audience | Monthly Price | Storage Quota | Max File Size | Files/Course | Concurrent Jobs |
|------|----------------|---------------|---------------|---------------|--------------|-----------------|
| **TRIAL** | Evaluation users | $0 | 1 GB | 10 MB | 3 | 5 |
| **FREE** | Individual exploration | $0 | 10 MB | 5 MB | 0 | 1 |
| **BASIC** | Hobbyists, educators | $19 | 100 MB | 10 MB | 1 | 2 |
| **STANDARD** | Small teams, businesses | $49 | 1 GB | 10 MB | 3 | 5 |
| **PREMIUM** | Institutions, enterprises | $149 | 10 GB | 100 MB | 10 | 10 |

---

## File Format Support

### Allowed MIME Types by Tier

| Tier | Allowed MIME Types |
|------|-------------------|
| **TRIAL** | PDF, DOCX, PPTX, HTML, TXT, MD |
| **FREE** | None (no file uploads) |
| **BASIC** | TXT, MD only |
| **STANDARD** | PDF, DOCX, PPTX, HTML, TXT, MD |
| **PREMIUM** | All above + PNG, JPG, JPEG, GIF, SVG, WEBP |

### Detailed MIME Type Mapping

| Format | MIME Type | TRIAL | FREE | BASIC | STANDARD | PREMIUM |
|--------|-----------|-------|------|-------|----------|---------|
| PDF | `application/pdf` | Y | - | - | Y | Y |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Y | - | - | Y | Y |
| PPTX | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Y | - | - | Y | Y |
| HTML | `text/html` | Y | - | - | Y | Y |
| TXT | `text/plain` | Y | - | Y | Y | Y |
| MD | `text/markdown` | Y | - | Y | Y | Y |
| PNG | `image/png` | - | - | - | - | Y |
| JPEG | `image/jpeg` | - | - | - | - | Y |
| GIF | `image/gif` | - | - | - | - | Y |
| SVG | `image/svg+xml` | - | - | - | - | Y |
| WEBP | `image/webp` | - | - | - | - | Y |

---

## Tier Feature Details

### TRIAL Tier

- **Duration**: 14 days
- **Storage**: 1 GB
- **File uploads**: 3 files per course
- **File types**: PDF, DOCX, PPTX, HTML, TXT, MD
- **Processing**: Full document processing (Docling MCP)
- **Export**: Blocked (watermark enabled)
- **Features**: `trial_duration_days: 14`, `watermark_enabled: true`

### FREE Tier

- **Duration**: Unlimited
- **Storage**: 10 MB
- **File uploads**: Disabled (0 files per course)
- **File types**: None
- **Processing**: Manual text input only
- **Export**: Blocked
- **Features**: `ads_enabled: true`

### BASIC Tier

- **Price**: $19/month
- **Storage**: 100 MB
- **File uploads**: 1 file per course
- **File types**: TXT, MD only
- **Processing**: Direct file read (no Docling)
- **Export**: Limited (with watermark)
- **Features**: `email_support: true`

### STANDARD Tier

- **Price**: $49/month
- **Storage**: 1 GB
- **File uploads**: 3 files per course
- **File types**: PDF, DOCX, PPTX, HTML, TXT, MD
- **Processing**: Full document processing (Docling MCP)
- **Export**: Full
- **Features**: `priority_support: true`, `analytics_dashboard: true`

### PREMIUM Tier

- **Price**: $149/month
- **Storage**: 10 GB
- **File uploads**: 10 files per course
- **File types**: All STANDARD + images (PNG, JPG, GIF, SVG, WEBP)
- **Processing**: Full document processing + image analysis
- **Export**: Full + API access
- **Features**: `priority_support: true`, `analytics_dashboard: true`, `custom_branding: true`, `api_access: true`, `dedicated_support: true`

---

## SuperAdmin Privileges

SuperAdmin users bypass all tier-based restrictions:

| Limit Type | Regular User | SuperAdmin |
|------------|--------------|------------|
| Storage Quota | Based on org tier | 10 GB (premium) |
| Max File Size | Based on org tier | 100 MB (premium) |
| Files per Course | Based on org tier | 10 (premium) |
| Concurrent Jobs | Based on org tier | 10 (premium) |
| Allowed MIME Types | Based on org tier | All types (premium) |

**Implementation**: The `getEffectiveTierSettings()` function automatically returns premium tier settings when the user role is `superadmin`.

---

## Database Migration

**Migration File**: `packages/course-gen-platform/supabase/migrations/20251221120000_create_tier_settings.sql`

**Key Features**:
- Creates `tier_settings` table with all necessary columns
- Inserts default seed data for all 5 tiers
- Implements RLS policies (public read for active tiers, superadmin full access)
- Includes `get_tier_settings(tier_key)` helper function
- Uses `ON CONFLICT` upsert for idempotent migrations

---

## RLS Policies

| Policy | Access Level | Description |
|--------|--------------|-------------|
| `tier_settings_public_read` | SELECT | Everyone can read active tiers |
| `tier_settings_superadmin_read_all` | SELECT | Superadmins can read all tiers (including inactive) |
| `tier_settings_superadmin_insert` | INSERT | Superadmins only |
| `tier_settings_superadmin_update` | UPDATE | Superadmins only |
| `tier_settings_superadmin_delete` | DELETE | Superadmins only |

---

## Cost Analysis

### Infrastructure Costs (Monthly per org)

| Component | TRIAL | FREE | BASIC | STANDARD | PREMIUM |
|-----------|-------|------|-------|----------|---------|
| **Qdrant Storage** | $0.50 | $0 (shared) | $0.02 | $0.50 | $5 |
| **Jina Embeddings** | $2 | $0.05 | $0.20 | $2 | $8 |
| **LLM (GPT)** | $15 | $2 | $5 | $15 | $40 |
| **Docling MCP** | $0.20 | - | - | $0.20 | $0.20 |
| **Total** | ~$18 | ~$2 | ~$5 | ~$18 | ~$53 |

### Margin Analysis

| Tier | Revenue | Cost | Profit | Margin |
|------|---------|------|--------|--------|
| TRIAL | $0 | $18 | -$18 | N/A (acquisition) |
| FREE | $0 | $2 | -$2 | N/A (loss leader) |
| BASIC | $19 | $5 | $14 | 74% |
| STANDARD | $49 | $18 | $31 | 63% |
| PREMIUM | $149 | $53 | $96 | 64% |

---

## Related Files

### Core Implementation

| File | Purpose |
|------|---------|
| `packages/course-gen-platform/supabase/migrations/20251221120000_create_tier_settings.sql` | Database table and seed data |
| `packages/course-gen-platform/src/shared/tier/tier-settings-service.ts` | Service for fetching/caching settings |
| `packages/course-gen-platform/src/shared/tier/superadmin-bypass.ts` | SuperAdmin bypass utilities |
| `packages/shared-types/src/tier-settings.types.ts` | TypeScript type definitions |

### Enforcement Points

| File | Enforces |
|------|----------|
| `packages/course-gen-platform/src/shared/validation/file-validator.ts` | File size, MIME types |
| `packages/course-gen-platform/src/shared/quota/quota-enforcer.ts` | Storage quotas |
| `packages/course-gen-platform/src/shared/concurrency/tracker.ts` | Concurrent job limits |

### Admin UI

| File | Purpose |
|------|---------|
| `packages/web/app/[locale]/admin/pricing/page.tsx` | Admin pricing page |
| `packages/course-gen-platform/src/trpc/router/admin/tiers.ts` | tRPC router for tier management |

---

## Version History

- **v3.0.0** (2025-12-21): Implemented database-driven tier settings with admin UI
- v2.1.0 (2025-10-14): Added Docling MCP Server integration
- v2.0.0 (2025-01-14): Added TRIAL tier, updated to 5-tier system
- v1.0.0 (2025-01-14): Initial draft with FREE/BASIC/PREMIUM tiers
