# QdrantRestoreDrillStale: устаревший recovery probe после дедупликации

## Context

Алерт `QdrantRestoreDrillStale` (staging, warning) сработал 05.09.2026 в 01:03 MSK и повторяется каждые 4 часа.
Правило: `time() - megacampus_qdrant_last_successful_restore_drill_unixtime_seconds > 35d` **или** `absent(...)`.

Что установлено (только чтением, на хосте `megacampus-prod` и в репо):

- Ветка `absent()` не при чём: метрика есть, диск 64%, exporter и Prometheus живы. Сработала ветка «старше 35 дней».
- Значение метрики `1785535395` = **2026-07-31 22:03 UTC**, последний успешный drill. 35 дней истекли ровно 2026-09-05 01:03 MSK.
- Таймер `megacampus-qdrant-restore-drill.timer` месячный. Запуск **2026-09-01 00:24 CEST упал** за 2 секунды, юнит в состоянии `failed`, `megacampus_qdrant_restore_drill_failures_total` стал 1. Следующий запуск только 2026-10-01.
- Evidence `/var/lib/megacampus-qdrant-recovery/restore-evidence/2026-08-31T22-24-28-665Z-restore-drill.json`:
  `"error": "RU BM25 top identity/content mismatch in fields: point_id, chunk_id"`. Поле `content` в списке **нет**, то есть текст совпал, а идентичность точки другая.
- `/opt/megacampus/recovery/probe.json` (root:root, от 2026-07-31) ждёт на первом месте по русскому BM25 и на первом месте формулы точку `6c76bc5e-…` (`parent_324_1842772967`). Этой точки в коллекции **больше нет**.
- Корпус сменился **2026-08-12**: снапшоты показывают 13712 → 6856 точек (ровно вдвое). Это дедупликация parent/child чанков с одинаковым текстом. Теперь top-1 это `child_324_1842772967` (`3a281308-…`) с тем же текстом и тем же документом.
- `docs/rag/2026-08-26-qdrant-operations-recheck.md` прямо предупреждал: ни один drill не гонялся по пост-дедупликационному снапшоту, «сентябрьский закроет это». Он и закрыл, но упал.
- Генератор probe **есть**: `deploy/qdrant/generate-recovery-probe.py` (на хосте `/opt/megacampus/deploy/qdrant/`, md5 совпадает с репо, python3 3.12). Его docstring говорит «перезапускай после любого перезаписывания векторов курса», но runbook `docs/operations/qdrant-self-hosted.md` его **ни разу не упоминает**. Поэтому после дедупликации его никто не запустил.
- Алерта на сам счётчик неудач drill нет: провал 1 сентября молчал четыре дня, пока не истёк 35-дневный порог.

Вывод: сам бэкап и restore исправны. Drill упал потому, что его эталон устарел. Алерт сообщил об этом с опозданием на 4 дня и неверным словом «stale».

## Часть 1. Устранить на хосте (нужно подтверждение: мутация staging/prod-хоста)

Всё выполняется по SSH на `megacampus-prod`; ключ Qdrant в чат не печатается (генератор сам делает `sudo cat`).

1. Сгенерировать новый probe по живой коллекции:
   ```bash
   python3 /opt/megacampus/deploy/qdrant/generate-recovery-probe.py \
     --url http://127.0.0.1:6335 --out "$HOME/probe.json.new"
   ```
   Прод-Qdrant слушает `127.0.0.1:6335` (порт 6333 на хосте это dev-инстанс с 12 точками).
2. Сравнить со старым через `jq` (без `dense_vector`): ожидаемо меняются `expected_ru_bm25` и `expected_formula_order[0]` на `child_*`; курс может смениться, это допустимо.
3. Сохранить старый файл и установить новый теми же правами, что требует runbook:
   ```bash
   sudo cp -p /opt/megacampus/recovery/probe.json /opt/megacampus/recovery/probe.json.bak-20260905
   sudo install -o root -g root -m 0400 "$HOME/probe.json.new" /opt/megacampus/recovery/probe.json
   rm "$HOME/probe.json.new"
   ```
4. Запустить drill вручную (это ровно «manual-first proof» из runbook, restore идёт во временную коллекцию, стабильный alias не трогается):
   ```bash
   sudo systemctl start megacampus-qdrant-restore-drill.service
   sudo systemctl status --no-pager megacampus-qdrant-restore-drill.service
   sudo journalctl --no-pager -u megacampus-qdrant-restore-drill.service -n 60
   ```
5. Проверить результат: новый файл в `restore-evidence/` со `status: "passed"` и всеми семью `checks: pass`; `lastSuccessfulRestoreDrillEpochSeconds` в `metrics-state.json` и в `megacampus_qdrant_recovery.prom` равен времени запуска; в Prometheus `time() - metric` меньше суток; в Alertmanager алерт resolved; нет остаточных `qdrant_restore_drill_*` коллекций и alias; в `/run/megacampus-qdrant-restore-credentials/` ничего не осталось.

