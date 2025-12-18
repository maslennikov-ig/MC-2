# Техническое задание: Устранение загрязнения БД черновиками курсов

**Дата:** 2025-11-08
**Версия:** 1.0
**Приоритет:** HIGH
**Сложность:** MEDIUM
**Estimated:** 12-16 часов

---

## 1. Executive Summary

### Проблема

При каждом открытии страницы `/create` автоматически создаётся запись в таблице `courses` с `status: 'draft'`. Это приводит к загрязнению базы данных неиспользованными черновиками.

**Текущая статистика:**
- Всего черновиков в БД: 46
- Неиспользованные (мусор): 26 (57%)
- Новых черновиков/день: ~20-30
- Прогноз через месяц: ~600-900 мусорных записей

### Решение

**Гибридный подход с использованием существующей Redis инфраструктуры:**

1. **Redis Session Storage** - хранение данных формы в Redis вместо немедленного создания в БД
2. **Lazy DB Creation** - создание записи в PostgreSQL только при реальной необходимости
3. **TTL Cleanup** - автоматическое удаление старых черновиков через Supabase Edge Function

**Ожидаемый результат:**
- Снижение загрязнения БД на **95%+**
- Полная автоматическая очистка старых черновиков
- Сохранение UX (пользователь не заметит изменений)
- Использование существующей инфраструктуры (Redis уже есть)

---

## 2. Архитектурное решение

### 2.1. Выбор архитектуры

**Выбранный вариант:** Гибридный (Redis Session + Lazy Creation + TTL Cleanup)

**Обоснование:**
- ✅ Redis уже используется в проекте (`docker-compose.yml`, `src/shared/cache/redis.ts`)
- ✅ Нет дополнительных инфраструктурных затрат
- ✅ 95%+ снижение загрязнения БД
- ✅ Автоматическая очистка существующего мусора
- ✅ Production-ready решение
- ✅ Простой rollback

### 2.2. Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                    User Opens /create                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Session Created in Redis (TTL: 24 hours)             │
│  Key: draft:session:{userId}:{timestamp}                     │
│  Value: { topic, description, language, ... }                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              User Interacts with Form                        │
│     (onChange → auto-save to Redis every 3 seconds)          │
└────────────────────────┬────────────────────────────────────┘
                         │
                  ┌──────┴──────┐
                  │             │
                  ▼             ▼
      ┌───────────────┐  ┌──────────────┐
      │ File Upload   │  │ Form Submit  │
      └───────┬───────┘  └──────┬───────┘
              │                 │
              ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│         Create Course in PostgreSQL (ONLY NOW!)              │
│  - Read data from Redis                                      │
│  - Create course record                                      │
│  - Delete Redis session                                      │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│   TTL Cleanup Job (Supabase Edge Function, runs hourly)     │
│  - Delete courses WHERE status='draft' AND                   │
│    generation_status IS NULL AND created_at < NOW() - 24h   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Детальная спецификация

### 3.1. Redis Session Storage

#### 3.1.1. Структура данных

**Key Pattern:**
```
draft:session:{userId}:{sessionId}
```

**Value (JSON):**
```typescript
interface DraftSession {
  userId: string
  organizationId: string
  sessionId: string
  createdAt: string
  updatedAt: string
  formData: {
    topic?: string
    description?: string
    email?: string
    writingStyle?: string
    language?: string
    targetAudience?: string
    estimatedLessons?: number
    estimatedSections?: number
    contentStrategy?: string
    lessonDuration?: number
    learningOutcomes?: string
    formats?: string[]
  }
}
```

