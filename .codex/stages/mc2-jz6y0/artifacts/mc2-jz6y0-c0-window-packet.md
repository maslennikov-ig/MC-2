---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-implementation-stream
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: root orchestrator packet assembly (read-only; no mutation)
subagent_model: claude-fable-5
reasoning_effort: high
model_reasoning_rationale: live-cutover window packet; owner gate for the single observed remote window.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: ae9ed1d3
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-packet.md
selected_docs:
  - docs/superpowers/plans/2026-07-16-q12-full-completion.md (Phase C)
  - deploy/qdrant/q12-command-manifest.json (frozen, frozen, sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841)
  - docs/operations/qdrant-self-hosted.md (access, secrets, runbook)
selected_skills:
  - orchestrator-stage
selected_agents:
  - none (packet assembly is root-owned read-only work)
catalog_candidates:
  - none
parallel_group: none
depends_on_streams:
  - Phase B receipt mc2-rl4p9-q12-b1-publication.md (GHCR image digest)
parallel_decision: single sequential owner-gated window; no decomposition.
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: packet only; no local or remote mutation performed.
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: packet mirrors the frozen manifest and runbook; no doc change until the window runs.
graph_reviewed: no-change-needed
graph_review_notes: read-only packet assembly.
verification:
  - 'Frozen manifest byte-identity re-verified before assembly: sha256(deploy/qdrant/q12-command-manifest.json) = aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 (W tuple field 2).'
  - 'All 20 manifest commands enumerated verbatim (argv + argv_sha256 + env); zero omissions (programmatic assertion).'
  - 'No mutation: packet assembly ran read-only against the repo; no server, GHCR, or database access.'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-packet.md
explicit_defers:
  - 'GHCR pull-auth decision (package visibility vs read:packages token on the server): owner decision required at this gate.'
---

# Summary

OWNER APPROVAL RECORDED: окно одобрено владельцем 2026-07-17 («Да, конечно, согласен, делай») — открытие окна, перевод compose на образ Phase B и решение pull-auth делегировано оркестратору в рамках пакета.

Пакет окна живого перехода (Task C0). Одно наблюдаемое окно, один
супервизор `deploy/qdrant/q12-live-cutover.sh --run-id <uuid>` на сервере
`megacampus-prod` (root, SSH), строго по замороженному манифесту
`q12-command-manifest.json` sha256
`aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` (байт-идентичность перепроверяется в момент открытия окна). Активация барьера гейтится D6 activation-truth
(predecision → optional durable R → terminal seal); все receipts
owner-only в run root `/opt/megacampus/backups/q12/<run-id>/`.

## Порядок и точные команды

См. раздел «Команды окна» ниже: все 20 команд манифеста с точными argv,
argv_sha256 и env. Плейсхолдеры подставляет только супервизор.

## Секреты, которых касается окно (значения не покидают сервер)

- `/opt/megacampus/secrets/supabase_db_url` — owner-only 0600 DSN (Session pooler), читается барьером/оператором; в argv только путь.
- `/opt/megacampus/secrets/prod-ca-2021.crt` — пиновый CA (verify-full).
- `/opt/megacampus/backups/q12/<run-id>/secrets/db-capability` — run-scoped capability-файл, создаётся барьером owner-only.
- Qdrant `api-key`/read-only key — mounted files для листенера и скрейпа мониторинга (C10).
- GHCR pull-доступ для `deploy.prepare` (образ оператора Phase B) — решение владельца на этом гейте.
- Пароль БД НЕ ротируется в окне (D2 отдельный owner-gate, отложен владельцем).

## Наблюдение (что смотрим во время окна)

