# FUTURE: Smart Document Prioritization & Token Budget Management

**Status**: 💡 PLANNED (High Priority for Stage 3 optimization)
**Priority**: High (significant cost and quality impact)
**Category**: Stage 3 (Document Processing) + Stage 4 (Analyze) optimization
**Version**: 2.0.0 (major redesign with two-tier system)
**Last Updated**: 2025-11-06

---

## Executive Summary

Текущая система обрабатывает все документы единообразно с фиксированным лимитом 200K токенов, что неоптимально:

- ❌ Все документы получают одинаковый объём контекста независимо от важности
- ❌ Ключевые документы (сборники лекций) конкурируют за токены со справочными (законы, ГОСТы)
- ❌ Нет автоматического переключения на более мощную модель при необходимости
- ❌ Векторизация происходит после summary, что снижает качество RAG

**Предлагаемое решение**: Двухуровневая система приоритизации с умным распределением токен-бюджета и автоматическим выбором модели для Analyze Stage.

---

## Проблема

### Текущее поведение (неоптимальное)

```typescript
// Сейчас: все документы обрабатываются одинаково
const TOKEN_LIMIT = 200000; // фиксированный лимит для всех

for (const doc of documents) {
  if (doc.tokens > TOKEN_LIMIT) {
    await createSummary(doc); // summary для больших
  } else {
    await saveFullText(doc); // full text для маленьких
  }
  await vectorize(doc); // векторизация ПОСЛЕ summary
}
```

**Проблемы**:

1. ❌ **Сборник лекций** (100K токенов, HIGH priority) → summary теряет детали
2. ❌ **Федеральный закон** (150K токенов, LOW priority) → конкурирует за бюджет
3. ❌ **Нет приоритизации**: обработка в случайном порядке (как вернула БД)
4. ❌ **Модель не масштабируется**: OSS 120B имеет 128K context, не использует больше
5. ❌ **Векторизация summary**: RAG получает сжатый контент, не оригинал

### Пример из тестов (T055)

**3 документа загружены**:

1. **Презентация и обучение.txt** (71KB, ~18K токенов) — **самый важный** для курса
2. Письмо Минфина России.pdf (636KB, ~159K токенов) — справочный материал
3. Постановление Правительства РФ.txt (281KB, ~70K токенов) — нормативная база

**Текущая обработка**:

- Все 3 получили summary (превысили 200K общий лимит)
- **"Презентация и обучение"** должна была сохраниться целиком, но summary из-за общего лимита
- Обработаны в произвольном порядке (не по важности)

**Желаемая обработка**:

- **"Презентация и обучение"** → HIGH priority, order=1, full text (18K)
- **Письмо Минфина** → LOW priority, order=2, summary (159K → 5K summary)
- **Постановление** → LOW priority, order=3, summary (70K → 3K summary)
- **Векторы создаются из оригиналов** (не summary)

---

## Предлагаемое решение

### 🎯 Двухуровневая система приоритизации

#### HIGH Priority (Ключевые документы)

**Критерий**: Документ должен быть использован в курсе **полностью или почти полностью**

**Примеры**:

- ✅ Сборник лекций
- ✅ Учебник или учебное пособие
- ✅ Методические материалы
- ✅ Программа курса / Syllabus
- ✅ Авторские презентации преподавателя

**Характеристики**:

- LLM-определение: `importance_score >= 0.7` + категория "course_core"
- Лимит на 1 документ: **до 50,000 токенов**
- Если >50K → summary (Map-Reduce)
- Обрабатываются первыми (по order 1, 2, 3...)

#### LOW Priority (Справочные документы)

**Критерий**: Всё остальное — контекстная и справочная информация

**Примеры**:

- ✅ Федеральные законы, ГОСТы, СНиПы
- ✅ Постановления, регламенты
- ✅ Научные статьи (не являющиеся основой курса)
- ✅ Дополнительная литература
- ✅ Справочные материалы

**Характеристики**:

- LLM-определение: `importance_score < 0.7` OR категория "reference"
- **ВСЕГДА summary** (независимо от размера)
- **Исключение**: документы <3,000 токенов могут быть сохранены целиком (если есть бюджет)
- Обрабатываются после HIGH (по order 4, 5, 6...)

---

### 💰 Умное распределение токен-бюджета

#### Порог переключения: 80,000 токенов

**Логика**:

