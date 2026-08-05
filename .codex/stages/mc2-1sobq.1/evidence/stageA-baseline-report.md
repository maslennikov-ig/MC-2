# Docling A/B — stageA-baseline

MCP: `http://127.0.0.1:8000/mcp` · Serve: `http://127.0.0.1:5001` · conversion profile: `baseline` · кандидат: `docling_hybrid`

Serve memory: 3.032GiB / 4GiB; restarts: 0

## Конвертация

| Case                     | Result | Time, ms | Markdown | Pages | Assertions |
| ------------------------ | -----: | -------: | -------: | ----: | ---------: |
| scientific-pdf           | passed |   227898 |   132019 |    20 |      11/11 |
| numbered-sections-pdf    | passed |     3825 |      558 |     1 |      10/10 |
| hierarchy-docx           | passed |      241 |      572 |     1 |      10/10 |
| structured-docx          | passed |      217 |      500 |     1 |      14/14 |
| reading-order-pptx       | passed |      220 |      373 |     1 |      13/13 |
| russian-raster-ocr       | passed |     8653 |      294 |     1 |      11/11 |
| vector-outlines-negative | passed |     3179 |        7 |     1 |        1/1 |

## Стратегии чанкинга

Recall@5/MRR/nDCG@5 — лексический прокси (BM25 с параметрами коллекции), не dense-ранжирование Jina.

| Case                  | Strategy             | Parents | Children | Avg child tok | Heading path | Refs | Page/bbox |  R@5 |  MRR | nDCG@5 |    ms |
| --------------------- | -------------------- | ------: | -------: | ------------: | -----------: | ---: | --------: | ---: | ---: | -----: | ----: |
| scientific-pdf        | legacy_markdown      |     155 |      155 |           169 |           0% |   0% |       n/a | 0.50 | 0.50 |   0.50 | 12187 |
| scientific-pdf        | docling_hierarchical |      31 |      139 |           197 |         100% | 100% |      100% | 0.40 | 0.50 |   0.42 |  2264 |
| scientific-pdf        | docling_hybrid       |      31 |      106 |           254 |         100% | 100% |      100% | 0.65 | 0.67 |   0.57 |  2191 |
| numbered-sections-pdf | legacy_markdown      |       1 |        1 |           244 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    76 |
| numbered-sections-pdf | docling_hierarchical |       7 |        7 |            30 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2043 |
| numbered-sections-pdf | docling_hybrid       |       7 |        7 |            30 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2042 |
| hierarchy-docx        | legacy_markdown      |       1 |        1 |           243 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    73 |
| hierarchy-docx        | docling_hierarchical |       7 |        7 |            48 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2045 |
| hierarchy-docx        | docling_hybrid       |       7 |        7 |            48 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2044 |
| structured-docx       | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    73 |
| structured-docx       | docling_hierarchical |       2 |        2 |            90 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2043 |
| structured-docx       | docling_hybrid       |       2 |        2 |            89 |         100% | 100% |       n/a | 1.00 | 1.00 |   1.00 |  2040 |
| reading-order-pptx    | legacy_markdown      |       1 |        1 |           138 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    69 |
| reading-order-pptx    | docling_hierarchical |       1 |        6 |            22 |           0% | 100% |      100% | 1.00 | 0.33 |   0.50 |  2042 |
| reading-order-pptx    | docling_hybrid       |       1 |        1 |           135 |           0% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2043 |
| russian-raster-ocr    | legacy_markdown      |       1 |        1 |           172 |           0% |   0% |       n/a | 1.00 | 1.00 |   1.00 |    72 |
| russian-raster-ocr    | docling_hierarchical |       1 |        2 |           102 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2041 |
| russian-raster-ocr    | docling_hybrid       |       1 |        1 |           171 |         100% | 100% |      100% | 1.00 | 1.00 |   1.00 |  2042 |

## Проваленные проверки

Нет.

## Наблюдения по не-кандидатам

- reading-order-pptx · docling_hierarchical (не кандидат): регрессия MRR по pptx-steps
