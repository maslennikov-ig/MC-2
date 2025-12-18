# Feature Specification: Unified Markdown Rendering System

**Feature Branch**: `feature/markdown-renderer`
**Created**: 2025-12-11
**Status**: Draft
**Input**: Technical requirements document for modern markdown rendering system with math, diagrams, and code highlighting support

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Content Experience (Priority: P1)

As a student viewing educational lessons, I need consistent and readable content formatting so that I can focus on learning without being distracted by inconsistent styling or missing features.

**Why this priority**: Core user value - students spend most of their time reading lesson content. Inconsistent formatting creates cognitive load and degrades the learning experience. This is the primary use case affecting the majority of users.

**Independent Test**: Navigate to any lesson page, verify all content elements (headings, code, tables, lists) render with consistent styling. Compare styling across 5+ different lessons - all should match.

**Acceptance Scenarios**:

1. **Given** a lesson containing headings, paragraphs, and lists, **When** I view the lesson, **Then** all text elements should have consistent fonts, sizes, and spacing throughout
2. **Given** two different lessons with similar content types, **When** I switch between them, **Then** the visual styling should be identical for the same content types
3. **Given** a lesson viewed on desktop, **When** I switch to mobile device, **Then** all content remains readable and properly formatted

---

### User Story 2 - Code Block Readability (Priority: P1)

As a student learning programming concepts, I need code examples to be clearly formatted with syntax highlighting so that I can understand code structure and syntax at a glance.

**Why this priority**: Code is fundamental to technical education. Poor code formatting makes it difficult to distinguish keywords, strings, and syntax - directly impacting learning effectiveness.

**Independent Test**: View any lesson containing code blocks, verify syntax highlighting is applied correctly for at least 5 common programming languages (JavaScript, Python, TypeScript, SQL, Bash).

**Acceptance Scenarios**:

1. **Given** a lesson with JavaScript code examples, **When** I view the code block, **Then** keywords, strings, functions, and comments should be visually distinguished through colors
2. **Given** a code block in a lesson, **When** I hover over it, **Then** a copy button should appear allowing me to copy the code to clipboard
3. **Given** a long code example, **When** I view it, **Then** line numbers should be displayed for easy reference
4. **Given** I am using dark mode, **When** I view code blocks, **Then** syntax highlighting should use appropriate colors for dark backgrounds
5. **Given** a code block with a specified filename, **When** I view it, **Then** the filename should be displayed as a header above the code
6. **Given** a code block with highlighted lines specified, **When** I view it, **Then** those specific lines should have a distinct background color to draw attention
7. **Given** a code block with a specified language, **When** I view it, **Then** a language indicator/badge should be visible

---

### User Story 3 - Mathematical Formula Display (Priority: P2)

As a student studying technical subjects, I need mathematical formulas and equations to render correctly so that I can understand mathematical concepts presented in lessons.

**Why this priority**: Mathematical content is essential for STEM education. Displaying raw LaTeX syntax instead of rendered formulas makes content incomprehensible for many learners.

**Independent Test**: Create a lesson with inline math (`$E=mc^2$`) and block math (`$$\int_0^\infty x^2 dx$$`), verify both render as proper mathematical notation.

**Acceptance Scenarios**:

1. **Given** a lesson containing inline math notation, **When** I view the lesson, **Then** mathematical symbols should render as proper formatted equations within the text flow
2. **Given** a lesson with complex block equations, **When** I view the lesson, **Then** equations should be centered and clearly readable at appropriate size
3. **Given** mathematical formulas in dark mode, **When** I view them, **Then** formula text should be clearly visible against the dark background
4. **Given** I am using a screen reader, **When** I encounter a formula, **Then** accessible alternative text should be provided

---

### User Story 4 - Technical Diagram Support (Priority: P2)

As a student learning complex systems, I need diagrams and flowcharts to render properly so that I can understand visual representations of processes, architectures, and relationships.

