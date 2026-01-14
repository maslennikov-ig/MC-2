# UI/UX Patterns for On-Demand AI Content Generation in Education

**Placeholder cards with progressive disclosure offer the strongest pattern for CourseAI's enrichment UI**—balancing discoverability with clean design while setting proper expectations for AI generation times. Research across 15+ platforms reveals that educational tools hide unavailable content, while AI-native platforms embrace visible generation triggers. The optimal solution combines both philosophies: show enrichment possibilities explicitly, but keep the interface clean through intelligent empty state design.

## How educational platforms handle supplementary content

Leading MOOCs consistently organize supplementary materials through **tabs below video players** combined with collapsible sidebars. Coursera, Udemy, and LinkedIn Learning all use this pattern, with the critical distinction that they **hide content types when unavailable** rather than showing empty placeholders. Udemy's folder icon appears only when downloadable resources exist—disappearing entirely otherwise. LinkedIn Learning's transcript tab activates only when transcripts are available.

This "hide when unavailable" approach reflects a key assumption: in traditional educational platforms, content is **pre-authored by instructors**, not generated on-demand. Users can't create what doesn't exist, so showing empty states would only frustrate them. CourseAI's AI-generated enrichments fundamentally change this dynamic—users _can_ create content that doesn't yet exist, making discoverability essential.

Khan Academy and edX take a different approach by **pre-loading the full course structure** regardless of completion status. Their progress visualization shows what's coming, helping learners understand scope and commitment before diving in. This transparency about available content types serves CourseAI's needs better than Udemy's hidden approach.

| Platform          | Content Organization            | Empty State Handling |
| ----------------- | ------------------------------- | -------------------- |
| Coursera          | Tabs + collapsible sidebar      | Hides unavailable    |
| Udemy             | Tabs + inline folder icons      | Hides unavailable    |
| LinkedIn Learning | Tabbed side menu                | Hides unavailable    |
| Khan Academy      | Topic hierarchy + progress bars | Shows full structure |
| edX               | Tab-based + sequence bar        | Shows full structure |

## AI content generation interfaces reveal distinct trigger patterns

AI-first platforms have developed **five primary trigger mechanisms** for content generation, each with different trade-offs for discoverability and interface cleanliness.

**Notion AI's slash command system** (`/ai` or pressing spacebar on empty pages) provides powerful keyboard-driven access but requires learning. Generation happens inline—content streams directly into the document with "Insert below," "Replace," and "Try again" options appearing contextually. This works well for text-heavy power users but sacrifices discoverability for novices.

**Claude Artifacts' automatic detection** represents the opposite philosophy—the AI decides when to create an artifact based on content characteristics (self-contained, over 15 lines, something users would want to store/edit). This split-screen layout (chat left, artifact right) with version control built-in provides excellent iteration support but requires conversational initiation.

**Gamma and Beautiful.ai use step-by-step wizards** for presentation generation: enter prompt → review AI-generated outline → configure parameters → generate full output. This "outline preview" step before full generation sets expectations effectively and allows course correction before investing generation time. Generation takes "under a minute" with **20+ AI models** working simultaneously—a useful benchmark for CourseAI's enrichment generation.

**ChatGPT's display modes** (inline, picture-in-picture, fullscreen) demonstrate that AI-generated content benefits from flexible presentation. The **streaming text** pattern—tokens appearing progressively—has become the de facto standard for managing perceived wait times.

For generation triggers specifically, Google Cloud UX research found that users **preferred explicit "generate" buttons** over automatic AI suggestions appearing without clear intent signals. This suggests CourseAI should use deliberate user-initiated triggers rather than proactive generation offers.

## Creative tools favor inline creation over modals

Canva, Figma, Miro, and Notion share a crucial design philosophy: **creation happens on the canvas, not in dialog boxes**. Figma's frame tool lets users press F and drag directly; Notion's slash command inserts blocks exactly where the cursor sits; Canva's elements drag from sidebar to canvas. Modals are reserved for export settings and file selection—never for primary creation flows.

This pattern suggests CourseAI's enrichment generation should happen **inline within the Media tab** rather than opening separate dialogs. When a user requests a quiz, the quiz card should appear immediately (in loading state) in the enrichments grid, not in a modal that breaks context.

**Template galleries provide crucial inspiration**. Canva and Adobe Express never show truly empty states—instead offering template suggestions and recent designs. This "starter content" approach reduces blank canvas anxiety. For CourseAI, showing **sample enrichment previews** (what a quiz looks like, what slides might contain) would serve the same function.

Descript's approach to AI integration deserves special attention for CourseAI. Their "Underlord" AI assistant responds either inline or in a sidebar panel, with clear entry points for different AI actions (generate, analyze, enhance). Multiple input modes—record, import, generate, chat—are all accessible from the home dashboard without hierarchy confusion.

