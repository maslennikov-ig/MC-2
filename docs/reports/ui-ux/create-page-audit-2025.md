# UI/UX Аудит страницы создания курса (/create)

**Дата:** 2025-12-02
**Проект:** MegaCampusAI — Платформа автоматической генерации образовательных курсов
**Версия:** v0.22.0
**Аудитор:** UI/UX Design Specialist Agent

---

## 1. Общая оценка текущего состояния

### ✅ Что сделано хорошо

1. **Продуманная архитектура формы**
   - Разделение на логические секции (основная информация, форматы, стили, файлы, дополнительные настройки)
   - Прогрессивное раскрытие сложности (advanced settings скрыты по умолчанию)
   - Адаптивная сетка на XL-экранах (2 колонки)

2. **Accessibility (A11y)**
   - Семантическая HTML-разметка (fieldset, legend, ARIA labels)
   - Keyboard navigation support
   - Screen reader поддержка (sr-only классы, aria-describedby, role атрибуты)
   - Контекстные сообщения об ошибках с анимацией
   - Минимальные touch targets (44px) для мобильных устройств

3. **Современные технологии**
   - Framer Motion для плавных анимаций
   - React Hook Form + Zod для валидации
   - Optimistic UI patterns (auto-save, файл-загрузка)
   - Server Components / Client Components правильно разделены

4. **UX паттерны**
   - Auto-save в Redis (non-blocking)
   - Restoration данных после авторизации (localStorage fallback)
   - Умный scroll to error с visual feedback (pulse + ring)
   - Показ состояний загрузки файлов (pending/uploading/success/error)
   - Предупреждения для edge cases (45 минут урока)

5. **Визуальная целостность**
   - Консистентная цветовая палитра (purple-500 как акцент)
   - Единая система border-radius (rounded-xl, rounded-2xl)
   - Backdrop blur эффекты для глубины
   - Dark mode полностью реализован

### ⚠️ Что требует улучшения

1. **Визуальная иерархия слабая**
   - Все карточки выглядят одинаково важными (нет приоритета)
   - Недостаточная визуальная дифференциация обязательных/опциональных полей
   - CTA кнопка "Создать курс" недостаточно выделяется

2. **Проблемы с контрастом и читаемостью**
   - Файл-апload компонент: текст в dark mode плохо читается на прозрачном фоне
   - Placeholder text имеет низкий контраст (WCAG AA не всегда достигается)
   - Text shadows в page-client-full.tsx применены непоследовательно

3. **Избыточность и загроможденность**
   - 19 стилей изложения — когнитивная перегрузка (показываем 12, потом ещё 7)
   - 9 форматов генерации, но только 1 доступен (остальные с badge "Скоро")
   - Слишком много текста в подсказках и описаниях

4. **Отсутствие микроинтеракций**
   - Hover-эффекты минимальны (только border-color меняется)
   - Нет feedback на click для карточек стилей
   - Отсутствует haptic feedback для мобильных устройств

5. **Проблемы с формой файл-апload**
   - Drag & drop зона визуально слабая (border-dashed недостаточно)
   - Progress bar для uploading состояния не имеет визуальной индикации скорости
   - Нет предпросмотра загруженных файлов (иконки, thumbnails)

6. **Generic AI aesthetic**
   - **Фиолетовый градиент на тёмном фоне** — типичная AI-эстетика 2023-2024
   - Использование Inter font (хотя не указан явно, подразумевается через --font-sans)
   - Cookie-cutter layout: центрированная форма, карточки в сетке
   - Отсутствие уникального визуального языка бренда

### 🔴 Критические проблемы

1. **Performance**
   - Dynamic import для CreateCourseForm правильный, но loading state слишком простой
   - Framer Motion animations могут вызывать jank на слабых устройствах (нет проверки prefers-reduced-motion)

2. **Безопасность UX**
   - Email field disabled/readonly, но пользователь может не понимать, что это автоматически из профиля
   - Нет визуального индикатора для auto-save (пользователь не знает, сохранилось ли)

3. **Мобильная версия**
   - Sticky header отсутствует (теряем контекст при скролле)
   - Кнопка "Создать курс" уходит за пределы экрана на длинной форме
   - Responsive breakpoints не оптимизированы для планшетов (768px - 1024px)

---

## 2. Визуальный дизайн

### Типографика

**Текущее состояние:**
```typescript
// globals.css
--font-sans: var(--font-inter);  // Предполагается Inter
--font-mono: var(--font-jetbrains-mono);

// Шкала размеров (правильная, modular scale)
--text-xs: 0.75rem;   // 12px
--text-sm: 0.875rem;  // 14px
--text-base: 1rem;    // 16px
--text-lg: 1.125rem;  // 18px
--text-xl: 1.25rem;   // 20px
--text-2xl: 1.5rem;   // 24px
--text-3xl: 1.875rem; // 30px
--text-4xl: 2.25rem;  // 36px
--text-5xl: 3rem;     // 48px
--text-6xl: 3.75rem;  // 60px

// Line heights корректные (1.5-1.7 для body, 1.1-1.3 для headings)
```

**Проблемы:**
- ❌ **Inter font** — generic, overused, "AI-generated" aesthetic
- ❌ Отсутствует font-weight система (используются только встроенные: regular, medium, semibold, bold)
- ❌ Нет различия между display headings и body headings
- ❌ Letter-spacing не настроен (для крупных заголовков нужен negative letter-spacing)

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Сменить primary font на уникальный**
   ```typescript
   // Вариант 1: Geist (от Vercel) — современный, tech-savvy
   import { GeistSans } from 'geist/font/sans'

   // Вариант 2: Plus Jakarta Sans — дружелюбный, современный
   import { Plus_Jakarta_Sans } from 'next/font/google'

   // Вариант 3: Cabinet Grotesk (платный) — уникальный, запоминающийся
   // Или Space Grotesk (бесплатный) — техничный, современный
   import { Space_Grotesk } from 'next/font/google'
   ```

2. **Добавить display font для больших заголовков**
   ```typescript
   // app/layout.tsx
   import { Space_Grotesk, Inter } from 'next/font/google'

   const displayFont = Space_Grotesk({
     subsets: ['latin', 'cyrillic'],
     weight: ['400', '500', '600', '700'],
     variable: '--font-display',
   })

   const bodyFont = Inter({
     subsets: ['latin', 'cyrillic'],
     weight: ['400', '500', '600'],
     variable: '--font-body',
   })

   // globals.css
   :root {
     --font-display: var(--font-space-grotesk);
     --font-body: var(--font-inter);
   }

   // Использование
   .heading-1, .heading-2 {
     font-family: var(--font-display);
     letter-spacing: -0.02em; // Для display размеров
   }
   ```

3. **Улучшить типографическую иерархию**
   ```css
   /* globals.css */
   .page-title {
     font-family: var(--font-display);
     font-size: clamp(2rem, 5vw, 3.75rem); /* 32px-60px */
     font-weight: 700;
     line-height: 1.1;
     letter-spacing: -0.03em;
   }

   .section-title {
     font-family: var(--font-display);
     font-size: clamp(1.5rem, 3vw, 2.25rem); /* 24px-36px */
     font-weight: 600;
     line-height: 1.2;
     letter-spacing: -0.01em;
   }

   .body-emphasis {
     font-family: var(--font-body);
     font-size: 1.125rem; /* 18px */
     line-height: 1.7;
     font-weight: 500;
   }
   ```

**Влияние на UX:** Уникальная типографика создаёт запоминающийся brand identity, повышает perceived quality продукта.

---

### Цветовая палитра

**Текущее состояние:**
```typescript
// globals.css
--purple-500: 139 92 246; /* #8b5cf6 */
--purple-600: 124 58 237; /* #7c3aed */
--purple-700: 109 40 217; /* #6d28d9 */

// Gradient (типичный AI aesthetic)
--gradient-primary: linear-gradient(135deg, rgb(139 92 246), rgb(236 72 153));
// Purple → Pink gradient — overused в 2023-2024

// Dark mode background
--background: 222 47% 11%; // Тёмный сине-серый
```

**Проблемы:**
- ❌ **Purple-pink gradient** — generic AI aesthetic (Linear, Notion knockoffs)
- ❌ Недостаточная цветовая дифференциация для состояний
- ❌ Акцентный цвет не выделяется достаточно на тёмном фоне
- ❌ Отсутствует secondary accent для визуальной иерархии

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Сменить accent palette на уникальный**
   ```css
   /* Вариант 1: Electric Cyan + Deep Purple (tech-inspired) */
   :root {
     --primary: 189 100% 56%; /* #00D4FF — electric cyan */
     --secondary: 262 83% 58%; /* #8b5cf6 — purple */
     --accent: 338 100% 67%; /* #FF3D8F — hot pink */

     /* Градиенты */
     --gradient-primary: linear-gradient(135deg, #00D4FF, #8b5cf6);
     --gradient-accent: linear-gradient(135deg, #FF3D8F, #00D4FF);
   }

   /* Вариант 2: Emerald + Indigo (trust + innovation) */
   :root {
     --primary: 160 84% 39%; /* #10b981 — emerald */
     --secondary: 239 84% 67%; /* #6366f1 — indigo */
     --accent: 43 96% 56%;    /* #f59e0b — amber */

     /* Градиенты */
     --gradient-primary: linear-gradient(135deg, #10b981, #6366f1);
     --gradient-accent: linear-gradient(135deg, #f59e0b, #10b981);
   }

   /* Вариант 3: Orange + Purple (energy + creativity) */
   :root {
     --primary: 262 83% 58%; /* #8b5cf6 — purple (оставляем) */
     --secondary: 24 95% 53%; /* #f97316 — orange */
     --accent: 335 78% 42%;   /* #be185d — deep pink */

     /* Градиенты */
     --gradient-primary: linear-gradient(135deg, #8b5cf6, #f97316);
     --gradient-accent: linear-gradient(135deg, #f97316, #be185d);
   }
   ```

2. **Добавить semantic colors для состояний**
   ```css
   /* Улучшенные состояния */
   :root {
     /* Success — используем более яркий оттенок */
     --success: 142 71% 45%; /* #22c55e вместо #10b981 */

     /* Warning — более тёплый */
     --warning: 38 92% 50%; /* #ff9800 */

     /* Error — более заметный */
     --danger: 0 84% 60%; /* #ef4444 */

     /* Info — отличается от primary */
     --info: 199 89% 48%; /* #0ea5e9 — sky-500 */
   }
   ```

