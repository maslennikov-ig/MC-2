# The 25 elements that turn a role guide into a competitive weapon

**The gap between ordinary job descriptions and extraordinary role guides isn't length — it's architecture.** After analyzing role documentation from GitLab, Netflix, Amazon, Valve, Basecamp, Buffer, Spotify, Bridgewater, Stripe, and Toyota, alongside frameworks from 14 influential business books and the latest thinking from Stanford, Bain, and Management 3.0, a clear pattern emerges: the best role guides share elements that 95% of companies skip entirely. These missing elements are what make a business owner say "this is exactly what I needed."

What follows is a prioritized list of the **25 most impressive, universal, and automatable "wow" elements** for a role guide generator. Each element was evaluated against four criteria: works for any role, actionable for business owners (not HR jargon), has genuine novelty factor, and can be AI-generated from a role description. The elements are ranked by combined impact across all four dimensions.

---

## The top tier: elements that redefine role clarity

### 1. Anti-goals — what this role should explicitly NOT do

**What it is.** A defined list of tasks, behaviors, and scope expansions the role-holder should actively refuse. Inspired by Charlie Munger's inversion principle ("tell me where I'm going to die, so I'll never go there"), anti-goals define the boundaries of a role by naming what falls outside them.

**Why it impresses.** Scope creep is the silent killer of role effectiveness. When a business owner reads "This role does NOT own client billing — that's Finance" or "This person should NOT attend every meeting 'just in case,'" they feel an instant wave of clarity. Anti-goals protect their investment in the hire by preventing the gradual accumulation of unrelated tasks that makes roles unmanageable. Andrew Wilkinson of Tiny/Metalab popularized anti-goals in a viral 2017 piece, and the concept maps directly to Holacracy's "domains" — areas where other roles need explicit permission to act.

**Applies to:** Every role, every department, every level.

**Real example.** Holacracy organizations (Zappos, 1,500+ employees) define "domains" — areas of exclusive authority — that function as structural anti-goals. GitLab's handbook uses "this role does NOT manage" language in several job family definitions.

**Markdown implementation:**

```
## 🚫 Anti-goals: what this role is NOT
- Does NOT manage client invoicing or collections (Finance owns this)
- Should NOT be the single point of contact for IT issues
- Should NOT attend cross-departmental meetings without a clear action item
- If you find yourself regularly doing any of the above, flag it immediately
```

---

### 2. Decision authority matrix — the autonomy spectrum for every key decision

**What it is.** A structured map of 10–15 key decisions the role faces, each assigned a specific authority level. Uses Jurgen Appelo's Management 3.0 seven-level delegation model: **Tell → Sell → Consult → Agree → Advise → Inquire → Delegate.** For each decision area, the role-holder knows exactly whether they decide alone, decide and inform, recommend to their manager, or need full approval.

**Why it impresses.** David Marquet's research aboard the USS Santa Fe proved that the #1 unlock for performance is answering one question: "which decisions are mine to make?" When a business owner sees a matrix showing "vendor selection under $5K → fully autonomous" and "headcount requests → recommend to manager," they instantly see how the role will operate day-to-day without bottlenecks or confusion. Atlassian uses DACI (Driver, Approver, Contributors, Informed) as a core governance tool, and McKinsey found projects using such frameworks have **25% higher success rates**.

**Applies to:** Every role. Junior roles have more "Tell/Sell" decisions; senior roles have more "Advise/Delegate."

**Real example.** Miro hosts an official Delegation Board template based on Appelo's model. Intuit developed the DACI framework in the 1980s; Atlassian standardized it across their Team Playbook.

**Markdown implementation:**

```
## 🎯 Decision authority map
| Decision area | Authority level | Notes |
|---|---|---|
| Day-to-day task prioritization | 7 — Full autonomy | Inform manager weekly |
| Vendor selection under $5K | 6 — Decide, then share | Log in procurement system |
| Hiring for the team | 4 — Collaborative decision | Manager + this role agree together |
| Budget allocation over $10K | 3 — Recommend | Prepare proposal for director |
| Strategic partnerships | 2 — Advise only | VP makes final call |
```

---

### 3. Failure modes pre-mortem — the three most common ways people fail in this role

**What it is.** Pre-documented patterns of how people typically fail in a specific role, including early warning signs and preventive actions. Functions as a "pre-mortem" — instead of analyzing failure after it happens, you name the monsters before the new hire encounters them. Based on a Leadership IQ study of 20,000+ hires across 312 organizations.

**Why it impresses.** That study found **46% of new hires fail within 18 months**, and 89% of those failures stem from attitude and soft-skill issues — not technical gaps. When a business owner sees "The #1 failure mode for this role is trying to do everything solo — early warning sign: skipping 1:1s and not delegating," they recognize the pattern from past bad hires. This section transforms a $50K–$200K+ hiring risk into a manageable, documented playbook. No other role guide element demonstrates this level of forethought.

**Applies to:** Every role. Failure patterns vary (individual contributors fail differently than managers), but the concept is universal.

**Real example.** Valve's employee handbook includes "What if I screw up?" and "What if we ALL screw up?" sections that normalize failure. Netflix's "sunshining" practice documents mistakes openly.

**Markdown implementation:**

```
## ⚠️ Failure modes: how people typically fail in this role
| Failure pattern | Early warning signs | Prevention |
|---|---|---|
| **Trying to do everything solo** | Skips 1:1s, won't delegate, becomes bottleneck | Weekly delegation check-in with manager |
| **Over-indexing urgent vs. important** | Reactive calendar, strategic work slips | Time-block 4 hrs/week for strategic work |
| **Avoiding difficult conversations** | Festering performance issues, growing resentment | Monthly direct-report feedback cycle |

> 💡 89% of new-hire failures are attitude/soft-skill issues, not technical gaps (Leadership IQ, 20,000+ hires studied)
```

