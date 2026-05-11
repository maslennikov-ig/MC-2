# Plan: Google Stitch UI/UX Рефакторинг — Исследование и Промпты

## Context

Продукт MC2 — платформа для AI-генерации курсов на Next.js 15 + Tailwind CSS 4 + Radix UI/shadcn. Текущий UI выглядит устаревшим. Цель — использовать **Google Stitch** (AI UI design tool от Google Labs) для генерации современных экранов, которые затем будут имплементированы в проект.

---

## Что такое Google Stitch

Google Stitch — бесплатный AI-инструмент от Google Labs для генерации UI по текстовым промптам, скриншотам и скетчам. Запущен на Google I/O 2025 (бывший Galileo AI), обновлён до v2.0 в марте 2026.

### Ключевые возможности

- **Text-to-UI**: описываешь экран текстом → получаешь high-fidelity UI
- **Image-to-UI**: загружаешь скриншот/скетч → получаешь полированный UI
- **Multi-screen generation**: до 5 связанных экранов за один промпт
- **Infinite Canvas**: бесконечный холст для организации экранов
- **Voice Canvas** (март 2026): голосовое взаимодействие с AI-агентом
- **Interactive Prototyping**: связь экранов в кликабельные прототипы
- **Vibe Design**: фокус на feel/intent, AI делает layout/padding/nesting

### Экспорт

- **HTML/CSS** (production-ready)
- **Tailwind CSS**
- **JSX**
- **Figma** (one-click paste с editable layers)
- **ZIP** (все ассеты + код)

### Два режима

| Режим        | Модель         | Скорость                | Лимит/мес     |
| ------------ | -------------- | ----------------------- | ------------- |
| Standard     | Gemini 3 Flash | Быстрый                 | 350 генераций |
| Experimental | Gemini 3.1 Pro | Медленнее, качественнее | 50 генераций  |

### Ограничения

- Нет анимаций/сложных интеракций
- Нет автоматического применения brand guidelines
- Качество сильно зависит от промпта
- Нет компонентной системы / design tokens enforcement
- React export пока в roadmap (есть JSX, но не полный React)

---

## Mobile vs Desktop: Как организовать проекты

### Как работает Stitch

При создании проекта Stitch предлагает выбор: **Web** или **Mobile**. Это определяет canvas size, соотношение сторон и оптимизацию компонентов. Выбор делается один раз при создании проекта.

**Важно:** Stitch генерирует mobile UI качественнее, чем web — десктопные экраны требуют более детальных промптов и часто нуждаются в доработке через Direct Edits.

### Решение: **2 проекта (Web + Mobile)**

| Проект         | Тип    | Canvas           | Для чего          |
| -------------- | ------ | ---------------- | ----------------- |
| **MC2 Web**    | Web    | Desktop viewport | Десктопные экраны |
| **MC2 Mobile** | Mobile | Phone viewport   | Мобильные экраны  |

**Почему 2 проекта:**

1. **Stitch оптимизирует генерацию под выбранный тип** — mobile-проект даёт touch-friendly паттерны, web-проект даёт desktop-оптимизированные layouts
2. **Разные UX-паттерны** — мобильный bottom nav vs десктопный sidebar нельзя совместить в одном экране
3. **Качество mobile** — Stitch лучше генерирует mobile, для web нужны более детальные промпты
4. **Можно работать параллельно** — один проект для mobile, другой для desktop, потом синтезируем в код

### Workflow

```
1. Создать Stitch Project "MC2 Desktop" (Web app)
2. Создать Stitch Project "MC2 Mobile" (Mobile)
3. Генерировать экраны парами: desktop + mobile версия каждого экрана
4. Экспортировать в Tailwind CSS / JSX
5. Синтезировать в один responsive компонент в коде (Tailwind breakpoints)
```

---

## Текущие экраны MC2 (30+ страниц)

### Публичные

1. Landing/Home page
2. Courses Catalog (поиск, фильтры, сортировка, пагинация)
3. Course Detail (overview, метаданные)
4. Course Lessons (контент, секции, уроки)
5. Course Visuals (диаграммы, картинки)
6. Course Generation Progress (realtime, stages 1-6)
7. Course Creation Wizard (multi-step form)
8. About page
9. Features Catalog
10. Profile (4 таба: Personal, Settings, Learning, Statistics)
11. Organization Settings
12. Organization Members
13. Join/Invite flow
14. Shared Content (по токену)

### Admin Dashboard

15. Admin Main (stats: users, courses, lessons, jobs, errors)
16. Users Management (таблица с ролями)
17. Analytics (PWA)
18. Logs Viewer
19. Pricing Management
20. Pipeline Config (4 таба: Overview, Models, Prompts, Settings)
21. Generation History
22. Generation Monitoring (timeline, overview, trace, manual stage 6)
23. Generation Audit

### Auth

24. Login form
25. Register form
26. Forgot Password
27. Update Password

---

## Deliverable: MD-файл с промптами для Stitch

Будет создан файл `docs/stitch-prompts.md` содержащий:

1. **Общие инструкции** — как использовать промпты, настройки Stitch
2. **Design brief** — описание бренда, цветовой палитры, стиля (подавать в каждый промпт)
3. **Промпты для каждого экрана** — Desktop и Mobile версии
4. **Приоритизация** — какие экраны генерировать первыми

### Структура каждого промпта

```
## [Название экрана]

### Desktop (Web Project)
[Промпт для Stitch Web]

### Mobile (Mobile Project)
[Промпт для Stitch Mobile]

### Контекст
- Текущее состояние: [описание]
- Что улучшить: [проблемы]
- Референсы: [если есть]
```

### Приоритет генерации экранов

**Phase 1 (Core UX):** Landing, Courses Catalog, Course Detail, Login/Register
**Phase 2 (User Flow):** Course Creation, Generation Progress, Profile, Lessons
**Phase 3 (Admin):** Dashboard, Pipeline Config, Generation Monitoring
**Phase 4 (Secondary):** About, Features, Org Settings, Members, Visuals

---

## Текущий Design System (для reference в промптах)

- **Brand color**: Purple (#8b5cf6)
- **Font**: Manrope (sans), JetBrains Mono (code)
- **Dark mode**: Supported (class-based)
- **Style**: Glassmorphism effects, gradient accents, space/celestial theme in generation
- **Stack**: Next.js 15, Tailwind CSS 4, Radix UI/shadcn, Framer Motion

---

## Verification

1. Открыть stitch.withgoogle.com, создать 2 проекта (Mobile + Web)
2. Протестировать 1-2 промпта из файла на реальном Stitch
3. Убедиться что экспорт в Tailwind CSS / JSX работает
4. Сравнить результат с текущим UI

---

## Следующий шаг

Создать `docs/stitch-prompts.md` с полными промптами для всех 27 экранов в двух вариантах (desktop + mobile).