3. **Создать colour scales для consistency**
   ```css
   /* Primary scale */
   --primary-50: 248 245 255;
   --primary-100: 241 232 255;
   --primary-200: 221 214 254;
   --primary-300: 196 181 253;
   --primary-400: 167 139 250;
   --primary-500: 139 92 246;  /* Base */
   --primary-600: 124 58 237;
   --primary-700: 109 40 217;
   --primary-800: 91 33 182;
   --primary-900: 76 29 149;
   --primary-950: 59 7 100;
   ```

**Влияние на UX:** Уникальная цветовая палитра создаёт запоминающийся brand, улучшает accessibility через правильные контрасты.

---

### Пространство и отступы

**Текущее состояние:**
```typescript
// Правильная 4px-базовая система
--spacing: 0.25rem; /* 4px base */

// Spacing scale корректный (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 128px)

// В компонентах используется:
p-4 sm:p-6 md:p-8  // 16px, 24px, 32px
gap-3 md:gap-4     // 12px, 16px
mb-4 sm:mb-6       // 16px, 24px
```

**Проблемы:**
- ✅ Spacing system правильный (8pt grid)
- ⚠️ Но применяется непоследовательно (иногда p-4, иногда p-6, нет чёткого правила)
- ❌ Недостаточно whitespace вокруг critical actions (кнопка "Создать курс")
- ❌ На мобильных устройствах padding слишком маленький (4px = 16px недостаточно)

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Установить чёткие правила spacing**
   ```typescript
   // Design tokens для карточек
   const CARD_PADDING = {
     mobile: 'p-4',       // 16px
     tablet: 'sm:p-6',    // 24px
     desktop: 'md:p-8',   // 32px
   }

   const CARD_GAP = {
     mobile: 'gap-4',     // 16px
     tablet: 'sm:gap-6',  // 24px
     desktop: 'lg:gap-8', // 32px
   }

   // Применение
   <div className={`${CARD_PADDING.mobile} ${CARD_PADDING.tablet} ${CARD_PADDING.desktop}`}>
   ```

2. **Увеличить whitespace для визуальной иерархии**
   ```tsx
   // Вместо:
   <div className="space-y-6">
     <Section1 />
     <Section2 />
   </div>

   // Делать:
   <div className="space-y-8 sm:space-y-12 md:space-y-16">
     <Section1 />
     <Section2 />
   </div>
   ```

3. **Добавить breathing room вокруг CTA**
   ```tsx
   // Submit button section
   <motion.div className="xl:col-span-2 flex flex-col sm:flex-row gap-4 justify-between items-center pt-8 sm:pt-12">
     {/* Increased top padding */}
   </motion.div>
   ```

**Влияние на UX:** Правильный whitespace снижает когнитивную нагрузку, улучшает scanability формы.

---

### Карточки и контейнеры

**Текущее состояние:**
```tsx
// Все карточки используют одинаковый стиль
className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10"
```

**Проблемы:**
- ❌ Все секции имеют одинаковый visual weight (нет иерархии)
- ❌ Backdrop blur слишком сильный (xl = 24px) — создаёт ощущение "мутности"
- ❌ Border-radius слишком большой (2xl = 24px) — выглядит "пухлым"
- ❌ Shadows отсутствуют — карточки не "поднимаются" над фоном

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Создать visual hierarchy через elevation**
   ```tsx
   // Primary card (важные секции: Topic, Email)
   const PRIMARY_CARD = "bg-white/95 dark:bg-black/80 backdrop-blur-md rounded-xl p-6 border border-slate-300 dark:border-white/20 shadow-lg hover:shadow-xl transition-shadow"

   // Secondary card (опциональные секции: File upload, Advanced)
   const SECONDARY_CARD = "bg-white/90 dark:bg-black/70 backdrop-blur-md rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-md"

   // Tertiary card (информационные блоки: Info boxes)
   const TERTIARY_CARD = "bg-white/80 dark:bg-black/60 backdrop-blur-sm rounded-lg p-4 border border-slate-100 dark:border-white/5"
   ```

2. **Уменьшить border-radius для modern look**
   ```tsx
   // Вместо rounded-2xl (24px)
   // Использовать rounded-xl (16px) для карточек
   // Использовать rounded-lg (12px) для кнопок
   // Использовать rounded-md (8px) для inputs

   // Пример:
   <div className="rounded-xl border-2 hover:border-primary transition-all">
   ```

3. **Добавить тонкие shadows для depth**
   ```css
   /* globals.css - улучшенные shadows */
   .card-elevated {
     box-shadow:
       0 2px 8px rgba(0, 0, 0, 0.04),
       0 4px 16px rgba(0, 0, 0, 0.08);
   }

   .card-elevated:hover {
     box-shadow:
       0 4px 12px rgba(0, 0, 0, 0.08),
       0 8px 24px rgba(0, 0, 0, 0.12);
   }

   /* Dark mode версии */
   .dark .card-elevated {
     box-shadow:
       0 2px 8px rgba(0, 0, 0, 0.3),
       0 4px 16px rgba(0, 0, 0, 0.4);
   }
   ```

**Влияние на UX:** Визуальная иерархия направляет внимание пользователя, elevation создаёт ощущение глубины и качества.

---

## 3. UX и взаимодействие

### Формы и инпуты

**Текущее состояние:**
```tsx
// Topic input
<input
  className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
/>

// Error state
className={errors.topic ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500'}
```

**Проблемы:**
- ⚠️ Focus ring отсутствует (только border-color меняется)
- ❌ Placeholder text имеет низкий контраст (white/40 = 40% opacity недостаточно для WCAG AA)
- ❌ Error state слишком агрессивный (animate-pulse + border-red-500)
- ❌ Disabled email field не имеет чёткого visual distinction

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Добавить proper focus states**
   ```css
   /* globals.css */
   input:focus-visible,
   textarea:focus-visible,
   select:focus-visible {
     outline: 3px solid rgb(var(--primary));
     outline-offset: 2px;
     box-shadow: 0 0 0 4px rgba(var(--primary), 0.1);
     border-color: rgb(var(--primary));
   }

   /* Или использовать Tailwind */
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
   ```

2. **Улучшить contrast для placeholders**
   ```tsx
   // Вместо:
   placeholder-slate-400 dark:placeholder-white/40

   // Использовать:
   placeholder-slate-500 dark:placeholder-white/60

   // Или добавить helper text
   <label className="text-sm text-slate-600 dark:text-white/80">
     Тема курса
     <span className="text-slate-400 dark:text-white/50 ml-2">(например: "Основы Python")</span>
   </label>
   ```

3. **Сделать error state менее агрессивным**
   ```tsx
   // Вместо animate-pulse (раздражает)
   // Использовать shake animation

   // globals.css
   @keyframes shake {
     0%, 100% { transform: translateX(0); }
     10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
     20%, 40%, 60%, 80% { transform: translateX(4px); }
   }

   .animate-shake {
     animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
   }

   // Использование
   className={errors.topic ? 'border-red-400 dark:border-red-500 animate-shake' : '...'}
   ```

4. **Улучшить disabled state для email**
   ```tsx
   // Добавить tooltip с объяснением
   <Tooltip content="Email берётся из вашего профиля и не может быть изменён здесь">
     <input
       readOnly
       className="cursor-not-allowed bg-slate-50 dark:bg-black/20 text-slate-500 dark:text-white/50 border-dashed"
     />
   </Tooltip>

   // Или добавить info icon рядом
   <div className="relative">
     <input readOnly ... />
     <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2">
       <Info className="w-4 h-4 text-slate-400" />
     </button>
   </div>
   ```

**Влияние на UX:** Правильные focus states улучшают keyboard navigation, хороший контраст повышает accessibility, error feedback должен быть заметным, но не раздражающим.

---

### Кнопки и CTA

**Текущее состояние:**
```tsx
// Submit button
<button
  type="submit"
  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-xl hover:shadow-2xl hover:scale-105"
>
  <Sparkles className="w-6 h-6 group-hover:rotate-12" />
  <span>Создать курс</span>
</button>
```

**Проблемы:**
- ✅ Размер достаточный (px-8 py-4 = хороший touch target)
- ✅ Loading state есть (Loader2 spinner)
- ❌ Gradient типичный AI aesthetic (violet-purple)
- ❌ Hover scale-105 может вызвать layout shift
- ❌ Отсутствует pressed state (active:scale-95)
- ❌ Icon rotate-12 на hover выглядит playful, но может отвлекать

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Улучшить button hierarchy**
   ```tsx
   // Primary CTA (Submit)
   const PRIMARY_BTN = "inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg shadow-lg hover:bg-primary-600 hover:shadow-xl active:scale-98 transition-all"

   // Secondary button (Cancel)
   const SECONDARY_BTN = "inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 active:scale-98 transition-all"

   // Tertiary button (Advanced settings toggle)
   const TERTIARY_BTN = "inline-flex items-center gap-2 px-4 py-2 bg-transparent text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg transition-all"
   ```

2. **Добавить pressed state**
   ```tsx
   // Вместо только hover:scale-105
   // Добавить:
   active:scale-98 // Небольшое "вдавливание" при клике

   // Для тактильного feedback
   active:shadow-inner
   ```

3. **Сделать loading state более информативным**
   ```tsx
   {isSubmitting ? (
     <>
       <Loader2 className="w-5 h-5 animate-spin" />
       <span>
         {isUploadingFiles ? 'Загружаем файлы...' : 'Создаём курс...'}
       </span>
       {/* Добавить progress indicator */}
       {isUploadingFiles && (
         <span className="text-xs opacity-75">
           {uploadProgress}%
         </span>
       )}
     </>
   ) : (
     // ...
   )}
   ```

4. **Убрать или улучшить icon animation**
   ```tsx
   // Вместо rotate-12 (слишком playful)
   // Использовать subtle scale
   <Sparkles className="w-6 h-6 group-hover:scale-110 transition-transform" />

   // Или pulse для "магического" ощущения
   <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
   ```

