# Техническое задание: Улучшение универсального скрипта релиза

**Версия документа:** 2.0
**Дата:** 2025-12-17
**Автор:** Claude Code
**Статус:** Готово к реализации

---

## 1. Цель

Доработать универсальный bash-скрипт `release.sh` для надёжной работы в любых окружениях:
- Локальная разработка (macOS, Linux, WSL)
- CI/CD системы (GitHub Actions, GitLab CI, Jenkins, etc.)
- Различные версии bash (3.2+, 4.x, 5.x)
- Monorepo и single-package проекты

## 2. Текущие проблемы

### 2.1 SIGPIPE ошибки (критично)

**Найденные проблемные места в текущем скрипте:**

| Строка | Код | Риск |
|--------|-----|------|
| 346 | `git tag --sort=-version:refname \| head -n 1` | Высокий |
| 692 | `grep -n "..." \| head -1 \| cut -d: -f1` | Средний |
| 696 | `head -n $((unreleased_line))` | Низкий* |
| 704 | `head -n 6` | Низкий* |
| 857 | `git tag --sort=-version:refname \| head -n 10` | Высокий |

*Низкий риск: работа с файлами, не с командами генерирующими большой output

**Механизм проблемы:**
```bash
# При большом количестве тегов (>1000):
# 1. git tag выводит все теги
# 2. head читает первую строку и закрывает stdin
# 3. git получает SIGPIPE при попытке записи
# 4. pipefail перехватывает exit code 141
# 5. Скрипт завершается с ошибкой
```

**Текущий обходной путь (отсутствует):**
Скрипт не обрабатывает SIGPIPE, что приводит к спорадическим падениям.

### 2.2 Несовместимость с bash 3.2 (macOS)

Текущий скрипт использует:
- `declare -a` для массивов - **совместимо**
- `read -ra` - **совместимо**
- `[[ =~ ]]` regex - **совместимо** (но поведение может отличаться)
- Process substitution `<(...)` - **совместимо**

**Вывод:** Базовая совместимость есть, но regex паттерны могут работать нестабильно.

### 2.3 Хрупкая работа с CHANGELOG

Текущая реализация использует `head`/`tail` pipes для редактирования файла:
```bash
# Строки 696-699:
{
    echo "$existing_content" | head -n $((unreleased_line))
    echo ""
    echo "$new_entry"
    echo "$existing_content" | tail -n +$((unreleased_line + 1))
} > "$changelog_file"
```

**Проблема:** При очень большом CHANGELOG возможны race conditions.

### 2.4 Edge cases (новые)

1. **Первый релиз** - частично обработан (строки 347-351), но `HEAD~999999` - хак
2. **Конкурентный запуск** - нет защиты от одновременного запуска двумя разработчиками
3. **Remote ahead** - нет проверки что remote ушёл вперёд

## 3. Требования к решению

### 3.1 Функциональные требования

| ID | Требование | Приоритет | Статус |
|----|------------|-----------|--------|
| F1 | Автоматическое определение типа версии из conventional commits | Must | ✅ Есть |
| F2 | Ручное указание типа версии (patch/minor/major) | Must | ✅ Есть |
| F3 | Генерация CHANGELOG в формате Keep a Changelog | Must | ✅ Есть |
| F4 | Обновление версий во всех package.json (monorepo) | Must | ✅ Есть |
| F5 | Создание git tag с аннотацией | Must | ✅ Есть |
| F6 | Push в remote с тегами | Must | ✅ Есть |
| F7 | Автоматический rollback при ошибках | Must | ✅ Есть |
| F8 | Dry-run режим для предпросмотра | Should | ❌ Нет |
| F9 | Проверка remote ahead перед push | Should | ❌ Нет |
| F10 | Lock-файл для защиты от конкурентного запуска | Could | ❌ Нет |

### 3.2 Нефункциональные требования

| ID | Требование | Критерий | Статус |
|----|------------|----------|--------|
| NF1 | Совместимость с bash 3.2+ | Тесты на macOS default bash | ⚠️ Частично |
| NF2 | Отсутствие внешних зависимостей | Только bash, git, node (для JSON) | ✅ Есть |
| NF3 | Корректная работа с pipefail | Никаких SIGPIPE ошибок | ❌ Нет |
| NF4 | Время выполнения | < 30 секунд для 1000 коммитов | ✅ Есть |
| NF5 | Идемпотентность | Повторный запуск безопасен | ⚠️ Частично |

## 4. Техническое решение

### 4.1 Исправление SIGPIPE

**Выбранный подход: Вариант A - использовать `awk` вместо `head`**

