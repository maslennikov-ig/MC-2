Target: Claude opus-5 orchestrator
Audience: manual launcher (owner pastes this into a fresh Claude Code CLI session)
Runtime: Claude Code CLI, WSL, repository /home/me/code/mc2, start on branch `develop`

Goal: Закрыть хвосты после трека Career Playbook по утверждённому плану
`docs/plans/melodic-leaping-octopus.md`: уборка процесса и трекера (A), проверка ночного Price Sync (B),
три P2-бага (C), возобновление релизного контура
`/push patch` → `/deploy` (E). План — контракт; этот промт только запускает его.

Success criteria:

- `bash scripts/orchestration/run_process_verification.sh` → exit 0; `.codex/handoff.md` ≤ 308 строк,
  разделы-истории перенесены, не удалены.
- Beads и GitHub совпадают: `mc2-uv7n7`, `mc2-pmrmf.1`, `#67`, `#68` закрыты с причинами-фактами;
  `#100–#109` помечены комментарием как справочники; статус `mc2-pmrmf` и `#93/#95` приведён к одному.
- `mc2-kkimo`: у каждого из семи файлов в `exclude` записано одно из трёх решений; юнит-прогон зелёный.
- `mc2-cva3o`: `.env.production` получает `QDRANT_METRICS_GID` из `stat -c %g` на хосте, секрет не нужен.
- `mc2-hpful`: найден шаг, на котором блок задваивается, фикс с юнитом, повторный замер или доказательство
  на трассах.
- E: тег `v0.31.41` на коммите, входящем в `master`; `CHANGELOG.md`/`RELEASE_NOTES.md` обновлены; job
  `Deploy to Production` зелёный по собственному conclusion; label `org.opencontainers.image.revision`
  контейнера `megacampus-api-green|blue` = tip `master`; в `AGENTS.md` одна строка: `/push` перед `/deploy`.
- `python3 scripts/orchestration/check_stranded_commits.py` → OK после всех доставок.

Context: Аудит 2026-09-02 — код чист, `develop`=`origin/develop`, прод на `7ba758427`, `mc2-db696` закрыт.
Эпик NotebookLM `mc2-6ye5z` открыт намеренно: приёмка девяти типов отложена владельцем 2026-09-02;
не заказывать генерации и не закрывать его задачи, только записать defer в handoff. Читать первыми:
`AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, план, задачи `bd show` по каждому id.
Память проекта в `~/.claude/projects/-home-me-code-mc2/memory/`: `reference_green_ci_skipped_deploy`, `feedback_prod_deploy_standing_auth`,
`reference_env_file_not_compose_interpolation`, `reference_bd_open_hides_blocked_deferred`.
Порядок: A и C параллельно на своих ветках, B — после 03:20 UTC 2026-09-03, E строго последним
после доставки A и C в `develop` и зелёного CI.

Constraints: работа через `orchestration-bridge:orchestrator-stage`, закрытие через
`orchestration-bridge:closeout`; каждая ветка от `develop`, доставка `/push-dev`; Beads — единственный
трекер, закрытия с фактами (id прогонов, sha, размеры). Запрещено: миграции, реиндекс, изменение
секретов/флагов, force-push, любые правки веток Helixa (`mc2-gxese`, worktrees) и
`feature/video-presentation-pipeline`, массовые операции на GitHub. Живые прогоны только на dev.
Потолок: C3 — $2. Прод меняет только `/deploy` на зелёном CI (стоячее разрешение владельца).
Documentation: no external/versioned boundary — вся работа локальная (репозиторий, CI-workflow, Beads, GitHub).

Output: по каждому потоку A, B, C, E таблица «что сделано → чем доказано (команда/id/sha) → что осталось».
Затем: список закрытых и созданных Beads-задач, ветки и их слияния в `develop`, sha релиза и тега,
ограничения и откат для C2 (как вернуть секретный путь, если `stat` на хосте не даст группу).
Значимые находки, меняющие решения, — отдельным блоком с доказательством и куда их записать.

Stop: остановиться и спросить владельца, если превышен потолок, если прод-деплой красный или
`Deploy to Production` skipped при зелёном CI,
если C3 требует платного прогона сверх $2, и если два исхода остаются правдоподобными и меняют
приёмку (например, закрывать ли `mc2-pmrmf` или оставить P3). Не спрашивать разрешения на
действия, которые план уже разрешил.
