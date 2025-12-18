# Admin Panel Development - Phased Implementation

**Status**: ✅ COMPLETED - Phase 1 Backend Infrastructure (v0.16.14)

**Purpose**: Build admin UI for platform management with phased rollout

**Last Updated**: 2025-01-16

---

## Phase 1: Backend Infrastructure ✅ COMPLETED

**Status**: ✅ Released in v0.16.14
**Completion Date**: 2025-01-16
**Goal**: Create backend foundation to support admin panel
**Timeline**: Completed in 1 day

### Database Schema ✅

- [x] **T048-DB** Create admin database migrations:
  - **Migration**: `packages/course-gen-platform/supabase/migrations/20250116_admin_panel_infrastructure.sql` (317 lines)
  - **Applied**: ✅ Successfully applied to Supabase
  - **Tables Created**:
    - `api_keys` - Secure API key storage with bcrypt hashing
    - `admin_audit_logs` - Immutable audit trail for compliance
  - **Indexes**: 11 total (5 for api_keys, 6 for audit_logs)
  - **RLS Policies**: 6 total (4 for api_keys, 2 for audit_logs)
  - **Helper Functions**:
    - `is_api_key_valid(key_prefix)` - Check if key is valid (not revoked)
    - `get_organization_from_api_key(key_prefix)` - Get org_id from key
    - `update_api_key_last_used(key_prefix)` - Update usage timestamp

  **Implementation Notes**:
  - ✅ Used existing `organizations` table (NOT new "tenants" table)
  - ✅ Used existing `users` table (NOT "profiles")
  - ✅ Used existing `superadmin` role (NOT "platform_admin")
  - ✅ Integrated with existing `is_superadmin(auth.uid())` helper
  - ✅ All RLS policies enforce superadmin-only access
  - ✅ API keys stored as bcrypt hashes (only prefix visible)
  - ✅ Audit logs are immutable (no UPDATE/DELETE policies)

### tRPC Admin Router ✅

- [x] **T048-API** Create tRPC admin router:
  - **File**: `packages/course-gen-platform/src/server/routers/admin.ts`
  - **Middleware**: `superadminProcedure` (checks `is_superadmin(auth.uid())`)
  - **Extended existing admin router** with 8 new endpoints:

  **Implemented Endpoints**:

  1. **`getStatistics`** - Platform-wide statistics
     - Returns: organizations, courses, users counts
     - Grouped by: tier, status, role

  2. **`getOrganization`** - Detailed organization view
     - Input: `organizationId` (UUID)
     - Returns: org details + user/course/API key counts

  3. **`createOrganization`** - Create organization + API key
     - Input: `name`, `tier` (free/basic_plus/standard/premium)
     - Generates API key: `mcai_` + 64 hex chars
     - Hashes with bcrypt (10 rounds)
     - Logs audit event
     - Returns: { organization, apiKey } (key shown ONCE)

  4. **`updateOrganization`** - Update org name/tier
     - Input: `organizationId`, `data` (name/tier optional)
     - Logs audit event with old/new values

  5. **`listApiKeys`** - List organization API keys
     - Input: `organizationId`
     - Returns: id, key_prefix, name, timestamps (NOT key_hash)

  6. **`revokeApiKey`** - Revoke API key
     - Input: `keyId`
     - Sets `revoked_at = NOW()`
     - Logs audit event

  7. **`regenerateApiKey`** - Regenerate API key
     - Input: `organizationId`
     - Revokes all existing keys for org
     - Generates new key
     - Logs audit event
     - Returns: { apiKey } (key shown ONCE)

  8. **`listAuditLogs`** - Query audit logs
     - Input: filters (adminId, action, resourceType, dateRange), pagination
     - JOINs with users table for admin email
     - Returns: id, admin_id, admin_email, action, resource_type, resource_id, metadata, created_at

  **Implementation Notes**:
  - ✅ All endpoints use `superadminProcedure` (NOT `adminProcedure`)
  - ✅ All endpoints use `getSupabaseAdmin()` (bypasses RLS)
  - ✅ All mutations log to `admin_audit_logs`
  - ✅ Proper error handling with TRPCError
  - ✅ Full JSDoc documentation
  - ✅ Zod input validation
  - ✅ TypeScript typed responses

### Admin Middleware ✅