---

### 4. Outcome-based role purpose — defining the role by what it changes, not what it does

**What it is.** Replacing traditional "responsibilities" language with outcome definitions. Josh Seiden's framework defines an outcome as "a change in human behavior that drives business results." Instead of "Manage the company blog and publish 3 posts/week," write "Increase the percentage of website visitors who engage with educational content and convert to trial users." Geoff Smart's Job Scorecard (from _Who: The A Method for Hiring_) uses the same principle: **3–8 specific, measurable outcomes** ranked by importance, each time-bound.

**Why it impresses.** The "aha moment" is immediate: "You mean I should define what this role ACHIEVES, not just what they do all day?" Smart's research shows that scorecards focused on outcomes — not activity lists — are the single biggest differentiator between companies that hire A-players and those that don't. Andy Grove reinforced this in _High Output Management_: **measure roles by output, not activity**, and pair every output indicator with a quality indicator to prevent gaming.

**Applies to:** Every role, from warehouse associate to CEO.

**Real example.** ghSMART's Job Scorecard structure (Mission → Outcomes → Competencies) has been deployed across thousands of companies. Google's OKR system makes individual outcomes visible to the entire company.

**Markdown implementation:**

```
## 🎯 Role mission and key outcomes
**Mission:** Ensure every customer interaction creates lasting loyalty that drives repeat revenue.

**Key outcomes (ranked by priority):**
1. Improve customer NPS from 42 to 60 by Q4 2026
2. Reduce average ticket resolution time from 4.2 hours to 2.5 hours
3. Increase customer retention rate from 78% to 88% within 12 months
4. Build and document 15 reusable response playbooks for the top issue categories

> Each outcome is measurable, time-bound, and within this role's control.
```

---

### 5. The "superpowers needed" — the 1–2 things where this person must be exceptional

**What it is.** Instead of listing 15–20 requirements that produce well-rounded mediocrity, this section names the **one or two exceptional capabilities** that will make someone 10x effective in this role. Everything else can be "good enough" or covered by teammates and AI. Whitney Johnson (HBR) developed the superpower identification framework; McKinsey's T-shaped model emphasizes "a spike of specific expertise."

**Why it impresses.** Business owners are tired of hiring "Swiss Army knives" who are decent at everything and exceptional at nothing. When they read "This role's primary superpower is turning chaos into systems — everything else is secondary," the hiring conversation transforms. Research from the Talent Strategy Group shows star performers produce **5–50x the output** of average performers, and that multiplier comes from spikes, not balance.

**Applies to:** Every role. A sales role might need "closing under uncertainty" as a superpower; an operations role might need "process design from scratch."

**Real example.** Amazon acknowledges the "superpowers" concept explicitly — employees have standout strengths beyond the Leadership Principles, and teams are built to complement each other's spikes and weaknesses. Valve's handbook prizes "T-shaped" people: broad skills with one deep spike.

**Markdown implementation:**

```
## ⚡ Superpowers needed
**Primary superpower:** Translating ambiguous business needs into structured, repeatable processes
> This is the ONE thing that separates great from good in this role.

**Supporting strength:** Cross-functional influence without positional authority

**"Good enough" areas** (can be augmented by team or tools):
- Data visualization (use templates and BI tools)
- Technical troubleshooting (lean on engineering team)
- Copywriting (use AI drafting tools, have marketing review)
```

---

## The high-impact middle tier: elements that create operational clarity

### 6. Time allocation pie chart — ideal percentage split across responsibilities

**What it is.** A visual breakdown showing how the role should ideally divide its time across major categories of work. Asana's Wavelength blog recommends creating "ideal vs. actual" pie charts and comparing them quarterly to rebalance.

**Why it impresses.** When a business owner sees "this role should spend 30% on strategic work but our person spends 30% in meetings," the problem and solution become immediately obvious. It makes invisible time trade-offs visible and creates a shared language for conversations about workload.

**Applies to:** Every role. The categories change (a developer's split looks different from a sales manager's), but the concept is universal.

**Real example.** Asana, SlideTeam, and multiple consultancies publish time allocation templates for managers (e.g., 25% people management, 20% planning, 30% execution, 15% stakeholders, 10% learning).

**Markdown implementation:**

```
## ⏰ Ideal time allocation
| Category | Target % | ~Hours/week | Notes |
|---|---|---|---|
| 🎯 Strategic/planning work | 25% | 10 hrs | Protected deep-work blocks |
| 📊 Core execution/delivery | 30% | 12 hrs | Primary output production |
| 👥 People and team | 20% | 8 hrs | 1:1s, coaching, hiring |
| 🤝 Stakeholder management | 15% | 6 hrs | Cross-functional, upward |
| 📚 Learning/development | 10% | 4 hrs | Industry, skills, reading |

> 🚨 **Red flag:** If meetings exceed 50% of calendar, escalate to manager for rebalancing
```

---

### 7. Role dependencies and blast radius — who is blocked if this person doesn't deliver

