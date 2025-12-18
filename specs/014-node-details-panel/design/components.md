# Node Details Panel - Component Structure

## Overview

This document defines the component architecture for the refactored Node Details Panel, transforming it from a narrow Sheet to a full-screen modal with improved readability, dark theme support, and professional JSON visualization.

## Component Hierarchy

```
NodeDetailsModal (root)
├── ModalOverlay
├── ModalContainer
│   ├── ModalHeader
│   │   ├── NodeIcon (dynamic based on node type)
│   │   ├── NodeTitle
│   │   ├── StatusBadge
│   │   └── CloseButton
│   ├── ModalBody
│   │   ├── AttemptSelector (conditional)
│   │   ├── ApprovalControls (conditional)
│   │   ├── TabNavigation
│   │   │   ├── TabButton (Input)
│   │   │   ├── TabButton (Process)
│   │   │   ├── TabButton (Output)
│   │   │   └── TabButton (Activity)
│   │   └── TabContent
│   │       ├── InputPanel
│   │       │   └── JsonViewer
│   │       ├── ProcessPanel
│   │       │   └── MetricsGrid
│   │       ├── OutputPanel
│   │       │   └── JsonViewer
│   │       └── ActivityPanel
│   │           └── ActivityLog
│   └── ModalFooter (conditional - AI stages only)
│       └── RefinementChat
│           ├── ChatHistory
│           ├── QuickActions
│           └── ChatInput
```

## Core Components

### 1. NodeDetailsModal

**Purpose**: Root component that manages modal state and provides context to child components.

**Props**:
```typescript
interface NodeDetailsModalProps {
  /** Currently selected node ID (null when closed) */
  selectedNodeId: string | null;
  /** Callback to close the modal */
  onClose: () => void;
  /** Course ID for refinement operations */
  courseId: string;
}
```

**State Management**:
```typescript
interface NodeDetailsState {
  /** Currently selected attempt number */
  selectedAttemptNum: number | null;
  /** Active tab (input, process, output, activity) */
  activeTab: 'input' | 'process' | 'output' | 'activity';
  /** Whether refinement chat is expanded */
  isChatExpanded: boolean;
}
```

**Behavior**:
- Opens when `selectedNodeId` is not null
- Closes on overlay click, escape key, or close button
- Resets state when node changes
- Manages keyboard shortcuts (Escape, Tab navigation)

---

### 2. ModalHeader

**Purpose**: Display node metadata and controls.

**Structure**:
```tsx
<header className="modal-header">
  <div className="header-left">
    <NodeIcon type={nodeType} status={nodeStatus} />
    <div className="header-text">
      <h2 className="node-title">{nodeLabel}</h2>
      <p className="node-subtitle">{nodeType} · Stage {stageNumber}</p>
    </div>
  </div>
  <div className="header-right">
    <StatusBadge status={nodeStatus} />
    <CloseButton onClick={onClose} />
  </div>
</header>
```

**Props**:
```typescript
interface ModalHeaderProps {
  /** Node type (stage, merge, document, lesson, module, end) */
  nodeType: string;
  /** Node display label */
  nodeLabel: string;
  /** Stage number (1-6) */
  stageNumber?: number;
  /** Current node status */
  nodeStatus: 'pending' | 'running' | 'completed' | 'error' | 'awaiting';
  /** Close callback */
  onClose: () => void;
}
```

**Styling**:
- Fixed height: 72px
- Border bottom: 1px solid border color
- Sticky positioning (remains visible on scroll)
- Flex layout with space-between

---

### 3. TabNavigation

**Purpose**: Switch between different data views (Input, Process, Output, Activity).

**Desktop Layout (≥1024px)**:
```
┌────────────────────────────────────────────┐
│  Input    Process    Output    Activity    │
└────────────────────────────────────────────┘
```

**Mobile Layout (<768px)**:
- Full-width buttons stacked vertically
- Active tab highlighted with accent color
- Smooth transition on tab change

**Props**:
```typescript
interface TabNavigationProps {
  /** Currently active tab */
  activeTab: 'input' | 'process' | 'output' | 'activity';
  /** Tab change callback */
  onTabChange: (tab: string) => void;
  /** Badge counts for each tab (optional) */
  badges?: {
    input?: number;
    process?: number;
    output?: number;
    activity?: number;
  };
}
```