- Барьерные receipts: `<run-root>/database-barrier-receipt.json` (install → verify-extended после каждой пары миграций → prepare-recovery → activate `state=activated`).
- Quiesce/resume receipts десяти managed-писателей; отсутствие активных путей записи в окне.
- Изолированный restore-дрилл: cluster-global + cutover + baseline equality, zero residue.
- `reindex.verify`: строгая indexed-фильтрация, схема, recall, snapshot matrix на пине 1.18.2.
- Blue/green: здоровье неактивного цвета до `deploy.commit`; durable `nginx_switch_intent` до reload.
- Мониторинг: скрейп восьми Qdrant-алертов, Web UI только loopback.
- Пост-окно (D1): §13 smoke-гейт — 60 мин, coverage/baseline 100%, isolation/incidents 0, REST ≤2%, hybrid ≤5%, memory ≤85%, point-drop ≤10%, ровно 12114 initial-cutover points, <3 degraded, firing+resolved notification; каждый терминальный вердикт ставит rotation_required=true.

## Откат по фазам

- C1 (install/self-check): пассивно; откат = не продолжать (барьер не активирован).
- C2 (quiesce): `writers.resume.rollback` (lease-bound, resume-mode rollback).
- C3 (backup/restore): без мутаций прод-данных; дрилл изолирован.
- C4 (миграции): guarded rollback (no-start mode-bound final manifests, .13.15); verify-extended receipts фиксируют фронтир.
- C5 (source.forward): crash-durable exact no-replace копии — аддитивно; откат = resume.rollback без промоции.
- C6 (reindex): новая физическая коллекция за стабильным алиасом; алиас не переключён — откат тривиален.
- C8 (deploy.prepare): неактивный цвет; откат = не коммитить.
- C9: ДО `barrier.activate` — откат nginx через truthful re-prepare intent; ПОСЛЕ activate — finish-forward only (точка невозврата, `writers.resume.forward`).
- Qdrant Cloud никогда не мутируется и не восстанавливается — читаемый источник до переключения; полный возврат чтения на Cloud возможен до C9.

## Downtime / влияние на данные

- Пауза записи: с C2 (writers.quiesce) до C9 (writers.resume.forward) — генерация курсов/инжест приостановлены на всё окно; чтение приложения продолжается.
- Ни одна исходная запись не выполняется в окно; ожидаемые точки initial-cutover: ровно 12114.
- Провайдер-плоскость Supabase — принятая доверенная граница (.13.14).

## Предусловия перед открытием окна (владелец подтверждает вместе с approve)

1. GHCR pull-auth: сделать пакет public ИЛИ выдать read:packages токен на сервер (stdin → owner-only файл). Compose `/opt/megacampus/docker-compose.infra.yml` должен ссылаться на образ Phase B: `ghcr.io/maslennikov-ig/mc-2/qdrant-operator@sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`.
2. Первое реальное наблюдение pinned-server capability-гейтов (POSIX_SPAWN_CLOSEFROM, pidfd/ptrace/Yama, продакшн CA) происходит при открытии окна; при провале супервизор падает закрыто ДО мутаций.
3. Task C7 (производственный re-freeze полей 5/6/8/9 из каталога C4) выполняется локально внутри окна между C6 и C8, с коммитом и пушем.

# Verification

Сборка пакета: байт-идентичность манифеста перепроверена, 20/20 команд
включены программно (assertion), плейсхолдеры перечислены. Никакая
команда окна не исполнялась; сервер/БД/GHCR не трогались.

# Risks / Follow-ups

- Окно исполняется только после явного approve владельца (этот гейт).
- Точка невозврата — C9 `barrier.activate`; после неё только вперёд.
- D2 ротация пароля остаётся отдельным owner-gate (владелец отложил 2026-07-16); каждый терминальный §13-вердикт помечает rotation_required=true — решение снова будет предложено на D2.

## Команды окна (все 20, verbatim из замороженного манифеста)

### C1: Барьер: установка + самопроверка (пассивно)

**`barrier.install`** (argv_sha256 `0caafb416a252f5b00d606e813ac2d4c021415e1137ecb6b7c5383e058db373b`)

