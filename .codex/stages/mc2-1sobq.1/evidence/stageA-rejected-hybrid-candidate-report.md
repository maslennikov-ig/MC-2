# Docling A/B — stageA-corrected-baseline

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `baseline` · кандидат: `docling_hybrid`

Serve memory: 3.11GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | failed |   241225 |   132019 |    20 |      10/11 |
| numbered-sections-pdf    | passed |     1219 |      558 |     1 |      10/10 |
| hierarchy-docx           | passed |      251 |      572 |     1 |      10/10 |
| structured-docx          | passed |      226 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      228 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |     9196 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |     3067 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

Колонка `R@5` — «факт / потолок». Потолок = `min(релевантных, 5) / релевантных`:
стратегия, которая режет тот же документ мельче, механически снижает свой
собственный потолок, поэтому Recall@5 между стратегиями напрямую не сравним,
и выбор кандидата опирается на ранговые метрики и на отсутствие регрессий.

Регрессией считается падение больше 0.01 по любой из трёх метрик на любом контрольном вопросе.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | R@5 факт/потолок |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---------------: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |      0.31 / 0.81 | 0.50 |   0.50 | 11580 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           197 |         100% | 100% |      100% |      0.22 / 0.78 | 0.50 |   0.42 |  2275 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           254 |         100% | 100% |      100% |      0.47 / 0.78 | 0.67 |   0.57 |  2192 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    64 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2043 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2040 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    67 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2038 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2039 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    66 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2045 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2040 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    66 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |      1.00 / 1.00 | 0.33 |   0.50 |  2039 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2038 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    65 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2038 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2039 |

## Проваленные проверки

- scientific-pdf · no-retrieval-regression:docling_hybrid: regressed: sci-hypothesis/recall@5 0.625→0.444; sci-hypothesis/ndcg@5 1.000→0.830

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат): sci-hypothesis/recall@5 0.625→0.444; sci-hypothesis/ndcg@5 1.000→0.830
- reading-order-pptx · docling_hierarchical (не кандидат): pptx-steps/mrr 1.000→0.333; pptx-steps/ndcg@5 1.000→0.500