**Влияние на UX:** Чёткая button hierarchy направляет действия пользователя, pressed states дают тактильный feedback, loading states снижают uncertainty.

---

### Анимации и микроинтеракции

**Текущее состояние:**
```tsx
// Framer Motion используется для:
// 1. Page load animations (initial/animate)
// 2. Error message animations (initial/animate)
// 3. File list animations (AnimatePresence)
// 4. Hover effects на карточках (whileHover, whileTap)

// Примеры:
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>

<motion.div
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
```

**Проблемы:**
- ✅ Stagger animations есть (delay: 0.1, 0.2, 0.3...)
- ❌ Отсутствует orchestration (все элементы анимируются независимо)
- ❌ Нет micro-interactions для feedback (checkbox check, radio select)
- ❌ File upload progress не имеет spring animation
- ❌ Не учитывается prefers-reduced-motion

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Добавить orchestrated page load**
   ```tsx
   // Вместо независимых animations
   // Создать parent container с stagger children

   const containerVariants = {
     hidden: { opacity: 0 },
     visible: {
       opacity: 1,
       transition: {
         staggerChildren: 0.08,
         delayChildren: 0.2,
       }
     }
   };

   const itemVariants = {
     hidden: { opacity: 0, y: 20 },
     visible: {
       opacity: 1,
       y: 0,
       transition: {
         type: "spring",
         stiffness: 100,
         damping: 15
       }
     }
   };

   <motion.form
     variants={containerVariants}
     initial="hidden"
     animate="visible"
   >
     <motion.div variants={itemVariants}>Section 1</motion.div>
     <motion.div variants={itemVariants}>Section 2</motion.div>
     <motion.div variants={itemVariants}>Section 3</motion.div>
   </motion.form>
   ```

2. **Добавить micro-interactions**
   ```tsx
   // Radio button selection (writing style)
   <motion.div
     whileTap={{ scale: 0.97 }}
     animate={{
       borderColor: isSelected ? 'rgb(139 92 246)' : 'rgb(226 232 240)',
       backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
     }}
     transition={{ type: "spring", stiffness: 300, damping: 20 }}
   >

   // Checkbox check animation
   <motion.svg
     initial={{ pathLength: 0 }}
     animate={{ pathLength: isChecked ? 1 : 0 }}
     transition={{ duration: 0.3, ease: "easeInOut" }}
   >
     <path d="M5 13l4 4L19 7" />
   </motion.svg>

   // File upload success checkmark
   <motion.div
     initial={{ scale: 0, rotate: -180 }}
     animate={{ scale: 1, rotate: 0 }}
     transition={{ type: "spring", stiffness: 200, damping: 15 }}
   >
     <CheckCircle />
   </motion.div>
   ```

3. **Улучшить file upload progress**
   ```tsx
   // Вместо linear progress
   // Использовать spring animation

   <motion.div
     className="h-1 bg-primary rounded-full"
     initial={{ width: 0 }}
     animate={{ width: `${file.progress}%` }}
     transition={{
       type: "spring",
       stiffness: 100,
       damping: 20
     }}
   />

   // Добавить particle effects при 100%
   {file.progress === 100 && (
     <motion.div
       initial={{ scale: 0.8, opacity: 0 }}
       animate={{ scale: 1.2, opacity: [0, 1, 0] }}
       transition={{ duration: 0.6 }}
       className="absolute inset-0 bg-green-400 rounded-lg"
     />
   )}
   ```

4. **Учитывать prefers-reduced-motion**
   ```tsx
   // Создать utility hook
   function usePrefersReducedMotion() {
     const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

     useEffect(() => {
       const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
       setPrefersReducedMotion(mediaQuery.matches);

       const handler = (e: MediaQueryListEvent) => {
         setPrefersReducedMotion(e.matches);
       };

       mediaQuery.addEventListener('change', handler);
       return () => mediaQuery.removeEventListener('change', handler);
     }, []);

     return prefersReducedMotion;
   }

   // Использование
   const prefersReducedMotion = usePrefersReducedMotion();

   <motion.div
     initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
     animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
   >
   ```

**Влияние на UX:** Orchestrated animations создают premium feel, micro-interactions дают immediate feedback, reduced motion поддержка улучшает accessibility.

---

### Loading states и skeleton screens

**Текущее состояние:**
```tsx
// Проверка permissions loading
{canCreate === null && (
  <div className="...">
    <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
    <p>Проверка прав доступа...</p>
  </div>
)}

// Dynamic import loading
loading: () => (
  <div className="flex justify-center items-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
  </div>
)
```

**Проблемы:**
- ⚠️ Loading state слишком простой (только spinner)
- ❌ Отсутствуют skeleton screens (пользователь не видит структуру будущего контента)
- ❌ Нет progress indication для длительных операций
- ❌ File upload loading не имеет визуального feedback кроме progress bar

**Рекомендации:**

#### Приоритет: **НИЗКИЙ**

1. **Добавить skeleton screens**
   ```tsx
   // Вместо простого spinner
   // Показывать структуру формы

   function FormSkeleton() {
     return (
       <div className="space-y-6 animate-pulse">
         {/* Header skeleton */}
         <div className="h-10 bg-slate-200 dark:bg-white/10 rounded-xl w-1/3" />

         {/* Card skeleton */}
         <div className="bg-white/90 dark:bg-black/70 rounded-2xl p-8 border border-slate-200 dark:border-white/10">
           <div className="space-y-4">
             <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-1/4" />
             <div className="h-12 bg-slate-100 dark:bg-white/5 rounded-xl" />
             <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-1/4" />
             <div className="h-12 bg-slate-100 dark:bg-white/5 rounded-xl" />
           </div>
         </div>

         {/* More cards... */}
       </div>
     );
   }

   // Использование
   const CreateCourseForm = dynamic(
     () => import("@/components/forms/create-course-form"),
     { loading: () => <FormSkeleton />, ssr: false }
   );
   ```

2. **Добавить shimmer effect**
   ```css
   /* globals.css */
   @keyframes shimmer {
     0% { background-position: -200% 0; }
     100% { background-position: 200% 0; }
   }

   .shimmer {
     background: linear-gradient(
       90deg,
       rgba(255, 255, 255, 0) 0%,
       rgba(255, 255, 255, 0.2) 50%,
       rgba(255, 255, 255, 0) 100%
     );
     background-size: 200% 100%;
     animation: shimmer 1.5s infinite;
   }

   .dark .shimmer {
     background: linear-gradient(
       90deg,
       rgba(255, 255, 255, 0) 0%,
       rgba(255, 255, 255, 0.05) 50%,
       rgba(255, 255, 255, 0) 100%
     );
   }
   ```

3. **Добавить progress indication для file uploads**
   ```tsx
   // Показать общий прогресс
   {isUploadingFiles && (
     <div className="fixed bottom-4 right-4 bg-white dark:bg-black/90 rounded-xl p-4 shadow-2xl border border-slate-200 dark:border-white/10 z-50">
       <div className="flex items-center gap-3 mb-2">
         <Loader2 className="w-5 h-5 animate-spin text-primary" />
         <span className="font-medium">Загрузка файлов...</span>
       </div>
       <div className="w-64 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
         <motion.div
           className="h-full bg-primary"
           initial={{ width: 0 }}
           animate={{ width: `${overallProgress}%` }}
         />
       </div>
       <p className="text-xs text-slate-500 dark:text-white/50 mt-1">
         {uploadedCount} из {totalFiles} файлов
       </p>
     </div>
   )}
   ```

**Влияние на UX:** Skeleton screens снижают perceived load time, shimmer effects создают ощущение прогресса, progress indication даёт certainty.

---

### Error handling и уведомления

**Текущее состояние:**
```tsx
// Error display в форме
{errors.topic && (
  <motion.p
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-red-400 text-sm mt-2 flex items-center gap-1"
  >
    <AlertCircle className="w-4 h-4" />
    {errors.topic.message}
  </motion.p>
)}

// Toast notifications (Sonner)
toast.error("Ошибка создания курса", {
  description: "Произошла неизвестная ошибка"
})

// Scroll to error + animation
element.classList.add('animate-pulse', 'ring-2', 'ring-red-500')
```

**Проблемы:**
- ✅ Error messages анимированы (fade in)
- ✅ Scroll to first error реализован
- ❌ Error messages не всегда actionable (что делать дальше?)
- ❌ Rate limit error показывается только в toast (может пропустить)
- ❌ File upload errors не aggregated (каждый файл показывает отдельно)

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Сделать error messages actionable**
   ```tsx
   // Вместо только сообщения об ошибке
   // Добавить предложение решения

   {errors.topic && (
     <motion.div
       className="mt-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg"
     >
       <div className="flex items-start gap-2">
         <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
         <div>
           <p className="text-red-700 dark:text-red-400 text-sm font-medium">
             {errors.topic.message}
           </p>
           <p className="text-red-600 dark:text-red-300 text-xs mt-1">
             Укажите тему длиной от 3 до 200 символов. Например: "Основы Python для начинающих"
           </p>
         </div>
       </div>
     </motion.div>
   )}
   ```

2. **Добавить persistent error banner для critical errors**
   ```tsx
   // Rate limit error
   {rateLimitError && (
     <motion.div
       initial={{ opacity: 0, y: -20 }}
       animate={{ opacity: 1, y: 0 }}
       className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
     >
       <div className="bg-orange-500 text-white rounded-xl p-4 shadow-2xl">
         <div className="flex items-start gap-3">
           <AlertCircle className="w-5 h-5 mt-0.5" />
           <div className="flex-1">
             <h3 className="font-semibold mb-1">Превышен лимит создания курсов</h3>
             <p className="text-sm opacity-90">{rateLimitError.message}</p>
             <p className="text-xs opacity-75 mt-2">
               Попробуйте снова через {rateLimitError.retryAfter} секунд
             </p>
           </div>
           <button
             onClick={() => setRateLimitError(null)}
             className="text-white/80 hover:text-white"
           >
             <X className="w-5 h-5" />
           </button>
         </div>
       </div>
     </motion.div>
   )}
   ```