```
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh \
  install \
  --run-id \
  <run-id> \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --expected-post-migration-catalog \
  /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json \
  --expected-post-migration-catalog-sha256 \
  <expected-post-migration-catalog-sha256>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`operator.self-check`** (argv_sha256 `6223400747c639f7eae91e1a1f20f61431bf4babf4cc83a840ffb8c9b2e57afb`)

```
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory \
  /opt/megacampus \
  -f \
  /opt/megacampus/docker-compose.infra.yml \
  --env-file \
  /opt/megacampus/.env.production \
  --profile \
  operator \
  run \
  --rm \
  --no-deps \
  -T \
  qdrant-operator \
  self-check
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C2: Пауза писателей (10 managed writers)

**`writers.quiesce`** (argv_sha256 `dad57df0a5675c989ec3e05e9e575249aa821a33e0c29ad60c4625f47b12a85c`)

```
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation \
  quiesce-writers-only \
  --run-id \
  <run-id>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root Q12_EXTERNAL_QUIESCE_LEASE_FD=9`

### C3: Свежий бэкап + изолированный restore-дрилл

**`pg.backup`** (argv_sha256 `3dd4599a8aa4d6f9fba7e475d015b75256c0d4eb71e0e7162910147551585960`)

```
/opt/megacampus/deploy/postgres/backup-supabase.sh \
  --q12-run-id \
  <run-id> \
  --snapshot \
  <exported-id>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`pg.restore`** (argv_sha256 `61546d6d71fafa69267bf51c88a3ca7dcc1845ced0f76144043fa29d32d9ad4d`)

```
/opt/megacampus/deploy/postgres/restore-supabase-drill.sh \
  --generation \
  <immutable-generation> \
  --run-id \
  <run-id> \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C4: Защищённые миграции + verify + производственный каталог

**`migration.base.apply`** (argv_sha256 `f92be7227da6fc3421d88311c9fae4ec066870e6490a2ea3cda4d940506114f0`)

```
/usr/bin/pnpm \
  --filter \
  @megacampus/course-gen-platform \
  migration:document-evidence-approved:apply \
  -- \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --allow-remote \
  --confirm \
  APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`barrier.verify-after-base`** (argv_sha256 `a9eb8d69416dbc8102e473d1b6c9716d5604392b4140581a18b65137210eea1e`)

```
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh \
  verify-extended \
  --after-migration \
  20260711140000 \
  --run-id \
  <run-id> \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --expected-post-migration-catalog \
  /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json \
  --expected-post-migration-catalog-sha256 \
  <expected-post-migration-catalog-sha256>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`migration.observability.apply`** (argv_sha256 `e38db36e0c13f00857e205a58ae876e40a1bf20c5adf33b98da1c20f92b547b1`)

```
/usr/bin/pnpm \
  --filter \
  @megacampus/course-gen-platform \
  migration:document-evidence-observability:apply \
  -- \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --allow-remote \
  --confirm \
  APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`barrier.verify-after-observability`** (argv_sha256 `0dfd3b80aac5674cbb77a1c708e8f4751dff96f4465362c3a4c0862b78ab321d`)

```
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh \
  verify-extended \
  --after-migration \
  20260711151000 \
  --run-id \
  <run-id> \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --expected-post-migration-catalog \
  /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json \
  --expected-post-migration-catalog-sha256 \
  <expected-post-migration-catalog-sha256>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C5: Source recovery: 42 копии, 24 диспозиции, без --allow-gaps

**`barrier.prepare-recovery`** (argv_sha256 `b45a23caaa74f197a0779e52b460079c53ea246ba1951456fd8f04856673021c`)

```
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh \
  prepare-recovery \
  --run-id \
  <run-id> \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --expected-post-migration-catalog \
  /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json \
  --expected-post-migration-catalog-sha256 \
  <expected-post-migration-catalog-sha256>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`source.forward`** (argv_sha256 `9e41f5b4d3114a29e8a64ecb524a6bb4a8525b8382a5afc151eb6e3327c8a3fe`)

```
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation \
  forward \
  --run-id \
  <recovery-run-id> \
  --project-directory \
  /opt/megacampus \
  --env-file \
  /opt/megacampus/.env.production \
  --plan-input \
  /var/lib/megacampus-source-recovery/plan-input.json \
  --manifest \
  /var/lib/megacampus-source-recovery/state/manifest.json \
  --progress-directory \
  /var/lib/megacampus-source-recovery/state/progress \
  --development-root \
  /opt/megacampus/data/uploads-dev \
  --production-root \
  /opt/megacampus/data/uploads \
  --capability-directory \
  /opt/megacampus/data/source-recovery-capability \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --external-quiesce-manifest \
  <quiesce-manifest> \
  --database-barrier-receipt \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C6: Реиндексация course_embeddings + строгая верификация

