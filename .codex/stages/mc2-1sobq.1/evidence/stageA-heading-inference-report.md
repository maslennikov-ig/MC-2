# Docling A/B — stageA-heading-inference

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `pdf-heading-hierarchy` · кандидат: `docling_hybrid`

Serve memory: 2.769GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |      865 |   132021 |    20 |      11/11 |
| numbered-sections-pdf    | passed |      166 |      562 |     1 |      10/10 |
| hierarchy-docx           | passed |      153 |      572 |     1 |      10/10 |
| structured-docx          | passed |      144 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      138 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |      147 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |      187 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox |  R@5 |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a | 0.50 | 0.50 |   0.50 | 11997 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           199 |         100% | 100% |      100% | 0.40 | 0.50 |   0.39 |  2267 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           256 |         100% | 100% |      100% | 0.65 | 0.67 |   0.58 |  2197 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    75 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            35 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2042 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            35 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2043 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    68 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2045 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2042 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    72 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2042 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2041 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    70 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% | 1.00 | 0.33 |   0.50 |  2042 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2041 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    71 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2042 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2044 |

## Проваленные проверки

Нет.

## Наблюдения по не-кандидатам

- reading-order-pptx · docling_hierarchical (не кандидат): регрессия MRR по pptx-steps
