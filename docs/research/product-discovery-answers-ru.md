# Ответы на вопросы (подробно, с учётом исследований и реальной реализации)

Ниже для каждого вопроса:

- **Исследования/спеки** — что говорят материалы в `docs/` и `specs/`.
- **Реальная реализация (mc2)** — что реально заложено в коде.
- **Разночтения/риски** — где есть несовпадения между исследованиями, спеками и текущей реализацией.

---

## Блок 1: Портрет и сценарии использования

### 1) Какая бизнес-задача чаще всего будет решать пользователь?

**Исследования/спеки**

- Фокус продукта — **корпоративное обучение**: быстро превращать документы или тему в полноценный курс, снижая стоимость и срок производства контента. Есть акцент на compliance‑качество, технические курсы и профессиональную подготовку. Источник: `docs/INVESTOR-PITCH-RU.md`.
- Исследования по параметрам LLM прямо фиксируют **B2B corporate training** как целевой кейс и подчёркивают важность точности для compliance. Источник: `docs/research/008-generation/Research Prompt - Optimal LLM Parameters.md`.
- Архитектура поддерживает контентные архетипы **technical / conceptual / compliance**, что отражает типовые сценарии: регламенты, техобучение, продуктовые курсы. Источник: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`.

**Реальная реализация (mc2)**

- Воронка генерации рассчитана на работу **с документами и без документов** (topic‑only). Это отражено в маршрутизации жизненного цикла генерации: при отсутствии документов запуск идет с Stage 4 (analysis‑only). Источник: `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`.
- В UI и пайплайне **Stage 2/3 помечаются как пропущенные**, если курс создан без документов. Источники: `packages/web/lib/generation-graph/utils.ts`, `packages/web/lib/generation-graph/translations.ts`.
- Логика **content_strategy** выбирает «создание с нуля» при малом числе документов: `<3` документов → `create_from_scratch`. Источник: `packages/course-gen-platform/src/stages/stage4-analysis/README.md`.
- Механизм RAG учитывает сценарий «без документов»: есть оптимизация проверки наличия индексированных документов, и если документов нет — RAG пропускается, чтобы не тратить ресурсы. Источник: `packages/course-gen-platform/src/shared/rag/document-availability.ts`.

**Разночтения/риски**

- В архитектуре Stage 4 описана Phase 6 (RAG Planning), но в **реальной реализации Phase 6 помечена как deprecated** и возвращает пустой mapping. Это влияет на логику использования документов в Stage 5/6. Источник: `packages/course-gen-platform/src/stages/stage4-analysis/README.md`.

**Вывод**
Основная бизнес‑задача — **корпоративное обучение**: ускорение создания курсов для онбординга, регламентов и тех‑подготовки, включая compliance‑сценарии. Реализация поддерживает и «документный», и «topic‑only» режимы.

---

### 2) Кто будет основным оператором системы?

**Исследования/спеки**

- Целевые персоны: **методологи**, **инструкторы** и **создатели курсов** (эксперты без тех‑бэкграунда). Источник: `docs/specs/SPEC-2025-12-05-stage4-stage5-ui-redesign.md`.
- UX‑исследования подчёркивают, что интерфейсы должны быть интуитивны **для нетехнических пользователей**. Источник: `docs/research/Optimal UX patterns for lesson attachments in visual course builders.md`.

**Реальная реализация (mc2)**

- В UI предусмотрены человеко‑понятные названия фаз, отказ от «Attempt 1…», и ориентация на читабельный контент вместо JSON. Это закреплено в спеках редизайна Stage 4/5. Источник: `docs/specs/SPEC-2025-12-05-stage4-stage5-ui-redesign.md`.
- В коде есть слой «generation‑graph» с локализациями и UI‑подсказками для нетехнических пользователей. Источник: `packages/web/lib/generation-graph/phase-names.ts`, `packages/web/lib/generation-graph/translations.ts`.

**Разночтения/риски**

- В коде есть **админ‑панели и супер‑админ инструменты** (pipeline‑admin), что больше подходит продвинутым оператором/администраторам, но это отдельный путь, не основной. Источник: `specs/015-admin-pipeline-dashboard/spec.md`.

**Вывод**
Основной оператор — **методист/инструктор/эксперт‑создатель курса**. Система проектируется под не‑технического пользователя, но при этом сохраняет возможность глубоких настроек для продвинутых ролей.

---

## Блок 2: Работа с исходными данными (контент)

### 3) В каком виде у компании обычно хранятся знания?

**Исследования/спеки**

- В продуктовых материалах перечислены форматы: **PDF, DOCX, PPTX, XLSX, HTML, Markdown, изображения**. Источник: `docs/INVESTOR-PITCH-RU.md`.
- Исследования Docling фиксируют поддерживаемые форматы и OCR‑режимы для сканов. Источник: `docs/research/docling.md`.
- Есть отдельные исследования и планы по видео‑контенту, но они относятся к **отдельному видео‑пайплайну**, не к входным учебным документам. Источник: `specs/video-presentation-pipeline/README.md`.

**Реальная реализация (mc2)**

- **Источник истины по форматам** — `packages/shared-types/src/file-upload-constants.ts`. Реальные MIME‑типы по тиру:
  - **Free**: загрузки запрещены.
  - **Basic**: только `text/plain`, `text/markdown`.
  - **Standard/Trial**: PDF/DOCX/PPTX/HTML/TXT/MD (без изображений).
  - **Premium**: всё из Standard + изображения (PNG/JPG/GIF/SVG/WebP).
- **Лимиты по размерам и количеству** (реальные):
  - **Free**: 0 файлов, 5 MB.
  - **Basic**: 1 файл, 10 MB.
  - **Standard/Trial**: 3 файла, 30 MB.
  - **Premium**: 10 файлов, 100 MB.
    Источник: `packages/shared-types/src/file-upload-constants.ts`.
- **Docling/OCR по тиру**: Standard/Trial — Docling + OCR для PDF/DOCX/PPTX/HTML; Premium — Docling + OCR + опциональный Vision API для изображений. Источник: `docs/research/docling.md`.
- Валидация загрузок идёт через `shared/validation/file-validator.ts` и использует эти константы (фактическое поведение системы). Источники: `packages/shared-types/src/file-upload-constants.ts`, `packages/course-gen-platform/src/shared/validation/file-validator.ts`.
- Stage 1 загрузки — синхронный tRPC‑endpoint с проверкой тиров и лимитов. Источник: `packages/course-gen-platform/src/stages/stage1-document-upload/README.md`.

**Разночтения/риски**

- В `docs/INVESTOR-PITCH-RU.md` заявлен **XLSX**, но в текущих MIME‑константах **нет** поддержки XLSX.
- В `packages/course-gen-platform/src/stages/stage1-document-upload/README.md` указаны другие лимиты/форматы (например, Basic с PDF), что **расходится с реальными константами**. Реальную логику определяют `file-upload-constants.ts` и `file-validator.ts`.

**Вывод**
По реализации основной источник — **текстовые регламенты и презентации** (PDF/DOCX/PPTX/HTML/Markdown), а изображения и сканы — через OCR в старших тирах. Видео не является входным форматом в текущем контуре.

---

### 4) Насколько строго ИИ должен придерживаться загруженных материалов?

**Исследования/спеки**

- Для compliance‑контента требуется **строгое заземление** на источники, отказ при отсутствии данных («INSUFFICIENT_CONTEXT»). Источник: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`.
- Исследования подчёркивают важность RAG‑контекста как «истины» и необходимость строгого режима для регуляторных тем. Источник: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`.

**Реальная реализация (mc2)**

- Генерация секций Stage 6 **использует RAG‑чанки**, но при их отсутствии всё равно генерирует контент (с предупреждением в логах). Источник: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-section.ts`.
- Для фактической точности используется **factual‑verifier**, который **всегда проверяет** факты по RAG, если чанки доступны. Источник: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/factual-verifier.ts`.
- В Stage 6 есть **Section‑Expander** для регенерации блоков, где явно указано «Use these materials for factual grounding». Источник: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/expander-prompt.ts`.
- Compliance‑режим определяется **content_archetype** и **compliance_level** в LessonSpecificationV2; для `legal_warning` выставляется `strict`. Источник: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`.
- Температурное роутинг‑поведение привязано к archetype: `legal_warning` (0.1), `code_tutorial` (0.3), `concept_explainer` (0.5), `case_study` (0.7). Источник: `packages/shared-types/src/lesson-content.ts`.

**Разночтения/риски**

- В архитектуре описан жёсткий отказ «INSUFFICIENT_CONTEXT», но в реальной генерации **нет обязательного отказа** — контент создаётся даже без RAG‑чанков.
- Phase 6 RAG‑mapping в Stage 4 deprecated, поэтому `rag_context.primary_documents` может быть пустым, что **конфликтует с min(1) в схеме LessonSpecificationV2**. Источники: `packages/course-gen-platform/src/stages/stage4-analysis/README.md`, `packages/shared-types/src/lesson-specification-v2.ts`, `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`.

**Вывод**
В исследованиях — **строгая опора на источники** для compliance. В реализации — RAG используется, плюс есть факт‑верификация, но **генерация не блокируется** при отсутствии контекста. Это открытый продуктовый выбор.

---

## Блок 3: Методология и проверка знаний

### 5) Какая глубина проверки знаний требуется?

**Исследования/спеки**

- Методология основана на **Constructive Alignment** и Bloom’s Taxonomy: оценка должна соответствовать целям обучения. Источник: `docs/research/Partial content regeneration in AI course builders A technical guide.md`.
- В pitch‑материалах заявлен Bloom’s Taxonomy Validator. Источник: `docs/INVESTOR-PITCH-RU.md`.

**Реальная реализация (mc2)**

- В Stage 4 формируется `generation_guidance.exercise_types` и `assessment_approach`. Источник: `packages/shared-types/src/analysis-schemas.ts`.
- В результатах Stage 5 есть `assessment_strategy` с `quiz_per_section`, `assessment_description` и др. Источник: `packages/shared-types/src/generation-result.ts`.
- В LessonSpecificationV2 предусмотрены **rubric‑driven упражнения** и типы: `coding`, `conceptual`, `case_study`, `debugging`, `design`. Источник: `packages/shared-types/src/lesson-specification-v2.ts`.
- В legacy‑схеме упражнения **freeform** (exercise_type — строка), чтобы не ломать генерацию. Источник: `packages/shared-types/src/generation-result.ts`.

**Разночтения/риски**

- В V2 схема упражнений строго типизирована, а в V1/legacy — свободный текст. Возможен разрыв между «идеальной методологией» и фактическими данными, если V2 не используется полностью.
- Свободный `exercise_type` в V1 — осознанная мера против «ложно‑валидного» JSON (строгие enum ломали генерацию). Источник: `docs/research/008-generation/Rethinking LLM validation: The case against strict enums alone.md`, `packages/shared-types/src/generation-result.ts`.
- Автоматической проверки ответов студентов сейчас нет — есть только генерация и качество текста/структуры (через LLM‑Judge и OSCQR‑рубрику). Источник: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/prompt-cache.ts`.