**TTL:** 24 часа (автоматическое удаление Redis'ом)

#### 3.1.2. Новый модуль: `courseai-next/lib/draft-session.ts`

```typescript
import { RedisCache } from '@/packages/course-gen-platform/src/shared/cache/redis'
import { createClient } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'

const DRAFT_TTL = 24 * 60 * 60 // 24 hours in seconds

export interface DraftSessionData {
  userId: string
  organizationId: string
  sessionId: string
  createdAt: string
  updatedAt: string
  formData: Record<string, any>
}

export class DraftSessionManager {
  private cache: RedisCache

  constructor() {
    this.cache = new RedisCache()
  }

  /**
   * Create new draft session
   */
  async createSession(userId: string, organizationId: string): Promise<string> {
    const sessionId = uuidv4()
    const key = `draft:session:${userId}:${sessionId}`

    const session: DraftSessionData = {
      userId,
      organizationId,
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      formData: {}
    }

    await this.cache.set(key, session, { ttl: DRAFT_TTL })
    return sessionId
  }

  /**
   * Update session with form data
   */
  async updateSession(
    userId: string,
    sessionId: string,
    formData: Record<string, any>
  ): Promise<void> {
    const key = `draft:session:${userId}:${sessionId}`
    const existing = await this.cache.get<DraftSessionData>(key)

    if (!existing) {
      throw new Error('Session not found or expired')
    }

    const updated: DraftSessionData = {
      ...existing,
      updatedAt: new Date().toISOString(),
      formData: {
        ...existing.formData,
        ...formData
      }
    }

    await this.cache.set(key, updated, { ttl: DRAFT_TTL })
  }

  /**
   * Get session data
   */
  async getSession(userId: string, sessionId: string): Promise<DraftSessionData | null> {
    const key = `draft:session:${userId}:${sessionId}`
    return await this.cache.get<DraftSessionData>(key)
  }

  /**
   * Delete session (after course created)
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const key = `draft:session:${userId}:${sessionId}`
    await this.cache.delete(key)
  }

  /**
   * Create course in DB from session
   */
  async materializeSession(
    userId: string,
    sessionId: string
  ): Promise<{ id: string; slug: string } | { error: string }> {
    const session = await this.getSession(userId, sessionId)

    if (!session) {
      return { error: 'Session not found or expired' }
    }

    // Call existing createDraftCourse action
    const { createDraftCourse } = await import('@/app/actions/courses')
    const result = await createDraftCourse(session.formData.topic || 'Новый курс')

    if ('error' in result) {
      return result
    }

    // Delete session after successful creation
    await this.deleteSession(userId, sessionId)

    return result
  }
}

// Singleton instance
export const draftSessionManager = new DraftSessionManager()
```

### 3.2. Модификация формы

#### 3.2.1. Изменения в `create-course-form.tsx`

**Удалить:**
```typescript
// Строки 247-252 - УДАЛИТЬ
useEffect(() => {
  if (!draftCourseId && mounted && canCreate === true) {
    createDraft()
  }
}, [draftCourseId, mounted, canCreate, createDraft])
```

**Добавить:**
```typescript
// New state
const [sessionId, setSessionId] = useState<string | null>(null)
const [isAutoSaving, setIsAutoSaving] = useState(false)
const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()

// Create session on mount
useEffect(() => {
  const initSession = async () => {
    if (!mounted || !canCreate || sessionId) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get organizationId (same logic as in createDraftCourse)
    const { data: orgData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!orgData?.organization_id) return

    const newSessionId = await draftSessionManager.createSession(
      user.id,
      orgData.organization_id
    )
    setSessionId(newSessionId)
  }

  initSession()
}, [mounted, canCreate, sessionId])

// Auto-save to Redis
const autoSaveToRedis = useCallback(async (formData: Partial<FormData>) => {
  if (!sessionId) return

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  setIsAutoSaving(true)
  try {
    await draftSessionManager.updateSession(user.id, sessionId, formData)
  } catch (error) {
    logger.error('Auto-save failed', { error })
  } finally {
    setIsAutoSaving(false)
  }
}, [sessionId])

// Debounced auto-save on form change
const handleFormChange = useCallback(() => {
  if (autoSaveTimeoutRef.current) {
    clearTimeout(autoSaveTimeoutRef.current)
  }

  autoSaveTimeoutRef.current = setTimeout(() => {
    const currentValues = getValues()
    autoSaveToRedis(currentValues)
  }, 3000) // 3 seconds debounce
}, [autoSaveToRedis, getValues])

// Cleanup timeout on unmount
useEffect(() => {
  return () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
  }
}, [])
```

#### 3.2.2. Модификация `onSubmit`

```typescript
const onSubmit = async (data: FormData) => {
  // ... existing validation ...

  setIsSubmitting(true)

  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    toast.error("Необходима авторизация")
    router.push('/login')
    return
  }

  try {
    let finalCourseId: string
    let finalCourseSlug: string

    // NEW: Materialize session to DB if it exists
    if (sessionId && !draftCourseId) {
      const result = await draftSessionManager.materializeSession(user.id, sessionId)

      if ('error' in result) {
        toast.error("Ошибка создания курса", { description: result.error })
        setIsSubmitting(false)
        return
      }

      finalCourseId = result.id
      finalCourseSlug = result.slug
      setDraftCourseId(result.id)
      setDraftCourseSlug(result.slug)
    } else if (!draftCourseId) {
      // Fallback: create directly if no session exists
      const draftResult = await createDraftCourse(data.topic)
      if ('error' in draftResult) {
        toast.error("Ошибка создания черновика курса", {
          description: draftResult.error
        })
        setIsSubmitting(false)
        return
      }
      finalCourseId = draftResult.id
      finalCourseSlug = draftResult.slug
    } else {
      finalCourseId = draftCourseId
      finalCourseSlug = draftCourseSlug!
    }

    // ... rest of existing logic ...
  } catch (error) {
    logger.error('Error submitting course', { error })
    toast.error("Произошла ошибка при создании курса")
  } finally {
    setIsSubmitting(false)
  }
}
```

#### 3.2.3. Модификация `FileUploadDirect`

```typescript
// In FileUploadDirect component
const handleFileUpload = async (file: File) => {
  // Materialize session to DB before uploading files
  if (sessionId && !courseId) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const result = await draftSessionManager.materializeSession(user.id, sessionId)
    if ('error' in result) {
      toast.error('Ошибка создания курса для загрузки файлов')
      return
    }

    onCourseCreated(result.id, result.slug)
  }

  // ... proceed with file upload ...
}
```

### 3.3. TTL Cleanup System

#### 3.3.1. Supabase Edge Function

**Создать:** `supabase/functions/cleanup-old-drafts/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupResult {
  deleted: number
  cutoffTime: string
  errors?: string[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    console.log(`[Cleanup] Starting cleanup of drafts older than ${cutoffTime}`)

    // Delete old unused drafts
    const { data: deletedCourses, error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('status', 'draft')
      .is('generation_status', null)
      .lt('created_at', cutoffTime)
      .select('id, title, created_at')

    if (deleteError) {
      console.error('[Cleanup] Error deleting courses:', deleteError)
      throw deleteError
    }

    const deletedCount = deletedCourses?.length || 0
    console.log(`[Cleanup] Deleted ${deletedCount} old draft courses`)

    const result: CleanupResult = {
      deleted: deletedCount,
      cutoffTime: cutoffTime
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[Cleanup] Fatal error:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        deleted: 0,
        cutoffTime: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
```

#### 3.3.2. Настройка cron в Supabase

**В Supabase Dashboard:**
1. Edge Functions → `cleanup-old-drafts` → Settings
2. Cron Schedule: `0 * * * *` (каждый час)
3. Enable: ✅

**Или через SQL (если доступен pg_cron):**

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup job
SELECT cron.schedule(
  'cleanup-old-draft-courses',
  '0 * * * *', -- Every hour at minute 0
  $$
  DELETE FROM courses
  WHERE status = 'draft'
    AND generation_status IS NULL
    AND created_at < NOW() - INTERVAL '24 hours'
  $$
);

-- Verify scheduled jobs
SELECT * FROM cron.job;
```

#### 3.3.3. Мониторинг и алерты

**Добавить в `supabase/functions/cleanup-old-drafts/index.ts`:**

```typescript
// After cleanup
const result: CleanupResult = {
  deleted: deletedCount,
  cutoffTime: cutoffTime
}

// Log metrics for monitoring
console.log(JSON.stringify({
  event: 'cleanup_completed',
  timestamp: new Date().toISOString(),
  deleted_count: deletedCount,
  cutoff_time: cutoffTime,
  status: 'success'
}))

// Optional: Send to monitoring service (e.g., Sentry, LogRocket)
if (deletedCount > 100) {
  console.warn(`[Cleanup] High number of drafts deleted: ${deletedCount}`)
  // TODO: Send alert
}
```

### 3.4. Миграции базы данных

#### 3.4.1. Добавить индекс для оптимизации cleanup

```sql
-- Migration: 2025-11-08_add_draft_cleanup_index.sql
-- Add composite index for efficient cleanup queries

CREATE INDEX IF NOT EXISTS idx_courses_draft_cleanup
ON courses (status, generation_status, created_at)
WHERE status = 'draft' AND generation_status IS NULL;

-- Add comment
COMMENT ON INDEX idx_courses_draft_cleanup IS
'Composite index for efficient cleanup of old unused draft courses';
```

#### 3.4.2. Добавить expires_at (опционально, для будущего)

```sql
-- Migration: 2025-11-08_add_expires_at.sql
-- Add expires_at column for explicit TTL management

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set expires_at for existing drafts
UPDATE courses
SET expires_at = created_at + INTERVAL '24 hours'
WHERE status = 'draft' AND expires_at IS NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_courses_expires_at
ON courses (expires_at)
WHERE status = 'draft';

-- Add comment
COMMENT ON COLUMN courses.expires_at IS
'Expiration timestamp for draft courses (24 hours after creation)';
```

---

## 4. План реализации

### Фаза 1: Redis Session Storage (6-8 часов)

**День 1:**
- [ ] **Task 1.1:** Создать модуль `lib/draft-session.ts` (2 часа)
- [ ] **Task 1.2:** Добавить unit tests для DraftSessionManager (1 час)
- [ ] **Task 1.3:** Модифицировать `create-course-form.tsx` (2 часа)
  - Удалить auto-creation useEffect
  - Добавить session management
  - Добавить auto-save logic
- [ ] **Task 1.4:** Модифицировать `FileUploadDirect` (1 час)
- [ ] **Task 1.5:** Локальное тестирование (2 часа)

### Фаза 2: TTL Cleanup System (4-6 часов)

**День 2:**
- [ ] **Task 2.1:** Создать Edge Function `cleanup-old-drafts` (2 часа)
- [ ] **Task 2.2:** Добавить SQL миграции (индексы) (1 час)
- [ ] **Task 2.3:** Настроить cron в Supabase Dashboard (30 минут)
- [ ] **Task 2.4:** Добавить мониторинг и логирование (1 час)
- [ ] **Task 2.5:** Тестирование cleanup (1 час)
- [ ] **Task 2.6:** Документация (30 минут)

### Фаза 3: Testing & Deployment (2-3 часа)

**День 3:**
- [ ] **Task 3.1:** Integration tests (1 час)
- [ ] **Task 3.2:** E2E tests (1 час)
- [ ] **Task 3.3:** Manual testing в 3 браузерах (30 минут)
- [ ] **Task 3.4:** Staging deployment (30 минут)

### Фаза 4: Production Deployment (1-2 часа)

**День 4:**
- [ ] **Task 4.1:** Canary deployment (10% users) (30 минут)
- [ ] **Task 4.2:** Мониторинг метрик (1 час)
- [ ] **Task 4.3:** Full rollout (100%) (30 минут)

**Total Estimated:** 12-16 часов разработки + 3-5 часов тестирования

---

## 5. Testing Strategy

### 5.1. Unit Tests

**Файл:** `courseai-next/lib/__tests__/draft-session.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DraftSessionManager } from '../draft-session'