```
IF (HIGH_priority_total ≤ 80,000 tokens):
  Model: OSS 20B/120B (128K context, дешёвая)
  Budget: HIGH = 80K, LOW = остаток (80K - HIGH_used)

ELSE IF (HIGH_priority_total > 80,000 tokens):
  Model: Gemini 2.5 Flash / Claude Sonnet (1M context, дорогая)
  Budget: HIGH = 400K, LOW = остаток (400K - HIGH_used)
```

#### Сценарий A: Лёгкий курс (≤80K HIGH)

**Пример**: 3 документа загружены

```
HIGH priority:
- Doc 1 (order=1): 50K tokens → full text ✅
- Doc 2 (order=2): 20K tokens → full text ✅
HIGH итого: 70K tokens

LOW budget: 80K - 70K = 10K tokens

LOW priority:
- Doc 3 (order=3, 2K tokens): full text ✅ (бюджет: 10K)
- Doc 4 (order=4, 2.5K tokens): full text ✅ (бюджет: 7.5K)
- Doc 5 (order=5, 3K tokens): full text ✅ (бюджет: 5K)
- Doc 6 (order=6, 5K tokens): summary ❌ (превышает 3K лимит)
- Doc 7 (order=7, 2K tokens): full text ✅ (бюджет: 2K)
- Doc 8 (order=8, 10K tokens): summary ❌ (превышает 3K лимит)

Analyze Model: OSS 120B (дешёвая)
Total cost: ~$0.016 (80K tokens × $0.20/1M)
```

#### Сценарий B: Тяжёлый курс (>80K HIGH)

**Пример**: 10 документов загружены

```
HIGH priority:
- Doc 1 (order=1): 50K tokens → full text ✅
- Doc 2 (order=2): 50K tokens → full text ✅
- Doc 3 (order=3): 50K tokens → full text ✅
- Doc 4 (order=4): 40K tokens → full text ✅
HIGH итого: 190K tokens (превысили 80K → дорогая модель)

LOW budget: 400K - 190K = 210K tokens

LOW priority:
- Doc 5 (order=5, 2K tokens): full text ✅
- Doc 6 (order=6, 3K tokens): full text ✅
- Doc 7 (order=7, 2.5K tokens): full text ✅
- ... (можно сохранить ~70 маленьких LOW документов <3K)
- Doc 50 (order=50, 5K tokens): summary ❌ (>3K лимит)
- Doc 51 (order=51, 100K tokens): summary ❌ (>3K лимит)

Analyze Model: Gemini 2.5 Flash (дорогая, 1M context)
Total cost: ~$0.060 (400K tokens × $0.15/1M)
```

---

### 📊 Сквозная приоритизация (Order 1-N)

**Ключевая особенность**: Единая очередь приоритетов для ВСЕХ документов

```typescript
interface DocumentWithPriority {
  file_id: string;
  filename: string;
  token_count: number;
  priority: 'HIGH' | 'LOW'; // категория
  order: number; // сквозная нумерация 1-N для всех документов
  importance_score: number; // 0.0-1.0 от LLM
}
```

**Пример**:

```
10 документов загружено

LLM анализ:
- Doc A: score=0.95 → HIGH, order=1
- Doc B: score=0.88 → HIGH, order=2
- Doc C: score=0.82 → HIGH, order=3
- Doc D: score=0.65 → LOW, order=4
- Doc E: score=0.54 → LOW, order=5
- Doc F: score=0.48 → LOW, order=6
- Doc G: score=0.35 → LOW, order=7
- Doc H: score=0.28 → LOW, order=8
- Doc I: score=0.15 → LOW, order=9
- Doc J: score=0.08 → LOW, order=10

Обработка:
1. Сначала HIGH (order 1-3) — по важности
2. Потом LOW (order 4-10) — по важности
3. Для LOW <3K: сохраняем по order (4, 5, 6...) пока есть бюджет
```

---

### 🔄 Векторизация (всегда из оригинала)

**КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ**: Векторизация происходит из **полного оригинального документа**, НЕ из summary

```typescript
// ДЛЯ ВСЕХ документов (HIGH + LOW):

async function processDocument(doc: UploadedFile) {
  // 1. Определить приоритет и order через LLM
  const { priority, order, score } = await classifyDocument(doc);

  // 2. Решить: full text или summary для Analyze context
  let analyzeContent: string;

  if (priority === 'HIGH' && doc.tokens <= 50000) {
    analyzeContent = doc.fullText; // full text
  } else if (priority === 'LOW' && doc.tokens < 3000 && hasBudget()) {
    analyzeContent = doc.fullText; // full text (исключение)
  } else {
    analyzeContent = await createSummary(doc.fullText); // summary
  }

  // 3. ВЕКТОРИЗАЦИЯ ВСЕГДА ИЗ ОРИГИНАЛА (не summary!)
  const vectors = await vectorize({
    text: doc.fullText, // ← ОРИГИНАЛ, не analyzeContent!
    chunkSize: 400, // child chunks
    parentChunkSize: 1500, // parent chunks
    metadata: {
      file_id: doc.id,
      filename: doc.filename,
      priority: priority,
      order: order,
      importance_score: score,
    },
  });

  // 4. Сохранить в БД
  await saveToDB({
    file_id: doc.id,
    analyze_content: analyzeContent, // full или summary для Analyze
    vectors: vectors, // из оригинала для RAG
    priority: priority,
    order: order,
  });
}
```