**Вывод**
Глубина проверок должна быть адаптивной: от простых тестов до кейсов и практических задач. Реализация закладывает такую гибкость (assessment_strategy + rubric‑based exercises), но авто‑грейдинга и LMS‑гейтинга нет.

---

### 6) Нужна ли функция «Стоп‑урока»?

**Исследования/спеки**

- В существующих спеках нет явного требования на «stop‑урок».
- Open edX интеграция ориентирована на **self‑paced** режим и минимальную grading policy (pass/fail без сложной логики). Источник: `specs/20-openedx-integration/research.md`.

**Реальная реализация (mc2)**

- В коде нет логики блокировки доступа к следующему модулю на основе теста.
- Политики Open edX, которые генерируются, не содержат условий gating. Источник: `specs/20-openedx-integration/research.md`.

**Разночтения/риски**

- Если стоп‑урок нужен для compliance‑курсов, потребуется отдельная продуктовая политика и изменения в LMS‑экспорте.

**Вывод**
Функции «стоп‑урока» сейчас **нет**, и исследования не требуют её как базовую. Возможна как дополнительная опция для compliance‑продуктов.

---

### 7) Как ИИ должен определять стиль общения (Tone of Voice)?

**Исследования/спеки**

- Рекомендуется задавать **тон как набор описательных параметров**, а не жёстко копировать стиль документов. Источник: `docs/research/008-generation/Optimizing AI Lesson Content Prompts.md`.
- В архитектуре tone — часть metadata и задаётся как enum. Источник: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`.

**Реальная реализация (mc2)**

- В Stage 4 tone выбирается из 4 вариантов: `conversational but precise`, `formal academic`, `casual friendly`, `technical professional`. Источник: `packages/shared-types/src/analysis-schemas.ts`.
- В LessonSpecificationV2 **tone сужен до 2 значений**: `formal` и `conversational-professional`. Источник: `packages/shared-types/src/lesson-specification-v2.ts`.
- Маппинг: `formal academic` -> `formal`, все остальные -> `conversational-professional`. Источник: `packages/course-gen-platform/src/stages/stage5-generation/utils/semantic-scaffolding.ts`.
- Дополнительно в генерации есть **course style presets** (professional, practical, problem_based, analytical и т. д.), которые добавляют «слой стиля» поверх tone. Источник: `packages/shared-types/src/style-prompts.ts`, использование в `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-section.ts`.

**Разночтения/риски**

- Сужение tone до 2 вариантов может терять нюансы (например, distinction между `technical professional` и `casual friendly`).
- Копирование стиля документов не реализовано напрямую; используется preset‑подход + guidance из Stage 4.

**Вывод**
Сейчас стиль определяется через **presets + tone‑enum**. Это соответствует исследованиям (адъективные параметры), но фактически тон значительно «сжат» при переходе к V2.

---

## Итоговое резюме по продуктовым решениям

1. Основной сценарий — **B2B корпоративное обучение** (onboarding, регламенты, тех‑курсы), включая compliance.
2. Основной оператор — **методолог/инструктор/эксперт‑создатель**, не линейный руководитель.
3. Реальные входные форматы определяются **file‑upload‑constants**; часть форматов из pitch (например XLSX) пока не поддержана кодом.
4. Для compliance предполагается строгий grounding, но в реализации строгий отказ по отсутствию контекста пока не enforced.
5. Глубина проверки знаний вариативна, но авто‑грейдинга и стоп‑уроков в коде нет.
6. Tone/Voice реализован через presets и суженную шкалу tone, что может потребовать продуктового решения (оставлять 2 тона или расширять до 4).