**`reindex.plan`** (argv_sha256 `10d709ad168f51966d54f80e6e4948be575d85a509929a9dba0d19967dad0209`)

```
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory \
  /opt/megacampus \
  -f \
  /opt/megacampus/docker-compose.infra.yml \
  --env-file \
  /opt/megacampus/.env.production \
  --profile \
  operator \
  run \
  --rm \
  --no-deps \
  -T \
  -v \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro \
  -e \
  Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt \
  qdrant-operator \
  reindex \
  plan \
  --run-id \
  <run-id> \
  --artifact \
  /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json \
  --recovery-manifest-path \
  /var/lib/megacampus-source-recovery/state/manifest.json \
  --recovery-journal-path \
  /var/lib/megacampus-source-recovery/state/progress/journal.json \
  --recovery-run-id \
  <recovery-run-id> \
  --recovery-manifest-sha256 \
  <accepted-recovery-manifest-sha256> \
  --accepted-coverage-fingerprint \
  <accepted-coverage-fingerprint> \
  --accepted-coverage-run \
  <accepted-coverage-run>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`reindex.worker.create`** (argv_sha256 `5c993e0caf460cdccaf4b6a64fcfba457b0f1f5ef323b5da446100e2c7bd2b1e`)

```
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory \
  /opt/megacampus \
  -f \
  /opt/megacampus/docker-compose.infra.yml \
  --env-file \
  /opt/megacampus/.env.production \
  --profile \
  operator \
  run \
  --no-deps \
  -v \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro \
  -e \
  Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt \
  -d \
  --name \
  megacampus-qdrant-reindex-<run-id> \
  -e \
  BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id> \
  -e \
  QDRANT_REINDEX_TARGET_COLLECTION=course_embeddings_v1 \
  qdrant-operator \
  reindex-worker
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`reindex.execute`** (argv_sha256 `4245cacadbb22ffa934f0a486049be89cc11958ae1ca61903f05b04159f1eb21`)

```
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory \
  /opt/megacampus \
  -f \
  /opt/megacampus/docker-compose.infra.yml \
  --env-file \
  /opt/megacampus/.env.production \
  --profile \
  operator \
  run \
  --rm \
  --no-deps \
  -T \
  -v \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro \
  -e \
  Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt \
  -e \
  BULLMQ_QUEUE_NAME=qdrant-reindex-<run-id> \
  qdrant-operator \
  reindex \
  execute \
  --target-collection \
  course_embeddings_v1 \
  --run-id \
  <run-id> \
  --artifact \
  /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json \
  --recovery-manifest-path \
  /var/lib/megacampus-source-recovery/state/manifest.json \
  --recovery-journal-path \
  /var/lib/megacampus-source-recovery/state/progress/journal.json \
  --recovery-run-id \
  <recovery-run-id> \
  --recovery-manifest-sha256 \
  <accepted-recovery-manifest-sha256> \
  --accepted-coverage-fingerprint \
  <accepted-coverage-fingerprint> \
  --accepted-coverage-run \
  <accepted-coverage-run>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`reindex.verify`** (argv_sha256 `a5ab3cccf03f6f856a0f420deb337ae07302b6615cc7e3213982b19b1f3192d6`)

```
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory \
  /opt/megacampus \
  -f \
  /opt/megacampus/docker-compose.infra.yml \
  --env-file \
  /opt/megacampus/.env.production \
  --profile \
  operator \
  run \
  --rm \
  --no-deps \
  -T \
  -v \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability:/run/secrets/q12_db_capability:ro \
  -e \
  Q12_DB_CAPABILITY_FILE=/run/secrets/q12_db_capability \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-receipt.json:/run/secrets/q12_database_barrier_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_RECEIPT_FILE=/run/secrets/q12_database_barrier_receipt \
  -v \
  /opt/megacampus/backups/q12/<run-id>/database-barrier-probe-receipt.json:/run/secrets/q12_database_barrier_probe_receipt:ro \
  -e \
  Q12_DATABASE_BARRIER_PROBE_RECEIPT_FILE=/run/secrets/q12_database_barrier_probe_receipt \
  qdrant-operator \
  reindex \
  verify \
  --target-collection \
  course_embeddings_v1 \
  --run-id \
  <run-id> \
  --artifact \
  /var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json \
  --recovery-manifest-path \
  /var/lib/megacampus-source-recovery/state/manifest.json \
  --recovery-journal-path \
  /var/lib/megacampus-source-recovery/state/progress/journal.json \
  --recovery-run-id \
  <recovery-run-id> \
  --recovery-manifest-sha256 \
  <accepted-recovery-manifest-sha256> \
  --accepted-coverage-fingerprint \
  <accepted-coverage-fingerprint> \
  --accepted-coverage-run \
  <accepted-coverage-run>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C8: Blue/green: подготовка неактивного цвета + коммит