describe('DraftSessionManager', () => {
  let manager: DraftSessionManager
  const testUserId = 'test-user-123'
  const testOrgId = 'test-org-456'

  beforeEach(() => {
    manager = new DraftSessionManager()
  })

  it('should create a new session', async () => {
    const sessionId = await manager.createSession(testUserId, testOrgId)
    expect(sessionId).toBeTruthy()
    expect(typeof sessionId).toBe('string')
  })

  it('should update session with form data', async () => {
    const sessionId = await manager.createSession(testUserId, testOrgId)

    await manager.updateSession(testUserId, sessionId, {
      topic: 'Test Course',
      language: 'ru'
    })

    const session = await manager.getSession(testUserId, sessionId)
    expect(session).toBeTruthy()
    expect(session?.formData.topic).toBe('Test Course')
    expect(session?.formData.language).toBe('ru')
  })

  it('should delete session', async () => {
    const sessionId = await manager.createSession(testUserId, testOrgId)
    await manager.deleteSession(testUserId, sessionId)

    const session = await manager.getSession(testUserId, sessionId)
    expect(session).toBeNull()
  })

  it('should throw error when updating non-existent session', async () => {
    await expect(
      manager.updateSession(testUserId, 'non-existent', {})
    ).rejects.toThrow('Session not found or expired')
  })
})
```

### 5.2. Integration Tests

**Файл:** `courseai-next/__tests__/integration/draft-course-flow.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateCourseForm from '@/components/forms/create-course-form'

