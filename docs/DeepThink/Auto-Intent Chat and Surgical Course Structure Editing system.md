Here is a comprehensive architectural design for the Auto-Intent Chat and Surgical Course Structure Editing system. Every decision is optimized for system determinism, token efficiency, and a frictionless user experience.

---

### Q1: How to eliminate the Refine/Regenerate user toggle?

**1. Recommended Approach: Scope-Aware Intent Routing**
Shift the burden of routing from the user to an enhanced Intent Classifier. The classifier (using the cheap model) should determine not just the `intent`, but the **blast radius** of the request.

We introduce two new intents: `FULL_REGENERATE` and `CLARIFY`.

- **Surgical Pipeline (Default):** Any standard request (`FIELD_UPDATE`, `ADD_*`, `DELETE_*`, `SIMPLIFY_*`). This triggers the localized AST-based editing pipeline.
- **Regenerate Pipeline:** Triggered **only** when the classifier detects a foundational structural pivot (e.g., _"Start completely over"_, _"Translate everything to French"_, _"Change the target audience from kids to PhDs"_). This bypasses proposals and queues the async regeneration job.
- **Clarification:** Triggered if confidence is `< 0.7` or intent is highly ambiguous (e.g., _"Make it better"_). The bot instantly replies: _"Which part would you like to improve, or do you want to rebuild the entire course from scratch?"_

**2. Alternative Approaches Considered & Rejected**

- _Diff Thresholding:_ Using the heavy LLM to generate surgical changes and falling back to full regeneration if >50% of the JSON changes. _Rejected:_ Wastes heavy LLM tokens and adds 10+ seconds of latency to failed attempts.

**3. Edge Cases**

- **Vocabulary vs. Scale:** User says _"Regenerate the typo in lesson 1"_. The classifier must be prompted to prioritize semantic _scale_ (LOCAL) over the user's vocabulary ("regenerate"), routing this to a surgical `FIELD_UPDATE`.

---

### Q2: How to implement ADD_LESSON / ADD_SECTION as surgical operations?

**1. Recommended Approach: Relational Anchoring + App-Side Sequencer**
The LLM must **never** manage application state like `lesson_number`, `section_number`, or array indices. LLMs are notoriously bad at sequential math and global array awareness.

Instead, the LLM emits an `InsertOperation` containing the raw content and a _relational anchor_ (`insertAfterId`). The backend application acts as a mathematical sequencer.

**2. Concrete Logic (Backend Sequencer)**

```typescript
function applyAddLesson(course: Course, op: AddLessonOp) {
  const section = course.sections.find(s => s.id === op.targetSectionId);

  // 1. Find placement
  const insertIdx = op.insertAfterId
    ? section.lessons.findIndex(l => l.id === op.insertAfterId) + 1
    : 0; // null means insert at the beginning

  // 2. Splice in new lesson with a freshly generated stable ID
  const realId = generateShortId('lsn');
  section.lessons.splice(insertIdx, 0, { id: realId, lesson_number: 0, ...op.payload });

  // 3. Deterministic sequential renumbering for the whole section
  section.lessons.forEach((lesson, idx) => {
    lesson.lesson_number = idx + 1;
  });
}
```

**3. Edge Cases**

- **Adding Multiple Items:** User says _"Add 3 lessons about X"_. The LLM emits an array of 3 `ADD_LESSON` operations. To allow the 2nd lesson to be inserted after the newly created 1st lesson, the LLM must generate a `tempId` (e.g., `tmp_1`) for new items. The backend maps `tmp_1` to the `realId` in memory during batch processing.
- **Cross-References Break:** If "Lesson 3" shifts to "Lesson 4", textual references break. _Fix:_ Update all LLM generation prompts to explicitly forbid absolute lesson numbers in text. (e.g., Enforce _"As discussed in the Introduction lesson"_ instead of _"In Lesson 1"_).

---

### Q3: Stable IDs vs Array Indices — Migration Strategy

**1. Recommended Approach: NanoIDs with Entity Prefixes**
Relying on JSON paths (`sections[0].lessons[2]`) guarantees race conditions. We must introduce stable IDs. Use **NanoID (8 chars)** with prefixes: `sec_A1b2C3d4` and `lsn_X9y8Z7w6`.

_Rationale:_ A 36-character UUIDv4 consumes ~10-12 tokens. In a 50-lesson course, UUIDs waste ~600 LLM context tokens _per request_. An 8-character base62 NanoID consumes ~2 tokens, saving thousands of tokens at scale while remaining collision-resistant within a single course.

**2. Migration Path (Zero-Downtime JIT Backfill)**
Implement a **Just-In-Time (JIT) Read-Repair**:

1. Update TypeScript schemas so `id` is required.
2. Add a middleware wrapper around your `getCourseStructure(id)` database query.
3. If the fetched JSON lacks an `id` on `sections[0]`, traverse the JSON in-memory and inject generated short IDs.
4. If IDs were injected, trigger a non-blocking background `UPDATE` to save the fixed JSON back to Supabase.
5. _(Optional)_ Run a one-off background Node script to backfill older courses.

---

### Q4: Operation Schema for LLM Output

**1. Recommended Approach: Discriminated Union AST**
Force the LLM (via OpenAI Structured Outputs / JSON Schema) to return an array of specific, atomic operations (an Abstract Syntax Tree of course mutations).

**2. Concrete Schema**