**Зачем**:

- ✅ Analyze Stage использует summary (экономия токенов, суть документа)
- ✅ Generation/Lesson Stage использует RAG → получает chunks из **оригинала** (детали)
- ✅ Summary = "оглавление" (что есть в документе)
- ✅ Vectors = "детальный контент" (конкретные параграфы, цитаты, примеры)

**Пример**:

```
Федеральный закон об образовании (150K токенов):
→ Analyze content: 5K summary ("закон регулирует A, B, C...")
→ Vectors: 150K оригинал (chunks по 400 токенов)

Generation Stage (RAG запрос):
Query: "Требования к программам ДПО"
→ Qdrant возвращает chunks из ОРИГИНАЛА:
  - "Статья 76. Дополнительное профессиональное образование..."
  - "Пункт 3. Программы ДПО должны учитывать..."
→ Lesson Generation получает точные цитаты закона, не summary
```

---

### 🤖 Автоматический выбор модели для Analyze

```typescript
interface AnalyzeModelConfig {
  model: string;
  contextWindow: number;
  budgetLimit: number;
  costPer1M: number;
  triggerCondition: string;
}

function selectAnalyzeModel(highPriorityTokens: number): AnalyzeModelConfig {
  if (highPriorityTokens <= 80000) {
    return {
      model: 'openai/gpt-oss-120b',
      contextWindow: 128000,
      budgetLimit: 80000,
      costPer1M: 0.2, // $0.20/1M tokens
      triggerCondition: 'HIGH ≤ 80K (fits in OSS 120B context)',
    };
  } else {
    // Превысили 80K → нужна модель с большим context
    return {
      model: 'google/gemini-2.5-flash',
      contextWindow: 1000000,
      budgetLimit: 400000,
      costPer1M: 0.15, // $0.15/1M tokens (Gemini дешевле!)
      triggerCondition: 'HIGH > 80K (requires 1M context model)',
    };

    // Альтернатива: Claude Sonnet (200K context, $3/1M)
    // return {
    //   model: 'anthropic/claude-3.5-sonnet',
    //   contextWindow: 200000,
    //   budgetLimit: 200000,
    //   costPer1M: 3.00,
    //   triggerCondition: 'HIGH > 80K (prompt caching, better quality)'
    // };
  }
}
```

**Преимущества автовыбора**:

- ✅ **Экономия**: Используем дешёвую модель когда можем (90%+ курсов ≤80K)
- ✅ **Качество**: Автоматически переключаемся на мощную модель при необходимости
- ✅ **Масштабируемость**: Gemini 1M context позволяет обработать до 8 больших HIGH документов (8 × 50K = 400K)
- ✅ **Прозрачность**: Логируем какая модель выбрана и почему

---

## Реализация

### Phase 1: LLM-based Document Classification

**Цель**: Определить priority (HIGH/LOW) и order (1-N) для всех документов

**Файлы**:

- `packages/course-gen-platform/src/services/stage3/document-classifier.ts` (NEW)

**Логика**:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const DocumentClassificationSchema = z.object({
  documents: z.array(
    z.object({
      file_id: z.string().uuid(),
      priority: z.enum(['HIGH', 'LOW']),
      order: z.number().int().positive(),
      importance_score: z.number().min(0).max(1),
      category: z.enum([
        'course_core', // Основной материал курса
        'supplementary', // Дополнительный материал
        'reference', // Справочная информация
        'regulatory', // Нормативные документы
      ]),
      reasoning: z.string().min(10).max(500),
    })
  ),
});