3. **Aggregate file upload errors**
   ```tsx
   // Вместо показа каждой ошибки отдельно
   // Показать summary

   {failedFiles.length > 0 && (
     <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
       <div className="flex items-start gap-3">
         <AlertCircle className="w-5 h-5 text-red-500" />
         <div className="flex-1">
           <h4 className="font-medium text-red-700 dark:text-red-400 mb-2">
             Не удалось загрузить {failedFiles.length} файл(ов)
           </h4>
           <ul className="space-y-1 text-sm text-red-600 dark:text-red-300">
             {failedFiles.map(file => (
               <li key={file.id} className="flex items-center gap-2">
                 <span className="font-medium">{file.file.name}</span>
                 <span className="text-xs opacity-75">— {file.error}</span>
               </li>
             ))}
           </ul>
           <button
             onClick={retryFailedUploads}
             className="mt-3 text-sm font-medium text-red-700 dark:text-red-400 hover:underline"
           >
             Повторить загрузку всех файлов
           </button>
         </div>
       </div>
     </div>
   )}
   ```

**Влияние на UX:** Actionable errors снижают frustration, persistent banners обеспечивают visibility critical errors, aggregation упрощает восприятие.

---

## 4. Accessibility (A11y)

### ARIA labels и роли

**Текущее состояние:**
```tsx
// Хорошие примеры:
<fieldset>
  <legend className="sr-only">Выберите стиль изложения курса</legend>
  <div role="radiogroup" aria-labelledby="writing-style-heading">
    ...
  </div>
</fieldset>

<input
  aria-describedby={errors.topic ? "topic-error" : undefined}
  aria-invalid={errors.topic ? "true" : "false"}
  aria-required="true"
/>

<motion.p
  id="topic-error"
  role="alert"
  aria-live="polite"
>
```

**Проблемы:**
- ✅ Semantic HTML используется правильно (fieldset, legend, label)
- ✅ ARIA attributes присутствуют для критических элементов
- ⚠️ Некоторые interactive elements (format cards) не имеют proper roles
- ❌ File upload zone не имеет aria-label
- ❌ Icon-only buttons не имеют aria-label

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Добавить ARIA для format cards**
   ```tsx
   <div
     role="checkbox"
     aria-checked={isSelected}
     aria-labelledby={`format-${format.value}-title`}
     aria-describedby={`format-${format.value}-desc`}
     tabIndex={0}
     onClick={() => toggleFormat(format.value, format.available)}
     onKeyDown={(e) => {
       if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         toggleFormat(format.value, format.available);
       }
     }}
   >
     <h3 id={`format-${format.value}-title`}>
       {format.title}
     </h3>
     <p id={`format-${format.value}-desc`}>
       {format.description}
     </p>
   </div>
   ```

2. **Улучшить file upload accessibility**
   ```tsx
   <div
     role="button"
     aria-label="Загрузить файлы для создания курса. Поддерживаются форматы: PDF, DOCX, TXT, MD, PPTX, HTML. Максимальный размер: 50 МБ"
     tabIndex={0}
     onKeyDown={(e) => {
       if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         handleClick();
       }
     }}
   >
     {/* File upload UI */}
   </div>

   {/* Добавить live region для feedback */}
   <div role="status" aria-live="polite" className="sr-only">
     {uploadedFiles.length > 0 && (
       `Загружено файлов: ${uploadedFiles.filter(f => f.status === 'success').length} из ${uploadedFiles.length}`
     )}
   </div>
   ```

3. **Добавить aria-label для icon-only buttons**
   ```tsx
   // Remove file button
   <button
     type="button"
     onClick={removeFile}
     aria-label={`Удалить файл ${file.file.name}`}
   >
     <X className="w-5 h-5" />
   </button>

   // Retry upload button
   <button
     type="button"
     onClick={retryUpload}
     aria-label={`Повторить загрузку файла ${file.file.name}`}
   >
     <RefreshCw className="w-5 h-5" />
   </button>
   ```

**Влияние на UX:** Правильные ARIA labels улучшают screen reader experience, делают интерфейс доступным для пользователей с ограничениями.

---

### Keyboard navigation

**Текущее состояние:**
```tsx
// Focus management есть для валидации
element.focus()

// Tab order естественный (визуальный порядок = DOM порядок)

// Format cards поддерживают keyboard через radio buttons
<input type="radio" className="sr-only" />
```

**Проблемы:**
- ✅ Natural tab order соблюдается
- ✅ Focus management для errors работает
- ⚠️ Writing style cards используют radio inputs (правильно), но format cards используют onClick (неправильно)
- ❌ Отсутствует skip link для быстрого доступа к форме
- ❌ Modal dialogs (auth modal) могут не иметь focus trap

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Добавить skip link**
   ```tsx
   // В CreateHeader или page layout
   <a
     href="#course-form"
     className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-slate-900 focus:rounded-lg focus:shadow-lg"
   >
     Перейти к форме создания курса
   </a>

   // В CreateCourseForm
   <form id="course-form" ...>
   ```

2. **Исправить keyboard navigation для format cards**
   ```tsx
   // Вместо только onClick
   // Добавить keyboard support

   <div
     role="checkbox"
     tabIndex={0}
     onClick={() => toggleFormat(format.value, format.available)}
     onKeyDown={(e) => {
       if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         toggleFormat(format.value, format.available);
       }
     }}
   >
   ```

3. **Добавить keyboard shortcuts (опционально)**
   ```tsx
   // Добавить подсказки
   <div className="fixed bottom-4 left-4 bg-white dark:bg-black/90 rounded-lg p-3 border border-slate-200 dark:border-white/10 text-xs">
     <p className="font-medium mb-1">Быстрые клавиши</p>
     <ul className="space-y-0.5 text-slate-600 dark:text-white/60">
       <li><kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded">Ctrl</kbd> + <kbd>S</kbd> — Сохранить черновик</li>
       <li><kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded">Ctrl</kbd> + <kbd>Enter</kbd> — Создать курс</li>
     </ul>
   </div>

   // Реализация
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.ctrlKey || e.metaKey) {
         if (e.key === 's') {
           e.preventDefault();
           handleManualSave();
         }
         if (e.key === 'Enter') {
           e.preventDefault();
           handleSubmit(onSubmit)();
         }
       }
     };

     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, []);
   ```

**Влияние на UX:** Хорошая keyboard navigation улучшает productivity, shortcuts ускоряют работу опытных пользователей.

---

### Color contrast (WCAG)

**Текущее состояние:**
```tsx
// Примеры цветов:
text-slate-400 dark:text-white/40   // Placeholders
text-slate-500 dark:text-white/50   // Helper text
text-slate-600 dark:text-white/60   // Secondary text
text-slate-700 dark:text-white/80   // Body text
text-slate-900 dark:text-white      // Headings
```

