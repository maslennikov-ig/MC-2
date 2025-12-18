# Node Details Panel - Visual Design Summary

Quick reference guide for visual design patterns and implementation examples.

---

## Color Palette

### Light Theme

```
BACKGROUNDS
┌─────────────────────────────────────┐
│ Primary:   #FFFFFF  (White)         │
│ Secondary: #F9FAFB  (Gray-50)       │
│ Tertiary:  #F3F4F6  (Gray-100)      │
└─────────────────────────────────────┘

TEXT
┌─────────────────────────────────────┐
│ Primary:   #111827  (Gray-900)      │
│ Secondary: #6B7280  (Gray-500)      │
│ Tertiary:  #9CA3AF  (Gray-400)      │
└─────────────────────────────────────┘

ACCENT
┌─────────────────────────────────────┐
│ Primary:   #3B82F6  (Blue-500)      │
│ Hover:     #2563EB  (Blue-600)      │
└─────────────────────────────────────┘

JSON SYNTAX
┌─────────────────────────────────────┐
│ Keywords:  #0451a5  (Blue)          │
│ Strings:   #0a8200  (Green)         │
│ Numbers:   #098658  (Teal)          │
│ Booleans:  #0000ff  (Blue)          │
│ Null:      #808080  (Gray)          │
│ Brackets:  #0000ff  (Blue)          │
└─────────────────────────────────────┘
```

### Dark Theme

```
BACKGROUNDS
┌─────────────────────────────────────┐
│ Primary:   #1F2937  (Gray-800)      │
│ Secondary: #111827  (Gray-900)      │
│ Tertiary:  #374151  (Gray-700)      │
└─────────────────────────────────────┘

TEXT
┌─────────────────────────────────────┐
│ Primary:   #F9FAFB  (Gray-50)       │
│ Secondary: #9CA3AF  (Gray-400)      │
│ Tertiary:  #6B7280  (Gray-500)      │
└─────────────────────────────────────┘

ACCENT
┌─────────────────────────────────────┐
│ Primary:   #60A5FA  (Blue-400)      │
│ Hover:     #3B82F6  (Blue-500)      │
└─────────────────────────────────────┘

JSON SYNTAX
┌─────────────────────────────────────┐
│ Keywords:  #4fc1ff  (Light Blue)    │
│ Strings:   #6cd38a  (Green)         │
│ Numbers:   #4ec9b0  (Teal)          │
│ Booleans:  #569cd6  (Blue)          │
│ Null:      #9ca3af  (Gray)          │
│ Brackets:  #60a5fa  (Light Blue)    │
└─────────────────────────────────────┘
```

---

## Layout Previews

### Mobile Layout (375px)

```
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ [📄] Document Proc │×┃  ← Header (64px)
┃ Stage 2 · Document  ┃
┣━━━━━━━━━━━━━━━━━━━━━┫
┃ Input  Process  Out ┃  ← Tabs (horizontal scroll)
┣━━━━━━━━━━━━━━━━━━━━━┫
┃                     ┃
┃  INPUT DATA         ┃
┃  ┌───────────────┐  ┃
┃  │ {             │  ┃
┃  │   "id": 123,  │  ┃
┃  │   "name": "…" │  ┃
┃  │ }             │  ┃
┃  └───────────────┘  ┃
┃                     ┃
┃  PROCESS METRICS    ┃
┃  ┌───────────────┐  ┃
┃  │ Duration: 245ms│ ┃
┃  │ Tokens: 1,240 │  ┃
┃  │ Status: Done  │  ┃
┃  └───────────────┘  ┃
┃                     ┃
┃  OUTPUT DATA        ┃
┃  ┌───────────────┐  ┃
┃  │ {             │  ┃
┃  │   "result": …│  ┃
┃  │ }             │  ┃
┃  └───────────────┘  ┃
┃                     ┃
┣━━━━━━━━━━━━━━━━━━━━━┫
┃ 💬 Chat             ┃  ← Footer (AI stages)
┃ [Message input...]  ┃
┗━━━━━━━━━━━━━━━━━━━━━┛
```

