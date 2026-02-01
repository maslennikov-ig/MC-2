# План: Переключение Docling MCP на SSE транспорт

## Проблема

Docling MCP сервер падает с ошибкой `"No valid session ID provided"` после обработки ~7 документов.

### Корневая причина

**Streamable HTTP транспорт** требует управления сессией через `mcp-session-id` заголовок:

- Сессия создаётся при первом запросе
- Каждый последующий запрос должен включать session ID
- При долгих паузах (обработка документа 15-120 сек) сессия истекает
- Нет keepalive механизма

### Официальные рекомендации

Это **известная проблема** в MCP экосистеме:

- [modelcontextprotocol/python-sdk#880](https://github.com/modelcontextprotocol/python-sdk/issues/880) - проблема horizontal scaling
- [modelcontextprotocol/python-sdk#520](https://github.com/modelcontextprotocol/python-sdk/issues/520) - multi-worker environment
- [makenotion/notion-mcp-server#138](https://github.com/makenotion/notion-mcp-server/issues/138) - Docker HTTP transport

**Рекомендуемое решение:** SSE транспорт вместо Streamable HTTP.

---

## План исправления

### Task 1: Переключить Docling на SSE транспорт

**Изменения:**

1. **Файл:** `.env` (или `.env.production`)

   ```diff
   - DOCLING_MCP_URL=http://docling-mcp:8000/mcp
   + DOCLING_MCP_URL=http://docling-mcp:8000/sse
   ```

2. **Файл:** `docker-compose.yml` (если переменная там)

   ```diff
     environment:
   -   - MCP_TRANSPORT=streamable-http
   +   - MCP_TRANSPORT=sse
   ```

3. **Проверить:** `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`
   - Код уже поддерживает SSE (строка 110): `this.useSSE = config.serverUrl.includes('/sse')`
   - Убедиться что SSEClientTransport импортирован

**Верификация:**

```bash
# 1. Перезапустить Docling сервис
docker-compose restart docling-mcp

# 2. Проверить логи
docker-compose logs -f docling-mcp

# 3. Загрузить 10+ документов и проверить что все обработались
```

---

### Task 2 (Опционально): Создать beads для отложенных задач

Если после SSE fix всё равно будут проблемы:

1. **#4 Stage 4 coordination** - добавить `skip_reason` поле в file_catalog
2. **#6 Double retry loop** - упростить retry логику (не критично после SSE)

---

## Файлы для изменения

```
.env.production                           # DOCLING_MCP_URL
docker-compose.yml                        # MCP_TRANSPORT (если есть)
docker-compose.production.yml             # То же для продакшена
```

---

## Верификация

### Тест 1: Базовый

```bash
curl -v http://localhost:8000/sse
# Должен вернуть SSE stream, не 404
```

### Тест 2: End-to-end

1. Загрузить курс с 10+ PDF документами
2. Проверить что ВСЕ документы обработались без ошибок сессии
3. Проверить логи на отсутствие "No valid session ID"

### SQL проверка:

```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE vector_status = 'indexed') as indexed,
  COUNT(*) FILTER (WHERE vector_status = 'failed') as failed,
  COUNT(*) FILTER (WHERE error_message LIKE '%session%') as session_errors
FROM file_catalog
WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## Риски

| Риск                               | Вероятность | Митигация                                                |
| ---------------------------------- | ----------- | -------------------------------------------------------- |
| SSE endpoint не работает в Docling | Низкая      | Проверить версию docling-mcp, при необходимости обновить |
| Производительность SSE хуже        | Низкая      | SSE проще, обычно стабильнее                             |
| Nginx не пропускает SSE            | Средняя     | Добавить `proxy_buffering off` для SSE                   |

---

## Beads задача

```bash
bd create "Переключить Docling MCP на SSE транспорт" \
  -t task \
  --priority 1 \
  --labels backend,pipeline,docling \
  -d "Корневая причина падений Docling - Streamable HTTP session management.
Официально рекомендуется SSE для Docker.

Изменения:
1. DOCLING_MCP_URL: /mcp -> /sse
2. MCP_TRANSPORT: streamable-http -> sse
3. Проверить nginx proxy_buffering

Ссылки:
- https://github.com/modelcontextprotocol/python-sdk/issues/880
- https://github.com/modelcontextprotocol/python-sdk/issues/520"
```
