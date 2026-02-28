# Plan: Объединить хранилище медиа-файлов Dev и Staging

## Context

Dev (`dev.ai.megacampus.ru`) и Staging (`ai.megacampus.ru`) используют **одну и ту же базу Supabase**, но хранят медиа-файлы enrichments (аудио/видео NotebookLM, обложки) в **разных директориях**:

|                             | Dev                                            | Staging                                    |
| --------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Docker volume               | `./data/enrichments-dev:/app/data/enrichments` | `./data/enrichments:/app/data/enrichments` |
| Nginx alias                 | `/opt/megacampus/data/enrichments-dev/`        | `/opt/megacampus/data/enrichments/`        |
| ENRICHMENTS_PUBLIC_BASE_URL | `https://dev.ai.megacampus.ru`                 | `https://ai.megacampus.ru`                 |

**Проблема**: Когда enrichment создан на Staging, файл записывается в `enrichments/`. При открытии на Dev — `get-playback-url` генерирует URL `https://dev.ai.megacampus.ru/storage/enrichments/{path}`, nginx ищет в `enrichments-dev/` — файла нет → **404**. И наоборот.

**Решение**: Использовать одну общую директорию `enrichments/` для обоих окружений. Оба nginx location будут указывать на одни и те же файлы. URL генерируется с доменом текущего окружения, но файлы лежат в одном месте.

## Changes

### 1. Docker Compose Dev — сменить volume

**File**: `docker-compose.dev.yml:268`

```diff
- - ./data/enrichments-dev:/app/data/enrichments
+ - ./data/enrichments:/app/data/enrichments
```

### 2. Nginx Dev — сменить alias

**File**: `deploy/nginx/megacampus-dev.conf:89`

```diff
- alias /opt/megacampus/data/enrichments-dev/;
+ alias /opt/megacampus/data/enrichments/;
```

### 3. Deploy скрипты — убрать создание отдельной директории

**File**: `scripts/deploy_blue_green.sh:63`
**File**: `scripts/deploy_dev.sh:47`

Убрать `"$BASE_PATH/data/enrichments-dev"` из `mkdir -p` и `chown` — она больше не нужна.

### 4. Миграция файлов на сервере (ручная, одноразовая)

После деплоя нужно перенести файлы из `enrichments-dev/` в `enrichments/`:

```bash
# На сервере:
# 1. Скопировать файлы (rsync не перезапишет существующие с --ignore-existing)
rsync -av --ignore-existing /opt/megacampus/data/enrichments-dev/ /opt/megacampus/data/enrichments/

# 2. Проверить, что файлы доступны
ls /opt/megacampus/data/enrichments/ | head -20

# 3. Перезагрузить nginx
sudo nginx -t && sudo nginx -s reload

# 4. Проверить доступ с обоих доменов
curl -I https://ai.megacampus.ru/storage/enrichments/<test-path>
curl -I https://dev.ai.megacampus.ru/storage/enrichments/<test-path>

# 5. После подтверждения — удалить старую директорию (опционально)
# rm -rf /opt/megacampus/data/enrichments-dev/
```

### 5. Обновить документацию

**File**: `.claude/docs/deployment-guide.md`

Обновить таблицу и описание — enrichments dir теперь один для обоих окружений.

## Files to modify

1. `docker-compose.dev.yml` — volume mount (строка 268)
2. `deploy/nginx/megacampus-dev.conf` — alias (строка 89)
3. `scripts/deploy_blue_green.sh` — mkdir/chown (строки 63, 66)
4. `scripts/deploy_dev.sh` — mkdir/chown (строка 47)
5. `.claude/docs/deployment-guide.md` — документация

## Verification

1. `git diff` — проверить, что изменения минимальны и корректны
2. Задеплоить на Dev (`git push`)
3. На сервере: выполнить миграцию файлов (rsync)
4. Проверить:
   - Создать enrichment на Dev → доступен на Staging
   - Открыть enrichment созданный на Staging → доступен на Dev
   - `curl -I https://dev.ai.megacampus.ru/storage/enrichments/{path}` → 200
   - `curl -I https://ai.megacampus.ru/storage/enrichments/{path}` → 200

## Risks

- **Нет изоляции**: Dev-баги могут повредить production-файлы (минимальный риск, т.к. файлы write-once)
- **Конфликт имён**: Невозможен — имена файлов = UUID enrichmentId
- **Миграция**: `rsync --ignore-existing` безопасен — не перезаписывает существующие файлы
