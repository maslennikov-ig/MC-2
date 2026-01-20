# Fix: File Path Mismatch in Document Processing Jobs

## Problem

При генерации курсов с документами воркер не может найти файлы:

```
ENOENT: no such file or directory, access '/home/me/code/mc2/packages/course-gen-platform/uploads/org-id/course-id/file.pdf'
```

## Root Cause

**`.env` файл копируется в Docker образ и содержит локальный путь разработки!**

1. **В `/packages/course-gen-platform/.env`**:

   ```
   DOCLING_UPLOADS_BASE_PATH=/home/me/code/mc2/packages/course-gen-platform
   ```

2. **`.dockerignore` НЕ исключает `.env`** (только `.env.local`, `.env.development`, etc.)

3. **При сборке образа** файл `.env` копируется внутрь контейнера

4. **При создании джоба** API формирует путь:

   ```typescript
   filePath: path.join(process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd(), file.storage_path);
   ```

   Результат: `/home/me/code/mc2/packages/course-gen-platform/uploads/org-id/...`

5. **Этот путь не существует в контейнере!** Volume смонтирован как `/app/uploads`

## Analysis

### Путь к проблеме:

1. **Dockerfile** (line 58) копирует весь пакет:

   ```dockerfile
   COPY packages/course-gen-platform ./packages/course-gen-platform
   ```

2. **`.dockerignore`** НЕ исключает `.env`:

   ```
   .env.local
   .env.development
   .env.test
   .env*.local
   # НО НЕ .env !
   ```

3. **`.env`** содержит локальный путь:

   ```
   DOCLING_UPLOADS_BASE_PATH=/home/me/code/mc2/packages/course-gen-platform
   ```

4. **В контейнере** этот путь читается и используется для построения filePath

### Ожидаемый путь vs Фактический:

|                               | Ожидаемый                          | Фактический                                      |
| ----------------------------- | ---------------------------------- | ------------------------------------------------ |
| **DOCLING_UPLOADS_BASE_PATH** | `/app`                             | `/home/me/code/mc2/packages/course-gen-platform` |
| **Результат пути**            | `/app/uploads/org/course/file.pdf` | `/home/me/code/.../uploads/org/course/file.pdf`  |
| **Существует в контейнере?**  | ДА (volume mount)                  | НЕТ                                              |

## Solution

**Двухэтапное исправление:**

### Step 1: Добавить `.env` в .dockerignore (предотвратить повтор)

Файлы:

- `/packages/course-gen-platform/.dockerignore`
- `/.dockerignore`

Добавить:

```
.env
```

### Step 2: Установить переменную в docker-compose (исправить текущие образы)

В `docker-compose.dev.yml` и `docker-compose.production.yml`:

```yaml
api-dev:
  environment:
    - DOCLING_UPLOADS_BASE_PATH=/app

worker-dev:
  environment:
    - DOCLING_UPLOADS_BASE_PATH=/app
```

### Step 3: Пересоздать контейнеры (без пересборки образов)

```bash
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --force-recreate api-dev worker-dev"
```

### Step 4: Протестировать с новым курсом

## Files to Modify

1. `packages/course-gen-platform/.dockerignore` — Добавить `.env`
2. `.dockerignore` — Добавить `.env`
3. `docker-compose.dev.yml` — Добавить `DOCLING_UPLOADS_BASE_PATH=/app` к api-dev, worker-dev
4. `docker-compose.production.yml` — То же для production

## Verification

1. Создать новый курс с загруженными документами
2. Убедиться, что Stage 2 (document processing) проходит без ENOENT ошибок
3. Проверить, что файлы обработаны и векторы созданы
4. Убедиться, что генерация курса продолжается до следующих этапов

## Risk Assessment

- **Low risk**: Только добавляет env переменную и исключает файл из сборки
- **Rollback**: Удалить переменную и перезапустить контейнеры
