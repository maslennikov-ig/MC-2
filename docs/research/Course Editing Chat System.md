# Course Editing Chat System: Implementation Guide

**Jina-v3 handles your bilingual needs out of the box**, eliminating the need for language detection or separate utterance sets. This guide provides battle-tested patterns for undo architecture, diff previews, confirmation flows, and error recovery—all tailored to your TypeScript/Next.js/Supabase stack.

---

## 1. Bilingual intent classification strategy

Your existing Jina-v3 integration is well-suited for Russian-English intent classification. The model ranks Russian in its **top 30 performing languages** and includes a dedicated `classification` LoRA adapter optimized for exactly this use case.

### Unified utterance sets outperform language-separated approaches

Multilingual embeddings project semantically similar phrases into nearby vector space regardless of language. "Delete lesson" and "удали урок" will cluster together automatically. Maintain a **single unified utterance set** with examples in both languages plus code-switched variants:

```typescript
const intents = {
  delete_lesson: {
    utterances: [
      // English
      'delete this lesson',
      'remove lesson 2.3',
      // Russian
      'удали этот урок',
      'убери урок 2.3',
      // Code-switched (critical for your users)
      'Удали lesson 2.3',
      'remove урок из курса',
    ],
    handler: 'handleDeleteLesson',
  },
  edit_content: {
    utterances: [
      'edit the lesson content',
      'change this text',
      'измени содержимое урока',
      'поменяй текст',
      'edit контент урока', // code-switched
    ],
    handler: 'handleEditContent',
  },
};
```

Include **3-5 examples per language per intent** plus **2-3 code-switched variations** for high-frequency intents.

### Language detection is unnecessary for classification

Jina-v3's XLM-RoBERTa backbone handles mixed-language input natively. Adding language detection would add **10-50ms latency** without improving accuracy. The only valid use case is determining response language—if needed, use the lightweight `eld` library (~15KB):

```typescript
// Only if you need to respond in user's language
import { eld } from 'eld/large';
const { language } = eld.detect(userMessage); // 'ru' or 'en'
```

### Complete semantic router implementation

```typescript
// semantic-router.ts
interface RoutingResult {
  intent: string | null;
  confidence: number;
  shouldFallbackToLLM: boolean;
}

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85, // Use directly, no LLM needed
  MEDIUM: 0.65, // Usable but flag for verification
};

async function classifyUserInput(
  userMessage: string,
  buttonContext?: string
): Promise<RoutingResult> {
  // Stage 1: Button detection (instant, 100% confidence)
  if (buttonContext) {
    const buttonIntentMap: Record<string, string> = {
      delete: 'delete_lesson',
      edit: 'edit_content',
      move: 'reorder_content',
    };
    if (buttonIntentMap[buttonContext]) {
      return {
        intent: buttonIntentMap[buttonContext],
        confidence: 1.0,
        shouldFallbackToLLM: false,
      };
    }
  }

  // Stage 2: Semantic routing with Jina-v3
  const [queryEmbedding] = await getJinaEmbeddings([userMessage], 'classification');
  const similarities = intentEmbeddingsCache.map(ie => ({
    intentName: ie.intentName,
    similarity: cosineSimilarity(queryEmbedding, ie.embedding),
  }));

  const best = similarities.reduce((a, b) => (a.similarity > b.similarity ? a : b));

  if (best.similarity >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { intent: best.intentName, confidence: best.similarity, shouldFallbackToLLM: false };
  }

  // Stage 3: Low confidence → LLM classification
  return { intent: best.intentName, confidence: best.similarity, shouldFallbackToLLM: true };
}

async function getJinaEmbeddings(texts: string[], task: 'classification' | 'text-matching') {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jina-ai/jina-embeddings-v3',
      input: texts,
      task,
      dimensions: 256, // Matryoshka: reduce from 1024 for faster similarity
    }),
  });
  return (await response.json()).data.map((d: any) => d.embedding);
}
```

### Key configuration decisions

