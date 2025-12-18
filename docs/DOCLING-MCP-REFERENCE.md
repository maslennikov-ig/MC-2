# Docling MCP Integration - Quick Reference

> **Краткая справка** по Docling MCP интеграции | **Updated**: 2025-10-28 | **Status**: Production-Ready ✅

## Архитектура (кратко)

```
MegaCampus App
    ↓
Markdown Converter (markdown-converter.ts)
    ↓
Docling Client (client.ts)
    ↓ HTTP + SSE (JSON-RPC 2.0)
Docling MCP Server (Docker)
    ↓
Document Cache (_cache/) ← Volume Mount → .tmp/docling-cache/
```

**Ключевое нововведение (T074.5)**:
- Volume mount для прямого доступа к JSON кэшу
- Метод `getDoclingDocumentJSON()` возвращает полную структуру документа
- Никаких изменений в MCP сервере - используем существующий инструмент `save_docling_document`

---

## Docker Setup

```yaml
# docker-compose.yml
docling-mcp:
  image: docling-mcp-docling-mcp
  volumes:
    - /home/me/code/megacampus2:/home/me/code/megacampus2:ro
    - /home/me/code/megacampus2/.tmp/docling-cache:/usr/local/lib/python3.12/site-packages/_cache
```

**Критично**: Оба volume mount'а обязательны:
1. Проектная директория (read-only) - для чтения файлов
2. Cache директория (read-write) - для доступа к JSON exports (NEW в T074.5)

---

## Client API

**Location**: `packages/course-gen-platform/src/shared/docling/client.ts`

### Основные методы

```typescript
import { getDoclingClient } from '@/shared/docling/client';

const client = getDoclingClient(); // Singleton

// 1. Подключение
await client.connect();

// 2. Получить Markdown
const markdown = await client.convertToMarkdown('/path/to/file.pdf');

// 3. Получить полный JSON (NEW - T074.5)
const doclingDoc = await client.getDoclingDocumentJSON('/path/to/file.pdf');
// Возвращает: { texts[], pictures[], tables[], pages{}, metadata }

// 4. Отключение
await client.disconnect();
```

### High-level API (рекомендуется)

```typescript
import { convertDocumentToMarkdown } from '@/shared/embeddings/markdown-converter';

const result = await convertDocumentToMarkdown('/path/to/file.pdf');
// result.markdown - текст
// result.json - полный DoclingDocument (реальные данные, не stub!)
// result.metadata - { pages_processed, text_elements, tables_extracted, ... }
```

---

## MCP Tools (ключевые)

MCP сервер предоставляет 19 инструментов. **Основные**:

1. **`convert_document_into_docling_document`**
   - Конвертирует документ → возвращает `document_key`

2. **`export_docling_document_to_markdown`**
   - Экспортирует в Markdown

3. **`save_docling_document`** ⭐ (NEW - T074.5)
   - Сохраняет JSON + MD в кэш
   - JSON доступен через volume mount

4. **`is_document_in_local_cache`**
   - Проверяет наличие в кэше

**Полный список**: 19 tools (document editing, navigation, search) - см. детальную документацию при необходимости.

---

## Data Structures (основные)

```typescript
interface DoclingDocument {
  schema_name: "DoclingDocument";
  version: "1.7.0";
  name: string;

  // Content
  texts: DoclingText[];         // Все текстовые элементы
  pictures: DoclingPicture[];   // Изображения с OCR
  tables: DoclingTable[];       // Таблицы
  pages: Record<string, PageMetadata>;

  // Metadata
  origin?: { filename, mimetype, binary_hash };
  metadata?: { page_count, format, processing };
}

interface DoclingText {
  label: "title" | "heading" | "text" | "list-item" | "code" | "formula";
  text: string;
  page_no: number;
  bbox?: [x, y, width, height];
}
```

---

## Tier Processing

| Tier | Formats | Docling | OCR | Images | Tables |
|------|---------|---------|-----|--------|--------|
| FREE | None | ❌ | ❌ | ❌ | ❌ |
| BASIC | TXT, MD | ❌ | ❌ | ❌ | ❌ |
| TRIAL | PDF, DOCX, PPTX, HTML, TXT, MD | ✅ | ✅ | ✅ | ✅ |
| STANDARD | PDF, DOCX, PPTX, HTML, TXT, MD | ✅ | ✅ | ❌ | ✅ |
| PREMIUM | All + PNG, JPG | ✅ | ✅ | ✅ | ✅ |