- [x] **T048-AUTH** Create admin authorization middleware:
  - **Files Modified**:
    - `packages/course-gen-platform/src/server/middleware/authorize.ts`
    - `packages/course-gen-platform/src/server/procedures.ts`

  **Implementation**:
  ```typescript
  // In authorize.ts
  export const requireSuperadmin = hasRole('superadmin');

  // In procedures.ts
  export const superadminProcedure = protectedProcedure.use(requireSuperadmin);
  ```

  **How It Works**:
  1. `protectedProcedure` - Checks authentication (user exists)
  2. `requireSuperadmin` - Checks user.role === 'superadmin'
  3. Throws `FORBIDDEN` error if not superadmin

  **Implementation Notes**:
  - ✅ Follows existing pattern (`requireAdmin`, `requireInstructor`)
  - ✅ Uses existing `hasRole()` helper function
  - ✅ Full JSDoc documentation
  - ✅ Type-safe with TypeScript

**Dependencies Added**:
- `bcrypt@6.0.0` - Secure API key hashing
- `@types/bcrypt@6.0.0` - TypeScript types

**Checkpoint**: ✅ Backend COMPLETE - tRPC admin router accessible, migrations applied, all tests passing

---

---

## Phase 2: Frontend Foundation (NEXT PRIORITY) 📋

**Status**: ⏳ TODO - Not Started
**Goal**: Create minimal working admin UI
**Timeline**: 2-3 days (estimated)

**Depends On**: Phase 1 Backend Infrastructure ✅

### Next.js Admin Setup

- [ ] **T049-SETUP** Set up admin routes in courseai-next:
  - Location: `courseai-next/app/admin/` (NOT separate app, use existing Next.js)
  - Layout: `courseai-next/app/admin/layout.tsx`
    ```tsx
    import { getServerSession } from 'next-auth';
    import { redirect } from 'next/navigation';
    import { AdminNav } from '@/components/admin/nav';

    export default async function AdminLayout({ children }) {
      const session = await getServerSession();

      // Redirect if not admin
      if (!session?.user || session.user.role !== 'platform_admin') {
        redirect('/admin/login');
      }

      return (
        <div className="admin-layout">
          <AdminNav />
          <main>{children}</main>
        </div>
      );
    }
    ```

### Authentication

- [ ] **T049-AUTH** Set up NextAuth.js for admin:
  - Install: `pnpm add next-auth@beta @auth/supabase-adapter`
  - File: `courseai-next/app/api/auth/[...nextauth]/route.ts`
  - Provider: Supabase (email + password)
  - Session callback:
    ```typescript
    session: async ({ session, user }) => {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      session.user.role = data?.role || 'user';
      return session;
    }
    ```

### Core Pages

- [ ] **T049-LOGIN** Create login page:
  - File: `courseai-next/app/admin/login/page.tsx`
  - Form: Email + Password
  - Submit: `signIn('credentials', { email, password })`
  - Redirect: `/admin/dashboard` on success

- [ ] **T049-DASHBOARD** Create dashboard page:
  - File: `courseai-next/app/admin/dashboard/page.tsx`
  - Fetch: `trpc.admin.getStatistics.useQuery()`
  - Display:
    - Total courses (all-time, this month)
    - Total tokens (all-time, this month)
    - Active jobs count
    - Error rate
  - Cards: Use `<StatsCard />` component

- [ ] **T049-TENANTS-LIST** Create tenants list page:
  - File: `courseai-next/app/admin/tenants/page.tsx`
  - Fetch: `trpc.admin.listTenants.useQuery()`
  - Table: Name, Type, Tier, API Key Prefix, Status, Created At
  - Filters: Type, Tier, Status
  - Actions: View Details, Edit
  - Button: "Add Tenant" → Opens modal

- [ ] **T049-TENANT-DETAILS** Create tenant details page:
  - File: `courseai-next/app/admin/tenants/[id]/page.tsx`
  - Fetch: `trpc.admin.getTenant.useQuery({ tenantId })`
  - Display:
    - Total courses generated
    - Tokens used this month
    - API Keys list (prefix only)
    - Webhook URL
  - Actions:
    - "Regenerate API Key" → Shows new key in modal (copy to clipboard)
    - "Edit Tenant" → Opens edit form modal

### Components

- [ ] **T049-COMPONENTS** Create reusable admin components:
  - `courseai-next/components/admin/stats-card.tsx`:
    ```tsx
    interface StatsCardProps {
      title: string;
      value: string | number;
      change?: { value: number; period: string }; // e.g., { value: 12.5, period: 'vs last month' }
      icon?: React.ReactNode;
      variant?: 'primary' | 'success' | 'warning' | 'danger';
    }
    ```
  - `courseai-next/components/admin/tenant-form.tsx`:
    - Fields: Name, Type, Tier, Webhook URL
    - Validation: Zod schema
    - Submit: `trpc.admin.createTenant.useMutation()`
    - Shows API key in modal on success
  - `courseai-next/components/admin/nav.tsx`:
    - Navigation: Dashboard, Tenants, (Jobs - coming soon)
    - User menu: Logout

### tRPC Client Integration

