# Docling A/B — dense-atoms-baseline

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `baseline` · кандидат: `docling_hybrid`

Serve memory: 2.853GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |      557 |   132019 |    20 |      11/11 |
| numbered-sections-pdf    | passed |      146 |      558 |     1 |      10/10 |
| hierarchy-docx           | passed |      105 |      572 |     1 |      10/10 |
| structured-docx          | passed |      144 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      140 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |      102 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |       87 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Метрики этой таблицы — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

`Atoms@5` — доля ОБЪЯВЛЕННЫХ фактов вопроса, покрытых top-5. `aMRR` и `aDCG` —
те же атомы со скидкой за ранг (`1/rank` и `1/log2(rank+1)`), усреднённые по тому
же фиксированному знаменателю. Знаменатель одинаков для всех стратегий, а
повторное попадание одного и того же факта в пять чанков считается один раз.

Колонка `R@5` — «факт / потолок» на уровне чанков. Оставлена как описание:
и числитель, и знаменатель зависят от того, насколько мелко стратегия режет
документ, поэтому она не входит в gate и не сравнима между стратегиями.

Регрессия — падение atom-coverage, aMRR или aDCG на любом контрольном вопросе; допуск 1e-9 покрывает только погрешность представления чисел. Исчезнувший вопрос тоже регрессия. Атом, который не несёт ни один чанк стратегии (факт разрезан границей), попадает в `unreachableAtoms` и одновременно снижает coverage.
Блокирует dense+sparse канал (это и есть production-ранжирование); лексический прокси — наблюдение.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | Atoms@5 | aMRR | aDCG | R@5 факт/потолок |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ------: | ---: | ---: | ---------------: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |    0.75 | 0.56 | 0.61 |      0.38 / 0.63 | 13376 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           197 |         100% | 100% |      100% |    0.50 | 0.50 | 0.50 |      0.22 / 0.59 |  3626 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           254 |         100% | 100% |      100% |    1.00 | 0.67 | 0.75 |      0.29 / 0.63 |  4102 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  1307 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            30 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3213 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            30 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3169 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  1335 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3268 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3242 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  1271 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3235 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3323 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  1295 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |    1.00 | 0.29 | 0.47 |      1.00 / 1.00 |  3235 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3305 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  1321 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3276 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  3219 |

Полные ранжированные списки chunk id и посписочный статус каждого атома —
в `metrics.json` (`strategies[].retrieval.questions[].rankedChunkIds` и
`.atoms`). Утверждение «те же чанки в том же порядке» проверяется по ним.

## Проваленные проверки

Нет.

## Dense+sparse retrieval (реальные jina-embeddings-v3)

Тот же production-путь: один вызов `generateEmbeddingsWithLateChunking(chunks,
'retrieval.passage', true)` на все чанки — ровно как в `phase-5-embedding.ts`,
server-side BM25 + dense prefetch, RRF, поиск через `searchChunks({enable_hybrid:true})`
во временной коллекции с
production-схемой (включая payload-индексы: без них strict mode отклоняет фильтр и hybrid молча падает в dense-only). Кэш эмбеддингов изолирован в namespace `embedding-bench:dense-atoms-baseline`. Оплачено токенов в этом прогоне: 2026.

| Case                  | Strategy             | Atoms@5 | aMRR | aDCG | R@5 факт/потолок |
| --------------------- | -------------------- | ------: | ---: | ---: | ---------------: |
| scientific-pdf        | legacy_markdown      |    0.50 | 0.50 | 0.50 |      0.19 / 0.63 |
| scientific-pdf        | docling_hierarchical |    0.50 | 0.50 | 0.50 |      0.17 / 0.59 |
| scientific-pdf        | docling_hybrid       |    1.00 | 0.67 | 0.75 |      0.35 / 0.63 |
| numbered-sections-pdf | legacy_markdown      |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| numbered-sections-pdf | docling_hierarchical |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| numbered-sections-pdf | docling_hybrid       |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| hierarchy-docx        | legacy_markdown      |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| hierarchy-docx        | docling_hierarchical |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| hierarchy-docx        | docling_hybrid       |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| structured-docx       | legacy_markdown      |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| structured-docx       | docling_hierarchical |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| structured-docx       | docling_hybrid       |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| reading-order-pptx    | legacy_markdown      |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| reading-order-pptx    | docling_hierarchical |    1.00 | 0.42 | 0.57 |      1.00 / 1.00 |
| reading-order-pptx    | docling_hybrid       |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| russian-raster-ocr    | legacy_markdown      |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| russian-raster-ocr    | docling_hierarchical |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |
| russian-raster-ocr    | docling_hybrid       |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат, lexical): sci-accuracy-drop/atom-coverage 0.500→0.000; sci-accuracy-drop/atom-mrr 0.125→0.000; sci-accuracy-drop/atom-dcg 0.215→0.000
- reading-order-pptx · docling_hierarchical (не кандидат, lexical): pptx-steps/atom-mrr 1.000→0.292; pptx-steps/atom-dcg 1.000→0.465
- reading-order-pptx · docling_hierarchical (не кандидат, dense): pptx-steps/atom-mrr 1.000→0.417; pptx-steps/atom-dcg 1.000→0.565
