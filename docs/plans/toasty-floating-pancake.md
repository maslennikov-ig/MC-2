# Fix: NotebookLM Bridge Auth Expired on Dev Server

## Context

Audio enrichment generation на dev-сервере (`dev.ai.megacampus.ru`) завершается ошибкой:

```
BullMQ exhausted retries: NotebookLM bridge task failed (taskId=693619a96e3247aab6f096c77f3f78bd, status=failed)
```

## Root Cause

**Google-авторизация истекла.** Файл `storage_state.json` на сервере устарел (~30 часов).

Из логов bridge (`megacampus-notebooklm-bridge-dev`):

```
Bridge task failed: error=Failed to initialize NotebookLM client from storage:
Authentication expired or invalid. Redirected to: https://accounts.google.com/v3/signin/...
Run 'notebooklm login' to re-authenticate.
```

Конфигурация на сервере:

- `NOTEBOOKLM_AUTH_JSON=` (пустой — file-based auth)
- `NOTEBOOKLM_STORAGE_PATH=/app/secrets/notebooklm/storage_state.json`
- Файл: `/opt/megacampus/secrets/notebooklm/storage_state.json` (14KB, обновлён Feb 25 07:11)

## Fix Steps (ручная операция — требует браузер)

### Step 1: Обновить auth-токен

В WSL-терминале:

```bash
cd /home/me/code/mc2
source packages/course-gen-platform/docker/notebooklm-bridge/.venv/bin/activate
python scripts/notebooklm-export-auth.py -o /tmp/server_storage_state.json
```

Откроется Chrome — нужно залогиниться под **серверным** Google-аккаунтом, затем нажать Enter.

### Step 2: Скопировать на сервер

```bash
scp /tmp/server_storage_state.json megacampus-prod:/tmp/storage_state.json
ssh megacampus-prod "sudo cp /tmp/storage_state.json /opt/megacampus/secrets/notebooklm/storage_state.json && sudo chmod 600 /opt/megacampus/secrets/notebooklm/storage_state.json && rm /tmp/storage_state.json"
rm /tmp/server_storage_state.json
```

### Step 3: Перезапустить bridge

```bash
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.infra.yml restart notebooklm-bridge"
```

### Step 4: Verify

```bash
# Проверить логи (должен стартовать без ошибок auth)
ssh megacampus-prod "docker logs megacampus-notebooklm-bridge-dev --tail=20"

# Проверить health
ssh megacampus-prod "curl -sSf http://127.0.0.1:8010/health"
```

После этого — повторно запустить генерацию аудио из UI.

## Notes

- Это НЕ баг в коде — штатное истечение Google-сессии
- Локальный auth (`secrets/notebooklm/storage_state.json`) не затрагивается (флаг `-o`)
- Документация: `docs/notebooklm-server-auth-refresh.md`
