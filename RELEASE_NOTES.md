# Release Notes - v0.26.29

_Released on 2025-12-26_


## v0.26.82

_Released on 2026-01-11_

### ✨ New Features

- Add 1 command(s), update scripts, +1 more
- Batch improvements - graceful shutdown, source docs UI, RAG docs
- **embeddings**: Implement token-aware batching for Jina API
- **stage6**: Enable priority boosting and save source_documents attribution
- **rag**: Implement priority-based retrieval and Stage 3 deprecation
- **stage6**: Add RAG relevance validation to generator prompt
- **stage7**: Add 19-language support for image alt text
- **i18n**: Add full 19-language support for lesson content labels
- **stage6**: Add reviewInfo for UI warnings and fix Mermaid parsing
- **Skills**: Add improvements support to code-review-inline v1.1.0
- **Skills**: Add code-review-inline skill with Beads integration
- **beads**: Integrate Beads workflow into all health check skills

### 🐛 Bug Fixes

- Code review improvements - race conditions, validation, memory leaks
- **rag**: Address code review findings for priority-based retrieval
- **stage6**: Resolve ESM module resolution conflict for generator import
- **queue**: Clean up orphaned jobs with missing data during course deletion
- **queue**: Handle undefined jobs in removeJobsByCourseId
- **cleanup**: Add orphaned Redis data cleanup to course deletion
- **queue**: Include prioritized queue in removeJobsByCourseId cleanup
- Add BullMQ job cleanup to course deletion and fix local dev fetch timeout
- **stage6**: Resolve multiple production issues in lesson generation
- **stage6**: Add 19-language support to markdown parser
- **stage6**: Use getContentLabels for section-regenerator titles
- **stage6**: Localize section headers and exercise labels for Russian
- **stage6**: Resolve exercises parsing, factual verification, and sec_global issues
- **stage6**: Resolve multiple production issues in lesson generation

---

_This release was automatically generated from 70 commits._

## v0.26.81

_Released on 2026-01-08_

### ✨ New Features

- **course-gen-platform**: Add 14 source file(s), update 18 source file(s), +5 more

---

_This release was automatically generated from 3 commits._

## v0.26.80

_Released on 2026-01-08_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 28 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.26.79

_Released on 2026-01-07_

### ✨ New Features

- **web**: Add 1 source file(s), update 5 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.78

_Released on 2026-01-07_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.77

_Released on 2026-01-07_

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.76

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 5 source file(s), update 2 test(s), +2 more

---

_This release was automatically generated from 1 commits._

## v0.26.75

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Update 13 source file(s), update docs

---

_This release was automatically generated from 2 commits._