### Tablet Layout (768px)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [📄] Document Processing    [✓] │×   ┃  ← Header (72px)
┃      Stage 2 · Document Node       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ Input  Process  Output  Activity    ┃  ← Tabs
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                       ┃
┃  ┌─────────────────┬───────────────┐ ┃
┃  │  INPUT DATA     │ OUTPUT DATA   │ ┃
┃  │                 │               │ ┃
┃  │  {              │ {             │ ┃
┃  │    "id": 123,   │   "result": {│ ┃
┃  │    "name": "…"  │     "data": …│ ┃
┃  │  }              │   }           │ ┃
┃  │                 │ }             │ ┃
┃  └─────────────────┘               │ ┃
┃                                    │ ┃
┃  ┌─────────────────┐               │ ┃
┃  │ PROCESS METRICS │               │ ┃
┃  │                 │               │ ┃
┃  │ Duration: 245ms │               │ ┃
┃  │ Tokens: 1,240   │               │ ┃
┃  │ Status: Done    │               │ ┃
┃  └─────────────────┴───────────────┘ ┃
┃                                       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ 💬 Refinement Chat                    ┃
┃ [Message input field...        ] [▶]  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Desktop Layout (1440px)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [📄] Document Processing              [Completed ✓] │×             ┃  ← Header
┃      Stage 2 · Document Node                                       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ Input            Process          Output          Activity         ┃  ← Tabs
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                     ┃
┃  ┌───────────────┬───────────────┬───────────────┐                ┃
┃  │  INPUT DATA   │ PROCESS       │ OUTPUT DATA   │                ┃
┃  │               │               │               │                ┃
┃  │  {            │ Duration      │ {             │                ┃
┃  │    "id": 123, │   245ms       │   "result": { │                ┃
┃  │    "name": …  │               │     "data": …│                 ┃
┃  │    "file": …  │ Tokens        │     "meta": …│                 ┃
┃  │  }            │   1,240       │   }           │                ┃
┃  │               │               │ }             │                ┃
┃  │               │ Status        │               │                ┃
┃  │               │   Completed   │               │                ┃
┃  │               │               │               │                ┃
┃  │               │ ─────────────│               │                 ┃
┃  │               │               │               │                ┃
┃  │               │ ACTIVITY LOG  │               │                ┃
┃  │               │ ✓ Started     │               │                ┃
┃  │               │ ✓ Processed   │               │                ┃
┃  │               │ ✓ Completed   │               │                ┃
┃  └───────────────┴───────────────┴───────────────┘                ┃
┃                                                                     ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ 💬 Refinement Chat (AI Stage)                                      ┃
┃ ┌─────────────────────────────────────────────────────────────────┐┃
┃ │ [You] Make the output more concise                      12:34pm││┃
┃ │ [AI] Generated Attempt #2                               12:35pm││┃
┃ └─────────────────────────────────────────────────────────────────┘┃
┃ [Improve clarity] [Expand details] [Change tone]                   ┃
┃ [Type your message here...                              ] [Send ▶] ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## Component Examples

### Header Component

```tsx
// Visual structure
┌───────────────────────────────────────────────┐
│ [Icon] Title                    [Badge] [×]   │
│        Subtitle                               │
└───────────────────────────────────────────────┘

// Implementation
<header className="modal-header">
  <div className="modal-header-left">
    <FileText className="w-6 h-6 text-accent" />
    <div className="modal-header-text">
      <h2 className="modal-title">Document Processing</h2>
      <p className="modal-subtitle">Stage 2 · Document Node</p>
    </div>
  </div>
  <div className="modal-header-right">
    <StatusBadge status="completed" />
    <CloseButton onClick={onClose} />
  </div>
</header>
```

### Tab Navigation

```tsx
// Visual structure (Desktop)
┌─────────────────────────────────────────────┐
│ Input  │ Process │ Output  │ Activity       │
│   ▔▔▔▔                                      │
└─────────────────────────────────────────────┘

// Active indicator (underline)

// Implementation
<div className="tab-navigation">
  <button className="tab-button" data-state="active">
    Input
    <div className="active-indicator" />
  </button>
  <button className="tab-button">Process</button>
  <button className="tab-button">Output</button>
  <button className="tab-button">Activity</button>
</div>
```

### JSON Viewer

