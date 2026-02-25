# Plan: NotebookLM Bridge - Server Deployment Fix

## Context

NotebookLM bridge работает **только локально** (через `start-dev.sh`). На сервере после деплоя через CI/CD он **не запустится** из-за проблем в compose-файлах, используемых деплой-скриптами.

## Реализовано (шаги 1-4)

| Файл                                     | Что сделано                                                | Статус |
| ---------------------------------------- | ---------------------------------------------------------- | ------ |
| `docker-compose.infra.yml`               | +notebooklm-bridge сервис, +bridge env/dep в worker-stage7 | OK     |
| `docker-compose.app.yml`                 | +NOTEBOOKLM_BRIDGE_URL в api                               | OK     |
| `scripts/deploy_blue_green.sh`           | +mkdir secrets, worker-stage7 restart из infra.yml         | OK     |
| `scripts/deploy_dev.sh`                  | +mkdir secrets, нумерация шагов                            | OK     |
| GitHub Secret: `NOTEBOOKLM_BRIDGE_TOKEN` | Добавлен                                                   | OK     |
| GitHub Secret: `NOTEBOOKLM_AUTH_JSON`    | Добавлен (15KB minified)                                   | OK     |

## Самопроверка: найденные проблемы

### BUG: `NOTEBOOKLM_AUTH_JSON` в CI/CD heredoc сломает деплой

В `.github/workflows/ci-cd.yml` строки 648 и 808 добавлена строка:

```
NOTEBOOKLM_AUTH_JSON=${{ secrets.NOTEBOOKLM_AUTH_JSON }}
```

SSH-команда обёрнута в двойные кавычки:

```bash
ssh ... "cat > .env << 'ENVEOF'
...
NOTEBOOKLM_AUTH_JSON={"cookies":[{"name":"OTZ","value":"..."}]}
...
ENVEOF"
```

JSON содержит `"` (двойные кавычки), которые shell интерпретирует как конец аргумента SSH-команды. **Деплой упадёт** с синтаксической ошибкой.

### Исправление

**Убрать** `NOTEBOOKLM_AUTH_JSON` из CI/CD heredoc. Использовать **file-based auth**:

- CI/CD уже задаёт `NOTEBOOKLM_STORAGE_STATE_DIR=./secrets/notebooklm` и `NOTEBOOKLM_STORAGE_PATH`
- Deploy-скрипты уже создают `secrets/notebooklm/` директорию
- Docker compose монтирует `./secrets/notebooklm:/app/secrets/notebooklm:ro`
- Пользователю нужно один раз `scp` файл на сервер

Альтернатива (если хочется через CI/CD): использовать отдельный step с `printf` + stdin вместо heredoc, но это усложнение без необходимости.

## Что осталось сделать

1. **Убрать** `NOTEBOOKLM_AUTH_JSON=${{ secrets.NOTEBOOKLM_AUTH_JSON }}` из `.github/workflows/ci-cd.yml` (строки 648, 808)
2. **Ручной шаг**: `scp storage_state.json` на сервер

## Проверка корректности остальных изменений

| Проверка                                                | Результат                                     |
| ------------------------------------------------------- | --------------------------------------------- |
| YAML-синтаксис compose файлов                           | OK (docker compose config --quiet)            |
| Bash-синтаксис shell скриптов                           | OK (bash -n)                                  |
| container_name notebooklm-bridge консистентен           | OK (megacampus-notebooklm-bridge)             |
| worker-stage7 URL ссылается на правильный container     | OK (http://megacampus-notebooklm-bridge:8000) |
| worker-stage6 в deploy script берётся из production.yml | OK (определён только там)                     |
| worker и worker-stage6 не затронуты                     | OK                                            |
| infra.yml bridge env_file=.env.production               | OK (консистентно с worker, worker-stage7)     |
| NOTEBOOKLM_BRIDGE_TOKEN доступен через env_file         | OK (.env.production пишется CI/CD)            |
| GitHub Secret NOTEBOOKLM_BRIDGE_TOKEN                   | OK (добавлен, простой hex — без спецсимволов) |
