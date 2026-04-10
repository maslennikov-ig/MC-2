# Stitch Prompts — MegaCampusAI UI Redesign

> Desktop only. Mobile responsiveness handled in code via Tailwind breakpoints.

## Design Brief (paste once when creating project)

```
MegaCampusAI — AI platform that generates educational courses from uploaded materials.
Warm violet primary (#a855f7), fuchsia accents (#e879f9), deep navy background (#0a0e1a).
Manrope for headlines, Inter for body text.
Premium editorial style. Generous whitespace. Tonal depth instead of borders.
All UI text in Russian.
```

---

## Phase 1 — Core UX

### 1. Landing Page

```
Landing page for MegaCampusAI — an AI platform that generates educational courses from uploaded materials. Users upload PDFs, videos, or text, and AI creates a complete course through a 6-stage pipeline.

Key messages: create courses with AI, 500+ courses created, 10,000+ lessons, 50+ organizations trust us.
Main features: material upload, AI content generation, 6-stage pipeline, multilingual support (50+ languages), real-time monitoring.
CTAs: "Создать курс" (primary) and "Войти" (secondary).
Navigation: Возможности, Тарифы, Курсы.
All UI text in Russian.
```

### 2. Course Catalog

```
Course catalog for MegaCampusAI. Users browse all available courses, search, filter by status (published/draft/generating) and difficulty (beginner/intermediate/advanced), mark favorites. Each course: cover image, title, difficulty badge, author with avatar, short description. Statistics: 156 total courses, 89 completed, 34 in progress. Pagination.
All UI text in Russian.
```

### 3. Course Detail

```
Course detail page on MegaCampusAI. User is deciding whether to start learning.

Information: course title, cover image, author with avatar, difficulty badge, description, learning objectives, curriculum (expandable sections with lessons). Stats: lesson count, estimated time. Actions: start learning, share, add to favorites.
All UI text in Russian.
```

### 4. Login & Registration

```
Login and registration screens for MegaCampusAI.

Login: email, password, forgot password link, login button, social login via Google and Telegram, link to registration.
Registration: name, email, password with strength indicator, terms agreement, register button, social login, link to login.
All UI text in Russian.
```

---

## Phase 2 — User Flow

### 5. Course Creation Wizard

```
3-step course creation wizard for MegaCampusAI.

Step 1: course name, description, language (Russian/English), difficulty level, target audience.
Step 2: upload materials — files (PDF, DOCX, TXT) and web URLs.
Step 3: generation settings — number of sections, lessons per section, content style (academic/conversational/technical). Launch generation.
All UI text in Russian.
```

### 6. Generation Progress

> **SKIP.** Uses custom ReactFlow/XYFlow node-based graph with celestial theme. Restyle manually with new design tokens.

### 7. User Profile

```
User profile page for MegaCampusAI. Four sections: personal info (avatar, name, email, bio), account settings (theme, notifications, security), learning preferences (level, style, goals), statistics (courses enrolled, learning hours, achievements).
All UI text in Russian.
```

### 8. Lesson Reader

```
Lesson reader page on MegaCampusAI. Left side: course navigation with sections and lessons showing progress. Center: lesson content — text, code blocks, formulas, images, tables, info callouts. Navigation between lessons.

Sample content: course "Introduction to Machine Learning", section 1, lesson "What is ML". Text with headings, paragraphs, code blocks, and info boxes.
All UI text in Russian.
```

---

## Phase 3 — Admin

### 9. Admin Dashboard

```
Admin dashboard for MegaCampusAI platform. Overview: users (1,247, +23 this week), courses (156), lessons (2,840), active generation jobs (5), errors last 24h (3). Charts: registrations this month, courses by status. Recent activity. Quick actions: users, pipeline, logs, pricing.
All UI text in Russian.
```

### 10. Pipeline Configuration

```
AI pipeline configuration for MegaCampusAI admin. 4 tabs:

Overview — 6 pipeline stages visualization with stats (success rate, average time).
Models — LLM model table by stage (model, provider, temperature, tokens).
Prompts — prompt templates per stage with versioning.
Settings — global parameters (concurrent jobs, retries, timeout), export/import config.
All UI text in Russian.
```

### 11. Generation Monitoring (Admin)

```
Detailed generation monitoring for a specific course — MegaCampusAI admin view.

Tabs: overview (stages with progress and metrics), timeline (chronological events), trace (real-time terminal log), manual control (regenerate lessons, quality overrides).
Info: course name, generation ID, status, elapsed time.
All UI text in Russian.
```

---

## Phase 4 — Secondary

### 12. About

```
About page for MegaCampusAI. Mission: making course creation accessible through AI. How it works (upload → AI → ready course). Who it's for: teachers, organizations, domain experts. CTA to create first course.
All UI text in Russian.
```

### 13. Features

```
Features showcase for MegaCampusAI. Upload any materials (PDF, video, text, URLs). 6-stage AI pipeline. Real-time generation. Multilingual (50+ languages). Team collaboration and organizations. Export and publishing.
All UI text in Russian.
```

### 14-15. Organization (settings + members)

```
Organization management for MegaCampusAI — 2 screens.

Settings: logo, name, description, URL slug, contact email. Danger zone with deletion.
Members: member list with roles (admin/member), invite by email or link, role management.
All UI text in Russian.
```

### 16. Password Reset

```
Password reset for MegaCampusAI. Email input, send reset link. Success state: "Email sent, check your inbox." All UI text in Russian.
```

### 17. Course Visuals Gallery

```
Gallery of AI-generated visual materials for a course on MegaCampusAI. Diagrams, charts, illustrations. Filter by type, full-size preview, download.
All UI text in Russian.
```

### 18. Shared Course (public link)

```
Public course page accessible via share link without authentication. Read-only course content, author info. Footer: invitation to register and create your own course.
All UI text in Russian.
```

---

## Variation Screens (generate from base or adapt in code)

| Screen             | Base             | Difference                           |
| ------------------ | ---------------- | ------------------------------------ |
| Change Password    | Password Reset   | Two password fields instead of email |
| Join Invitation    | Login            | "Join organization" message          |
| Analytics (Admin)  | Admin Dashboard  | More charts                          |
| Logs (Admin)       | Monitoring/Trace | Full-screen terminal                 |
| Pricing (Admin)    | Table            | Pricing plans                        |
| Generation History | Course Catalog   | Table instead of cards               |
| Generation Audit   | Monitoring       | Timeline + detail drawer             |
| User Management    | Members          | Extended table with roles/statuses   |
