# Plan: Fix File Upload Tier-Based Limits

## Overview

Исправить систему лимитов загрузки файлов:

1. Изменить лимиты для TRIAL и STANDARD на 30MB
2. Backend limit = 100MB (максимум для PREMIUM)
3. Frontend должен показывать tier-aware сообщения с предложением upgrade

## Текущая проблема

- **Backend**: 50MB hardcoded (должен быть 100MB для PREMIUM)
- **Frontend**: 50MB hardcoded, не учитывает тариф пользователя
- **Tier constants**: TRIAL/STANDARD = 10MB (нужно 30MB)

## Файлы для изменения

### 1. Константы тарифов

**File:** `packages/shared-types/src/file-upload-constants.ts`

Изменить `FILE_SIZE_LIMITS_BY_TIER`:

```typescript
export const FILE_SIZE_LIMITS_BY_TIER = {
  trial: 30 * 1024 * 1024, // 30 MB (было 10 MB)
  free: 5 * 1024 * 1024, // 5 MB (без изменений)
  basic: 10 * 1024 * 1024, // 10 MB (без изменений)
  standard: 30 * 1024 * 1024, // 30 MB (было 10 MB)
  premium: 100 * 1024 * 1024, // 100 MB (без изменений)
} as const;
```

### 2. Backend body-parser limit

**File:** `packages/course-gen-platform/src/server/index.ts`

```typescript
// Изменить с 50mb на 100mb
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
```

### 3. Frontend FileUpload компонент

**File:** `packages/web/components/forms/file-upload.tsx`

**Изменения:**

1. **Убрать hardcoded константы**, импортировать из shared-types:

```typescript
import {
  FILE_SIZE_LIMITS_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  TierKey,
} from '@megacampus/shared-types';
```

2. **Добавить props для tier**:

```typescript
interface FileUploadProps {
  courseId: string | null;
  tier?: TierKey; // Тариф организации
  // ... остальные props
}
```

3. **Динамические лимиты**:

```typescript
const effectiveTier = tier || 'free';
const maxFileSize = FILE_SIZE_LIMITS_BY_TIER[effectiveTier];
const maxFileSizeMB = maxFileSize / (1024 * 1024);
const maxFiles = FILE_COUNT_LIMITS_BY_TIER[effectiveTier];
```

4. **Информативные сообщения об ошибке**:

```typescript
// При превышении размера файла
if (file.size > maxFileSize) {
  const suggestedTier = getSuggestedTierForSize(file.size);
  return {
    valid: false,
    error: `Файл "${file.name}" (${formatSize(file.size)}) превышает лимит вашего тарифа (${maxFileSizeMB} МБ). ${
      suggestedTier
        ? `Перейдите на тариф ${suggestedTier.toUpperCase()} для загрузки файлов до ${FILE_SIZE_LIMITS_BY_TIER[suggestedTier] / (1024 * 1024)} МБ.`
        : ''
    }`,
  };
}
```

5. **Вспомогательная функция для upgrade suggestion**:

```typescript
function getSuggestedTierForSize(fileSize: number): TierKey | null {
  const tiers: TierKey[] = ['basic', 'standard', 'premium'];
  for (const tier of tiers) {
    if (fileSize <= FILE_SIZE_LIMITS_BY_TIER[tier]) {
      return tier;
    }
  }
  return null; // Файл слишком большой даже для PREMIUM
}
```

### 4. Передача tier в FileUpload

**File:** `packages/web/app/[locale]/generation-graph/[courseId]/page.tsx` (или где используется FileUpload)

Получить tier из организации и передать в компонент:

```typescript
// При загрузке курса получаем tier
const { data: course } = await supabase
  .from('courses')
  .select('organization_id, organizations!inner(tier)')
  .eq('id', courseId)
  .single();

const orgTier = course?.organizations?.tier || 'free';

// Передаем в FileUpload
<FileUpload tier={orgTier as TierKey} ... />
```

### 5. i18n сообщения

**Files:**

- `packages/web/messages/ru/common.json`
- `packages/web/messages/en/common.json`

Добавить сообщения:

```json
{
  "fileUpload": {
    "tierLimitExceeded": "Файл превышает лимит вашего тарифа ({limit} МБ)",
    "upgradeSuggestion": "Перейдите на тариф {tier} для загрузки файлов до {limit} МБ",
    "fileCountExceeded": "Достигнут лимит файлов для вашего тарифа ({limit})",
    "upgradeLink": "Улучшить тариф"
  }
}
```

## Порядок выполнения

1. Изменить константы в `shared-types` (TRIAL, STANDARD = 30MB)
2. Изменить backend limit до 100MB
3. Обновить FileUpload компонент:
   - Импортировать константы из shared-types
   - Добавить tier prop
   - Реализовать динамические лимиты
   - Добавить информативные сообщения
4. Добавить i18n сообщения
5. Обновить места использования FileUpload (передать tier)
6. Type-check и build

## Проверка

1. `pnpm type-check`
2. `pnpm build`
3. Тест на dev:
   - Загрузить файл 25MB на STANDARD тарифе → должен загрузиться
   - Загрузить файл 50MB на STANDARD тарифе → сообщение "Перейдите на PREMIUM"
   - Загрузить файл 80MB на PREMIUM тарифе → должен загрузиться