describe('Draft Course Flow Integration', () => {
  it('should not create DB record on mount', async () => {
    render(<CreateCourseForm />)

    // Wait for component to mount
    await waitFor(() => {
      expect(screen.getByLabelText('Тема курса')).toBeInTheDocument()
    })

    // Check that no DB record was created
    // (mock Supabase and verify insert was NOT called)
    expect(mockSupabase.from).not.toHaveBeenCalledWith('courses')
  })

  it('should save to Redis on form change', async () => {
    render(<CreateCourseForm />)

    const topicInput = screen.getByLabelText('Тема курса')
    fireEvent.change(topicInput, { target: { value: 'Test Course' } })

    // Wait for auto-save debounce (3 seconds)
    await waitFor(() => {
      expect(mockRedis.set).toHaveBeenCalled()
    }, { timeout: 4000 })
  })

  it('should create DB record only on submit', async () => {
    render(<CreateCourseForm />)

    // Fill form
    fireEvent.change(screen.getByLabelText('Тема курса'), {
      target: { value: 'Test Course' }
    })

    // Submit
    fireEvent.click(screen.getByText('Создать курс'))

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith('courses')
      expect(mockSupabase.insert).toHaveBeenCalled()
    })
  })
})
```

### 5.3. E2E Tests

**Файл:** `courseai-next/e2e/draft-course.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Draft Course Prevention', () => {
  test('should not create DB record when just visiting page', async ({ page }) => {
    // Navigate to create page
    await page.goto('/create')

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Создать новый курс')

    // Check DB (via API route)
    const response = await page.request.get('/api/test/count-drafts')
    const { count: initialCount } = await response.json()

    // Wait a bit
    await page.waitForTimeout(2000)

    // Check DB again - should be same
    const response2 = await page.request.get('/api/test/count-drafts')
    const { count: finalCount } = await response2.json()

    expect(finalCount).toBe(initialCount)
  })

  test('should create DB record on submit', async ({ page }) => {
    await page.goto('/create')

    const initialCount = await getDbCount(page)

    // Fill minimal form
    await page.fill('[name="topic"]', 'E2E Test Course')
    await page.fill('[name="email"]', 'test@example.com')

    // Submit
    await page.click('button:has-text("Создать курс")')

    // Wait for navigation or success message
    await expect(page.locator('text=Курс создан')).toBeVisible()

    // Verify DB record created
    const finalCount = await getDbCount(page)
    expect(finalCount).toBe(initialCount + 1)
  })

  test('should materialize session on file upload', async ({ page }) => {
    await page.goto('/create')

    // Upload file without submitting form
    await page.setInputFiles('input[type="file"]', 'test-file.pdf')

    // Wait for upload
    await expect(page.locator('text=Файл загружен')).toBeVisible()

    // Verify DB record created (for file association)
    const count = await getDbCount(page)
    expect(count).toBeGreaterThan(0)
  })
})

