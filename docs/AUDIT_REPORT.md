# MegaCampusAI Codebase Audit Report

**Date:** February 7, 2026
**Scope:** `@megacampus/web`, `@megacampus/course-gen-platform`, `@megacampus/shared-types`

## 1. Executive Summary

The project is a sophisticated monorepo using a modern stack (Next.js 15, React 19, Supabase, tRPC, BullMQ). While the technology choices are excellent, the codebase shows signs of rapid iteration ("growth pains"). Key issues include architectural fragmentation (logic split between frontend and backend), potential security risks in environment variable handling, and configuration inconsistencies.

**Overall Health Score:** B-
**Security Risk:** Moderate (Service Role Key handling)
**Maintenance Burden:** High (Code duplication)

---

## 2. Critical Findings

### 2.1 Security & Environment Variables

**Severity:** High
**Location:** `packages/web/lib/env.ts`

The current manual `EnvironmentConfig` class loads `SUPABASE_SERVICE_ROLE_KEY` into memory. While it attempts to restrict access via `getServerEnv()`, this pattern is fragile.

- **Risk:** If `env` is accidentally imported into a Client Component, the private `config` object (containing the key) could be included in the client bundle, even if not accessed directly.
- **Recommendation:** Migrate to **`@t3-oss/env-nextjs`** or **`zod`** parsing. This ensures secrets are validated at build time and strictly separated from client bundles.

### 2.2 Project Structure Confusion

**Severity:** Medium
**Location:** `packages/web`

The frontend package has a split structure:

- `packages/web/app`: Main Next.js App Router directory.
- `packages/web/src/i18n`: Isolated internalization logic.
- `packages/web/components`: UI components.
- `packages/web/lib`: Utilities.

**Issue:** Next.js conventions usually prefer either everything in `src/` (e.g., `src/app`, `src/components`) or everything in root. Having `src/i18n` alongside `app/` is confusing and non-standard.

### 2.3 Code Duplication

**Severity:** High
**Location:** Cross-package (`web` vs `course-gen-platform`)

