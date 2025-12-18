# AI-Powered Release Process

**Автоматический релиз с AI-обновлением всех версий в проекте**

---

## Обзор

Команда `/push` теперь использует AI для автоматического поиска и обновления **всех** упоминаний версии в проекте, не только в package.json.

### Что обновляется автоматически

**Скриптом** (.claude/scripts/release.sh):
- ✅ Все `package.json` файлы
- ✅ `CHANGELOG.md` (новая секция)
- ✅ Git tag и commit

**AI агентом** (version-updater):
- ✅ Документация (`README.md`, `*.md`)
- ✅ JSDoc комментарии (`@version 0.3.0`)
- ✅ Примеры использования в документации
- ✅ Команды установки (npm install packages@version)
- ✅ Любые другие упоминания версии

### Что НЕ обновляется

❌ Исторические записи в CHANGELOG.md
❌ Старые отчёты с датами (*-REPORT.md)
❌ Файлы в node_modules, dist, build
❌ Git история

---

## Использование

### Простой релиз (автоопределение версии)

```bash
/push
```

AI автоматически определит тип версии из коммитов:
- **major** (1.0.0): если есть breaking changes
- **minor** (0.4.0): если есть новые features
- **patch** (0.3.1): если только bug fixes

### Ручное указание версии

```bash
/push patch   # 0.3.0 → 0.3.1
/push minor   # 0.3.0 → 0.4.0
/push major   # 0.3.0 → 1.0.0
```

---

## Workflow (пошагово)

### Шаг 1: Запуск релиза

Команда `/push` выполняет скрипт:

```
╔═══════════════════════════════════════════════════════════╗
║         MegaCampusAI Release Automation                  ║
╚═══════════════════════════════════════════════════════════╝

ℹ️  Running pre-flight checks...
✅ On branch: 001-stage-0-foundation
✅ Current version: 0.4.0
✅ Found 15 commits since last release

ℹ️  Commit summary:
   ✨ 5 features
   🐛 3 bug fixes

✅ Auto-detected version bump: minor (Found 5 new features)

═══════════════════════════════════════════════════════════
                    RELEASE PREVIEW
═══════════════════════════════════════════════════════════

📌 Version: 0.5.0 → 0.6.0 (MINOR)
📊 Commits included: 15
📦 Package Updates: 5 files
📄 CHANGELOG.md: Updated

═══════════════════════════════════════════════════════════

ℹ️  Updating package.json files...
  ✓ packages/trpc-client-sdk/package.json
  ✓ packages/shared-types/package.json
  ✓ packages/course-gen-platform/package.json
  ✓ package.json
  ✓ courseai-next/package.json

ℹ️  Creating AI version update plan...
✅ Created .version-update-plan.json for AI agent

ℹ️  Updating CHANGELOG.md...
✅ CHANGELOG.md updated
```

### Шаг 2: AI Pause (Автоматически)

Скрипт останавливается и показывает:

```
ℹ️  🤖 AI Version Update Required

The version-updater agent will now find and update ALL version references.
Plan file created: .version-update-plan.json

Claude Code will automatically invoke the version-updater agent.
This will update:
  • Documentation (README.md, *.md files)
  • Source code (@version JSDoc comments)
  • Example commands and references

Press Enter when AI has completed version updates (or Ctrl+C to cancel)...
```

**В этот момент вы должны:**

В чате с Claude Code напишите:

```
Use the version-updater agent to find and update ALL version references.
```

Или более подробно:

```
Use the version-updater agent to find and update ALL version references in the project.

Read the version update plan from `.version-update-plan.json` and execute the complete workflow:
1. Search for all old version references
2. Categorize findings (documentation, source code, examples)
3. Skip historical references (CHANGELOG, old reports)
4. Update all current references
5. Validate changes (type-check, build)
6. Generate comprehensive report
```

### Шаг 3: AI работает

AI агент выполняет:

