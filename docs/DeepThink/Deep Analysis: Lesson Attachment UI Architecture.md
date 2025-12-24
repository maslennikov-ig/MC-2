# Deep Analysis: Lesson Attachment UI Architecture

## 1. Core Insight: Taxonomy vs. Topology

The fundamental UX challenge is distinguishing between **Workflow Topology** (the sequence of learning) and **Content Inventory** (the assets within a step).

* **The Trap:** If you visualize attachments as separate nodes (e.g., Lesson → Video Node), you create a "Graph Explosion." A 50-lesson course with 3 attachments each results in ~200 nodes. This destroys the "bird's eye view," ruins ELK layout stability, and makes mobile navigation impossible.
* **The Solution:** You must treat the `LessonNode` as a **Container** or **Dashboard**. The graph visualizes the *curriculum flow*, while the node itself acts as a "Smart Card" that displays the status of its internal content.

## 2. Recommended Architecture

**Strategy: The "Asset Dock" + "Inspector" Pattern**

1. **Visual Graph:** Modify the `LessonNode` to include a fixed-height **"Asset Dock"** at the bottom. This displays the *presence* and *status* of attachments (badges/icons), but not the full content.
2. **Interaction Layer:**
* **Quick Add:** Use a **floating Context Toolbar** (React Flow `<NodeToolbar>`) that appears *above* the node when selected.
* **Detailed Edit:** Use a **Right Sidebar (Inspector)** for managing, viewing, and regenerating specific assets.



**Rationale:**

* **ELK Stability:** By keeping node dimensions fixed (reserved space for the dock), you avoid expensive and disorienting layout recalculations when assets are added.
* **Mobile-First:** Avoids tiny click targets inside the node. Interactions rely on Selection (Node) → Toolbar (Large Buttons).
* **Performance:** Reduces the React Flow node count by ~75% compared to the separate-node approach.

## 3. Visual Design Strategy

### A. Node Redesign (The "Asset Dock")

Increase the standard node height from 50px to **64px** to create a dedicated zone for attachments without cramping the title.

* **Top Zone (40px):** Title, Lesson Number, Meta (Duration), Action Button.
* **Divider:** A subtle 1px opacity line.
* **Bottom Zone (24px) - "The Asset Dock":**
* A horizontal flex row of 16x16px icons.
* **States:**
* *Empty:* Invisible (or faint placeholders).
* *Generating:* Icon with a **pulsing border** (CSS animation).
* *Ready:* Solid, distinct color (Video=Purple, Quiz=Orange, Doc=Blue).
* *Error:* Red icon with a small warning dot.


* **Overflow:** If > 4 items, show a `+N` badge.



### B. Semantic Zoom Behaviors

* **Zoom < 0.3 (Dot):**
* Show only the dot.
* *Logic:* If *any* attachment is failing, the dot turns Red. If generating, it pulses Blue.


* **0.3 ≤ Zoom < 0.6 (Card):**
* Show Title + Meta.
* *Dock:* Simplified. Show a generic "Paperclip" icon with a count (e.g., "📎 3") if assets exist.


* **Zoom ≥ 0.6 (Detail):**
* Show full **Asset Dock** with individual clickable icons for Video, Audio, Quiz, etc.



### C. Layout Impact (ELK)

* **Fixed Geometry:** Configure ELK to assume all Lesson Nodes are **64px** height.
* **No Expansion:** Do *not* expand the node height when adding attachments. If the user needs to see a list of 10 files, that happens in the Side Panel, not the graph.

## 4. Interaction Design

### A. Adding Attachments (The "Node Toolbar")

Do not rely on hover states (mouse-only). Use **Selection** as the trigger.

1. **Trigger:** User taps/selects the Lesson Node.
2. **UI:** A toolbar floats *above* the node (automatically positioned by React Flow).
* *Buttons:* `[+ Video]`, `[+ Audio]`, `[+ Quiz]`.


3. **Action:** User taps `[+ Video]`.
4. **Feedback:** The Toolbar closes. A "Ghost Video Icon" immediately appears in the Lesson Node's Asset Dock (Optimistic UI) and begins pulsing.

### B. Viewing & Editing (The "Side Panel")

1. **Trigger:** User taps a specific icon (e.g., the Purple Video Icon) in the Asset Dock.
2. **UI:** Opens a **Right-Side Drawer** (overlaying the graph).
3. **Content:** The Drawer contains the asset details, video player, transcript editor, and "Regenerate" button.
* *Why:* You cannot effectively preview a video or edit a quiz inside a small graph node.



### C. Batch Operations (The "Module" Flow)

*Scenario: "Generate TTS Audio for this entire module."*

1. **Trigger:** User selects the `ModuleGroup` header.
2. **Action:** Click "Batch Actions" in the floating toolbar.
3. **Selection:** "Generate Audio for all 12 lessons."
4. **Feedback:** All 12 child nodes show pulsing audio icons simultaneously.

## 5. Technical Considerations

### React Flow Integration

* **Tooling:** Use `<NodeToolbar isVisible={selected} position={Position.Top} />`.
* **Hit Slop:** The 16px icons in the Asset Dock are small. Wrap them in a `div` with `padding: 8px` to ensure a 32px+ touch target.
* **Memoization:** Wrap the `LessonNode` in `React.memo`. It should only re-render if the `assets` summary changes.

### State Management (Zustand + Supabase)

* **Separation of Concerns:** Don't store heavy attachment data (like full transcripts) in the Node object.
```typescript
// React Flow Store (Lightweight)
nodes: [{
  id: "lesson_1",
  data: {
    title: "Introduction",
    // Only keep lightweight status summary for the icon dock
    assetsSummary: [{ type: 'video', status: 'generating' }]
  }
}]

```


* **Real-time:** Subscribe to the `assets` table. When an event comes in (`UPDATE status='ready'`), update *only* the specific node's `data.assetsSummary`.

### ELK Layout

* Keep `elk.algorithm: 'layered'`.
* Set `nodeDimensionsIncludeLabels: true`.
* **Performance Hack:** Since the nodes are fixed size (64px), you *only* need to run ELK when the graph topology changes (new nodes/edges), **not** when attachments are added. This ensures the UI feels "rock solid."

## 6. Alternative Approaches (Rejected)

| Approach | Why Rejected |
| --- | --- |
| **Separate Nodes (Satellites)** | **Graph Explosion.** 100 lessons = 300+ nodes. Unreadable layout. |
| **Expandable Accordion** | **Layout Thrashing.** Changing node height forces an ELK re-calculation, causing the entire graph to "jump" or shift positions, disorienting the user. |
| **Hover Menus** | **Tablet Failure.** Cannot hover on touch devices. "Long Press" is low discoverability. |

## 7. Open Questions

1. **Generation Failure:** If 5 attachments fail, does the node look like a Christmas tree of red dots? *Mitigation: Group failures into a single "Warning" icon that opens the sidebar.*
2. **Dependencies:** Does a Quiz ever depend on the Video being finished? If so, the "Add Quiz" button might need to be disabled until the Video status is "Ready."
3. **Drag and Drop:** Will users want to drag a PDF from their desktop *onto* a node? If so, the `LessonNode` needs to be a drop target.