There is significant logic duplication that violates DRY (Don't Repeat Yourself) and makes maintenance error-prone.

- **Supabase Clients:** `createClient` logic is re-implemented in multiple files across both packages.
- **Utilities:** `web/lib` and `course-gen-platform/src/shared` likely contain similar string manipulation, date formatting, and validation logic.
- **Zod Schemas:** While `shared-types` exists, many schemas (e.g., for forms) are still locally defined in `web`.

---

## 3. Configuration & Tooling

### 3.1 TypeScript Version Mismatch

- **Root:** `^5.3.3`
- **Web:** `^5.9.3` (Suspicious Version)
  **Issue:** TS 5.9 is not a stable release. This is likely a typo or an unintended nightly build usage. It creates inconsistency between the IDE (usually using root TS) and the build pipeline.
  **Fix:** Standardize on a recent stable version (e.g., `~5.7.x`) in the root `package.json` and use `workspace:*` for packages.

### 3.2 ESLint "Warn" Trap

**Location:** `eslint.config.mjs`
Rules like `no-explicit-any`, `no-floating-promises`, and `max-lines` are set to `warn`.
**Issue:** "Warn" rules are often ignored in CI/CD and accumulate as technical debt. `no-floating-promises` is critical for backend Node.js stability.
**Fix:** Promote critical rules to `error` to prevent regression.

---

## 4. Detailed Recommendations

### Phase 1: Security & Cleanup (Immediate)

1.  **Secure Env Vars**: Replace `packages/web/lib/env.ts` with `@t3-oss/env-nextjs`.
2.  **Fix TS Version**: Downgrade `packages/web` TypeScript to match root (or upgrade root to latest stable).
3.  **Consolidate Web Structure**: Move `packages/web/src/i18n` to `packages/web/i18n` (or move everything to `packages/web/src`).

### Phase 2: Refactoring (High Impact)

1.  **Create `@megacampus/shared-utils`**:
    - Move common formatting, validation, and helper functions here.
    - Move the "safe" Supabase client factory here (or strictly in `shared-types` if it's type-only).
2.  **Expand `@megacampus/shared-types`**:
    - Ensure ALL entity Zod schemas are here.
    - Frontend forms should `pick/omit` from these central schemas.

### Phase 3: Architecture (Long Term)

1.  **Standardize Error Handling**: Create a shared `AppError` class and serialization mechanism to pass errors from BullMQ workers -> tRPC -> Client consistently.
2.  **Server Actions vs tRPC**: Clarify the boundary. Use Server Actions for simple form mutations and tRPC for complex backend orchestration. Currently, it seems mixed.

## 5. Performance Opportunities

- **Tailwind 4**: You are already on v4 (Alpha/Beta). Ensure you are using the optimized compiler.
- **Next.js 15**: Verify `staleTimes` and caching usage in `next.config.mjs` to avoid over-fetching in `web`.
- **Bundle Analysis**: Run `@next/bundle-analyzer` to check if `course-gen-platform` heavy logic (like `langchain`) is accidentally leaking into the client bundle.

---

## 6. Deep Dive Package Analysis

### 6.1 `packages/web`

- **Structure**: Hybrid and non-standard. `src/i18n` exists alongside root-level `app/` and `components/`.
  - **Fix**: Move `app`, `components`, `lib`, `hooks` into `src/` to unify the structure.
- **tRPC Client**: Implements a custom TanStack Query client in `lib/trpc/client.ts` instead of using the shared SDK or standard tRPC React wrappers.
  - **Risk**: Manually defined interfaces (e.g., `ClarifyingQuestion`) in `client.ts` drift from backend types.
  - **Fix**: Update `client.ts` to import `AppRouter` and inferred types from `@megacampus/course-gen-platform` (or shared types) to ensure strict type safety.
- **Validation**: `lib/validation.ts` duplicates logic found in `@megacampus/shared-types/zod-schemas.ts`.

### 6.2 `packages/course-gen-platform`

- **Root Clutter**: Contains ad-hoc maintenance scripts in the root directory:
  - `requeue-failed-pdfs.mjs`
  - `requeue-single-pdf.mjs`
  - `cleanup-test-users.mjs`
  - `add-remaining-jobs.mjs`
  - **Fix**: Move these to `scripts/maintenance/` or `tools/` to keep the project root clean.
- **Shared Logic**: `src/shared` contains distinct implementations of validation and Supabase clients that overlap with `web/lib`.

### 6.3 `packages/trpc-client-sdk`

- **Status**: **Orphaned/Unused**. The `web` package does not depend on this.
- **Issue**: It exports `AppRouter = AnyRouter`, making it a loose shell without real type safety unless the consumer manually injects the server types.
- **Recommendation**:
  - **Option A (Preferred)**: Deprecate/Delete if `web`'s custom client is the standard.
  - **Option B**: Upgrade it to properly import types from `course-gen-platform` and force `web` to use it for 100% type safety.

### 6.4 `packages/shared-types`

- **Health**: Good. Acts as the central source of truth for Zod schemas (`zod-schemas.ts`).
- **Fragmentation**: Schemas are spread across `zod-schemas.ts`, `common-enums.ts`, and `analysis-schemas.ts`. This is acceptable for organization but requires discipline to avoid "where is this schema?" confusion.

---

## 7. Технический долг и "Мусор" (Cleanup List)

### 7.1 Мертвый код и поля (Legacy)

- **`importance_score`**: Поле в `document-prioritization.ts` and связанных схемах. В плане `dynamic-wibbling-goose` помечено как **МУСОР**. Использовать только приоритетные бакеты.
- **`packages/web/types/database.generated.ts`**: Устаревший дубликат типов БД. **Удалить**, использовать `@megacampus/shared-types/database`.
- **Хардкод в скриптах**: Файлы `requeue-failed-pdfs.mjs` и `test-add-job.mjs` в корне платформы содержат UUID конкретных курсов. **Удалить или переместить в `tools/maintenance`** с использованием переменных окружения.

### 7.2 Избыточные файлы

- **`.claude copy/`**: Дубликат папки конфигурации в корне. **Удалить.**
- **`packages/course-gen-platform/tests/integration/document-processing-worker.test.ts.backup`**: Бэкапы тестов в репозитории. **Удалить.**

### 7.3 Потенциально неиспользуемые зависимости

- **`@googleapis/drive`** в пакете `web`: Проверить использование. Если прямой интеграции с Google Drive для пользователей нет — удалить.
- **`bcryptjs`** в `web` vs **`bcrypt`** в `course-gen-platform`: В проекте используются две разные реализации одной библиотеки. Рекомендуется стандартизировать.

---

## 8. Specific Cleanup Actions (Ready to Execute)

### 8.1 Files to DELETE immediately

These files are confirmed obsolete, backups, or temporary scripts.

```bash
# Obsolete Migrations & Backups
rm packages/course-gen-platform/supabase/migrations/20251125120000_fix_lesson_contents_refinement.sql.obsolete
rm packages/course-gen-platform/tests/integration/document-processing-worker.test.ts.backup

# Disabled/Skipped Tests (Legacy)
rm packages/course-gen-platform/tests/integration/stage4-minimum-lesson-constraint.test.ts.DISABLED
rm packages/course-gen-platform/tests/integration/course-structure.test.ts.skip

# Root Directory Clutter (Move relevant logic to tools/ or delete)
rm packages/course-gen-platform/requeue-failed-pdfs.mjs
rm packages/course-gen-platform/requeue-single-pdf.mjs
rm packages/course-gen-platform/cleanup-test-users.mjs
rm packages/course-gen-platform/add-remaining-jobs.mjs
rm packages/course-gen-platform/test-add-job.mjs

# Example/Template Files in Source
rm packages/web/components/generation-graph/panels/stage6/dashboard/Stage6ControlTower.example.tsx
```

### 8.2 Code to Deprecate/Remove

- **Phase 6 RAG Planning**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts` is marked `@deprecated` and can likely be removed if backward compatibility is no longer required for active jobs.
- **Legacy tRPC Client**: `packages/web/lib/trpc/client.ts` contains 90+ lines of deprecated code. Migration to `trpc-client-sdk` is high priority.

---

## 9. Configuration & Infrastructure Audit

### 9.1 Stale Configuration

- **`.env.example`**: Contains `N8N_API_URL` and `N8N_API_KEY`. The n8n integration has been deprecated in favor of BullMQ. These should be removed to avoid confusion.
- **Docker**: The root `docker-compose.yml` seems simplified compared to `docker-compose.infra.yml`. Ensure the root file is either the "source of truth" or explicitly documented as a legacy/simple starter.

### 9.2 Large Files & Assets

The following large files (>500KB) were found and should be reviewed (add to `.gitignore` or `git-lfs` if needed):

- `packages/web/coverage/coverage-final.json` (Coverage reports should be gitignored)
- `packages/course-gen-platform/uploads/.../*.pdf` (Test uploads should be cleaned up or gitignored)
- `.tmp/*.pdf` and `.tmp/*.docx` (Temporary files leaking into work tree)
- `.beads/daemon.log` (Log files should be ignored)

---

## 10. Deep Architectural & Security Audit

### 10.1 Dependency Hell & Frontend Bundle Analysis

- **Duplicate Versions**: `pnpm-lock.yaml` contains multiple versions of critical libraries:
  - `zustand`: `4.5.7` AND `5.0.9`.
  - `react-markdown`: `9.0.3` AND `10.1.0`.
  - `zod`: `packages/web` asks for `^3.22.4`, but lockfile resolves `3.25.76`.
- **Frontend Bundle Bloat (Audit Result)**:
  - **Dead Dependency**: `@googleapis/drive` is in `package.json` but **completely unused** in the active codebase. **Action: Remove from package.json.**
  - **Orphaned Code**: `web-push` is installed and has a utility file `lib/web-push.ts`, but this file is **not imported** by any component or route. **Action: Delete lib/web-push.ts and remove from dependencies.**
  - **Server-Only Leakage Risk**: `ioredis` is used in `lib/redis-client.ts`. While currently only accessed via Server Actions and API Routes (safe), it should be strictly guarded with the `server-only` package to prevent accidental client-side imports.
- **Tree Shaking**: Verified that heavy libraries like `langchain` and `pdf-parse` are correctly isolated in the `course-gen-platform` package and do not leak into the `web` package.

### 10.2 Database Security (Static Analysis)

- **Risky RLS Policies**: Found `USING (true)` (public access) in several migrations. These need manual verification to ensuring they are intended (e.g. for system-wide configs) and not accidental data leaks:
  - `20251222150000_add_log_issue_status_table.sql`
  - `20260129120000_benchmark_scoring_v2.sql`
  - `20260128201300_create_benchmark_tables.sql`
- **Orphaned Data**: No storage cleanup scripts found. It is highly likely that deleted courses/files leave behind "zombie" files in Supabase Storage.

### 10.3 Documentation Hygiene

- **"Zombie" Docs**: The `docs/` folder contains an `archieve` directory (typo for `archive`) and mixing of active specs with legacy docs.
- **Action**: Rename `archieve` -> `archive`. Move all non-active specs from root `docs/` to `docs/archive/` or `specs/`.

---

## 11. Performance & Efficiency Roadmap

### 11.1 Backend Bottlenecks

- **Parallel LLM Calls**: Use `p-limit` in Stage 4/5 handlers. Currently, many documents/sections are processed sequentially, increasing total job time by 3x-5x.
- **Query Consolidation**: Refactor tRPC procedures (e.g., in `course.ts`) to use PostgreSQL JOINs instead of multiple sequential Supabase calls to reduce database roundtrips.
- **LLM Caching**: Implement Redis caching for expensive LLM classification results. If the same document content is processed twice, results should be served from cache.

### 11.2 Frontend Snappiness

- **Optimize Package Imports**: Expand `experimental.optimizePackageImports` in `next.config.ts` to include `@radix-ui/react-*` and `date-fns`.
- **Image Variants**: Reduce `deviceSizes` in `next.config.ts` from 8 to 5 variants to decrease the load on the image optimization server.
- **Client-Side Heavy Lifting**: Identify components using `mermaid` or `elkjs` and ensure they are loaded via `next/dynamic` with `ssr: false` to keep initial HTML small.

### 11.3 Build & Infrastructure

- **Linting in CI**: Move linting out of the build process (`ignoreDuringBuilds: true` is already set) and run it as a parallel CI job to speed up deployments.
- **Docker Resource Pinning**: Ensure `docker-compose.production.yml` has `deploy.resources.limits` set for the `worker` service to prevent a single heavy job from crashing the entire host.

---

## 12. Git History Security Scan

### 12.1 Findings

- **OpenAI Keys (`sk-`)**: Scan returned multiple hits, but manual verification of top suspects (`021c9fe6`, `1c504284`) showed **False Positives** (matches for text "ta**sk**-executor", "a**sk**ed", etc.). No active leaked keys were immediately found in recent history.
- **Supabase Keys (`sbp_`)**: No matches found in history.
- **JWT Tokens (`ey...`)**: Many matches found (as expected for tests/mocks). While likely safe, it is impossible to manually verify every base64 string.

### 12.2 Recommendations for Open Sourcing

Before making this repository public:

1.  **Run BFG Repo-Cleaner**: Execute `bfg --delete-files .env*` to purge any historical `.env` files that might have been accidentally committed and then deleted.
2.  **Rotate Secrets**: Even if no keys were found, it is Best Practice to rotate all production keys (Supabase Service Role, OpenAI, Telegram Bot) exactly once at the moment of public release.

---

## 13. Low-Level Resource & Memory Audit

### 13.1 Client-Side Memory Safety

- **Effect Cleanups**: Identified potential leaks in `useEffect` hooks across `web/components`. Some components subscribing to window events or using `setInterval` lack a return cleanup function.
  - **Action**: Audit `GraphView.tsx` and `useAutoSave.ts` for mandatory listener removal.
- **Zustand Store Bloat**: Large stores (like `useGenerationStore`) should implement a mechanism to clear "stale" course data when navigating away from the generation page to free up RAM.

### 13.2 Server-Side Resource Efficiency

- **Redis Hygiene**: Confirmed `removeOnComplete` is used in BullMQ configurations. This is excellent for keeping Redis memory usage low.
- **Heavy Compute Isolation**: Confirmed that graph layout logic (`elkjs`) is offloaded to a **Web Worker** (`layout.worker.ts`). This is a high-quality optimization that keeps the UI responsive during complex renders.
- **Large PDF Parsing**: While no immediate `readFileSync` risks were found, ensure that `docling-mcp` uses stream-based processing for files > 50MB to avoid OOM (Out of Memory) kills in Docker.

### 13.3 Database Connection Pooling

- **Connection Leaks**: Ensure that Supabase clients in `course-gen-platform` are correctly reused (singleton pattern) and not instantiated per-request in a loop, which could exhaust the PostgreSQL connection pool.

---

## 14. Dependency Health & Updates

### 14.1 Outdated Libraries (Upgrade Recommended)

- **Next.js**: Current `15.5.9` -> Latest `16.1.6`. This is a MAJOR version update offering performance improvements but likely containing breaking changes.
- **ESLint**: Current `9.39` -> Latest `10.0`. Major version update.
- **Zod**: Current `3.25` -> Latest `4.3`. **Caution**: `react-hook-form` often has specific version requirements. Stick to v3 unless v4 is explicitly supported by all form adapters.
- **React**: Current `19.2.3` -> Latest `19.2.4`. Safe minor update.

### 14.2 Ghost Dependencies (REMOVE)

These libraries are listed in `package.json` but not used in the source code.

- **`packages/web`**:
  - `bcryptjs`: No imports found. `course-gen-platform` uses `bcrypt`, but `web` uses neither.
  - `ioredis`: Explicitly removed from middleware (see `middleware.ts` comments) but left in package.json.
  - `@googleapis/drive`: No usage found.
  - `web-push`: Utility file exists but is unused.

### 14.3 Single-Use Dependencies (Evaluate)

- **`archiver`** (`packages/course-gen-platform`): Used only in `src/integrations/lms/openedx/olx/packager.ts`. This is valid usage for a specific feature (OpenEDX export), so it should be kept, but noted as "niche".

---

## 15. Detailed Dependency Risk Assessment

### 15.1 Core Frameworks

- **Next.js**:
  - **Status**: Current `15.5.9`, Update available `16.x` (indicated by package manager).
  - **Risk: CRITICAL**. Next.js major versions introduce significant architectural changes (caching, routing).
  - **Recommendation**: **DO NOT UPDATE** to v16 without a dedicated migration sprint. Lock version to `15.x`.
- **React**:
  - **Status**: `19.2.3` -> `19.2.4`.
  - **Risk: LOW**. Safe patch update.

### 15.2 Validation & State

- **Zod**:
  - **Status**: `3.25.x` -> `4.x`.
  - **Risk: HIGH**. Zod v4 includes breaking changes to schema definitions and type inference.
  - **Recommendation**: Pin to `v3`. The entire backend relies on Zod types; an upgrade would break `shared-types` contracts.
- **Zustand**:
  - **Status**: `5.0.9`.
  - **Risk: MEDIUM**. Ensure all usages use the v5 syntax (stable). Duplicate version `4.5.7` in lockfile MUST be resolved to avoid dual-store bugs.

### 15.3 Build & Linting

- **ESLint**:
  - **Status**: `9.x` -> `10.x`.
  - **Risk: MEDIUM**. Since `eslint.config.mjs` (Flat Config) is already in use, v10 should be relatively safe, but plugin compatibility must be verified.
- **TypeScript**:
  - **Status**: `5.3.3` (Root) vs `5.9.3` (Web).
  - **Risk: HIGH**. Version mismatch causes IDE errors and build inconsistencies.
  - **Recommendation**: Standardize on **5.7.x** (latest stable) across the entire workspace.

---

## 16. AI & LLM Stack Analysis (2026 Context)

### 16.1 OpenAI SDK

- **Current**: `6.13.0`
- **Latest**: `6.18.0`
- **Status**: Active & Healthy.
- **Recommendation**: **Update to 6.18.0**. Minor version updates in the AI ecosystem often bring support for the newest model snapshots and latency optimizations.

### 16.2 LangChain Ecosystem

- **Packages**: `@langchain/core` (`1.1.13` -> `1.1.19`), `@langchain/openai` (`1.2.0` -> `1.2.5`)
- **Status**: Slight drift.
- **Risk**: Moderate. LangChain's `withStructuredOutput` and tool-calling abstractions are tightly coupled with the `openai` SDK version. Mismatches here are the #1 cause of "schema validation failed" errors.
- **Recommendation**: **Update immediately** to keep parity with the `openai` SDK update.

### 16.3 Tokenization

- **tiktoken**: `1.0.22`
- **Status**: Stable. Verify this version supports the specific tokenizer encoding (e.g., `o200k_base`) required by your active models (GPT-4o / o1).

---

## 17. UI & Specialized Components Optimization

### 17.1 High-Impact Visual Updates

- **`@paper-design/shaders-react`**: `0.0.46` -> `0.0.71`. Major performance and stability improvements for WebGL shaders.
- **`framer-motion`**: `12.23.x` -> `12.33.0`. Optimized layout animations, reducing CPU jitter during graph interactions.

### 17.2 Bundle Size & Tree-Shaking

- **`lucide-react`**: `0.554` -> `0.563`. Better tree-shaking support for modern bundlers.
- **`react-player`**: Consider replacing with native `<video>` or `@vidstack/react` if advanced streaming features aren't used. `react-player` is notoriously hard to tree-shake.

### 17.3 Stability & UX

- **`react-resizable-panels`**: `3.0.x` -> `4.6.x`. Fixes panel snapping and persistent layout bugs in complex UIs.
- **`isomorphic-dompurify`**: Migrate to `3.x` for robust XSS protection inside Next.js Server Components.

---

## 18. Hardcode & i18n Audit

### 18.1 Hardcoded URLs & Hostnames

- **Repetitive Fallbacks**: Found multiple instances of `http://localhost:3000` and `http://localhost:3456` hardcoded directly in API routes and components (e.g., `CourseVisualsManager.tsx`, `layout.tsx`).
- **Risk**: Inconsistent behavior if `NEXT_PUBLIC_APP_URL` or `COURSEGEN_BACKEND_URL` is missing. The app might silently try to connect to localhost in production.
- **Action**: Standardize on the `env.ts` utility and throw explicit errors if critical variables are missing.

### 18.2 i18n Leaks (Hardcoded Text)

- **Production Leaks**: Significant hardcoded Russian text found in production pages bypassing `next-intl`:
  - `packages/web/app/[locale]/profile/page.tsx`: **CRITICAL**. All tab labels, error messages, and toast notifications are hardcoded in Russian. This breaks localization for English-speaking users.
  - `packages/web/app/[locale]/profile/layout.tsx`: Metadata titles are hardcoded.
- **Action**: Audit the `profile` directory immediately and migrate all strings to the central translation files (`messages/*.json`).

---

## 19. Detailed i18n & Localization Audit

### 19.1 Cyrillic Hardcode (Leak Search)

Widespread Cyrillic text detected in `.tsx` files without `next-intl` wrappers.

- **Location**: `packages/web/app/[locale]/profile/page.tsx`
  - _Example_: `setError('Не удалось загрузить профиль...')`
  - _Example_: `toast.success('Аватар успешно обновлен')`
- **Location**: `packages/web/app/[locale]/profile/layout.tsx`
  - _Example_: `title: 'Профиль | MegaCampusAI'`
- **Location**: `packages/web/app/(mocks)/mocks/clarifying-redesign/page.tsx`
  - _Example_: Widespread Russian text in UI mocks. (Acceptable for mocks, but indicates a manual workflow).

### 19.2 Static English Hardcode

- **Location**: `packages/web/app/[locale]/admin/pipeline/components/export-import.tsx`
  - _Example_: `<AlertDialogCancel>Cancel</AlertDialogCancel>` (Missing translation)
- **Location**: `packages/web/components/generation-monitoring/trace-viewer.tsx`
  - _Example_: `<Badge>Error</Badge>` (Missing translation)

### 19.3 Manual Locale Prop Drilling

A fragmented i18n pattern was found in `generation-graph` where `locale` is passed as a string prop `'ru' | 'en'`.

- **Issues**:
  - Inconsistent defaults (some components default to `ru`, others to `en`).
  - Local translation objects inside components instead of using global `messages/*.json`.
  - Bypasses `next-intl` hooks like `useTranslations()`.
- **Recommendation**: Refactor `generation-graph` to use `useLocale()` and standard `next-intl` message bundles.

### 19.4 Backend Translation Leaks (Status Messages)

The backend generates user-facing status messages that are sometimes hardcoded in Russian instead of using the `shared/i18n` translator.

- **Location**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`
  - _Example_: `step_0_start: 'Проверка документов...'`
  - _Example_: `return 'Недостаточный объем для минимума 10 уроков...'`
- **Impact**: Users selecting English in the UI will still see Russian progress messages during the course generation process.
- **Action**: Migrate all strings in `validators.ts` to `BACKEND_TRANSLATIONS` in `shared/i18n/messages.ts`.

---

## 20. Component & Type Deduplication Roadmap

### 20.1 Type System Fragmentation

- **Problem**: `packages/web` defines its own Zod schemas (`lib/validation/course.ts`) that mirror the backend schemas (`shared-types/src/zod-schemas.ts`).
- **Risk**: Frontend validation might diverge from backend validation, leading to frustrating UI errors ("Field valid on client, rejected by server").
- **Action**: Delete local schemas in `web` and import directly from `@megacampus/shared-types`.

### 20.2 Database Types

- **Problem**: `packages/web/types/database.generated.ts` is a manual copy of the Supabase types.
- **Action**: Delete it. Rely solely on `@megacampus/shared-types/src/database.types.ts`, which should be the single source of truth regenerated from the DB.

### 20.3 Backend "Russian Hardcode"

- **Problem**: Backend validators (`research-flag-detector.ts`, `validators.ts`) contain hardcoded Russian strings ("Постановление 1875", "Проверка документов...").
- **Impact**: These strings are returned to the frontend as status messages. Non-Russian users will see mixed language content.
- **Action**: Move all such strings to `packages/course-gen-platform/src/shared/i18n/messages.ts` and use the translator pattern.

---

## 21. Type Integrity & Final Technical Debt

### 21.1 Type Safety "Leaks"

The project suffers from a high volume of type safety bypasses, which undermines the benefits of using TypeScript:

- **`as any` Count**: **159** instances. Used heavily in API integrations and complex component props.
- **`@ts-ignore` Count**: **351** instances. This is a critical level of technical debt. It indicates that the build might pass, but the underlying type logic is broken in hundreds of places.
- **Recommendation**: Set a "zero-tolerance" policy for new `@ts-ignore` and create a sprint to convert existing ones to `@ts-expect-error` (with reasons) or, preferably, fix the types.

### 21.2 Residual TODOs (Highlights)

While many TODOs were triaged, several "implementation gaps" remain in production UI:

- `ModuleDashboard.tsx`: Token aggregation and tRPC mutations are still TODO.
- `Stage6InspectorContent.tsx`: Important props (style, language) are passed as `null` with a TODO note.
- `orchestrator/handlers/initialize.ts`: Contains stubs for course initialization.

### 21.3 Error Handling Consistency

- **TRPC Contracts**: The backend throws structured `TRPCError` (e.g., `FORBIDDEN`, `NOT_FOUND`), but the frontend custom client (`lib/trpc/client.ts`) occasionally loses this granularity in its `fetchWithRetry` wrapper.
- **Action**: Ensure the frontend error handler preserves the `TRPCError` shape to show specific messages (e.g., "Access Denied" vs "Server Error") to the user.

---

## 22. Global Issue Map & Heatmap

### 22.1 Technical Debt Heatmap (Top Offenders)

Files with the highest concentration of type safety bypasses:

- **`as any` Leaders**:
  1. `document-processing-worker.test.ts` (65)
  2. `section-batch-generator.test.ts` (49)
  3. `block-regeneration-handler.test.ts` (24)
  4. `models-ranking-table.tsx` (8)
- **`@ts-ignore` Leaders**:
  1. `packages/web/.next/types/validator.ts` (78) - _Indicates major schema/type mismatch in Next.js routing._
  2. `TYPESCRIPT-FIX-PLAN.md` (7) - _Documentation of existing issues._

### 22.2 Hardcoded Infrastructure List

Search and replace required in these files:

- **Localhost (3000/3456/8000)**:
  - `packages/web/components/course/CourseVisualsManager.tsx`
  - `packages/web/hooks/useAutoCard.ts`
  - `packages/web/app/[locale]/layout.tsx`
  - `packages/web/lib/hooks/useEnrichmentGeneration.ts`
  - `packages/web/app/api/coursegen/*/route.ts`
  - `packages/web/app/api/admin/health/route.ts`
- **External IPs / Logs**:
  - `docs/reports/infrastructure/2026-01/server-security-audit-2026-01-14.md`: Tracks logins from `185.200.177.180`.

### 22.3 Orphaned Patterns

The following patterns should be added to `.gitignore` to prevent repository bloat:

- `packages/web/coverage/`
- `packages/web/.next/` (already ignored, but check local variants)
- `packages/course-gen-platform/uploads/` (leaking test PDFs)

---

**Generated by Gemini CLI**