export class DocumentClassifier {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'openai/gpt-oss-20b', // лёгкая модель для классификации
      temperature: 0.3, // низкая температура для стабильности
    });
  }

  async classifyDocuments(
    files: UploadedFile[],
    courseContext: { title: string; topic?: string }
  ): Promise<DocumentClassification[]> {
    // Получить preview каждого документа (первые 1000 символов)
    const filePreviews = await Promise.all(
      files.map(async file => ({
        file_id: file.id,
        filename: file.filename,
        file_size: file.file_size,
        token_count: file.token_count,
        preview: await this.getDocumentPreview(file, 1000),
      }))
    );

    // Промпт для LLM
    const prompt = `
Тема курса: "${courseContext.title}"
${courseContext.topic ? `Описание: ${courseContext.topic}` : ''}

Загружено документов: ${files.length}

ЗАДАЧА: Классифицируй каждый документ по приоритету для создания курса.

КРИТЕРИИ:

**HIGH Priority (ключевые документы)**:
- Документ должен быть использован в курсе ПОЛНОСТЬЮ или ПОЧТИ ПОЛНОСТЬЮ
- Примеры: сборник лекций, учебник, методичка, программа курса, авторские презентации
- Importance score: 0.7-1.0
- Category: course_core или supplementary

**LOW Priority (справочные документы)**:
- Контекстная и справочная информация
- Примеры: законы, ГОСТы, постановления, справочники, дополнительная литература
- Importance score: 0.0-0.69
- Category: reference или regulatory

ДОКУМЕНТЫ:
${filePreviews
  .map(
    (f, idx) => `
${idx + 1}. Файл: ${f.filename}
   Размер: ${f.file_size} bytes (~${f.token_count} tokens)
   Preview:
   ${f.preview}
`
  )
  .join('\n')}

ВЕРНИ JSON:
{
  "documents": [
    {
      "file_id": "uuid",
      "priority": "HIGH" | "LOW",
      "order": 1, // сквозная нумерация 1-N по убыванию важности
      "importance_score": 0.95,
      "category": "course_core",
      "reasoning": "Сборник авторских лекций, составляет основу курса"
    }
  ]
}

ВАЖНО:
- order должен быть СКВОЗНЫМ (1-N) для ВСЕХ документов
- Сортируй по убыванию importance_score
- HIGH документы получают order 1, 2, 3...
- LOW документы получают order 4, 5, 6...
`;

    const response = await this.llm.invoke(prompt);
    const parsed = DocumentClassificationSchema.parse(JSON.parse(response.content));

    return parsed.documents;
  }

  private async getDocumentPreview(file: UploadedFile, maxChars: number): Promise<string> {
    // Читаем первые N символов из файла
    const fullText = await readFileFromStorage(file.storage_path);
    return fullText.substring(0, maxChars);
  }
}
```

**Эвристики (fallback если LLM недоступен)**:

```typescript
function heuristicClassification(
  files: UploadedFile[],
  courseContext: { title: string; topic?: string }
): DocumentClassification[] {
  const scored = files.map(file => {
    let score = 0.5; // базовый балл

    // Эвристика 1: Ключевые слова в названии (HIGH priority)
    const highKeywords = [
      'лекци',
      'учебник',
      'пособие',
      'программа',
      'курс',
      'lecture',
      'textbook',
      'syllabus',
      'curriculum',
      'manual',
    ];
    if (highKeywords.some(kw => file.filename.toLowerCase().includes(kw))) {
      score += 0.3;
    }

    // Эвристика 2: Справочные документы (LOW priority)
    const lowKeywords = [
      'закон',
      'гост',
      'снип',
      'постановление',
      'регламент',
      'law',
      'standard',
      'regulation',
      'decree',
    ];
    if (lowKeywords.some(kw => file.filename.toLowerCase().includes(kw))) {
      score -= 0.3;
    }

    // Эвристика 3: Размер (средние документы часто более структурированы)
    if (file.token_count > 10000 && file.token_count < 60000) {
      score += 0.1;
    }

    // Эвристика 4: Формат (презентации/текстовые важнее)
    const highFormats = ['pptx', 'txt', 'md', 'docx'];
    const ext = file.filename.split('.').pop()?.toLowerCase();
    if (ext && highFormats.includes(ext)) {
      score += 0.1;
    }

    return {
      file_id: file.id,
      priority: score >= 0.7 ? 'HIGH' : 'LOW',
      order: 0, // будет установлен после сортировки
      importance_score: Math.min(1.0, Math.max(0.0, score)),
      category: score >= 0.7 ? 'course_core' : 'reference',
      reasoning: 'Эвристическая оценка (LLM недоступен)',
    };
  });

  // Сортировать по убыванию score и присвоить order
  return scored
    .sort((a, b) => b.importance_score - a.importance_score)
    .map((doc, index) => ({ ...doc, order: index + 1 }));
}
```

---

### Phase 2: Smart Budget Allocation

**Цель**: Распределить токен-бюджет между HIGH и LOW на основе порога 80K

**Файлы**:

- `packages/course-gen-platform/src/services/stage3/budget-allocator.ts` (NEW)

**Логика**:

```typescript
interface BudgetAllocation {
  highBudget: number;
  lowBudget: number;
  analyzeModel: AnalyzeModelConfig;
  totalBudget: number;
}

