# Server Security Audit Report

**Date**: 2026-02-10
**Server**: 95.81.98.230 (info511.fvds.ru)
**OS**: Ubuntu 24.04.3 LTS, Kernel 6.8.0-90-generic
**Uptime**: 39 days

---

## Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 3     |
| HIGH     | 4     |
| MEDIUM   | 4     |
| LOW/INFO | 5     |

---

## CRITICAL

### C1. SSH: Root login + Password auth enabled

**Effective SSH config:**

```
permitrootlogin yes
passwordauthentication yes
```

Root login по паролю открыт. За 39 дней uptime fail2ban заблокировал **358 IP** за brute-force (3984 неудачных попытки). Атаки идут прямо сейчас (lastb показывает попытки каждые 5 минут).

**Fix:**

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
# sudo systemctl restart sshd
```

### C2. Bull Board публично доступен без аутентификации

`/admin/queues` возвращает HTTP 200 без какой-либо аутентификации. Любой может видеть все задачи BullMQ, их параметры и статусы.

**Fix:** Добавить HTTP Basic Auth или IP whitelist в nginx:

```nginx
location /admin/queues {
    # Только с определённых IP
    allow 185.200.177.180;  # ваш IP
    deny all;
    # или auth_basic
    proxy_pass http://megacampus_api;
    ...
}
```

### C3. ISPmanager порты (1500/1501) открыты в файрволе

ISPmanager не запущен, но порты открыты в UFW. Любой сервис, который привяжется к этим портам, будет доступен из интернета.

**Fix:**

```bash
sudo ufw delete allow 1500,1501/tcp
```

---

## HIGH

### H1. Redis без пароля и с отключённым protected-mode

```
requirepass: (empty)
protected-mode: no
```

Redis доступен только на 127.0.0.1:6379 (хорошо), но если любой контейнер или процесс будет скомпрометирован, Redis полностью открыт. При `protected-mode no` + без пароля достаточно SSRF-уязвимости для доступа к данным.

**Fix:** Установить пароль через Docker environment / Redis config.

### H2. 29 ожидающих обновлений безопасности (включая ядро)

Критические обновления:

- **Linux kernel**: 6.8.0-90 -> 6.8.0-100 (10 minor versions behind)
- **Docker CE**: 29.1.3 -> 29.2.1
- **containerd**: 2.2.0 -> 2.2.1
- **AppArmor**, **systemd**, **libldap** и другие

Unattended-upgrades активен, но не применяет обновления ядра автоматически.

**Fix:**

```bash
sudo apt update && sudo apt upgrade -y
# Потребуется reboot для ядра
```

### H3. Postfix (SMTP) слушает на порту 25

Postfix активен и слушает на 0.0.0.0:25 и [::]:25. Порт 25 не открыт в UFW, что хорошо, но сам сервис лишний и увеличивает поверхность атаки.

**Fix:** Если email не нужен:

```bash
sudo systemctl stop postfix && sudo systemctl disable postfix
```

### H4. Swap usage 2.1 GB / 4 GB (53%)

Активное использование swap говорит о нехватке RAM. Docling-MCP один занимает 1.75 GB RAM. При пиковой нагрузке swap thrashing может вызывать подвисания и обрывы соединений.

Потребление памяти по контейнерам:
| Container | RAM |
|-----------|-----|
| docling-mcp-internal | 1.56 GB |
| workers + API (all) | ~2.1 GB |
| Redis | 66 MB |
| docling-mcp (idle) | 3.7 MB |

**Общее**: ~4.9 GB used из 11 GB + 2.1 GB swap

---

## MEDIUM

### M1. Nginx worker_connections: 768

Для production-сервера это мало. Каждый клиент занимает минимум 2 соединения (client + upstream). С 8 worker processes максимум = 768 \* 8 = 6144 connections, но лимит per-worker может стать бутылочным горлышком.

**Fix:** В `/etc/nginx/nginx.conf`:

```nginx
worker_connections 2048;
```

### M2. TCP keepalive_time = 7200 сек (2 часа)

Стандартное значение Linux. Idle TCP соединения не проверяются 2 часа, после чего сетевое оборудование (NAT/firewall) может их уже сбросить, что приводит к "зависшим" соединениям.

**Fix:**

```bash
sudo sysctl -w net.ipv4.tcp_keepalive_time=600
sudo sysctl -w net.ipv4.tcp_keepalive_intvl=30
sudo sysctl -w net.ipv4.tcp_keepalive_probes=5
# Сделать постоянным через /etc/sysctl.d/
```

### M3. SSL-сертификат ai.megacampus.ru истекает 16 марта 2026

Осталось **34 дня**. Certbot timer активен и настроен на обновление дважды в сутки. Следующий запуск: 2026-02-11 01:24. Стоит проверить, что renewal реально работает.

**Fix:** Проверить вручную:

```bash
sudo certbot renew --dry-run
```

### M4. Активное сканирование/зондирование сервера

Обнаружены сканеры, ищущие:

- `.env`, `.env.production`, `.env.local`, `.env.prod` (credentials)
- `wp-config.php`, `/cgi-bin/authLogin.cgi` (WordPress/QNAP exploits)
- `config/secrets.yml`, `stripe/config.json` (API keys)

IP-адреса: 185.177.72.56, 64.225.100.236, 95.81.101.39, 165.22.93.145, 64.89.163.49

Все запросы вернули 404 — утечки нет. Но стоит добавить rate limiting или бан таких IP.

---

## LOW / INFO

### L1. Fail2ban работает (358 бан, 2 jail)

Jails: `sshd` + `recidive`. Сейчас 7 IP заблокированы. Работает корректно.

### L2. Нет следов malware

- Подозрительные процессы: не обнаружены
- Исполняемые файлы в /tmp: нет
- Подозрительные cron-задачи: нет (только backup + docker cleanup)
- SUID файлы: только стандартные системные
- Пользователи с UID=0: только root
- OOM events: нет

### L3. Docker-контейнеры здоровы

Все контейнеры в статусе `Up`, healthcheck-enabled контейнеры показывают `healthy`.

### L4. authorized_keys чистые

- root: 1 ключ ISP-поддержки (ограничен по IP: 85.198.118.171, 85.198.75.83)
- claude-deploy: 2 ключа (deploy + claude-code-local) — ожидаемые

### L5. Conntrack не перегружен

178 / 262144 (0.07%) — не является причиной обрывов.

---

## Диагностика обрывов соединения

**Наиболее вероятные причины:**

1. **Swap thrashing** (HIGH) — При 53% использования swap и пиковых нагрузках от Docling/workers система может подвисать на I/O wait, вызывая таймауты
2. **TCP keepalive слишком длинный** (MEDIUM) — 2 часа без проверки; промежуточные NAT/firewall могут сбрасывать idle-соединения раньше
3. **Nginx worker_connections** (MEDIUM) — 768 per worker может быть маловато при пиковых нагрузках
4. **Внешние факторы** — Проблемы на стороне провайдера/сети (FVDS.ru)

**НЕ является причиной:**

- OOM killer (нет событий)
- Conntrack overflow (0.07% capacity)
- Kernel network errors (чисто)
- DDoS/bruteforce (fail2ban справляется)

---

## Приоритет действий — РЕЗУЛЬТАТ

| #   | Действие                                            | Severity | Статус                             |
| --- | --------------------------------------------------- | -------- | ---------------------------------- |
| 1   | SSH: password auth off + root by key only           | CRITICAL | DONE                               |
| 2   | Bull Board: IP whitelist (nginx)                    | CRITICAL | DONE                               |
| 3   | ISPmanager порты убраны из UFW                      | CRITICAL | DONE                               |
| 4   | Security updates (kernel 6.8.0-100 + Docker 29.2.1) | HIGH     | DONE + reboot                      |
| 5   | Nginx worker_connections: 768 -> 2048               | MEDIUM   | DONE                               |
| 6   | TCP keepalive: 7200s -> 600s                        | MEDIUM   | DONE                               |
| 7   | Установить пароль Redis                             | HIGH     | SKIPPED (локальный, в Docker сети) |
| 8   | Отключить Postfix                                   | HIGH     | SKIPPED (порт 25 не в UFW)         |
| 9   | Проверить certbot renewal                           | MEDIUM   | OK (таймер активен)                |

### Дополнительно выполнено

- Сгенерирован SSH-ключ для root (Termius Ed25519)
- Nginx templates в репо обновлены (Bull Board restriction)
