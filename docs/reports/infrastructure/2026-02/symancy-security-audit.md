# Security Audit Report: symancy.ru (91.132.59.194)

**Date**: 2026-02-11
**Auditor**: server-hardening-specialist (automated)
**Type**: Read-only comprehensive security audit
**Server**: a094242.fvds.ru (91.132.59.194)
**OS**: Ubuntu 24.04 LTS, Kernel 6.8.0-90-generic
**Uptime**: 45 days

---

## Executive Summary

The server is **functional but has several critical and high-severity security issues** that require immediate attention. The most critical finding is that **root SSH login with password authentication is enabled**, combined with a known root password (`M5tt4F5NFWXa` from `.deploy/server.md`). The server is under active brute-force attack (106,469 failed SSH attempts, 838 IPs banned). Port 3000 (Node.js backend) is exposed to the internet through the firewall, and the `.env` file has world-readable permissions (777).

### Findings Summary

| Severity | Count | Description                                                                                            |
| -------- | ----- | ------------------------------------------------------------------------------------------------------ |
| CRITICAL | 3     | Root password auth enabled + known password, .env file 777 permissions, port 3000 exposed              |
| HIGH     | 4     | ISPManager SSH overrides, duplicate nginx config, hosting provider SSH key, sshd_config world-readable |
| MEDIUM   | 4     | 29 pending updates, Node.js binding on 0.0.0.0, backend health degraded, no rate limiting on SSH       |
| LOW      | 3     | TCP keepalive defaults, root PM2 daemon running idle, nginx warnings                                   |

---

## CRITICAL Findings

### C1. Root Login with Password Authentication Enabled

**Severity**: CRITICAL
**Impact**: Full server compromise possible remotely

The SSH configuration (`/etc/ssh/sshd_config.d/40-hosting.conf`) explicitly enables:

```
PermitRootLogin yes
PasswordAuthentication yes
```

**Effective SSH settings** (confirmed via `sshd -T`):

- `permitrootlogin yes`
- `passwordauthentication yes`
- `port 22` (default)

**Aggravating factor**: The root password `M5tt4F5NFWXa` is stored in plaintext in `.deploy/server.md` in the project repository. If this password has not been changed, **anyone with access to the repository can gain root access to the server**.

**Evidence of active attacks**: 106,469 failed SSH login attempts recorded, 838 IPs banned by fail2ban. At the time of audit, multiple IPs were actively brute-forcing:

- 161.35.94.147 (currently banned)
- 198.46.146.200
- 68.183.15.120

**Remediation**:

1. IMMEDIATELY change root password
2. Set `PermitRootLogin no` in SSH config
3. Set `PasswordAuthentication no` in SSH config
4. Remove or update `40-hosting.conf`
5. Remove password from version control and rotate all credentials

### C2. Environment File Has 777 Permissions

**Severity**: CRITICAL
**Impact**: Any user on the system can read API keys, database credentials, and secrets

```
/var/www/symancy-backend/shared/.env -> permissions: 777 (rwxrwxrwx)
```

Contains sensitive credentials:

- `SUPABASE_SERVICE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENROUTER_API_KEY`
- `SUPABASE_JWT_SECRET`

**Remediation**:

```bash
chmod 600 /var/www/symancy-backend/shared/.env
chown deploy:deploy /var/www/symancy-backend/shared/.env
```

### C3. Port 3000 (Node.js Backend) Exposed to Internet

**Severity**: CRITICAL
**Impact**: Direct access to backend API bypassing nginx security headers and rate limiting

UFW allows port 3000 from anywhere:

```
3000/tcp    ALLOW IN    Anywhere
3000/tcp (v6) ALLOW IN  Anywhere (v6)
```

Node.js is listening on `0.0.0.0:3000`, confirmed accessible externally (HTTP 503 returned on direct access).

**Remediation**:

```bash
ufw delete allow 3000/tcp
# Node.js should only listen on 127.0.0.1:3000
```

---

## HIGH Findings

### H1. ISPManager 40-hosting.conf Overrides Security Settings

**Severity**: HIGH
**Impact**: Any SSH hardening in sshd_config is overridden by hosting provider config

File `/etc/ssh/sshd_config.d/40-hosting.conf` contains:

```
PermitRootLogin yes
PubkeyAuthentication yes
PasswordAuthentication yes
PermitEmptyPasswords no
```

This is the same pattern found on the aidevteam server. The `Include /etc/ssh/sshd_config.d/*.conf` directive in the main config loads these files, and `40-hosting.conf` overrides any hardening.

The `hardening.conf` file exists but only configures timeouts, not authentication:

```
LoginGraceTime 30
MaxAuthTries 3
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 2
```

**Remediation**:

1. Edit `40-hosting.conf` to set `PermitRootLogin no` and `PasswordAuthentication no`
2. Or rename the hardening config to `50-hardening.conf` (loads after 40-hosting) and add auth restrictions there

### H2. Duplicate Nginx Configuration Causing Conflicts

**Severity**: HIGH
**Impact**: Unpredictable request routing, potential security bypass

Two nginx configs are active in `/etc/nginx/sites-enabled/`:

- `symancy` (current, with API proxy)
- `symancy.bak` (backup, no API proxy, serving same domains)

This causes nginx warnings:

```
conflicting server name "symancy.ru" on 0.0.0.0:443, ignored
conflicting server name "www.symancy.ru" on 0.0.0.0:443, ignored
```

The `.bak` file should not be in `sites-enabled/`.

**Remediation**:

```bash
rm /etc/nginx/sites-enabled/symancy.bak
nginx -t && systemctl reload nginx
```

### H3. Hosting Provider SSH Key in root authorized_keys

**Severity**: HIGH
**Impact**: Third-party has root SSH access to the server

```
FROM="85.198.118.171,85.198.75.83" ssh-rsa AAAAB3...supportAccessKey
```

While restricted by source IP (`FROM="85.198.118.171,85.198.75.83"`), this still grants the hosting provider direct root access. If those IPs are compromised, full server access is obtained.

**Remediation**: Evaluate whether hosting provider support access is still needed. If not, remove the key.

### H4. SSH Config File World-Readable

**Severity**: HIGH
**Impact**: Configuration details visible to all users

```
-rw-r--r-- 1 root root 3517 /etc/ssh/sshd_config
```

Should be `-rw-------` (600).

**Remediation**:

```bash
chmod 600 /etc/ssh/sshd_config
```

---

## MEDIUM Findings

### M1. 29 Pending System Updates

**Severity**: MEDIUM
**Impact**: Known vulnerabilities remain unpatched

29 packages have updates available, including:

- `systemd` (255.4-1ubuntu8.11 -> 8.12) -- system manager
- `apparmor` (security framework)
- `linux-firmware`
- `libldap2` (LDAP library)
- `nodejs` (22.21.0 -> 22.22.0)

Unattended-upgrades is installed and running but apparently has not applied these yet.

**Remediation**:

```bash
apt update && apt upgrade -y
```

### M2. Node.js Listening on 0.0.0.0:3000

**Severity**: MEDIUM (elevated to CRITICAL by C3 firewall rule)
**Impact**: Backend accessible on all interfaces instead of localhost only

```
LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node /var/www/s"...))
```

Even after removing the UFW rule for port 3000, the application should bind to `127.0.0.1` only.

**Remediation**: Configure the Node.js application to listen on `127.0.0.1:3000` instead of `0.0.0.0:3000`.

### M3. Backend Health Status: Degraded

**Severity**: MEDIUM
**Impact**: Webhook functionality not working correctly

```json
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "queue": "ok",
    "webhook": "misconfigured"
  },
  "webhookUrl": "https://flow8n.ru/webhook/..."
}
```

The webhook URL points to `flow8n.ru` which may be misconfigured or unreachable.

### M4. No SSH Rate Limiting in UFW

**Severity**: MEDIUM
**Impact**: Brute force attacks only mitigated by fail2ban, not at firewall level

SSH port 22 is allowed without rate limiting:

```
22/tcp    ALLOW IN    Anywhere
```

Should use `ufw limit 22/tcp` for defense-in-depth.

**Remediation**:

```bash
ufw delete allow 22/tcp
ufw limit 22/tcp
ufw reload
```

---

## LOW Findings

### L1. TCP Keepalive at Default Values

**Severity**: LOW
**Impact**: Stale connections may persist for 2 hours

```
net.ipv4.tcp_keepalive_time = 7200  (2 hours)
net.ipv4.tcp_keepalive_intvl = 75
net.ipv4.tcp_keepalive_probes = 9
```

Consider reducing for a production server.

### L2. Root PM2 Daemon Running with No Processes

**Severity**: LOW
**Impact**: Unnecessary resource consumption (70MB memory)

```
root 308764 PM2 v6.0.14: God Daemon (/root/.pm2) -- 0 processes
```

A PM2 daemon is running as root with zero managed processes.

**Remediation**:

```bash
pm2 kill  # as root
```

### L3. Nginx Configuration Warnings

**Severity**: LOW
**Impact**: Log noise, but functionally still serving correctly

Caused by `symancy.bak` file (see H2). Will resolve when H2 is fixed.

---

## Positive Findings (What Is Working Well)

| Area                       | Status  | Details                                                                                   |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Firewall (UFW)             | ACTIVE  | Default deny incoming, allow outgoing                                                     |
| fail2ban                   | ACTIVE  | SSH jail enabled, 838 IPs banned historically                                             |
| SSL Certificate            | VALID   | Let's Encrypt, expires 2026-05-02 (80 days remaining)                                     |
| Certbot auto-renewal       | ACTIVE  | Timer running, next check in ~4 hours                                                     |
| Unattended upgrades        | ACTIVE  | Running since Dec 27, 2025                                                                |
| Kernel hardening (partial) | OK      | SYN cookies enabled, ICMP broadcasts ignored, source routing disabled, redirects disabled |
| No cryptominers            | CLEAN   | No suspicious processes detected                                                          |
| No rootkits indicators     | CLEAN   | Only root has UID=0, no executables in /tmp                                               |
| No OOM events              | CLEAN   | No out-of-memory kills                                                                    |
| Disk usage                 | OK      | 11% used (5.9G of 59G)                                                                    |
| Memory usage               | OK      | 884Mi used of 3.7Gi (76% available)                                                       |
| Load average               | OK      | 0.01, 0.01, 0.00                                                                          |
| PM2 application            | ONLINE  | symancy-backend v0.6.15 running 5 days, 170MB memory                                      |
| Security headers           | PRESENT | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection                                 |
| Users                      | MINIMAL | Only root and deploy have shell access                                                    |