export class BudgetAllocator {
  allocateBudget(
    highPriorityDocs: DocumentWithPriority[],
    lowPriorityDocs: DocumentWithPriority[]
  ): BudgetAllocation {
    // Посчитать сколько токенов займут HIGH документы (full text)
    const highTokensTotal = highPriorityDocs.reduce((sum, doc) => {
      const docTokens = Math.min(doc.token_count, 50000); // cap at 50K
      return sum + (docTokens <= 50000 ? docTokens : 5000); // summary ~5K
    }, 0);

    // Выбрать модель на основе HIGH total
    const analyzeModel = selectAnalyzeModel(highTokensTotal);

    // Рассчитать бюджеты
    if (highTokensTotal <= 80000) {
      // Сценарий A: Лёгкий курс
      return {
        highBudget: 80000,
        lowBudget: 80000 - highTokensTotal,
        analyzeModel: analyzeModel,
        totalBudget: 80000,
      };
    } else {
      // Сценарий B: Тяжёлый курс
      return {
        highBudget: 400000,
        lowBudget: 400000 - highTokensTotal,
        analyzeModel: analyzeModel,
        totalBudget: 400000,
      };
    }
  }

  // Определить какие LOW документы сохранить целиком
  selectLowFullTextDocs(
    lowDocs: DocumentWithPriority[],
    availableBudget: number
  ): { fullText: string[]; summary: string[] } {
    const fullTextIds: string[] = [];
    const summaryIds: string[] = [];
    let budgetUsed = 0;

    // Сортировать LOW документы по order (важнее сначала)
    const sortedLow = [...lowDocs].sort((a, b) => a.order - b.order);

    for (const doc of sortedLow) {
      // Правило: LOW сохраняем целиком ТОЛЬКО если <3K токенов
      if (doc.token_count < 3000 && budgetUsed + doc.token_count <= availableBudget) {
        fullTextIds.push(doc.file_id);
        budgetUsed += doc.token_count;
      } else {
        // Иначе summary (даже если бюджет есть, но >3K)
        summaryIds.push(doc.file_id);
      }
    }

    return { fullText: fullTextIds, summary: summaryIds };
  }
}
```

---

### Phase 3: Integration into Document Processing Pipeline

**Файлы**:

- `packages/course-gen-platform/src/workers/document-processing.ts` (MODIFY)
- `packages/course-gen-platform/src/orchestrator/generation.ts` (MODIFY)

**Изменения в orchestrator**:

```typescript
// generation.ts - создание job'ов для обработки документов

