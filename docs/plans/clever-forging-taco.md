# Password Recovery + Google OAuth

## Context

Пользователи не могут восстановить пароль, если его забыли. Кнопка "Забыли пароль?" существует в login-form, но не имеет обработчика (noop). Также Google OAuth реализован фронтендом (social-buttons.tsx), но не работает: нет callback-роута для PKCE code exchange, и возможно не настроен провайдер в Supabase. Задача: сделать полноценный password recovery flow и подключить Google OAuth.

---

## Часть 1: Auth Infrastructure (callback/confirm роуты)

### 1.1 OAuth Callback Route

**Файл:** `packages/web/app/api/auth/callback/route.ts` (новый)

Назначение: обработка OAuth redirect после Google авторизации (PKCE code exchange).

```
GET /api/auth/callback?code=xxx&next=/ru/courses
```

Логика:

- Извлечь `code` и `next` из query params
- Создать серверный Supabase клиент (reuse `createClient` из `lib/supabase/server.ts`)
- Вызвать `supabase.auth.exchangeCodeForSession(code)`
- Redirect на `next` (default: `/`)
- Обработка ошибок: redirect на `/` с error toast

### 1.2 Email Confirm Route

**Файл:** `packages/web/app/api/auth/confirm/route.ts` (новый)

Назначение: обработка email-ссылок (password recovery, email confirmation).

```
GET /api/auth/confirm?token_hash=xxx&type=recovery&next=/ru/update-password
```

Логика:

- Извлечь `token_hash`, `type`, `next` из query params
- Вызвать `supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })`
- Для `type=recovery`: redirect на `next` (default: `/update-password`)
- Для других типов: redirect на `/`
- Обработка ошибок: redirect на `/` с error query param

---

## Часть 2: Password Recovery Flow

### 2.1 ForgotPasswordForm Component

**Файл:** `packages/web/components/auth/forgot-password-form.tsx` (новый)

Компонент формы "Забыли пароль":

- Поле email (с валидацией через Zod, как в login-form)
- Кнопка "Отправить ссылку для сброса"
- Вызов `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
  - `redirectTo` = `${origin}/api/auth/confirm` (Supabase добавит token_hash)
- Состояния: default → loading → success (показать "Проверьте почту")
- Кнопка "Назад к входу" для возврата в login

Переиспользование: паттерн и стили из `login-form.tsx`, `useSupabase()`, `toast`, `Icons`, `logger`

### 2.2 Auth Modal Update

**Файлы:**

- `packages/web/lib/hooks/use-auth-modal.ts` — добавить `'forgot-password'` в `AuthModalMode`
- `packages/web/components/auth/auth-modal.tsx` — добавить lazy-load ForgotPasswordForm + третий TabsContent
- `packages/web/components/auth/login-form.tsx` — привязать onClick на кнопку "Забыли пароль?" → `setMode('forgot-password')`

Изменения в `use-auth-modal.ts`:

```ts
export type AuthModalMode = 'login' | 'register' | 'forgot-password';
```

В `auth-modal.tsx`:

- Добавить lazy import: `const ForgotPasswordForm = lazy(() => ...)`
- Добавить `TabsContent` для `forgot-password` (без табов-переключателей — только кнопка "назад")
- Скрыть `TabsList` когда mode === 'forgot-password', показать стрелку "назад к входу"

В `login-form.tsx`:

- Импортировать `useAuthModal`, добавить `const { setMode } = useAuthModal()` (уже импортирован)
- Добавить `onClick={() => setMode('forgot-password')}` на кнопку "Забыли пароль?" (строка 146-153)

### 2.3 Update Password Page

**Файл:** `packages/web/app/[locale]/update-password/page.tsx` (новый)

Самостоятельная страница (не модал), куда попадает пользователь после клика по ссылке из email.

- Серверный компонент-обёртка + клиентская форма
- Форма: новый пароль + подтверждение пароля
- Валидация: min 8 chars, uppercase, lowercase, digit (reuse из `register-form.tsx`)
- Вызов `supabase.auth.updateUser({ password: newPassword })`
- После успеха: toast + redirect на главную
- Если нет recovery сессии: redirect на `/`

Стили: соответствуют дизайну auth-modal (gradient header, card layout)

### 2.4 Supabase Email Template

Обновить шаблон Reset Password в Supabase Dashboard → Authentication → Email Templates:

```html
<h2>Сброс пароля</h2>
<p>Нажмите на ссылку ниже, чтобы сбросить пароль:</p>
<p>
  <a
    href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}"
  >
    Сбросить пароль
  </a>
</p>
```

Это ручной шаг — настраивается через Supabase MCP или Dashboard.

### 2.5 Translations

**Файлы:**

- `packages/web/messages/ru/auth.json`
- `packages/web/messages/en/auth.json`

Добавить ключи:

```json
{
  "forgotPassword": {
    "title": "Восстановление пароля",
    "description": "Введите email, и мы отправим ссылку для сброса пароля",
    "email": "Email",
    "emailPlaceholder": "you@example.com",
    "submit": "Отправить ссылку",
    "success": "Ссылка для сброса пароля отправлена на вашу почту",
    "backToLogin": "Назад к входу"
  },
  "updatePassword": {
    "title": "Новый пароль",
    "description": "Введите новый пароль для вашего аккаунта",
    "newPassword": "Новый пароль",
    "confirmPassword": "Подтвердите пароль",
    "submit": "Сохранить пароль",
    "success": "Пароль успешно изменён!",
    "error": "Не удалось изменить пароль"
  }
}
```

---

## Часть 3: Google OAuth

### 3.1 Fix redirectTo in Social Buttons

**Файл:** `packages/web/components/auth/social-buttons.tsx`

Текущий код (строка 28-29):

```ts
redirectTo: returnTo || window.location.href,
```

Исправить на:

```ts
redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(returnTo || '/')}`,
```

