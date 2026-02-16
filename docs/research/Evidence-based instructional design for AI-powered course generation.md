# Evidence-based instructional design for AI-powered course generation

An AI course generation platform can transform its output from a flat topic list into a genuine learning journey by encoding a specific set of research-backed structural rules. **Six major instructional design frameworks, decades of cognitive science research, and established quality standards converge on a remarkably consistent set of principles** governing how courses should be structured — from the macro arc of an entire course down to the sequence of individual lessons within a module. The most critical insight: effective course structure is not primarily about content organization but about designing a _cognitive progression_ that matches how human memory and motivation actually work.

This report synthesizes findings from peer-reviewed cognitive science (Sweller, Bjork, Mayer, Cepeda), canonical ID frameworks (Gagné, Merrill, Dick & Carey, Bloom), quality standards (Quality Matters rubric), and practitioner consensus into concrete, implementable rules. Each principle is rated MUST / SHOULD / COULD and accompanied by specific implementation guidance for an automated system.

---

## 1. Established instructional design frameworks and what they prescribe for structure

### ADDIE: the process backbone

**Source:** Developed 1975 at Florida State University for U.S. Army; formalized by Gustafson & Branch. The ADDIE model (Analyze, Design, Develop, Implement, Evaluate) is the most widely used ID framework globally, though it is a _process_ model rather than a structural prescription. Its Design phase is most relevant: it calls for creating a course blueprint with **hierarchically aligned objectives** (course-level → module-level → lesson-level), a logical sequence of modules, and consistent module components (overview, objectives, content, activities, assessment, resources).

**Application to automated generation:** ADDIE's key contribution is the _alignment principle_ — every module's objectives must trace upward to course-level outcomes, and every lesson must serve a module objective. An AI system should generate objectives first, then derive structure from those objectives.

**Concrete rule:** Before generating module/lesson titles, the LLM should first generate 3-5 course-level learning outcomes, then decompose each into module-level objectives, then derive lessons from those. Validate that every lesson maps to at least one module objective. **Priority: MUST**

### Gagné's Nine Events of Instruction: the universal lesson template

**Source:** Robert Gagné, _The Conditions of Learning_ (1965); updated in Gagné, Briggs & Wager, _Principles of Instructional Design_ (4th ed., 1992). A PMC-published nursing education study found implementing the nine events across three semesters improved both teacher effectiveness ratings and student final grades.

The nine events provide the most directly implementable structural template for individual lessons: **(1) Gain attention** → **(2) State objectives** → **(3) Stimulate recall of prior learning** → **(4) Present content** → **(5) Provide learning guidance** → **(6) Elicit practice** → **(7) Provide feedback** → **(8) Assess performance** → **(9) Enhance retention and transfer**. These events map cleanly to a three-part lesson structure:

- **Opening** (Events 1-3): Hook, objectives, prior knowledge connection
- **Core** (Events 4-5): Content with guided examples
- **Close** (Events 6-9): Practice, feedback, assessment, real-world transfer

**Concrete rule:** Every generated lesson should contain structural slots for: an attention element (question, scenario, or surprising fact), stated objectives, a prior-knowledge connector ("In the previous lesson, we learned..."), content presentation, at least one practice activity, and a closing that bridges to the next lesson. **Priority: MUST**

### Merrill's First Principles: problem-centered progression

**Source:** M. David Merrill, "First Principles of Instruction," _Educational Technology Research & Development_ 50(3), 2002, pp. 43-59. Merrill synthesized principles common across multiple independently developed ID theories and found they converge on five principles: **(1) Problem-centered** — learning anchored in real-world problems; **(2) Activation** — prior knowledge activated; **(3) Demonstration** — new knowledge shown, not just told; **(4) Application** — learner applies knowledge with feedback; **(5) Integration** — learner reflects and transfers to their world.

The critical structural implication is Merrill's **problem progression corollary**: courses should be organized around a sequence of increasingly complex real-world problems, not a list of abstract topics. Each module cycles through Activation → Demonstration → Application → Integration.

**Concrete rule:** When the LLM generates module descriptions, each module should be framed around a problem or task ("By the end of this module, you'll be able to [solve X problem]") rather than a topic label ("Module 3: Advanced Concepts"). The system should validate that modules progress from simpler to more complex problems. **Priority: SHOULD**

