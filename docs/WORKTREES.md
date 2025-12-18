# Git Worktrees для параллельной разработки

Краткое руководство по использованию git worktrees в MegaCampusAI.

## Что это?

Git worktrees позволяют работать над несколькими фичами параллельно без переключения веток и stash.

**Структура:**
```
/home/me/code/
├── megacampus2/              ← основной worktree (main)
└── megacampus2-worktrees/    ← дополнительные worktrees
    ├── admin-panel/          ← фича 1
    ├── payment-system/       ← фича 2
    └── generation-json/      ← фича 3
```

## Команды

### Создать worktree
```bash
/worktree-create admin-panel
/worktree-create payment-system main
```

**Что происходит:**
1. Создается новая ветка `feature/admin-panel`
2. Создается worktree в `../megacampus2-worktrees/admin-panel/`
3. Копируются все файлы (включая .env, .vscode и др.)
4. Исключаются большие папки (node_modules, dist, .next)

### Список worktrees
```bash
/worktree-list
```

### Удалить worktree
```bash
/worktree-remove admin-panel              # ветка сохранится
/worktree-remove admin-panel --delete-branch  # удалить и ветку
```

### Очистка
```bash
/worktree-cleanup                # удалить административные файлы
/worktree-cleanup --remove-dirs  # + удалить orphaned директории
```

## Workflow

### 1. Создать worktree для новой фичи
```bash
cd /home/me/code/megacampus2
/worktree-create admin-panel
```

### 2. Начать работу
```bash
cd ../megacampus2-worktrees/admin-panel
pnpm install  # установить зависимости
code .        # открыть в VS Code
```

### 3. Работа над фичей
```bash
# Делайте коммиты как обычно
git add .
git commit -m "feat: add admin dashboard"
git push -u origin feature/admin-panel
```

### 4. Создать PR
```bash
gh pr create --title "feat: Admin Panel" --body "Description"
```

### 5. После мерджа - удалить worktree
```bash
cd /home/me/code/megacampus2
/worktree-remove admin-panel  # ветка останется
```

## Особенности

### Что копируется автоматически
- ✅ `.env*` файлы (все env файлы)
- ✅ `.mcp.json`, `.mcp.local.json`
- ✅ `.vscode/` настройки
- ✅ Все файлы проекта

### Что НЕ копируется (нужно переустановить)
- ❌ `node_modules/` → запустите `pnpm install`
- ❌ `.next/`, `dist/`, `build/` → будут сгенерированы при сборке

### Ограничения
- Нельзя checkout одну ветку в нескольких worktrees
- Основной worktree (main) нельзя удалить
- Каждый worktree должен быть на своей ветке

## Параллельная разработка

**Сценарий:** Работаете над админ-панелью, но нужно срочно исправить баг.

```bash
# Основной проект на main
cd /home/me/code/megacampus2

# Создать worktree для багфикса
/worktree-create urgent-bugfix

# Работа над багфиксом в новом worktree
cd ../megacampus2-worktrees/urgent-bugfix
# ... исправить баг ...
git commit -am "fix: urgent bug"
git push

# Вернуться к админ-панели (она осталась как была)
cd ../admin-panel
# ... продолжить работу над админ-панелью ...
```

## Команды git worktree (низкоуровневые)

Если нужно работать напрямую с git:

```bash
# Создать worktree для существующей ветки
git worktree add ../megacampus2-worktrees/feature-name existing-branch

# Список worktrees
git worktree list

# Удалить worktree
git worktree remove ../megacampus2-worktrees/feature-name

# Очистка
git worktree prune
```

## FAQ

**Q: Занимают ли worktrees много места?**
A: Нет! Все worktrees используют один `.git` репозиторий. Дополнительное место только на файлы проекта (~200-300 MB без node_modules).

**Q: Можно ли работать в разных worktrees одновременно?**
A: Да! Откройте каждый worktree в отдельном окне VS Code.

**Q: Что делать с секретами (.env)?**
A: Они автоматически копируются при создании worktree. Можете редактировать их независимо в каждом worktree.

**Q: Нужно ли запускать pnpm install в каждом worktree?**
A: Да! node_modules НЕ копируется (слишком большой), нужно установить зависимости в каждом worktree.

**Q: Можно ли переименовать/переместить worktree?**
A: Используйте `git worktree move <old-path> <new-path>` или удалите и создайте заново.

**Q: Как вернуться к обычной работе (без worktrees)?**
A: Удалите все worktrees (`/worktree-remove <name>`) и работайте в основном проекте как раньше.
