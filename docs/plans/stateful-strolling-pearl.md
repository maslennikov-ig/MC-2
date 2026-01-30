# План: Миграция URL курсов на `/courses/{org}/{course}`

## Цель

Перейти с `/courses/{slug}` на `/courses/{org-slug}/{course-slug}` для:

- SEO: организация видна в URL
- Масштабируемость: нет конфликтов slug между организациями
- Брендинг: white-label готовность

## Статус базы данных

✅ **Готово — миграции НЕ нужны:**

- `organizations.slug` — существует, `UNIQUE NOT NULL`
- `courses.slug` — constraint `UNIQUE(organization_id, slug)` уже есть
- FK: `courses.organization_id → organizations.id`

---

## Фазы реализации

### Фаза 1: Утилиты (новые файлы)

**1.1 Хелпер для организаций**

```
packages/web/lib/helpers/organization.ts
```

- `getOrganizationBySlug(slug)` — получить org по slug
- `getCourseByOrgAndSlug(orgSlug, courseSlug)` — получить курс с валидацией org

**1.2 URL билдер**

```
packages/web/lib/helpers/course-urls.ts
```

- `buildCourseUrl(orgSlug, courseSlug)` → `/courses/{org}/{course}`
- `buildCourseGeneratingUrl(...)` → `/courses/{org}/{course}/generating`
- `buildCourseLessonsUrl(...)` → `/courses/{org}/{course}/lessons`

---

### Фаза 2: Новая структура роутов

**Текущая:**

```
app/[locale]/courses/
├── [slug]/page.tsx
├── [slug]/lessons/page.tsx
├── [slug]/visuals/page.tsx
└── generating/[slug]/page.tsx
```

**Новая:**

```
app/[locale]/courses/
├── [orgSlug]/
│   └── [courseSlug]/
│       ├── page.tsx              # Просмотр курса
│       ├── lessons/page.tsx      # Уроки
│       ├── visuals/page.tsx      # Визуалы
│       └── generating/page.tsx   # Прогресс генерации
└── page.tsx                      # Каталог (без изменений)
```

**Файлы для создания/перемещения:**
| Старый путь | Новый путь |
|-------------|------------|
| `[slug]/page.tsx` | `[orgSlug]/[courseSlug]/page.tsx` |
| `[slug]/lessons/page.tsx` | `[orgSlug]/[courseSlug]/lessons/page.tsx` |
| `[slug]/visuals/page.tsx` | `[orgSlug]/[courseSlug]/visuals/page.tsx` |
| `generating/[slug]/page.tsx` | `[orgSlug]/[courseSlug]/generating/page.tsx` |

---

### Фаза 3: API роуты

**Текущая:**

```
app/api/courses/[slug]/
├── route.ts
├── cancel/route.ts
├── progress/route.ts
├── pause/route.ts
├── resume/route.ts
├── restart-stage/route.ts
├── delete/route.ts
├── share/route.ts
└── traces/route.ts
```

**Новая:**

```
app/api/courses/[orgSlug]/[courseSlug]/
├── route.ts
├── cancel/route.ts
└── ... (все те же файлы)
```

**OG Image:**

```
app/api/og/course/[slug]/route.tsx
→ app/api/og/course/[orgSlug]/[courseSlug]/route.tsx
```

---

### Фаза 4: Обновление компонентов

**4.1 Расширить запрос курсов (включить org slug)**

Файл: `packages/web/app/[locale]/courses/actions.ts`

```typescript
// getCourses() — добавить join с organizations
.select(`
  id, title, slug, ...
  organizations!inner (slug)
`)
```

**4.2 Обновить ссылки**

| Файл                     | Изменение                                                       |
| ------------------------ | --------------------------------------------------------------- |
| `course-card.tsx:284`    | `/courses/${slug}` → `buildCourseUrl(orgSlug, slug)`            |
| `course-card.tsx:289`    | `/courses/generating/${slug}` → `buildCourseGeneratingUrl(...)` |
| `useSubmitCourse.ts:170` | router.push с новым URL                                         |
| `lessons-content.tsx`    | Обновить ссылки                                                 |
| `history-table.tsx`      | Обновить ссылки (admin)                                         |

**4.3 Server Actions**

Файл: `packages/web/app/actions/courses.ts`

- `createDraftCourse` — вернуть `{ id, slug, orgSlug }`
- `revalidatePath` — использовать новый путь

---

## Критические файлы

| Файл                                                   | Тип изменения               |
| ------------------------------------------------------ | --------------------------- |
| `lib/helpers/organization.ts`                          | Создать                     |
| `lib/helpers/course-urls.ts`                           | Создать                     |
| `app/[locale]/courses/[orgSlug]/[courseSlug]/page.tsx` | Создать (из [slug])         |
| `app/api/courses/[orgSlug]/[courseSlug]/route.ts`      | Создать (из [slug])         |
| `app/[locale]/courses/_components/course-card.tsx`     | Изменить ссылки             |
| `app/[locale]/courses/actions.ts`                      | Добавить org slug в запросы |
| `app/actions/courses.ts`                               | Вернуть orgSlug             |

---

## Порядок деплоя

1. **Deploy 1**: Утилиты (Фаза 1) — без breaking changes
2. **Deploy 2**: Новые роуты + обновить ссылки (Фазы 2-4) — одним коммитом
3. **Cleanup**: Удалить старые `[slug]` роуты после проверки

---

## Верификация

1. **Type-check**: `pnpm type-check`
2. **Build**: `pnpm build`
3. **Manual test**:
   - Открыть каталог курсов `/courses`
   - Кликнуть на курс — URL должен быть `/courses/{org}/{course}`
   - Проверить уроки, генерацию, визуалы
   - Проверить API endpoints в DevTools
4. **SEO check**:
   - OG image: `/api/og/course/{org}/{course}`
   - Legacy redirect: `/courses/{old-slug}` → 301 на новый URL