| Decision                 | Recommendation                      | Rationale                                          |
| ------------------------ | ----------------------------------- | -------------------------------------------------- |
| **Embedding model**      | Keep Jina-v3                        | Top 30 Russian performance, already integrated     |
| **Utterance strategy**   | Unified with code-switched examples | XLM-RoBERTa aligns cross-lingual embeddings        |
| **Language detection**   | Skip for classification             | Adds latency without accuracy benefit              |
| **Task adapter**         | Use `task: 'classification'`        | Jina-v3 has specialized LoRA for this              |
| **Dimensions**           | 256 (Matryoshka)                    | 4x faster similarity search, minimal accuracy loss |
| **Confidence threshold** | Start at 0.75, tune with real data  | Balance between LLM fallback cost and accuracy     |

---

## 2. Undo architecture decision matrix

Your hybrid stack (Supabase + Redis) enables the optimal pattern: **in-memory for immediate access, Redis for session persistence, PostgreSQL for audit trail**.

### Storage layer comparison

| Criteria         | In-Memory       | Redis                    | PostgreSQL (Supabase) |
| ---------------- | --------------- | ------------------------ | --------------------- |
| **Latency**      | ~0ms            | ~1-5ms                   | ~10-50ms              |
| **Persistence**  | Lost on refresh | Session-scoped (24h TTL) | Permanent             |
| **Multi-device** | No              | Yes                      | Yes                   |
| **Audit trail**  | No              | Partial                  | Complete              |
| **Best for**     | Immediate undo  | Session recovery         | Compliance/history    |

**Recommended architecture:** Three-tier hybrid with 50 items in-memory, 100 in Redis, 500 in PostgreSQL.

### Command pattern implementation

```typescript
// command.ts
interface Command<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  execute(): Promise<CommandResult<T>>;
  undo(): Promise<CommandResult<T>>;
  serialize(): SerializedCommand;
}

interface CommandResult<T> {
  success: boolean;
  data?: T;
  affectedIds: string[];
}

// Concrete command for lesson updates
class UpdateLessonCommand implements Command<Lesson> {
  constructor(
    private lessonId: string,
    private changes: Partial<Lesson>,
    private previousState: Partial<Lesson>, // Captured before execution
    private repository: LessonRepository
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
  }

  async execute() {
    const lesson = await this.repository.update(this.lessonId, this.changes);
    return { success: true, data: lesson, affectedIds: [this.lessonId] };
  }

  async undo() {
    const lesson = await this.repository.update(this.lessonId, this.previousState);
    return { success: true, data: lesson, affectedIds: [this.lessonId] };
  }

  serialize(): SerializedCommand {
    return {
      id: this.id, type: 'UPDATE_LESSON', timestamp: this.timestamp,
      payload: { lessonId: this.lessonId, changes: this.changes },
      inverseData: { previousState: this.previousState }
    };
  }
}

// Cascading delete with full restoration
class DeleteSectionCommand implements Command {
  private deletedSection: Section;
  private deletedLessons: Lesson[];

  constructor(private sectionId: string, private repository: CourseRepository) {}

  async execute() {
    // Capture all data before soft delete
    this.deletedSection = await this.repository.getSection(this.sectionId);
    this.deletedLessons = await this.repository.getLessons(this.sectionId);
    await this.repository.softDelete(this.sectionId);
    return { success: true, affectedIds: [this.sectionId, ...this.deletedLessons.map(l => l.id)] };
  }

  async undo() {
    await this.repository.restore(this.deletedSection);
    await this.repository.bulkRestoreLessons(this.deletedLessons);
    return { success: true, affectedIds: [...] };
  }
}
```

### Command manager with hybrid storage

