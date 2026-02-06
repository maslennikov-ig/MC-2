# Auth Setup Guide: Password Recovery + Google OAuth

> Пошаговая инструкция по настройке восстановления пароля и Google OAuth для MegaCampus AI.
> Код уже реализован — здесь описана **ручная конфигурация** внешних сервисов.

---

## Оглавление

1. [Архитектура](#1-архитектура)
2. [Supabase: Email Templates](#2-supabase-email-templates)
3. [Supabase: Redirect URLs](#3-supabase-redirect-urls)
4. [Google Cloud Console: OAuth Client](#4-google-cloud-console-oauth-client)
5. [Supabase: Google Provider](#5-supabase-google-provider)
6. [Проверка: Password Recovery](#6-проверка-password-recovery)
7. [Проверка: Google OAuth](#7-проверка-google-oauth)
8. [Проверка: Смена пароля в профиле](#8-проверка-смена-пароля-в-профиле)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Архитектура

### Password Recovery Flow

```
Пользователь                    Фронтенд                         Supabase                        Email
    |                               |                                |                              |
    |-- "Забыли пароль?" ---------->|                                |                              |
    |                               |-- resetPasswordForEmail() ---->|                              |
    |                               |   redirectTo: /api/auth/confirm|                              |
    |                               |                                |-- Отправка письма ---------->|
    |                               |                                |                              |
    |<-------------------------------------------------------------- Письмо со ссылкой ------------|
    |                               |                                |                              |
    |-- Клик по ссылке ------------>|                                |                              |
    |   /api/auth/confirm           |                                |                              |
    |   ?token_hash=xxx             |                                |                              |
    |   &type=recovery              |-- verifyOtp(token_hash) ------>|                              |
    |   &next=/update-password      |                                |-- Создание recovery session  |
    |                               |<-- Session cookie -------------|                              |
    |<-- Redirect /update-password  |                                |                              |
    |                               |                                |                              |
    |-- Новый пароль -------------->|                                |                              |
    |                               |-- updateUser({ password }) --->|                              |
    |                               |<-- OK -------------------------|                              |
    |<-- "Пароль изменён!" ---------|                                |                              |
```

### Google OAuth Flow (PKCE)

```
Пользователь                    Фронтенд                 Supabase                 Google
    |                               |                        |                        |
    |-- "Войти через Google" ------>|                        |                        |
    |                               |-- signInWithOAuth() -->|                        |
    |                               |   redirectTo:          |                        |
    |                               |   /api/auth/callback   |                        |
    |<-- Redirect to Google --------|<-----------------------|                        |
    |                               |                        |                        |
    |-- Авторизация в Google ------------------------------------------------>------->|
    |<-- Redirect к Supabase -------------------------------------------------<-------|
    |                               |                        |<-- code + state -------|
    |<-- Redirect /api/auth/callback|<-----------------------|                        |
    |   ?code=xxx&next=/            |                        |                        |
    |                               |                        |                        |
    |   /api/auth/callback          |                        |                        |
    |                               |-- exchangeCodeForSession(code) -->|              |
    |                               |<-- Session cookie --------------|              |
    |<-- Redirect / (главная) ------|                        |                        |
```

### Реализованные файлы

| Файл                                                  | Роль                                             |
| ----------------------------------------------------- | ------------------------------------------------ |
| `app/api/auth/callback/route.ts`                      | OAuth PKCE code exchange                         |
| `app/api/auth/confirm/route.ts`                       | Email OTP verification (recovery, email confirm) |
| `components/auth/forgot-password-form.tsx`            | Форма ввода email для сброса                     |
| `app/[locale]/update-password/page.tsx`               | Страница установки нового пароля                 |
| `components/auth/auth-modal.tsx`                      | Модал с поддержкой forgot-password mode          |
| `components/auth/login-form.tsx`                      | Кнопка "Забыли пароль?" теперь работает          |
| `components/auth/social-buttons.tsx`                  | redirectTo исправлен для PKCE                    |
| `app/[locale]/profile/.../AccountSettingsSection.tsx` | Смена пароля в профиле работает                  |

---

## 2. Supabase: Email Templates

### Зайти в Dashboard

1. Открыть https://supabase.com/dashboard/project/diqooqbuchsliypgwksu
2. Перейти: **Authentication** > **Email Templates**

### Настроить шаблон "Reset Password"

3. Выбрать вкладку **Reset Password**
4. Установить **Subject**:

   ```
   Password Reset / Сброс пароля — MegaCampus AI
   ```

5. Вставить **Body** (HTML):

   ```html
   <div
     style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;"
   >
     <!-- Header -->
     <div style="text-align: center; margin-bottom: 32px;">
       <h1
         style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;"
       >
         MegaCampus AI
       </h1>
     </div>

     <!-- Russian -->
     <h2 style="font-size: 20px; color: #1f2937; margin-bottom: 8px;">Сброс пароля</h2>
     <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
       Вы запросили сброс пароля для вашего аккаунта MegaCampus AI. Нажмите на кнопку ниже, чтобы
       установить новый пароль:
     </p>

     <!-- English -->
     <h2 style="font-size: 20px; color: #1f2937; margin-top: 24px; margin-bottom: 8px;">
       Password Reset
     </h2>
     <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
       You requested a password reset for your MegaCampus AI account. Click the button below to set
       a new password:
     </p>

     <!-- CTA Button -->
     <div style="text-align: center; margin: 32px 0;">
       <a
         href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}"
         style="background-color: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: 500;"
       >
         Reset Password / Сбросить пароль
       </a>
     </div>

     <!-- Footer -->
     <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
     <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
       Если вы не запрашивали сброс — проигнорируйте это письмо.<br />
       If you didn't request this — please ignore this email.
     </p>
   </div>
   ```

6. Нажать **Save**

> **Как работает локализация ссылки:**
>
> - `{{ .RedirectTo }}` подставляется из кода: `forgot-password-form.tsx` передаёт `/${locale}/update-password`
> - Русский пользователь → `next=/ru/update-password`
> - Английский пользователь → `next=/en/update-password`
> - Текст письма — билингвальный (оба языка в одном шаблоне), т.к. Supabase не поддерживает per-user locale

---

## 3. Supabase: Redirect URLs

### Проверить URL Configuration

1. В Dashboard: **Authentication** > **URL Configuration**

2. Проверить **Site URL** = `https://ai.megacampus.ru`

3. Проверить **Redirect URLs** — уже настроены с wildcards:
   ```
   https://ai.megacampus.ru/**
   https://dev.ai.megacampus.ru/**
   http://localhost:3000/**
   http://localhost:3001/**
   http://localhost:3002/**
   http://localhost:3003/**
   http://192.168.*.*:*/**
   http://10.*.*.*:*/**
   ```

> **Ничего добавлять не нужно.** Wildcard `/**` покрывает все пути,
> включая `/api/auth/callback` и `/api/auth/confirm`.
> Этот шаг — только проверка.

---

## 4. Google Cloud Console: OAuth Client

### A. Создать проект (если нет)

1. Открыть https://console.cloud.google.com/
2. Создать новый проект или выбрать существующий
   - Название: `MegaCampus AI`

### B. Настроить OAuth Consent Screen

3. Перейти: **APIs & Services** > **OAuth consent screen**
4. Выбрать **User Type**: **External**
5. Заполнить:

   | Поле               | Значение        |
   | ------------------ | --------------- |
   | App name           | `MegaCampus AI` |
   | User support email | ваш email       |
   | App logo           | (опционально)   |
   | Authorized domains | `megacampus.ru` |
   | Developer contact  | ваш email       |

6. Нажать **Save and Continue**
7. На странице **Scopes** добавить:
   - `email`
   - `profile`
   - `openid`
8. Нажать **Save and Continue**
9. На странице **Test users** — можно пропустить (или добавить тестовых)
10. **Summary** > **Back to Dashboard**

> **Для production:** перевести приложение из Test mode в Published.
> В Test mode — только добавленные test users смогут авторизоваться.
> Published — все Google аккаунты (может потребоваться верификация Google).

### C. Создать OAuth 2.0 Client ID

11. Перейти: **APIs & Services** > **Credentials**
12. Нажать **Create Credentials** > **OAuth 2.0 Client IDs**
13. Заполнить:

| Поле             | Значение             |
| ---------------- | -------------------- |
| Application type | **Web application**  |
| Name             | `MegaCampus AI Auth` |

14. **Authorized JavaScript origins** — добавить:

    ```
    https://ai.megacampus.ru
    https://dev.ai.megacampus.ru
    http://localhost:3000
    ```

15. **Authorized redirect URIs** — добавить **ОДИН URL**:

    ```
    https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback
    ```

    > Это callback URL самого Supabase, НЕ вашего приложения.
    > Google направляет пользователя сначала к Supabase, затем Supabase направляет к вашему `/api/auth/callback`.

16. Нажать **Create**
17. **Скопировать** и сохранить:
    - **Client ID** (выглядит как: `xxx.apps.googleusercontent.com`)
    - **Client Secret** (выглядит как: `GOCSPX-xxx`)

---

## 5. Supabase: Google Provider

### Включить Google в Supabase

1. В Dashboard: **Authentication** > **Providers**
2. Найти **Google** в списке
3. Включить тумблер **Enable**
4. Заполнить:

   | Поле          | Значение                                |
   | ------------- | --------------------------------------- |
   | Client ID     | Вставить из Google Console (шаг 4.C.17) |
   | Client Secret | Вставить из Google Console (шаг 4.C.17) |

5. Нажать **Save**

---

## 6. Проверка: Password Recovery

### Тест-план

```
[ ] 1. Открыть приложение
[ ] 2. Нажать "Войти" — открывается модал авторизации
[ ] 3. Нажать "Забыли пароль?" — модал переключается на форму сброса
[ ] 4. Ввести email зарегистрированного пользователя
[ ] 5. Нажать "Отправить ссылку"
[ ] 6. Увидеть зелёную галочку и текст "Ссылка отправлена"
[ ] 7. Проверить email (или Supabase Dashboard > Authentication > Users > последний пользователь)
[ ] 8. Перейти по ссылке из письма
[ ] 9. Попасть на страницу /ru/update-password (или /en/update-password)
[ ] 10. Ввести новый пароль + подтверждение
[ ] 11. Нажать "Сохранить пароль"
[ ] 12. Увидеть зелёную галочку "Пароль изменён"
[ ] 13. Redirect на главную через 2 секунды
[ ] 14. Войти с НОВЫМ паролем — успешно
```

### Быстрая проверка через Supabase Dashboard

Если email не приходит (dev-окружение), можно проверить токен вручную:

1. **Authentication** > **Users**
2. Найти пользователя
3. Нажать на пользователя — посмотреть `recovery_token`
4. Или использовать SQL Editor:
   ```sql
   SELECT id, email, recovery_token, recovery_sent_at
   FROM auth.users
   WHERE email = 'test@example.com';
   ```

---

## 7. Проверка: Google OAuth

### Тест-план

```
[ ] 1. Открыть приложение
[ ] 2. Нажать "Войти" — открывается модал
[ ] 3. Нажать "Продолжить с Google"
[ ] 4. Redirect в Google — выбрать/подтвердить аккаунт
[ ] 5. Redirect обратно через /api/auth/callback
[ ] 6. Оказаться на главной странице, залогиненным
[ ] 7. Проверить: имя и email из Google аккаунта отображаются
```

### Возможные ошибки

| Ошибка                                | Причина                                    | Решение                                 |
| ------------------------------------- | ------------------------------------------ | --------------------------------------- |
| `redirect_uri_mismatch`               | Redirect URI в Google Console не совпадает | Проверить шаг 4.C.15                    |
| `access_denied`                       | App в Test mode, пользователь не добавлен  | Добавить test user или опубликовать app |
| Redirect на `/?error=auth-code-error` | Код не обменялся на сессию                 | Проверить Client ID/Secret в Supabase   |
| Бесконечный redirect                  | PKCE code verifier не совпадает            | Очистить cookies, попробовать заново    |

---

## 8. Проверка: Смена пароля в профиле

### Тест-план

```
[ ] 1. Войти в приложение
[ ] 2. Перейти в Профиль (иконка пользователя > Профиль)
[ ] 3. Прокрутить до секции "Безопасность"
[ ] 4. Нажать "Изменить пароль"
[ ] 5. Заполнить: текущий пароль, новый пароль, подтверждение
[ ] 6. Нажать "Сохранить"
[ ] 7. Увидеть toast "Пароль успешно изменен"
[ ] 8. Выйти и войти с новым паролем
```

> **Примечание:** Supabase `updateUser` не проверяет текущий пароль.
> Валидация `current_password` в форме — только клиентская (через Zod).
> Если нужна серверная проверка текущего пароля — потребуется отдельный API route.

---

## 9. Troubleshooting

### Email не приходит

1. Проверить **Supabase Dashboard** > **Authentication** > **Email Templates** — шаблон сохранён?
2. Проверить **Site URL** в URL Configuration — правильный?
3. Supabase Free tier: лимит ~4 email/час. Для production — настроить custom SMTP:
   - **Authentication** > **SMTP Settings**
   - Можно использовать Resend, SendGrid, Mailgun

### Google OAuth не работает

1. Проверить, что Google Provider включен в Supabase
2. Проверить Client ID и Client Secret
3. Redirect URI в Google Console должен быть **точно**:
   ```
   https://diqooqbuchsliypgwksu.supabase.co/auth/v1/callback
   ```
4. JavaScript Origins должны включать домен приложения
5. Если app в Test mode — пользователь должен быть в списке test users

### Token expired

Ссылка для сброса пароля действует **1 час** (по умолчанию Supabase).
Если пользователь кликает позже — увидит redirect на `/?error=auth-confirm-error`.

Для изменения:

- **Authentication** > **Auth Settings** > **Token expiry** (OTP expiry)

### Cookies не устанавливаются

Если после callback redirect пользователь не залогинен:

1. Проверить, что middleware обрабатывает cookies: `packages/web/middleware.ts`
2. Проверить, что `createClient()` из `lib/supabase/server.ts` правильно работает с cookies
3. В dev: проверить, что `localhost:3000` в списке Redirect URLs

---

## Environments Checklist

### Local Development (localhost:3000)

```
[ ] NEXT_PUBLIC_SUPABASE_URL=https://diqooqbuchsliypgwksu.supabase.co
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY=... (в .env.local)
[ ] Google Console: http://localhost:3000 в JavaScript Origins
[ ] Supabase: http://localhost:3000/api/auth/callback в Redirect URLs
```

### Dev (dev.ai.megacampus.ru)

```
[ ] Google Console: https://dev.ai.megacampus.ru в JavaScript Origins
[ ] Supabase: https://dev.ai.megacampus.ru/api/auth/callback в Redirect URLs
```

### Staging/Production (ai.megacampus.ru)

```
[ ] Site URL в Supabase = https://ai.megacampus.ru
[ ] Google Console: https://ai.megacampus.ru в JavaScript Origins
[ ] Supabase: https://ai.megacampus.ru/api/auth/callback в Redirect URLs
[ ] Google OAuth app опубликован (не в Test mode)
[ ] Custom SMTP настроен для email delivery
```
