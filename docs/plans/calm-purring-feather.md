# План: Миграция Enrichment Storage на локальный сервер

## Цель

Перенести все enrichment картинки (258 файлов, 25 MB) из Supabase Storage на локальный сервер для устранения лимита egress трафика (5 GB/месяц при лимите 2 GB).

## Задача в Beads

Создать задачу: `bd create --title="Перенести enrichment storage на локальный сервер" --type=feature --priority=1`

---

## Фаза 1: Инфраструктура (сервер)

### 1.1 Создать директорию

```bash
ssh megacampus-prod "mkdir -p /opt/megacampus/data/enrichments && chmod 755 /opt/megacampus/data/enrichments"
```

### 1.2 Настроить nginx

**Файл:** `nginx-megacampus.conf`

```nginx
# Static enrichment files - served directly by nginx
location /storage/enrichments/ {
    alias /opt/megacampus/data/enrichments/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    types { image/webp webp; }
    default_type image/webp;
    try_files $uri =404;
}
```

### 1.3 Docker volumes

**Файл:** `docker-compose.production.yml`

```yaml
services:
  api:
    volumes:
      - ./data/enrichments:/app/data/enrichments

  worker:
    volumes:
      - ./data/enrichments:/app/data/enrichments
```

---

## Фаза 2: Код

### 2.1 Создать local-storage-service.ts

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/local-storage-service.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';

const STORAGE_BASE = process.env.ENRICHMENTS_LOCAL_PATH || '/app/data/enrichments';
const PUBLIC_URL = process.env.ENRICHMENTS_PUBLIC_URL || '/storage/enrichments';

export async function uploadEnrichmentAsset(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
  const filePath = path.join(dirPath, `${enrichmentId}.${extension}`);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `${courseId}/${lessonId}/${enrichmentId}.${extension}`;
}

export function buildPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.megacampus.ru';
  return `${baseUrl}${PUBLIC_URL}/${storagePath}`;
}

export async function deleteEnrichmentAsset(storagePath: string): Promise<void> {
  const filePath = path.join(STORAGE_BASE, storagePath);
  await fs.unlink(filePath).catch(() => {});
}
```

### 2.2 Обновить cover-handler.ts

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/cover-handler.ts`

**Изменения (строки ~1058-1083):**

- Заменить `supabase.storage.upload()` на `uploadEnrichmentAsset()`
- Заменить `getPublicUrl()` на `buildPublicUrl()`

### 2.3 Обновить card-handler.ts

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/card-handler.ts`

Аналогичные изменения.

### 2.4 ENV переменные

```bash
ENRICHMENTS_LOCAL_PATH=/app/data/enrichments
ENRICHMENTS_PUBLIC_URL=/storage/enrichments
```

---

## Фаза 3: Миграция данных

### 3.1 Скачать файлы из Supabase

```bash
# Создать скрипт миграции
ssh megacampus-prod "cat > /opt/megacampus/scripts/migrate-enrichments.sh << 'EOF'
#!/bin/bash
# Скачать все файлы из Supabase Storage
# Требует supabase CLI или curl с service key
EOF"
```

### 3.2 SQL: Обновить URLs в БД

```sql
UPDATE lesson_enrichments
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      'https://diqooqbuchsliypgwksu\.supabase\.co/storage/v1/object/public/course-enrichments/',
      'https://ai.megacampus.ru/storage/enrichments/'
    )
  )
)
WHERE content->>'imageUrl' LIKE '%supabase.co%course-enrichments%';
```

---

## Фаза 4: Очистка orphaned файлов

### 4.1 Найти orphans

```sql
-- Получить все используемые пути
SELECT DISTINCT
  regexp_replace(
    content->>'imageUrl',
    '.*/course-enrichments/',
    ''
  ) as storage_path
FROM lesson_enrichments
WHERE content->>'imageUrl' IS NOT NULL;
```

Сравнить с `supabase storage ls course-enrichments` — файлы без записи в БД = orphans.

### 4.2 Удалить orphans

Не копировать orphaned файлы на сервер.

---

## Фаза 5: Удаление Supabase Storage

После верификации (через неделю):

```sql
-- Supabase Dashboard → Storage → course-enrichments → Delete bucket
```

---

## Критические файлы

| Файл                                | Изменение               |
| ----------------------------------- | ----------------------- |
| `nginx-megacampus.conf`             | Добавить location block |
| `docker-compose.production.yml`     | Добавить volume         |
| `handlers/cover-handler.ts`         | Upload → local          |
| `handlers/card-handler.ts`          | Upload → local          |
| `services/local-storage-service.ts` | Новый файл              |

---

## Верификация

1. [ ] Файлы скопированы на сервер (258 штук)
2. [ ] Nginx отдаёт `/storage/enrichments/` (curl test)
3. [ ] URLs в БД обновлены
4. [ ] Новые enrichments сохраняются локально
5. [ ] Картинки отображаются в курсах
6. [ ] Нет 404 в nginx логах
7. [ ] Supabase egress = 0

---

## Порядок выполнения

1. Создать задачу в Beads
2. Настроить инфраструктуру (nginx, volumes)
3. Написать local-storage-service
4. Скачать файлы из Supabase на сервер
5. Найти и исключить orphaned файлы
6. Обновить handlers (cover, card)
7. Деплой на staging
8. SQL миграция URLs
9. Тестирование
10. Удалить bucket из Supabase
