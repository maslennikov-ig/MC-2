# PWA Временно Отключён - Контекст и План Восстановления

**Дата:** 2025-12-31
**Версия:** 0.26.42
**Статус:** PWA отключён для диагностики 502 ошибок

---

## Проблема

После каждого деплоя пользователи получали **502 Bad Gateway** ошибки. Требовалось вручную очищать Site Data для восстановления работы.

### Причина

Service Worker (PWA) кешировал JS-чанки с хешами от предыдущей сборки:
```
/_next/static/chunks/app-abc123.js  (закешировано SW)
```

После деплоя эти файлы больше не существуют на сервере:
```
/_next/static/chunks/app-xyz789.js  (новый файл)
```

nginx возвращал 502 при попытке загрузить несуществующие файлы из кеша SW.

---

## Что было сделано

### 1. Отключён PWA (`next.config.ts`)

```typescript
const withPWA = require('@ducanh2912/next-pwa').default({
  // ...
  disable: true,  // <-- ВРЕМЕННО ОТКЛЮЧЕНО
  // ...
})
```

**Файл:** `packages/web/next.config.ts:14`

### 2. Добавлен Kill Switch скрипт (`layout.tsx`)

Скрипт автоматически очищает все кеши и SW при первой загрузке:

```typescript
<Script
  id="sw-kill-switch"
  strategy="beforeInteractive"
  dangerouslySetInnerHTML={{
    __html: `
      // Очищает все SW и кеши, затем перезагружает страницу
      // Ключ: 'mc-sw-killed' в sessionStorage
    `
  }}
/>
```

**Файл:** `packages/web/app/[locale]/layout.tsx:163-234`

### 3. Исправлена версия в логах (`Dockerfile`)

Добавлен `APP_VERSION` из package.json в контейнер через entrypoint script.

**Файл:** `packages/web/Dockerfile:63-64, 98-112, 124`

### 4. Исправлены буферы nginx (ГЛАВНАЯ ПРИЧИНА 502!)

**ВАЖНО:** При дальнейшем анализе выяснилось, что основная причина 502 была **НЕ в PWA**, а в недостаточном размере буферов nginx для обработки больших HTTP headers.

Ошибка в логах nginx:
```
upstream sent too big header while reading response header from upstream
```

**Причина:** Next.js отправляет большие HTTP headers когда пользователь авторизован (cookies + auth tokens). Дефолтные буферы nginx (4k) слишком маленькие.

**Решение:** Увеличены буферы в `/etc/nginx/sites-enabled/megacampus`:
```nginx
location / {
    # Fix for "upstream sent too big header" 502 errors
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_headers_hash_max_size 512;
    proxy_headers_hash_bucket_size 128;
    ...
}
```

**Файл:** `nginx-megacampus.conf` (добавлен в репозиторий)

---

## Как включить PWA обратно

### Шаг 1: Убедиться что проблема решена

- [ ] Протестировать несколько деплоев без 502 ошибок
- [ ] Убедиться что Kill Switch работает (очищает старые кеши)
- [ ] Проверить что пользователи не жалуются на ошибки

### Шаг 2: Изменить конфигурацию PWA

В файле `packages/web/next.config.ts`:

```typescript
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  disable: false,  // <-- ИЗМЕНИТЬ на false
  reloadOnOnline: true,
  customWorkerSrc: 'worker',

  // КРИТИЧНО: оба параметра нужны вместе
  cacheStartUrl: false,
  dynamicStartUrl: false,

  cleanupOutdatedCaches: true,
  cacheId: `megacampus-${APP_VERSION}`,
  extendDefaultRuntimeCaching: false,
  buildExcludes: [/app-build-manifest\.json$/, /\.map$/],
  publicExcludes: ['!_next/**/*'],

  workboxOptions: {
    // КРИТИЧНО: эти параметры ДОЛЖНЫ быть внутри workboxOptions
    // На верхнем уровне они ИГНОРИРУЮТСЯ!
    skipWaiting: false,
    clientsClaim: false,

    // Исключить JS/CSS/JSON из precache
    exclude: [/\.js$/, /\.css$/, /\.json$/],

    // Кешировать ТОЛЬКО статику (шрифты, картинки, медиа)
    // НЕ кешировать JS/CSS/JSON - они меняются при каждом деплое
    runtimeCaching: [
      // Google Fonts, локальные шрифты, картинки, аудио, видео
      // БЕЗ JS/CSS/JSON правил!
    ]
  }
})
```

### Шаг 3: Оставить Kill Switch

Kill Switch скрипт можно оставить как страховку - он сработает только если есть старые кеши.

### Шаг 4: Задеплоить и протестировать

```bash
git add .
git commit -m "feat(web): re-enable PWA with safe configuration"
git push origin master
```

---

## Ключевые уроки

1. **skipWaiting/clientsClaim** должны быть в `workboxOptions`, не на верхнем уровне
2. **dynamicStartUrl: false** нужен вместе с `cacheStartUrl: false`
3. **НЕ кешировать JS/CSS/JSON** - они меняются при каждом деплое
4. **Версия в cacheId** помогает инвалидировать кеши при деплое

---

## Связанные файлы

- `packages/web/next.config.ts` - конфигурация PWA
- `packages/web/app/[locale]/layout.tsx` - Kill Switch скрипт
- `packages/web/components/pwa/ServiceWorkerManager.tsx` - управление SW
- `packages/web/worker/index.js` - кастомный воркер

---

## TODO

- [x] ~~Через 1-2 недели включить PWA обратно~~ → **Можно включить сейчас!**
      Выяснилось что 502 был из-за nginx буферов, не PWA.
- [ ] Убрать Kill Switch после стабилизации (опционально)
- [ ] Рассмотреть NetworkFirst стратегию для HTML страниц

---

## Обновление 2026-01-01

**502 ошибки были вызваны nginx, а не PWA!**

Теперь когда nginx исправлен, PWA можно безопасно включить обратно.
Конфигурация PWA (skipWaiting: false, exclude JS/CSS) была правильной.