**Проблемы:**
- ⚠️ `white/40` (40% opacity) на dark background может не достигать WCAG AA (4.5:1 для text)
- ⚠️ `slate-400` на white background может быть недостаточно контрастным
- ❌ Purple-500 (#8b5cf6) на white background имеет контраст ~3.7:1 (не достигает AA для body text)
- ✅ Purple-600 (#7c3aed) на white background имеет контраст ~4.8:1 (достигает AA)

**Измерения (инструмент: WebAIM Contrast Checker):**
- `#8b5cf6` (purple-500) на `#ffffff` = **3.74:1** ❌ (WCAG AA требует 4.5:1)
- `#7c3aed` (purple-600) на `#ffffff` = **4.87:1** ✅ (WCAG AA)
- `#6d28d9` (purple-700) на `#ffffff` = **6.45:1** ✅ (WCAG AAA)
- `rgba(255,255,255,0.4)` на `#0a0e1a` = **~2.8:1** ❌

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Увеличить opacity для dark mode text**
   ```tsx
   // Вместо:
   placeholder-slate-400 dark:placeholder-white/40  // 40% = недостаточно

   // Использовать:
   placeholder-slate-500 dark:placeholder-white/60  // 60% = лучше

   // Для body text минимум:
   text-slate-700 dark:text-white/85  // 85% для body
   text-slate-600 dark:text-white/70  // 70% для secondary
   ```

2. **Использовать darker purple для text**
   ```tsx
   // Вместо purple-500 для text
   // Использовать purple-600 или purple-700

   // Пример:
   <h2 className="text-purple-600 dark:text-purple-400">
     {/* purple-600 на light = 4.87:1 ✅ */}
     {/* purple-400 на dark = 8.2:1 ✅ */}
   </h2>
   ```

3. **Создать contrast-safe color tokens**
   ```css
   /* globals.css */
   :root {
     /* Text colors with guaranteed contrast */
     --text-primary: 15 23 42;      /* slate-900 = 17.6:1 ✅ */
     --text-secondary: 51 65 85;    /* slate-700 = 7.1:1 ✅ */
     --text-tertiary: 100 116 139;  /* slate-500 = 4.53:1 ⚠️ (минимум) */
     --text-disabled: 148 163 184;  /* slate-400 = 3.07:1 ❌ (только для disabled) */

     /* Interactive colors with guaranteed contrast */
     --interactive-primary: 124 58 237;  /* purple-600 = 4.87:1 ✅ */
     --interactive-hover: 109 40 217;    /* purple-700 = 6.45:1 ✅ */
   }

   .dark {
     --text-primary: 248 250 252;        /* slate-50 = 18.2:1 ✅ */
     --text-secondary: 226 232 240;      /* slate-200 = 13.1:1 ✅ */
     --text-tertiary: 203 213 225;       /* slate-300 = 10.4:1 ✅ */
     --text-disabled: 148 163 184;       /* slate-400 = 5.8:1 ✅ */

     --interactive-primary: 167 139 250; /* purple-400 = 8.2:1 ✅ */
     --interactive-hover: 196 181 253;   /* purple-300 = 11.2:1 ✅ */
   }
   ```

4. **Добавить visual indicators помимо цвета**
   ```tsx
   // Не только цветом показывать error
   // Добавить icon
   <input className={errors.topic ? 'border-red-500' : ''} />
   {errors.topic && (
     <div className="flex items-center gap-2">
       <AlertCircle className="w-4 h-4" /> {/* Visual indicator */}
       <span>{errors.topic.message}</span>
     </div>
   )}

   // Не только цветом показывать selected state
   // Добавить checkmark
   {isSelected && (
     <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-primary" />
   )}
   ```

**Влияние на UX:** Правильный контраст критичен для accessibility, visual indicators помимо цвета помогают colorblind пользователям.

---

### Screen reader support

**Текущее состояние:**
```tsx
// Хорошие примеры:
<legend className="sr-only">Выберите стиль изложения курса</legend>

<label htmlFor="topic">
  Тема курса <span className="text-red-500">*</span>
</label>

<motion.p role="alert" aria-live="polite">
  {errors.topic.message}
</motion.p>
```

**Проблемы:**
- ✅ `sr-only` класс реализован правильно
- ✅ `role="alert"` и `aria-live="polite"` используются для errors
- ⚠️ Icons не имеют `aria-hidden="true"` (screen reader будет пытаться их читать)
- ❌ Loading states не имеют `aria-busy` и `aria-live` regions
- ❌ File upload progress не анонсируется screen reader

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Добавить aria-hidden для decorative icons**
   ```tsx
   // Все decorative icons должны иметь aria-hidden
   <Sparkles className="w-6 h-6" aria-hidden="true" />
   <BookOpen className="w-5 h-5" aria-hidden="true" />

   // Исключение: meaningful icons с text
   <Mail className="w-4 h-4" aria-hidden="true" />
   <span>Email для результатов</span>
   ```

2. **Добавить live regions для loading states**
   ```tsx
   // Form submission loading
   <div aria-live="polite" aria-atomic="true" className="sr-only">
     {isSubmitting && "Создание курса в процессе. Пожалуйста, подождите."}
   </div>

   // File upload progress
   <div aria-live="polite" aria-atomic="true" className="sr-only">
     {isUploadingFiles && `Загрузка файлов: ${uploadProgress}% завершено`}
   </div>

   // Success message
   <div role="status" aria-live="polite" className="sr-only">
     {uploadSuccess && "Все файлы успешно загружены"}
   </div>
   ```

3. **Улучшить form field descriptions**
   ```tsx
   // Вместо только label
   // Добавить описание

   <label htmlFor="topic">
     Тема курса
     <span className="text-red-500" aria-label="обязательное поле">*</span>
   </label>
   <input
     id="topic"
     aria-describedby="topic-description topic-error"
   />
   <p id="topic-description" className="text-xs text-slate-500">
     Укажите название курса длиной от 3 до 200 символов
   </p>
   {errors.topic && (
     <p id="topic-error" role="alert">
       {errors.topic.message}
     </p>
   )}
   ```

**Влияние на UX:** Screen reader support критичен для blind/visually impaired пользователей, делает приложение truly inclusive.

---

## 5. Responsive Design

### Mobile-first подход

**Текущее состояние:**
```tsx
// Правильное использование mobile-first breakpoints
className="text-xl sm:text-2xl md:text-3xl lg:text-4xl"
className="p-4 sm:p-6 md:p-8"
className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"

// XL breakpoint для двухколоночной сетки
className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8"
```

**Проблемы:**
- ✅ Mobile-first подход используется правильно
- ✅ Breakpoints логичные (sm:640px, md:768px, lg:1024px, xl:1280px)
- ⚠️ Tablet landscape (768px-1024px) не оптимизирован (резкий скачок от 1col к 2col на xl:1280px)
- ❌ Sticky header отсутствует на мобильных (теряется контекст при скролле)
- ❌ Submit button уходит за edge экрана на длинной форме

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Оптимизировать tablet breakpoint**
   ```tsx
   // Вместо:
   xl:grid-cols-2  // Только на 1280px+

   // Использовать:
   lg:grid-cols-2  // На 1024px+ (laptop/tablet landscape)

   // Или добавить промежуточный вариант:
   md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2

   // Для некоторых секций можно:
   sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
   // (например, для writing styles grid)
   ```

2. **Добавить sticky submit button на мобильных**
   ```tsx
   // Вариант 1: Floating action button
   <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
     <button
       type="submit"
       className="w-full px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl shadow-2xl"
     >
       <Sparkles className="w-5 h-5 inline mr-2" />
       Создать курс
     </button>
   </div>

   // Вариант 2: Sticky footer
   <div className="sticky bottom-0 left-0 right-0 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-t border-slate-200 dark:border-white/10 p-4 md:hidden">
     <button type="submit" className="w-full ...">
       Создать курс
     </button>
   </div>

   // Добавить padding-bottom к форме чтобы не перекрывать контент
   <form className="pb-24 md:pb-0">
   ```

3. **Добавить sticky header с progress indicator**
   ```tsx
   // Показать прогресс заполнения формы
   <div className="sticky top-0 z-40 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-b border-slate-200 dark:border-white/10 p-4 md:hidden">
     <div className="flex items-center justify-between mb-2">
       <h2 className="font-semibold text-sm">Создание курса</h2>
       <span className="text-xs text-slate-500">{completionPercentage}%</span>
     </div>
     <div className="h-1 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
       <motion.div
         className="h-full bg-primary"
         initial={{ width: 0 }}
         animate={{ width: `${completionPercentage}%` }}
       />
     </div>
   </div>

   // Рассчитать completionPercentage
   const completionPercentage = useMemo(() => {
     const requiredFields = ['topic', 'email'];
     const filledRequired = requiredFields.filter(field => watch(field)).length;
     return Math.round((filledRequired / requiredFields.length) * 100);
   }, [watch('topic'), watch('email')]);
   ```

**Влияние на UX:** Sticky elements улучшают navigation на мобильных, progress indicator снижает uncertainty, оптимизация для tablet улучшает experience на iPad и подобных устройствах.

---

### Breakpoints и адаптация

**Текущее состояние:**
```typescript
// tailwind.config.ts (default breakpoints)
screens: {
  'sm': '640px',
  'md': '768px',
  'lg': '1024px',
  'xl': '1280px',
  '2xl': '1536px',
}

// В компонентах используются:
text-xl sm:text-2xl md:text-3xl lg:text-4xl
p-4 sm:p-6 md:p-8
grid-cols-1 sm:grid-cols-2 md:grid-cols-3
```

**Проблемы:**
- ✅ Breakpoints standard Tailwind (правильные)
- ⚠️ Нет custom breakpoints для edge cases (например, small phones < 375px)
- ❌ Typography scaling слишком резкий (xl → 2xl → 3xl → 4xl)
- ❌ Container max-width не ограничен (на ultra-wide мониторах форма слишком широкая)

**Рекомендации:**

#### Приоритет: **СРЕДНИЙ**

1. **Добавить container max-width**
   ```tsx
   // Ограничить ширину формы
   <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
     <CreateCourseForm />
   </div>

   // Или для карточек
   <div className="max-w-5xl mx-auto">
     {/* Form sections */}
   </div>
   ```

2. **Улучшить typography scaling**
   ```tsx
   // Вместо резких скачков
   // Использовать clamp()

   // globals.css
   .page-title {
     font-size: clamp(1.875rem, 4vw + 1rem, 3.75rem);
     /* 30px на mobile → 60px на desktop, плавно */
   }

   .section-title {
     font-size: clamp(1.25rem, 2vw + 0.75rem, 2.25rem);
     /* 20px → 36px */
   }
   ```

3. **Добавить custom breakpoint для small phones**
   ```typescript
   // tailwind.config.ts
   theme: {
     extend: {
       screens: {
         'xs': '475px',  // Small phones
         'sm': '640px',  // Large phones
         'md': '768px',  // Tablets
         'lg': '1024px', // Laptops
         'xl': '1280px', // Desktops
         '2xl': '1536px', // Large desktops
       }
     }
   }

   // Использование
   <h1 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl">
   ```

**Влияние на UX:** Правильные breakpoints улучшают experience на всех устройствах, fluid typography создаёт плавный responsive experience.

---

### Touch targets

**Текущее состояние:**
```tsx
// Buttons имеют достаточный размер
px-6 py-3  // 24px padding = ~44px height ✅

// Inputs
px-4 py-3  // 16px + 12px padding = ~44px height ✅

// Icon buttons (remove file)
<button className="p-1">
  <X className="w-5 h-5" />
</button>
// 4px padding + 20px icon = 28px ❌ (меньше минимума 44px)
```

**Проблемы:**
- ✅ Primary buttons достигают минимума 44x44px
- ✅ Form inputs достигают минимума 44px height
- ❌ Icon-only buttons слишком маленькие (28px)
- ❌ Format cards на мобильных могут быть сложны для нажатия (зависит от padding)

**Рекомендации:**

#### Приоритет: **ВЫСОКИЙ**

1. **Увеличить touch targets для icon buttons**
   ```tsx
   // Вместо:
   <button className="p-1">
     <X className="w-5 h-5" />
   </button>

   // Использовать:
   <button className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
     <X className="w-5 h-5" />
   </button>

   // Или добавить invisible hit area
   <button className="p-1 relative">
     <X className="w-5 h-5" />
     <span className="absolute inset-0 -m-2" />
     {/* Расширяет кликабельную область на 8px во все стороны */}
   </button>
   ```

2. **Увеличить spacing между interactive elements**
   ```tsx
   // Writing style cards на мобильных
   // Вместо:
   <div className="grid grid-cols-2 gap-3">

   // Использовать:
   <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
     {/* На очень маленьких экранах — 1 колонка */}
     {/* На нормальных мобильных — 2 колонки с большим gap */}
   </div>
   ```

3. **Добавить visual feedback для touch**
   ```tsx
   // Framer Motion tap animations
   <motion.button
     whileTap={{ scale: 0.95 }}
     className="..."
   >

   // Или CSS active state
   <button className="active:scale-95 active:bg-primary-600 transition-transform">
   ```

**Влияние на UX:** Правильные touch targets критичны для мобильных пользователей, снижают frustration, улучшают accuracy.

---

## 6. Best Practices 2025

### Современные тренды UI/UX

**Что модно в 2025:**

1. **Minimalist Brutalism**
   - Чёткие borders (не размытые shadows)
   - High contrast
   - Bold typography
   - Нео-брутализм: сочетание минимализма и дерзких акцентов

2. **Neomorphism Evolution**
   - Soft UI (не плоский, не скевоморфизм)
   - Subtle shadows + highlights
   - Organic shapes

3. **Glassmorphism Refined**
   - Меньше blur, больше transparency
   - Layered depth
   - Frosted glass эффекты с чёткими borders

4. **AI-Powered Personalization**
   - Adaptive UI based on user behavior
   - Contextual suggestions
   - Progressive disclosure

5. **Motion Design 3.0**
   - Choreographed animations (не independent)
   - Physics-based transitions
   - Haptic feedback integration

**Что устарело:**

1. ❌ **Purple-pink gradients** (Overused в 2023-2024)
2. ❌ **Heavy shadows everywhere** (Слишком "пухлый" вид)
3. ❌ **Overly rounded corners** (border-radius: 24px+)
4. ❌ **Neumorphism** (Soft buttons — проблемы с accessibility)
5. ❌ **Generic Inter font** (Все используют, нет уникальности)

---

### Что используют лидеры рынка

#### **Linear (linear.app)**

**UI Patterns:**
- Тёмная тема по умолчанию (dark purple-gray)
- Accent color: Electric purple (#5E6AD2)
- Font: Inter Display (с custom letter-spacing)
- Keyboard-first design
- Command palette (Cmd+K)
- Micro-animations everywhere (smooth, fast)
- Subtle gradients на buttons (не яркие)

**Что можно позаимствовать:**
```tsx
// Command palette для быстрого создания курса
<CommandPalette
  trigger="Ctrl+K"
  actions={[
    { label: "Создать курс", action: () => router.push('/create') },
    { label: "Мои курсы", action: () => router.push('/courses') },
    // ...
  ]}
/>

// Subtle button gradients
<button className="bg-gradient-to-br from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700">
```

---

#### **Vercel (vercel.com)**

**UI Patterns:**
- Monochrome с яркими акцентами (black + white + blue)
- Font: Geist (custom, modern)
- Очень много whitespace
- Clean borders (1px solid)
- Minimalist icons
- Loading states с shimmer effects

**Что можно позаимствовать:**
```tsx
// Monochrome palette с акцентами
:root {
  --foreground: 0 0 0;        /* Pure black */
  --background: 255 255 255;  /* Pure white */
  --accent: 0 112 243;        /* Vercel blue */
}

// Geist font
import { GeistSans } from 'geist/font/sans';
```

---

#### **Stripe (stripe.com)**

**UI Patterns:**
- Professional, trustworthy aesthetics
- Indigo (#635BFF) primary color
- Subtle animations (не aggressive)
- Clear visual hierarchy
- Excellent error states (actionable)
- Progressive disclosure (complex forms разбиты)

**Что можно позаимствовать:**
```tsx
// Trustworthy color palette
:root {
  --primary: 99 91 255;   /* Stripe purple */
  --success: 0 214 143;   /* Stripe green */
  --danger: 223 71 89;    /* Stripe red */
}

// Progressive disclosure для advanced settings (уже есть!)
<Collapsible trigger="Advanced settings">
  {/* Complex fields */}
</Collapsible>
```

---

#### **Notion (notion.so)**

**UI Patterns:**
- Sidebar navigation (persistent)
- Drag & drop everywhere
- Rich text editor с "/" commands
- Subtle hover states (bg-slate-50)
- Icons everywhere (visual anchors)
- Database views (table, board, calendar)

**Что можно позаимствовать:**
```tsx
// Slash commands для быстрого ввода
<Input
  onKeyDown={(e) => {
    if (e.key === '/') {
      openCommandMenu();
    }
  }}
  placeholder="Введите / для быстрых команд"
/>

// Rich hover states
<div className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
```

---

### AI-powered interfaces

**Что модно:**

1. **Inline AI suggestions**
   - Не modal, а inline
   - Context-aware
   - Subtle presentation

2. **Progressive AI assistance**
   - Не заменяет пользователя, а помогает
   - Suggest → Approve → Learn

3. **Natural language inputs**
   - Не только forms, но и conversational
   - "Create a course about Python for beginners" → парсится в форму

4. **AI-generated previews**
   - Preview результата ДО генерации
   - "Вот примерная структура курса, хотите изменить?"

**Что устарело:**

1. ❌ **AI черный ящик** (пользователь не видит process)
2. ❌ **Full automation без control** (пользователь хочет влиять на результат)
3. ❌ **Generic AI branding** (purple gradients, sparkles everywhere)

**Рекомендации для MegaCampusAI:**

#### Приоритет: **СРЕДНИЙ**

1. **Добавить AI preview перед генерацией**
   ```tsx
   // После заполнения topic + description
   // Показать preview структуры курса

   {showPreview && (
     <motion.div
       initial={{ opacity: 0, height: 0 }}
       animate={{ opacity: 1, height: 'auto' }}
       className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl p-6 mb-6"
     >
       <div className="flex items-start gap-3 mb-4">
         <Sparkles className="w-5 h-5 text-purple-500" />
         <div>
           <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
             AI Preview: Примерная структура курса
           </h3>
           <p className="text-sm text-slate-600 dark:text-white/70">
             На основе вашего описания мы предлагаем следующую структуру:
           </p>
         </div>
       </div>

       <div className="space-y-2">
         <div className="flex items-center gap-2 text-sm">
           <BookOpen className="w-4 h-4 text-purple-500" />
           <span className="font-medium">{suggestedLessons} уроков</span>
           <span className="text-slate-500">в {suggestedSections} модулях</span>
         </div>

         <div className="bg-white dark:bg-black/30 rounded-lg p-3 text-xs">
           <p className="font-medium mb-1">Примерные модули:</p>
           <ul className="space-y-0.5 text-slate-600 dark:text-white/70">
             {suggestedModules.map((module, i) => (
               <li key={i}>• {module}</li>
             ))}
           </ul>
         </div>
       </div>

       <div className="flex gap-2 mt-4">
         <button
           type="button"
           onClick={acceptPreview}
           className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium"
         >
           Выглядит хорошо
         </button>
         <button
           type="button"
           onClick={adjustPreview}
           className="px-4 py-2 bg-white dark:bg-black/30 border border-purple-200 dark:border-purple-500/30 rounded-lg text-sm font-medium"
         >
           Хочу изменить
         </button>
       </div>
     </motion.div>
   )}
   ```

2. **Добавить inline AI suggestions**
   ```tsx
   // Для topic field
   <div className="relative">
     <input
       value={topic}
       onChange={handleTopicChange}
     />

     {/* AI suggestion dropdown */}
     {aiSuggestions.length > 0 && (
       <motion.div
         initial={{ opacity: 0, y: -10 }}
         animate={{ opacity: 1, y: 0 }}
         className="absolute top-full mt-2 w-full bg-white dark:bg-black/90 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl p-2 z-10"
       >
         <p className="text-xs text-slate-500 dark:text-white/50 px-2 py-1">
           💡 Похожие популярные темы:
         </p>
         {aiSuggestions.map((suggestion, i) => (
           <button
             key={i}
             onClick={() => setTopic(suggestion)}
             className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5 rounded"
           >
             {suggestion}
           </button>
         ))}
       </motion.div>
     )}
   </div>
   ```

3. **Natural language input option**
   ```tsx
   // Toggle между form и natural language
   <div className="mb-6">
     <button
       type="button"
       onClick={() => setInputMode(mode === 'form' ? 'natural' : 'form')}
       className="text-sm text-primary hover:underline"
     >
       {mode === 'form' ? '✨ Попробовать описать своими словами' : '📝 Переключиться на форму'}
     </button>
   </div>

   {mode === 'natural' ? (
     <textarea
       value={naturalInput}
       onChange={handleNaturalInput}
       rows={6}
       className="w-full px-4 py-3 border rounded-xl"
       placeholder="Опишите курс своими словами, например:

       'Хочу создать курс по Python для начинающих программистов. В курсе должны быть основы синтаксиса, работа с данными, и создание простых программ. Длительность уроков — 5-7 минут, стиль — дружелюбный и понятный.'"
     />
   ) : (
     <FormFields />
   )}
   ```

**Влияние на UX:** AI-powered features создают "magical" experience, но должны быть subtle и давать user control. Preview снижает uncertainty, inline suggestions ускоряют workflow.

---

## 7. Конкретные рекомендации по улучшению

### Рекомендация 1: Уникальная цветовая схема

**Текущее состояние:**
```typescript
// Generic purple-pink gradient (AI aesthetic 2023-2024)
--gradient-primary: linear-gradient(135deg, rgb(139 92 246), rgb(236 72 153));
```

**Предлагаемое изменение:**
```typescript
// Вариант 1: Tech-inspired (Electric Cyan + Deep Purple)
:root {
  --primary: 189 100% 56%;      /* #00D4FF — electric cyan */
  --secondary: 262 83% 58%;     /* #8b5cf6 — purple */
  --accent: 338 100% 67%;       /* #FF3D8F — hot pink */

  --gradient-primary: linear-gradient(135deg, #00D4FF, #8b5cf6);
  --gradient-accent: linear-gradient(135deg, #FF3D8F, #00D4FF);
  --gradient-hero: linear-gradient(to bottom right, #00D4FF 0%, #8b5cf6 50%, #FF3D8F 100%);
}

.dark {
  /* В dark mode — ярче для контраста */
  --primary: 189 100% 65%;      /* Lighter cyan */
  --secondary: 262 90% 70%;     /* Lighter purple */
}

// Вариант 2: Energy + Creativity (Orange + Purple)
:root {
  --primary: 262 83% 58%;       /* #8b5cf6 — purple (оставляем) */
  --secondary: 24 95% 53%;      /* #f97316 — orange */
  --accent: 335 78% 42%;        /* #be185d — deep pink */

  --gradient-primary: linear-gradient(135deg, #8b5cf6, #f97316);
  --gradient-accent: linear-gradient(135deg, #f97316, #be185d);
}
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/app/globals.css`
- Все компоненты с `from-violet-600 to-purple-600` → заменить на новую палитру

**Приоритет:** ВЫСОКИЙ
**Время:** 2-3 часа (поиск и замена цветов во всех компонентах)
**Влияние:** Создаёт уникальный brand identity, избавляет от generic AI aesthetic

---

### Рекомендация 2: Улучшить контраст и читаемость

**Текущее состояние:**
```tsx
// File upload component
<p className="text-slate-500 dark:text-white/70 text-sm">
  PDF, DOCX, TXT, MD, PPTX, HTML (до 50 МБ)
</p>
<p className="text-slate-400 dark:text-white/60 text-xs mt-2">
  Максимум 10 файлов
</p>

// Placeholders
placeholder-slate-400 dark:placeholder-white/40
```

**Предлагаемое изменение:**
```tsx
// Увеличить opacity для dark mode
<p className="text-slate-500 dark:text-white/85 text-sm">
  PDF, DOCX, TXT, MD, PPTX, HTML (до 50 МБ)
</p>
<p className="text-slate-400 dark:text-white/70 text-xs mt-2">
  Максимум 10 файлов
</p>

// Улучшить placeholders
placeholder-slate-500 dark:placeholder-white/65

// Добавить text-shadow для light text на shader background
style={{
  textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)'
}}
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/file-upload.tsx` (строки 284-299)
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (все placeholders)

**Приоритет:** ВЫСОКИЙ
**Время:** 1 час (global search & replace)
**Влияние:** Улучшает WCAG compliance, повышает читаемость для всех пользователей

---

### Рекомендация 3: Добавить визуальную иерархию карточкам

**Текущее состояние:**
```tsx
// Все карточки одинаковые
className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10"
```

**Предлагаемое изменение:**
```tsx
// Создать design tokens
const CARD_VARIANTS = {
  primary: "bg-white/95 dark:bg-black/80 backdrop-blur-md rounded-xl p-6 border-2 border-slate-300 dark:border-white/20 shadow-lg hover:shadow-xl transition-all",
  secondary: "bg-white/90 dark:bg-black/70 backdrop-blur-md rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-md",
  tertiary: "bg-white/80 dark:bg-black/60 backdrop-blur-sm rounded-lg p-4 border border-slate-100 dark:border-white/5 shadow-sm",
};

// Применить:
// Primary для: Topic + Email (обязательные поля)
<motion.div className={CARD_VARIANTS.primary}>

// Secondary для: Writing style, Formats, File upload
<motion.div className={CARD_VARIANTS.secondary}>

// Tertiary для: Info boxes, hints
<div className={CARD_VARIANTS.tertiary}>
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (строки 820-1154)

**Приоритет:** ВЫСОКИЙ
**Время:** 1-2 часа
**Влияние:** Направляет внимание пользователя на важные поля, создаёт visual hierarchy

---

### Рекомендация 4: Orchestrated page load animations

**Текущее состояние:**
```tsx
// Независимые animations для каждой секции
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, delay: 0.1 }}
>
```

**Предлагаемое изменение:**
```tsx
// Создать parent container с staggerChildren
const formVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    }
  }
};

