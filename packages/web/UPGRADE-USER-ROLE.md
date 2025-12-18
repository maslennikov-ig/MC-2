# Повышение роли пользователя

## Проблема
Студенты не могут создавать курсы. При попытке зайти на страницу `/create` они видят красивое уведомление с объяснением ограничения.

## Решение

### Способ 1: Через Supabase Dashboard (рекомендуется)

1. Откройте Supabase Dashboard: https://supabase.com/dashboard
2. Выберите проект: **diqooqbuchsliypgwksu**
3. Перейдите в **Table Editor** → **users**
4. Найдите пользователя по email
5. Измените поле `role` с `student` на `instructor` или `admin`
6. Сохраните изменения

### Способ 2: Через SQL Editor

⚠️ **ВАЖНО**: Обычные пользователи НЕ могут изменить свою роль из-за RLS политики. Для изменения роли нужны права администратора или использование service role ключа.

```sql
-- Обновить роль конкретного пользователя (требуется service role ключ)
UPDATE public.users
SET role = 'instructor'  -- или 'admin' или 'superadmin'
WHERE email = 'user@example.com';

-- Проверить изменения
SELECT id, email, role, organization_id
FROM public.users
WHERE email = 'user@example.com';
```

**Причина ограничения**: RLS политика `users_update_unified` блокирует изменение собственной роли пользователем. Это сделано для безопасности - только существующие администраторы могут повышать роли других пользователей.

### Способ 3: Через Supabase MCP (из Claude Code)

✅ **РЕКОМЕНДУЕТСЯ**: Supabase MCP автоматически использует service role ключ, обходя RLS политики.

```bash
# Используйте Supabase MCP для выполнения SQL
mcp__supabase__execute_sql({
  "query": "UPDATE public.users SET role = 'superadmin' WHERE email = 'user@example.com'"
})

# Проверить результат
mcp__supabase__execute_sql({
  "query": "SELECT id, email, role, organization_id FROM public.users WHERE email = 'user@example.com'"
})
```

## Роли в системе

| Роль | Права |
|------|-------|
| `student` | Только просмотр курсов (чтение) |
| `instructor` | Создание и управление своими курсами |
| `admin` | Полный доступ к организации |
| `superadmin` | Полный доступ ко всей системе (все организации) |

## После изменения роли

1. Пользователь должен **перелогиниться** (выйти и зайти снова)
2. Или **обновить JWT токен** (перезагрузка страницы)
3. После этого Auth Hook автоматически добавит новую роль в JWT
4. Страница `/create` покажет форму создания курса

## Автоматическое обновление JWT

JWT токен обновляется автоматически:
- При логине
- При обновлении страницы (если сессия активна)
- Custom Access Token Hook добавляет `role` и `organization_id` в JWT

## Проверка текущей роли

Пользователь может проверить свою роль:
1. Открыть консоль браузера (F12)
2. Выполнить:
```javascript
const token = localStorage.getItem('sb-diqooqbuchsliypgwksu-auth-token')
if (token) {
  const session = JSON.parse(token)
  const payload = JSON.parse(atob(session.access_token.split('.')[1]))
  console.log('Роль:', payload.role)
  console.log('Организация:', payload.organization_id)
}
```

## Устранение проблем

### Пользователь изменил роль, но всё равно видит ограничение

**Причина:** JWT токен не обновился

**Решение:**
1. Попросить пользователя выйти и войти снова
2. Или выполнить:
```javascript
// В консоли браузера
localStorage.clear()
window.location.reload()
```

### Роль изменилась в БД, но не в JWT

**Причина:** Auth Hook не работает или не обновляет claims

**Решение:**
1. Проверить, что функция `custom_access_token_hook` активна в Supabase
2. Перейти в Dashboard → Authentication → Hooks
3. Убедиться, что Hook "Generate access token" указывает на `custom_access_token_hook`

## Безопасность

- RLS политики автоматически проверяют роль из JWT
- Даже если кто-то попытается обойти UI, RLS заблокирует операцию
- Students получат ошибку: "new row violates row-level security policy"