Это направит OAuth flow через наш callback route, который обменяет PKCE code на сессию.

### 3.2 Supabase Google Provider Configuration (инструкция)

#### Шаг A: Google Cloud Console

1. Зайти на https://console.cloud.google.com/
2. Создать новый проект (или использовать существующий) — название: `MegaCampus AI`
3. Перейти в **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - App name: `MegaCampus AI`
   - User support email: ваш email
   - Authorized domains: `megacampus.ru`, `ai.megacampus.ru`
   - Developer contact: ваш email
   - Scopes: `email`, `profile`, `openid`
   - Publish the app (или оставить в Test mode для начала)

4. Перейти в **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs**:
   - Application type: **Web application**
   - Name: `MegaCampus AI Auth`
   - Authorized JavaScript origins:
     - `https://ai.megacampus.ru`
     - `https://dev.ai.megacampus.ru`
     - `http://localhost:3000` (для dev)
   - Authorized redirect URIs:
     - `https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback`
   - Скопировать **Client ID** и **Client Secret**

#### Шаг B: Supabase Dashboard

1. Зайти в https://supabase.com/dashboard/project/diqooqbuchsliypgwksu
2. **Authentication → Providers → Google**:
   - Enable: **ON**
   - Client ID: вставить из Google Console
   - Client Secret: вставить из Google Console
   - Save

3. **Authentication → URL Configuration**:
   - Site URL: `https://ai.megacampus.ru`
   - Redirect URLs (добавить все):
     - `https://ai.megacampus.ru/api/auth/callback`
     - `https://dev.ai.megacampus.ru/api/auth/callback`
     - `http://localhost:3000/api/auth/callback`

#### Шаг C: Email Template (Password Reset)

1. **Authentication → Email Templates → Reset Password**:
   - Subject: `Сброс пароля — MegaCampus AI`
   - Body:
   ```html
   <h2>Сброс пароля</h2>
   <p>Вы запросили сброс пароля для вашего аккаунта MegaCampus AI.</p>
   <p>Нажмите на кнопку ниже, чтобы установить новый пароль:</p>
   <p>
     <a
       href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}"
       style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;"
     >
       Сбросить пароль
     </a>
   </p>
   <p style="color: #666; font-size: 14px;">
     Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
   </p>
   ```

---

## Часть 4: Бонус — Change Password в Profile

### 4.1 Fix handlePasswordSubmit in AccountSettingsSection

**Файл:** `packages/web/app/[locale]/profile/components/AccountSettingsSection.tsx`

Текущий handlePasswordSubmit (строка 245-249) — заглушка (только toast). Реализовать:

```ts
const handlePasswordSubmit = async (data: PasswordFormData) => {
  const { error } = await supabase.auth.updateUser({ password: data.new_password })
  if (error) { toast.error(...); return }
  toast.success('Пароль изменён')
  setShowPasswordForm(false)
  passwordForm.reset()
}
```

---

## Порядок реализации

1. **Auth routes** (confirm + callback) — инфраструктура для обоих flow
2. **ForgotPasswordForm** + auth modal changes + login-form wiring
3. **Update password page**
4. **Social buttons fix** (redirectTo)
5. **Translations** (ru + en)
6. **AccountSettingsSection** password change fix
7. **Supabase config** (email template + Google provider + redirect URLs)

## Файлы для изменения

| Файл                                                                      | Действие                    |
| ------------------------------------------------------------------------- | --------------------------- |
| `packages/web/app/api/auth/callback/route.ts`                             | Создать                     |
| `packages/web/app/api/auth/confirm/route.ts`                              | Создать                     |
| `packages/web/components/auth/forgot-password-form.tsx`                   | Создать                     |
| `packages/web/app/[locale]/update-password/page.tsx`                      | Создать                     |
| `packages/web/lib/hooks/use-auth-modal.ts`                                | Изменить (добавить mode)    |
| `packages/web/components/auth/auth-modal.tsx`                             | Изменить (добавить tab)     |
| `packages/web/components/auth/login-form.tsx`                             | Изменить (onClick handler)  |
| `packages/web/components/auth/social-buttons.tsx`                         | Изменить (redirectTo)       |
| `packages/web/app/[locale]/profile/components/AccountSettingsSection.tsx` | Изменить (password handler) |
| `packages/web/messages/ru/auth.json`                                      | Изменить (добавить ключи)   |
| `packages/web/messages/en/auth.json`                                      | Изменить (добавить ключи)   |

## Beads

При реализации создать задачи:

1. `feat: Password recovery flow (forgot password + reset)` — label: frontend, auth
2. `feat: Google OAuth callback route` — label: frontend, auth
3. `fix: Change password in profile (wire backend)` — label: frontend, auth

## Verification

1. **Password Recovery E2E:**
   - Нажать "Забыли пароль?" в login форме → увидеть форму ввода email
   - Ввести email → получить toast "Ссылка отправлена"
   - Проверить email (можно через Supabase Dashboard → Authentication → Users → последний пользователь)
   - Перейти по ссылке → попасть на страницу `/update-password`
   - Ввести новый пароль → получить toast "Пароль изменён"
   - Войти с новым паролем

2. **Google OAuth E2E:**
   - Нажать "Продолжить с Google" → redirect в Google
   - Авторизоваться → redirect назад через `/api/auth/callback`
   - Проверить: сессия создана, пользователь залогинен

3. **Change Password в Profile:**
   - Залогиниться → Профиль → Безопасность → Изменить пароль
   - Ввести новый пароль → сохранить → проверить что работает

4. **Type check + Build:**
   ```bash
   pnpm type-check
   pnpm --filter @megacampus/web build
   ```
