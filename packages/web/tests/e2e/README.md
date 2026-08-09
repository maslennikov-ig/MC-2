# Web E2E tests

The Playwright suite covers 18 browser specs. Some suites are fully mocked and need only the web
app; others use local Supabase, Redis, or seeded authenticated data. Run commands from the
repository root unless noted otherwise.

## Suite map

| Suite                  | Files                                                                 | What it covers                                                               | Extra prerequisites                                                                                          |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Career Playbook        | `career-playbook/*.spec.ts`                                           | Public landing, authenticated Phase A draft persistence, viewer editing      | Auth state; local Supabase and Redis for authenticated flows; service-role key for the seeded viewer fixture |
| Enrichment inspector   | `enrichment-inspector/*.spec.ts`                                      | Navigation, creation forms, progress, errors, drag/drop, i18n, accessibility | API calls are intercepted by suite fixtures; no generation worker is used                                    |
| Header dropdown        | `header-dropdown-position.spec.ts`                                    | Sticky-header geometry, profile menu, no horizontal layout shift             | Auth state for the profile-menu cases                                                                        |
| Draft sessions         | `draft-session-flow.spec.ts`                                          | Redis autosave, database materialization, validation, cleanup, tab isolation | Local Supabase, Redis, and `TOKEN` for authenticated assertions                                              |
| Document conflicts     | `document-conflicts-e4.spec.ts`                                       | Real ClarifyingPanel behavior with intercepted authenticated tRPC            | Auth state; backend requests are intercepted                                                                 |
| Visual and screenshots | `screenshot.spec.ts`, `visual-assessment.spec.ts`, `visual/*.spec.ts` | Screenshot capture, responsive states, Markdown snapshots, visual regression | Stable fonts/browser; committed snapshots where `toHaveScreenshot` is used                                   |

The authoritative inventory is the filesystem:

```bash
find packages/web/tests/e2e -name '*.spec.ts' -print | sort
```

## Authentication

Playwright always runs [`tests/global-setup.ts`](../global-setup.ts). It writes
`tests/.auth/user.json` for specs that declare an authenticated storage state.

Choose one authentication source:

- set `TOKEN` to an existing Supabase access token; or
- set `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY`) so setup can sign in with
  `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` (the local seeded test account is the default).

`SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) is required to seed the Career Playbook
viewer fixture. Without it, setup continues but the authenticated viewer scenario has no guaranteed
fixture. Never commit tokens, passwords, service-role keys, or generated auth state.

`TEST_USER_ID` and `TEST_USER_EMAIL` only customize mocked enrichment-inspector fixtures. They do
not replace Playwright authentication.

## Web server selection

[`playwright-web-server.ts`](../../playwright-web-server.ts) owns the server decision:

- no override: Playwright starts `pnpm run dev` at `http://localhost:3000`;
- `PLAYWRIGHT_PORT=3104`: Playwright starts and manages the app on that local port;
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104`: Playwright manages a local server at that URL;
- `PLAYWRIGHT_BASE_URL=https://example.test`: Playwright uses that external server and does not
  start Next.js.

For a managed server, the config forwards `COURSEGEN_BACKEND_URL` and
`NEXT_PUBLIC_COURSEGEN_BACKEND_URL` when set. It also supplies local Supabase fallbacks, but those
placeholder values are not enough for authenticated or database-backed suites.

Useful optional variables:

- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` — use a specific Chromium binary;
- `PLAYWRIGHT_DISABLE_VIDEO=1` — disable retained failure videos;
- `PORT` — fallback local port when `PLAYWRIGHT_PORT` is absent.

`visual-assessment.spec.ts` currently navigates directly to `http://localhost:3001`; start a server
there before running that legacy capture file. The other specs use Playwright's configured
`baseURL`.

## Service prerequisites

For mocked UI suites, the managed Next.js server and authentication setup are sufficient. For
database-backed flows, start the local services used by the app:

```bash
docker compose up -d redis
```

Also provide a reachable Supabase instance with the expected test user and schema. Career Playbook
draft persistence needs Redis and Supabase. Tests that exercise real course-generation or source
processing additionally require the course-gen API, worker, and their Redis/DB dependencies; the
current enrichment-inspector suite does not call those services because it intercepts its APIs.

## Running the suites

Install the browser once:

```bash
pnpm --dir packages/web exec playwright install chromium
```

Run all E2E files once in Chromium:

```bash
pnpm --dir packages/web exec playwright test tests/e2e --project=chromium
```

Run focused suites:

```bash
pnpm --filter @megacampus/web test:e2e:career-playbook
pnpm --dir packages/web exec playwright test tests/e2e/enrichment-inspector --project=chromium
pnpm --dir packages/web exec playwright test tests/e2e/header-dropdown-position.spec.ts --project=chromium
pnpm --dir packages/web exec playwright test tests/e2e/draft-session-flow.spec.ts --project=chromium
pnpm --dir packages/web exec playwright test tests/e2e/visual/markdown-visual.spec.ts --project=markdown-visual
```

Use a separate port when another dev server is already running:

```bash
PLAYWRIGHT_PORT=3104 pnpm --dir packages/web exec playwright test \
  tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium
```

Use an already running remote or local app:

```bash
PLAYWRIGHT_BASE_URL=https://dev.example.test \
  pnpm --dir packages/web exec playwright test tests/e2e/header-dropdown-position.spec.ts \
  --project=chromium
```

Interactive and debugging modes:

```bash
pnpm --filter @megacampus/web test:e2e:ui
pnpm --dir packages/web exec playwright test tests/e2e/career-playbook --project=chromium --headed
PWDEBUG=1 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook --project=chromium
DEBUG=pw:api pnpm --dir packages/web exec playwright test tests/e2e/header-dropdown-position.spec.ts --project=chromium
```

## Artifacts and snapshots

Playwright writes reports and traces under `packages/web/playwright-report/` and
`packages/web/test-results/`. Failure screenshots and videos follow the settings in
`playwright.config.ts`.

Only update committed visual snapshots after reviewing the rendered change:

```bash
pnpm --filter @megacampus/web test:visual:markdown:update
```

## Common failures

- **Global setup says authentication is missing:** provide `TOKEN`, or a Supabase URL, anon key,
  and valid test credentials.
- **Authenticated viewer data is absent:** provide a service-role key so global setup can seed its
  fixed Career Playbook fixture.
- **Draft state does not persist:** verify Redis and Supabase are reachable and that the managed web
  server received their environment values.
- **A local port is busy:** set `PLAYWRIGHT_PORT` to an unused port. Local URLs are still managed by
  Playwright; non-local `PLAYWRIGHT_BASE_URL` values are treated as external.
- **Visual diffs vary by machine:** use the same browser build, fonts, viewport, and color scheme;
  inspect the generated report before accepting new snapshots.
- **`visual-assessment.spec.ts` cannot connect:** it is the one legacy file hardcoded to port 3001.
