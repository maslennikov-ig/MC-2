# Диагностика: ERR_NAME_NOT_RESOLVED на dev.ai.megacampus.ru

## Ошибка

```
GET https://dev.ai.megacampus.ru/api/courses/default-organization/kak-stat-schastlivym-884c3af5/traces net::ERR_NAME_NOT_RESOLVED
[ERROR] [SW Manager] Fetch interceptor error {error: 'Failed to fetch'}
```

## Результаты расследования

### Курс существует

- ID: `2c921d06-4722-4b3b-8de1-97c24c37ebaa`
- Slug: `kak-stat-schastlivym-884c3af5`
- Status: `draft`
- API endpoint `/api/courses/[orgSlug]/[courseSlug]/traces/route.ts` — существует

### В error_logs ничего нет

Ни одной записи с этой ошибкой в БД — запрос не дошёл до сервера.

### Диагноз: DNS-проблема на стороне клиента

`ERR_NAME_NOT_RESOLVED` — браузер пользователя не смог разрешить домен `dev.ai.megacampus.ru` в IP-адрес. Это **не ошибка кода**.

Возможные причины:

1. Временный DNS-сбой
2. Сеть пользователя (корпоративный DNS, VPN, нестабильный интернет)
3. Деплой в момент запроса — мы пушили в develop (авто-деплой на dev), сервер перезагружался

Service Worker ошибка — вторичная: SW попытался fetch, получил ту же DNS-ошибку.

## Действия по коду: нет