```tsx
// Visual structure
┌─────────────────────────────────────────────┐
│ Input Data                        [📋] [↕]  │  ← Header
├─────────────────────────────────────────────┤
│  1  {                                       │  ← Line numbers
│  2    "id": 123,                            │
│  3    "name": "example",                    │
│  4 ▶  "nested": {...},                      │  ← Collapsible
│  5    "array": [1, 2, 3]                    │
│  6  }                                       │
└─────────────────────────────────────────────┘

// Syntax highlighting colors (light theme)
{           // #0000ff (bracket)
  "id"      // #0451a5 (keyword)
  :
  123       // #098658 (number)
  ,
  "name"    // #0451a5 (keyword)
  :
  "example" // #0a8200 (string)
}

// Implementation
<div className="json-viewer">
  <div className="json-viewer-header">
    <h3 className="json-viewer-title">Input Data</h3>
    <div className="json-viewer-controls">
      <button title="Copy"><Copy /></button>
      <button title="Expand/Collapse"><ChevronsDownUp /></button>
    </div>
  </div>
  <div className="json-viewer-content">
    {/* Syntax-highlighted JSON lines */}
  </div>
</div>
```

### Metrics Grid

```tsx
// Visual structure (Desktop 3-column)
┌─────────────┬─────────────┬─────────────┐
│ ⏱ DURATION │ ⚡ TOKENS  │ 💰 COST    │
│   245ms     │   1,240     │   $0.0023   │
├─────────────┼─────────────┼─────────────┤
│ 📊 STATUS   │ 🔢 ATTEMPT │ 🔁 RETRIES │
│  Completed  │     2       │     1       │
└─────────────┴─────────────┴─────────────┘

// Implementation
<div className="metrics-grid">
  <div className="metric-cell">
    <div className="metric-label">
      <Clock className="metric-label-icon" />
      Duration
    </div>
    <div className="metric-value">245ms</div>
  </div>
  {/* More metrics... */}
</div>
```

### Status Badge

```tsx
// Visual structure
┌────────────────────┐
│ ● Completed        │  ← Dot + Text
└────────────────────┘

// Variants
[●] Pending    (Gray)
[●] Running    (Blue, pulsing)
[●] Completed  (Green)
[●] Error      (Red)
[●] Awaiting   (Yellow)

// Implementation
<div className="status-badge" data-status="completed">
  <div className="status-badge-dot" />
  <span>Completed</span>
</div>
```

---

## Animation Previews

### Modal Open Sequence

```
Frame 1 (0ms):     Frame 2 (100ms):   Frame 3 (200ms):
┌─────────┐        ┌─────────┐        ┌─────────┐
│         │        │░░░░░░░░░│        │█████████│
│         │   →    │░░░░░░░░░│   →    │█████████│
│         │        │░░░░░░░░░│        │█████████│
└─────────┘        └─────────┘        └─────────┘
  opacity: 0       opacity: 0.5       opacity: 1
  scale: 0.96      scale: 0.98        scale: 1
  y: 10px          y: 5px             y: 0
```

### Tab Switch Animation

```
Before:            During:            After:
┌─────────┐        ┌─────────┐        ┌─────────┐
│ Input ▔ │        │ Input   │        │ Input   │
│         │   →    │░░░░░░░░░│   →    │ Process▔│
│ Content │        │         │        │ Content │
└─────────┘        └─────────┘        └─────────┘
                   (100ms fade)
```

### Collapsible Expand

```
Collapsed:         Expanding:         Expanded:
┌─────────┐        ┌─────────┐        ┌─────────┐
│▶ object │        │▼ object │        │▼ object │
└─────────┘   →    │░░░░░░░░░│   →    │  {      │
                   └─────────┘        │    ...  │
                   (150ms rotate)     │  }      │
                                      └─────────┘
                                      (200ms expand)
```

### Copy Feedback

```
Idle:              Pressed:           Success:
┌──────┐           ┌──────┐           ┌──────┐
│ Copy │    →      │ Copy │    →      │ ✓    │
└──────┘           └──────┘           └──────┘
                   scale: 0.95        scale: 1.1 (bounce)
                   (100ms)            (200ms)

                                      + Toast appears for 2s
                                      ┌──────────┐
                                      │ Copied!  │
                                      └──────────┘
```