### Bloom's Taxonomy: cognitive progression across modules

**Source:** Anderson & Krathwohl (2001 revision of Bloom's 1956 taxonomy). An ASU study with 213 computer science students found the optimal learning pathway followed Bloom's cognitive progression. The six levels — **Remember → Understand → Apply → Analyze → Evaluate → Create** — provide a natural ordering principle for course modules.

Early modules should emphasize Remember/Understand objectives (define, describe, explain). Middle modules should target Apply/Analyze (implement, compare, distinguish). Final modules should require Evaluate/Create (design, critique, build). This is not rigid — each module can span multiple levels — but the _center of gravity_ should shift upward across the course.

**Concrete rule:** Tag each module's primary Bloom's level. Validate that the sequence is non-decreasing (no module targeting "Remember" should follow one targeting "Analyze"). The final module should always include at least one Create-level objective. **Priority: MUST**

### Dick and Carey Systems Approach: prerequisite-driven sequencing

**Source:** Walter Dick & Lou Carey, _The Systematic Design of Instruction_ (1978; 8th ed. 2015). Gustafson & Branch (2002) called it "the standard" against which all other ID models are compared. The model's unique contribution is **instructional analysis** — decomposing goals into subordinate skills and mapping prerequisite relationships using hierarchical, procedural, or cluster analysis.

This framework provides the strongest rationale for why module ordering matters: **skills with prerequisites must come after their prerequisites**. It prescribes three analysis types: hierarchical analysis (for intellectual skills with dependency chains), procedural analysis (for sequential tasks), and cluster analysis (for related information without strict ordering).

**Concrete rule:** Before sequencing modules, the LLM should identify prerequisite relationships between topics extracted from the source material. Generate a dependency graph and topologically sort it. Modules introducing foundational concepts (entry-level skills) must precede modules that depend on them. **Priority: MUST**

### Understanding by Design: backward design from enduring understandings

**Source:** Grant Wiggins & Jay McTighe, _Understanding by Design_ (ASCD, 1998; 2nd ed. 2005). The three-stage backward design process — (1) Identify desired results, (2) Determine acceptable evidence, (3) Plan learning experiences — inverts the typical content-first approach.

Its most actionable contribution is the **three-layer priority framework**: content falls into concentric circles of importance — _Enduring Understandings_ (core ideas to retain for life), _Important to Know and Do_ (supporting knowledge), and _Worth Being Familiar With_ (supplementary). This directly informs how much structural weight each topic receives.

**Concrete rule:** The LLM should classify source material into three tiers of importance. Tier 1 (enduring understandings) gets dedicated modules with full practice and assessment. Tier 2 gets lessons within modules. Tier 3 becomes supplementary/reference material, not standalone lessons. **Priority: SHOULD**

### Additional frameworks worth encoding

**Biggs' Constructive Alignment** (1996): Every module's objectives, activities, and assessments must use the same action verb — if the objective says "analyze," the assessment must require analysis, not recall. A quantitative study (ERIC EJ1215464) found statistically significant achievement gains from constructive alignment (_t_(29) = 3.94, _p_ < 0.05). **Priority: SHOULD**

**Keller's ARCS Model** (1987): Attention, Relevance, Confidence, Satisfaction. Most relevant structural prescription: scaffold difficulty so learners experience **early wins** (Confidence), and explicitly state why each module matters (Relevance). Meta-analyses confirm ARCS significantly impacts motivation and learning outcomes. **Priority: SHOULD**

**Cathy Moore's Action Mapping** (2008/2017): Organize around actions and decisions, not information delivery. Include only information that directly supports practice activities. Helpful for skills courses where the LLM might default to encyclopedia-style content. **Priority: COULD**

---

## 2. Universal structural patterns that emerge across course types

### The non-negotiable orientation module

Quality Matters Standard 1.1 (Essential, 3 points) requires clear instructions on how to get started. Standard 1.2 (Essential, 3 points) requires learners be introduced to the course's purpose and structure. Every well-designed online course begins with an orientation element — variously called "Module 0," "Start Here," or "Getting Started."

Research supports this: University of Iowa's Online Course Essentials states that "a Getting Started module reduces student cognitive load during online course orientation by scaffolding pre-course tasks" (citing Barbera et al., 2013; Tanis, 2020). MOOC research consistently finds the first two weeks are critical for engagement — after which active student numbers stabilize. **78% of students who fail to complete web-based courses cite lack of engagement or inability to find materials as the primary reason.**

For an automated system, the orientation module should be **templated, not generated from source content**. It provides structural scaffolding that is independent of the subject matter.

**Concrete rule:** Always generate a first module/lesson containing: (1) a motivational hook explaining why the topic matters, (2) course-level learning objectives, (3) a roadmap of upcoming modules, (4) prerequisites or assumed knowledge, and (5) a pre-assessment or diagnostic prompt. For micro-courses (≤7 lessons), compress this into the first 20% of lesson 1. For larger courses, dedicate a full standalone module. **Priority: MUST**

### Content sequencing follows six established patterns

Reigeluth's Elaboration Theory (_Journal of Instructional Development_, 1979) provides the most comprehensive framework for content sequencing. The core principle: **begin with the simplest, most fundamental version of the whole task, then progressively elaborate**. Van Patten, Chao & Reigeluth (1986, _Review of Educational Research_) synthesized six sequencing strategies, each suited to different content types:

1. **Simple → Complex** (easy-to-difficult): For skills and procedures
2. **Concrete → Abstract**: Present tangible examples before theoretical principles
3. **Known → Unknown**: Build from learner's existing knowledge outward
4. **General → Specific** (whole-to-part, deductive): For conceptual frameworks
5. **Hierarchical** (prerequisite-first): For intellectual skills with dependency chains
6. **Procedural** (step-by-step): For sequential tasks

The AI system should **detect which sequencing strategy best fits the source material** based on content classification from the prior analysis stage, then apply it. Technical/procedural content → hierarchical or procedural sequencing. Conceptual/theoretical content → general-to-specific or known-to-unknown. Mixed content → simple-to-complex as the default.

**Concrete rule:** The LLM prompt should include instructions to identify the dominant content type and select the appropriate sequencing strategy. Default to simple-to-complex when content type is ambiguous. **Priority: MUST**

### The optimal course arc synthesizes multiple frameworks

The five-stage arc — **Hook → Foundation → Deep Dive → Application → Reflection** — is not a single named theory, but it maps precisely onto convergent frameworks. Gagné's nine events scale from lesson to course level. Keller's ARCS (Attention → Relevance → Confidence → Satisfaction) follows the same trajectory. The "funneling" narrative pattern identified by Risepoint/Wiley moves from foundational to complex. Simon Kavanagh's Learning Arches model structures each unit as **Set → Hold → Land**.

This arc provides a concrete template for the AI:

- **First ~10% of course**: Hook + orientation (why this matters, what you'll learn, where you're starting from)
- **Next ~20%**: Foundation (core concepts, vocabulary, simple frameworks)
- **Middle ~40%**: Deep dive (complex content, multiple perspectives, detailed instruction)
- **Next ~20%**: Application (practice, projects, scenarios, synthesis)
- **Final ~10%**: Reflection (summary, post-assessment, transfer, next steps)

**Concrete rule:** When generating a course outline, allocate modules roughly following this distribution. Validate that the first module is not content-heavy and the last module is not introducing new concepts. **Priority: SHOULD**

### How many lessons per module? Evidence points to 3-7

No peer-reviewed study establishes a precise optimal count, but converging evidence supports **3-7 lessons per module**. Miller's (1956) famous 7±2 chunks has been revised downward by Cowan (2001, _Behavioral and Brain Sciences_) to **4±1 chunks** for true working memory capacity. Thalmann, Souza & Oberauer (2019, _Journal of Experimental Psychology_) confirmed that chunking genuinely reduces working memory load.

Practitioner consensus from Raccoon Gang, Thinkific, and multiple university course design guides clusters around 3-5 lessons per module. The key principle is that each module should represent **one coherent learning objective or theme** that can be mentally "chunked" as a unit.

**Concrete rule:** Target 3-5 lessons per module for most courses. Allow up to 7 for content-dense modules. Never exceed 7 — split into sub-modules instead. For micro-courses with ≤7 total lessons, use a flat structure (no modules). **Priority: SHOULD**

---

## 3. Scaffolding structure differently across domains

### Technical courses need task-based organization

The **4C/ID Model** (van Merriënboer, 1997; _Ten Steps to Complex Learning_, 2024 edition) is the gold standard for complex skills training. It organizes learning around four components: learning tasks (authentic whole tasks in ascending complexity), supportive information (theory for non-routine aspects), procedural information (just-in-time step-by-step guidance), and part-task practice (drills for skills requiring automaticity).

For technical/skills courses, the AI should organize modules around **whole tasks at increasing complexity levels** rather than isolated concept categories. Each module represents a task class — a set of equivalently complex tasks. Within each module, scaffolding fades from worked examples to independent practice.

**Concrete rule:** When source material is classified as procedural/technical, structure modules as: "Build [simple thing]" → "Build [moderately complex thing]" → "Build [complex thing]" rather than "Learn concept A" → "Learn concept B" → "Learn concept C." **Priority: SHOULD**

### Conceptual courses need idea-based organization

Erickson & Lanning's Concept-Based Curriculum (CBC) and Hansen's Idea-Based Learning both prescribe organizing around **big ideas and essential questions** rather than topic coverage. Theory courses benefit from thematic or comparative organization, with modules structured around enduring understandings. Progressive differentiation (Ausubel) applies: present the most general, inclusive concepts first, then progressively differentiate into specifics.

**Concrete rule:** For conceptual/theory content, generate 3-5 essential questions the course will answer. Each module addresses one essential question. Use thematic rather than chronological organization unless the content is inherently historical. **Priority: SHOULD**

### Soft skills courses need scenario-based organization

Research from the _European Journal of Work and Organizational Psychology_ (2024) and the COM-B behavioral framework confirm that soft skills training must address behavioral change, not just knowledge transfer. The COMPASS model emphasizes that training must be timely, targeted, and championed. Branching scenarios — where learners make decisions and see consequences — are the most effective design pattern.

**Concrete rule:** For soft skills content, structure each module around a specific behavioral situation or interpersonal scenario rather than an abstract principle. Frame modules as "Handling [situation]" rather than "Understanding [concept]." **Priority: SHOULD**

### Converting flat documents into learning progressions

When source material lacks inherent pedagogical structure (a common scenario for uploaded PDFs), the AI must impose structure. SHIFT eLearning's evidence-informed process prescribes: **(1)** Classify each piece of content by type (fact, concept, procedure, principle), **(2)** Identify prerequisite dependencies between pieces, **(3)** Group related content into clusters, **(4)** Sequence clusters from foundational to advanced, **(5)** Separate "need to learn actively" from "reference material," **(6)** Add learning objectives, practice, and assessment for each cluster.

**Concrete rule:** The document analysis stage should output a dependency graph and content-type classification. The structure generation prompt should use these to impose a learning progression. Content classified as reference material should be flagged as supplementary, not given standalone lessons. **Priority: MUST**

### The universal course spine works regardless of topic

Despite domain-specific adaptations, every well-designed course shares a universal internal structure at the module level, supported by Gagné's framework, Quality Matters standards, and the 5E Model (BSCS: Engage → Explore → Explain → Elaborate → Evaluate):

1. **Opening**: Activate prior knowledge, state objectives, hook/motivator
2. **Instruction**: Chunked, multi-modal content presentation with guided examples
3. **Practice**: Application activities with feedback
4. **Assessment**: Formative or summative check on mastery
5. **Bridge**: Summary, synthesis, explicit connection to next module

**Concrete rule:** Every generated module must contain these five structural slots regardless of domain. The LLM should validate that no module is purely content delivery without practice, and no module ends without a bridge. **Priority: MUST**

---

## 4. Evidence-based rules for lesson sequencing within modules

### First lesson: the advance organizer

David Ausubel's advance organizer theory (1960, 1968) provides the strongest empirical basis for first-lesson design. An advance organizer is "appropriately relevant and inclusive introductory material presented at a higher level of abstraction, generality, and inclusiveness" than the content that follows. A meta-analysis by Luiten, Ames & Ackerson (1980) confirmed advance organizers facilitate both learning and retention. Ausubel's most cited principle: **"The most important single factor influencing learning is what the learner already knows. Ascertain this and teach him accordingly."**

Mayer's Pre-training Principle (2009, _Multimedia Learning_) adds that people learn better when they know the names and characteristics of key concepts before the main lesson — pre-training builds initial schemas that scaffold complex information.

**Concrete rule for module-opening lessons:** Must contain: (1) a hook — question, scenario, or surprising fact; (2) an advance organizer providing a high-level framework at a higher abstraction level than the module content; (3) explicit learning objectives; (4) a prior knowledge activation prompt; (5) a visual overview/roadmap of the module; (6) for modules after the first, an explicit bridge from the previous module. **Priority: MUST**

### Last lesson: consolidation and bridge

Great Minds' research-informed "Launch-Learn-Land" framework prescribes that the "Land" component should intentionally create an opportunity to close with content relevant to the next lesson. University of Michigan's CRLT emphasizes that the last moments of instruction benefit from the **recency effect** — what happens last is remembered most vividly. Gagné's Event 9 (Enhance Retention and Transfer) explicitly targets this moment.

**Concrete rule for module-closing lessons:** Must contain: (1) a consolidation summary of key concepts (ideally requiring learner synthesis, not just a recap); (2) a formative assessment or self-check covering the module; (3) a transfer exercise applying knowledge to a new context; (4) a reflection prompt ("What was most surprising? How would you apply this?"); (5) an explicit bridge previewing the next module. **Priority: MUST**

### Bruner's spiral curriculum: revisit, don't repeat

Jerome Bruner (_The Process of Education_, 1960) proposed that "a curriculum as it develops should revisit basic ideas repeatedly, building upon them until the student has grasped the full formal apparatus." Harden & Stamper (1999, _Medical Teacher_) formalized four features: topics are revisited multiple times, **complexity increases with each revisit**, new learning connects to old learning, and it is explicitly not simple repetition.

For course generation, this means the AI should map core concepts across multiple modules. A concept introduced in Module 2 should reappear in Module 5 at a deeper level and again in Module 8 in an applied context. This also addresses the spacing effect (see below).

**Concrete rule:** Identify 5-8 core concepts for any course. Each must appear in at least 3 modules at increasing complexity levels. When a concept reappears, the lesson text should explicitly reference the earlier treatment. Generate a concept-module matrix as a validation artifact. **Priority: SHOULD**

### Spaced repetition: the most robust finding in learning science

The spacing effect is **one of the most robust findings in all of cognitive psychology**. Cepeda et al. (2006, _Psychological Bulletin_) synthesized 839 assessments across 317 experiments: spaced learning consistently outperforms massed learning. Cepeda et al. (2008, _Psychological Science_) found the optimal spacing gap is approximately **10-20% of the desired retention interval**, and optimal spacing improved recall by up to 150%.

Combined with the testing effect — Roediger & Karpicke (2006, _Psychological Science_) found students who took practice tests remembered **50% more** after one week than those who restudied — this has powerful structural implications.

**Concrete rule:** Each module's assessment should include **20-30% questions from previous modules** (cumulative review). Key concepts must be revisited at expanding intervals. Include a dedicated cumulative review activity every 3-4 modules. Never test only the current module's content. **Priority: MUST**

---

## 5. Course bookends: first and last lessons of the entire course

### The first lesson determines whether learners continue

MOOC research (Jordan, 2015, _IRRODL_) analyzing 221 courses found that the first two weeks are decisive — after week 2, active student numbers stabilize. Marzano (1998) reported an effect size of **0.97** for goal specification at course start, meaning achievement rose by 34 percentile points when clear goals were stated upfront. SHIFT eLearning documents a well-established "halo effect" where learners' first impression shapes their entire course perception.

The first lesson of any course should contain these elements in order:

1. **Motivational hook**: A compelling scenario, question, or problem that makes the learner care (Gagné Event 1, ARCS-Attention)
2. **The "why"**: Explicit statement of what the learner will gain and why this knowledge matters (ARCS-Relevance)
3. **Course-level learning objectives**: Measurable outcomes using Bloom's verbs (QM Standard 2.1)
4. **Course roadmap**: Visual or narrative overview of the learning journey — module titles, themes, progression (QM Standard 1.2)
5. **Prerequisites**: What the course assumes the learner already knows (QM Standard 1.7)
6. **Pre-assessment/diagnostic**: Low-stakes, ungraded check that establishes a baseline and primes the brain via the testing effect

**Concrete rule:** The course introduction is **templated structure, not generated from source content**. The LLM should generate content _for_ this template (the hook, the "why," the objectives) but the structural skeleton is fixed. Validate that the first lesson never dives into substantive content. **Priority: MUST**

### The last lesson creates closure and transfer

The APS (Association for Psychological Science) found that **90% of students would appreciate more closure** on their courses, yet only 42% of faculty take time to provide it. Gagné's Event 9 and Brownell & Swaner (2010, _Five High-Impact Practices_, AAC&U) both identify capstone/synthesis experiences as critical for lasting learning.

The final lesson should contain:

1. **Summary of the learning journey**: A narrative or visual recap connecting all modules — showing how far the learner has come
2. **Post-assessment**: Parallel to the pre-assessment, enabling measurement of growth
3. **Reflection activity**: Metacognitive prompt — "What was most valuable? How has your understanding changed?"
4. **Transfer to real-world application**: Explicit guidance on applying course knowledge in practice
5. **Next steps**: Recommended further learning, resources, communities
6. **Celebration/achievement moment**: Recognition of completion

**Concrete rule:** Like the first lesson, the last lesson is templated. The LLM fills template slots with course-specific content but does not generate new instructional content here. Validate that the final lesson introduces no new concepts. **Priority: MUST**

### Bookend mirroring creates perceived growth

Dr. Judith Boettcher's "Designing for Learning" framework borrows from screenwriting: the opening presents a problem or scenario, and the closing returns to it, revealing how the learner's understanding has transformed. This creates a powerful sense of growth.

**Concrete rule:** The motivational hook in lesson 1 should pose a question or scenario. The final lesson should explicitly revisit that same question/scenario and show how the course has equipped the learner to address it. Pre-assessment questions should have near-identical post-assessment counterparts for valid comparison. **Priority: SHOULD**

---

## 6. Making structure generation flexible yet principled across course sizes

### Scaling rules from micro-courses to comprehensive courses

The structural principles above are universal, but their _implementation_ must adapt to course size. Based on practitioner consensus across multiple university course design programs and microlearning research (iSpring, Digital Learning Institute, ATD):

| Course size                | Hierarchy                    | Orientation                       | Conclusion                           | Lessons/module |
| -------------------------- | ---------------------------- | --------------------------------- | ------------------------------------ | -------------- |
| **Micro (3-7 lessons)**    | Flat (no modules)            | Embedded in first 20% of lesson 1 | Embedded in last 20% of final lesson | N/A            |
| **Short (8-20 lessons)**   | 3-5 modules                  | 1 dedicated lesson                | 1 dedicated lesson                   | 3-5            |
| **Medium (21-50 lessons)** | 5-10 modules                 | 1-2 lessons                       | 1-2 lessons                          | 3-7            |
| **Large (51-100 lessons)** | Sections → Modules → Lessons | 2-3 lessons as a module           | 2-3 lessons as a module              | 3-7            |

Ferguson & Clow (2015, _Open Learning_) found that splitting the same MOOC content from a 6-week course into two 3-week blocks **quadrupled completion rates**. This strongly supports modularization — each module should feel like a self-contained achievement milestone.

**Concrete rule:** Implement a scaling function: `if lessons ≤ 7: flat structure; if 8-20: one level of modules; if 21-50: modules with internal structure; if >50: two-level hierarchy (sections containing modules)`. The percentage of bookend content decreases as course size grows (from ~33% for micro to ~5% for large), but absolute amount increases. **Priority: MUST**

### What should be templated vs. generated

Based on analysis of university course templates (Oregon, UT Austin, Lane CC, Cal State Fullerton) and Quality Matters requirements, certain structural elements should be **fixed templates** while others should be **dynamically generated**:

**Always templated (fixed structural skeleton):**

- Presence of a welcome/orientation element (content generated, structure fixed)
- Presence of a conclusion/wrap-up element
- Internal module pattern: Overview → Content → Practice → Assessment → Bridge
- Pre-assessment placement (start) and post-assessment placement (end)
- Consistent structure across all modules (QM Standard 8.1 — navigation ease)

**Always generated dynamically:**

- Number of modules and their themes (from content analysis)
- Sequencing strategy (detected from content type)
- Types of practice activities (matched to content type and Bloom's level)
- Depth of hierarchy (from lesson count)
- Specific learning objectives (from source material)
- Balance of content types within modules

**Concrete rule:** The system should have a fixed structural grammar (like a context-free grammar) that defines valid course structures, and the LLM generates content to fill the slots. The grammar enforces: first element = orientation, last element = conclusion, every module = {overview, content+, practice+, assessment, bridge}, difficulty is non-decreasing. The LLM should never be able to produce a course that violates this grammar. **Priority: MUST**

### Micro-course adaptations

For courses of 3-5 lessons, the standard module pattern compresses. Each lesson follows the "atomic state" principle — one learning outcome, one content chunk, one practice activity. Research from Guo, Kim & Rubin (2014, ACM L@S) analyzing **6.9 million video sessions** found engagement peaks at **6 minutes** and drops sharply after 12 minutes, suggesting each micro-lesson should be brief and focused.

The minimum viable course structure for a 3-lesson micro-course:

- **Lesson 1**: Hook + context + objective + first core concept + practice
- **Lesson 2**: Core concept(s) + practice + formative check
- **Lesson 3**: Final concept + synthesis + reflection + transfer prompt

**Priority: SHOULD**

---

## Consolidated implementation rules with priority ratings

The following table distills all findings into a prioritized rule set for the AI course generation system. Rules marked MUST are essential for pedagogical quality; SHOULD rules meaningfully improve learning outcomes; COULD rules add polish.

### MUST rules (non-negotiable for quality)

**Rule 1 — Always generate an orientation element.** Every course begins with: motivational hook, course-level objectives, roadmap, prerequisites, pre-assessment. Source: QM Standards 1.1-1.2, Gagné Events 1-3, MOOC attrition research.

**Rule 2 — Always generate a conclusion element.** Every course ends with: summary of journey, post-assessment mirroring pre-assessment, reflection, transfer guidance, next steps. Source: Gagné Event 9, APS closure research, Boettcher bookend model.

**Rule 3 — Hierarchically aligned objectives.** Course-level objectives → Module-level objectives → Lesson-level objectives, each using Bloom's action verbs. Every lesson maps to a module objective. Source: ADDIE Design phase, QM Standards 2.1-2.5, Constructive Alignment.

**Rule 4 — Prerequisite-driven sequencing.** Identify dependency relationships between topics. Foundational content precedes dependent content. Source: Dick & Carey instructional analysis, Reigeluth Elaboration Theory.

**Rule 5 — Ascending cognitive complexity.** Bloom's levels shift upward across the course: early modules emphasize Remember/Understand, middle modules Apply/Analyze, final modules Evaluate/Create. Source: Bloom's revised taxonomy, ASU empirical study with 213 students.

**Rule 6 — Universal module spine.** Every module contains: opening (hook + objectives + prior knowledge activation) → content → practice with feedback → assessment → bridge to next module. Source: Gagné's 9 Events, QM standards, 5E Model.

**Rule 7 — Spaced cumulative review.** Each module's assessment includes 20-30% items from previous modules. A cumulative review appears every 3-4 modules. Source: Cepeda et al. (2006, 2008), Roediger & Karpicke (2006). Evidence strength: very strong.

**Rule 8 — Scaled hierarchy.** ≤7 lessons = flat; 8-20 = one module level; 21-50 = modules; >50 = sections + modules. 3-7 lessons per module. Source: Cowan working memory capacity, practitioner consensus, QM Standard 8.1.

**Rule 9 — First lesson introduces no substantive content.** The opening lesson (or opening section of lesson 1 in micro-courses) is dedicated to orientation, motivation, and goal-setting. Source: QM Standards, Marzano effect size 0.97 for goal specification.

**Rule 10 — Last lesson introduces no new content.** The closing lesson is dedicated to synthesis, reflection, and transfer. Source: Gagné Event 9, recency effect, APS research.

### SHOULD rules (meaningfully improve quality)

**Rule 11 — Problem-centered framing.** Modules framed around real-world problems/tasks rather than abstract topics. Source: Merrill's First Principles (2002).

**Rule 12 — Worked example fading.** Within modules, early lessons use complete worked examples; later lessons progressively remove scaffolding until the learner works independently. Source: Sweller & Cooper (1985), Renkl et al. (2004). Evidence: strong.

**Rule 13 — Spiral curriculum.** 5-8 core concepts revisited across at least 3 modules at increasing complexity. Explicit cross-references between appearances. Source: Bruner (1960), Harden & Stamper (1999).

**Rule 14 — Bookend mirroring.** Opening hook/scenario revisited in the conclusion to demonstrate learner growth. Pre-assessment parallels post-assessment. Source: Boettcher bookend model, screenwriting pedagogy.

**Rule 15 — Domain-adaptive sequencing.** Technical content → task-based organization (4C/ID). Conceptual content → idea/theme-based with essential questions. Soft skills → scenario-based with branching decisions. Source: van Merriënboer (1997), Erickson & Lanning CBC, COMPASS model.

**Rule 16 — Content-type-based sequencing strategy.** Select from: simple→complex, concrete→abstract, known→unknown, general→specific, hierarchical, or procedural based on detected content type. Default to simple→complex. Source: Van Patten, Chao & Reigeluth (1986), Morrison, Ross & Kemp (2007).

**Rule 17 — Advance organizers for each module.** First lesson of each module provides a high-level conceptual framework before detail. Source: Ausubel (1960, 1968), Luiten et al. (1980) meta-analysis, Mayer Pre-training Principle.

**Rule 18 — Explicit bridge lessons.** Last lesson of each module previews the next module's content, explaining how current learning leads there. Source: Great Minds "Land" component, Gagné Event 9.

### COULD rules (add polish and engagement)

**Rule 19 — ARCS motivation overlay.** Each module explicitly states relevance ("why this matters to you"). Early modules provide confidence-building "easy wins." Variety in activity types maintains attention. Source: Keller ARCS Model (1987).

**Rule 20 — Interleaved practice.** Within review activities, mix problem types from different modules rather than blocking by module. Source: Rohrer et al. (2015), Brunmair & Richter (2019) meta-analysis.

**Rule 21 — Three-tier content prioritization.** Source material classified as Tier 1 (enduring understandings), Tier 2 (important), Tier 3 (supplementary/reference). Only Tier 1-2 get dedicated lessons. Source: Wiggins & McTighe UbD (2005).

**Rule 22 — Flow-optimized difficulty curve.** Difficulty increases smoothly with no sudden spikes or extended plateaus — matching Csikszentmihalyi's skill-challenge balance channel. Source: Flow theory (1990). Evidence: moderate.

**Rule 23 — Learner autonomy points.** For courses >20 lessons, include at least one optional module or path choice. Source: Ryan & Deci Self-Determination Theory (2000). Evidence: strong for motivation, indirect for structure.

---

## Conclusion: from topic list to learning journey

The gap between a flat topic list and a genuine learning journey is defined by seven structural transformations that this research consistently supports. First, structure should be **derived from objectives, not from source material headings** — backward design ensures every element earns its place. Second, **sequencing must respect cognitive dependencies** — prerequisite analysis and Bloom's progression prevent the disorienting jumps that make AI-generated courses feel random. Third, **every module needs internal architecture** — Gagné's events provide a universal skeleton that works for any content in any language. Fourth, **the course needs bookends** — a motivational opening and a reflective close transform a collection of modules into a coherent narrative. Fifth, **spaced cumulative review** must be woven into the structure, not bolted on — this is the single highest-impact intervention supported by cognitive science. Sixth, **scaffolding must fade** — the expertise reversal effect demands that the system provide more guidance early and progressively remove it. Seventh, **structure must scale** — a fixed grammar of valid course structures, parameterized by lesson count, ensures the same principles produce coherent 5-lesson micro-courses and 80-lesson comprehensive programs.

The most impactful near-term improvement for the platform is likely implementing Rules 1-2 (mandatory orientation and conclusion elements) and Rule 6 (universal module spine), as these address the three specific complaints — no introductory modules, no logical progression, and flat topic list feeling — with minimal architectural change. Rules 4-5 (prerequisite sequencing and Bloom's progression) would require the document analysis stage to output dependency and complexity metadata, but would transform the perceived quality of generated course outlines. Together, these rules convert the LLM from a content organizer into a learning experience architect.