**`deploy.prepare`** (argv_sha256 `90d0e635d179cf2318542956c1f0ea633bec3b09769787b00c46df846c3f5844`)

```
/opt/megacampus/scripts/deploy_blue_green.sh \
  --q12-mode \
  prepare-quiesced \
  --run-id \
  <run-id> \
  --release-sha \
  <release-sha> \
  --external-quiesce-manifest \
  <quiesce-manifest>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`deploy.commit`** (argv_sha256 `a1d641ebc324b165e105a95dc7d12b03c6f1cfadce74d888d496f5a22e6d2e59`)

```
/opt/megacampus/scripts/deploy_blue_green.sh \
  --q12-mode \
  commit-quiesced \
  --run-id \
  <run-id> \
  --release-sha \
  <release-sha> \
  --external-quiesce-manifest \
  <quiesce-manifest>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

### C9: nginx switch → barrier.activate → возобновление писателей вперёд

**`barrier.activate`** (argv_sha256 `f267f1dc9889ae85171257b2ddaf553cb372fe97be9deb7e201b7e5bcc69c191`)

```
/opt/megacampus/deploy/qdrant/q12-database-barrier.sh \
  activate \
  --run-id \
  <run-id> \
  --db-url-file \
  /opt/megacampus/secrets/supabase_db_url \
  --ca-file \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  --q12-db-capability-file \
  /opt/megacampus/backups/q12/<run-id>/secrets/db-capability \
  --expected-post-migration-catalog \
  /opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json \
  --expected-post-migration-catalog-sha256 \
  <expected-post-migration-catalog-sha256>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root`

**`writers.resume.forward`** (argv_sha256 `e6d310c69468287cd298d954a59a556bd20812418b3c0bae0cd21973e6331f77`)

```
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation \
  resume-writers-only \
  --resume-mode \
  forward \
  --run-id \
  <run-id>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root Q12_EXTERNAL_QUIESCE_LEASE_FD=9`

### RB: Откатный путь (до activate)

**`writers.resume.rollback`** (argv_sha256 `029a88e92bc4cc88afcb6dbcba56dce8aa0da32b7f825cbe1eb1a60eda7639e9`)

```
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation \
  resume-writers-only \
  --resume-mode \
  rollback \
  --run-id \
  <run-id>
```

env: `PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C LANG=C HOME=/root Q12_EXTERNAL_QUIESCE_LEASE_FD=9`

## Плейсхолдеры (подставляет единственный супервизор по run-id)

- `<accepted-coverage-fingerprint>`
- `<accepted-coverage-run>`
- `<accepted-recovery-manifest-sha256>`
- `<expected-post-migration-catalog-sha256>`
- `<exported-id>`
- `<immutable-generation>`
- `<quiesce-manifest>`
- `<recovery-run-id>`
- `<release-sha>`
- `<run-id>`