**Why this priority**: Visual diagrams are crucial for explaining complex concepts that are hard to convey through text alone. Many technical lessons rely on flowcharts, sequence diagrams, and architecture diagrams.

**Independent Test**: Create a lesson with a Mermaid flowchart and sequence diagram, verify both render as interactive diagrams rather than code blocks.

**Acceptance Scenarios**:

1. **Given** a lesson containing a flowchart definition, **When** I view the lesson, **Then** I should see a rendered visual diagram, not raw text
2. **Given** a complex diagram, **When** I am viewing the lesson page, **Then** the page should not freeze or become unresponsive while the diagram loads
3. **Given** a diagram in dark mode, **When** I view it, **Then** colors and labels should be clearly visible
4. **Given** a diagram with multiple nodes, **When** I view it, **Then** all labels and connections should be readable
5. **Given** a diagram is loading, **When** I view the lesson, **Then** a loading placeholder should be displayed instead of empty space
6. **Given** a diagram with invalid syntax, **When** I view the lesson, **Then** an error message should appear within the diagram area without breaking the rest of the page

---

### User Story 5 - Real-time AI Chat Formatting (Priority: P2)

As a user interacting with AI-powered chat features, I need AI responses to render properly in real-time as they stream in, so that I can read the response as it's being generated.

**Why this priority**: AI chat features require streaming content support. Users should see properly formatted responses as they arrive, not raw markdown syntax or broken formatting.

**Independent Test**: Initiate an AI chat conversation, observe that responses render incrementally with proper formatting (bold, lists, code) as they stream in.

**Acceptance Scenarios**:

1. **Given** I am chatting with AI and it starts responding, **When** the response streams in token by token, **Then** I should see formatted text, not raw markdown symbols
2. **Given** an AI response includes code snippets, **When** the code portion streams in, **Then** it should be displayed in a code block with basic formatting
3. **Given** an incomplete AI response (still streaming), **When** viewing it, **Then** the display should remain stable without flickering or jumping

---

### User Story 6 - Content Notices and Callouts (Priority: P3)

As a student, I need important notices, warnings, and tips to be visually distinguished from regular content so that I don't miss critical information.

**Why this priority**: Callouts improve content scannability and ensure students notice important notes, warnings, and tips. While not blocking, they enhance the learning experience significantly.

**Independent Test**: Create a lesson with different callout types (note, warning, tip, danger), verify each has distinct visual styling and icons.

**Acceptance Scenarios**:

1. **Given** a lesson with a warning callout, **When** I view the lesson, **Then** the warning should be visually prominent with distinctive color and icon
2. **Given** different callout types (note, tip, warning), **When** I view them, **Then** each type should have a unique visual style making its purpose clear
3. **Given** a callout in dark mode, **When** I view it, **Then** colors and icons should be clearly visible and distinguishable

---

### User Story 7 - Navigation within Long Content (Priority: P3)

As a student reading long lessons, I need to be able to navigate to specific sections and share links to specific parts of the content so that I can easily reference and return to important sections.

**Why this priority**: Long-form educational content benefits from internal navigation. Anchor links enable bookmarking and sharing specific sections, improving the reference value of content.

**Independent Test**: Navigate to a lesson with multiple headings, click on heading anchor links, verify URL updates and direct access via URL works.

**Acceptance Scenarios**:

1. **Given** a lesson with multiple sections, **When** I hover over a heading, **Then** an anchor link icon should appear
2. **Given** I click on a heading anchor, **When** the page reacts, **Then** the URL should update to include the section identifier
3. **Given** I have a URL with a section anchor, **When** I navigate to it, **Then** the page should scroll directly to that section

---

### User Story 8 - Table Data Readability (Priority: P3)

As a student reviewing tabular data, I need tables to be readable and accessible on all devices so that I can understand structured information presented in lessons.

**Why this priority**: Tables are common in educational content for comparisons, data, and structured information. Poor table rendering on mobile makes content inaccessible.

