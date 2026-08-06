# Docling A/B — atoms-lexical-heading-inference

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `pdf-heading-hierarchy` · кандидат: `docling_hybrid`

Serve memory: 2.629GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   411006 |   132021 |    20 |      11/11 |
| numbered-sections-pdf    | passed |     3857 |      562 |     1 |      10/10 |
| hierarchy-docx           | passed |      248 |      572 |     1 |      10/10 |
| structured-docx          | passed |      225 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      218 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |     8576 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |     3218 |        7 |     1 |        1/1 |

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
Блокирует лексический прокси: dense-прогон не запрашивался (`--dense`).

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox | Atoms@5 | aMRR | aDCG | R@5 факт/потолок |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ------: | ---: | ---: | ---------------: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a |    0.75 | 0.56 | 0.61 |      0.38 / 0.63 | 12907 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           199 |         100% | 100% |      100% |    0.50 | 0.50 | 0.50 |      0.05 / 0.38 |  2330 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           256 |         100% | 100% |      100% |    1.00 | 0.67 | 0.75 |      0.14 / 0.44 |  6232 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |    70 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            35 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2045 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            35 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2045 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |    75 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2046 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2046 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |    71 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2041 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2042 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |    75 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% |    1.00 | 0.29 | 0.47 |      1.00 / 1.00 |  2044 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2042 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |    79 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2040 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% |    1.00 | 1.00 | 1.00 |      1.00 / 1.00 |  2049 |

Полные ранжированные списки chunk id и посписочный статус каждого атома —
в `metrics.json` (`strategies[].retrieval.questions[].rankedChunkIds` и
`.atoms`). Утверждение «те же чанки в том же порядке» проверяется по ним.

## Проваленные проверки

Нет.

## Наблюдения по не-кандидатам

- scientific-pdf · docling_hierarchical (не кандидат, lexical): sci-accuracy-drop/atom-coverage 0.500→0.000; sci-accuracy-drop/atom-mrr 0.125→0.000; sci-accuracy-drop/atom-dcg 0.215→0.000
- reading-order-pptx · docling_hierarchical (не кандидат, lexical): pptx-steps/atom-mrr 1.000→0.292; pptx-steps/atom-dcg 1.000→0.465
