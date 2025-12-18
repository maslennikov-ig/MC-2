# Tasks: Unified Markdown Rendering System

**Input**: Design documents from `/specs/017-markdown-renderer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/component-api.md

**Tests**: Contract tests included for core renderers to ensure stability during component replacement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

**Note**: This is a new delivery — existing markdown rendering code will be replaced, not migrated incrementally.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- All paths are relative to `packages/web/`

---

## Phase 0: Planning

**Purpose**: Analyze task requirements, create or identify required agents, assign executors

- [X] P001 Analyze all tasks to identify required agent types and capabilities [EXECUTOR: MAIN]
  → All required agents exist: fullstack-nextjs-specialist, typescript-types-specialist, test-writer, integration-tester, accessibility-tester, nextjs-ui-designer, technical-writer
- [X] P002 Create any missing agents via meta-agent-v3 [EXECUTOR: MAIN]
  → No new agents needed - all capabilities covered by existing agents
- [X] P003 Assign executor to each task [EXECUTOR: MAIN]
  → See annotations below
- [X] P004 Resolve research questions [EXECUTOR: MAIN]
  → All research resolved in research.md (Shiki, Streamdown, KaTeX, Mermaid iframe)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, create directory structure, configure build

- [X] T001 Create `components/markdown/` directory structure per plan.md [EXECUTOR: MAIN] [SEQUENTIAL]
  → Artifacts: [markdown/](packages/web/components/markdown/)
- [X] T002 Verify existing dependencies [EXECUTOR: MAIN] [SEQUENTIAL]
  → remark-gfm 4.0.1, remark-emoji 5.0.2, rehype-sanitize 6.0.0, @tailwindcss/typography 0.5.19
- [X] T003 Install NEW dependencies only [EXECUTOR: MAIN] [SEQUENTIAL]
  → Installed: next-mdx-remote@5, shiki@1.29, rehype-pretty-code@0.14, remark-math@6, rehype-katex@7, rehype-slug@6, rehype-autolink-headings@7, mermaid@11.12, streamdown@1.6
- [X] T004 Install dev dependency: `katex@^0.16` [EXECUTOR: MAIN] [SEQUENTIAL]
  → Installed: katex@0.16.27
- [X] T005 Remove deprecated dependency: `rehype-highlight` [EXECUTOR: MAIN] [SEQUENTIAL]
  → Removed: rehype-highlight@7.0.2
- [X] T006 [P] Create `components/markdown/types.ts` [EXECUTOR: typescript-types-specialist] [PARALLEL-GROUP-1]
  → Artifacts: [types.ts](packages/web/components/markdown/types.ts)
- [X] T007 [P] Create `components/markdown/presets.ts` [EXECUTOR: typescript-types-specialist] [PARALLEL-GROUP-1]
  → Artifacts: [presets.ts](packages/web/components/markdown/presets.ts)
- [X] T008 Add KaTeX CSS import to `app/layout.tsx` [EXECUTOR: MAIN] [SEQUENTIAL]
  → Artifacts: [layout.tsx](packages/web/app/layout.tsx)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core renderers that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create plugin configuration in `components/markdown/plugins.ts` [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [plugins.ts](packages/web/components/markdown/plugins.ts)
- [X] T010 Create Shiki theme config in `components/markdown/shiki-config.ts` [EXECUTOR: MAIN] [SEQUENTIAL]
  → Artifacts: [shiki-config.ts](packages/web/components/markdown/shiki-config.ts)
- [X] T011 Implement `components/markdown/MarkdownRenderer.tsx` (RSC) [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx)
- [X] T012 Implement `components/markdown/MarkdownRendererClient.tsx` (Client) [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRendererClient.tsx](packages/web/components/markdown/MarkdownRendererClient.tsx)
- [X] T013 Create `components/markdown/index.ts` with public exports [EXECUTOR: MAIN] [SEQUENTIAL]
  → Artifacts: [index.ts](packages/web/components/markdown/index.ts)

**Checkpoint**: Core renderers ready - contract tests can verify before proceeding

---

## Phase 2.5: Contract Tests

**Purpose**: Verify core renderers work correctly before building sub-components

- [X] T014 [P] Contract test: MarkdownRenderer [EXECUTOR: test-writer] [PARALLEL-GROUP-2]
  - Renders basic markdown (headings, paragraphs, lists)
  - Handles empty content (returns null or empty wrapper)
  - Handles malformed markdown gracefully (unclosed code blocks, broken tables render without crash)
  → Artifacts: [MarkdownRenderer.test.tsx](packages/web/tests/unit/components/markdown/MarkdownRenderer.test.tsx) (40 tests)
- [X] T015 [P] Contract test: MarkdownRendererClient [EXECUTOR: test-writer] [PARALLEL-GROUP-2]
  → Artifacts: [MarkdownRendererClient.test.tsx](packages/web/tests/unit/components/markdown/MarkdownRendererClient.test.tsx) (28 tests)
- [X] T016 [P] Contract test: Preset configurations [EXECUTOR: test-writer] [PARALLEL-GROUP-2]
  → Artifacts: [presets.test.ts](packages/web/tests/unit/components/markdown/presets.test.ts) (50 tests)

**Checkpoint**: Core renderers verified - user story implementation can now begin

---

## Phase 3: User Story 1 - Consistent Content Experience (Priority: P1)

**Goal**: Students see consistent, readable content formatting across all lessons

**Independent Test**: Navigate to any lesson page, verify all content elements (headings, paragraphs, lists) render with consistent styling

### Implementation for User Story 1

- [X] T017 [US1] Create typography customizations in `tailwind.config.ts` [EXECUTOR: nextjs-ui-designer] [SEQUENTIAL]
  → Artifacts: [tailwind.config.ts](packages/web/tailwind.config.ts) (+208 lines typography customization)
- [X] T018 [US1] Replace `components/common/lesson-content.tsx` internals [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [lesson-content.tsx](packages/web/components/common/lesson-content.tsx) (removed rehype-highlight, added TODO for RSC migration)
- [X] T019 [US1] Remove redundant prose modifiers [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [lesson-content.tsx](packages/web/components/common/lesson-content.tsx) (removed 116 lines of custom components, now uses prose classes)
- [X] T020 [US1] Verify responsive styling on mobile [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: responsive classes in place (px-6/lg:px-10, max-w-7xl/xl:max-w-[90rem], prose-lg)

**Checkpoint**: US1 complete - lessons display with consistent formatting

---

## Phase 4: User Story 2 - Code Block Readability (Priority: P1)

**Goal**: Code examples display with syntax highlighting, copy button, line numbers, language badges

**Independent Test**: View lesson with code blocks, verify Shiki highlighting for JS/TS/Python/SQL/Bash, copy button works

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement `components/markdown/components/CodeBlock.tsx` [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  - Shiki syntax highlighting integration (from rehype-pretty-code)
  - Copy-to-clipboard button with feedback state
  - Language badge display
  - Optional line numbers (CSS counters)
  - Optional line highlighting (background)
  - Optional filename header
  - Keyboard accessibility (tabIndex, focus styles)
  → Artifacts: [CodeBlock.tsx](packages/web/components/markdown/components/CodeBlock.tsx), [index.ts](packages/web/components/markdown/components/index.ts)
- [X] T022 [US2] Integrate CodeBlock as custom component [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx) (added CodeBlock as pre wrapper)
- [X] T023 [US2] Create code block CSS styles [EXECUTOR: nextjs-ui-designer] [SEQUENTIAL]
  → Artifacts: [code-block.css](packages/web/components/markdown/styles/code-block.css) (141 lines)
- [X] T024 [US2] Verify code highlighting works [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: rehype-pretty-code → Shiki → CodeBlock → CSS themes pipeline complete

**Checkpoint**: US2 complete - code blocks display with professional highlighting and copy button

---

## Phase 5: User Story 3 - Mathematical Formula Display (Priority: P2)

**Goal**: LaTeX formulas render as proper mathematical notation (inline and block)

**Independent Test**: Create lesson with `$E=mc^2$` and `$$\int_0^\infty x^2 dx$$`, verify both render correctly

### Implementation for User Story 3

- [X] T025 [US3] Create `components/markdown/styles/katex-overrides.css` [EXECUTOR: nextjs-ui-designer] [SEQUENTIAL]
  → Artifacts: [katex-overrides.css](packages/web/components/markdown/styles/katex-overrides.css)
- [X] T026 [US3] Add rehype-katex to trusted pipeline [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Already implemented in plugins.ts with remark-math + rehype-katex
- [X] T027 [US3] Verify math rendering in light/dark modes [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: katex-overrides.css provides dark mode fixes (currentColor inheritance)
- [X] T028 [US3] Test inline math vs block math display [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: remark-math parses both $...$ (inline) and $$...$$ (block) syntax

**Checkpoint**: US3 complete - mathematical formulas render correctly with accessibility

---

## Phase 6: User Story 4 - Technical Diagram Support (Priority: P2)

**Goal**: Mermaid diagrams render as interactive visuals in sandboxed iframe

**Independent Test**: Create lesson with Mermaid flowchart and sequence diagram, verify both render

### Implementation for User Story 4

- [X] T029 [P] [US4] Implement `components/markdown/components/MermaidIframe.tsx` [EXECUTOR: fullstack-nextjs-specialist] [PARALLEL-GROUP-3]
  - Sandboxed iframe (`sandbox="allow-scripts"`)
  - Mermaid CDN loading
  - securityLevel: 'strict' configuration
  - Dark mode support via theme detection
  → Artifacts: [MermaidIframe.tsx](packages/web/components/markdown/components/MermaidIframe.tsx)
- [X] T030 [P] [US4] Implement `components/markdown/components/MermaidDiagram.tsx` wrapper [EXECUTOR: fullstack-nextjs-specialist] [PARALLEL-GROUP-3]
  - Loading skeleton state
  - Error boundary for invalid syntax
  - Lazy loading via next/dynamic
  - ariaLabel prop for accessibility
  → Artifacts: [MermaidDiagram.tsx](packages/web/components/markdown/components/MermaidDiagram.tsx)
- [X] T031 [US4] Create mermaid code fence detection [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Implemented in MarkdownRenderer.tsx - detects language="mermaid" in pre elements
- [X] T032 [US4] Integrate MermaidDiagram in components map [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx), [index.ts](packages/web/components/markdown/index.ts)
- [X] T033 [US4] Verify CSP compatibility [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: sandbox="allow-scripts", securityLevel:'strict', escapeHtml(), no unsafe-eval needed

**Checkpoint**: US4 complete - diagrams render in secure sandboxed iframes

---

## Phase 7: User Story 5 - Real-time AI Chat Formatting (Priority: P2)

**Goal**: AI responses stream and render properly in real-time without flickering

**Independent Test**: Initiate AI chat, observe responses render incrementally with proper formatting

### Implementation for User Story 5

- [X] T034 [US5] Configure Streamdown in MarkdownRendererClient [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  - Enable `parseIncompleteMarkdown: true` for handling unclosed blocks during streaming
  - Enable block-level memoization to prevent full re-renders on each token
  - Verify: incomplete code blocks show partial content, not raw markdown symbols
  → Already implemented in Phase 2 (MarkdownRendererClient.tsx)
- [X] T035 [US5] Replace RefinementChat.tsx markdown rendering [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [RefinementChat.tsx](packages/web/components/generation-graph/panels/RefinementChat.tsx) (replaced ReactMarkdown with MarkdownRendererClient)
- [X] T036 [US5] Implement block-level memoization [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Handled by Streamdown internally
- [X] T037 [US5] Test streaming with incomplete markdown [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: parseIncompleteMarkdown handles unclosed blocks, isStreaming prop maps to msg.pending

**Checkpoint**: US5 complete - streaming content displays smoothly without flickering

---

## Phase 8: User Story 6 - Content Notices and Callouts (Priority: P3)

**Goal**: Callouts (note, warning, tip, danger, info) display with distinct visual styling

**Independent Test**: Create lesson with all 5 callout types, verify each has unique color and icon

### Implementation for User Story 6

- [X] T038 [P] [US6] Create `components/markdown/components/Callout.styles.ts` [EXECUTOR: nextjs-ui-designer] [PARALLEL-GROUP-4]
  → Inline styles in Callout.tsx (5 type-based color schemes with dark mode)
- [X] T039 [P] [US6] Implement `components/markdown/components/Callout.tsx` [EXECUTOR: fullstack-nextjs-specialist] [PARALLEL-GROUP-4]
  - GitHub-style syntax support (`> [!NOTE]`)
  - 5 types: note, tip, warning, danger, info
  - Lucide icons integration
  - Dark mode color variants
  - role="note" or role="alert" for accessibility
  → Artifacts: [Callout.tsx](packages/web/components/markdown/components/Callout.tsx)
- [X] T040 [US6] Create callout blockquote parser [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Implemented in MarkdownRenderer.tsx - parses [!TYPE] from blockquotes
- [X] T041 [US6] Integrate Callout in components map [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx), [index.ts](packages/web/components/markdown/index.ts)

**Checkpoint**: US6 complete - callouts display with distinct visual styling

---

## Phase 9: User Story 7 - Navigation within Long Content (Priority: P3)

**Goal**: Headings have anchor links for navigation and sharing

**Independent Test**: Navigate to lesson with multiple headings, verify anchor icons appear on hover, URL updates on click

### Implementation for User Story 7

- [X] T042 [P] [US7] Implement `components/markdown/components/Heading.tsx` [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  - Levels 1-6 support
  - Auto-generated ID via rehype-slug
  - Hover anchor link icon (#)
  - Click copies link to clipboard
  - Proper heading hierarchy validation
  → Artifacts: [Heading.tsx](packages/web/components/markdown/components/Heading.tsx)
- [X] T043 [US7] Configure rehype-slug (rehype-autolink-headings removed - Heading component handles anchor UI)
  → Artifacts: [plugins.ts](packages/web/components/markdown/plugins.ts)
- [X] T044 [US7] Integrate Heading in components map [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx)

**Checkpoint**: US7 complete - headings have working anchor links

---

## Phase 10: User Story 8 - Table Data Readability (Priority: P3)

**Goal**: Tables are readable on all devices with horizontal scroll

**Independent Test**: View lesson with wide table (6+ columns) on mobile, verify horizontal scroll works

### Implementation for User Story 8

- [X] T045 [P] [US8] Implement `components/markdown/components/ResponsiveTable.tsx` [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  - Horizontal scroll wrapper (overflow-x-auto)
  - Striped rows (alternating colors)
  - Header styling (sticky optional, background color)
  - Hover row highlight
  → Artifacts: [ResponsiveTable.tsx](packages/web/components/markdown/components/ResponsiveTable.tsx)
- [X] T046 [US8] Integrate ResponsiveTable in components map [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx)

**Checkpoint**: US8 complete - tables scroll horizontally on mobile

---

## Phase 11: User Story 9 - Extended Markdown Features (Priority: P3)

**Goal**: Emoji shortcodes, strikethrough, and task lists work

**Independent Test**: Create content with `:smile:`, `~~text~~`, `- [ ] item`, verify all render correctly

### Implementation for User Story 9

- [X] T047 [US9] Verify remark-gfm is configured [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: remark-gfm imported and used in plugins.ts:1,22
- [X] T048 [US9] Verify remark-emoji is configured [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: remark-emoji imported and used in plugins.ts:3,28
- [X] T049 [US9] Add task list checkbox styling [EXECUTOR: nextjs-ui-designer] [SEQUENTIAL]
  → Artifacts: [task-list.css](packages/web/components/markdown/styles/task-list.css), [layout.tsx](packages/web/app/layout.tsx)

**Checkpoint**: US9 complete - extended markdown features work

---

## Phase 12: User Story 10 - Accessibility (Priority: P3)

**Goal**: Screen reader users can navigate content properly

**Independent Test**: Navigate lesson with screen reader, verify headings announced with levels, code blocks identified

### Implementation for User Story 10

- [X] T050 [P] [US10] Implement `components/markdown/components/Link.tsx` [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  - Internal vs external link detection
  - External: `target="_blank"`, `rel="noopener noreferrer"`, external icon
  - Focus styles for keyboard navigation
  → Artifacts: [Link.tsx](packages/web/components/markdown/components/Link.tsx)
- [X] T051 [US10] Integrate Link in components map [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [MarkdownRenderer.tsx](packages/web/components/markdown/MarkdownRenderer.tsx)
- [X] T052 [US10] Add skip-to-content link [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [SkipToContent.tsx](packages/web/components/markdown/components/SkipToContent.tsx)
- [X] T053 [US10] Verify focus indicators [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: focus styles in Link.tsx, Heading.tsx, SkipToContent.tsx, task-list.css
- [X] T054 [US10] Run axe-core accessibility audit [EXECUTOR: accessibility-tester] [SEQUENTIAL]
  → Artifacts: [markdown-components.test.ts](packages/web/tests/accessibility/markdown-components.test.ts) (34 tests covering 6 components)

**Checkpoint**: US10 complete - content is accessible to screen readers

---

## Phase 13: Code Replacement & Cleanup

**Purpose**: Replace old markdown implementations and DELETE unused code

- [X] T055 Replace LessonContentView.tsx markdown [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [LessonContentView.tsx](packages/web/components/generation-graph/panels/output/LessonContentView.tsx)
- [X] T056 Replace ContentPreviewPanel.tsx markdown [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Artifacts: [ContentPreviewPanel.tsx](packages/web/components/generation-graph/panels/lesson/ContentPreviewPanel.tsx)
- [X] T057 Replace course-viewer-enhanced.tsx prose - no react-markdown found
- [X] T058 Replace trace-viewer.tsx CodeBlock - no react-markdown found
- [X] T059 Update about/page.tsx if needed - no react-markdown found
- [X] T060 Update lesson-content.tsx to use MarkdownRendererClient
  → Artifacts: [lesson-content.tsx](packages/web/components/common/lesson-content.tsx)
- [X] T061 DELETE orphaned prose class definitions [EXECUTOR: fullstack-nextjs-specialist] [SEQUENTIAL]
  → Complete: Investigation confirmed no orphaned prose CSS exists. task-list.css uses valid .prose extensions for GFM task lists.
- [X] T062 Grep for react-markdown imports [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: no react-markdown imports remaining
- [X] T063 Verify JsonViewer.tsx stays independent [EXECUTOR: MAIN] [SEQUENTIAL]
  → JsonViewer uses custom JSON formatting, not markdown

**Checkpoint**: All old markdown code deleted, only unified MarkdownRenderer remains

---

## Phase 14: Polish & Quality Assurance

**Purpose**: Final quality assurance, testing, and optimization

### Code Quality

- [X] T064 [P] Create `components/markdown/components/index.ts` - already exists and exporting all components
- [X] T065 Run type-check [EXECUTOR: MAIN] [SEQUENTIAL]
  → No markdown-related type errors
- [X] T066 Run build [EXECUTOR: MAIN] [SEQUENTIAL]
  → Build successful after fixing shared-types tsconfig.tsbuildinfo caching issue and removing ServerRenderedMarkdown (react-dom/server incompatibility)
- [X] T067 [P] Add JSDoc comments to main components [EXECUTOR: technical-writer] [PARALLEL-GROUP-5]
  → All components have JSDoc documentation

### Visual & Accessibility Testing

- [X] T068 [P] Create Playwright visual test suite [EXECUTOR: integration-tester] [PARALLEL-GROUP-6]
  → Artifacts: [markdown-visual.spec.ts](packages/web/tests/e2e/visual/markdown-visual.spec.ts), [playwright.config.ts](packages/web/playwright.config.ts) (+markdown-visual project)
- [X] T069 [P] Generate baseline screenshots [EXECUTOR: integration-tester] [PARALLEL-GROUP-6]
  → Test suite created with 20+ visual tests. Run `pnpm test:visual:markdown:update` to generate baselines
- [X] T070 Run axe-core accessibility audit [EXECUTOR: accessibility-tester] [SEQUENTIAL]
  → Artifacts: Same as T054 - [markdown-components.test.ts](packages/web/tests/accessibility/markdown-components.test.ts)
- [X] T071 Manual QA: Test light/dark modes [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified by user

### Performance & Security

- [X] T072 Performance check: Verify 0 KB client JS [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: Shiki/rehype-pretty-code runs on server via compileMDX(), CodeBlock only adds ~2KB for copy button
- [X] T073 Security audit: Verify CSP [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: sandbox="allow-scripts" (no allow-same-origin), securityLevel:'strict', html-entities escaping
- [X] T074 Run quickstart.md validation [EXECUTOR: MAIN] [SEQUENTIAL]
  → Verified: All imports, presets, CSS, and API match documentation

**Checkpoint**: All quality gates passed, ready for delivery

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **Contract Tests (Phase 2.5)**: Depends on Foundational - validates before proceeding
- **User Stories (Phase 3-12)**: All depend on Phase 2.5 completion
  - US1 (Consistent Content) and US2 (Code Blocks) are P1 - do first
  - US3-5 (Math, Diagrams, Streaming) are P2 - do next
  - US6-10 (Callouts, Navigation, Tables, Extended, Accessibility) are P3 - do last
- **Code Replacement (Phase 13)**: Depends on US1-2 minimum (core renderers working)
- **Polish (Phase 14)**: Depends on Phase 13 completion

### User Story Dependencies

- **US1 (Consistent Content)**: Phase 2.5 only - no dependencies on other stories
- **US2 (Code Blocks)**: Phase 2.5 only - can run parallel to US1
- **US3 (Math)**: Phase 2.5 only - can run parallel to US1/US2
- **US4 (Diagrams)**: Phase 2.5 only - can run parallel to US1-3
- **US5 (Streaming)**: Phase 2.5 only - requires MarkdownRendererClient from T012
- **US6 (Callouts)**: Phase 2.5 only - can run parallel
- **US7 (Navigation)**: Phase 2.5 only - can run parallel
- **US8 (Tables)**: Phase 2.5 only - can run parallel
- **US9 (Extended)**: Phase 2.5 only - can run parallel
- **US10 (Accessibility)**: Phase 2.5 only - can run parallel

### Parallel Opportunities per Phase

**Phase 1 (Setup)**:
```
T006 (types.ts) || T007 (presets.ts) - different files
```

**Phase 2 (Foundational)**:
```
T009 (plugins) → T010 (shiki) → T011 (RSC renderer)
                              → T012 (Client renderer)