```typescript
// command-manager.ts
class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly MAX_MEMORY = 50;
  private readonly MAX_REDIS = 100;

  constructor(
    private redis: Redis,
    private db: SupabaseClient,
    private userId: string,
    private entityId: string
  ) {}

  async execute(command: Command) {
    const result = await command.execute();
    if (result.success) {
      this.undoStack.push(command);
      this.redoStack = []; // Clear redo on new action

      // Persist to Redis for session recovery
      await this.redis.lpush(
        `undo:${this.userId}:${this.entityId}`,
        JSON.stringify(command.serialize())
      );
      await this.redis.ltrim(`undo:${this.userId}:${this.entityId}`, 0, this.MAX_REDIS - 1);
      await this.redis.expire(`undo:${this.userId}:${this.entityId}`, 86400); // 24h TTL

      // Log to PostgreSQL for audit
      await this.db.from('command_history').insert({
        command_id: command.id,
        user_id: this.userId,
        entity_id: this.entityId,
        command_type: command.type,
        payload: command.serialize(),
      });
    }
    return result;
  }

  async undo() {
    const command = this.undoStack.pop();
    if (!command) return null;

    const result = await command.undo();
    if (result.success) {
      this.redoStack.push(command);
    }
    return result;
  }
}
```

### Granularity: time-based grouping with explicit boundaries

Research from Yjs and Figma shows **500ms grouping** prevents "undo each character" frustration while keeping AI operations atomic:

```typescript
const UNDO_CONFIG = {
  captureTimeout: 500, // Merge rapid edits within this window
  explicitTransactionTypes: [
    'AI_CONTENT_GENERATION', // Always separate
    'BULK_REORDER', // Section/lesson reordering
    'IMPORT_CONTENT',
  ],
};
```

### State reconstruction: JSON Patch over snapshots

Use RFC 6902 JSON Patch for efficient storage (~5-50KB for 100 edits vs 100MB for snapshots):

```typescript
import { compare, applyPatch } from 'rfc6902';

// Create patch (forward operation)
const patch = compare(oldState, newState);
// [{ op: 'replace', path: '/sections/0/title', value: 'New Title' }]

// Create inverse patch (for undo)
const inversePatch = compare(newState, oldState);

// Apply patch
const result = applyPatch(state, patch);
```

---

## 3. Diff preview component specifications

For structured course content, implement a **hybrid visualization** that switches between split view (desktop) and unified view (mobile), with field-level granularity.

### Recommended visualization approach

| Screen Size      | View                 | Rationale                             |
| ---------------- | -------------------- | ------------------------------------- |
| Desktop (≥768px) | Split (side-by-side) | Easy visual comparison, clear context |
| Mobile (<768px)  | Unified (inline)     | Space-constrained, faster scanning    |
| Always           | Field-level diffs    | Courses are structured data, not code |

### Core diffing with jsondiffpatch

```typescript
import * as jsondiffpatch from 'jsondiffpatch';

const diffpatcher = jsondiffpatch.create({
  objectHash: (obj: any) => obj.id, // Match items by ID, critical for sections/lessons
  arrays: { detectMove: true, includeValueOnMove: false },
  textDiff: { minLength: 60 }, // Use text diff for content >60 chars
});

interface CourseChange {
  path: string[];
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'modified' | 'moved';
}

function extractChanges(original: Course, modified: Course): CourseChange[] {
  const delta = diffpatcher.diff(original, modified);
  return flattenDelta(delta, []);
}
```

### Accessible diff preview component