**What it is.** A map of every upstream role (who provides inputs to this role) and downstream role (who depends on this role's outputs), plus a "blast radius" analysis: what breaks if this role is vacant or underperforming for two weeks. Borrowed from Atlassian's Dependency Mapping Play and eBRP's business continuity framework.

**Why it impresses.** Traditional role descriptions exist in isolation. This section makes the role's organizational gravity visible. When a business owner reads "If this role goes unfilled, the sales team loses pipeline visibility within 3 days and marketing can't report on campaign ROI within 2 weeks," the role's priority becomes objectively clear — not based on gut feeling but on cascading impact.

**Applies to:** Every role. Even entry-level positions have downstream dependencies.

**Real example.** Atlassian's Team Playbook includes a one-hour Dependency Mapping exercise that identifies systems impacted, risks, mitigations, and feedback loops. Toyota's standardized work system maps each role to its upstream and downstream stations.

**Markdown implementation:**

```
## 🔗 Role dependencies: who is blocked if this role doesn't deliver
**Upstream (this role depends on):**
- Product team → feature specs and roadmap priorities
- Data engineering → clean data pipelines

**Downstream (depends on this role):**
- Sales team → pipeline reports and forecasts (blocked within 3 days)
- Executive team → board-ready metrics (blocked within 2 weeks)
- Marketing → campaign ROI attribution (blocked within 1 week)

**Blast radius if role is vacant 2+ weeks:** 🔴 High — 4 teams directly impacted
```

---

### 8. Business context section — how this role connects to revenue and strategy

**What it is.** A plain-language explanation of how the business makes money, where this role sits in the value chain, what the company's current strategic challenges are, and which metrics matter most right now. Patty McCord (_Powerful_) calls this "context over control" — Netflix's foundational management principle. The idea: if people understand the business deeply enough, they make better decisions without needing rules.

**Why it impresses.** McCord's core insight: **"When context fails, the person fails. Your first question when someone underperforms shouldn't be 'What's wrong with them?' but 'Where did the context fail?'"** Most role guides assume the reader already understands the business. Spelling it out — in one paragraph — transforms the role-holder from task executor to business partner. Netflix builds this into every role conversation; their culture memo calls it providing "sunlight" so people can navigate independently.

**Applies to:** Every role. Even a warehouse associate benefits from understanding how their speed affects delivery promises and customer retention.

**Real example.** Netflix's culture memo serves as the universal business context document. Stripe's onboarding doc reads "like a compelling essay with references to Tyler Cowen and Richard Feynman" rather than an HR manual, embedding business context into every page.

**Markdown implementation:**

```
## 🏢 Business context: why this role matters now
**How we make money:** SaaS subscriptions (80%) and professional services (20%), with expansion revenue driving growth.

**Where this role sits:** Between product development and customer success — you translate what we build into what customers actually adopt.

**Current strategic challenge:** Churn in the mid-market segment is 18% annually. This role directly attacks that number by ensuring customers see value within their first 60 days.

**The metric that matters most right now:** Time-to-value for new mid-market accounts (currently 45 days, target: 21 days).
```

---

### 9. Definition of done for each key responsibility

**What it is.** Borrowed from Agile/Scrum engineering teams, applied universally: for each major responsibility in the role, explicitly define what "done well" looks like with measurable acceptance criteria. Transforms vague duties ("manage the sales pipeline") into accountable outputs with specific quality standards.

**Why it impresses.** Business owners frequently complain that employees "aren't doing their job" — but the real problem is that "their job" was never defined with enough specificity to evaluate. When a role guide specifies "Pipeline management is DONE when: all deals >$10K have next-action dates, pipeline is updated weekly in CRM, monthly review deck is delivered by the 1st," disagreements about performance evaporate. Atlassian describes this as "a shared set of criteria that determines when work is complete."

**Applies to:** Every role and every responsibility within it.

**Real example.** Every engineering team at Atlassian, Spotify, and GitLab uses DoD. The concept extends naturally to non-engineering roles — marketing teams define DoD as "content reviewed by legal, published on all channels, tracking UTMs verified."

**Markdown implementation:**

```
## ✅ Definition of done: key responsibilities
### "Manage client relationships"
Done looks like:
- [ ] Every client account contacted minimum 1x/month
- [ ] NPS survey sent quarterly; responses logged in CRM
- [ ] Escalation issues resolved or escalated within 24 hours
- [ ] Quarterly business review deck delivered 5 days before meeting
- [ ] Client health score updated weekly (Green/Yellow/Red)
```

---

### 10. Stakeholder map — who cares about this role's output and why

**What it is.** A structured map of every person and group the role interacts with, categorized by their influence level and interaction frequency. Uses the Power-Interest Grid (Mendelow Matrix) with four quadrants: Manage Closely (high power, high interest), Keep Satisfied (high power, low interest), Keep Informed (low power, high interest), Monitor (low power, low interest).

**Why it impresses.** New hires waste weeks figuring out "who matters" — a pre-built stakeholder map is like handing them a political map of the organization. Business owners see this as dramatically accelerating time-to-productivity. It also prevents the mistake of over-communicating with low-priority stakeholders while under-communicating with critical ones.

**Applies to:** Every role. Even individual contributors have stakeholders.

**Real example.** Miro, Confluence, and Lucidchart all offer stakeholder mapping templates. DemandFarm provides organizational hierarchy charts showing relationship ownership for sales roles.

**Markdown implementation:**

```
## 🗺️ Stakeholder map
**Manage closely (high power, frequent interaction):**
- VP of Sales — weekly 1:1, pipeline alignment, mutual dependency on revenue targets
- Product Manager — bi-weekly sync, feature requests and feedback loop

**Keep satisfied (high power, less frequent):**
- CFO — monthly budget summary, quarterly reviews only
- CEO — quarterly strategy update, ad-hoc board prep

**Keep informed (engaged but lower authority):**
- Marketing team — bi-weekly campaign sync, shared content calendar
- Customer support — weekly digest of escalation patterns
```

---

### 11. Energy map — which tasks energize vs. drain

**What it is.** Categorizing each major task within a role as "energizing" (creates flow, the person leans in) vs. "draining" (depletes focus, the person procrastinates). Rooted in Marcus Buckingham's strengths-based management research at Gallup and the CliftonStrengths framework. Used during hiring to find someone whose natural energy aligns with the role's reality.

**Why it impresses.** Most job descriptions list tasks as if all tasks are emotionally equal. They're not. When a business owner sees "This role requires 40% of time on tasks most people find draining — screen for someone who genuinely enjoys detailed compliance documentation," the hiring conversation shifts from "can they do it?" to "will they thrive doing it?" That's the difference between a 2-year hire and a 10-year hire.

**Applies to:** Every role. The specific energizing/draining split varies, but the mapping concept is universal.

**Real example.** Gallup's CliftonStrengths is used by 90% of Fortune 500 companies. Buckingham's StandOut assessment specifically maps energy-generating activities.

**Markdown implementation:**

```
## ⚡ Energy map: what this role feels like day-to-day
| Task category | ⚡ Energizing (seek this person) | 🔋 Draining (plan recovery) |
|---|---|---|
| People interaction | Client presentations, team coaching | Difficult termination conversations |
| Analytical work | Building dashboards, spotting trends | Repetitive data entry and cleanup |
| Creative work | Strategy development, brainstorming | Formatting reports to rigid templates |
| Administrative | Process design, system architecture | Expense reports, status update emails |

> 🎯 **Hiring insight:** The ideal candidate finds 60%+ of this role's core tasks energizing.
```

---

### 12. Communication charter — how, when, and where this role communicates

**What it is.** A documented protocol specifying which communication channels to use for which purposes, expected response times per channel, async vs. sync defaults, and escalation paths. Based on Workplaceless's Communication Charter framework and Atlassian's Working Agreements play.

**Why it impresses.** Research shows **74% of executives say lack of communication clarity interferes with speed.** When a business owner sees "Slack for quick questions (4-hour response), email for external (24-hour response), meetings ONLY for decisions needing discussion," they see a system that eliminates the "should I Slack, email, or schedule a meeting?" guessing game that wastes hours every week.

**Applies to:** Every role, with channel-specific customization for customer-facing vs. internal roles.

**Real example.** Atlassian's Team Playbook includes a "Communication Norms" exercise. Basecamp requires "What did you work on today?" updates 2x/week and "What will you work on this week?" weekly — defining communication cadence at the role level.

**Markdown implementation:**

```
## 📡 Communication charter
| Channel | Use for | Response time | Never use for |
|---|---|---|---|
| Slack | Quick questions, FYIs, social | 4 hrs (work hours) | Long decisions, sensitive feedback |
| Email | External comms, formal requests | 24 hours | Urgent issues, brainstorming |
| Meeting | Decisions needing discussion, 1:1s | Schedule 24hrs+ ahead | Status updates (use async) |
| Loom/video | Process demos, async updates | View within 48 hrs | Anything requiring real-time dialog |

**Escalation path:** Slack DM → phone call → manager escalation
> Response needed in <1 hour? Call. Don't Slack.
```

---

### 13. Human-AI task allocation — which responsibilities stay human and which get augmented

**What it is.** For each key responsibility, an explicit tag indicating whether the task is fully human, AI-augmented, or AI-automated. Uses Stanford SALTLab's **Human Agency Scale (HAS)**: H1 (AI handles entirely) through H5 (requires continuous human involvement), with H3 (equal human-AI partnership) as the most common sweet spot. This is the most future-forward element in the entire list.

**Why it impresses.** Most role guides in 2026 still describe roles as if AI doesn't exist. When a business owner sees "First-draft client proposals: H2 — AI generates, human reviews and personalizes" alongside "Negotiation strategy: H5 — fully human, requires judgment and relationship context," they see a role guide designed for how work actually happens today. Stanford's research found H3 (equal partnership) is the dominant desired level in **47 of 104 occupations** analyzed.

**Applies to:** Every role. Even physical roles increasingly have AI-augmented components (scheduling, quality inspection, documentation).

**Real example.** Augment Code has redefined engineering hiring around 6 AI-native capabilities. Emerging roles like Knowledge Architects and Human-AI Collaboration Leaders explicitly design around human-AI task splits.

**Markdown implementation:**

```
## 🤖 Human-AI task allocation
| Responsibility | HAS level | How it works |
|---|---|---|
| First-draft proposals | H2 — AI leads, human reviews | AI generates from templates; human personalizes |
| Data analysis and reporting | H3 — Equal partnership | AI runs models; human interprets and narrates |
| Client relationship management | H5 — Fully human | Judgment, empathy, trust-building |
| Meeting note summaries | H1 — AI automated | Auto-generated, human spot-checks weekly |
| Strategic planning | H4 — Human leads, AI supports | Human sets direction; AI provides market data |
```

---

### 14. First five wins — concrete quick victories for the first 30 days

**What it is.** Pre-identified, achievable accomplishments that build credibility and momentum within the first month. Not a full 30-60-90 plan — just the **five specific, tangible wins** that signal "I'm adding value already." Based on Michael Watkins' research (HBR), which found systematic onboarding brings employees up to speed **50% faster**.

**Why it impresses.** **17–20% of employee turnover happens in the first 45 days.** When a business owner hands a new hire this list on day one, they demonstrate organizational readiness and set clear expectations simultaneously. The new hire feels guided, not abandoned. Each win is designed to be achievable regardless of industry knowledge or prior context.

**Applies to:** Every role. The specific wins change, but the structure (learn → contribute → improve) is universal.

**Real example.** GitLab documents onboarding milestones directly within each job family page. Basecamp provides "performance metrics on day 1" and structured review cadences at 3, 6, and 12 months.

**Markdown implementation:**

```
## 🏆 First five wins (achieve in your first 30 days)
1. **Complete the stakeholder tour** — Have 1:1 coffee with every person on your stakeholder map
2. **Audit one process** — Pick the process your team complains about most; document findings
3. **Fix one visible annoyance** — Find a small, broken thing and fix it (earns instant credibility)
4. **Ship one deliverable** — Produce your first tangible output, even if small
5. **Present your "State of Things" memo** — Share your fresh-eyes observations with your manager

> These wins are designed to build relationships, demonstrate initiative, and create early momentum.
```

---

### 15. Cognitive load map — the hidden complexity profile of the role

**What it is.** A map of the role's mental demands: number of parallel workstreams, context-switching frequency, decision complexity, and information processing requirements. Based on cognitive load theory (Sweller) and extended by _Team Topologies_ (Skelton & Pais). Three types: **intrinsic load** (inherent complexity of the domain), **extraneous load** (unnecessary complexity from poor systems or processes), and **germane load** (beneficial learning effort).

**Why it impresses.** Most business owners don't realize that assigning someone 6 different projects creates a **40% productivity loss** from context-switching alone (Atlassian research). Studies show it takes **23 minutes and 15 seconds** to regain focus after an interruption. When a business owner sees the cognitive load profile and realizes "we've designed a role that's set up to fail," that's a transformative moment.

**Applies to:** Every role, though the load profile differs dramatically between, say, a focused analyst and a multi-project coordinator.

**Real example.** Team Topologies applies cognitive load analysis to team design at companies like Netflix and Spotify. The GitHub repository zakirullin/cognitive-load (1,000+ stars) maps the three load types for software teams.

**Markdown implementation:**

```
## 🧠 Cognitive load profile
**Parallel workstreams:** 3-4 simultaneous (⚠️ High — monitor for overload)
**Context switches per day:** ~8 average (target: <6 for deep work roles)
**Peak cognitive demand:** Month-end reporting + quarterly planning overlap

| Load type | Source | Mitigation |
|---|---|---|
| **Intrinsic** (inherent complexity) | Complex multi-stakeholder negotiations | Provide decision frameworks |
| **Extraneous** (unnecessary complexity) | 4 different reporting tools | Consolidate to single dashboard |
| **Germane** (learning effort) | New industry domain knowledge | Structured 90-day learning path |

> 🎯 **Minimum focus time needed:** 2-hour uninterrupted blocks, 3x/week
```

---

## The visual power tier: elements that transform format and presentation

### 16. Role canvas one-pager — the entire role on a single visual page

**What it is.** A Business Model Canvas-style single-page visual that captures purpose, accountabilities, skills, relationships, success criteria, and key constraints in one scannable view. Kate Leto (author of _Hiring Product Managers_) developed the Role Canvas with four quadrants; Miro hosts both a Role Definition Canvas and a Role Model Canvas with eight fields.

**Why it impresses.** It replaces the boring 3-page job description with a **collaborative visual artifact** that teams can build together. Business owners immediately see it as a superior communication tool — clean, complete, and designed for a wall or a shared screen, not a filing cabinet. The canvas becomes the "poster" version of the full role guide.

**Applies to:** Every role.

**Real example.** Kate Leto's Role Canvas (kateleto.com) has been featured on Pendo's ProductCraft blog. Miro's Role Model Canvas (German origin, msg Agile Methods) includes goals, decision authority, communication channels, support networks, and information transfer in eight visual fields.

**Markdown implementation:**

```
## 📋 Role canvas: [Role Title]
| 🎯 PURPOSE | 📊 SUCCESS METRICS |
|---|---|
| Why this role exists: Ensure customers realize value within 21 days | NPS > 60, Time-to-value < 21 days, Retention > 88% |

| 📝 KEY ACCOUNTABILITIES | 🤝 KEY RELATIONSHIPS |
|---|---|
| Onboarding workflow design, Customer health monitoring, Escalation management | Product (bi-weekly), Sales (daily), Support (weekly) |

| ⚡ SUPERPOWER NEEDED | 🚫 ANTI-GOALS |
|---|---|
| Translating technical products into business outcomes for non-technical buyers | Not: technical troubleshooting, Not: upselling |

| 📈 GROWTH PATH | 🎯 FIRST WIN |
|---|---|
| → Senior CSM → CS Director → VP Customer Success | Reduce onboarding time for 3 accounts by 30% |
```

---

### 17. Role baseball card — the compact visual identity of the role

**What it is.** A trading-card-style compact profile showing key stats, required strengths, known challenges, personality fit, and working style — all at a glance. Inspired directly by Ray Dalio's Bridgewater Associates "baseball cards," which track **100+ traits** on a 1–10 scale for every employee, populated through the Dot Collector app.

**Why it impresses.** Dalio's quote nails it: **"You wouldn't have a great fielder with a .160 batting average bat third."** The baseball card makes strengths and weaknesses visible and actionable. A business owner can hold up the role card and the candidate profile side by side and immediately see fit or gaps. Optum/UnitedHealth replicated this concept with physical baseball cards showing Myers-Briggs types for all 16 team members.

**Applies to:** Every role. Can be used as a "role profile card" for open positions or as a "person card" for current employees.

**Real example.** Bridgewater Associates tracks 100+ dimensions. Dalio demonstrated the system in his TED talk. Bridgewater also developed the **Combinator** — a tool that takes a few names of people who excel in a role and synthesizes what makes them great, then searches for similar profiles.

**Markdown implementation:**

```
## ⚾ Role baseball card
┌──────────────────────────────────────────┐
│ OPERATIONS MANAGER              Level 3  │
│ Department: Operations · Reports to: COO │
├──────────────────────────────────────────┤
│ 🎯 Decision speed:    ████████░░  8/10   │
│ 📊 Analytical rigor:  █████████░  9/10   │
│ 🤝 Collaboration:     ███████░░░  7/10   │
│ 💡 Creative thinking:  █████░░░░░  5/10   │
│ ⚡ Execution speed:    █████████░  9/10   │
├──────────────────────────────────────────┤
│ SUPERPOWER: Turning chaos into systems   │
│ WATCH OUT FOR: Impatience with ambiguity │
│ IDEAL PAIRING: Creative strategists      │
│ ENERGY SOURCE: Process optimization      │
└──────────────────────────────────────────┘
```

---

### 18. Competency radar chart — the visual shape of role requirements

**What it is.** A multi-axis spider chart where each axis represents a key competency, with scores plotted to create a visual "shape" showing the role's ideal profile at a glance. Can overlay "current state" vs. "ideal state" for development conversations. Used at Engineering Ladders (engineeringladders.com) across five axes: Technology, System, People, Process, Influence.

**Why it impresses.** The shape tells the story instantly. A balanced polygon means the role needs a generalist. A dramatic spike means the role needs a specialist. A dent means there's a development area to plan for. Business owners can compare the "role shape" with a candidate's "person shape" and see fit visually — no spreadsheets needed. Nielsen Norman Group published detailed skill-mapping templates using radar charts for team composition planning.

**Applies to:** Every role. Axes change by function but the format is universal.

**Real example.** Engineering Ladders uses radar charts for Developer → Tech Lead → Engineering Manager progression across five dimensions. Peoplebox.ai advocates spider charts in performance appraisals with 5–7 competencies per role.

**Markdown implementation:**

```
## 🕸️ Competency radar
Required profile (scale 1–5: Awareness → Expert):

- Technical expertise:  ████░  4/5
- Leadership:           ███░░  3/5
- Communication:        █████  5/5
- Strategic thinking:   ████░  4/5
- Industry knowledge:   ███░░  3/5
- Execution speed:      ████░  4/5

> This role's "shape" is communication-dominant with strong technical and execution spikes.
> Biggest development focus area: strategic thinking (grow from 3 → 4 in first year)
```

---

### 19. Career progression map with dual tracks — visual growth path showing both mastery and management

**What it is.** A visual diagram showing the growth trajectory from the current role to future roles, with **two explicit tracks**: the individual contributor / deepening expertise track (Kim Scott's "Rock Stars") and the people management / expanding scope track (Scott's "Superstars"). Includes typical timelines and skills needed at each level. Based on publicly available frameworks from Dropbox, Buffer, Wise (TransferWise), and 50+ companies aggregated at progression.fyi.

**Why it impresses.** Scott's critical insight from _Radical Candor_: **"You've been accidentally punishing your best people by assuming everyone wants a promotion."** A role guide that honors BOTH growth paths retains twice as many top performers. The universal pattern across all big tech frameworks (Google, Meta, Stripe): lower levels are "adder" roles (individual output), senior levels are "multiplier" roles (enabling others). The dual track makes this explicit from day one.

**Applies to:** Every role. The levels change, but the dual-track concept works for any function.

**Real example.** Basecamp uses a 5-level mastery ladder where "advancing your career doesn't mean giving up on your craft." GitLab documents explicit "moving to" and "moving from" career paths for every job family. Buffer publishes levels AND horizontal "steps" within each level for raises without promotion.

**Markdown implementation:**

```
## 📈 Career progression: two paths, both valued equally

           ┌─── VP of Operations (Level 5) ───┐
           │                                    │
    Director of Ops                   Senior Operations Architect
    (People track, L4)                (Expert track, L4)
           │                                    │
    Operations Manager                Senior Ops Specialist
    (People track, L3)                (Expert track, L3)
           │                                    │
           └──── 👉 YOU ARE HERE (L2) ─────────┘

**People track:** Lead teams, coach, hire, manage performance
**Expert track:** Deepen craft, build systems, become the go-to authority
> Both tracks have equal compensation at each level. Choose based on energy, not pressure.
```

---

### 20. "Hit by a bus" continuity checklist — what must be documented for survival

**What it is.** A structured checklist of all critical knowledge, access credentials, process documentation, vendor relationships, and institutional knowledge held by this role — everything that must be transferred or documented so the team survives if the person becomes suddenly unavailable. The "bus factor" measures how many people need to leave before a function stalls.

**Why it impresses.** Ask any business owner "If your [key person] didn't show up tomorrow, what would happen?" and watch them sweat. This section transforms that abstract anxiety into an actionable checklist. It signals operational maturity and demonstrates that the role guide isn't just about hiring — it's about business resilience. The recommended model: each critical function has 1 owner + at least 1 backup with solid cross-training.

**Applies to:** Every role, but especially critical for roles with unique knowledge or access.

**Real example.** Toyota's multi-layered documentation system (standardized work charts, job breakdown sheets, work standards) ensures any operator can be cross-trained. GitLab's "everyone can contribute" model and public handbook minimize bus factor by design.

**Markdown implementation:**

```
## 🚌 Continuity checklist: "if I'm hit by a bus"
**Critical knowledge this role holds:**
- [ ] All passwords/access in shared vault (updated monthly)
- [ ] Key vendor contacts and contract terms documented
- [ ] SOPs for every recurring process stored in [shared location]
- [ ] Decision history log for major judgment calls

**Backup coverage:**
| Function | Primary | Backup | Last cross-trained |
|---|---|---|---|
| Payroll processing | This role | [Name] | Q1 2026 |
| Client escalations | This role | [Name] | Q4 2025 |
| Board reporting | This role | [Name] | ⚠️ Never — needs immediate action |
```

---

## The differentiation tier: elements that separate great from good

### 21. GWC filter — Get it, Want it, Capacity to do it

**What it is.** From Gino Wickman's EOS/Traction system, deployed at **200,000+ companies worldwide**: three simple yes/no questions for every person in every role. **Get it:** Do they truly understand the role intellectually and emotionally? **Want it:** Do they genuinely desire this specific responsibility? **Capacity:** Do they have the skills, time, and bandwidth? All three must be "yes" — a "no" on any one means the person is in the wrong seat.

**Why it impresses.** Its power is in its brutal simplicity. Business owners often sense something is wrong with a hire but can't articulate it. GWC gives them a diagnostic framework that takes 30 seconds to apply. The moment someone says "She Gets it and has Capacity, but she doesn't Want it" — the problem and solution become instantly clear. No other framework is this fast and this accurate.

**Applies to:** Every role, every level, every industry. EOS is industry-agnostic by design.

**Real example.** EOS (Entrepreneurial Operating System) is used by 200,000+ companies globally, primarily SMBs of 10–250 employees. The GWC filter is applied quarterly during People Analyzer reviews.

**Markdown implementation:**

```
## 🔍 GWC filter: is this person in the right seat?
| Dimension | Question | What "yes" looks like |
|---|---|---|
| **G — Get it** | Does this person truly understand the role, the culture, and the systems? | They can explain the role's purpose and impact in their own words |
| **W — Want it** | Do they genuinely desire this specific responsibility? | They light up when discussing the work, not just the title |
| **C — Capacity** | Do they have the intellectual, emotional, physical, and time capacity? | They can handle the role's demands without burning out |

> All three must be ✅. A "no" on any one means wrong seat — even if performance seems fine today.
```

---

### 22. Role inheritance model — how this role builds on junior and extends into senior

**What it is.** Explicitly documenting that each level in a role progression "inherits" all responsibilities from the level below, then adds new ones. Senior roles "extend" junior roles. This creates clear, additive progression where nothing is repeated and everyone knows what's new at each level. Borrowed from object-oriented programming concepts and implemented at scale by GitLab.

**Why it impresses.** Most companies create separate, disconnected job descriptions for Junior, Mid, and Senior versions of the same role — with massive overlap and inconsistency. When a business owner sees "Senior Operations Manager = everything an Operations Manager does, PLUS: strategic planning, cross-functional leadership, and P&L ownership," the career ladder becomes instantly logical. No ambiguity about what changes at each level.

**Applies to:** Every role that has multiple levels (which is virtually every role in a growing company).

**Real example.** GitLab's job families place all levels on a single page with explicit "this role extends the [previous level]" language. Basecamp documents 5 levels (Junior → Principal) with time-bound expectations: "Juniors should reach Senior in 4 years."

**Markdown implementation:**

```
## 🪜 Role inheritance: what changes at each level
**Level 2 — Coordinator** (this role)
- Executes established processes independently
- Manages day-to-day operational tasks
- Escalates exceptions to manager

**Level 3 — Manager** (extends Level 2, adds:)
- ➕ Designs and improves processes
- ➕ Manages 3-5 direct reports
- ➕ Owns department-level metrics

**Level 4 — Director** (extends Level 3, adds:)
- ➕ Sets departmental strategy aligned to company OKRs
- ➕ Manages managers
- ➕ Owns cross-functional initiatives and P&L responsibility
```

---

### 23. Critical checklists — DO-CONFIRM and READ-DO for key processes

**What it is.** Role-specific checklists for recurring critical tasks, designed using Atul Gawande's two-type framework from _The Checklist Manifesto_: **DO-CONFIRM** checklists (perform from memory, then verify nothing was missed) for experienced people doing familiar work, and **READ-DO** checklists (follow step-by-step like a recipe) for new employees or non-routine emergency procedures. Boeing's Daniel Boorman recommends **5–9 items maximum**, fitting on one page.

**Why it impresses.** Gawande's core argument: **"The volume and complexity of what we know has exceeded our individual ability to deliver its benefits correctly, safely, or reliably."** If surgeons and pilots need checklists, every role in business does too. When a business owner sees a "Monthly Close Checklist" or "Client Onboarding Checklist" embedded in the role guide, they see a quality assurance system that catches the most common (and expensive) errors of inattention. Toyota's entire operational system is built on this principle.

**Applies to:** Every role. The checklists change, but the concept of having them is universal.

**Real example.** Toyota's TWI Job Instruction system uses three-column breakdowns: Important Steps (what), Key Points (how), Reasons (why). Boeing's cockpit checklists are the gold standard, with separate "normal" and "non-normal" procedures.

**Markdown implementation:**

```
## ☑️ Critical checklists
### Monthly close (DO-CONFIRM — verify after completing from memory)
- [ ] All invoices reconciled against purchase orders
- [ ] Revenue recognition entries posted
- [ ] Variance report generated and reviewed
- [ ] Department heads notified of any anomalies
- [ ] Final numbers submitted to CFO by 3rd business day

### New vendor onboarding (READ-DO — follow step-by-step)
1. Verify W-9 or W-8BEN received
2. Run credit check through [system]
3. Enter vendor in procurement system
4. Set up payment terms per contract
5. Notify AP team and requesting department
```

---

### 24. Role evolution triggers — when and why this role should be redefined

**What it is.** A built-in set of conditions that automatically trigger a role review and potential redesign. Instead of updating roles only during annual reviews or when hiring, the role guide specifies exactly what conditions signal it's time for a refresh. Inspired by IT lifecycle management frameworks (Evolveum/midPoint) and adapted for organizational design.

**Why it impresses.** Most role documents are written once and forgotten. Business owners know this — they've inherited stale job descriptions from years ago. When a role guide includes "Review this role when: the team exceeds 8 people, a major new tool is adopted, or quarterly OKRs shift significantly," it signals that the document is alive. It also prevents the silent drift where a role slowly becomes something nobody intended.

**Applies to:** Every role.

**Real example.** Buffer publicly blogs every iteration of their salary formula and role framework. GitLab's handbook is version-controlled in git with full change history. Holacracy organizations evolve roles in regular governance meetings based on real "tensions."

**Markdown implementation:**

```
## 🔄 Role evolution triggers
This role guide should be reviewed and potentially redesigned when ANY of these occur:
- **Scale trigger:** Team grows past 8 people (role may need to split)
- **Technology trigger:** New AI tool automates >20% of current responsibilities
- **Performance trigger:** Key outcomes missed for 2 consecutive quarters
- **Strategic trigger:** Company pivots strategy or enters new market
- **Periodic trigger:** Mandatory review every 6 months regardless

**Last reviewed:** March 2026 · **Next scheduled review:** September 2026
**Version:** 2.3 · [View change history]
```

---

### 25. "Working with me" personal README template — the human interface spec

**What it is.** A personal document template included in the role guide for the role-holder to complete, explaining their working style, communication preferences, decision-making approach, pet peeves, and how they operate best. Popularized in Silicon Valley; HackerNoon published "12 Manager READMEs from Silicon Valley's Top Tech Companies." Sections typically include: communication preferences, how they give/receive feedback, what gives them energy, what stresses them, and known blind spots.

**Why it impresses.** The role guide defines the role. The Personal README defines the human in the role. Together, they eliminate the "guessing game" that costs teams months of friction. Business owners see this as a conflict-prevention tool — when two people butting heads each share their README, style clashes become explicit and solvable rather than mysterious and damaging. It also serves as a self-awareness exercise that improves performance from day one.

**Applies to:** Every role. Particularly powerful for managers, but valuable for anyone who works with others.

**Real example.** GitHub hosts open-source templates (kaeti/personal-readme from the Washington Post Graphics team). managerreadme.com hosts a growing community. Notion offers a Personal README template used by Delivery Hero and other companies.

**Markdown implementation:**

```
## 👤 "Working with me" template (to be completed by role-holder)
**My communication style:** [e.g., "I think by writing. Send me a doc, not a meeting invite."]
**Best way to give me feedback:** [e.g., "Direct and specific. Don't sugarcoat."]
**What gives me energy:** [e.g., "Solving messy problems. Whiteboarding with smart people."]
**What drains me:** [e.g., "Status meetings with no decisions. Waiting for approvals."]
**A quirk to know about me:** [e.g., "I go silent when processing — it's not disagreement."]
**How to know if I'm stressed:** [e.g., "I start responding in one-word messages."]
**If we disagree:** [e.g., "Challenge me directly. I respect pushback more than compliance."]
```

---

## How these 25 elements map to a complete role guide

The architecture below shows how these elements organize into a coherent document. Not every section is needed for every role — a junior warehouse associate needs a lighter version than a VP of Engineering — but the framework scales in both directions.

**Opening block (the "poster"):**
Role Canvas One-Pager (#16) + Baseball Card (#17) — scannable overview

**Section 1 — Why this role exists:**
Outcome-Based Purpose (#4) + Business Context (#8) + Superpowers Needed (#5)

**Section 2 — What success looks like:**
Definition of Done (#9) + Time Allocation (#6) + GWC Filter (#21)

**Section 3 — How this role operates:**
Decision Authority Matrix (#2) + Communication Charter (#12) + Anti-Goals (#1) + Human-AI Allocation (#13)

**Section 4 — Who this role works with:**
Stakeholder Map (#10) + Role Dependencies (#7) + Competency Radar (#18)

**Section 5 — How to succeed and avoid failure:**
Failure Modes (#3) + First Five Wins (#14) + Critical Checklists (#23) + Cognitive Load Map (#15) + Energy Map (#11)

**Section 6 — Growth and evolution:**
Career Progression Map (#19) + Role Inheritance (#22) + Role Evolution Triggers (#24)

**Section 7 — The human element:**
Working With Me README (#25) + Continuity Checklist (#20)

---

## What the best companies understand that most don't

The research reveals a fundamental pattern: **the best role guides in the world don't describe work — they describe a system for success.** GitLab version-controls their role definitions like software code. Netflix uses culture as role definition, making values operational rather than aspirational. Toyota documents multi-layered systems where the role IS the process. Amazon evaluates every person against 16 Leadership Principles at every level.

The most important insight for a role guide generator is that **three elements create 80% of the "wow" factor**: anti-goals (what NOT to do), failure modes (how people typically fail), and the decision authority matrix (what you can decide alone). These three elements address the three biggest causes of role failure — scope creep, repeated mistakes, and authority confusion — and no traditional job description touches any of them.

The remaining 22 elements add progressive depth, visual impact, and operational sophistication. Together, the 25 elements transform a static document into a living management system that a business owner can hand to any new hire and say: "This is everything you need to understand your role, succeed in it, and grow beyond it."