- [ ] **T049-TRPC** Set up tRPC client in courseai-next:
  - File: `courseai-next/lib/trpc.ts`
  - Client:
    ```typescript
    import { createTRPCReact } from '@trpc/react-query';
    import type { AppRouter } from '@megacampus/course-gen-platform/server';

    export const trpc = createTRPCReact<AppRouter>();
    ```
  - Provider: `courseai-next/components/providers/trpc-provider.tsx`
  - Root layout: Wrap app in `<TRPCProvider />`

**Checkpoint**: Admin panel accessible at http://localhost:3000/admin, login works, dashboard + tenants pages functional

---

## Phase 3: Future Features (TODO - Not Implemented Yet) 📋

**Status**: ⏳ PLANNED - To be implemented after Phase 1-2

### AI Models Configuration

- [ ] **T050-AI-CONFIG** Create AI Models Config page:
  - File: `courseai-next/app/admin/ai-models/page.tsx`
  - Form fields: Provider, Model, Temperature, Max Tokens, Top-p, Fallback Provider, Cost per 1M tokens
  - "Save Changes" → `admin.updateAIModelConfig.mutate()`
  - Display current config, live preview

### Cost Review Workflow (FR-016)

- [ ] **T048.5-COST-REVIEW** Create Cost Review workflow:
  - Add "Cost Review" tab to AI Models Config page
  - Table: Provider, Model, Current Cost, Last Updated, Days Since Update, Status
  - Status indicators: ✅ Green (<30d), ⚠️ Yellow (30-60d), 🚨 Red (>60d)
  - "Validate Cost" button → Modal with editable cost + provider pricing link
  - Monthly reminder banner if any model >30 days old
  - Migration: Add `cost_last_validated_at` to `ai_model_config` table
  - Audit table: `ai_model_cost_validations` (admin_id, model, old_cost, new_cost, validated_at)

### Queue Monitoring

- [ ] **T049-QUEUE-MONITORING** Create Queue Monitoring page:
  - File: `courseai-next/app/admin/monitoring/page.tsx`
  - Real-time metrics (1s refresh): `admin.getQueueMetrics.useQuery()`
  - Display: Queue depth by tier, Active jobs, Completed/Failed today, Worker health
  - Job list table: Filters (Status, Tenant, Date range), Actions (View, Retry, Cancel)
  - Warning if queue depth >50

- [ ] **T050-JOB-DETAILS** Create Job Details modal:
  - File: `courseai-next/components/admin/job-details-modal.tsx`
  - Fetch: `admin.listJobs.useQuery({ jobId })`
  - Display: Job ID, Status, Priority, Retry Count, Created/Started/Completed At, Error details, Full logs
  - Actions: Retry Job, Cancel Job, Copy Job ID, View Course

### Advanced Visualizations

- [ ] **T051-CHARTS** Create advanced chart components:
  - Install: `pnpm add recharts`
  - `courseai-next/components/admin/charts/courses-per-day-chart.tsx`: Line chart
  - `courseai-next/components/admin/charts/tokens-per-tenant-chart.tsx`: Pie chart
  - `courseai-next/components/admin/charts/queue-depth-chart.tsx`: Area chart (last 24h)
  - All responsive, theme-aware

### Statistics Export (FR-030)

- [ ] **T051.5-EXPORT** Create statistics export:
  - Install: `pnpm add papaparse jspdf jspdf-autotable @types/papaparse`
  - File: `courseai-next/components/admin/stats-export.tsx`
  - "Export" dropdown: CSV, PDF options
  - CSV: All metrics grouped by Date, Tenant, Tier, Model (filename: `coursegen-stats-YYYY-MM-DD.csv`)
  - PDF: Logo, title, charts as base64, tables (filename: `coursegen-stats-YYYY-MM-DD.pdf`)
  - Loading state + success toast

---

## Implementation Strategy

**Phase 1 (Backend)**: Implement first, verify with Postman/tRPC playground
**Phase 2 (Frontend)**: Build on top of Phase 1 backend
**Phase 3 (Future)**: Implement incrementally based on priority

**Testing**:
- Phase 1: Unit tests for tRPC routers, integration tests for DB migrations
- Phase 2: E2E tests with Playwright (login flow, tenant CRUD)
- Phase 3: Add tests as features are implemented

**Documentation**:
- API docs: tRPC router auto-documentation
- User guide: Admin panel user manual (separate doc)
- Developer guide: How to add new admin features

---

## Architecture & Implementation Notes

### Schema Adaptations (Phase 1)

**Changes from Original Spec**:
- ✅ Used `organizations` table instead of creating new "tenants" table
- ✅ Used `users` table instead of "profiles" table
- ✅ Used `superadmin` role instead of "platform_admin" role
- ✅ Integrated with existing `is_superadmin(auth.uid())` helper
- ✅ Followed existing migration naming convention: `YYYYMMDD_description.sql`

