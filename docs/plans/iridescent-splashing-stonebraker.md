# UI Redesign: Implementation of Stitch Screens (Phase 1)

## Context

MegaCampusAI has 22 desktop screens generated in Google Stitch (project `7898679689644646160`) with a warm violet design system. The current UI works fully but looks dated. This plan covers **Phase 1** — the 5 highest-impact screens: Landing, Course Catalog, Course Detail, Login, Register. All pages already exist with full functionality; this is a **visual-only** update.

## Strategy

**Design token approach**: Map Stitch's MD3 color tokens to existing CSS variable names in `globals.css`. This means shadcn/ui primitives pick up the new palette automatically — zero code changes for base components like Button, Card, Dialog.

**Component approach**: Update existing components in-place (className changes only). No parallel component files. Work in a git worktree for isolation.

---

## Step 0: Setup

1. Create beads epic: `bd create -t epic "UI Redesign — Stitch Phase 1"`
2. Create git worktree: `git worktree add .claude/worktrees/ui-redesign-phase1 -b feat/ui-redesign-phase1 develop`
3. Create sub-tasks in beads for each step below

## Step 1: Design Tokens Update

### 1a. Add Inter font

**File**: `packages/web/app/[locale]/layout.tsx`

- Import `Inter` from `next/font/google` (subsets: latin, cyrillic; weights: 300,400,500,600)
- Add CSS variable `--font-inter` to body className
- **File**: `packages/web/app/globals.css` — add `--font-body: var(--font-inter);`
- **File**: `packages/web/tailwind.config.ts` — add `body: ['var(--font-body)', ...]` to fontFamily

### 1b. Update dark mode palette

**File**: `packages/web/app/globals.css` (lines 161-212, `.dark {}` block)

| Variable             | Current HSL   | New HSL       | Hex       | Stitch Token           |
| -------------------- | ------------- | ------------- | --------- | ---------------------- |
| `--background`       | `222 47% 11%` | `228 34% 9%`  | `#0f131f` | surface                |
| `--foreground`       | `210 40% 98%` | `228 63% 91%` | `#dfe2f3` | on-surface             |
| `--card`             | `217 33% 17%` | `225 24% 14%` | `#1b1f2c` | surface-container      |
| `--muted`            | `217 33% 17%` | `224 18% 18%` | `#262a37` | surface-container-high |
| `--muted-foreground` | `215 16% 65%` | `272 9% 59%`  | `#988d9f` | outline                |
| `--border`           | `217 33% 25%` | `278 13% 30%` | `#4d4354` | outline-variant        |

Keep `--primary: 262 83% 58%` for interactive elements. Add:

```css
--primary-light: 270 100% 86%; /* #ddb7ff — text-on-dark headings */
--primary-container: 271 100% 71%; /* #b76dff — badges, pills */
--secondary-container: 296 93% 30%; /* #7d0793 — secondary accents */
```

### 1c. Add utility classes

**File**: `packages/web/app/globals.css` — add to `@layer components`:

```css
.glass-panel {
  background: rgba(27, 31, 44, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.text-gradient {
  background: linear-gradient(135deg, #ddb7ff 0%, #f8acff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 1d. Update gradients

**File**: `packages/web/app/globals.css` — update dark mode gradient variables:

```css
--gradient-primary: linear-gradient(135deg, #ddb7ff, #b76dff);
--gradient-secondary: linear-gradient(135deg, #ddb7ff, #f8acff);
--gradient-accent: linear-gradient(135deg, #f8acff, #ddb7ff);
```

### 1e. Update viewport theme color

**File**: `packages/web/app/[locale]/layout.tsx` — change `themeColor: '#667eea'` to `'#0f131f'`

---

## Step 2: Landing Page

**Stitch screen**: `fab7a35025c04eec8b7b7200de7eaf28` + local `docs/stitch-landing-v2.html`

### Fetch HTML

```
mcp__stitch__get_screen(name="projects/7898679689644646160/screens/fab7a35025c04eec8b7b7200de7eaf28", projectId="7898679689644646160", screenId="fab7a35025c04eec8b7b7200de7eaf28")
```

### Files to modify

| File                                 | Change                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `components/layouts/header.tsx`      | Simplify to glass-panel nav: logo left, links center (hidden mobile), login + CTA right. Fixed position.              |
| `components/common/hero-content.tsx` | Full restructure: centered hero with gradient headline, floating insight card, stats row. Keep auth-conditional CTAs. |
| `app/[locale]/page-client.tsx`       | Add landing sections below hero (currently only hero + shader).                                                       |

### New files (under `components/landing/`)

- `stats-section.tsx` — 3-col stats bar (500+ courses, 10000+ lessons, 50+ orgs)
- `process-section.tsx` — 6-step pipeline cards grid
- `features-bento.tsx` — bento grid layout for feature highlights
- `cta-section.tsx` — full-width bottom CTA
- `landing-footer.tsx` — dark footer, links, copyright 2026

### Icon mapping

| Material Symbols | Lucide      |
| ---------------- | ----------- |
| `upload_file`    | `Upload`    |
| `psychology`     | `Brain`     |
| `account_tree`   | `GitBranch` |
| `edit_note`      | `FileEdit`  |
| `translate`      | `Languages` |
| `rocket_launch`  | `Rocket`    |
| `auto_awesome`   | `Sparkles`  |

### i18n

Add keys to `messages/ru/common.json` and `messages/en/common.json` under `landing` namespace. All headings in Russian, English as translations.

### Responsive breakpoints

- `< 640px`: single column, hero image hidden, stacked CTAs
- `640-1024px`: 2-col pipeline grid, side-by-side CTAs
- `> 1024px`: 3-col grid, full desktop layout from Stitch

---

## Step 3: Course Catalog

**Stitch screen**: `aeb5a1732a404cc6a8d287da55adf368`

### Files to modify

| File                                                     | Change                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `app/[locale]/courses/_components/course-card.tsx`       | Update card className: glass-panel, rounded-2xl, border-white/5, hover scale. Only className changes. |
| `app/[locale]/courses/_components/courses-filters.tsx`   | Pill-based filter design, glass-panel background                                                      |
| `app/[locale]/courses/_components/courses-header.tsx`    | Update typography to text-gradient headline                                                           |
| `app/[locale]/courses/_components/course-statistics.tsx` | Restyle stat badges with primary-container background                                                 |
| `app/[locale]/courses/page.tsx`                          | Update wrapper div dark background class                                                              |

---

## Step 4: Course Detail

**Stitch screen**: `05789f494d524cc190fc74f7017f03cd`

### Files to modify

| File                                              | Change                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `components/course/course-viewer-enhanced.tsx`    | Update overview mode: glass-panel hero, gradient title, stat badges |
| `components/course/viewer/components/Sidebar.tsx` | Dark sidebar with surface-container background                      |
| `components/course/viewer/components/Toolbar.tsx` | Glass-panel toolbar                                                 |

Focus on the overview/landing state of the course viewer. Lesson content rendering not changed.

---

## Step 5: Login & Register (Auth Modal)

**Stitch screens**: `edfbca1bcae9420a842d940927531800` (Login), `6f443c15c84a4d66be9216d727666255` (Register)

**Decision**: Keep modal approach (less disruption than Stitch's full-page design). Apply Stitch palette and glass effects.

### Files to modify

| File                                       | Change                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `components/auth/auth-modal.tsx`           | DialogContent: glass-panel bg, update gradient to purple→pink            |
| `components/auth/login-form.tsx`           | Input styling: transparent bg, border-white/10, focus ring primary-light |
| `components/auth/register-form.tsx`        | Same as login-form styling                                               |
| `components/auth/social-buttons.tsx`       | Glass-panel button styling                                               |
| `components/auth/forgot-password-form.tsx` | Match input styling                                                      |

---

## Step 6: Generation Progress (tokens only)

**NO component changes**. The ReactFlow celestial graph picks up new CSS variables automatically via:

- `--space-bg` already equals `#0a0e1a` (no change needed)
- `--planet-active` already `#8b5cf6` (matches `--primary`)
- Only verify it still renders correctly after token changes

---

## Verification

For each screen:

1. Visual comparison with Stitch at 1440px width (use Playwright screenshot)
2. Responsive check at 375px, 768px, 1440px
3. Dark mode toggle works (all screens are dark-first)
4. Locale switch EN/RU — no hardcoded text
5. `pnpm --filter web build` passes
6. `pnpm type-check` passes
7. Generation Progress page renders correctly (smoke test)

### End-to-end verification

```bash
pnpm type-check
pnpm --filter web build
# Visual QA via Playwright browser
```

---

## Critical Files Summary

| File                                                            | Purpose                                  |
| --------------------------------------------------------------- | ---------------------------------------- |
| `packages/web/app/globals.css`                                  | All CSS variable changes (lines 161-212) |
| `packages/web/tailwind.config.ts`                               | Font family addition                     |
| `packages/web/app/[locale]/layout.tsx`                          | Inter font import, theme color           |
| `packages/web/components/common/hero-content.tsx`               | Landing hero restructure                 |
| `packages/web/components/layouts/header.tsx`                    | Navigation restyle                       |
| `packages/web/app/[locale]/page-client.tsx`                     | Landing sections composition             |
| `packages/web/app/[locale]/courses/_components/course-card.tsx` | Catalog card restyle                     |
| `packages/web/components/auth/auth-modal.tsx`                   | Auth modal restyle                       |
| `packages/web/components/course/course-viewer-enhanced.tsx`     | Course detail restyle                    |

## Reusable Existing Code

- `useTranslations` hook (next-intl) — all i18n
- `useAuthModal` hook — auth flow
- `useSupabase` — session check
- `Link` from `@/src/i18n/navigation` — localized routing
- All shadcn/ui primitives (Button, Card, Dialog, Tabs, etc.) — keep, restyle via tokens
- Framer Motion `motion` — keep for animations
- Lucide icons — already installed, replace Material Symbols

## Out of Scope

- Generation Progress component logic (ReactFlow) — only design tokens
- Backend/API changes — none needed
- New features — visual only
- Phases 2-4 screens — separate plan