**Independent Test**: View a lesson with a wide table (6+ columns) on mobile, verify horizontal scrolling works and content remains readable.

**Acceptance Scenarios**:

1. **Given** a lesson with a wide table, **When** I view it on mobile, **Then** I should be able to horizontally scroll to see all columns
2. **Given** a table with many rows, **When** I view it, **Then** alternating row colors should help me track across rows
3. **Given** a table header, **When** I scroll down a long table, **Then** I should still be able to identify which column is which

---

### User Story 9 - Extended Markdown Features (Priority: P3)

As a content author, I need extended markdown features like emoji shortcodes, strikethrough text, and task lists so that I can create more expressive and interactive educational content.

**Why this priority**: Extended features improve content expressiveness. Emoji and strikethrough are commonly used in modern documentation. While not critical, they enhance content quality.

**Independent Test**: Create content with emoji shortcodes (`:smile:`), strikethrough (`~~text~~`), and task lists (`- [ ] item`), verify all render correctly.

**Acceptance Scenarios**:

1. **Given** content with emoji shortcodes like `:smile:`, **When** I view the content, **Then** the shortcode should render as the corresponding emoji character
2. **Given** content with strikethrough syntax (`~~text~~`), **When** I view the content, **Then** the text should appear with a line through it
3. **Given** content with task list items (`- [ ]` and `- [x]`), **When** I view the content, **Then** checkboxes should be displayed (checked or unchecked appropriately)

---

### User Story 10 - Accessibility for Screen Reader Users (Priority: P3)

As a visually impaired user using a screen reader, I need the content to be properly structured and announced so that I can navigate and understand the educational material.

**Why this priority**: Accessibility ensures the platform is usable by all students. Screen reader support is essential for inclusive education.

**Independent Test**: Navigate lesson content using a screen reader, verify headings are announced with levels, code blocks are identified, and skip links allow bypassing long content.

**Acceptance Scenarios**:

1. **Given** a long lesson with multiple sections, **When** I use a screen reader, **Then** I should be able to use a "skip to content" link to bypass navigation
2. **Given** headings in the content, **When** announced by screen reader, **Then** heading levels should be correctly identified (H1, H2, H3, etc.)
3. **Given** a code block, **When** announced by screen reader, **Then** it should be identified as code content with the programming language if specified
4. **Given** interactive elements (copy buttons, links), **When** I navigate with keyboard, **Then** focus should be clearly visible and elements properly labeled

---

### Edge Cases

- What happens when malformed markdown is provided? System should display content gracefully without crashing, showing raw text if parsing fails.
- How does the system handle very long code blocks? Horizontal scrolling should be available without breaking page layout.
- What happens when a diagram syntax is invalid? System should show an error message within the diagram area rather than breaking the entire page.
- How does the system handle incomplete streaming content (e.g., unclosed code block)? Display should remain stable and update when more content arrives.
- What happens with extremely large tables (100+ rows)? Content should remain scrollable and performant.
- How does the system handle nested formatting (e.g., bold inside code, links in callouts)? Nested formatting should render correctly where semantically valid.
- What happens when an emoji shortcode is invalid? System should display the raw shortcode text rather than breaking.
- How does the system handle content with mixed RTL and LTR text? Text direction should be handled appropriately.

## Requirements *(mandatory)*

### Functional Requirements

**Core Rendering**
- **FR-001**: System MUST render markdown content with consistent styling across all viewing contexts (lessons, previews, chat)
- **FR-002**: System MUST display code blocks with syntax highlighting for common programming languages
- **FR-003**: System MUST provide a copy-to-clipboard functionality for code blocks
- **FR-004**: System MUST render mathematical notation (inline and block) as properly formatted equations
- **FR-005**: System MUST render diagram definitions as visual diagrams
- **FR-006**: System MUST support distinct callout types (note, tip, warning, danger, info) with unique visual styling
- **FR-007**: System MUST display tables with horizontal scrolling when content exceeds viewport width
- **FR-008**: System MUST add navigable anchor links to headings in long-form content
- **FR-009**: System MUST support real-time rendering of streaming content (for AI chat features)
- **FR-010**: System MUST apply appropriate styling for both light and dark display modes
- **FR-011**: System MUST distinguish between external and internal links visually
- **FR-012**: System MUST handle malformed markdown gracefully without breaking the page
- **FR-013**: System MUST optimize diagram loading to prevent page freezing (lazy loading)
- **FR-014**: System MUST preserve all existing content display functionality during migration

