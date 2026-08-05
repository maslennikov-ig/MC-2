# Docling A/B — stageA-corrected-heading-inference

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `pdf-heading-hierarchy` · кандидат: `none`

Кандидат не назначен: ни одна стратегия не предлагается в качестве
default, поэтому блокирующая проверка регрессий не применяется, а все
стратегии записаны как наблюдения.

Serve memory: 2.957GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   414403 |   132021 |    20 |      10/10 |
| numbered-sections-pdf    | passed |     3792 |      562 |     1 |        9/9 |
| hierarchy-docx           | passed |      188 |      572 |     1 |        9/9 |
| structured-docx          | passed |      221 |      500 |     1 |      13/13 |
| reading-order-pptx       | passed |      170 |      373 |     1 |      12/12 |
| russian-raster-ocr       | passed |     8349 |      294 |     1 |      10/10 |
| vector-outlines-negative | passed |     3150 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

Колонка `R@5` — «факт / потолок». Потолок = `min(релевантных, 5) / релевантных`:
стратегия, которая режет тот же документ мельче, механически снижает свой
собственный потолок, поэтому Recall@5 между стратегиями напрямую не сравним,
и выбор кандидата опирается на ранговые метрики и на отсутствие регрессий.

Регрессией считается падение больше 0.01 по любой из трёх метрик на любом контрольном вопросе.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | R@5 факт/потолок |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---------------: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |      0.31 / 0.81 | 0.50 |   0.50 | 11861 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           199 |         100% | 100% |      100% |      0.05 / 0.56 | 0.50 |   0.39 |  2269 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           256 |         100% | 100% |      100% |      0.32 / 0.59 | 0.67 |   0.58 |  6199 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    67 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            35 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2043 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            35 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2041 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    64 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2044 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2041 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    71 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2044 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2041 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    64 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |      1.00 / 1.00 | 0.33 |   0.50 |  2040 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2039 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    66 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2044 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2040 |

## Проваленные проверки

Нет.

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат): sci-hypothesis/recall@5 0.625→0.103; sci-hypothesis/ndcg@5 1.000→0.786
- scientific-pdf · docling_hybrid (не кандидат): sci-hypothesis/recall@5 0.625→0.138; sci-hypothesis/ndcg@5 1.000→0.854
- reading-order-pptx · docling_hierarchical (не кандидат): pptx-steps/mrr 1.000→0.333; pptx-steps/ndcg@5 1.000→0.500