if (jobType === JobType.DOCUMENT_PROCESSING && uploadedFiles?.length > 0) {
  // ШАГ 1: Классифицировать документы через LLM
  const classifier = new DocumentClassifier();
  const classifications = await classifier.classifyDocuments(uploadedFiles, {
    title: course.course_title,
    topic: course.settings?.topic,
  });

  // ШАГ 2: Разделить на HIGH и LOW
  const highPriorityDocs = classifications.filter(c => c.priority === 'HIGH');
  const lowPriorityDocs = classifications.filter(c => c.priority === 'LOW');

  // ШАГ 3: Рассчитать бюджеты
  const allocator = new BudgetAllocator();
  const budget = allocator.allocateBudget(
    highPriorityDocs.map(c => ({
      ...uploadedFiles.find(f => f.id === c.file_id)!,
      priority: c.priority,
      order: c.order,
      importance_score: c.importance_score,
    })),
    lowPriorityDocs.map(c => ({
      ...uploadedFiles.find(f => f.id === c.file_id)!,
      priority: c.priority,
      order: c.order,
      importance_score: c.importance_score,
    }))
  );

  // ШАГ 4: Определить какие LOW сохранить целиком
  const lowFullTextDecision = allocator.selectLowFullTextDocs(
    lowPriorityDocs.map(c => ({
      ...uploadedFiles.find(f => f.id === c.file_id)!,
      priority: c.priority,
      order: c.order,
    })),
    budget.lowBudget
  );

  // ШАГ 5: Логировать решения
  logger.info(
    {
      totalDocs: uploadedFiles.length,
      highPriorityCount: highPriorityDocs.length,
      lowPriorityCount: lowPriorityDocs.length,
      highBudget: budget.highBudget,
      lowBudget: budget.lowBudget,
      analyzeModel: budget.analyzeModel.model,
      lowFullTextCount: lowFullTextDecision.fullText.length,
    },
    'Document budget allocation completed'
  );

  // ШАГ 6: Создать job'ы в правильном порядке (order 1-N)
  const sortedClassifications = classifications.sort((a, b) => a.order - b.order);

  for (const classification of sortedClassifications) {
    const file = uploadedFiles.find(f => f.id === classification.file_id);
    if (!file) continue;

    // Определить режим обработки
    let processingMode: 'full_text' | 'summary';

    if (classification.priority === 'HIGH' && file.token_count <= 50000) {
      processingMode = 'full_text';
    } else if (
      classification.priority === 'LOW' &&
      file.token_count < 3000 &&
      lowFullTextDecision.fullText.includes(file.id)
    ) {
      processingMode = 'full_text';
    } else {
      processingMode = 'summary';
    }

    const jobData: DocumentProcessingJobData = {
      ...existingJobData,
      // НОВЫЕ ПОЛЯ:
      priority: classification.priority,
      order: classification.order,
      importance_score: classification.importance_score,
      category: classification.category,
      processing_mode: processingMode,
      budget_allocation: {
        high_budget: budget.highBudget,
        low_budget: budget.lowBudget,
        analyze_model: budget.analyzeModel.model,
      },
    };

    // Варьировать priority в BullMQ на основе order
    const queuePriority = calculateQueuePriority(TIER_PRIORITY[tier], classification.order);

    const job = await addJob(JobType.DOCUMENT_PROCESSING, jobData, {
      priority: queuePriority,
    });

    jobIds.push(job.id as string);

    logger.info(
      {
        fileId: file.id,
        filename: file.filename,
        priority: classification.priority,
        order: classification.order,
        processingMode: processingMode,
        queuePriority: queuePriority,
      },
      'Document processing job created'
    );
  }

  // ШАГ 7: Сохранить metadata о выборе модели для Analyze Stage
  await db.courses.update({
    where: { id: courseId },
    data: {
      settings: {
        ...course.settings,
        analyze_model: budget.analyzeModel.model,
        analyze_budget: budget.totalBudget,
        document_classification: {
          high_count: highPriorityDocs.length,
          low_count: lowPriorityDocs.length,
          total_budget: budget.totalBudget,
        },
      },
    },
  });
}
```

**Функция приоритизации в очереди**:

```typescript
function calculateQueuePriority(
  basePriority: number, // от tier (1-10)
  documentOrder: number // 1-N
): number {
  // Формула: basePriority + бонус за важность
  // Документы с меньшим order (важнее) получают больший бонус
  // order=1 → bonus=10, order=5 → bonus=6, order=10 → bonus=1
  const orderBonus = Math.max(1, 11 - documentOrder);

  return basePriority + orderBonus;
}

// Примеры:
// FREE tier (priority=1) + order=1 (самый важный) = 1 + 10 = 11
// FREE tier (priority=1) + order=10 = 1 + 1 = 2
// PREMIUM tier (priority=10) + order=1 = 10 + 10 = 20
// PREMIUM tier (priority=10) + order=5 = 10 + 6 = 16
```

---

### Phase 4: Vectorization from Original Text

**Файлы**:

- `packages/course-gen-platform/src/workers/document-processing.ts` (MODIFY)

**Изменения**:

```typescript
// document-processing.ts worker

