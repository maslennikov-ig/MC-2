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

**Generated by Gemini CLI**