**Обоснование выбора:**
- ✅ Работает в bash 3.2 (macOS) без ограничений
- ✅ Не требует process substitution
- ✅ awk корректно завершает pipe без SIGPIPE
- ✅ Минимальные изменения в коде
- ✅ Хорошо документированный паттерн

**Реализация утилитной функции:**
```bash
# === SIGPIPE-SAFE UTILITIES ===

# Безопасная замена head -n N
# Не вызывает SIGPIPE, работает в bash 3.2+
safe_head() {
    local n="${1:-1}"
    awk -v n="$n" 'NR <= n {print} NR > n {exit}'
}

# Безопасная замена head -n 1 (оптимизированная)
safe_first() {
    awk 'NR==1 {print; exit}'
}

# Использование:
LAST_TAG=$(git tag --sort=-version:refname | safe_first)
git tag --sort=-version:refname | safe_head 10
```

**Изменения в коде:**

| Строка | Было | Стало |
|--------|------|-------|
| 346 | `git tag ... \| head -n 1` | `git tag ... \| safe_first` |
| 692 | `grep ... \| head -1 \| cut ...` | `grep ... \| safe_first \| cut ...` |
| 857 | `git tag ... \| head -n 10` | `git tag ... \| safe_head 10` |

### 4.2 Обработка первого релиза

**Текущая проблема:**
```bash
# Строки 347-351 - хак с HEAD~999999
if [ -z "$LAST_TAG" ]; then
    LAST_TAG="HEAD~999999"  # Магическое число
    COMMITS_RANGE="HEAD"
```

**Решение:**
```bash
get_commits_range() {
    local last_tag="$1"

    if [ -z "$last_tag" ]; then
        # Первый релиз - получить все коммиты от начала истории
        local first_commit
        first_commit=$(git rev-list --max-parents=0 HEAD | safe_first)
        echo "${first_commit}..HEAD"
    else
        echo "${last_tag}..HEAD"
    fi
}

# Использование:
LAST_TAG=$(git tag --sort=-version:refname | safe_first || echo "")
if [ -z "$LAST_TAG" ]; then
    log_warning "No previous git tags found (first release)"
    log_info "Will include all commits from repository start"
    COMMITS_RANGE=$(get_commits_range "")
    INITIAL_VERSION="0.0.0"  # Базовая версия для первого релиза
else
    COMMITS_RANGE=$(get_commits_range "$LAST_TAG")
fi
```

### 4.3 Проверка remote ahead

**Новая функция:**
```bash
check_remote_status() {
    log_info "Checking remote status..."

    # Fetch latest from remote (without merging)
    git fetch origin "$BRANCH" --quiet 2>/dev/null || {
        log_warning "Could not fetch from remote (offline mode)"
        return 0
    }

    # Check if remote is ahead
    local behind
    behind=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")

    if [ "$behind" -gt 0 ]; then
        log_error "Remote is $behind commit(s) ahead of local"
        echo ""
        log_info "Please pull changes first:"
        echo "  git pull origin $BRANCH"
        exit 1
    fi

    log_success "Local branch is up to date with remote"
}
```

### 4.4 Dry-run режим

**Реализация:**
```bash
# В секции аргументов:
DRY_RUN="false"

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n)
            DRY_RUN="true"
            ;;
        # ... остальные аргументы
    esac
done

# Обёртка для команд с побочными эффектами:
execute_or_dry() {
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY-RUN] Would execute: $*"
        return 0
    fi
    "$@"
}

# Использование:
execute_or_dry git commit -m "..."
execute_or_dry git tag -a "..."
execute_or_dry git push origin "$BRANCH" --follow-tags
```

### 4.5 Lock-файл (опционально)

**Реализация:**
```bash
LOCK_FILE="/tmp/release-${PROJECT_ROOT//\//_}.lock"

acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null)

        # Проверить, жив ли процесс
        if kill -0 "$pid" 2>/dev/null; then
            log_error "Another release is in progress (PID: $pid)"
            log_info "If this is stale, remove: $LOCK_FILE"
            exit 1
        fi

        # Процесс мёртв, удалить stale lock
        rm -f "$LOCK_FILE"
    fi

    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}

# Добавить в cleanup:
trap 'release_lock; cleanup' EXIT
```

### 4.6 Структура скрипта (обновлённая)