```
Phase 1: Discovery
✅ Read .version-update-plan.json
   Old: 0.5.0 → New: 0.6.0

Phase 2: Search
✅ Found 18 version references across project

Phase 3: Categorize
   Documentation: 8 files
   Source Code: 3 files
   Examples: 4 files
   Historical: 3 files (will skip)

Phase 4: Filter
✅ Filtered to 15 files to update

Phase 5: Update
✅ Updated packages/trpc-client-sdk/README.md
✅ Updated packages/trpc-client-sdk/src/index.ts
✅ Updated packages/trpc-client-sdk/IMPLEMENTATION_SUMMARY.md
   ... (12 more files)

Phase 6: Validate
✅ pnpm type-check: PASSED
✅ pnpm build: PASSED

Phase 7: Report
✅ Generated version-update-report.md
```

**AI создаст отчёт**: `version-update-report.md`

### Шаг 4: Продолжение релиза

После завершения AI, нажмите **Enter** в терминале:

```
Press Enter when AI has completed version updates... ← [Enter]

ℹ️  Cleaned up version update plan
ℹ️  Staging AI version update changes...
ℹ️  Executing release...

ℹ️  Creating release commit...
✅ Commit created

ℹ️  Creating git tag...
✅ Tag v0.6.0 created

ℹ️  Pushing to remote...
✅ Pushed to origin/001-stage-0-foundation

╔═══════════════════════════════════════════════════════════╗
║              RELEASE SUCCESSFUL! 🎉                       ║
╚═══════════════════════════════════════════════════════════╝

✅ Released v0.6.0
✅ Tag: v0.6.0
✅ Branch: 001-stage-0-foundation
```

---

## Технические детали

### Файлы конфигурации

**`.version-update-plan.json`** (создаётся автоматически):

```json
{
  "oldVersion": "0.5.0",
  "newVersion": "0.6.0",
  "date": "2025-10-16",
  "projectRoot": "/home/me/code/megacampus2",
  "branch": "001-stage-0-foundation",
  "exclude": [
    "node_modules",
    ".next",
    "dist",
    "build",
    ".turbo",
    ".git",
    "package-lock.json"
  ],
  "preserveHistorical": true,
  "changelogFile": "CHANGELOG.md",
  "skipPatterns": [
    "CHANGELOG.md historical entries",
    "Dated report files (*-REPORT.md with dates before today)",
    "package.json files (already updated by script)"
  ]
}
```

### AI Agent

**Агент**: `.claude/agents/version-updater.md`

**Инструменты**:
- `Read` - чтение плана и файлов
- `Grep` - поиск версий в проекте
- `Edit` - обновление файлов
- `Bash` - валидация (type-check, build)
- `Glob` - поиск файлов по паттернам

**Интеллектуальная фильтрация**:
- Пропускает исторические записи в CHANGELOG
- Не трогает старые отчёты с датами
- Пропускает package.json (уже обновлён)
- Игнорирует node_modules, dist, build

### Скрипт релиза

**Файл**: `.claude/scripts/release.sh`

**Новые функции**:
- `create_version_update_plan()` - создание плана для AI
- `cleanup_version_update_plan()` - удаление плана после использования

**Модифицированная функция**:
- `main()` - добавлена пауза для AI обновлений

---

## Примеры использования

### Пример 1: Релиз с features

```bash
# Коммиты:
# feat(api): add new endpoint
# feat(ui): add dashboard
# fix(auth): fix login bug

/push
# → Автоопределение: minor (0.5.0 → 0.6.0)
```

### Пример 2: Релиз hotfix

```bash
# Коммиты:
# fix(critical): fix security issue
# fix(ui): fix button alignment

/push patch
# → Ручное указание: patch (0.4.0 → 0.4.1)
```

### Пример 3: Breaking changes

```bash
# Коммиты:
# feat!: redesign API (BREAKING CHANGE)
# feat: add new feature

/push
# → Автоопределение: major (0.4.0 → 1.0.0)
```

---

## Отчёты AI