**Code Block Features**
- **FR-015**: System MUST display line numbers in code blocks when enabled
- **FR-016**: System MUST support line highlighting (visual emphasis on specific lines) in code blocks
- **FR-017**: System MUST display filename headers above code blocks when specified
- **FR-018**: System MUST display a language indicator/badge for code blocks when language is specified

**Extended Markdown**
- **FR-019**: System MUST convert emoji shortcodes (e.g., `:smile:`) to corresponding emoji characters
- **FR-020**: System MUST support GitHub Flavored Markdown features (strikethrough, task lists, autolinks)

**Accessibility**
- **FR-021**: System MUST provide skip links for bypassing long content sections
- **FR-022**: System MUST maintain proper heading hierarchy (no skipped levels)
- **FR-023**: System MUST ensure all interactive elements are keyboard accessible with visible focus indicators

**Diagram Features**
- **FR-024**: System MUST display a loading placeholder while diagrams are being rendered
- **FR-025**: System MUST display user-friendly error messages for invalid diagram syntax without breaking the page

**Security**
- **FR-026**: System MUST implement two-tier content security model: trusted content (AI-generated) renders without sanitization for performance; untrusted content (user-generated) MUST be sanitized via rehype-sanitize as the first processing step

**Architecture**
- **FR-027**: System MUST provide two rendering modes: server-side renderer (RSC with Shiki) for static content achieving 0 KB client JS for syntax highlighting; client-side renderer (Streamdown) for streaming AI content with optimized token-by-token memoization
- **FR-028**: System MUST render Mermaid diagrams in sandboxed iframe with isolated CSP (`sandbox="allow-scripts"`) to prevent unsafe-eval requirement in main application
- **FR-029**: Streaming AI content renderer MUST use Streamdown library for optimized incremental parsing with block-level memoization

### Non-Functional Requirements

**Typography & Readability (WCAG-compliant)**
- **NFR-001**: Body text MUST use font size between 16-18px (16px minimum for accessibility)
- **NFR-002**: Line height MUST be between 1.5-1.625 (WCAG recommends 1.5× minimum)
- **NFR-003**: Content line length MUST NOT exceed 65 characters (`max-width: 65ch`)
- **NFR-004**: Paragraph spacing MUST be between 1.25-1.5em for visual breathing room
- **NFR-005**: Heading letter-spacing SHOULD use -0.025em for h1/h2 (tighter tracking for display text)

### Key Entities

- **Rendered Content**: The formatted output displayed to users, derived from source markdown/MDX content
- **Content Preset**: A configuration defining which features are enabled for a specific context (lesson, chat, preview, minimal)
- **Code Block**: A formatted container for programming code with:
  - Syntax highlighting (language-specific colors)
  - Optional line numbers
  - Optional filename header
  - Optional line highlighting (emphasized lines)
  - Language indicator/badge
  - Copy-to-clipboard button