---

## Spacing System

### Component Padding/Margins

```
Modal Container:    Desktop: 48px (12)  Tablet: 32px (8)  Mobile: 16px (4)
Header:             24px (6) horizontal, 16px (4) vertical
Tab Navigation:     24px (6) horizontal, 0 vertical
Content Area:       24px (6) all sides (desktop), 16px (4) mobile
Footer:             24px (6) all sides

Between Components: 24px (6) desktop, 16px (4) mobile
Between Sections:   16px (4)
Between Elements:   8px (2) or 12px (3)
```

### Visual Spacing

```
┏━━━━━━━━━━━━━━━━━━━━┓
┃ ↕ 16px             ┃
┃ ┌────────────────┐ ┃
┃ │ Header         │ ┃
┃ └────────────────┘ ┃
┃ ↕ 0px              ┃  ← No gap (border separation)
┃ ┌────────────────┐ ┃
┃ │ Tabs           │ ┃
┃ └────────────────┘ ┃
┃ ↕ 24px             ┃
┃ ┌────────────────┐ ┃
┃ │ Content        │ ┃
┃ │                │ ┃
┃ └────────────────┘ ┃
┃ ↕ 0px              ┃
┃ ┌────────────────┐ ┃
┃ │ Footer         │ ┃
┃ └────────────────┘ ┃
┃ ↕ 16px             ┃
┗━━━━━━━━━━━━━━━━━━━━┛
```

---

## Typography Scale

```
Modal Title:        20px (text-xl) / 24px (text-2xl) desktop
Modal Subtitle:     14px (text-sm)
Tab Labels:         14px (text-sm)
Section Headings:   16px (text-base) / 18px (text-lg) desktop
Body Text:          14px (text-sm) / 16px (text-base) desktop
Metric Labels:      12px (text-xs)
Metric Values:      24px (text-2xl) / 36px (text-3xl) large
JSON Code:          12px (text-xs) / 14px (text-sm) desktop
```

---

## Icon Sizes

```
Header Icon:        24px (w-6 h-6)
Tab Icon:           16px (w-4 h-4)
Status Dot:         8px (w-2 h-2)
Metric Icon:        16px (w-4 h-4)
Chevron (collapse): 16px (w-4 h-4)
Close Button:       20px (w-5 h-5)
```

---

## Border Radius

```
Modal Container:    12px (rounded-xl)
Cards/Panels:       8px (rounded-lg)
Buttons:            6px (rounded-md)
Badges:             9999px (rounded-full)
Inputs:             6px (rounded-md)
```

---

## Shadows

```
Modal Container:
  Light: 0 25px 50px -12px rgba(0, 0, 0, 0.25)
  Dark:  0 25px 50px -12px rgba(0, 0, 0, 0.5)

Cards (default):
  Light: 0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.08)
  Dark:  0 2px 8px rgba(0, 0, 0, 0.3)

Cards (hover):
  Light: 0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)
  Dark:  0 4px 12px rgba(0, 0, 0, 0.4)

Buttons (hover):
  Light: 0 4px 6px rgba(0, 0, 0, 0.1)
  Dark:  0 4px 6px rgba(0, 0, 0, 0.3)
```

---

## Focus States

```
Default Focus Ring:
┌─────────────┐
│   Button    │  ← 2px outline, 2px offset
└─────────────┘
  ╰───────────╯  ← Focus ring (accent color)

Primary Button Focus:
┌─────────────┐
│   Button    │  ← 2px outline
└─────────────┘
  ╰───────────╯  ← Additional 4px glow (20% opacity)
```

---

## Status Colors

```
Pending:    #E5E7EB (Gray)    ● Pending
Running:    #3B82F6 (Blue)    ● Running    (pulsing)
Completed:  #10B981 (Green)   ● Completed
Error:      #EF4444 (Red)     ● Error
Awaiting:   #F59E0B (Amber)   ● Awaiting
```

---

## Print Layout

