# План: Полная проверка безопасности сервера

## Контекст

Пользователь замечает периодические обрывы соединения с сервером `95.81.98.230` (ai.megacampus.ru). Необходима полная проверка безопасности: поиск вирусов, эксплойтов, анализ стабильности соединения, аудит конфигурации.

**Сервер**: `95.81.98.230` (ssh alias: `megacampus-prod`, user: `claude-deploy`)
**Стек**: Docker (Next.js + Express API + BullMQ Worker + Redis + Docling), Nginx reverse proxy, Let's Encrypt SSL

## План проверки

### Фаза 1: Здоровье системы и ресурсы

Цель: понять текущее состояние сервера и выявить проблемы с ресурсами

```bash
# Аптайм, нагрузка
ssh megacampus-prod "uptime"

# Память (RAM + swap)
ssh megacampus-prod "free -h"

# Диск
ssh megacampus-prod "df -h"

# Топ процессов по CPU/MEM
ssh megacampus-prod "ps aux --sort=-%mem | head -20"

# Kernel version
ssh megacampus-prod "uname -a"

# OOM killer events (причина обрывов?)
ssh megacampus-prod "dmesg | grep -i 'oom\|killed' | tail -20"
```

### Фаза 2: Аудит сетевой безопасности

Цель: проверить файрвол, открытые порты, SSH-конфигурацию

```bash
# Firewall status
ssh megacampus-prod "sudo ufw status verbose"

# Все слушающие порты
ssh megacampus-prod "sudo ss -tlnp"

# SSH-конфигурация (проверка на слабости)
ssh megacampus-prod "sudo cat /etc/ssh/sshd_config | grep -E 'PermitRoot|PasswordAuth|Port|AllowUsers|MaxAuth|LoginGrace'"

# Проверка fail2ban
ssh megacampus-prod "sudo systemctl status fail2ban 2>/dev/null; sudo fail2ban-client status 2>/dev/null; sudo fail2ban-client status sshd 2>/dev/null"
```

### Фаза 3: Поиск следов взлома и вредоносного ПО

Цель: проверить на rootkit, подозрительные процессы, несанкционированные изменения

```bash
# Подозрительные процессы (криптомайнеры, бэкдоры)
ssh megacampus-prod "ps aux | grep -iE 'kworker.*\[|xmrig|minergate|cryptonight|kinsing|kdevtmpfsi|ld-linux|\.hidden' | grep -v grep"

# Подозрительные крон-задачи (все пользователи)
ssh megacampus-prod "for user in \$(cut -f1 -d: /etc/passwd); do echo \"=== \$user ===\"; sudo crontab -l -u \$user 2>/dev/null; done"
ssh megacampus-prod "ls -la /etc/cron.d/ /etc/cron.daily/ /etc/cron.hourly/ /etc/cron.weekly/ /etc/cron.monthly/ 2>/dev/null"

# Последние залогинившиеся пользователи
ssh megacampus-prod "last -20"
ssh megacampus-prod "lastb -20 2>/dev/null"  # Неудачные попытки

# Пользователи с UID=0 (кроме root)
ssh megacampus-prod "awk -F: '\$3==0 {print}' /etc/passwd"

# SUID/SGID файлы (потенциальные privilege escalation)
ssh megacampus-prod "find / -perm -4000 -type f 2>/dev/null | head -30"

# Файлы в /tmp с execute правами (типично для малвари)
ssh megacampus-prod "find /tmp /var/tmp /dev/shm -type f -executable 2>/dev/null"

# Проверка authorized_keys всех пользователей
ssh megacampus-prod "for user_home in /root /home/*; do echo \"=== \$user_home ===\"; sudo cat \$user_home/.ssh/authorized_keys 2>/dev/null; done"

# Проверка на rootkit (если установлен)
ssh megacampus-prod "which rkhunter chkrootkit 2>/dev/null"

# Необычные сетевые соединения
ssh megacampus-prod "sudo ss -tnp | grep ESTAB | grep -v '127.0.0.1'"

# Модифицированные системные бинарники
ssh megacampus-prod "sudo debsums --changed 2>/dev/null | head -20"
```

### Фаза 4: Аудит Docker-контейнеров

Цель: проверить здоровье контейнеров, утечки ресурсов, сетевую изоляцию

