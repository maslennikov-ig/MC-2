# Промпты для Deep Research и Deep Think

## Контекст проекта (общий для обоих промптов)

Ниже — промпты для отправки во внешние модели. Проект описан в каждом промпте для самодостаточности.

---

## Промпт 1: Deep Research

**Тема**: Surgical editing of hierarchical course structures via LLM chat — production patterns, libraries, and auto-intent systems

````
# Research Request: Production Patterns for LLM-Powered Surgical Editing of Hierarchical Course Structures

## Project Context

I'm building an online course generation platform (Next.js + Supabase + tRPC + OpenRouter). The platform generates course structures with this hierarchy:

```json
{
  "course_title": "How to Be Happy",
  "sections": [
    {
      "section_title": "Fundamentals",
      "section_number": 1,
      "lessons": [
        {
          "lesson_title": "Introduction",
          "lesson_number": 1,
          "lesson_objectives": ["..."],
          "key_topics": ["..."],
          "estimated_duration_minutes": 10
        },
        { "lesson_title": "Core Concepts", "lesson_number": 2, ... }
      ]
    },
    { "section_title": "Advanced Topics", "section_number": 2, "lessons": [...] }
  ]
}
````

Users edit this structure through a chat interface. They type natural language requests like:

- "Add a new lesson about myths after lesson 3"
- "Delete the last section"
- "Move lesson 2 to section 3"
- "Change the course title to X"
- "How many lessons are in this course?"

## Current Architecture (Problems)

1. **User manually selects "Refine" vs "Regenerate" mode** — Users don't understand the difference. They always pick wrong. We want the system to auto-decide.

2. **No surgical structural changes** — We can modify field values (title, description) but CANNOT add/remove/move lessons or sections through the chat. The system can only do full regeneration for structural changes.

3. **Array index paths are fragile** — Changes reference `sections[0].lessons[1].lesson_title`. When you add/remove items, all subsequent indices shift. LLMs consistently fail at index arithmetic.

4. **No stable IDs** — Sections and lessons don't have UUIDs. They're identified only by array position.

5. **Model selection is broken** — Config is in database but fallback chain drops to a cheap model (mimo-v2-flash) instead of the intended model (kimi-k2).

6. **Full structure sent every time** — 42K tokens per request, even for "change the title".

## What I Need Researched

### 1. Surgical Operations on Hierarchical JSON via LLM

- How do production systems (Notion, Confluence, Google Docs, Outline, GitBook) handle ADD/DELETE/MOVE operations on structured content?
- Are there patterns for "insert element at position N and renumber subsequent elements" that work reliably with LLMs?
- How do systems handle cascading updates (e.g., adding a lesson changes numbering, cross-references)?
- JSON Patch (RFC 6902) vs custom operation schemas vs Immer patches — which works best with LLM output?

### 2. Auto-Intent Classification Without User Mode Selection

- How do Cursor, Notion AI, GitHub Copilot determine whether a request needs small edit vs large regeneration?
- What are the best patterns for intent classification in editing UIs?
- Should classification be a separate LLM call or part of the main call?
- How to handle ambiguous requests ("make it better" — is that refine or regenerate)?
- What confidence thresholds and fallback strategies work in production?

### 3. Stable ID Systems for Array-Based Structures

- How do CRDT-based editors (Yjs, Automerge) assign stable IDs to array elements?
- What's the simplest approach to add stable IDs to an existing array-based structure without breaking the schema?
- UUID vs nanoid vs sequential-with-prefix — what works best for LLM context (token efficiency)?
- How to handle ID assignment for new elements created by LLM?

### 4. Dynamic Model Configuration Without Hardcoding

- How do production LLM platforms handle model routing and fallback chains?
- Patterns for "database-first config with graceful degradation"
- How to ensure the correct model is always used, even when parts of the config system fail?
- Circuit breaker patterns for model availability

### 5. Operation Schema Design for LLM Output

Research the optimal schema for representing editing operations that LLMs must generate:

- Discriminated union approach (type: 'add_lesson' | 'update_field' | 'delete_lesson' | ...)
- How to minimize LLM hallucination in operation schemas
- How to validate operations before applying (pre-flight checks)
- How to make operations idempotent and reversible

### 6. Libraries and Tools

Find existing libraries/frameworks that could help:

- JSON structure editing (json-patch, fast-json-patch, immer, rfc6902)
- Intent classification for editing tasks
- Structured output enforcement for LLMs
- Schema validation and operation verification
- Tree/hierarchy manipulation libraries

### 7. Cost Optimization

- Skeleton + targeted context patterns (sending only relevant part of structure)
- Prompt caching strategies for editing sessions
- When to use cheap models vs expensive ones in the editing flow
- Token budget management for large course structures

```