```
release.sh
├── Configuration
│   ├── Constants (colors, paths)
│   ├── Platform detection (для будущего)
│   └── Argument parsing (+ --dry-run)
├── SIGPIPE-Safe Utilities (NEW)
│   ├── safe_head()
│   ├── safe_first()
│   └── get_commits_range()
├── Utility Functions
│   ├── Logging (info, success, warning, error)
│   └── execute_or_dry() (NEW)
├── Locking (NEW - optional)
│   ├── acquire_lock()
│   └── release_lock()
├── Backup & Rollback
│   ├── create_backup()
│   ├── restore_from_backups()
│   └── cleanup()
├── Pre-flight Checks
│   ├── run_preflight_checks()
│   └── check_remote_status() (NEW)
├── Commit Parsing
│   ├── parse_commits()
│   └── detect_version_bump()
├── Version Management
│   ├── calculate_new_version()
│   └── update_package_files()
├── Changelog
│   ├── generate_changelog_entry()
│   ├── format_changelog_line()
│   └── update_changelog()
├── Release Execution
│   ├── show_preview()
│   ├── get_user_confirmation()
│   └── execute_release()
└── Entry Point
    └── main()
```

## 5. API скрипта

### 5.1 Использование

```bash
# Автоопределение версии из коммитов
./release.sh

# Указание типа версии
./release.sh patch|minor|major

# Без подтверждения (для CI)
./release.sh --yes
./release.sh patch --yes

# Dry-run (только предпросмотр) - NEW
./release.sh --dry-run
./release.sh -n

# Комбинация
./release.sh minor --dry-run --yes
```

### 5.2 Exit коды

| Код | Описание | CI интерпретация |
|-----|----------|------------------|
| 0 | Успешный релиз | Success |
| 1 | Ошибка валидации (не в git repo, нет коммитов, etc.) | Failure |
| 2 | Ошибка git операции (push failed, tag exists) | Failure |
| 3 | Отмена пользователем | Success (user choice) |
| 4 | Rollback выполнен после ошибки | Failure (but safe) |

### 5.3 Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `RELEASE_BRANCH` | Ветка для релизов | auto-detect* |
| `RELEASE_TAG_PREFIX` | Префикс тегов | `v` |
| `RELEASE_DRY_RUN` | Режим dry-run | `false` |
| `RELEASE_NO_PUSH` | Не пушить | `false` |
| `RELEASE_SKIP_REMOTE_CHECK` | Пропустить проверку remote | `false` |
| `CI` | Автоопределение CI окружения | - |
| `NO_COLOR` | Отключить цветной вывод | - |

*auto-detect: `git branch --show-current`

## 6. План реализации

### Фаза 1: Критические исправления (Must)

1. [ ] Добавить `safe_head()` и `safe_first()` функции
2. [ ] Заменить все `head -n` на safe-версии
3. [ ] Исправить обработку первого релиза
4. [ ] Добавить `check_remote_status()`
5. [ ] Добавить shellcheck валидацию

### Фаза 2: Улучшения (Should)

6. [ ] Реализовать `--dry-run` режим
7. [ ] Добавить `NO_COLOR` поддержку для CI
8. [ ] Автоопределение ветки (вместо hardcoded `main`)

### Фаза 3: Дополнительно (Could)

9. [ ] Lock-файл для конкурентной защиты
10. [ ] Интеграция с GitHub Releases API
11. [ ] Pre-release версии (alpha, beta, rc)

## 7. Тестирование

### 7.1 Ручное тестирование SIGPIPE fix

```bash
# Создать много тегов для теста
for i in $(seq 1 2000); do
    git tag "test-v0.0.$i" 2>/dev/null || true
done

# Запустить с pipefail
set -o pipefail
git tag --sort=-version:refname | awk 'NR==1 {print; exit}'

# Проверить exit code
echo "Exit code: $?"  # Должен быть 0

# Очистить тестовые теги
git tag -l "test-v*" | xargs git tag -d
```

### 7.2 Unit-тесты функций

```bash
# tests/release-functions.sh

test_safe_first() {
    local result
    result=$(echo -e "first\nsecond\nthird" | safe_first)
    assert_equals "first" "$result"
}

test_safe_head_multiple() {
    local result
    result=$(echo -e "1\n2\n3\n4\n5" | safe_head 3)
    assert_equals "1
2
3" "$result"
}

test_get_commits_range_with_tag() {
    local result
    result=$(get_commits_range "v1.0.0")
    assert_equals "v1.0.0..HEAD" "$result"
}

test_get_commits_range_first_release() {
    # Требует git repo
    local result
    result=$(get_commits_range "")
    assert_matches "^[a-f0-9]+\.\.HEAD$" "$result"
}
```

### 7.3 Интеграционные тесты

