# Plan: Fix infographic media payload not found by TS bridge client

## Context

Инфографика генерируется в NotebookLM (видна пользователю), но не сохраняется на сервере.

**Ошибка в БД** (enrichment `b1f2d1e7`, курс BRA-1467):

> BullMQ exhausted retries: NotebookLM bridge task result did not include media payload or download URL (taskId=5bab7719...)

**Корневая причина**: Bridge возвращает PNG-изображение инфографики в поле `image_base64`, но TS клиент (`notebooklm-bridge-client.ts`) ищет только: `audio_base64`, `video_base64`, `file_base64`, `base64`, `base64_data`, `data`. Ключ `image_base64` отсутствует в списке → TS не находит payload → ошибка.

## Error Flow

```
Bridge → JSON: { artifact: { image_base64: "iVBOR...", mime_type: "image/png" } }
         ↓
TS getMediaPayloadCandidates → [payload, payload.artifact]  ← artifact найден
         ↓
TS hasEmbeddedMediaPayload(artifact) → проверяет audio_base64, video_base64, file_base64, base64, base64_data, data
         ↓                              image_base64 НЕТ В СПИСКЕ → false
TS extractDownloadUrl(artifact) → нет URL → null
         ↓
throw Error("did not include media payload or download URL")
```

## Fix

### `notebooklm-bridge-client.ts` (строки 436 и 451)

**Файл**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`

Добавить `'image_base64'` в 2 массива ключей:

**`hasEmbeddedMediaPayload`** (строка 435-443):

```typescript
function hasEmbeddedMediaPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    getStringValue(payload, [
      'audio_base64',
      'video_base64',
      'image_base64', // ← ADD
      'file_base64',
      'base64',
      'base64_data',
      'data',
    ])
  );
}
```

**`parseMediaPayload`** (строка 450-457):

```typescript
const base64Value = getStringValue(payload, [
  'audio_base64',
  'video_base64',
  'image_base64', // ← ADD
  'file_base64',
  'base64',
  'base64_data',
  'data',
]);
```

## Verification

1. `pnpm type-check` — pass
2. Перегенерировать infographic для BRA-1467: через UI или API сбросить статус enrichment `b1f2d1e7` в `pending` и перезапустить
3. Проверить что enrichment получил `status=completed`, `content IS NOT NULL`, `asset_id IS NOT NULL`
4. Проверить отображение инфографики на сайте