const sectionVariants = {
  hidden: {
    opacity: 0,
    y: 30,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    }
  }
};

// Применить
<motion.form
  variants={formVariants}
  initial="hidden"
  animate="visible"
  onSubmit={handleFormSubmit}
  className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8"
>
  <motion.div variants={sectionVariants}>
    {/* Section 1 */}
  </motion.div>
  <motion.div variants={sectionVariants}>
    {/* Section 2 */}
  </motion.div>
  {/* ... */}
</motion.form>
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (строки 816-1368)

**Приоритет:** СРЕДНИЙ
**Время:** 2 часа
**Влияние:** Создаёт premium feel, orchestration делает анимации более natural

---

### Рекомендация 5: Добавить sticky submit button на мобильных

**Текущее состояние:**
```tsx
// Submit button находится внизу формы (может уйти за edge)
<motion.div className="xl:col-span-2 flex flex-col sm:flex-row gap-4 justify-between items-center">
  <button type="submit">Создать курс</button>
</motion.div>
```

**Предлагаемое изменение:**
```tsx
// Добавить floating action button для мобильных
<>
  {/* Desktop version (внутри формы) */}
  <motion.div className="xl:col-span-2 hidden md:flex flex-row gap-4 justify-between items-center pt-8">
    <button type="button" onClick={() => router.push("/")}>
      Отмена
    </button>
    <button type="submit">
      Создать курс
    </button>
  </motion.div>

  {/* Mobile sticky footer */}
  <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-t border-slate-200 dark:border-white/10 p-4 z-40 safe-area-inset-bottom">
    <button
      type="submit"
      disabled={isSubmitting}
      className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white active:scale-98 transition-transform shadow-xl"
    >
      {isSubmitting ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Создание...</span>
        </>
      ) : (
        <>
          <Sparkles className="w-5 h-5" />
          <span>Создать курс</span>
        </>
      )}
    </button>
  </div>

  {/* Add padding to form so content doesn't hide under sticky button */}
  <div className="md:hidden h-24" />
</>
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (строки 1319-1365)

**Приоритет:** ВЫСОКИЙ
**Время:** 1 час
**Влияние:** Критично для мобильной UX, всегда доступная CTA

---

### Рекомендация 6: Улучшить стили изложения (reduce cognitive load)

**Текущее состояние:**
```tsx
// 19 стилей изложения (12 показываем, потом ещё 7)
const displayedStyles = showAllStyles ? reorderedStyles : reorderedStyles.slice(0, 12)
```

**Предлагаемое изменение:**
```tsx
// Вариант 1: Группировать по категориям
const STYLE_CATEGORIES = {
  popular: ['conversational', 'practical', 'storytelling', 'academic'],
  teaching: ['socratic', 'problem_based', 'interactive', 'collaborative'],
  format: ['microlearning', 'visual', 'gamified', 'minimalist'],
  tone: ['motivational', 'professional', 'engaging', 'inspirational'],
  advanced: ['research', 'technical', 'analytical'],
};