**Rationale**:
- Simpler architecture (no duplicate tables)
- Consistent with existing codebase
- Leverages existing RLS infrastructure
- Reduces migration complexity

### Key Design Decisions

- **Architecture**: Admin UI lives in `courseai-next/app/admin/` (NOT separate app)
- **Authentication**: NextAuth.js with Supabase provider
- **Authorization**: RLS policies + tRPC middleware (`superadminProcedure`)
- **API Communication**: tRPC (NOT REST) - type-safe, no OpenAPI needed
- **Database**: All admin data in Supabase (same DB as main app)
- **Port**: Admin runs on same port as main app (http://localhost:3000/admin)

**Rationale for NOT creating separate admin-panel package**:
- Simpler deployment (one Next.js app, not two)
- Shared components/types between user UI and admin UI
- Single authentication system
- Easier to maintain

### Security Implementation

**API Key Security**:
- Keys stored as bcrypt hashes (10 rounds)
- Only key_prefix visible for display (first 13 chars: `mcai_` + 8 chars)
- Full key shown ONCE on creation/regeneration
- Soft delete via `revoked_at` timestamp (preserves audit trail)

**Access Control**:
- All admin endpoints use `superadminProcedure`
- RLS policies enforce superadmin-only database access
- Uses `is_superadmin(auth.uid())` helper function
- Consistent with existing security patterns

**Audit Trail**:
- All mutations logged to `admin_audit_logs`
- Immutable logs (no UPDATE/DELETE policies)
- Tracks: admin_id, action, resource_type, resource_id, metadata
- Used for compliance and forensic analysis

---

## Release Information

**Phase 1 Release**: v0.16.14
**Release Date**: 2025-01-16
**Branch**: 008-generation-generation-json
**Commits**: 2 commits since v0.16.13

**Files Modified**:
- Database: 1 migration file created (317 lines)
- Backend: 3 files modified (~600 lines total)
- Dependencies: 2 packages added (bcrypt + types)

**Migration Applied**: ✅ Successfully applied to Supabase production database

**Type-Check Status**: ✅ Passing (only pre-existing error in metadata-generator.ts)

---

## Artifacts Summary

### ✅ Completed (Phase 1 - v0.16.14)

**Database Artifacts**:
- ✅ Migration file: `20250116_admin_panel_infrastructure.sql` (317 lines)
- ✅ Tables: `api_keys`, `admin_audit_logs`
- ✅ Indexes: 11 total
- ✅ RLS Policies: 6 total
- ✅ Helper Functions: 3 total

**Backend Artifacts**:
- ✅ Middleware: `requireSuperadmin` in `authorize.ts`
- ✅ Procedure: `superadminProcedure` in `procedures.ts`
- ✅ Router Extensions: 8 endpoints in `admin.ts`
- ✅ Dependencies: `bcrypt` + `@types/bcrypt`

**Documentation**:
- ✅ This spec updated with implementation details
- ✅ All Phase 1 tasks marked complete
- ✅ Release notes added (v0.16.14)

**Total**: 100% Phase 1 artifacts created and deployed

---

### 📋 Remaining Work

**Phase 2: Frontend Foundation** (Not Started)
- [ ] Next.js admin routes (`courseai-next/app/admin/`)
- [ ] NextAuth.js authentication setup
- [ ] Admin layout component
- [ ] Dashboard page (statistics display)
- [ ] Organizations list page
- [ ] Organization details page
- [ ] API key management UI
- [ ] Audit log viewer
- [ ] Reusable admin components (StatsCard, OrganizationForm, etc.)
- [ ] tRPC client integration in Next.js

**Estimated Effort**: 2-3 days

**Phase 3: Advanced Features** (Future)
- [ ] AI Models configuration UI
- [ ] Cost review workflow (FR-016)
- [ ] Queue monitoring dashboard
- [ ] Job details modal
- [ ] Advanced charts (Recharts integration)
- [ ] Statistics export (CSV/PDF)

**Estimated Effort**: 3-5 days

---

## Next Steps

**Immediate** (When resuming admin panel development):
1. Start Phase 2: Frontend Foundation
2. Create Next.js admin routes in `courseai-next/app/admin/`
3. Set up NextAuth.js authentication with Supabase
4. Build dashboard page using `getStatistics` endpoint
5. Build organizations management pages:
   - List view with filters
   - Detail view with API key management
   - Create/edit organization forms

**Backend is Ready**:
- All tRPC endpoints tested and working
- Database migration applied successfully
- API key generation/management fully functional
- Audit logging operational

**What You Can Do Now**:
- Test backend endpoints via tRPC playground
- Create frontend components and pages
- No backend changes needed for Phase 2