**Handler**: `src/orchestrator/handlers/document-processing.ts`
- `processBasicTier()` - прямое чтение файла
- `processStandardTier()` - Docling + OCR
- `processPremiumTier()` - Docling + OCR + images

---

## Quick Commands

```bash
# Docker
docker compose up -d docling-mcp          # Запустить
docker compose restart docling-mcp        # Перезапустить
docker compose logs -f docling-mcp        # Логи

# Cache
ls -lah .tmp/docling-cache/              # Содержимое кэша
rm .tmp/docling-cache/*.json             # Очистить кэш

# Testing
pnpm test tests/integration/docling-json-export.test.ts
```

---

## Troubleshooting

### 1. "File not found"
```bash
# Проверить volume mount
docker exec docling-mcp-server ls /home/me/code/megacampus2/packages/...

# Убедиться, что путь абсолютный
const absolutePath = path.resolve(filePath);
```

### 2. "Missing session ID"
```typescript
// Всегда подключаться перед использованием
await client.connect();
await client.convertToMarkdown(filePath);
```

### 3. Container Unhealthy
**Не критично** - сервер работает. Health check ищет `/health` endpoint (его нет).

### 4. Timeout
```typescript
// Увеличить timeout для больших файлов
const client = new DoclingClient('http://localhost:8000/mcp', 600000); // 10 min
```

---

## Environment Variables

```bash
# .env
DOCLING_MCP_URL=http://localhost:8000/mcp
DOCLING_MCP_TIMEOUT=300000  # 5 minutes
```

---

## Implementation Status

### ✅ T074.3 (2025-10-27)
- MCP client + session management
- Markdown conversion
- Docker integration
- Tier-based processing

### ✅ T074.5 (2025-10-28)
**Problem**: Stub создавал пустой DoclingDocument (texts[], pictures[], tables[] были пусты)

**Solution**:
- Обнаружили существующий инструмент `save_docling_document`
- Добавили cache volume mount
- Реализовали `getDoclingDocumentJSON()` - читает JSON из кэша
- Заменили stub в `markdown-converter.ts`

**Benefits**:
- ✅ Без форка MCP сервера
- ✅ Полная метадата: texts[], pictures[], tables[], pages{}
- ✅ Прямой доступ к файлам (быстро)
- ✅ Тесты: 3/3 passed

**Files Changed**:
1. `docker-compose.yml` - cache volume mount
2. `src/shared/docling/client.ts` - new method
3. `src/shared/embeddings/markdown-converter.ts` - stub → real API
4. `tests/integration/docling-json-export.test.ts` - new tests

---

## Performance (краткие цифры)

| File Type | Size | Processing Time |
|-----------|------|-----------------|
| TXT | 10 KB | 50ms |
| PDF (5 pages) | 500 KB | 2.5s |
| PDF (50 pages) | 5 MB | 15s |
| DOCX | 200 KB | 1.8s |

**Cache hit**: ~15-20ms независимо от размера

---

## Related Docs

- **[Detailed Investigation](./investigations/T074.5-mcp-json-export-implementation.md)** - полный отчёт о T074.5
- **[Task Spec](../specs/005-stage-3-create/T074.5-docling-json-retrieval-task.md)** - спецификация
- **[Docling GitHub](https://github.com/docling-project/docling)** - upstream library

---

## Key Takeaways

1. **Docling Client** - TypeScript wrapper вокруг MCP протокола
2. **MCP Server** - Docker контейнер с 19 инструментами
3. **Volume Mount** - прямой доступ к JSON кэшу (критично для T074.5)
4. **Singleton pattern** - `getDoclingClient()` возвращает одну инстанцию
5. **Tier-based** - разные возможности для FREE/BASIC/STANDARD/PREMIUM
6. **Real metadata** - `getDoclingDocumentJSON()` возвращает полную структуру (не stub)

---

**Version**: 2.0 (с T074.5) | **Lines**: ~270 (было 1467) | **Status**: Production-Ready ✅