## UX best practices from authoritative sources

Nielsen Norman Group's guidance on empty states directly contradicts the "hide unavailable" pattern from educational platforms:

> "Do not default to totally empty states. This approach creates confusion for users, who may be left wondering if the system is still loading information or if errors have occurred."

NNG recommends empty states should: **communicate system status**, **increase learnability** (explain what will appear and how to create it), and **provide direct pathways** (CTAs for creating first content). This strongly supports the placeholder card approach over hidden content.

For **long AI operations** (30-120 seconds), NNG prescribes determinate progress indicators:

> "Progress indicators that provide details such as time elapsed and time remaining make long waits more tolerable and increase user confidence. Anything above 10 seconds requires an explicit estimation of duration."

Microsoft's HAX Toolkit emphasizes upfront capability communication: "Make clear what the system can do. Help the user understand what the AI system is capable of doing." For CourseAI, this means each enrichment type should clearly explain what the AI will generate and approximately how long it takes.

The **Shape of AI pattern library** introduces several directly applicable patterns:

- **Cost estimates**: "Help users proactively modulate compute power through transparent cost estimates"
- **Caveats**: "Inform users about shortcomings or risks in the model"
- **Draft mode**: "Support exploration and iterative prompting while reducing compute costs until a final form is ready"
- **Regenerate**: Offer parameter adjustment before regenerating, not just blind retries

IBM's Design for AI research highlights **generative variability**—the same input producing different outputs—as requiring new UX patterns. Traditional interfaces promise predictability; AI interfaces must set expectations that results vary. Claude Artifacts addresses this through version history; Gamma through outline preview before generation.

## Analysis of the four proposed patterns

### Option 1: Placeholder cards for each enrichment type

**Strengths**: Maximum discoverability—users immediately understand all four enrichment types (Quiz, Audio, Presentation, Video). Educational empty states can preview what generated content looks like. Direct CTA on each card eliminates navigation steps. Aligns with NNG empty state guidance.

**Weaknesses**: Occupies significant visual space when no enrichments exist. Could feel repetitive across many lessons. Risk of "blank card fatigue" if users see the same empty states repeatedly.

**Best fit**: When enrichment types are stable (not frequently adding new types) and when educating users about AI capabilities is a priority.

### Option 2: Single "+" button with dropdown/modal

**Strengths**: Minimal footprint—clean interface when no enrichments exist. Scalable as enrichment types grow. Familiar pattern from Notion (+), Miro (toolbar), and Google Docs (Insert menu).

**Weaknesses**: Discoverability requires clicking—users may not realize AI enrichments are available. Additional click to reach generation. Dropdown menus can feel disconnected from content.

**Best fit**: When interface cleanliness is paramount and users already understand the available enrichment types.

### Option 3: Floating Action Button (FAB)

**Strengths**: Persistent visibility regardless of scroll position. Strong mobile pattern (Material Design standard). Clear affordance for primary action.

**Weaknesses**: Competes with other FABs if present elsewhere in the application. Can feel disconnected from content it affects. Less appropriate for desktop-first interfaces. Material Design is stylistically different from shadcn/ui's Radix-based aesthetic.

**Best fit**: Mobile-first applications where a single primary action dominates. Less suitable for CourseAI's tab-based desktop UI.

### Option 4: Header dropdown ("Add" in tab header)

**Strengths**: Extremely compact—single button in existing header. Contextually located within Media tab. Clean when multiple enrichments already exist.

**Weaknesses**: Low discoverability—users may not notice or explore. Adds cognitive load to find generation options. Doesn't communicate AI capabilities proactively.

**Best fit**: When enrichments are secondary features, not core value proposition. Less suitable if AI generation is a primary differentiator.

## Recommended approach for CourseAI

The optimal solution combines **placeholder cards** with **progressive disclosure** and **inline generation**—synthesizing the best patterns from educational platforms, AI tools, and UX research.

### Core pattern: Contextual placeholder grid

When the Media tab has no enrichments, display a **2×2 grid of placeholder cards**—one for each enrichment type. Each card shows:

- Icon representing the enrichment type (Quiz, Audio, Slides, Video)
- Title and one-line description
- "Generate" button as primary CTA
- Estimated generation time (e.g., "~45 seconds")
- Small preview thumbnail or illustration showing sample output

This addresses discoverability while providing educational context. As enrichments are generated, **placeholder cards are replaced by content cards**—maintaining the same grid structure but showing actual content with preview, status, and actions.

### Generation flow: Inline with progress

When users click "Generate," the placeholder card **transitions to a loading state in place**—no modal, no navigation. Display:

- Determinate progress indicator (steps, not percentage—AI timing is unpredictable)
- Step descriptions: "Analyzing lesson content... Generating questions... Formatting output..."
- Estimated time remaining
- "Cancel" option for long generations
- Optional: Allow background generation with notification on completion

This streaming/progress approach follows ChatGPT and Gamma patterns while respecting NNG's 10+ second guidance.

### Progressive disclosure for advanced options

Default generation uses lesson content with sensible defaults. An expandable "Options" section (collapsed by default) reveals:

- Quiz: Number of questions, difficulty level, question types (multiple choice, fill-in-blank)
- Audio: Voice selection, speed, emphasis style
- Presentation: Number of slides, visual style, key points to emphasize
- Video: Avatar selection, video length (when available)

This follows NNG's progressive disclosure principle: "defers advanced or rarely used features to a secondary screen, making applications easier to learn."

### Handling multiple existing enrichments

When enrichments already exist, the grid shows content cards with:

- Thumbnail preview
- Title and type indicator
- Last generated timestamp
- "View" as primary action, "Regenerate" as secondary
- A final **"+ Add More" card** that opens a compact menu of remaining enrichment types (or states "All types generated" when complete)

This hybrid approach—content cards plus one "add" card—balances clean interface with continued discoverability.

## Wireframe specification for shadcn/ui implementation

```
┌─────────────────────────────────────────────────────────────┐
│  [Content]  [Course Structure]  [Media]                     │  ← Existing tabs
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │  ⎔ Quiz             │  │  🔊 Audio           │          │
│  │                     │  │                     │          │
│  │  [Sample preview]   │  │  [Sample preview]   │          │
│  │                     │  │                     │          │
│  │  Generate AI quiz   │  │  Generate narration │          │
│  │  questions for this │  │  of this lesson     │          │
│  │  lesson             │  │  content            │          │
│  │                     │  │                     │          │
│  │  ~45 sec            │  │  ~30 sec            │          │
│  │                     │  │                     │          │
│  │  [  Generate  ]     │  │  [  Generate  ]     │          │  ← shadcn Button
│  │   ⌄ Options         │  │   ⌄ Options         │          │  ← Collapsible
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │  📊 Presentation    │  │  🎬 Video           │          │
│  │                     │  │                     │          │
│  │  [Sample preview]   │  │  [Sample preview]   │          │
│  │                     │  │                     │          │
│  │  Auto-generate      │  │  AI avatar video    │          │
│  │  slides from lesson │  │  lecture            │          │
│  │                     │  │                     │          │
│  │  ~90 sec            │  │  Coming Soon        │          │
│  │                     │  │                     │          │
│  │  [  Generate  ]     │  │  [  Coming Soon  ]  │          │  ← Disabled state
│  │   ⌄ Options         │  │                     │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**shadcn/ui components to use:**

- `Card` with `CardHeader`, `CardContent`, `CardFooter` for each enrichment
- `Button` with variant="default" for Generate, variant="ghost" for Options toggle
- `Collapsible` for Options section
- `Progress` component for generation status
- `Badge` for "Coming Soon" or "Beta" labels
- `Skeleton` for loading state placeholders

**Loading state transformation:**

```
┌─────────────────────┐
│  ⎔ Generating Quiz  │
│                     │
│  ████████░░░░░░ 60% │  ← Progress bar
│                     │
│  Generating         │
│  questions...       │
│                     │
│  ~20 sec remaining  │
│                     │
│  [  Cancel  ]       │
└─────────────────────┘
```

**Completed state:**

```
┌─────────────────────┐
│  ⎔ Quiz  ✓          │
│                     │
│  [Actual preview]   │
│  5 questions        │
│  Generated 2m ago   │
│                     │
│  [ View ] [⟳][⋮]   │  ← Primary + icon buttons
└─────────────────────┘
```

### Mobile responsive behavior

On mobile viewports (<768px), the 2×2 grid collapses to a **single column** with cards stacking vertically. Each card compresses to show icon + title + generate button on a single row, with description and options hidden behind a "More" expansion. This matches shadcn/ui's responsive patterns and maintains touch-friendly tap targets.

### Cost and time transparency

Following Shape of AI's "cost estimates" pattern, consider displaying credit costs before generation if your platform uses a credit system:

```
[ Generate ] — 5 credits, ~45 sec
```

This upfront transparency prevents surprise and builds trust, particularly important for features that consume limited resources or take significant time.

The placeholder card pattern with inline generation, combined with shadcn/ui's component library, provides maximum discoverability while maintaining the clean aesthetic your current interface establishes. Users immediately understand what AI can generate for them, how long it takes, and can initiate generation with a single click—all without leaving the Media tab context.