- **Callout**: A visually distinct notice block with type (note/warning/tip/danger/info), optional title, and content
- **Mathematical Formula**: Rendered mathematical notation from LaTeX source, displayed inline or as a block, with accessible alternatives
- **Diagram**: A rendered visual representation from textual diagram syntax (flowcharts, sequence diagrams, etc.) with loading states and error handling
- **Table**: Responsive data table with horizontal scrolling, alternating row colors, and header styling

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All lesson pages render content with identical styling for same content types (zero visual inconsistencies)
- **SC-002**: Code syntax highlighting covers at least 20 programming languages without client-side performance impact
- **SC-003**: Mathematical formulas render correctly in both light and dark modes with accessible alternatives
- **SC-004**: Diagrams load without blocking page interactivity (Interaction to Next Paint < 200ms during diagram rendering)
- **SC-005**: Streaming content updates display at least 10 times per second without visual artifacts or flickering
- **SC-006**: Tables remain usable on mobile devices (320px viewport) with horizontal scroll access
- **SC-007**: Static content (lessons, previews) renders with 0 KB client-side JavaScript for syntax highlighting (Shiki SSR); streaming content uses lightweight client renderer (≤10 KB gzipped)
- **SC-008**: All existing content displays correctly after migration (zero regression in functionality)
- **SC-009**: Copy button on code blocks successfully copies content to clipboard on all major browsers
- **SC-010**: Keyboard users can navigate to and activate all interactive elements (copy buttons, anchor links)
- **SC-011**: All standard emoji shortcodes render correctly (common shortcodes like `:smile:`, `:thumbsup:`, etc.)
- **SC-012**: Skip links are functional and properly bypass content to main sections
- **SC-013**: Screen readers correctly identify content structure (headings, code blocks, lists)
- **SC-014**: Invalid diagram syntax displays error message without breaking page layout or other content
- **SC-015**: Main application Content-Security-Policy MUST NOT include 'unsafe-eval'; diagram rendering isolation verified via CSP violation reporting

## Clarifications

### Session 2025-12-11

- Q: Нужно ли реализовать двухуровневую модель безопасности контента с разными pipeline санитизации? → A: Да, двухуровневая модель (trusted без санитизации + untrusted через rehype-sanitize)
- Q: Принять целевой показатель 0 KB клиентского JS для подсветки синтаксиса? → A: Да, два рендерера: SSR (Shiki, 0 KB JS) для статики + Client (Streamdown) для streaming
- Q: Как поступить с Mermaid и требованием unsafe-eval в CSP? → A: Sandboxed Iframe (Option E) — Mermaid рендерится в изолированном iframe с собственным CSP, main app сохраняет strict CSP без unsafe-eval
- Q: Зафиксировать WCAG-совместимые значения типографики в спеке? → A: Да, добавить как NFR (16-18px body, 1.5-1.625 line-height, max 65ch line length)

## Assumptions

- Source content is primarily AI-generated lesson content which is considered trusted
- User-generated content (if any) will be sanitized before rendering
- The platform already has light/dark mode infrastructure in place
- Target browsers include modern versions of Chrome, Firefox, Safari, and Edge
- Mobile devices include both iOS and Android platforms
- The existing content uses standard markdown/MDX syntax

## Scope Boundaries

### In Scope

- Unified rendering component for all markdown display contexts
- Syntax highlighting for code blocks (server-side rendering preferred)
- Code block features: line numbers, line highlighting, filename headers, language badges
- Mathematical formula rendering (inline and block)
- Diagram rendering (lazy-loaded with loading placeholders and error handling)
- Callout components (5 types: note, tip, warning, danger, info)
- Responsive table handling with horizontal scroll
- Anchor links for headings
- Copy button for code blocks
- Dark mode support for all elements
- Streaming content support for AI chat
- Extended markdown: emoji shortcodes, GFM features (strikethrough, task lists)
- Accessibility: skip links, proper heading hierarchy, keyboard navigation
- External link visual indicators
- Migration of existing rendering implementations (4+ components)

### Out of Scope

- Backend markdown parsing utilities (remain unchanged)
- Content editing interfaces
- Content creation/authoring tools
- Search indexing of markdown content
- PDF export of rendered content
- Collaborative editing features
- Version history of content
- Comment/annotation systems
- Diff highlighting in code blocks (future enhancement)
- Collapsible/expandable sections (future enhancement)
- Auto-generated table of contents (future enhancement)
- JSON syntax highlighting (handled by separate JsonViewer component)
