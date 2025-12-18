# Tasks: Celestial Redesign Final Polish

**Priority**: High
**Context**: Finalizing the "Celestial Redesign" fixes based on the QA Review Report.

## 1. Logic & Progress (Critical)
- [ ] **Add Stage 1 (Initialization)**:
  - File: `packages/web/components/generation-celestial/utils.ts`
  - Action: Add `stage_1` to `STAGE_CONFIG`: `{ number: 1, name: 'Инициализация', icon: 'Upload' }`.
  - Action: Ensure `getStageFromStatus` correctly maps early statuses (e.g., `initializing`) to stage 1.
- [ ] **Update Planet Icons**:
  - File: `packages/web/components/generation-celestial/PlanetNode.tsx`
  - Action: Import `Upload` icon from `lucide-react` and add it to the `icons` mapping.

## 2. Localization (UX)
- [ ] **Translate Activity Log**:
  - File: `packages/web/app/courses/generating/[slug]/ActivityLog.tsx`
  - Action: Translate all static strings to Russian:
    - "Just now" -> "Только что"
    - "minutes ago" -> "мин. назад"
    - "hours ago" -> "ч. назад"
    - "Activity Log" -> "Журнал активности"
    - "No activity yet" -> "Пока нет активности"
    - "Real-time updates active" -> "Обновление в реальном времени"
- [ ] **Translate Stage Results Drawer**:
  - File: `packages/web/components/generation-celestial/StageResultsDrawer.tsx`
  - Action: Verify and translate tabs ("Results" -> "Результаты", "Activity Log" -> "Журнал").

## 3. Parallel Processes (Feature Completion)
- [ ] **Verify ParallelProcessGroup Implementation**:
  - File: `packages/web/components/generation-celestial/ParallelProcessGroup.tsx` (Create if missing)
  - Action: Ensure the component visually groups parallel sub-steps (e.g., indentation, connecting lines) and is not just a placeholder.
- [ ] **Integrate Real Data**:
  - File: `packages/web/components/generation-celestial/ActiveStageCard.tsx`
  - Action: Ensure `ParallelProcessGroup` receives actual trace data grouped by `phase` or `step_name`.

## 4. Verification
- [ ] Run `pnpm type-check` to ensure new icons and config changes didn't break types.
- [ ] Verify the UI shows 6 planets total (Stage 1 to 6).
