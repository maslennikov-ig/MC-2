# Plan: Update Docling MCP to Latest Version

## Status: draft

## Background

### Transport History

1. Изначально использовали Streamable HTTP
2. Были проблемы с сессиями при длительной обработке (15-120 сек)
3. MCP SDK maintainers рекомендовали SSE для Docker (issues #880, #520)
4. Создали beads mc2-coa3, mc2-aoof для перехода на SSE
5. Но **MCP spec 2025-03-26** deprecated SSE, рекомендует Streamable HTTP
6. Сегодняшний фикс (50c7f55c) вернул `/mcp` — **это правильно**

### Current State

- Transport: Streamable HTTP (`/mcp`) ✓
- docling-mcp: `>=1.3.3` (устарел)
- mcp SDK: `>=1.24.3` (устарел)

### Latest Versions

| Package     | Current  | Latest     | Delta                          |
| ----------- | -------- | ---------- | ------------------------------ |
| docling-mcp | >=1.3.3  | **1.3.4**  | Фикс зависимостей (mellea API) |
| mcp SDK     | >=1.24.3 | **1.26.0** | +2 minor versions              |

## Solution

Обновить docling-mcp до последней версии — это может исправить проблемы с сессиями Streamable HTTP.

## Files to Modify

1. **packages/course-gen-platform/docker/docling-mcp/Dockerfile**
   - Обновить версии пакетов
   - Оставить Streamable HTTP (рекомендуемый)

## Implementation Steps

### Step 1: Update Dockerfile

```dockerfile
# Line 27-29: Pin to latest versions
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "mcp[cli]>=1.26.0" && \
    pip install --no-cache-dir "docling-mcp>=1.3.4"
```

### Step 2: Rebuild and Push Docker Image

```bash
cd packages/course-gen-platform/docker/docling-mcp
docker build -t ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest .
docker push ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest
```

### Step 3: Update Server

```bash
ssh megacampus-prod "
  cd /opt/megacampus
  # Pull new image
  docker pull ghcr.io/maslennikov-ig/mc-2/docling-mcp:latest
  # Recreate container
  docker compose -f docker-compose.infra.yml up -d docling-mcp-internal
  # Restart workers to reconnect
  docker compose -f docker-compose.infra.yml restart worker worker-dev
"
```

### Step 4: Close Obsolete Beads

```bash
bd close mc2-coa3 --reason "SSE deprecated в MCP spec 2025-03-26. Streamable HTTP теперь рекомендуемый транспорт."
```

## Verification

1. Check container version:

   ```bash
   ssh megacampus-prod "docker exec megacampus-docling-mcp-internal pip show docling-mcp mcp"
   # docling-mcp: 1.3.4
   # mcp: 1.26.0
   ```

2. Test connection:

   ```bash
   ssh megacampus-prod "docker exec megacampus-worker curl -s http://docling-mcp:8000/mcp"
   # Should return MCP response
   ```

3. Test document conversion on dev.ai.megacampus.ru:
   - Upload PDF document
   - Check Stage 2 logs for successful Docling conversion

## Rollback

Если новая версия не работает:

```bash
# Откатить Dockerfile к предыдущей версии
git checkout HEAD~1 -- packages/course-gen-platform/docker/docling-mcp/Dockerfile
# Пересобрать и задеплоить
```

## Summary

- **Transport**: Streamable HTTP (`/mcp`) — оставляем (рекомендуемый по MCP spec)
- **Versions**: docling-mcp 1.3.4 + mcp 1.26.0
- **Beads**: mc2-coa3 → close (SSE deprecated)
