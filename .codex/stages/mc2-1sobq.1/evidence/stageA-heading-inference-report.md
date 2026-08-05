# Docling A/B — stageA-final-heading-inference

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `pdf-heading-hierarchy` · кандидат: `docling_hybrid`

Serve memory: 2.887GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   447721 |   132021 |    20 |      11/11 |
| numbered-sections-pdf    | passed |     4019 |      562 |     1 |      10/10 |
| hierarchy-docx           | passed |      267 |      572 |     1 |      10/10 |
| structured-docx          | passed |      226 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      215 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |     8615 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |     3164 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

Колонка `R@5` — «факт / потолок». Потолок = `min(релевантных, 5) / релевантных`:
стратегия, которая режет тот же документ мельче, механически снижает свой
собственный потолок, поэтому Recall@5 между стратегиями напрямую не сравним,
и выбор кандидата опирается на ранговые метрики и на отсутствие регрессий.

Регрессия — падение числа релевантных чанков в top-5, MRR или nDCG@5 на любом контрольном вопросе; допуск 1e-9 покрывает только погрешность представления чисел. Исчезнувший вопрос тоже регрессия. Отношение Recall@5 не входит в gate: его знаменатель зависит от того, насколько мелко стратегия режет документ, а не от качества выдачи.
Блокирует dense+sparse канал (это и есть production-ранжирование); лексический прокси — наблюдение.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | R@5 факт/потолок |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---------------: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |      0.31 / 0.81 | 0.50 |   0.50 | 13734 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           199 |         100% | 100% |      100% |      0.05 / 0.56 | 0.50 |   0.39 |  3702 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           256 |         100% | 100% |      100% |      0.32 / 0.59 | 0.67 |   0.58 |  7611 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1383 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            35 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3296 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            35 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3325 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1485 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3369 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3325 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1338 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3329 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3316 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1324 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |      1.00 / 1.00 | 0.33 |   0.50 |  3291 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3278 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1342 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3310 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3293 |

## Проваленные проверки

Нет.

## Dense+sparse retrieval (реальные jina-embeddings-v3)

Тот же production-путь: late chunking для children, server-side BM25 + dense prefetch,
RRF, поиск через `searchChunks({enable_hybrid:true})` во временной коллекции с
production-схемой (включая payload-индексы: без них strict mode отклоняет фильтр и hybrid молча падает в dense-only). Оплачено токенов в этом прогоне: 0.

| Case                  | Strategy             | R@5 факт/потолок |  MRR | nDCG@5 |
| --------------------- | -------------------- | ---------------: | ---: | -----: |
| scientific-pdf        | legacy_markdown      |      0.31 / 0.81 | 0.50 |   0.50 |
| scientific-pdf        | docling_hierarchical |      0.04 / 0.56 | 0.50 |   0.35 |
| scientific-pdf        | docling_hybrid       |      0.34 / 0.59 | 1.00 |   0.81 |
| numbered-sections-pdf | legacy_markdown      |      1.00 / 1.00 | 1.00 |   1.00 |
| numbered-sections-pdf | docling_hierarchical |      1.00 / 1.00 | 1.00 |   1.00 |
| numbered-sections-pdf | docling_hybrid       |      1.00 / 1.00 | 1.00 |   1.00 |
| hierarchy-docx        | legacy_markdown      |      1.00 / 1.00 | 1.00 |   1.00 |
| hierarchy-docx        | docling_hierarchical |      1.00 / 1.00 | 1.00 |   1.00 |
| hierarchy-docx        | docling_hybrid       |      1.00 / 1.00 | 1.00 |   1.00 |
| structured-docx       | legacy_markdown      |      1.00 / 1.00 | 1.00 |   1.00 |
| structured-docx       | docling_hierarchical |      1.00 / 1.00 | 1.00 |   1.00 |
| structured-docx       | docling_hybrid       |      1.00 / 1.00 | 1.00 |   1.00 |
| reading-order-pptx    | legacy_markdown      |      1.00 / 1.00 | 1.00 |   1.00 |
| reading-order-pptx    | docling_hierarchical |      1.00 / 1.00 | 0.50 |   0.63 |
| reading-order-pptx    | docling_hybrid       |      1.00 / 1.00 | 1.00 |   1.00 |
| russian-raster-ocr    | legacy_markdown      |      1.00 / 1.00 | 1.00 |   1.00 |
| russian-raster-ocr    | docling_hierarchical |      1.00 / 1.00 | 1.00 |   1.00 |
| russian-raster-ocr    | docling_hybrid       |      1.00 / 1.00 | 1.00 |   1.00 |

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат, lexical): sci-hypothesis/relevant-in-top-k 5→4; sci-hypothesis/ndcg@k 1.000→0.786
- scientific-pdf · docling_hybrid (кандидат, не блокирует, lexical): sci-hypothesis/relevant-in-top-k 5→4; sci-hypothesis/ndcg@k 1.000→0.854
- scientific-pdf · docling_hierarchical (не кандидат, dense): sci-hypothesis/relevant-in-top-k 5→3; sci-hypothesis/ndcg@k 1.000→0.699
- reading-order-pptx · docling_hierarchical (не кандидат, lexical): pptx-steps/mrr 1.000→0.333; pptx-steps/ndcg@k 1.000→0.500
- reading-order-pptx · docling_hierarchical (не кандидат, dense): pptx-steps/mrr 1.000→0.500; pptx-steps/ndcg@k 1.000→0.631