**Accessibility**:
- ARIA role="tablist" on container
- ARIA role="tab" on each button
- aria-selected on active tab
- Keyboard navigation (Arrow keys to switch tabs)

---

### 4. JsonViewer

**Purpose**: Display JSON data with syntax highlighting, collapsible sections, and copy functionality.

**Features**:
- Syntax highlighting (keywords, strings, numbers, booleans, null, brackets)
- Collapsible nested objects/arrays
- Line numbers
- Copy to clipboard button
- Search/filter (Ctrl+F)
- Expand/collapse all toggle

**Props**:
```typescript
interface JsonViewerProps {
  /** JSON data to display */
  data: unknown;
  /** Optional title */
  title?: string;
  /** Maximum height before scrolling */
  maxHeight?: string;
  /** Whether to expand all by default */
  defaultExpanded?: boolean;
  /** Optional custom theme overrides */
  theme?: {
    background?: string;
    text?: string;
    keyword?: string;
    string?: string;
    number?: string;
    boolean?: string;
    null?: string;
  };
}
```

**Implementation**:
```tsx
<div className="json-viewer">
  <div className="json-viewer-header">
    <h3 className="json-viewer-title">{title}</h3>
    <div className="json-viewer-controls">
      <Button variant="ghost" size="sm" onClick={handleExpandAll}>
        <ChevronsDownUp className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  </div>
  <ScrollArea className="json-viewer-content" style={{ maxHeight }}>
    <div className="json-viewer-code">
      {renderJsonTree(data, 0)}
    </div>
  </ScrollArea>
</div>
```

**Syntax Highlighting Colors**:

Light Theme:
```css
--json-keyword: #0451a5;      /* Blue - for keys */
--json-string: #0a8200;       /* Green - for string values */
--json-number: #098658;       /* Teal - for numbers */
--json-boolean: #0000ff;      /* Blue - for true/false */
--json-null: #808080;         /* Gray - for null */
--json-bracket: #0000ff;      /* Blue - for {}, [], : */
```

Dark Theme:
```css
--json-keyword: #4fc1ff;      /* Light blue - for keys */
--json-string: #6cd38a;       /* Green - for string values */
--json-number: #4ec9b0;       /* Teal - for numbers */
--json-boolean: #569cd6;      /* Blue - for true/false */
--json-null: #9ca3af;         /* Gray - for null */
--json-bracket: #60a5fa;      /* Light blue - for {}, [], : */
```

---

### 5. MetricsGrid

**Purpose**: Display process metrics in an organized grid layout.

**Layout (Desktop)**:
```
┌──────────────┬──────────────┬──────────────┐
│   Duration   │    Tokens    │     Cost     │
│    245ms     │    1,240     │   $0.0023    │
├──────────────┼──────────────┼──────────────┤
│    Status    │   Attempt    │   Retries    │
│  Completed   │      2       │      1       │
└──────────────┴──────────────┴──────────────┘
```

**Props**:
```typescript
interface MetricsGridProps {
  /** Process duration in milliseconds */
  duration?: number;
  /** Token count */
  tokens?: number;
  /** Cost in USD */
  cost?: number;
  /** Current status */
  status?: string;
  /** Attempt number */
  attemptNumber?: number;
  /** Retry count */
  retryCount?: number;
  /** Additional custom metrics */
  customMetrics?: Array<{
    label: string;
    value: string | number;
    icon?: React.ReactNode;
  }>;
}
```

**Styling**:
- Grid with 3 columns on desktop (≥1024px)
- Grid with 2 columns on tablet (768px-1023px)
- Single column on mobile (<768px)
- Each cell has label (text-muted-foreground) and value (font-medium)
- Icons for common metrics (Clock, Zap, DollarSign, Activity)

---

### 6. RefinementChat

**Purpose**: AI-powered chat interface for refining stage outputs (stages 3, 4, 5, 6 only).

**Enhanced Features** (from existing implementation):
- Message history with user/assistant bubbles
- Quick action buttons
- Send button with loading state
- Auto-scroll to latest message
- Textarea with auto-resize

**Props** (existing):
```typescript
interface RefinementChatProps {
  courseId: string;
  stageId: string;
  nodeId?: string;
  attemptNumber: number;
  onRefine: (message: string) => void;
  history?: ChatMessage[];
  isProcessing?: boolean;
}
```