```typescript
type CourseOperation =
  | { type: 'UPDATE_FIELD'; targetId: string; field: string; newValue: unknown }
  | {
      type: 'ADD_LESSON';
      tempId: string; // Allows subsequent operations in this array to anchor to this
      targetSectionId: string;
      insertAfterId: string | null; // null = insert at top of section
      payload: Omit<Lesson, 'id' | 'lesson_number'>;
    }
  | {
      type: 'ADD_SECTION';
      tempId: string;
      insertAfterId: string | null;
      payload: Omit<Section, 'id' | 'section_number' | 'lessons'> & {
        lessons: Omit<Lesson, 'id' | 'lesson_number'>[];
      };
    }
  | { type: 'DELETE_ELEMENT'; targetId: string }
  | { type: 'MOVE_ELEMENT'; targetId: string; newParentId?: string; insertAfterId: string | null };

interface LLMResponse {
  rationale: string; // Forces Chain-of-Thought BEFORE outputting operations
  operations: CourseOperation[];
}
```

---

### Q5: Model Configuration — Database-Only Design

**1. Recommended Approach: Stale-While-Revalidate Cache + Strict Bootstrapping**
To eliminate hardcoded strings while maximizing uptime, use an in-memory TTL Cache backed by a strict DB schema.

**2. Database Schema & Fallback Chain**

```sql
CREATE TABLE llm_model_config (
  phase_name VARCHAR(50) PRIMARY KEY,
  model_id VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  fallback_phase_name VARCHAR(50) REFERENCES llm_model_config(phase_name)
  -- Self-referencing FK ensures referential integrity
);

```

**3. Execution Logic & Edge Cases**

- **In-Memory TTL:** Cache configs for 5 minutes.
- **Stale-While-Revalidate:** If TTL expires, return the stale config instantly to the user, while refreshing from the DB in the background.
- **DB Outage:** If the DB query fails, catch the error and keep returning the stale cache indefinitely.
- **Cold Start (DB Empty/Down on boot):** The application _blocks startup_ or throws a HTTP 503. **Do not hallucinate a fallback to `mimo-v2-flash`.** Bypassing configs masks infrastructure failures, ruins output quality, and bypasses cost controls.
- **Deployment:** The `global_default` row must be guaranteed to exist via Supabase deployment migrations (SQL seed files).

---

### Q6: The Complete Request Flow (End-to-End Trace)

_User types: "Add a lesson about myths after lesson 2 in section 1"_

1. **Frontend Sends:** `POST /api/chat` with `courseId`, `message`, and `baseVersion: 5` (for optimistic locking).
2. **Hydration:** Backend fetches `course_structure`. (Runs JIT ID backfill if needed).
3. **Context Assembly:** Backend minifies the JSON into a "Skeleton" (stripping descriptions/large text, keeping only IDs, titles, and structure) to save tokens.
4. **Intent Classification:** Fast model evaluates Prompt + Skeleton. Returns `{ intent: "ADD_ELEMENT" }`.
5. **LLM Execution:** Route to Surgical Handler. Load `chat_stage_5_refinement` from Cache. Call DeepSeek/Kimi with JSON Schema and skeleton.
6. **LLM Outputs:** `[{ type: "ADD_LESSON", targetSectionId: "sec_abc", insertAfterId: "lsn_xyz", payload: {...} }]`.
7. **Backend Validation:** Zod validates the schema. Backend verifies that `sec_abc` and `lsn_xyz` actually exist in the current DB state.
8. **Create Proposal:** App maps the operation to a `ChatProposal` record (Status: PENDING), applying the sequencer math in-memory to generate a visual diff.
9. **Frontend Render:** User sees a UI card: _"✨ Proposed Addition: Common Myths"_. User clicks Approve.
10. **Apply & Persist (Optimistic Lock):**

```sql
UPDATE courses SET course_structure = $1, version = version + 1
WHERE id = $2 AND version = 5;

```

11. **Confirmation:** If 1 row is updated, return success. Stage 6 worker is pinged asynchronously to generate markdown for the new stable `lsn_` ID.

---

### Q7: Edge Cases and Error Handling

- **Concurrency (Two admins editing simultaneously):**
  Handled by the `version` integer in Step 10. Admin A deletes Section 1 -> DB becomes `version 6`. Admin B accepts a proposal to add a lesson based on `version 5`. The `WHERE version = 5` update hits 0 rows. Backend throws `409 Conflict`, UI tells Admin B: _"Course updated by another user. Please refresh and try again."_
- **Ambiguous Bulk Request ("Make the course shorter"):**
  The Intent Classifier maps this to `SURGICAL_EDIT`. The LLM naturally handles this by outputting an array of `UPDATE_FIELD` operations (reducing `estimated_duration_minutes` across all lessons) and `DELETE_ELEMENT` ops for fluff lessons. The user safely reviews the exact diff.
- **LLM Hallucinates Non-Existent IDs:**
  Caught at Step 7. If the LLM anchors to `insertAfterId: "lsn_fake_99"`, validation fails. The backend intercepts this, appends a system prompt: _"Error: ID lsn_fake_99 does not exist. Valid IDs: [...]"_ and triggers **one rapid, silent retry** to the LLM. If it fails twice, return a graceful error to the user.
- **Unspecified Location ("Add a lesson about myths"):**
  Do not pause to clarify. The system prompt instructs the LLM: _"If a specific placement is not requested, analyze the course flow and select the most semantically logical `insertAfterId`."_ The user gets to review the placement in the Proposal UI anyway.