```bash
# tests/integration/release-workflow.sh

setup() {
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    git init
    echo '{"name": "test", "version": "0.0.0"}' > package.json
    git add .
    git commit -m "initial"
}

test_first_release() {
    echo "change" >> file.txt
    git add . && git commit -m "feat: add feature"

    ./release.sh patch --yes --dry-run

    assert_exit_code 0
    assert_output_contains "0.0.0 → 0.0.1"
}

test_sigpipe_with_many_tags() {
    # Создать 2000 тегов
    for i in $(seq 1 2000); do
        git tag "v0.0.$i"
    done

    echo "change" >> file.txt
    git add . && git commit -m "fix: bug"

    ./release.sh patch --yes --dry-run

    assert_exit_code 0  # Не должно упасть с SIGPIPE
}

teardown() {
    rm -rf "$TEST_DIR"
}
```

### 7.4 Платформенные тесты

- [ ] Ubuntu 22.04 (bash 5.1)
- [ ] Ubuntu 20.04 (bash 5.0)
- [ ] macOS 13+ (bash 3.2)
- [ ] macOS с Homebrew bash 5.x
- [ ] Windows WSL2
- [ ] GitHub Actions ubuntu-latest
- [ ] GitLab CI alpine

## 8. Миграция

### 8.1 Обратная совместимость

Новая версия является drop-in replacement:
- ✅ Те же аргументы командной строки
- ✅ Те же exit коды
- ✅ Тот же формат CHANGELOG
- ✅ Новые флаги (`--dry-run`) опциональны

### 8.2 План миграции

1. Реализовать изменения в feature ветке
2. Прогнать тесты на всех платформах
3. Заменить скрипт в claude-code-orchestrator-kit
4. Синхронизировать в megacampus2 и другие проекты

## 9. Альтернативы (отклонены)

### 9.1 Вариант B: Process substitution
```bash
read -r LAST_TAG < <(git tag --sort=-version:refname)
```
**Отклонён:** Не работает в bash 3.2 на macOS (требует /dev/fd)

### 9.2 Вариант C: Функция с read
```bash
_get_first_line() {
    local line
    IFS= read -r line || true
    printf '%s' "$line"
}
```
**Отклонён:** Сложнее чем awk, нет преимуществ

### 9.3 Глобальный trap SIGPIPE
```bash
trap '' PIPE
```
**Отклонён:** Скрывает реальные ошибки SIGPIPE, плохая практика

### 9.4 Внешние инструменты (semantic-release, release-please)
**Отклонены:** Требуют дополнительных зависимостей, сложная конфигурация

---

## Приложения

### A. Полный код safe_head и safe_first

```bash
# === SIGPIPE-SAFE UTILITIES ===
# Эти функции заменяют head для избежания SIGPIPE ошибок
# при работе с pipefail в bash 3.2+

# Безопасная замена head -n N
# Читает ровно n строк и корректно завершает pipeline
# Usage: command | safe_head 5
safe_head() {
    local n="${1:-1}"
    awk -v n="$n" 'NR <= n {print} NR > n {exit}'
}

# Оптимизированная версия для получения первой строки
# Usage: command | safe_first
safe_first() {
    awk 'NR==1 {print; exit}'
}
```

### B. CI-specific настройки

```bash
# Автоматическое определение CI окружения
detect_ci_environment() {
    if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${GITLAB_CI:-}" ]; then
        CI_MODE="true"

        # Отключить цвета в CI если не TTY
        if [ ! -t 1 ] || [ -n "${NO_COLOR:-}" ]; then
            RED=''
            GREEN=''
            YELLOW=''
            BLUE=''
            NC=''
        fi

        # Автоматическое подтверждение в CI
        AUTO_CONFIRM="true"
    fi
}
```

### C. Diff с текущей версией

Основные изменения относительно текущего `release.sh`:

1. **+50 строк**: SIGPIPE-safe utilities
2. **+30 строк**: check_remote_status()
3. **+40 строк**: dry-run support
4. **+20 строк**: улучшенная обработка первого релиза
5. **~10 строк**: замена head на safe_first/safe_head

**Общий объём изменений:** ~150 строк (из 960 текущих = 15%)

---

## Контрольный список готовности

### Фаза 1 (критично)
- [ ] Все `head -n` паттерны заменены на safe_head/safe_first
- [ ] Скрипт проходит `shellcheck` без ошибок/warnings
- [ ] Тест с 2000 тегами не вызывает SIGPIPE
- [ ] Первый релиз (без тегов) работает корректно
- [ ] Remote ahead блокирует релиз

### Фаза 2 (желательно)
- [ ] `--dry-run` режим реализован
- [ ] `NO_COLOR` поддержка для CI
- [ ] Тесты на bash 3.2 (macOS) успешны
- [ ] Тесты на bash 5.x (Linux) успешны

### Фаза 3 (опционально)
- [ ] Lock-файл реализован
- [ ] Документация обновлена
- [ ] Миграция в проекты выполнена