**Layout Changes**:
- Remove collapsible header (always expanded for AI stages)
- Move to modal footer (always visible)
- Fixed height: 320px for chat history, auto for input
- Sticky footer that doesn't scroll with content

---

## Responsive Layouts

### Desktop (≥1024px) - 3-Column Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Node Title · Status Badge · Close Button               │
├─────────────────────────────────────────────────────────────────┤
│  Attempt Selector (if multiple attempts)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┐                │
│  │  Input   │ Process  │  Output  │ Activity │                │
│  └──────────┴──────────┴──────────┴──────────┘                │
│                                                                  │
│  ┌─────────────┬─────────────┬─────────────┐                  │
│  │   INPUT     │   PROCESS   │   OUTPUT    │                  │
│  │             │             │             │                  │
│  │  JsonViewer │ MetricsGrid │ JsonViewer  │                  │
│  │             │             │             │                  │
│  │             │             │             │                  │
│  │             │             │             │                  │
│  └─────────────┴─────────────┴─────────────┘                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Footer: RefinementChat (AI stages only)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Tablet (768px-1023px) - 2-Column Layout

```
┌─────────────────────────────────────────────┐
│  Header                                     │
├─────────────────────────────────────────────┤
│  Tabs: Input | Process | Output | Activity │
├─────────────────────────────────────────────┤
│  ┌─────────────────┬──────────────────┐    │
│  │     INPUT       │    PROCESS       │    │
│  │                 │                  │    │
│  │   JsonViewer    │   MetricsGrid    │    │
│  │                 │                  │    │
│  └─────────────────┴──────────────────┘    │
│  ┌─────────────────────────────────────┐   │
│  │           OUTPUT                    │   │
│  │         JsonViewer                  │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  Footer: RefinementChat                     │
└─────────────────────────────────────────────┘
```

### Mobile (<768px) - Vertical Layout with Tabs

```
┌─────────────────────┐
│  Header             │
├─────────────────────┤
│  Tabs (stacked)     │
│  ┌─────────────┐    │
│  │   INPUT     │    │
│  │  PROCESS    │    │
│  │   OUTPUT    │    │
│  │  ACTIVITY   │    │
│  └─────────────┘    │
├─────────────────────┤
│  Active Tab Content │
│                     │
│    JsonViewer or    │
│    MetricsGrid      │
│                     │
├─────────────────────┤
│  RefinementChat     │
└─────────────────────┘
```

---

## Component File Structure

```
packages/web/components/generation-graph/panels/
├── NodeDetailsModal.tsx           # Root modal component
├── NodeDetailsModal.test.tsx      # Unit tests
├── ModalHeader.tsx                # Header with title, status, close
├── TabNavigation.tsx              # Tab switcher
├── TabContent.tsx                 # Tab panel container
├── JsonViewer.tsx                 # NEW: Syntax-highlighted JSON viewer
├── JsonViewer.test.tsx            # Unit tests for JsonViewer
├── MetricsGrid.tsx                # Process metrics display
├── InputPanel.tsx                 # Input tab content (uses JsonViewer)
├── ProcessPanel.tsx               # Process tab content (uses MetricsGrid)
├── OutputPanel.tsx                # Output tab content (uses JsonViewer)
├── ActivityPanel.tsx              # Activity tab content (existing)
├── RefinementChat.tsx             # EXISTING: AI chat interface
├── QuickActions.tsx               # EXISTING: Quick action buttons
└── AttemptSelector.tsx            # EXISTING: Attempt switcher
```

---

## State Management

### Local Component State

```typescript
// NodeDetailsModal.tsx
const [selectedAttemptNum, setSelectedAttemptNum] = useState<number | null>(null);
const [activeTab, setActiveTab] = useState<'input' | 'process' | 'output' | 'activity'>('output');
const [isChatExpanded, setIsChatExpanded] = useState(true); // Always true for AI stages

// JsonViewer.tsx
const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
const [searchTerm, setSearchTerm] = useState('');
const [copiedToClipboard, setCopiedToClipboard] = useState(false);
```

### Context (from existing useNodeSelection)

```typescript
const {
  selectedNodeId,        // Current node ID
  deselectNode,          // Close modal
  focusRefinement,       // Auto-focus chat
  clearRefinementFocus   // Clear focus state
} = useNodeSelection();
```