async function getDbCount(page): Promise<number> {
  const response = await page.request.get('/api/test/count-drafts')
  const { count } = await response.json()
  return count
}
```

---

## 6. Monitoring & Metrics

### 6.1. Ключевые метрики

**Отслеживать в Supabase Dashboard или Grafana:**

1. **DB Pollution Metrics:**
   - Всего черновиков в БД
   - % неиспользованных черновиков
   - Новых черновиков за день/неделю/месяц

2. **Redis Metrics:**
   - Количество активных сессий
   - Средний размер сессии
   - Hit/miss rate для сессий

3. **Cleanup Metrics:**
   - Удалённых черновиков за запуск
   - Среднее время выполнения cleanup
   - Ошибки cleanup job

4. **Performance Metrics:**
   - Время создания сессии
   - Время auto-save
   - Время материализации сессии в БД

### 6.2. SQL для мониторинга

```sql
-- Dashboard query: Current state of drafts
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') as total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) as unused_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NOT NULL) as used_drafts,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0),
    2
  ) as unused_percentage
FROM courses;

-- Dashboard query: Drafts by age
SELECT
  date_trunc('day', created_at) as day,
  COUNT(*) as drafts_created,
  COUNT(*) FILTER (WHERE generation_status IS NULL) as unused
FROM courses
WHERE status = 'draft'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY day
ORDER BY day DESC;

