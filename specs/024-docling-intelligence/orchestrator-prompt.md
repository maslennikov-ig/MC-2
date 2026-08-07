# Portable prompt: Docling Intelligence orchestrator (Opus 5)

Target/Audience: новый root-оркестратор Claude Code на Opus 5 в `/home/me/code/mc2`.

Requires effective kernel: `shared-orchestration/v1`. If it is absent, stop and request the portable
kernel prompt.

## Goal:

Полностью реализовать Beads-эпик `mc2-1sobq` по
`specs/024-docling-intelligence/spec.md`, последовательно доведя structure-aware RAG, selective
Docling enrichments, проверенные Premium-форматы и gated OCR/VLM A/B до одного принятого immutable
release candidate.

## Success criteria:

- Выполнены и приняты `mc2-1sobq.1` ... `mc2-1sobq.5` с их реальными Beads-зависимостями.
- Native Docling structure/provenance проходит до Qdrant/retrieval; chunking default выбран по
  retrieval/evidence A/B, parent/child и late chunking не сломаны.
- Selective code/formula/chart/picture profiles grounded, profile-aware cached и resource-safe.
- XLSX/CSV, ODT/ODS/ODP, EPUB и LaTeX проходят Premium upload-to-retrieval acceptance; Standard/Trial
  не расширены.
- EasyOCR/RapidOCR и selective VLM оценены на фиксированных controls; включены только доказанно
  лучшие кандидаты, иначе отклонены без ослабления `EmptyConversionError`.
- Release acceptance, rollback, документация, Graphify, Beads и stage closeout завершены. Existing
  documents не переиндексированы.

## Context:

Production baseline уже работает на Docling 2.118.0 / Core 2.90.0 / Serve 1.29.0 / MCP 3.0.0 и
Python/TypeScript MCP SDK 2.0.0. Текущий Markdown chunker теряет headings; Stage 2 не передает raw
Docling JSON в metadata enrichment; старый benchmark ошибочно принимает одни H2 за двухуровневую
иерархию. Heron, TableFormer Accurate и EasyOCR `ru,en` уже используются. Advanced enrichments,
heading inference и native chunking еще не используются. Начальная задача: `mc2-1sobq.1`.

## Constraints:

1. Сначала прочитай `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`,
   `.codex/repository-failure-modes.md`, `graphify-out/GRAPH_REPORT.md`, затем выбранную Beads-lineage,
   `spec.md`, `plan.md` и `tasks.md`. Репозиторий и Beads — истина.
2. Используй `orchestrator-stage`; создавай ровно одну активную implementation stage на один child
   Bead. Эпик — roadmap. Stage A -> B/C -> D -> E; одновременно стадии не открывай. Делегируй только
   если это проходит repository delegation gate.
3. Для каждой behavior-changing стадии применяй focused TDD. Перед Docling/Serve API edits один раз
   выполни repository docs resolver для точных версий. Не придумывай API и не реализуй старые
   `docs/FUTURE/*` дословно.
4. Сохрани `/mcp`, official Docling MCP без форка, fail-closed conversion, additive Qdrant payload и
   feature-flag rollback. Direct Serve допустим только во внутреннем typed adapter с source/profile
   consistency guard.
5. Качество важнее скорости. Не включай RapidOCR/VLM/enrichment только потому, что они существуют:
   кандидат обязан пройти фиксированный ground-truth gate. Candidate rejection считается
   завершенной честной реализацией Stage D.
6. Не трогай существующие документы и не запускай reindex/backfill. Не открывай Serve наружу, не
   добавляй `latest`, broad fallback, global VLM, audio/video или не обоснованные MCP SDK features.
7. Сохраняй чужие изменения. Не трогай внешний dirty worktree
   `/tmp/claude-1000/-home-me-code-mc2/4c4ccb4c-973a-48c1-86af-7fdeed1e9ca9/scratchpad/deploy-wt`.
8. После каждой стадии проведи один root-owned risk-selected acceptance и canonical closeout.
   Полный `pnpm test` запусти один раз на release candidate; используй canonical repo commands.
9. Обычную dev-доставку выполняй только по repo contract после clean acceptance и fresh fetch.
   Merge в `master`, deploy/staging/production mutation и любой reindex требуют отдельной свежей
   явной авторизации с названием точного действия. Не считай этот prompt такой авторизацией.

## Output:

Веди Beads, stage manifests/artifacts, scope ledger и `.codex/handoff.md` по фактическому состоянию.
Для каждого stage сохрани воспроизводимые quality/config/model/resource artifacts. Финальный ответ
должен начать с наблюдаемого результата, затем дать acceptance evidence, включенные/отклоненные
кандидаты, ограничения, delivery state и точный rollback. Не заявляй, что новая схема качественнее,
если retrieval/evidence A/B этого не доказал.

## Stop:

Остановись только при user-owned ambiguity, ownership conflict, небезопасном расширении scope,
неустранимом blocker или перед конкретным merge/deploy/reindex/production action без свежей
авторизации. Во всех остальных случаях продолжай до следующей принятой стадии и автоматически бери
следующий незаблокированный child Bead.
