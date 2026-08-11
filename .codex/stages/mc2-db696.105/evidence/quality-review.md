# Career Playbook representative quality review

Review date: 2026-08-11

Reviewer: root owner (no delegated reviewer)

Fixture: Sales Manager B2B, sales, lead, reports to CRO, leads SDR/AE, 51-200-person growth-stage B2B SaaS, English, universal context, no uploads and no course bridge

Playbook: `4590b642-0169-4941-a74e-c1c53d3da2be`

## Verdict

The generation is technically complete but is **not publication-ready**. It is a useful structured
draft that needs a company-specific calibration pass, factual sourcing, cross-block normalization,
and PDF export fixes before it can be handed to an employee as an authoritative role guide.

Overall editorial score: **2.6 / 5**.

| Dimension | Score | Result |
|---|---:|---|
| Completeness | 5 / 5 | 26 numbered sections plus the header are present; all 27 stored blocks completed |
| Coherence | 2 / 5 | Repeated metrics conflict across blocks and some recommendations contradict the anti-goals |
| Practical usefulness | 3 / 5 | Strong templates and checklists, but too many invented defaults must be replaced before use |
| Grounding and traceability | 1 / 5 | No source links or citations; several specific market and AI claims are unsupported |
| Decision and risk guidance | 3 / 5 | Anti-goals, authority matrix, and FMEA are useful, but some classifications and thresholds are unsafe defaults |
| PDF fidelity | 2 / 5 | Readable core text, but blank pages, split diagrams, raw Markdown, and missing glyphs block publication |
| Cover image | 3 / 5 | Valid and visually clean, but generic and weakly differentiated for this exact role |

## Generation evidence

- Terminal state: `completed`.
- Created: `2026-08-11T07:47:56.374635Z`; completed: `2026-08-11T08:44:06.610Z`
  (about 56 minutes end to end).
- Stored blocks: 27 (`header` plus `block_1` through `block_26`).
- Final Markdown: 1,028 lines, 12,408 words, 84,011 bytes.
- PDF: 60 A4 pages, 410,491 bytes, Chromium/Skia PDF 1.4.
- Cover: WebP, 1024 x 1024, 126,026 bytes.
- Five Mermaid blocks passed the application syntax validator.
- Main graph cost recorded by the application: `$0.115279185`.
- Cover generation: `$0.007`; wizard follow-up: `$0.0002711`.
- Total application-recorded successful usage: **`$0.122550285`**, below the authorized `$0.50`
  ceiling. Timed-out provider attempts have no usage record, so the application record cannot prove
  whether an upstream provider later bills those aborted attempts.
- The spec correction alone took 1,047,291 ms and included repeated 300-second timeouts. Group 3
  also required a model fallback. Twelve blocks required thirteen regeneration attempts.

## What is good

- The guide covers the requested role end to end: mission, responsibilities, duties, authority,
  metrics, competencies, tools, AI boundaries, dependencies, career path, candidate profile,
  onboarding, motivation, workflows, warning signs, FAQ, business alignment, failure modes,
  continuity, role canvas, revision cadence, and implementation checklist.
- The anti-goals are concrete and name an owner.
- The weekly pipeline checklist, SBAR escalation template, onboarding milestones, stay-interview
  prompts, recovery sprints, continuity protocol, and implementation checklist are directly usable
  after calibration.
- Mermaid syntax is valid, and all five diagrams render in the PDF.
- The output consistently frames the role as a manager and coach rather than an individual seller.

## Blocking editorial findings

### 1. The guide has no factual traceability

There are no URLs or source citations in the final Markdown. Nevertheless it asserts, among other
things, 90-95% AI accuracy and 40-60 saved hours per month (`career-playbook.md:154,178`), 95% weekly
and 65% daily AI adoption, a 28% response-rate expectation, and multiple SaaS benchmarks
(`career-playbook.md:805`). The phrases “Research shows” and “based on 2024-2025 studies” are not
backed by an identifiable source. These claims must either cite preserved evidence or be rewritten
as explicit hypotheses/placeholders.

### 2. Cross-block metrics conflict

- Pipeline coverage is `>=2x` in the responsibility definition (`:44`) and `>=3x` in the KPI table
  (`:87`).
- Forecast requirements vary between `+/-10%`, `>=90% within +/-10%`, and `+/-5%`
  (`:46,59,95,495,852,950`).
- Team success shifts between at least 85% of reps hitting quota, at least 90% team attainment, and
  at least 100% team attainment (`:18,94,494,949`).
- Voluntary turnover is alternately below 15% per quarter, below 10% per quarter, below 15% annually,
  critical above 25% per quarter, and a failure mode above 30% annually (`:47,99,497,647,856,868`).