-- Dashboard query: Old drafts pending cleanup
SELECT
  COUNT(*) as pending_cleanup
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';
```

### 6.3. Алерты

**Настроить в Supabase или monitoring tool:**

1. **Alert:** Если `pending_cleanup > 50`
   - Severity: WARNING
   - Action: Проверить работу cleanup job

2. **Alert:** Если `unused_percentage > 30%`
   - Severity: WARNING
   - Action: Возможно, нужно уменьшить TTL

3. **Alert:** Если cleanup job падает 3 раза подряд
   - Severity: CRITICAL
   - Action: Немедленно проверить Edge Function

---

## 7. Rollback Strategy

### 7.1. Быстрый rollback (если что-то сломалось)

**Шаг 1: Вернуть старый код (1 минута)**
```bash
git revert <commit-hash>
git push origin feature/frontend-improvements
```

**Шаг 2: Отключить cleanup job (1 минута)**
```sql
SELECT cron.unschedule('cleanup-old-draft-courses');
```

**Шаг 3: Деплой (5 минут)**
```bash
# Суета deployment pipeline
```

### 7.2. Критерии для rollback

**Rollback НЕМЕДЛЕННО если:**
- Error rate > 5%
- User complaints > 10 уникальных пользователей
- Redis недоступен и fallback не работает
- Data loss (сессии пропадают)

### 7.3. Постепенный rollout

**Canary deployment:**
```typescript
// В create-course-form.tsx
const USE_REDIS_SESSIONS = process.env.NEXT_PUBLIC_FEATURE_REDIS_SESSIONS === 'true'

// Включить для 10% пользователей
const shouldUseRedis = USE_REDIS_SESSIONS && Math.random() < 0.1