---

## Accessibility Requirements

### Keyboard Navigation

- **Escape**: Close modal
- **Tab**: Navigate between interactive elements
- **Arrow Keys**: Navigate tabs (when tab has focus)
- **Ctrl+F**: Focus search in JsonViewer
- **Ctrl+C**: Copy JSON in focused JsonViewer

### ARIA Attributes

```tsx
// Modal container
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  {/* Modal content */}
</div>

// Tab navigation
<div role="tablist" aria-label="Node data views">
  <button
    role="tab"
    aria-selected={activeTab === 'input'}
    aria-controls="input-panel"
    id="input-tab"
  >
    Input
  </button>
</div>

// Tab panel
<div
  role="tabpanel"
  id="input-panel"
  aria-labelledby="input-tab"
  hidden={activeTab !== 'input'}
>
  {/* Tab content */}
</div>
```

### Focus Management

- Trap focus within modal when open
- Return focus to triggering element (node) when closed
- Auto-focus close button on modal open
- Maintain focus on tab when switching tabs

---

## Performance Considerations

### Large JSON Rendering

For JSON objects with 1000+ keys:
- Use virtualization for large arrays (react-window or similar)
- Lazy render collapsed sections
- Debounce search input (300ms)
- Memoize syntax highlighting results

### Optimization Strategies

```typescript
// Memoize expensive computations
const syntaxHighlightedJson = useMemo(
  () => highlightJson(data),
  [data]
);

// Virtualize large lists
const VirtualizedJsonArray = memo(({ items }) => {
  return (
    <FixedSizeList
      height={400}
      itemCount={items.length}
      itemSize={24}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>{renderJsonItem(items[index])}</div>
      )}
    </FixedSizeList>
  );
});
```

---

## Error Handling

### Missing Data

```tsx
// Input panel with no data
{!inputData ? (
  <div className="empty-state">
    <FileQuestion className="w-12 h-12 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">No input data available</p>
  </div>
) : (
  <JsonViewer data={inputData} />
)}
```

### Invalid JSON

```tsx
// JsonViewer with parse error
try {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return <JsonTree data={parsed} />;
} catch (error) {
  return (
    <div className="error-state">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">Invalid JSON data</p>
      <pre className="text-xs font-mono">{error.message}</pre>
    </div>
  );
}
```

---

## Testing Requirements

### Unit Tests

1. **NodeDetailsModal**:
   - Opens when selectedNodeId is set
   - Closes when Escape is pressed
   - Closes when overlay is clicked
   - Resets state when node changes

2. **JsonViewer**:
   - Renders JSON correctly
   - Syntax highlighting applies correct colors
   - Collapsible sections toggle correctly
   - Copy button copies to clipboard
   - Search filters results

3. **TabNavigation**:
   - Switches tabs on click
   - Arrow keys navigate tabs
   - Active tab has correct ARIA attributes

### Integration Tests

1. Full modal flow:
   - Open modal → view tabs → refine via chat → close modal
2. Responsive layouts:
   - Test 3-column, 2-column, and vertical layouts
3. Keyboard navigation:
   - Tab through all interactive elements
   - Escape closes modal

---

## Migration from Sheet to Modal

### Breaking Changes

1. **Component name**: `NodeDetailsDrawer` → `NodeDetailsModal`
2. **Import path**: Same (internal change)
3. **Container width**: 400px-600px → Full screen
4. **Layout**: Single column → Multi-column (responsive)

### Backward Compatibility

- Keep same props interface (`selectedNodeId`, `onClose`)
- Maintain existing hooks (`useNodeSelection`, `useRefinement`)
- Preserve existing tab names and data structure

### Migration Steps

1. Create `NodeDetailsModal.tsx` alongside existing `NodeDetailsDrawer.tsx`
2. Implement new component with feature parity
3. Update `index.ts` to export new component
4. Update parent component to use new modal
5. Remove old drawer component after testing

---

## Future Enhancements

1. **Diff View**: Compare attempts side-by-side
2. **Export**: Download JSON as file
3. **Theme Customization**: User-selected syntax themes
4. **Graph Visualization**: For nested JSON structures
5. **Real-time Updates**: Live data streaming for active nodes