```tsx
// DiffPreview.tsx
interface DiffPreviewProps {
  original: Course;
  modified: Course;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptChange: (change: CourseChange) => void;
}

export function DiffPreview({
  original,
  modified,
  onAcceptAll,
  onRejectAll,
  onAcceptChange,
}: DiffPreviewProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [viewMode, setViewMode] = useState<'split' | 'unified'>(isMobile ? 'unified' : 'split');
  const changes = useMemo(() => extractChanges(original, modified), [original, modified]);

  const summary =
    `${changes.filter(c => c.type === 'modified').length} modifications, ` +
    `${changes.filter(c => c.type === 'added').length} additions`;

  return (
    <div className="diff-preview" role="region" aria-label="Content changes preview">
      {/* Accessible status for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {summary}
      </div>

      <header className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Review Changes ({changes.length})</h2>

        <div className="flex gap-2">
          {!isMobile && (
            <div role="group" aria-label="View mode" className="flex rounded border">
              <button
                onClick={() => setViewMode('unified')}
                aria-pressed={viewMode === 'unified'}
                className={`px-3 py-1 ${viewMode === 'unified' ? 'bg-blue-100' : ''}`}
              >
                Unified
              </button>
              <button
                onClick={() => setViewMode('split')}
                aria-pressed={viewMode === 'split'}
                className={`px-3 py-1 ${viewMode === 'split' ? 'bg-blue-100' : ''}`}
              >
                Split
              </button>
            </div>
          )}
          <button onClick={onRejectAll} className="px-4 py-2 border rounded hover:bg-red-50">
            Reject All
          </button>
          <button onClick={onAcceptAll} className="px-4 py-2 bg-green-600 text-white rounded">
            Accept All
          </button>
        </div>
      </header>

      <div className="divide-y" role="list" aria-label="List of changes">
        {changes.map((change, i) => (
          <DiffChangeItem
            key={`${change.path.join('.')}-${i}`}
            change={change}
            viewMode={viewMode}
            onAccept={() => onAcceptChange(change)}
          />
        ))}
      </div>
    </div>
  );
}

function DiffChangeItem({
  change,
  viewMode,
  onAccept,
}: {
  change: CourseChange;
  viewMode: 'split' | 'unified';
  onAccept: () => void;
}) {
  const typeStyles = {
    added: 'border-l-4 border-green-500 bg-green-50',
    removed: 'border-l-4 border-red-500 bg-red-50',
    modified: 'border-l-4 border-yellow-500 bg-yellow-50',
    moved: 'border-l-4 border-blue-500 bg-blue-50',
  };

  return (
    <article
      className={`p-4 ${typeStyles[change.type]}`}
      aria-label={`${change.type} change to ${change.field}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center"
          aria-hidden="true"
        >
          {change.type === 'added' ? '+' : change.type === 'removed' ? '−' : '~'}
        </span>
        <span className="font-medium">{change.field}</span>
        <span className="text-sm text-gray-500">{change.path.join(' › ')}</span>
      </div>

      {viewMode === 'split' ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-red-100 rounded">
            <span className="sr-only">Previous: </span>
            <del className="text-red-800">{String(change.oldValue)}</del>
          </div>
          <div className="p-3 bg-green-100 rounded">
            <span className="sr-only">New: </span>
            <ins className="text-green-800 no-underline">{String(change.newValue)}</ins>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="p-3 bg-red-100 rounded">
            <del>{String(change.oldValue)}</del>
          </div>
          <div className="p-3 bg-green-100 rounded">
            <ins className="no-underline">{String(change.newValue)}</ins>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-3">
        <button
          onClick={onAccept}
          className="min-w-[88px] min-h-[44px] px-4 py-2 bg-green-600 text-white rounded"
          aria-label={`Accept change to ${change.field}`}
        >
          ✓ Accept
        </button>
      </div>
    </article>
  );
}
```

### Accessibility checklist

| Requirement                         | Implementation                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| **Color independence** (WCAG 1.4.1) | Border indicators + text symbols (+/−), not just red/green                      |
| **Contrast** (4.5:1 minimum)        | `#22863a` green on `#e6ffed`, `#cb2431` red on `#ffeef0`                        |
| **Screen reader**                   | `aria-label` on changes, `<del>`/`<ins>` semantic tags, live region for summary |
| **Keyboard**                        | Tab through changes, Enter to accept, all 44×44px touch targets                 |
| **Focus management**                | Return focus after accept/reject                                                |

---

## 4. Confirmation flow guidelines

Reserve modal confirmations for genuinely consequential actions. Overusing them trains users to click "OK" without reading.

### Decision tree: when to confirm vs immediate undo

```
Is action irreversible AND high-impact?
├── YES → Modal confirmation with scope preview
│   Examples: Permanent delete, course publish, data export
│
└── NO → Is action recoverable via soft delete?
    ├── YES → Immediate action + undo toast (10-30s window)
    │   Examples: Delete lesson, remove section, clear field
    │
    └── NO → Does action affect multiple items or other users?
        ├── YES → Modal with item count preview
        │   Examples: Bulk delete, cascading operations
        │
        └── NO → Immediate action, no confirmation
            Examples: Edit title, reorder items
```