```bash
# Статус всех контейнеров
ssh megacampus-prod "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Потребление ресурсов контейнерами
ssh megacampus-prod "docker stats --no-stream"

# Docker-сети (проверка изоляции)
ssh megacampus-prod "docker network ls && docker network inspect bridge 2>/dev/null | head -30"

# Логи ошибок из контейнеров (последние 50 строк)
ssh megacampus-prod "docker logs megacampus-redis --tail 20 2>&1"

# Redis security — проверка открытости наружу
ssh megacampus-prod "docker exec megacampus-redis redis-cli CONFIG GET bind 2>/dev/null"
ssh megacampus-prod "docker exec megacampus-redis redis-cli CONFIG GET requirepass 2>/dev/null"
ssh megacampus-prod "docker exec megacampus-redis redis-cli CONFIG GET protected-mode 2>/dev/null"
```

### Фаза 5: Проверка Nginx и SSL

Цель: аудит конфигурации, проверка SSL-сертификатов, security headers

```bash
# Nginx status
ssh megacampus-prod "sudo nginx -t 2>&1"
ssh megacampus-prod "sudo systemctl status nginx"

# Текущая конфигурация на сервере (сравним с репо)
ssh megacampus-prod "sudo cat /etc/nginx/sites-enabled/megacampus 2>/dev/null"

# SSL сертификат — срок действия
ssh megacampus-prod "sudo openssl x509 -in /etc/letsencrypt/live/ai.megacampus.ru/fullchain.pem -noout -dates 2>/dev/null"
ssh megacampus-prod "sudo openssl x509 -in /etc/letsencrypt/live/dev.ai.megacampus.ru/fullchain.pem -noout -dates 2>/dev/null"

# Certbot auto-renewal
ssh megacampus-prod "sudo certbot certificates 2>/dev/null"
ssh megacampus-prod "sudo systemctl status certbot.timer 2>/dev/null"

# Access logs — подозрительные паттерны (сканеры, атаки)
ssh megacampus-prod "sudo tail -500 /var/log/nginx/megacampus.access.log | grep -iE '(wp-login|wp-admin|\.php|/admin|/shell|/eval|/exec|\.env|/\.git|/config|phpmyadmin|sqlmap)' | tail -30"

# Error logs
ssh megacampus-prod "sudo tail -50 /var/log/nginx/megacampus.error.log"
```

### Фаза 6: Анализ стабильности соединения

Цель: выяснить причину обрывов

```bash
# Auth log — SSH disconnects, brute force
ssh megacampus-prod "sudo grep -iE '(disconnect|failed|invalid|refused|break-in)' /var/log/auth.log | tail -30"

# Kernel messages — сетевые проблемы
ssh megacampus-prod "sudo dmesg | grep -iE '(link|eth|net|nf_conntrack|drop|reject)' | tail -20"

# conntrack table (переполнение = потеря соединений!)
ssh megacampus-prod "sudo sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max 2>/dev/null"

# TCP keepalive settings
ssh megacampus-prod "sudo sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes"

# Nginx worker connections
ssh megacampus-prod "grep -E 'worker_connections|worker_processes' /etc/nginx/nginx.conf 2>/dev/null"
```

### Фаза 7: Проверка обновлений и уязвимостей

Цель: проверить наличие критических обновлений безопасности

```bash
# Pending security updates
ssh megacampus-prod "sudo apt list --upgradable 2>/dev/null | head -20"

# Unattended upgrades status
ssh megacampus-prod "sudo systemctl status unattended-upgrades 2>/dev/null"
ssh megacampus-prod "cat /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null | grep -E 'Unattended-Upgrade|Allowed-Origins' | head -10"

# Docker version (CVE check)
ssh megacampus-prod "docker version --format '{{.Server.Version}}'"
```

## Реализация

Делегировать `server-hardening-specialist` для выполнения всех фаз. Результат будет записан в отчёт `docs/reports/security/2026-02/server-security-audit.md`.

## Ожидаемый результат

1. Полный отчёт о состоянии безопасности сервера
2. Список найденных проблем с приоритетами (Critical / High / Medium / Low)
3. Рекомендации по устранению каждой проблемы
4. Диагностика причин обрывов соединения
5. При обнаружении критических проблем — немедленное уведомление пользователя

## Верификация

- Все команды выполняются read-only (никаких изменений на сервере без согласования)
- Отчёт сохраняется в репозитории для истории
- Критические находки обсуждаются с пользователем перед любыми действиями