После каждого релиза AI создаёт отчёт: `version-update-report.md`

**Содержание**:
- Summary (сколько файлов обновлено)
- Changes Made (детальный список изменений)
- Skipped Files (что пропущено и почему)
- Validation Results (результаты проверок)

**Пример отчёта**:

```markdown
# Version Update Report

## Summary
- Old version: 0.5.0
- New version: 0.6.0
- Files scanned: 145
- Files updated: 15
- Files skipped: 8

## Changes Made

### Documentation (8 files)
- packages/trpc-client-sdk/README.md
  - Line 5: "**Version**: 0.5.0" → "**Version**: 0.6.0"

### Source Code (3 files)
- packages/trpc-client-sdk/src/index.ts
  - Line 3: "@version 0.5.0" → "@version 0.6.0"

## Skipped Files
- CHANGELOG.md (historical entries preserved)
- bug-hunting-report.md (old report dated 2025-10-15)

## Validation
✅ Type-check passed
✅ Build successful
```

---

## Универсальность

Этот подход **полностью универсален** и работает в любом проекте:

### Для нового проекта

1. Скопируйте файлы:
   ```bash
   .claude/agents/version-updater.md
   .claude/scripts/release.sh
   .claude/commands/push.md
   ```

2. Готово! Команда `/push` работает из коробки

### Кастомизация

Если в вашем проекте есть специфичные места с версиями:

1. AI автоматически их найдёт (умный поиск по всему проекту)
2. Или добавьте паттерны в `.version-update-plan.json` в скрипте

**Не требуется**:
- ❌ Ручная настройка паттернов
- ❌ Модификация скрипта под проект
- ❌ Создание списков файлов

**AI делает всё сам**:
- ✅ Поиск версий по всему проекту
- ✅ Умная фильтрация (история vs текущее)
- ✅ Контекстное обновление
- ✅ Детальный отчёт

---

## Troubleshooting

### Проблема: AI не находит версии

**Решение**: Проверьте `.version-update-plan.json`:
```bash
cat .version-update-plan.json
```

Убедитесь, что `oldVersion` корректен.

### Проблема: AI обновил исторический CHANGELOG

**Решение**: AI агент специально запрограммирован пропускать исторические записи.
Если это произошло, откатите:
```bash
git checkout -- CHANGELOG.md
```

И запустите AI агента снова с явным указанием:
```
Skip all CHANGELOG.md entries except the latest release section at the top.
```

### Проблема: Скрипт завис на паузе

**Решение**: Просто запустите AI агента вручную:
```
Use the version-updater agent to find and update ALL version references.
```

После завершения AI, нажмите Enter в терминале.

### Проблема: Build failed после AI обновлений

**Решение**: AI автоматически проверяет build. Если он упал:
1. Посмотрите отчёт AI: `version-update-report.md`
2. Проверьте, что AI не обновил что-то неправильно
3. Исправьте вручную или откатите: `git checkout -- <file>`

---

## FAQ

**Q: Можно ли пропустить AI обновления?**
A: Да, просто нажмите Enter сразу. Но тогда версии в документации не обновятся.

**Q: Сколько времени занимает AI?**
A: 1-3 минуты в зависимости от размера проекта.

**Q: Можно ли использовать в CI/CD?**
A: Да, но нужно будет автоматизировать вызов AI агента через API.

**Q: Работает ли это в других проектах?**
A: Да! Просто скопируйте 3 файла (agent, script, command) - и всё работает.

**Q: Что если у меня нестандартные места с версиями?**
A: AI найдёт их автоматически через поиск по всему проекту.

---

## Следующие шаги

После успешного релиза:

1. ✅ Проверьте на GitHub: https://github.com/your-repo/releases
2. ✅ Просмотрите отчёт AI: `version-update-report.md`
3. ✅ Создайте GitHub Release (опционально)
4. ✅ Уведомите команду

---

**Документация создана**: 2025-10-16
**Версия**: 1.0.0
**Проект**: MegaCampusAI
