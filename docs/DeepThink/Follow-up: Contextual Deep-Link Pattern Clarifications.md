Based on the "Contextual Deep-Link" architecture, here are the specific interaction designs for your identified edge cases.

These decisions are designed to maintain **flow continuity** (keeping the user moving forward) and **architectural purity** (using the Inspector as the single source of truth).

### 1. Post-Generation Flow: The "Optimistic Handoff"

**Decision:** Auto-transition to DETAIL view with a "Skeleton/Progress" state.

We treat the "Generate" click as a commitment. If the user clicks "Generate," they are signaling intent to see the result.

* **Scenario A (User Stays):**
1. User clicks `[Generate]`.
2. The Inspector view immediately transitions from **CREATE** to **DETAIL**.
3. **State:** The DETAIL view displays a "Building..." state (e.g., a terminal log showing "Parsing transcript... Generating questions...").
4. **Completion:** When the API finishes, the loading state is replaced by the content (live update) without a reload.


* **Scenario B (User Leaves & Returns):**
1. User clicks `[Generate]` but immediately closes the panel or clicks another node.
2. **Asset Dock Feedback:** The Lesson Node's asset icon (e.g., Quiz) pulses Blue.
3. **Return Path 1 (Specific):** Clicking the **pulsing icon** opens the Inspector directly to the **DETAIL** view (showing progress or result).
4. **Return Path 2 (Generic):** Clicking the **Lesson Node body** opens the **ROOT** view. The list item shows a "Generating..." status badge.



**Why:** This creates a consistent mental model: "Generic click = Overview (Root)", "Specific click = Detail".

---

### 2. Multiple Enrichments: Count-Based Smart Routing

**Decision:** Conditionality based on item count.

Since the Asset Dock icons are small (16-24px), precise targeting of "Quiz #2" is difficult. We use the count to decide the most helpful destination.

* **Count = 1:** Clicking the icon opens **DETAIL** view directly. (Optimizes for the 90% use case).
* **Count > 1:** Clicking the icon opens **ROOT** view, **auto-scrolls** to the relevant section (e.g., Quizzes), and briefly flashes the group.
* **Visuals:**
* Single Item: Standard Icon `[❓]`
* Multiple: Icon with Badge `[❓ 2]`



**Why:** It removes the need for complex, tiny sub-menus on the canvas while ensuring users can always access the specific item they want via the list.

---

### 3. Fallback "Add" Button in ROOT View

**Decision:** Option 3B (Popover Menu / Action Sheet).

* **Desktop:** Clicking `[+ Add Enrichment]` at the bottom of the list opens a standard **Popover Menu** anchored to the button.
* **Mobile:** Clicking triggers a native **Bottom Sheet** (Drawer) covering the lower screen.
* **Content:** The menu items mirror the NodeToolbar exactly (Icons + Labels).

**Why:** Option 3A (Inline Accordion) causes jarring layout shifts inside the panel. Option 3C (Sub-view) adds unnecessary navigation depth. The Popover is the standard UI pattern for "Add New" actions in constrained vertical lists.

---

### 4. Batch Operations (Module-Level)

**Decision:** Option 4D (Module Inspector).

Do not clutter the Lesson Node or Graph Toolbar with multi-select actions. Use the "Object → Inspector" pattern for the container node.

* **Interaction:**
1. User clicks the **ModuleGroup** header/background (the container node).
2. The Inspector Panel opens showing **"Module Details"** (distinct from Lesson Details).
3. A **"Batch Actions"** section is available.
4. **Action:** `[Generate Quizzes for All 12 Lessons]`.


* **Feedback:** All child LessonNodes in the graph update their Asset Docks to "Generating" (pulsing blue) simultaneously.

**Why:** It keeps the individual Lesson Inspector focused and scalable. It provides a safe, dedicated space for "destructive" or credit-heavy bulk operations.

---

### 5. Cancel/Back Navigation: The "Safe Harbor" Strategy

**Decision:** Always return to ROOT.

The Inspector stack is `ROOT → CREATE → DETAIL`. The "Back" button moves up the stack.

* **Scenario 5A (Deep Link → Back):**
* User clicked `[+ Quiz]` on the graph, then clicked `< Back` or `Cancel`.
* **Result:** Go to **ROOT** view. (Do *not* close the panel).
* **Reason:** The user selected the lesson. Closing the panel feels like a crash. Showing the Root view re-orients them.


* **Scenario 5C (Dirty State Switch):**
* *User starts configuring a Quiz, types custom instructions, then clicks the Audio icon in the Asset Dock.*
* **Result:** Trigger an Alert: *"Discard unsaved quiz settings? [Cancel] [Discard]"*.
* **Nuance:** If the form is "pristine" (only default values), **skip the alert** and switch immediately.



---

### 6. Empty State: Educational "Discovery Cards"

**Decision:** Option 6B (Type Cards).

Use the empty state to teach the user.

* **UI Design:** When `enrichments.length === 0`, hide the empty list and display a grid of **Action Cards**:
```text
┌─────────────────────────────────────┐
│  Recommended Enrichments            │
│                                     │
│  ┌──────────────┐  ┌──────────────┐ │
│  │ 📹 Video     │  │ ❓ Quiz      │ │
│  │ AI Avatar    │  │ Check know-  │ │
│  │ lecture.     │  │ ledge.       │ │
│  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────┘

```


* **Interaction:** Clicking a card behaves exactly like the NodeToolbar deep link (jumps to **CREATE** view).
* **Transition:** Once the first item is added, the cards disappear, and the standard list takes over.

**Why:** It transforms a "dead end" into a dashboard, improving feature discoverability without forcing users to hover over icons on the graph.