# MegaCampusAI Next.js

Современная платформа для автоматической генерации образовательных курсов на базе Next.js 15.

## ✅ Этап 1: Базовая инфраструктура (ЗАВЕРШЕН)

### Выполненные задачи:

- ✅ Инициализация Next.js проекта с pnpm
- ✅ Настройка TypeScript (strict mode), ESLint, Prettier
- ✅ Установка и конфигурация Tailwind CSS v4
- ✅ Интеграция shadcn/ui с поддержкой Tailwind v4
- ✅ Настройка Supabase клиента (SSR + Client)
- ✅ Создание базовой структуры проекта
- ✅ Docker конфигурация с pnpm

## 🚀 Быстрый старт

### Требования

- Node.js 20+
- pnpm 8+
- Docker (опционально)

### Установка

1. Клонируйте репозиторий:

```bash
cd courseai-next
```

2. Установите зависимости:

```bash
pnpm install
```

3. Скопируйте и настройте переменные окружения:

```bash
cp .env.example .env.local
# Отредактируйте .env.local с вашими значениями
```

4. Запустите проект в режиме разработки:

```bash
pnpm dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## 📁 Структура проекта

```
courseai-next/
├── app/                      # App Router
│   ├── (auth)/              # Защищенные страницы
│   │   ├── dashboard/       # Личный кабинет
│   │   ├── profile/         # Профиль пользователя
│   │   └── admin/           # Админ-панель
│   ├── (public)/            # Публичные страницы
│   │   ├── courses/         # Каталог курсов
│   │   └── create/          # Создание курса
│   ├── api/                 # API Routes
│   │   ├── auth/            # Аутентификация
│   │   ├── courses/         # CRUD курсов
│   │   └── webhooks/        # n8n webhooks
│   ├── layout.tsx           # Корневой layout
│   └── globals.css          # Глобальные стили
├── components/
│   ├── ui/                  # shadcn/ui компоненты
│   ├── features/            # Фиче-компоненты
│   ├── layouts/             # Layout компоненты
│   └── shared/              # Общие компоненты
├── lib/
│   ├── supabase/           # Supabase клиент
│   ├── api/                # API утилиты
│   ├── utils.ts            # Утилиты (cn)
│   └── validations/        # Zod схемы
├── hooks/                   # Custom hooks
├── types/                   # TypeScript типы
└── middleware.ts            # Next.js middleware
```

## 🐳 Docker

### Разработка с Docker:

```bash
docker-compose -f docker-compose.dev.yml up
```

### Production сборка:

```bash
docker-compose up --build
```

## 📝 Доступные команды

```bash
pnpm dev          # Запуск dev сервера с Turbopack
pnpm build        # Production сборка
pnpm start        # Запуск production сервера
pnpm lint         # Проверка ESLint
pnpm lint:fix     # Исправление ESLint ошибок
pnpm format       # Форматирование Prettier
pnpm type-check   # Проверка TypeScript типов
```

## 🛠 Технологический стек

- **Framework**: Next.js 15.5 (App Router)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: Supabase (PostgreSQL + pgvector)
- **Forms**: react-hook-form + zod
- **Package Manager**: pnpm
- **Deployment**: Docker + Caddy

## 🔧 Конфигурация

### Переменные окружения

Создайте `.env.local` файл на основе `.env.example`:

```env
# Supabase (ОБЯЗАТЕЛЬНО)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# n8n (ОБЯЗАТЕЛЬНО)
N8N_WEBHOOK_URL=https://flow8n.ru/webhook/coursegen
N8N_WEBHOOK_SECRET=your_webhook_secret

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Development Only
ENABLE_DEV_AUTH=false # Set to true ONLY for local development

# API Security (ОПЦИОНАЛЬНО)
API_KEY=your_secure_api_key # Generate with: openssl rand -hex 32
```

### 🔗 Функциональность Share (Публичные ссылки)

Приложение поддерживает создание публичных ссылок для курсов. Владельцы и администраторы могут поделиться курсом через уникальный токен.

#### Требования для работы Share:

1. **Переменные окружения:**
   - `NEXT_PUBLIC_SUPABASE_URL` - URL вашего Supabase проекта
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Публичный ключ Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` - Сервисный ключ для админ операций
   - `NEXT_PUBLIC_SITE_URL` - База URL для генерации ссылок

2. **База данных:**
   - Таблица `courses` должна иметь колонку `share_token` (TEXT, nullable)
   - RLS политики должны разрешать:
     - Аутентифицированным пользователям читать свои курсы
     - Обновлять `share_token` для своих курсов
     - Публичный доступ к курсам с валидным `share_token`

3. **Настройка RLS политик в Supabase:**

```sql
-- Разрешить владельцам обновлять share_token
CREATE POLICY "Owners can update share token" ON courses
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Публичный доступ к курсам с share_token
CREATE POLICY "Public can view shared courses" ON courses
FOR SELECT USING (share_token IS NOT NULL);
```

### 🐛 Отладка и мониторинг

#### Health Check Endpoint

Проверьте состояние системы:

```bash
curl http://localhost:3000/api/health
```

Endpoint проверяет:

- ✅ Переменные окружения
- ✅ Подключение к Supabase
- ✅ Систему аутентификации
- ✅ Генерацию share токенов

#### Debug утилиты

Используйте встроенные debug функции из `lib/debug.ts`:

```typescript
import { runDebugSuite } from '@/lib/debug'

// Запустить полную диагностику
const report = await runDebugSuite('course-slug')
```

### ⚠️ Устранение неполадок

#### Кнопка Share возвращает пустую ошибку:

1. Проверьте все переменные Supabase в `.env.local`
2. Убедитесь что cookies включены в браузере
3. Проверьте консоль браузера для детальных ошибок
4. Используйте `/api/health` для диагностики
5. Проверьте RLS политики в Supabase Dashboard

#### Ошибка аутентификации:

1. Убедитесь что пользователь залогинен
2. Проверьте срок действия сессии
3. Для разработки установите `ENABLE_DEV_AUTH=true`

#### Не создается share ссылка:

1. Проверьте права пользователя (должен быть владельцем или админом)
2. Убедитесь что курс существует
3. Проверьте логи в консоли браузера и сервера

## 📄 Лицензия

MIT

---

## 🚧 Следующие этапы разработки

### Этап 2: Публичные страницы (1 неделя)

- [ ] Главная страница с shader hero
- [ ] Страница создания курса
- [ ] Каталог курсов
- [ ] Просмотр курса и уроков
- [ ] Темная/светлая тема
- [ ] Адаптивная верстка

### Этап 3: Аутентификация (3-4 дня)

- [ ] Интеграция Supabase Auth
- [ ] Страницы входа/регистрации
- [ ] Восстановление пароля
- [ ] Email подтверждение
- [ ] Protected routes
- [ ] Middleware для авторизации

(См. полный план в `/docs/TZ_NextJS_Migration.md`)