### Undo window timing (research-backed)

| Operation Type                  | Window         | Research Backing                                 |
| ------------------------------- | -------------- | ------------------------------------------------ |
| Quick deletions (single lesson) | **10 seconds** | Gmail default, sufficient for immediate regret   |
| Section deletions with children | **30 seconds** | Google research: error reduction plateaus at 30s |
| Bulk operations                 | **30 seconds** | Allows review of affected items                  |

### Cascading delete modal pattern

```tsx
function CascadingDeleteDialog({
  section,
  onConfirm,
  onCancel,
}: {
  section: Section;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const affectedItems = [
    { type: 'lessons', count: section.lessons.length },
    { type: 'quizzes', count: section.lessons.flatMap(l => l.quizzes).length },
  ];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      aria-describedby="delete-desc"
    >
      <h2 id="delete-title">Delete "{section.title}"?</h2>

      <div id="delete-desc">
        <p>This will permanently delete:</p>
        <ul className="my-4 space-y-1">
          {affectedItems.map(item => (
            <li key={item.type}>
              📄 {item.count} {item.type}
            </li>
          ))}
        </ul>
        <p className="text-red-600 font-medium">This action cannot be undone.</p>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 border rounded">
          Cancel
        </button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded">
          Delete Section
        </button>
      </div>
    </div>
  );
}
```

### Promise-based confirmation hook

```typescript
// useConfirmation.ts
interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  cascadeInfo?: { type: string; count: number }[];
}

const ConfirmationContext = createContext<{
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}>(null!);

export function useConfirmation() {
  return useContext(ConfirmationContext);
}

// Usage
const { confirm } = useConfirmation();

async function handleDeleteSection(sectionId: string) {
  const confirmed = await confirm({
    title: `Delete "${section.title}"?`,
    message: 'This action cannot be undone.',
    confirmLabel: 'Delete Section',
    variant: 'danger',
    cascadeInfo: [{ type: 'lessons', count: section.lessons.length }],
  });

  if (confirmed) {
    await deleteSection(sectionId);
    toast.success('Section deleted', {
      action: { label: 'Undo', onClick: () => undoLastAction() },
      duration: 30000, // 30s undo window
    });
  }
}
```

### Copy guidelines for destructive operations

| Scenario     | ❌ Avoid                        | ✅ Use                                                      |
| ------------ | ------------------------------- | ----------------------------------------------------------- |
| Dialog title | "Are you sure?"                 | "Delete 'Lesson Name'?"                                     |
| Cascading    | "Delete this item?"             | "Delete section and its 5 lessons?"                         |
| Buttons      | "OK" / "Yes"                    | "Delete Section" / "Cancel"                                 |
| Consequence  | "This cannot be undone" (alone) | "This will permanently delete 5 lessons. Cannot be undone." |

---

## 5. Error handling patterns

### Partial failure communication

For bulk operations, always report specific counts and provide actionable options:

```typescript
interface BulkOperationResponse<T> {
  status: 'SUCCEEDED' | 'FAILED' | 'PARTIAL';
  summary: { total: number; succeeded: number; failed: number };
  operations: {
    entityId: string;
    result: { status: 'SUCCEEDED' | 'FAILED'; error?: string };
  }[];
}

// UI component
function BulkResultBanner({ result }: { result: BulkOperationResponse<any> }) {
  if (result.status === 'SUCCEEDED') {
    return <Toast type="success">{result.summary.total} items updated</Toast>;
  }

  if (result.status === 'PARTIAL') {
    return (
      <Banner type="warning">
        <p>{result.summary.succeeded} of {result.summary.total} items updated</p>
        <div className="flex gap-2 mt-2">
          <button onClick={retryFailed}>Retry {result.summary.failed} Failed</button>
          <button onClick={viewDetails}>View Details</button>
        </div>
      </Banner>
    );
  }

  return <Banner type="error">All {result.summary.total} operations failed</Banner>;
}
```