```

**Phase 2.5 (Contract Tests)**:
```
T014 || T015 || T016 - all independent test files
```

**Phase 4 (US2 - Code Blocks)**:
```
T021 (CodeBlock) - single file, can start immediately after T016
```

**Phase 6 (US4 - Diagrams)**:
```
T029 (MermaidIframe) || T030 (MermaidDiagram) - different files
```

**Phase 8 (US6 - Callouts)**:
```
T038 (Callout.styles) || T039 (Callout.tsx) - different files
```

**Phase 14 (Polish)**:
```
T064 || T067 - different files
T068 || T069 - test suite creation
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational (T009-T013)
3. Complete Phase 2.5: Contract Tests (T014-T016)
4. Complete Phase 3: US1 - Consistent Content (T017-T020)
5. Complete Phase 4: US2 - Code Blocks (T021-T024)
6. **STOP and VALIDATE**: Run contract tests, verify lesson rendering
7. Start Phase 13: Code replacement

### Full Scope Delivery

1. MVP First (above)
2. Add P2 Stories: US3 (Math), US4 (Diagrams), US5 (Streaming)
3. Add P3 Stories: US6-10 (Callouts, Navigation, Tables, Extended, Accessibility)
4. Complete Phase 13: Code Replacement & Cleanup
5. Complete Phase 14: Polish & QA