if (shouldUseRedis) {
  // New Redis logic
} else {
  // Old DB logic (fallback)
}
```

---

## 8. Security Considerations

### 8.1. Redis Security

**Проверить:**
- ✅ Redis доступен только из internal network (127.0.0.1)
- ✅ Нет публичного доступа к Redis
- ✅ Redis password (если production)

**В `docker-compose.yml`:**
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "127.0.0.1:6379:6379"  # ✅ Only localhost
  command: redis-server --requirepass ${REDIS_PASSWORD}  # Add password
```

### 8.2. Data Privacy

**Убедиться:**
- ✅ Сессии в Redis содержат только form data (не sensitive info)
- ✅ TTL 24 часа - разумный срок
- ✅ User ID используется в ключе (изоляция между пользователями)

### 8.3. RLS Policies

**Существующие policies остаются без изменений:**
- Создание курса только для authenticated users
- Доступ к курсу только для owner или organization members

---

## 9. Documentation Updates

### 9.1. Обновить README

**Добавить секцию в `courseai-next/README.md`:**

```markdown
## Draft Course Session Management

### Overview

Draft courses are now stored in Redis sessions instead of being immediately created in PostgreSQL. This reduces database pollution and improves performance.

### How it works

1. **Page visit:** Redis session created (TTL: 24h)
2. **Form interaction:** Auto-save to Redis every 3 seconds
3. **Submit/File upload:** Materialize session to PostgreSQL
4. **Cleanup:** Old drafts deleted hourly by Edge Function

### Environment Variables

```env
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_FEATURE_REDIS_SESSIONS=true
```

### Monitoring

Check draft pollution metrics:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') as total,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) as unused
FROM courses;
```
```

### 9.2. Добавить ADR (Architecture Decision Record)

**Создать:** `docs/architecture/ADR-001-redis-draft-sessions.md`

```markdown
# ADR 001: Redis Session Storage for Draft Courses

**Date:** 2025-11-08
**Status:** Accepted

## Context

Previous implementation created PostgreSQL records immediately on page load, causing significant database pollution (57% of drafts unused).

## Decision

Use Redis for draft session storage with lazy PostgreSQL materialization.

## Consequences

**Positive:**
- 95%+ reduction in DB pollution
- Better performance (Redis faster than PostgreSQL for temporary data)
- Automatic cleanup via TTL
- Existing Redis infrastructure reused

**Negative:**
- Additional complexity in session management
- Dependency on Redis availability (mitigated by fallback)
- Requires Edge Function for cleanup

## Alternatives Considered

1. **localStorage only:** No cross-device sync
2. **Submit-only creation:** Poor UX (data loss on accidental close)
3. **Optimistic UI:** Complex file upload handling

## Implementation