## Часть 2. Сделать так, чтобы это не повторилось (репо, доставка через `/push-dev` → `/deploy`)

### 2a. Алерт на провал drill

- `ops/qdrant/prometheus/alerts.yml`: новое правило `QdrantRestoreDrillFailed`, `increase(megacampus_qdrant_restore_drill_failures_total[6h]) > 0`, `for: 0m`, `severity: warning`. Аннотация: смотреть свежий файл в `restore-evidence/`; если в `error` есть `identity/content mismatch` без `content`, probe устарел, перегенерировать `generate-recovery-probe.py`.
- `ops/qdrant/prometheus/alert-tests.yml`: тест со счётчиком `0 0 0 1 1 1` и `eval_time` после шага (fires) и после 6 часов (не fires).
- `packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts`: строка контракта для нового алерта в массив `contracts` (около строки 119).
- Правила на хост ставит `deploy/qdrant/install-monitoring-config.sh` (он же гоняет `promtool test rules alert-tests.yml`), это часть обычного `/deploy`.

### 2b. Drill различает «probe устарел» и «restore сломан»

`packages/course-gen-platform/tools/qdrant/restore-drill.ts`:

- Вынести из `verifyRecoveredCollection` (строки 194–256) запросы dense / RU BM25 / EN BM25 / formula в функцию `queryProbeIdentities(client, alias, probe)`, возвращающую top-точки. `verifyRecoveredCollection` использует её и сравнивает как сейчас.
- В `runRestoreDrill` перед `recoverSnapshot` (строка 436) выполнить те же запросы против `options.stableAlias` и сравнить с probe. При расхождении бросить `Recovery probe is stale against the live collection: <label> mismatch in <fields>; regenerate it with deploy/qdrant/generate-recovery-probe.py`. Restore при этом не запускается, drill считается проваленным (метрика неудач растёт, alert из 2a срабатывает), evidence получает поле `probe_source_check: 'pass' | 'stale'`.
- Тесты в `tests/unit/tools/qdrant/restore-drill.test.ts`: новый кейс «probe не совпадает с живой коллекцией» (нет вызова `recoverSnapshot`, статус `failed`, сообщение про stale, счётчик неудач +1). Существующие кейсы мокают `client.query` по имени alias; мок нужно научить отвечать и для `course_embeddings`, иначе они начнут падать на новом pre-check.

### 2c. Runbook

`docs/operations/qdrant-self-hosted.md`:

- В разделе установки (около строки 673, «place the reviewed credential/probe files») сказать, что probe не пишется руками, а генерируется `deploy/qdrant/generate-recovery-probe.py`, с командой.
- Новый подраздел «Recovery probe lifecycle»: probe фиксирует точные `point_id`; его обесценивает любая перезапись векторов выбранного курса (reindex, дедупликация, alias cutover, повторная обработка документа). После такого изменения перегенерировать probe и запустить drill вручную, не дожидаясь первого числа.
- Триаж: к `QdrantRestoreDrillStale` добавить расшифровку ошибки «mismatch in fields: point_id, chunk_id» без `content` = устаревший probe; добавить пункт для `QdrantRestoreDrillFailed`.

### 2d. Учёт

- Beads issue на инцидент (тип bug, закрыть после Части 1 и доставки Части 2).
- Заметка в память: «drill проваливается на эталоне, а не на бэкапе; 35-дневный порог даёт 4 дня тишины после месячного провала».

## Verification

- Часть 1: пункт 5 выше, плюс `curl http://localhost:9090/api/v1/query` на хосте для метрики и `amtool`/API Alertmanager для статуса алерта.
- Часть 2, локально:
  ```bash
  pnpm --filter @megacampus/course-gen-platform vitest run tests/unit/tools/qdrant/restore-drill.test.ts tests/unit/ops/qdrant-observability-contract.test.ts tests/unit/ops/monitoring-delivery-contract.test.ts
  docker run --rm -v "$PWD/ops/qdrant/prometheus:/rules:ro" prom/prometheus:v3.x promtool test rules /rules/alert-tests.yml
  pnpm type-check
  ```
  Образ `promtool` брать тот же, что в `deploy/qdrant/install-monitoring-config.sh`.
- После `/deploy`: `QDRANT_OPERATOR_IMAGE_SHA256` в `.env.production` меняется на новый digest, затем повторный ручной `systemctl start megacampus-qdrant-restore-drill.service` подтверждает, что pre-check проходит на актуальном probe.
- `scripts/orchestration/check_stranded_commits.py` перед заявлением о доставке.
