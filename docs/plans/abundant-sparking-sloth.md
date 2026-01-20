# Plan: Fix Recurring "Server Action not found" Error

**Issue**: FZX-1554

## Problem

При нажатии "Finalize Course" появляется ошибка:

```
Server Action "40a358b49828fbe..." was not found on the server
```

Происходит на dev.ai.megacampus.ru. Повторяется 2-3 раза.

## Root Cause (Official Next.js Documentation)

Из [Next.js docs](https://nextjs.org/docs/messages/failed-to-find-server-action):

> For security purposes, Next.js creates **encrypted, non-deterministic keys (IDs)** to allow the client to reference and call Server Actions. These keys are **periodically recalculated between builds**.
>
> When self-hosting your Next.js application across **multiple servers**, each server instance may end up with a **different encryption key**, leading to potential inconsistencies.

**Что происходит:**

1. Push в `develop` → CI собирает новый Docker образ `web:develop`
2. Новый билд генерирует **новые Server Action ID** (ключи шифрования)
3. Клиент (браузер) с кэшированным JS вызывает старые ID
4. Сервер с новым билдом не знает эти ID → **"Server Action not found"**

## Solution: Set Encryption Key

Из официальной документации:

> To mitigate this, you can overwrite the encryption key using the `process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` environment variable. Specifying this variable ensures your encryption keys are **persistent across builds**, and all server instances use the same key.

### Implementation

**Step 1: Generate Encryption Key**

```bash
# Generate 32-byte AES-GCM key (base64 encoded)
openssl rand -base64 32
```

**Step 2: Add to Environment Files**

| File              | Action                                                   |
| ----------------- | -------------------------------------------------------- |
| `.env.dev`        | Add `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<generated_key>` |
| `.env.production` | Add `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<different_key>` |

**Step 3: Update Docker Compose**

В `docker-compose.dev.yml` (web-dev service):

```yaml
environment:
  - NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
```

В `docker-compose.app.yml` (web service):

```yaml
environment:
  - NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
```

## Files to Modify

| File                     | Change                                 |
| ------------------------ | -------------------------------------- |
| `.env.dev`               | Add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY |
| `.env.production`        | Add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY |
| `docker-compose.dev.yml` | Pass env var to web-dev                |
| `docker-compose.app.yml` | Pass env var to web                    |

## Verification

1. **Generate key and add to `.env.dev`**
2. **Restart dev containers:**
   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.dev up -d web-dev
   ```
3. **Test:**
   - Complete a course through Stage 6
   - Click "Finalize Course"
   - Should work without "Server Action not found" error
4. **Verify persistence:**
   - Redeploy (push to develop)
   - Try Finalize Course again on old tab
   - Should still work (same encryption key)

## Security Notes

- **Use different keys** for dev and production environments
- **Never commit** the encryption key to git (it's in `.env.*` which is gitignored)
- Key must be **AES-GCM compatible** (32 bytes base64 encoded)

## References

- [Next.js: Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action)
- [Next.js: Overwriting encryption keys](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#overwriting-encryption-keys-advanced)