async function processDocument(job: Job<DocumentProcessingJobData>) {
  const { file_id, processing_mode, priority, order } = job.data;

  // 1. Читаем полный оригинальный текст
  const fullText = await readDocumentFromStorage(file_id);
  const tokenCount = estimateTokens(fullText);

  logger.info(
    {
      fileId: file_id,
      priority: priority,
      order: order,
      tokenCount: tokenCount,
      processingMode: processing_mode,
    },
    'Processing document'
  );

  // 2. Определяем что сохранить для Analyze context
  let analyzeContent: string;

  if (processing_mode === 'full_text') {
    analyzeContent = fullText;
    logger.info({ fileId: file_id }, 'Using full text for Analyze');
  } else {
    // Создать summary (Map-Reduce)
    analyzeContent = await createDocumentSummary(fullText, {
      strategy: 'map-reduce',
      targetTokens: tokenCount > 100000 ? 10000 : 5000,
    });
    logger.info(
      {
        fileId: file_id,
        originalTokens: tokenCount,
        summaryTokens: estimateTokens(analyzeContent),
      },
      'Created summary for Analyze'
    );
  }

  // 3. ВЕКТОРИЗАЦИЯ ВСЕГДА ИЗ ОРИГИНАЛА (не summary!)
  const vectors = await vectorizeDocument({
    text: fullText, // ← КРИТИЧНО: используем fullText, не analyzeContent!
    fileId: file_id,
    chunkConfig: {
      childChunkSize: 400, // tokens
      parentChunkSize: 1500, // tokens
      strategy: 'hierarchical',
      preserveHeadings: true,
    },
    metadata: {
      file_id: file_id,
      priority: priority,
      order: order,
      importance_score: job.data.importance_score,
      category: job.data.category,
      processing_mode: processing_mode,
    },
  });

  logger.info(
    {
      fileId: file_id,
      vectorsCreated: vectors.length,
      sourceText: 'ORIGINAL', // подтверждаем что из оригинала
    },
    'Vectorization completed'
  );

  // 4. Сохранить в БД
  await db.file_catalog.update({
    where: { id: file_id },
    data: {
      vectorized: true,
      summary: analyzeContent, // для Analyze Stage
      token_count: tokenCount,
      processing_metadata: {
        priority: priority,
        order: order,
        processing_mode: processing_mode,
        analyze_content_tokens: estimateTokens(analyzeContent),
        vectors_count: vectors.length,
        vectorized_from: 'original_text', // мета-информация
      },
    },
  });

  logger.info({ fileId: file_id }, 'Document processing completed');
}
```

---

### Phase 5: Analyze Stage Integration

**Файлы**:

- `packages/course-gen-platform/src/services/stage4/analyze-orchestrator.ts` (MODIFY)

**Изменения**:

```typescript
// analyze-orchestrator.ts