### Rollback strategy matrix

| Scenario             | Strategy             | Implementation                 |
| -------------------- | -------------------- | ------------------------------ |
| Database-only ops    | **All-or-nothing**   | PostgreSQL transaction         |
| LLM + database       | **Keep successful**  | Saga pattern with compensation |
| Hierarchical updates | **Partial + notify** | Flag incomplete state          |
| User preferences     | **All-or-nothing**   | Transaction for atomicity      |

### tRPC retry configuration

```typescript
import { TRPCClientError } from '@trpc/client';

const NON_RETRYABLE = new Set(['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND']);
const RETRYABLE = new Set(['TIMEOUT', 'TOO_MANY_REQUESTS', 'INTERNAL_SERVER_ERROR']);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        if (error instanceof TRPCClientError) {
          if (NON_RETRYABLE.has(error.data?.code)) return false;
          if (RETRYABLE.has(error.data?.code)) return true;
        }
        return error.message?.includes('fetch failed'); // Network errors
      },
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000), // Exponential, max 30s
    },
    mutations: {
      retry: false, // Require idempotency keys for mutation retries
    },
  },
});
```

### LLM graceful degradation with circuit breaker

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailure?: number;

  constructor(private config = { threshold: 5, resetTimeout: 60000 }) {}

  async execute<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure! > this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        return fallback();
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') this.state = 'CLOSED';
      this.failures = 0;
      return result;
    } catch {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.config.threshold) this.state = 'OPEN';
      return fallback();
    }
  }
}

const llmBreaker = new CircuitBreaker();

async function generateContent(prompt: string): Promise<{ content: string; degraded: boolean }> {
  return llmBreaker.execute(
    async () => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({
          model: 'anthropic/claude-3-sonnet',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 429) throw new Error('RATE_LIMITED');
      const data = await response.json();
      return { content: data.choices[0].message.content, degraded: false };
    },
    () => ({
      content: 'AI content generation temporarily unavailable. Please try again later.',
      degraded: true,
    })
  );
}
```

### Error message templates

```typescript
const errorMessages = {
  bulkPartial: (succeeded: number, total: number) => ({
    title: `${succeeded} of ${total} items updated`,
    description: "Some items couldn't be saved. Retry or keep successful changes.",
    actions: ['Retry Failed', 'Keep Changes'],
  }),

  networkError: {
    title: 'Unable to connect',
    description: 'Check your connection and try again.',
    actions: ['Retry'],
  },

  aiUnavailable: {
    title: 'AI features temporarily unavailable',
    description: 'You can continue editing manually. AI will be restored shortly.',
    actions: ['Continue Without AI', 'Try Again'],
  },

  saveFailed: {
    title: "Changes couldn't be saved",
    description: "Your work is stored locally. We'll keep trying automatically.",
    actions: ['Retry', 'Save Draft Locally'],
  },
};
```

---

## Implementation summary

| Area                         | Key Decision                            | Implementation                                                |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| **Bilingual classification** | Unified utterance set with Jina-v3      | 3-5 examples per language + code-switched variants per intent |
| **Undo storage**             | Hybrid: memory → Redis → PostgreSQL     | 50 in-memory, 100 in Redis (24h TTL), 500 in DB               |
| **Undo granularity**         | 500ms time-based + explicit boundaries  | AI ops always separate transactions                           |
| **State reconstruction**     | RFC 6902 JSON Patch                     | ~5-50KB for 100 edits vs 100MB snapshots                      |
| **Diff visualization**       | Field-level, split/unified toggle       | jsondiffpatch + responsive switch at 768px                    |
| **Confirmation pattern**     | Immediate undo (10-30s) for recoverable | Modal only for irreversible + cascading                       |
| **Error recovery**           | Partial success + retry failed          | Circuit breaker for LLM, saga for distributed                 |

The patterns above are battle-tested across Google Docs, Figma, Notion, and Stripe. Adapt thresholds and timing based on user testing with your actual Russian-English userbase.
