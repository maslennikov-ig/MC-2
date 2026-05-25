# Career Playbook Document-First Zone Redesign

Date: 2026-05-25
Beads: `mc2-db696.33`

## Goal

Redesign the working Career Playbook zone around a document-first interface:
the future role guide is visible as a calm central document, while navigation and
current actions stay in side panels.

The chosen direction combines:

- variant 2: milk-toned document page as the main surface;
- variant 4: final review as a checklist before generation;
- variant 5: calmer, larger typography and less dashboard density.

## Scope

In scope:

- global light semantic tokens for the milk base palette;
- shared Career Playbook document shell classes and components;
- `/career-playbook/new` fixed questions, follow-ups, unavailable/loading states,
  and final review;
- `/career-playbook/library`;
- `/career-playbook/[id]` loading/error/viewer/generating states;
- `/share/career-playbook/[slug]` public and unavailable states;
- auth-required states for constructor and library;
- RU/EN wording cleanup for visible AI-cliche labels.

Out of scope:

- backend schemas, tRPC contracts, generation logic, queues, and migrations;
- ESCO or role-suggestion source work;
- live role taxonomy APIs;
- admin cost evidence redesign except incidental token compatibility.

## Design Decisions

- Keep the global primary color purple so main actions remain recognizable.
- Change only light semantic surfaces to a milk/document palette:
  background, card, popover, muted, secondary, border, and input.
- Keep dark mode as a contrast mode instead of making a milk dark theme.
- Use Career Playbook-specific shell classes for the full product zone so the
  rest of the site only receives the base token refresh.
- Remove visible AI cliches from the constructor and editor controls:
  no `Sparkles`, `WandSparkles`, `ИИ-уточнение`, or `AI follow-up`.
- Keep manual entry and inline `Другое` controls; no separate free-form action.

## Implementation Map

- `packages/web/app/globals.css`:
  milk global light tokens and Career Playbook shell classes.
- `packages/web/components/career-playbook/layout/document-workspace.tsx`:
  shared workspace, document shell, and preview page component.
- `packages/web/components/career-playbook/wizard/*`:
  document-first fixed-question flow, follow-up flow, and final review.
- `packages/web/app/[locale]/career-playbook/*`:
  zone wrappers, auth states, library, and viewer states.
- `packages/web/components/career-playbook/viewer/*`:
  document viewer, generating state, editor sheet, action bar, public viewer.
- `packages/web/messages/*/career-playbook.json`:
  RU/EN labels for the new shell and AI wording cleanup.

## Verification Plan

Required local checks:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/page-client.test.tsx
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/library-page-client.test.tsx
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/public-playbook-viewer.test.tsx
pnpm --filter @megacampus/web lint
pnpm --filter @megacampus/web type-check
pnpm --filter @megacampus/web build
pnpm type-check
pnpm build
```

Browser checks:

- `/ru/career-playbook/new`;
- `/ru/career-playbook/library`;
- `/ru/career-playbook/[id]`;
- `/ru/share/career-playbook/[slug]`;
- quick smoke for `/ru/create`, `/ru/courses`, `/ru/profile`.

Viewport targets: 390, 1440, 1920. Check no horizontal overflow, readable
type, aligned search icon/input text, and no old AI-cliche labels/icons.