These are not harmless examples because the document also presents them as Definitions of Done,
bonus conditions, warning thresholds, and performance criteria.

### 3. The anti-micromanagement principle conflicts with daily duties

The guide says not to micromanage individual activity, but then requires every rep to post three
deal updates before 10:00 and requires one reviewed call per rep every day (`:32,55-56`). For a
manager with 6-10 or more reports this is both capacity-heavy and behaviorally inconsistent with
the stated “context over control” principle (`:859`).

### 4. Generic input is presented as company truth

The universal fixture had no company corpus, yet the output invents a `$120,000/$60,000`
compensation example (`:500-506`), a `$50M` incremental ARR scenario (`:843`), named people and
tools, and dated 2024-2025 training records (`:929-935`). The onboarding Gantt is hard-coded to
January-March 2025 (`:393-425`) even though the guide was generated in August 2026. Labels such as
“example” reduce but do not eliminate the risk of copying stale or regionally inappropriate values
into an official role guide.

### 5. Some decision classifications are overstated

Hiring and termination are appropriately treated as high-consequence decisions, but changing CRM
stages and selecting a tool/vendor are also labeled irreversible one-way doors (`:71-77`). Those
decisions are normally reversible migrations or contracts with switching costs. The matrix should
distinguish reversibility, blast radius, contract commitment, and approval authority instead of
collapsing them into one label.

### 6. There are smaller semantic and copy defects

- The career diagram routes CRO to “Chief Revenue Officer / President of Revenue,” effectively
  repeating the same level.
- “Senior Sales Manager (IC)” is confusing because the title normally implies people management.
- “and an accelerators on over-attainment” is grammatically incorrect (`:500`).
- “Forecast accuracy consistently >+/-20%” mixes accuracy with variance and should instead describe
  absolute forecast error (`:644`).

## PDF and image review

All 60 PDF pages were rendered to PNG and inspected. The core typography and tables are readable,
but the export fails publication-quality acceptance:

- Pages **20, 34, and 57** are fully blank because a following Mermaid diagram is pushed to the next
  page after its container reserved space.
- The revision-flow diagram is split across pages **58-59**; the bottom node is clipped on page 58
  and continues without context on page 59.
- Valid level-four Markdown headings are emitted literally as `#### Bucket ...` on page **14**.
- Nine horizontal rules are emitted literally as `---` on pages including 3, 21, 28, 31, 42, 55,
  and 59.
- The check/warning glyphs in the DO-CONFIRM table degrade to square/triangle placeholders on page
  **32**.
- Pagination leaves severe orphans and whitespace: the FMEA tail occupies only the top of page 50,
  and the FAQ continuation occupies only a few lines on page 42.
- The cover image is valid and clean, but it is a generic blue “business growth” scene; it does not
  communicate B2B sales leadership, coaching, or the product brand distinctly.

## Cleanup evidence

The dedicated worker and API were stopped immediately after capture. Exact cleanup by fixture and
queue identifiers reported zero organizations, users, memberships, auth users, playbooks, jobs,
errors, courses, files, storage objects, and queue keys. The temporary credential file and helper
script were removed.

Direct Qdrant counting was unavailable because the configured retired cloud endpoint returns plain
HTTP 404 even for `/collections`. This is the already-tracked platform condition owned by
`mc2-jz6y0`. This run had no uploads, no course bridge, zero file/course rows, and never entered a
vectorization path, so it created no Qdrant resource by construction; a direct zero count cannot be
claimed.

## Artifact inventory

Local sanitized evidence (gitignored):

| File | SHA-256 |
|---|---|
| `packages/course-gen-platform/artifacts/career-playbook-quality/career-playbook.md` | `79a57b7dc918a77de044d2ae51563b6f28d9e8e9ede928413c727de65bc71e25` |
| `packages/course-gen-platform/artifacts/career-playbook-quality/career-playbook.pdf` | `f67e4f24fa007fc3fcc14d6331358bacbc7b10b8dfc19a086c76eee8a0eec3d3` |
| `packages/course-gen-platform/artifacts/career-playbook-quality/career-playbook-card.webp` | `e45f8f1219c1447110eca91a4b1326ad2c4351c6ca6e2c8a857412f7156c7000` |
| `packages/course-gen-platform/artifacts/career-playbook-quality/run-record.json` | `cd7909d3d39df3c62c5bf080061426a4d3a44ef8a92ccbe74e7b8eeed552aff8` |

Rendered review images are local-only under `tmp/pdfs/career-playbook-quality/`.

## Tracked follow-ups

- `mc2-db696.106` - PDF Markdown fidelity and pagination.
- `mc2-db696.107` - grounded, cross-block-consistent guidance.
- `mc2-db696.108` - timeout, fallback, latency, and cost-receipt reliability.