```
When printed, the modal optimizes for paper:

┌───────────────────────────────────────┐
│ Document Processing                   │  ← Header only (no close button)
│ Stage 2 · Document Node               │
├───────────────────────────────────────┤
│                                       │
│ INPUT DATA                            │  ← All sections expanded
│ {                                     │
│   "id": 123,                          │
│   ...                                 │
│ }                                     │
│                                       │
│ PROCESS METRICS                       │
│ Duration: 245ms                       │
│ Tokens: 1,240                         │
│ Status: Completed                     │
│                                       │
│ OUTPUT DATA                           │
│ {                                     │
│   "result": {...}                     │
│ }                                     │
│                                       │
└───────────────────────────────────────┘

Hidden in print:
- Modal overlay
- Close button
- Copy buttons
- Tab navigation
- Refinement chat
- Interactive controls
```

---

## Accessibility Visual Indicators

```
Focus Visible (Keyboard):
┌─────────────┐
│   Button    │
└─────────────┘
  ╰───────────╯  ← Blue focus ring (3px, 2px offset)

Focus + Glow (Primary CTA):
┌─────────────┐
│   Button    │
└─────────────┘
  ╰───────────╯  ← Ring + 4px glow shadow

High Contrast Mode:
┌─────────────┐
│   Button    │  ← 2px solid border (increased)
└─────────────┘

Reduced Motion:
All animations disabled:
- Modal: Instant opacity change (no scale/slide)
- Tabs: Instant switch (no fade)
- Collapsible: Instant expand (no animation)
```

---

## Implementation Snippets

### Basic Modal Structure

```tsx
<div className="modal-overlay" onClick={onClose}>
  <div
    className="modal-content"
    onClick={(e) => e.stopPropagation()}
  >
    {/* Header */}
    <header className="modal-header">
      <div className="modal-header-left">
        <Icon />
        <div className="modal-header-text">
          <h2 className="modal-title">Title</h2>
          <p className="modal-subtitle">Subtitle</p>
        </div>
      </div>
      <div className="modal-header-right">
        <StatusBadge />
        <CloseButton />
      </div>
    </header>

    {/* Body */}
    <div className="modal-body">
      <TabNavigation />
      <TabContent />
    </div>

    {/* Footer (conditional) */}
    {isAIStage && (
      <footer className="modal-footer">
        <RefinementChat />
      </footer>
    )}
  </div>
</div>
```

### JSON Viewer with Syntax Highlighting

```tsx
<div className="json-viewer">
  <div className="json-viewer-header">
    <h3 className="json-viewer-title">Data</h3>
    <button onClick={handleCopy}>
      <Copy className="w-4 h-4" />
    </button>
  </div>
  <div className="json-viewer-content">
    {jsonLines.map((line, i) => (
      <div key={i} className="json-line">
        <span className="json-line-number">{i + 1}</span>
        <span className="json-line-content">
          {renderSyntaxHighlighted(line)}
        </span>
      </div>
    ))}
  </div>
</div>

// Syntax highlighting function
function renderSyntaxHighlighted(text: string) {
  return text
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1":</span>')
    .replace(/"([^"]*)"/g, '<span class="json-string">"$1"</span>')
    .replace(/\b(\d+)\b/g, '<span class="json-number">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
    .replace(/\bnull\b/g, '<span class="json-null">null</span>');
}
```

---

## Quick Reference

### Breakpoints
- Mobile: `0-767px`
- Tablet: `768-1023px`
- Desktop: `1024-1439px`
- Large: `1440px+`

### Common Classes
- Modal: `modal-overlay`, `modal-content`, `modal-header`, `modal-body`, `modal-footer`
- Tabs: `tab-navigation`, `tab-button`, `tab-content`
- JSON: `json-viewer`, `json-line`, `json-key`, `json-string`
- Metrics: `metrics-grid`, `metric-cell`, `metric-label`, `metric-value`
- Status: `status-badge`, `status-badge-dot`

### Animation Durations
- Fast: `100ms` (tab switch, hover)
- Default: `150ms` (most interactions)
- Modal: `200ms` (open), `150ms` (close)
- Slow: `300ms` (complex sequences)

### Z-Index Layers
- Overlay: `1040`
- Modal: `1055`
- Sticky Header/Footer: `10` (within modal)
- Dropdown: `1070`
- Tooltip: `1080`
