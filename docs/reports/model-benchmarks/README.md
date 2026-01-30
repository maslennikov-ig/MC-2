# LLM Model Benchmarks

Централизованная система оценки качества LLM моделей для генерации контента курсов.

## Структура

```
model-benchmarks/
├── README.md              # Этот файл - методология
├── LEADERBOARD.md         # Автогенерируемый рейтинг (pnpm benchmark-llm generate-markdown)
└── 2026-01/               # Ежемесячные отчёты
    ├── summary.md         # Сводка за месяц
    └── model-name.json    # Детальные результаты модели
```

## Content Quality Score (CQS)

Основная метрика качества контента, основанная на эвристических фильтрах из `stage6-lesson-content/judge/heuristic-filter.ts`.

### Веса фильтров

| Фильтр                        | Вес | Тип      | Описание                                                |
| ----------------------------- | --- | -------- | ------------------------------------------------------- |
| **promptMarkers**             | 15% | CRITICAL | Детекция LLM галлюцинаций (маркеры промптов в контенте) |
| **languageConsistency**       | 12% | CRITICAL | Консистентность языка (CJK в русском тексте и т.д.)     |
| **markdownStructure**         | 10% | HIGH     | Валидность markdown структуры                           |
| **sectionDuplication**        | 9%  | HIGH     | Детекция дублирующихся секций                           |
| **mermaidSyntax**             | 8%  | HIGH     | Валидность Mermaid диаграмм                             |
| **fleschKincaid**             | 8%  | STANDARD | Читаемость (для англ. контента)                         |
| **wordCount**                 | 7%  | STANDARD | Длина контента                                          |
| **sections**                  | 7%  | STANDARD | Наличие обязательных секций                             |
| **keywordCoverage**           | 7%  | STANDARD | Покрытие ключевых терминов                              |
| **learningObjectiveCoverage** | 7%  | STANDARD | Покрытие learning objectives                            |
| **contentDensity**            | 5%  | STANDARD | Плотность контента по секциям                           |
| **prohibitedTerms**           | 5%  | STANDARD | Отсутствие запрещённых терминов                         |

**Критические проверки (27% веса):**

- `promptMarkers` - любой маркер = 0 баллов
- `languageConsistency` - zero tolerance для CJK в русском

## Tier система

| Tier  | Score  | Рекомендация                              |
| ----- | ------ | ----------------------------------------- |
| **S** | >= 95% | Primary model - использовать как основную |
| **A** | 85-94% | Production - готов для продакшена         |
| **B** | 75-84% | With review - требует ревью результатов   |
| **C** | 60-74% | Fallback only - только как резервный      |
| **D** | < 60%  | Do not use - не использовать              |

## CLI команды

```bash
# Миграция существующих данных
pnpm benchmark-llm migrate --dry-run    # Предпросмотр
pnpm benchmark-llm migrate              # Выполнить миграцию

# Просмотр рейтинга
pnpm benchmark-llm leaderboard          # Из Supabase
pnpm benchmark-llm leaderboard --local  # Из локальных файлов
pnpm benchmark-llm leaderboard --json   # Вывод в JSON

# Детали модели
pnpm benchmark-llm show deepseek-v32-exp

# Сравнение моделей
pnpm benchmark-llm compare deepseek-v32-exp kimi-k2-0905

# Генерация LEADERBOARD.md
pnpm benchmark-llm generate-markdown
```

## База данных

Таблицы в Supabase:

- `llm_model_benchmarks` - агрегированные результаты по модели/дате
- `llm_benchmark_runs` - детальные результаты отдельных запусков
- `llm_model_leaderboard` - view для отображения рейтинга

## Источники данных

1. **Исторические данные**: `specs/008-generation-generation-json/quality-tests/`
2. **Новые тесты**: результаты Stage 6 generation с `runHeuristicFilters()`

## Лучшие практики

1. **При добавлении новой модели:**
   - Запустить минимум 3 run'а на каждый сценарий (lesson-en, lesson-ru, metadata-en, metadata-ru)
   - Проверить error rate < 10%
   - Если tier < A, добавить в fallback chain

2. **При обновлении промптов:**
   - Перезапустить бенчмарки для ключевых моделей
   - Сравнить с предыдущими результатами

3. **Мониторинг:**
   - Ежемесячные проверки S-tier моделей
   - Алерт при деградации качества > 5%
