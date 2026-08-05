# Docling A/B — stageA-corrected-baseline-nocand

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `baseline` · кандидат: `none`

Кандидат не назначен: ни одна стратегия не предлагается в качестве
default, поэтому блокирующая проверка регрессий не применяется, а все
стратегии записаны как наблюдения.

Serve memory: 2.699GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   223810 |   132019 |    20 |      10/10 |
| numbered-sections-pdf    | passed |     1251 |      558 |     1 |        9/9 |
| hierarchy-docx           | passed |      247 |      572 |     1 |        9/9 |
| structured-docx          | passed |      240 |      500 |     1 |      13/13 |
| reading-order-pptx       | passed |      184 |      373 |     1 |      12/12 |
| russian-raster-ocr       | passed |     8428 |      294 |     1 |      10/10 |
| vector-outlines-negative | passed |     3181 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

Колонка `R@5` — «факт / потолок». Потолок = `min(релевантных, 5) / релевантных`:
стратегия, которая режет тот же документ мельче, механически снижает свой
собственный потолок, поэтому Recall@5 между стратегиями напрямую не сравним,
и выбор кандидата опирается на ранговые метрики и на отсутствие регрессий.

Регрессией считается падение больше 0.01 по любой из трёх метрик на любом контрольном вопросе.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | R@5 факт/потолок |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---------------: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |      0.31 / 0.81 | 0.50 |   0.50 | 12220 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           197 |         100% | 100% |      100% |      0.22 / 0.78 | 0.50 |   0.42 |  2261 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           254 |         100% | 100% |      100% |      0.47 / 0.78 | 0.67 |   0.57 |  2193 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    63 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2047 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            30 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2042 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    73 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2040 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2039 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    69 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2037 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |  2038 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    63 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |      1.00 / 1.00 | 0.33 |   0.50 |  2038 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2041 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |      1.00 / 1.00 | 1.00 |   1.00 |    65 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2038 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |      1.00 / 1.00 | 1.00 |   1.00 |  2043 |

## Проваленные проверки

Нет.

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат): sci-hypothesis/recall@5 0.625→0.444; sci-hypothesis/ndcg@5 1.000→0.830
- scientific-pdf · docling_hybrid (не кандидат): sci-hypothesis/recall@5 0.625→0.444; sci-hypothesis/ndcg@5 1.000→0.830
- reading-order-pptx · docling_hierarchical (не кандидат): pptx-steps/mrr 1.000→0.333; pptx-steps/ndcg@5 1.000→0.500