---

## Промпт 2: Deep Think

**Тема**: Architectural design for auto-intent chat with surgical course editing

```

# Architecture Design: Auto-Intent Chat with Surgical Course Structure Editing

## Context

I need you to design the architecture for a course editing chat system. Think deeply about each design decision, trade-offs, and edge cases.

## Current System State

### Data Model

Course structure stored as JSONB in Supabase `courses.course_structure`:

```json
{
  "course_title": "How to Be Happy",
  "course_description": "...",
  "difficulty_level": "beginner",
  "sections": [
    {
      "section_title": "Fundamentals",
      "section_number": 1,
      "section_description": "...",
      "learning_objectives": ["..."],
      "lessons": [
        {
          "lesson_title": "Introduction",
          "lesson_number": 1,
          "lesson_objectives": ["Understand basics"],
          "key_topics": ["Topic A", "Topic B"],
          "estimated_duration_minutes": 10,
          "difficulty_level": "beginner"
        }
      ]
    }
  ],
  "learning_outcomes": [{ "outcome": "...", "bloom_level": "understand" }]
}
```

Key facts:

- Sections and lessons have NO stable IDs (only array indices and \_number fields)
- Typical course: 5-10 sections, 3-5 lessons per section (15-50 lessons total)
- Structure is ~20-40K tokens when serialized
- There's also a separate `lesson_contents` table for Stage 6 (actual markdown content per lesson)

### Existing Intent Classifier

We already have an intent classification system that classifies into:

- FIELD_UPDATE, REWRITE_CONTENT, EXPAND_CONTENT, SIMPLIFY_CONTENT
- ADD_LESSON, ADD_SECTION (classified but NOT implemented — no handler)
- DELETE_LESSON, DELETE_SECTION (implemented as DirectAction)
- MOVE_ELEMENT (implemented as DirectAction)
- GET_INFO, UNKNOWN

The classifier uses a cheap model (~200 tokens) and returns:

```typescript
{
  intent: string,
  confidence: number,       // 0-1
  target?: {
    elementType: 'lesson' | 'section' | 'course' | 'field',
    path: string,           // "sections[0].lessons[2]"
    identifier: string      // "урок 2.3", "секция Введение"
  },
  fieldName?: string,
  newValue?: unknown
}
```

### Existing Proposal Types

```typescript
type Proposal = FieldUpdatesProposal | LessonPatchProposal | DirectActionProposal

// Can modify existing field values
FieldUpdatesProposal: { type: 'field_updates', updates: [{ path, oldValue, newValue }] }

// Can modify lesson content (Stage 6)
LessonPatchProposal: { type: 'lesson_patch', lessonId, sectionId, patchedContent }