- Session TTL: 24 hours
- Auto-save debounce: 3 seconds
- Cleanup frequency: Hourly
```

---

## 10. Success Criteria

### 10.1. Функциональные требования

- ✅ Страница `/create` открывается без создания записи в БД
- ✅ Форма автоматически сохраняется в Redis каждые 3 секунды
- ✅ При submit создаётся запись в PostgreSQL
- ✅ При загрузке файла создаётся запись в PostgreSQL
- ✅ Старые черновики удаляются автоматически (каждый час)
- ✅ F5 не создаёт новую запись в БД
- ✅ Множественные вкладки не создают множественные записи

### 10.2. Производительность

- ✅ Создание сессии < 50ms
- ✅ Auto-save < 100ms
- ✅ Материализация сессии < 500ms
- ✅ Cleanup job < 5 секунд

### 10.3. Метрики успеха

**Через 1 неделю после деплоя:**
- ✅ Неиспользованные черновики < 10% (было 57%)
- ✅ Новых черновиков/день < 10 (было ~30)
- ✅ Error rate < 0.1%
- ✅ Zero user complaints

**Через 1 месяц:**
- ✅ Всего черновиков в БД < 20 (было 46)
- ✅ Неиспользованные черновики < 5%
- ✅ Стабильная работа cleanup job (uptime > 99%)

---

## 11. Dependencies & Prerequisites

### 11.1. Внешние зависимости

**Уже установлено:**
- ✅ Redis 7 (docker-compose.yml)
- ✅ ioredis client (package.json)
- ✅ RedisCache utility (src/shared/cache/redis.ts)

**Нужно добавить:**
- [ ] uuid (для генерации sessionId)
  ```bash
  pnpm add uuid
  pnpm add -D @types/uuid
  ```

### 11.2. Infrastructure

**Проверить:**
- ✅ Redis запущен и доступен
- ✅ Supabase Edge Functions включены
- ✅ pg_cron extension включен (если используется)

### 11.3. Permissions

**Нужны права:**
- ✅ Deploy Edge Functions в Supabase
- ✅ Создание cron jobs в Supabase
- ✅ Создание SQL migrations

---

## 12. Open Questions & Future Improvements

### 12.1. Open Questions

1. **Q:** Нужно ли сохранять историю изменений формы?
   **A:** Нет, только последнее состояние

2. **Q:** Что если Redis упадёт?
   **A:** Fallback на старое поведение (создание в БД)

3. **Q:** Нужно ли синхронизировать между вкладками?
   **A:** Нет, каждая вкладка = отдельная сессия

### 12.2. Future Improvements

**v2.0 (опционально, после стабилизации v1.0):**

1. **Cross-device sync:**
   - Хранить sessionId в БД user preferences
   - Восстанавливать сессию на другом устройстве

2. **Version history:**
   - Сохранять snapshots изменений
   - Позволить откатить к предыдущей версии

3. **Collaborative editing:**
   - Real-time sync через WebSockets
   - Показывать, что кто-то ещё редактирует

4. **Advanced analytics:**
   - Heatmaps изменений формы
   - A/B тестирование auto-save frequency

---

## 13. Appendix

### 13.1. Полный список изменяемых файлов

**Новые файлы:**
1. `courseai-next/lib/draft-session.ts`
2. `courseai-next/lib/__tests__/draft-session.test.ts`
3. `courseai-next/__tests__/integration/draft-course-flow.test.ts`
4. `courseai-next/e2e/draft-course.spec.ts`
5. `supabase/functions/cleanup-old-drafts/index.ts`
6. `supabase/migrations/2025-11-08_add_draft_cleanup_index.sql`
7. `docs/architecture/ADR-001-redis-draft-sessions.md`

**Изменяемые файлы:**
1. `courseai-next/components/forms/create-course-form.tsx`
2. `courseai-next/components/forms/file-upload-direct.tsx`
3. `courseai-next/package.json` (добавить uuid)
4. `courseai-next/README.md`
5. `.env.example` (добавить NEXT_PUBLIC_FEATURE_REDIS_SESSIONS)

**Конфигурация:**
1. Supabase Dashboard → Edge Functions → cleanup-old-drafts → Cron

### 13.2. Команды для деплоя

```bash
# 1. Install dependencies
pnpm install

# 2. Run tests
pnpm test:courseai-next

# 3. Deploy Edge Function
supabase functions deploy cleanup-old-drafts

# 4. Run migrations
supabase db push

# 5. Set environment variable
export NEXT_PUBLIC_FEATURE_REDIS_SESSIONS=true

# 6. Build and deploy
pnpm build:courseai-next
# ... deployment commands ...
```

---

## 14. Approval & Sign-off

**Prepared by:** Claude Code Agent
**Date:** 2025-11-08
**Version:** 1.0

**Approvals required:**
- [ ] Tech Lead
- [ ] Product Owner
- [ ] DevOps Engineer

**Estimated completion:** 2025-11-15 (7 calendar days)

---

**END OF TECHNICAL SPECIFICATION**
