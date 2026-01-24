# План: Исправление отсутствия realtime обновления UI при завершении этапа

**Проблема**: После завершения Stage 4 (и других этапов) кнопка подтверждения и результаты не появляются автоматически. Требуется ручное обновление страницы (F5).

**Курс**: VQF-4278 (но проблема системная)

## Корневая причина

### Архитектура данных

1. **`pipelineStatus`** (generation_status) — обновляется через Supabase Realtime при UPDATE на `courses` таблице. **Работает корректно**.

2. **`analysisResult`** (analysis_result) — загружается один раз при монтировании `GraphView` и **НЕ обновляется** при realtime событиях.

### Путь данных

```
GraphView.tsx:430-468
  ├─ fetchCourseStructure() — выполняется один раз при mount
  ├─ SELECT analysis_result, visual_style, style FROM courses
  ├─ setAnalysisResult(parsed)
  └─ Передаётся в StaticGraphProvider → Stage4OutputTab
```

### Почему не работает

1. Backend завершает Stage 4 → устанавливает `generation_status = 'stage_4_awaiting_approval'` + `analysis_result = {...}`
2. Realtime event UPDATE приходит → `pipelineStatus` обновляется
3. **НО** `analysisResult` state остаётся `null` (нет refetch)
4. `Stage4OutputTab` показывает спиннер "Результаты анализа появятся здесь"
5. После F5 → свежий SELECT → данные появляются

### Существующий паттерн

В `GraphView.tsx:498-566` уже есть refetch для `stage_5_complete`:

```typescript
useEffect(() => {
  const wasNotComplete = prevPipelineStatus.current !== 'stage_5_complete';
  const isNowComplete = pipelineStatus === 'stage_5_complete';

  if (wasNotComplete && isNowComplete) {
    courseStructureInitialized.current = false;
    // Fetch fresh course structure...
  }
});
```

## Решение

Добавить аналогичный useEffect для refetch данных курса при переходе в `awaiting_approval` статусы.

## Изменения

### Файл: `packages/web/components/generation-graph/GraphView.tsx`

**Добавить новый useEffect после существующего refetch для stage_5_complete (около строки 566):**

```typescript
// Re-fetch course data (analysis_result, visual_style, style) when stage transitions to awaiting_approval
// This ensures results appear immediately without manual page refresh
useEffect(() => {
  const awaitingStatuses = [
    'stage_3_awaiting_approval',
    'stage_4_awaiting_approval',
    'stage_5_awaiting_approval',
  ];

  const wasNotAwaiting = !awaitingStatuses.includes(prevPipelineStatus.current || '');
  const isNowAwaiting = awaitingStatuses.includes(pipelineStatus || '');

  // Update ref for next comparison (done in existing effect, but needed here too)
  // Note: prevPipelineStatus is already updated in the stage_5_complete effect above

  if (wasNotAwaiting && isNowAwaiting) {
    const fetchCourseData = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('courses')
        .select('analysis_result, visual_style, style')
        .eq('id', courseId)
        .single();

      if (error) {
        console.error('[GraphView] Failed to fetch course data on awaiting:', error);
        return;
      }

      if (data?.analysis_result) {
        const parsed = parseAnalysisResult(data.analysis_result);
        if (parsed) {
          setAnalysisResult(parsed);
        }
      }

      if (data?.visual_style && isVisualStyle(data.visual_style)) {
        setVisualStyle(data.visual_style);
      }

      if (data?.style) {
        setCourseStyle(data.style);
      }
    };

    fetchCourseData();
  }
}, [pipelineStatus, courseId]);
```

## Логика решения

1. При переходе `pipelineStatus` в любой `awaiting_approval` статус
2. Делается SELECT свежих данных из `courses`
3. Обновляются state: `analysisResult`, `visualStyle`, `courseStyle`
4. React перерисовывает компоненты с новыми данными
5. `Stage4OutputTab` получает `courseInfo.analysisResult` и показывает результаты
6. `NodeDetailsDrawer` видит `isAwaitingApproval = true` и показывает кнопку

## Проверка

1. Запустить генерацию курса до Stage 4
2. Дождаться завершения Stage 4 (статус `stage_4_awaiting_approval`)
3. **Без F5** должны появиться:
   - Результаты анализа во вкладке "Результат"
   - Кнопка "Подтвердить и продолжить"
4. Проверить консоль браузера — не должно быть ошибок
5. Повторить для Stage 3 и Stage 5

## Альтернативные подходы (отклонены)

1. **Использовать React Query с invalidation** — требует значительный рефакторинг
2. **Подписаться на realtime для всех полей courses** — избыточно, большой payload
3. **Polling каждые N секунд** — неэффективно, лишняя нагрузка

Выбранный подход минимален и следует существующему паттерну в кодовой базе.