// Can DELETE or MOVE (but NOT ADD)
DirectActionProposal: { type: 'direct_action', action: 'DELETE' | 'MOVE', targetPath, destinationPath }
```

### Model Configuration

Models are configured in database table `llm_model_config` with phase-based routing:

- `chat_stage_5_refinement` → kimi-k2 (intended)
- `chat_stage_6_refinement` → deepseek-v3.2
- But fallback chain is broken: when DB lookup fails, it falls to `global_default` which is `mimo-v2-flash`

## Design Questions — Think Deeply About Each

### Q1: How to eliminate the Refine/Regenerate user toggle?

Currently users must choose between:

- **Refine** → intent classification → targeted edit
- **Regenerate** → full async regeneration job

Users pick wrong 90% of the time. Design a system where:

- User just types a message
- System automatically determines the right approach
- Full regeneration is used ONLY as a last resort (e.g., "completely redo this course from scratch")

Think about: What signals indicate refine vs regenerate? How to handle borderline cases? What if the user explicitly asks for full regeneration?

### Q2: How to implement ADD_LESSON / ADD_SECTION as surgical operations?

User says: "Add a lesson about myths between lesson 2 and 3 in section 1"

Current system: Can't do this. Can only regenerate the entire course.

Design a system where:

1. New lesson is inserted at the correct position
2. Subsequent lesson_numbers are incremented (3→4, 4→5, etc.)
3. No other lessons are regenerated or modified
4. The new lesson has proper objectives, topics, duration

Think about:

- Should the LLM generate JUST the new lesson content, or generate an "insert operation"?
- How to handle the renumbering (application code vs LLM)?
- What if the user says "add 3 new lessons about X"?
- What about section_number changes when adding a section?
- How to update cross-references (e.g., "as discussed in lesson 3" now becomes lesson 4)?

### Q3: Stable IDs vs Array Indices — Migration Strategy

Current: `sections[0].lessons[1].lesson_title`
Proposed: `{ targetId: "lesson-uuid", field: "lesson_title" }`

Design the migration:

- How to add stable IDs to existing course_structure without breaking anything?
- Should IDs be UUIDs (36 chars, high token cost) or short IDs (nanoid, 8 chars)?
- How to backfill IDs for existing courses?
- What format should IDs have? (e.g., `s1`, `s1-l2`, `sec_abc123`, `lesson_xyz789`)
- How does the LLM reference elements — by ID, by title, by position, or by a combination?

### Q4: Operation Schema for LLM Output

Design the discriminated union schema that the LLM must produce:

Consider operations:

- Update a field value (title, description, objectives, topics, duration)
- Add a new lesson (with auto-generated content)
- Add a new section (with auto-generated lessons)
- Delete a lesson/section
- Move a lesson between sections
- Reorder lessons within a section
- Bulk update (change all lesson durations)

For each operation, define:

- Required fields
- How targets are identified (by ID? by position? by title?)
- What the LLM needs to generate vs what application code handles
- Validation rules

### Q5: Model Configuration — Database-Only Design

Design a model configuration system where:

- ALL model configs are in database only (no hardcoded fallbacks)
- System gracefully handles DB unavailability (cache with TTL)
- New phases automatically inherit a default config
- Changes take effect immediately (no restart)
- There's an audit trail of config changes

Think about: What if the database AND cache are both empty (cold start)? How to bootstrap?

### Q6: The Complete Request Flow

Design the end-to-end flow for a chat message:

```
User types: "Add a lesson about common myths after lesson 2 in section 1"
```

Trace through every step:

1. Frontend sends request (what data?)
2. Backend receives (what validation?)
3. Intent classification (what model? what prompt? what output?)
4. Route to handler (which handler? what context does it get?)
5. LLM generates response (what model? what prompt? structured output?)
6. Validate response (what checks?)
7. Create proposal (what type? what data?)
8. Return to frontend (what does user see?)
9. User approves (what happens?)
10. Apply changes (how? what renumbering? what validation?)
11. Persist to DB (what query? what optimistic locking?)
12. Confirm to user (what feedback?)

### Q7: Edge Cases and Error Handling

Think about these scenarios:

- User says "add a lesson" but doesn't specify where → how to clarify?
- User says "move all lessons about X to section Y" → bulk operation
- User says "make the course shorter" → ambiguous, could mean delete lessons or shorten durations
- LLM generates an ADD operation with lesson_number that conflicts
- Two concurrent chat sessions editing the same course
- Network failure after apply but before DB confirmation
- LLM generates operations referencing elements that don't exist

## Output Format

For each question, provide:

1. **Recommended approach** with rationale
2. **Alternative approaches** considered and why rejected
3. **Concrete schema/code examples** (TypeScript/SQL)
4. **Edge cases** and how to handle them
5. **Migration path** from current system

```

---

## Как использовать

1. **Deep Research** — отправить Промпт 1 в Gemini/ChatGPT Deep Research
2. **Deep Think** — отправить Промпт 2 в Claude Deep Think или o3/o1-pro

Оба промпта самодостаточны — содержат полный контекст проекта.
```
