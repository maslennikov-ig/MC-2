# Docling A/B — stageA-final-baseline

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `baseline` · кандидат: `docling_hybrid`

Serve memory: 2.298GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   232548 |   132019 |    20 |      11/11 |
| numbered-sections-pdf    | passed |     1268 |      558 |     1 |      10/10 |
| hierarchy-docx           | passed |      256 |      572 |     1 |      10/10 |
| structured-docx          | passed |      294 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      231 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |     8571 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |     3245 |        7 |     1 |        1/1 |

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
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |      0.31 / 0.81 | 0.50 |   0.50 | 14690 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           197 |         100% | 100% |      100% |      0.22 / 0.78 | 0.50 |   0.42 |  3800 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           254 |         100% | 100% |      100% |      0.47 / 0.78 | 0.67 |   0.57 |  3636 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1429 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3323 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3302 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1458 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3566 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3469 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1457 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3453 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  3378 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1527 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |      1.00 / 1.00 | 0.33 |   0.50 |  3313 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3303 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  1349 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3441 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  3359 |

## Проваленные проверки

Нет.

## Dense+sparse retrieval (реальные jina-embeddings-v3)

Тот же production-путь: late chunking для children, server-side BM25 + dense prefetch,
RRF, поиск через `searchChunks({enable_hybrid:true})` во временной коллекции с
production-схемой (включая payload-индексы: без них strict mode отклоняет фильтр и hybrid молча падает в dense-only). Оплачено токенов в этом прогоне: 0.

| Case                  | Strategy             | R@5 факт/потолок |  MRR | nDCG@5 |
| --------------------- | -------------------- | ---------------: | ---: | -----: |
| scientific-pdf        | legacy_markdown      |      0.31 / 0.81 | 0.50 |   0.50 |
| scientific-pdf        | docling_hierarchical |      0.22 / 0.78 | 0.50 |   0.43 |
| scientific-pdf        | docling_hybrid       |      0.53 / 0.78 | 0.67 |   0.65 |
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

- scientific-pdf · docling_hierarchical (не кандидат, lexical): sci-hypothesis/relevant-in-top-k 5→4; sci-hypothesis/ndcg@k 1.000→0.830
- scientific-pdf · docling_hybrid (кандидат, не блокирует, lexical): sci-hypothesis/relevant-in-top-k 5→4; sci-hypothesis/ndcg@k 1.000→0.830
- scientific-pdf · docling_hierarchical (не кандидат, dense): sci-hypothesis/relevant-in-top-k 5→4; sci-hypothesis/ndcg@k 1.000→0.869
- reading-order-pptx · docling_hierarchical (не кандидат, lexical): pptx-steps/mrr 1.000→0.333; pptx-steps/ndcg@k 1.000→0.500
- reading-order-pptx · docling_hierarchical (не кандидат, dense): pptx-steps/mrr 1.000→0.500; pptx-steps/ndcg@k 1.000→0.631
