# Plan: Mass commit + push all repos in /home/me/code/

## Context

Массово закоммитить и запушить все изменения во всех git-репозиториях в `/home/me/code/`, **кроме `bobabuh`**.

## План выполнения

Один bash-цикл:

1. Перебираем все папки в `/home/me/code/*/`
2. Пропускаем `bobabuh`
3. Проверяем наличие `.git/` и remote origin
4. `git add -A` + `git commit -m "sync: push all local changes"`
5. `git push`
6. Логируем результат

### Скрипт:

```bash
for dir in /home/me/code/*/; do
  name=$(basename "$dir")
  [ "$name" = "bobabuh" ] && continue
  [ ! -d "$dir/.git" ] && continue
  remote=$(git -C "$dir" remote get-url origin 2>/dev/null)
  [ -z "$remote" ] && continue

  branch=$(git -C "$dir" branch --show-current)
  echo "=== $name ($branch) ==="
  git -C "$dir" add -A
  git -C "$dir" commit -m "sync: push all local changes" 2>/dev/null
  if git -C "$dir" push 2>&1; then
    echo "  OK"
  else
    echo "  PUSH FAILED"
  fi
  echo ""
done
```

## Исключения

- **bobabuh** — исключён по просьбе пользователя

## Верификация

Проверить вывод на наличие "PUSH FAILED".