---

## Detailed System Inventory

### Open Ports (Listening)

| Port | Service          | Binding               | UFW Rule | Risk                               |
| ---- | ---------------- | --------------------- | -------- | ---------------------------------- |
| 22   | SSH (sshd)       | 0.0.0.0 + [::]        | ALLOW    | HIGH (password auth)               |
| 80   | Nginx (HTTP)     | 0.0.0.0               | ALLOW    | OK (redirects to HTTPS)            |
| 443  | Nginx (HTTPS)    | 0.0.0.0               | ALLOW    | OK                                 |
| 3000 | Node.js          | 0.0.0.0               | ALLOW    | CRITICAL (should be internal only) |
| 53   | systemd-resolved | 127.0.0.53/127.0.0.54 | N/A      | OK (local only)                    |

### Established Connections (at time of audit)

| Local  | Remote                | Process | Assessment                             |
| ------ | --------------------- | ------- | -------------------------------------- |
| :22    | 185.200.177.180:57303 | sshd    | Audit SSH session                      |
| :59292 | 54.247.26.119:6543    | node    | Supabase DB connection (AWS eu-west-1) |

### SSH Authorized Keys

| User   | Key Type       | Label            | Risk                                   |
| ------ | -------------- | ---------------- | -------------------------------------- |
| root   | ssh-rsa (4096) | supportAccessKey | HIGH - hosting provider, IP-restricted |
| root   | ssh-ed25519    | (unlabeled)      | OK - admin key                         |
| root   | ssh-ed25519    | claude-code      | OK - automation key                    |
| deploy | ssh-ed25519    | claude-deploy    | OK - deployment key                    |

---

## Recommended Remediation Priority

### Immediate (today)

1. **[C1]** Disable root password authentication:

   ```bash
   # Edit /etc/ssh/sshd_config.d/40-hosting.conf
   PermitRootLogin prohibit-password
   PasswordAuthentication no
   # Then: sshd -t && systemctl reload sshd
   ```

2. **[C2]** Fix .env file permissions:

   ```bash
   chmod 600 /var/www/symancy-backend/shared/.env
   ```

3. **[C3]** Remove port 3000 from firewall:

   ```bash
   ufw delete allow 3000/tcp
   ufw reload
   ```

4. **[H2]** Remove duplicate nginx config:
   ```bash
   rm /etc/nginx/sites-enabled/symancy.bak
   nginx -t && systemctl reload nginx
   ```

### This week

5. **[H4]** Fix sshd_config permissions: `chmod 600 /etc/ssh/sshd_config`
6. **[M1]** Apply pending system updates: `apt update && apt upgrade -y`
7. **[M2]** Configure Node.js to bind to 127.0.0.1 only
8. **[M4]** Add UFW rate limiting for SSH: `ufw limit 22/tcp`
9. **[L2]** Kill unused root PM2 daemon: `pm2 kill`

### This month

10. **[H3]** Evaluate and potentially remove hosting provider SSH key
11. **[M3]** Fix webhook configuration in application
12. Change SSH port from 22 to non-standard port
13. Add `AllowUsers deploy` to SSH config
14. Consider disabling IPv6 if not used

---

## Attack Surface Assessment

**Before remediation**:

- SSH on port 22 with root + password = WIDE OPEN (especially with known password)
- Port 3000 exposes backend directly to internet
- .env readable by any process on the system
- 106,469 brute-force attempts already recorded

**After recommended remediation**:

- SSH key-only authentication (no password brute-force possible)
- Backend accessible only through nginx reverse proxy
- Secrets protected by file permissions
- Reduced attack surface from 4 external ports to 3

---

## Comparison with aidevteam Server Audit

| Issue                     | aidevteam              | symancy.ru        | Notes                    |
| ------------------------- | ---------------------- | ----------------- | ------------------------ |
| 40-hosting.conf overrides | Found & fixed          | FOUND - NOT FIXED | Same ISPManager pattern  |
| Root password auth        | Was enabled, now fixed | ENABLED           | Same vulnerability       |
| Port 3000 exposed         | Was exposed, now fixed | EXPOSED           | Same pattern             |
| fail2ban                  | Active                 | Active            | Both properly configured |
| SSL certificates          | Valid                  | Valid (80 days)   | Both Let's Encrypt       |
| Unattended upgrades       | Active                 | Active            | Both enabled             |

The symancy.ru server has the **exact same vulnerabilities** that were previously identified and fixed on the aidevteam server. The fixes from the aidevteam audit should be replicated here.

---

_Report generated by server-hardening-specialist_
_All checks were read-only -- no changes were made to the server_