async function buildAnalyzeContext(courseId: string): Promise<string> {
  // 1. Получить документы с их metadata
  const documents = await db.file_catalog.findMany({
    where: { course_id: courseId, vectorized: true },
    orderBy: { processing_metadata: { order: 'asc' } }, // по order!
    select: {
      id: true,
      filename: true,
      summary: true, // analyze_content (full или summary)
      token_count: true,
      processing_metadata: true,
    },
  });

  // 2. Получить выбранную модель из course settings
  const course = await db.courses.findUnique({
    where: { id: courseId },
    select: { settings: true },
  });

  const analyzeModel = course?.settings?.analyze_model || 'openai/gpt-oss-120b';
  const analyzeBudget = course?.settings?.analyze_budget || 80000;

  logger.info(
    {
      courseId: courseId,
      documentsCount: documents.length,
      analyzeModel: analyzeModel,
      analyzeBudget: analyzeBudget,
    },
    'Building Analyze context'
  );

  // 3. Собрать контекст из summary (или full text)
  let contextParts: string[] = [];
  let totalTokens = 0;

  for (const doc of documents) {
    const docPriority = doc.processing_metadata?.priority || 'LOW';
    const docOrder = doc.processing_metadata?.order || 999;

    contextParts.push(`
[Документ ${docOrder}] ${doc.filename} (${docPriority} priority)
${doc.summary}
---
`);

    totalTokens += estimateTokens(doc.summary);
  }

  logger.info(
    {
      courseId: courseId,
      totalTokens: totalTokens,
      budgetLimit: analyzeBudget,
      budgetUtilization: ((totalTokens / analyzeBudget) * 100).toFixed(1) + '%',
    },
    'Analyze context built'
  );

  // 4. Проверить что не превысили бюджет
  if (totalTokens > analyzeBudget) {
    logger.warn(
      {
        courseId: courseId,
        totalTokens: totalTokens,
        budgetLimit: analyzeBudget,
        overflow: totalTokens - analyzeBudget,
      },
      'Analyze context exceeds budget - truncating'
    );

    // Truncate до бюджета (приоритет за HIGH документами с меньшим order)
    // TODO: implement smart truncation
  }

  return contextParts.join('\n');
}
```

---

## Ожидаемые результаты

### 📊 Метрики успеха

**Качество**:

- ✅ **90%+ курсов используют дешёвую модель** (HIGH ≤ 80K)
- ✅ **100% ключевых документов** сохранены полностью (если ≤50K)
- ✅ **RAG качество +20%**: векторы из оригинала, не summary

**Стоимость**:

- ✅ **Экономия 60-80%** на лёгких курсах (OSS 120B vs Gemini)
- ✅ **Прозрачность расходов**: логируем модель и причину выбора

**Производительность**:

- ✅ **Время обработки -30%**: приоритизация обрабатывает важное первым
- ✅ **Пользовательский опыт**: видят прогресс по ключевым документам раньше

---

## Стоимость реализации

**Effort**: 3-4 дня (1 senior developer)

**Breakdown**:

- Phase 1 (LLM Classification): 1 день
- Phase 2 (Budget Allocator): 0.5 дня
- Phase 3 (Pipeline Integration): 1 день
- Phase 4 (Vectorization Fix): 0.5 день
- Phase 5 (Analyze Integration): 0.5 дня
- Testing: 0.5 дня

**ROI**:

- Экономия: ~$0.10 per course (200K → 80K tokens average)
- Volume: 1000 courses/month → **$100/month savings**
- Quality improvement: Priceless (RAG из оригиналов)

---

## Migration Plan

### Обратная совместимость

**Existing courses** (already processed):

- ✅ Продолжают работать с текущими summary
- ✅ Не требуют reprocessing
- ✅ Можно опционально reprocess для улучшения качества

**New courses** (after deployment):

- ✅ Автоматически используют новую систему
- ✅ Classification + Budget allocation + Vectorization из оригинала

### Rollout Strategy

**Phase 1**: Soft launch (1 week)

- Deploy to TRIAL tier only
- Monitor metrics: model selection, budget usage, quality scores
- Fix bugs if any

**Phase 2**: Gradual rollout (1 week)

- Deploy to FREE + BASIC tiers
- Compare A/B: old vs new system
- Validate cost savings

**Phase 3**: Full production (ongoing)

- Deploy to all tiers
- Continuous monitoring
- Fine-tune LLM prompts based on data

---

## FAQ

### Q: Что если пользователь загрузит 20 HIGH документов по 50K каждый?

**A**: 20 × 50K = 1M tokens — превышает 400K бюджет.

**Решение**:

- Первые 8 документов (order 1-8): full text (8 × 50K = 400K)
- Документы 9-20: summary (~5K каждый, 12 × 5K = 60K)
- Логируем warning: "Некоторые HIGH документы сокращены из-за превышения бюджета"
- Предлагаем пользователю выбрать 8 самых важных (опционально, future UX)

### Q: Можно ли вручную переопределить priority?

**A**: В текущей версии — нет (автоматическая классификация).

**Future enhancement**: Добавить UI для manual override:

- User видит LLM-определённый priority
- Может изменить HIGH ↔ LOW
- Может изменить order (drag-and-drop)
- Reprocessing с новыми приоритетами

### Q: Как LLM определяет HIGH vs LOW для нетипичных документов?

**A**: LLM анализирует:

1. **Содержание preview** (первые 1000 символов)
2. **Название файла** (контекстные подсказки)
3. **Размер файла** (эвристика: лекции часто 10-60K tokens)
4. **Тема курса** (релевантность контента)

**Пример**:

```
Курс: "Введение в машинное обучение"
Документ: "ГОСТ Р 59276-2020 Искусственный интеллект.pdf" (120K tokens)

LLM reasoning:
- Preview содержит определения AI терминов (релевантно)
- Название указывает на нормативный документ (LOW)
- Размер большой (120K), вряд ли весь нужен для курса
- Вердикт: LOW priority, order=8 (полезен как справочник)
```

### Q: Что происходит с векторами при reprocessing?

**A**:

- Старые векторы удаляются из Qdrant
- Создаются новые векторы из оригинала
- File catalog обновляется с новыми metadata
- Analyze Stage может использовать старый или новый контекст (опция)

---

## References

- Original proposal: `/home/me/code/megacampus2/docs/FUTURE/FUTURE-ENHANCEMENT-DOCUMENT-PRIORITIZATION.md` (v1.0.0)
- Stage 3 Document Processing: `specs/004-stage-3-create-summary/`
- Stage 4 Analyze: `specs/007-stage-4-analyze/`
- RAG Implementation: `docs/research/RAG1.md`
- Token Budget Research: `specs/007-stage-4-analyze/T055-CONTINUATION-CONTEXT.md`

---

**Status**: 💡 READY FOR IMPLEMENTATION
**Next Steps**: Review → Approve → Create tasks → Implement Phase 1
**Owner**: Backend Team + LLM Team collaboration

**Version**: 2.0.0
**Created**: 2025-11-04 (v1.0.0 by developer)
**Updated**: 2025-11-06 (v2.0.0 major redesign with two-tier system)