## v0.26.74

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 5 source file(s), update 4 source file(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.73

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Filter progress summary by current node to preserve details without duplication

---

_This release was automatically generated from 1 commits._

## v0.26.72

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Remove duplicate self-review display in quality assessment

---

_This release was automatically generated from 1 commits._

## v0.26.71

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Code review improvements for visual style feature

---

_This release was automatically generated from 1 commits._

## v0.26.70

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 1 source file(s), update 8 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.69

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.68

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 1 source file(s), update 4 source file(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.67

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 4 source file(s), update 41 source file(s), +3 more

---

_This release was automatically generated from 1 commits._

## v0.26.66

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 7 source file(s), cleanup 2 file(s)
- **CI/CD**: Use pnpm store cache instead of artifacts, fix rollback --pull flag

---

_This release was automatically generated from 2 commits._

## v0.26.65

_Released on 2026-01-05_

---

_This release was automatically generated from 1 commits._

## v0.26.64

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **shared-types**: Update 5 source file(s), update docs

---

_This release was automatically generated from 2 commits._

## v0.26.63

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 9 source file(s), add 1 test(s), +3 more

---

_This release was automatically generated from 1 commits._

## v0.26.62

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.61

_Released on 2026-01-04_

### 🔧 Improvements

- **CI/CD**: Enable Docker layer cache for web build

### 🐛 Bug Fixes

- **web**: Update 3 source file(s)

---

_This release was automatically generated from 2 commits._

## v0.26.60

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Prevent hydration error by not removing initial-loader from DOM

---

_This release was automatically generated from 1 commits._

## v0.26.59

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Unify theme management with hydration-safe useThemeSync hook

---

_This release was automatically generated from 1 commits._

## v0.26.58

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Revert enableSystem to fix hydration errors

---

_This release was automatically generated from 1 commits._

## v0.26.57

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **nginx**: Add no-cache headers to prevent stale HTML errors

---

_This release was automatically generated from 1 commits._

## v0.26.56

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Add smart cache invalidator on version change

---

_This release was automatically generated from 1 commits._

## v0.26.55

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Remove obsolete KillSwitch script (PWA disabled)

---

_This release was automatically generated from 1 commits._

## v0.26.54

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.53

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.52

_Released on 2026-01-04_

### ✨ New Features

- **web**: Add 24 source file(s), update 4 source file(s)

### 🐛 Bug Fixes

- **API**: Use Redis-based readiness check for cross-process sync
- **generation-ui**: Show Stage 1 as completed when awaiting launch
- **worker-readiness**: Add Redis sync for cross-process readiness status

---

_This release was automatically generated from 4 commits._

## v0.26.51

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 5 source file(s), add 1 test(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.50

_Released on 2026-01-04_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 3 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.49

_Released on 2026-01-04_

### ✨ New Features

- **course-gen-platform**: Add 5 source file(s), update 7 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.48

_Released on 2026-01-03_

### ✨ New Features

- **stage7**: Add card enrichment handler for 1:1 course/lesson thumbnails
- **stage7**: Switch image generation from Seedream 4.5 to Gemini 2.5 Flash

### 🐛 Bug Fixes

- **stage7**: Allow text in generated images

---

_This release was automatically generated from 3 commits._

## v0.26.47

_Released on 2026-01-03_

### 🐛 Bug Fixes

- **stage7**: Fix two-stage cover flow and delete extension mapping

---

_This release was automatically generated from 1 commits._

## v0.26.46

_Released on 2026-01-03_

### 🐛 Bug Fixes

- **stage7**: Add image_config for proper aspect ratio and resolution

---

_This release was automatically generated from 1 commits._

## v0.26.45

_Released on 2026-01-01_

### ✨ New Features

- **web**: Add 5 source file(s), update 19 source file(s)
- **stage7**: Add cover preview and delete button for enrichments
- **docker**: Add Stage 7 enrichment worker to production compose

### 🐛 Bug Fixes

- **stage7**: Use unoptimized images for cover preview
- **nginx**: Increase proxy buffers to fix 502 errors
- **stage7**: Handle OpenRouter chat completion image format
- **stage7**: Handle different OpenRouter image response formats

---

_This release was automatically generated from 8 commits._

## v0.26.44

_Released on 2025-12-31_

### ✨ New Features

- **web**: Add 1 source file(s), update 2 source file(s)
- **admin**: Add Stage 7 (Enrichments) to admin pipeline page
- **enrichments**: Add cover option to all enrichment UI locations

### 🔧 Improvements

- **admin**: Apply code review improvements

---

_This release was automatically generated from 4 commits._

## v0.26.43

_Released on 2025-12-31_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.42

_Released on 2025-12-31_

### ✨ New Features

- **.claude**: Add 19 source file(s), update docs
- **enrichments**: Add cover image generation for lessons

### 🔧 Improvements

- **enrichments**: Apply code review improvements to cover feature

### 🐛 Bug Fixes

- **web**: Add APP_VERSION to container for proper logging
- **web**: Disable PWA + add Kill Switch to fix 502 errors

---

_This release was automatically generated from 7 commits._

## v0.26.41

_Released on 2025-12-30_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.26.40

_Released on 2025-12-30_

### 🔧 Improvements

- **web**: Remove empty UI blocks and add intro section styling

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)
- **web**: Improve mermaid text readability on light backgrounds in dark theme
- **web**: Load lesson content from lesson_contents table

---

_This release was automatically generated from 4 commits._

## v0.26.39

_Released on 2025-12-30_

### ✨ New Features

- **web**: Add 48 source file(s), update 46 source file(s), +6 more
- **stage7**: Add deep-link integration for enrichment inspector
- **stage7**: Add enrichment inspector panel with Stack Navigator pattern
- **stage7**: Implement presentation enrichment with two-stage flow
- **stage7**: Implement audio enrichment with OpenAI TTS
- **stage7**: Implement quiz enrichment handler with Bloom's taxonomy
- **stage7**: Add unified VideoScriptPanel for video enrichments
- **stage7**: Add video handler with two-stage script generation
- **stage7**: Add video script prompt template for enrichments
- **stage7**: Add Asset Dock visual foundation for enrichments
- **stage7**: Add tRPC enrichment router with 12 procedures
- **stage7**: Add BullMQ worker infrastructure for enrichments
- **stage7**: Add enrichment types, schemas, and database migration
- Add 4 skill(s), add 1 command(s), +4 more
- **web**: Add 1 source file(s), update 2 source file(s), +1 more
- **scripts**: Add --message flag to release.sh for custom commit messages
- **Commands**: Update slash commands
- **AI Agents**: Add lead-research-assistant agent
- **Skills**: Add 3 new skills (SKILL.md, ...)

### 🐛 Bug Fixes

- **stage7**: Code review low priority improvements
- **stage7**: Code review medium priority improvements
- **stage7**: Address code review issues for enrichment inspector
- **stage7**: Use DEFAULT_MODEL_ID instead of hardcoded model
- **stage7**: Production-grade improvements for enrichment pipeline
- **stage7**: Code review fixes for AssetDock and enrichment infrastructure
- **pwa**: Remove JS/CSS from SW cache to prevent 502 after deploy
- **web**: Add emergency SW cleanup for stuck users with stale cache
- **gitignore**: Unignore admin/logs page route
- **graph**: Fix completed lessons showing as pending on initial load

---

_This release was automatically generated from 52 commits._

## v0.26.37

_Released on 2025-12-28_

### 🐛 Bug Fixes

- **pwa**: Remove JS/CSS from SW cache to prevent 502 after deploy

---

_This release was automatically generated from 1 commits._

## v0.26.36

_Released on 2025-12-28_

### ✨ New Features

- Add 4 skill(s), add 1 command(s), +4 more

---

_This release was automatically generated from 1 commits._

## v0.26.35

_Released on 2025-12-28_

### 🐛 Bug Fixes

- **web**: Add emergency SW cleanup for stuck users with stale cache

---

_This release was automatically generated from 1 commits._

## v0.26.34

_Released on 2025-12-28_

### ✨ New Features

- **web**: Add 1 source file(s), update 2 source file(s), +1 more
- **scripts**: Add --message flag to release.sh for custom commit messages

---

_This release was automatically generated from 2 commits._

## v0.26.33

_Released on 2025-12-27_

### 🐛 Bug Fixes

- **gitignore**: Unignore admin/logs page route

---

_This release was automatically generated from 2 commits._

## v0.26.32

_Released on 2025-12-27_

---

_This release was automatically generated from 1 commits._

## v0.26.31

_Released on 2025-12-26_

---

_This release was automatically generated from 1 commits._

## v0.26.30

_Released on 2025-12-26_

---

_This release was automatically generated from 1 commits._