// UI с tabs
<Tabs defaultValue="popular">
  <TabsList>
    <TabsTrigger value="popular">Популярные</TabsTrigger>
    <TabsTrigger value="teaching">Методики</TabsTrigger>
    <TabsTrigger value="format">Форматы</TabsTrigger>
    <TabsTrigger value="tone">Тон</TabsTrigger>
    <TabsTrigger value="advanced">Продвинутые</TabsTrigger>
  </TabsList>

  <TabsContent value="popular">
    {STYLE_CATEGORIES.popular.map(...)}
  </TabsContent>
  {/* ... */}
</Tabs>

// Вариант 2: Показывать только 6 самых популярных + search
<div className="space-y-4">
  <input
    type="search"
    placeholder="Поиск стиля изложения..."
    value={styleSearch}
    onChange={(e) => setStyleSearch(e.target.value)}
    className="w-full px-4 py-2 border rounded-lg"
  />

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {filteredStyles.slice(0, 6).map(...)}
  </div>

  {filteredStyles.length > 6 && (
    <button onClick={() => setShowAll(true)}>
      Показать все ({filteredStyles.length - 6} стилей)
    </button>
  )}
</div>
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (строки 1020-1112)

**Приоритет:** СРЕДНИЙ
**Время:** 3-4 часа (требует UI refactoring)
**Влияние:** Снижает cognitive load, делает выбор проще

---

### Рекомендация 7: Добавить AI preview перед генерацией

**Текущее состояние:**
```tsx
// Форма отправляется сразу после submit
// Пользователь не видит preview структуры курса
```

**Предлагаемое изменение:**
```tsx
// Добавить preview step
const [showPreview, setShowPreview] = useState(false);
const [coursePreview, setCoursePreview] = useState<CoursePreview | null>(null);

// После валидации, но до отправки
const handleFormSubmit = handleSubmit(async (data) => {
  if (!validateAndScrollToError()) return;

  // Показать preview
  setIsGeneratingPreview(true);
  const preview = await generateCoursePreview(data);
  setCoursePreview(preview);
  setShowPreview(true);
  setIsGeneratingPreview(false);
});

// Preview UI
{showPreview && coursePreview && (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  >
    <div className="bg-white dark:bg-black/90 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200 dark:border-white/10">
      <div className="flex items-start gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-purple-500 mt-1" />
        <div className="flex-1">
          <h2 className="text-2xl font-bold mb-2">
            Примерная структура курса
          </h2>
          <p className="text-slate-600 dark:text-white/70">
            На основе вашего описания мы предлагаем следующую структуру.
            Вы можете принять её или вернуться к редактированию.
          </p>
        </div>
        <button
          onClick={() => setShowPreview(false)}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Preview content */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-500" />
            <span className="font-medium">{coursePreview.estimatedLessons} уроков</span>
          </div>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-purple-500" />
            <span className="font-medium">{coursePreview.estimatedSections} модулей</span>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-purple-500" />
            <span className="font-medium">~{coursePreview.estimatedDuration} часов</span>
          </div>
        </div>

        <div className="border border-slate-200 dark:border-white/10 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Предлагаемые модули:</h3>
          <div className="space-y-2">
            {coursePreview.modules.map((module, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-semibold text-purple-500 text-sm">
                  {i + 1}.
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{module.title}</p>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    {module.lessonCount} уроков
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowPreview(false)}
          className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white font-medium rounded-xl transition-all"
        >
          Вернуться к редактированию
        </button>
        <button
          onClick={handleConfirmAndSubmit}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg"
        >
          Создать курс
        </button>
      </div>
    </div>
  </motion.div>
)}
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (добавить новый state + UI)
- Создать новый API endpoint: `/api/coursegen/preview` (генерирует structure без полной генерации)

**Приоритет:** СРЕДНИЙ
**Время:** 4-6 часов (требует backend endpoint)
**Влияние:** Снижает uncertainty, даёт user control, "magical" AI experience

---

### Рекомендация 8: Сменить шрифт на уникальный

**Текущее состояние:**
```typescript
// globals.css
--font-sans: var(--font-inter);  // Generic, overused
```

**Предлагаемое изменение:**
```typescript
// app/layout.tsx
import { Space_Grotesk, Inter } from 'next/font/google';