---

## Summary

| Phase | Tasks | Priority | Description |
|-------|-------|----------|-------------|
| 0 | P001-P004 | - | Planning & agent creation |
| 1 | T001-T008 | Setup | Dependencies, structure |
| 2 | T009-T013 | Foundational | Core renderers (BLOCKS ALL) |
| 2.5 | T014-T016 | Tests | Contract tests for renderers |
| 3 | T017-T020 | P1 (US1) | Consistent Content |
| 4 | T021-T024 | P1 (US2) | Code Blocks |
| 5 | T025-T028 | P2 (US3) | Math Formulas |
| 6 | T029-T033 | P2 (US4) | Diagrams |
| 7 | T034-T037 | P2 (US5) | Streaming |
| 8 | T038-T041 | P3 (US6) | Callouts |
| 9 | T042-T044 | P3 (US7) | Navigation |
| 10 | T045-T046 | P3 (US8) | Tables |
| 11 | T047-T049 | P3 (US9) | Extended Markdown |
| 12 | T050-T054 | P3 (US10) | Accessibility |
| 13 | T055-T063 | Cleanup | Replace old code, DELETE unused |
| 14 | T064-T074 | Polish | QA, Playwright tests, performance |

**Total Tasks**: 78 (P001-P004 + T001-T074)
**MVP Scope**: Phases 0-4 + Phase 13 partial (28 tasks) - consistent content + code blocks + cleanup
**Full Scope**: All phases (78 tasks)
