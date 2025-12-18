# Debug RLS для generation_trace

## Шаг 1: Декодировать токен и тестировать запрос (ВСЁ В ОДНОМ)

```javascript
// Декодирование base64 cookie (URL-safe формат) и тест запроса
const cookie = document.cookie.split(';').find(c => c.includes('sb-diqooqbuchsliypgwksu-auth-token'))?.split('=')[1];
const base64 = cookie.replace('base64-', '').replace(/-/g, '+').replace(/_/g, '/');
const jsonStr = decodeURIComponent(escape(atob(base64)));
const tokenData = JSON.parse(jsonStr);
console.log('User ID:', tokenData?.user?.id);
console.log('Access Token:', tokenData?.access_token?.substring(0, 50) + '...');

// Тест запроса
fetch('https://diqooqbuchsliypgwksu.supabase.co/rest/v1/generation_trace?select=*&course_id=eq.6e6fbbcd-afd1-460d-b479-3c344cff7f01&limit=10', {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcW9vcWJ1Y2hzbGl5cGd3a3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTczNTIsImV4cCI6MjA3NTU3MzM1Mn0.NgS0kl5nL0HR5S3RJw1TeGQNaZy3xmhzmrBLcdBAn3w',
    'Authorization': 'Bearer ' + tokenData?.access_token
  }
}).then(r => r.json()).then(console.log).catch(console.error)
```

## Ожидаемые результаты:

- **Если вернётся массив с данными** - RLS работает, проблема в клиенте
- **Если вернётся пустой массив `[]`** - RLS блокирует запрос
- **Если ошибка 401/403** - проблема с авторизацией