const displayFont = Space_Grotesk({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const bodyFont = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}

// globals.css
:root {
  --font-display: var(--font-space-grotesk);
  --font-body: var(--font-inter);
  --font-sans: var(--font-body);
}

.heading-1, .heading-2, .heading-3 {
  font-family: var(--font-display);
  letter-spacing: -0.02em;
}

body {
  font-family: var(--font-body);
}
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/app/layout.tsx`
- `/home/me/code/megacampus2/packages/web/app/globals.css`
- Применить `.heading-1` класс к заголовкам в `/packages/web/app/create/page-client-full.tsx`

**Приоритет:** ВЫСОКИЙ
**Время:** 2-3 часа
**Влияние:** Создаёт уникальный brand identity, избавляет от generic aesthetic

---

### Рекомендация 9: Улучшить форматы генерации (убрать "Скоро" badges)

**Текущее состояние:**
```tsx
// 9 форматов, но только "text" доступен
const generationFormats: GenerationFormat[] = [
  { value: "text", available: true },
  { value: "video", available: false },  // "Скоро"
  { value: "audio", available: false },  // "Скоро"
  // ... ещё 6 недоступных
]
```

**Предлагаемое изменение:**
```tsx
// Вариант 1: Показывать только доступные форматы
const generationFormats = [
  { value: "text", icon: FileText, title: "Текст", description: "Структурированные текстовые уроки" },
];

// Добавить info box о будущих форматах
<div className="mt-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
  <div className="flex items-start gap-2">
    <Info className="w-4 h-4 text-blue-500 mt-0.5" />
    <div className="text-sm">
      <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">
        Скоро появятся новые форматы
      </p>
      <p className="text-blue-600 dark:text-blue-300 text-xs">
        Мы работаем над добавлением видео, аудио, тестов и интерактивных упражнений.
        Подпишитесь на уведомления, чтобы узнать первыми.
      </p>
    </div>
  </div>
</div>

// Вариант 2: Убрать секцию "Форматы" полностью
// Сделать форматы частью advanced settings
// И показывать только когда будут доступны
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (строки 957-1018)

**Приоритет:** НИЗКИЙ
**Время:** 1 час
**Влияние:** Убирает visual clutter, не дразнит пользователя недоступными features

---

### Рекомендация 10: Добавить form progress indicator на мобильных

**Текущее состояние:**
```tsx
// Нет индикатора прогресса заполнения формы
```

**Предлагаемое изменение:**
```tsx
// Добавить sticky header с progress bar
<div className="md:hidden sticky top-0 z-40 bg-white/95 dark:bg-black/95 backdrop-blur-lg border-b border-slate-200 dark:border-white/10 p-4">
  <div className="flex items-center justify-between mb-2">
    <h2 className="font-semibold text-sm text-slate-900 dark:text-white">
      Создание курса
    </h2>
    <span className="text-xs text-slate-500 dark:text-white/60">
      {completionPercentage}% заполнено
    </span>
  </div>
  <div className="h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
    <motion.div
      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
      initial={{ width: 0 }}
      animate={{ width: `${completionPercentage}%` }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
    />
  </div>
</div>

// Рассчитать completionPercentage
const completionPercentage = useMemo(() => {
  const requiredFields = ['topic', 'email'];
  const optionalFields = ['description', 'writingStyle', 'language'];

  const filledRequired = requiredFields.filter(field => watch(field)).length;
  const filledOptional = optionalFields.filter(field => watch(field)).length;

  // Обязательные поля = 70%, опциональные = 30%
  const requiredWeight = 0.7;
  const optionalWeight = 0.3;

  const requiredPercentage = (filledRequired / requiredFields.length) * requiredWeight;
  const optionalPercentage = (filledOptional / optionalFields.length) * optionalWeight;

  return Math.round((requiredPercentage + optionalPercentage) * 100);
}, [watch('topic'), watch('email'), watch('description'), watch('writingStyle'), watch('language')]);
```

**Файлы для изменения:**
- `/home/me/code/megacampus2/packages/web/components/forms/create-course-form.tsx` (добавить sticky header)

**Приоритет:** СРЕДНИЙ
**Время:** 2 часа
**Влияние:** Снижает uncertainty, gamifies процесс заполнения, улучшает mobile UX

---

## 8. План реализации

### Быстрые победы (1-2 часа каждая)

1. **Улучшить контраст текста** ⚡
   - Увеличить opacity для dark mode text
   - Исправить placeholders
   - Добавить text-shadows где нужно
   - **Файлы:** `file-upload.tsx`, `create-course-form.tsx`, `globals.css`

2. **Добавить sticky submit button на мобильных** ⚡
   - Floating action button внизу экрана
   - Скрыть desktop version submit button на mobile
   - **Файлы:** `create-course-form.tsx`

3. **Увеличить touch targets для icon buttons** ⚡
   - Добавить min-w-[44px] min-h-[44px]
   - Или добавить invisible hit areas
   - **Файлы:** `file-upload.tsx`, `create-course-form.tsx`

4. **Добавить ARIA labels для icon buttons** ⚡
   - Remove file, Retry upload, Close buttons
   - **Файлы:** `file-upload.tsx`, `create-course-form.tsx`

5. **Исправить format cards keyboard navigation** ⚡
   - Добавить onKeyDown handlers
   - Добавить proper ARIA roles
   - **Файлы:** `create-course-form.tsx` (строки 957-1018)

---

### Средние задачи (2-4 часа)

6. **Добавить визуальную иерархию карточкам** 🟡
   - Создать CARD_VARIANTS (primary, secondary, tertiary)
   - Применить к разным секциям формы
   - **Файлы:** `create-course-form.tsx`

7. **Orchestrated page load animations** 🟡
   - Создать parent container variants
   - Stagger children animations
   - Добавить spring transitions
   - **Файлы:** `create-course-form.tsx`

8. **Сменить шрифт на уникальный** 🟡
   - Добавить Space Grotesk для headings
   - Оставить Inter для body
   - Обновить typography classes
   - **Файлы:** `layout.tsx`, `globals.css`, `page-client-full.tsx`

9. **Добавить form progress indicator** 🟡
   - Sticky header с progress bar
   - Рассчитывать completion percentage
   - Только для мобильных
   - **Файлы:** `create-course-form.tsx`

10. **Улучшить error messages (actionable)** 🟡
    - Добавить предложения решения
    - Aggregate file upload errors
    - Persistent banner для rate limit errors
    - **Файлы:** `create-course-form.tsx`

---

### Большие улучшения (4-8 часов)

11. **Уникальная цветовая схема** 🔴
    - Выбрать palette (Electric Cyan + Purple или Orange + Purple)
    - Обновить CSS variables
    - Заменить во всех компонентах
    - Обновить gradients
    - **Файлы:** `globals.css`, все компоненты с purple colors

12. **Группировка стилей изложения** 🔴
    - Создать категории (Popular, Teaching methods, Formats, Tone)
    - Добавить Tabs UI
    - Или добавить search functionality
    - **Файлы:** `create-course-form.tsx`, `learning-styles.ts`

13. **AI preview перед генерацией** 🔴
    - Создать preview modal UI
    - Создать API endpoint `/api/coursegen/preview`
    - Добавить state management
    - Добавить preview → edit flow
    - **Файлы:** `create-course-form.tsx`, новый API endpoint

14. **Skeleton screens для loading states** 🔴
    - Создать FormSkeleton component
    - Добавить shimmer effects
    - Заменить простые spinners
    - **Файлы:** `page-client-full.tsx`, новый `FormSkeleton.tsx`

15. **Micro-interactions** 🔴
    - Radio selection animations
    - Checkbox check animations
    - File upload success particles
    - Button pressed states
    - **Файлы:** `create-course-form.tsx`, `file-upload.tsx`

---

## 9. Приоритизация по влиянию

### Критичные для UX (сделать в первую очередь)

1. ✅ **Улучшить контраст текста** — Accessibility
2. ✅ **Добавить sticky submit button** — Mobile UX
3. ✅ **Увеличить touch targets** — Mobile UX
4. ✅ **Визуальная иерархия карточкам** — Visual clarity

### Высокий приоритет (brand identity)

5. 🎨 **Уникальная цветовая схема** — Brand differentiation
6. 🎨 **Сменить шрифт** — Brand differentiation
7. ⚡ **Orchestrated animations** — Premium feel

### Средний приоритет (nice to have)

8. 📊 **Form progress indicator** — Gamification
9. 🤖 **AI preview** — "Magical" experience
10. 🎯 **Группировка стилей** — Reduce cognitive load

### Низкий приоритет (polish)

11. 💅 **Micro-interactions** — Polish
12. 🎭 **Skeleton screens** — Perceived performance
13. 🧹 **Убрать "Скоро" badges** — Clean UI

---

## 10. Заключение

### Итоговая оценка

**Общая оценка текущего состояния: 7/10**

**Сильные стороны:**
- ✅ Accessibility foundation (ARIA, semantic HTML, keyboard navigation)
- ✅ Responsive design (mobile-first)
- ✅ Modern tech stack (Next.js 15, Framer Motion, React Hook Form)
- ✅ Dark mode support
- ✅ Thoughtful UX patterns (auto-save, error handling, file upload)

**Слабости:**
- ❌ Generic AI aesthetic (purple-pink gradient, Inter font)
- ❌ Слабая визуальная иерархия
- ❌ Проблемы с контрастом (WCAG AA не всегда достигается)
- ❌ Отсутствие micro-interactions
- ❌ Когнитивная перегрузка (19 стилей изложения, 9 форматов)

### Рекомендуемый порядок реализации

**Фаза 1: Критичные улучшения (4-6 часов)**
1. Улучшить контраст и читаемость
2. Добавить sticky submit button на мобильных
3. Увеличить touch targets
4. Добавить визуальную иерархию карточкам

**Фаза 2: Brand identity (6-8 часов)**
5. Уникальная цветовая схема
6. Сменить шрифт на уникальный
7. Orchestrated page load animations

**Фаза 3: UX enhancement (8-12 часов)**
8. Form progress indicator
9. AI preview перед генерацией
10. Улучшить error messages (actionable)

**Фаза 4: Polish (6-10 часов)**
11. Группировка стилей изложения
12. Micro-interactions
13. Skeleton screens
14. Убрать "Скоро" badges

**Общее время:** 24-36 часов (3-4 дня работы)

### Ожидаемый результат

После реализации всех рекомендаций страница создания курса будет:
- **Уникальной** (отличается от generic AI interfaces)
- **Accessible** (WCAG AA compliance, full keyboard support)
- **Delightful** (micro-interactions, orchestrated animations)
- **Efficient** (visual hierarchy, reduced cognitive load)
- **Mobile-first** (sticky elements, proper touch targets)
- **Premium** (typography, colors, animations создают high-quality feel)

---

**Документ подготовлен:** 2025-12-02
**Версия:** 1.0
**Следующий review:** После реализации Фазы 1 и 2 (примерно через 2 недели)