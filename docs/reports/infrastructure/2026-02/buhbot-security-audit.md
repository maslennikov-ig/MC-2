---
report_type: security-audit
generated: 2026-02-10T20:15:00+03:00
hostname: vladimir.topb.fvds.ru (buhbot.aidevteam.ru)
ip: 185.200.177.180
status: ISSUES FOUND
agent: server-hardening-specialist
audit_type: read-only
---

# Security Audit Report: buhbot.aidevteam.ru

**Server**: 185.200.177.180 (vladimir.topb.fvds.ru)
**Date**: 2026-02-10
**Auditor**: Automated security audit (read-only)
**OS**: Ubuntu 24.04.3 LTS (kernel 6.8.0-87-generic)
**Uptime**: 85 days

---

## Executive Summary

The server has several **CRITICAL** and **HIGH** severity security issues that require immediate attention. The most urgent problems are:

1. **[CRITICAL]** SSH hardening is overridden by ISPManager -- root login and password authentication are enabled despite being disabled in sshd_config
2. **[CRITICAL]** Monitoring services (Prometheus, Grafana, Uptime Kuma) are exposed to the entire internet via Docker port bindings that bypass UFW
3. **[CRITICAL]** Redis has no password and protected-mode is disabled
4. **[HIGH]** Backend (port 3000) and frontend (port 3001) are directly accessible from the internet, bypassing Nginx
5. **[HIGH]** SSL certificate expires on 2026-02-21 (11 days from now)
6. **[HIGH]** 722 MB swap in use on a 3.7 GB RAM server -- memory pressure
7. **[MEDIUM]** 29+ pending system updates including kernel security patches

---

## Findings by Severity

### CRITICAL

#### C1. SSH Configuration Override by ISPManager

**Finding**: The main `/etc/ssh/sshd_config` correctly sets:

```
PermitRootLogin no
PasswordAuthentication no
```

However, the drop-in file `/etc/ssh/sshd_config.d/40-hosting.conf` (created by ISPManager) **overrides** these settings:

```
PermitRootLogin yes
PubkeyAuthentication yes
PasswordAuthentication yes
```

**Impact**: Root login via password is enabled. The server is exposed to brute-force attacks. fail2ban has already banned 299 IPs with 3,755 total failed login attempts.

**Evidence**: Active brute-force attacks observed in real-time:

```
admin    ssh:notty    2.57.121.112     Tue Feb 10 20:10
root     ssh:notty    142.93.227.104   Tue Feb 10 20:07
guest    ssh:notty    210.71.231.7     Tue Feb 10 20:11
```

**Remediation**: Edit `/etc/ssh/sshd_config.d/40-hosting.conf`:

```bash
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config.d/40-hosting.conf
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/40-hosting.conf
sudo sshd -t && sudo systemctl reload sshd
```

**WARNING**: Verify SSH key access works for `buhbot` user BEFORE making this change.

---

#### C2. Monitoring Services Exposed to Internet (Docker Bypasses UFW)

**Finding**: Docker publishes container ports directly via iptables, bypassing UFW entirely. The following services are accessible from ANY IP on the internet:

| Port | Service     | Verified from Internet | Risk                                              |
| ---- | ----------- | ---------------------- | ------------------------------------------------- |
| 9090 | Prometheus  | HTTP 302               | Full metrics data exposure, potential RCE via API |
| 3002 | Grafana     | HTTP 302               | Dashboard access, credential brute-force          |
| 3003 | Uptime Kuma | HTTP 302               | Infrastructure topology exposure                  |

**Evidence** (tested from external host):

```
curl http://185.200.177.180:9090  -> 302 (accessible)
curl http://185.200.177.180:3002  -> 302 (accessible)
curl http://185.200.177.180:3003  -> 302 (accessible)
```

**Impact**: Prometheus exposes all server metrics, targets, and potentially sensitive labels. Grafana may have default credentials. Uptime Kuma reveals infrastructure monitoring details.

**Remediation** (choose one):

Option A -- Bind Docker ports to localhost only (in docker-compose.yml):

```yaml
ports:
  - '127.0.0.1:9090:9090'
  - '127.0.0.1:3002:3000'
  - '127.0.0.1:3003:3001'
```

Then proxy through Nginx with authentication.

Option B -- Use Docker network internal + Nginx reverse proxy with basic auth.

Option C -- Add iptables rules to restrict access:

```bash
sudo iptables -I DOCKER-USER -p tcp --dport 9090 -j DROP
sudo iptables -I DOCKER-USER -p tcp --dport 3002 -j DROP
sudo iptables -I DOCKER-USER -p tcp --dport 3003 -j DROP
# Then allow specific IPs:
sudo iptables -I DOCKER-USER -p tcp --dport 9090 -s YOUR_IP -j ACCEPT
```

---

#### C3. Redis Without Password, Protected Mode Disabled

**Finding**:

```
bind = * -::*          (listening on all interfaces)
requirepass =          (EMPTY - no password)
protected-mode = no    (disabled)
```

**Impact**: Although Redis port 6379 is not published to the host (only accessible within Docker network), if any container in the `buhbot-network` is compromised, Redis is completely unprotected. An attacker could read/write all data, execute Lua scripts, or use Redis as a pivot point.

**Remediation**:

```bash
# In docker-compose.yml for redis:
command: redis-server --requirepass YOUR_STRONG_PASSWORD --protected-mode yes
```

Update application configs to use the password.

---

### HIGH

#### H1. Backend and Frontend Directly Accessible from Internet

**Finding**: Ports 3000 (backend API) and 3001 (frontend) are bound to 0.0.0.0, accessible from any IP:

```
curl http://185.200.177.180:3000  -> 200 (backend API directly accessible)
curl http://185.200.177.180:3001  -> 200 (frontend directly accessible)
```

**Impact**: These ports bypass Nginx, meaning:

- No SSL/TLS encryption for direct access
- No Nginx-level rate limiting or WAF rules
- Potential exposure of debug/internal endpoints
- Additional attack surface

**Remediation**: Bind to localhost in docker-compose.yml:

```yaml
# backend
ports:
  - "127.0.0.1:3000:3000"
# frontend
ports:
  - "127.0.0.1:3001:3000"
```

---

#### H2. SSL Certificate Expiring in 11 Days

**Finding**:

```
notBefore = Nov 23 16:54:17 2025 GMT
notAfter  = Feb 21 16:54:16 2026 GMT
```

**Impact**: Certificate expires 2026-02-21. If not renewed, HTTPS will break, browsers will show warnings, and API clients may fail.

**Remediation**: Verify auto-renewal is working:

```bash
sudo certbot renew --dry-run
# Or check ISPManager acme.sh cron (already present):
# 2 3 * * * /usr/local/mgr5/sbin/cron-core sbin/mgrctl -m core acmesh.certs.update
```

If dry-run fails, manually renew immediately.

---

#### H3. Memory Pressure -- 722 MB Swap in Use

**Finding**:

```
Mem:    3.7Gi total, 1.6Gi used, 316Mi free, 2.1Gi buff/cache
Swap:   1.9Gi total, 722Mi used
```

**Top memory consumers**:
| Process | Memory |
|---------|--------|
| dockerd | 397 MB (10.1%) |
| next-server | 100 MB (2.5%) |
| uptime-kuma | 94 MB (2.4%) |
| node (backend) | 89 MB (2.2%) |
| mysqld | 73 MB (1.8%) |
| grafana | 69 MB (1.7%) |
| fail2ban | 63 MB (1.6%) |
| journald | 63 MB (1.6%) |
| prometheus | 51 MB (1.3%) |
| wireguard-go | 50 MB (1.2%) |

**Impact**: When swap is heavily used, application response times increase. The VPS has only 3.7 GB RAM running Docker, MySQL, monitoring stack, mail services, and a VPN. This is tight.

**Remediation**:

- Consider upgrading VPS RAM to 8 GB
- Or move monitoring stack (Prometheus + Grafana + Uptime Kuma) to a separate server
- Review if MySQL and mail services (dovecot, exim4) are actively needed

---

#### H4. ISPManager Control Panel Exposed

**Finding**: ISPManager is listening on port 1500 (bound to 185.200.177.180:1500) and allowed through UFW.

**Impact**: Control panels are high-value targets. If ISPManager has any vulnerability, it provides full server control.

**Remediation**: Restrict ISPManager access to specific admin IPs via UFW:

```bash
sudo ufw delete allow 1500,1501/tcp
sudo ufw allow from ADMIN_IP to any port 1500,1501 proto tcp comment 'ISPManager admin only'
```

---

### MEDIUM

#### M1. Pending System Updates (29+ packages including kernel)

**Finding**: 29+ packages are upgradable, including:

- `linux-generic` 6.8.0-87 -> 6.8.0-100 (kernel security update)
- `docker-ce` 29.0.2 -> 29.2.1
- `containerd.io` 2.1.5 -> 2.2.1
- `systemd` libraries
- `apparmor`
- `libldap2` (LDAP library)

**Impact**: Known vulnerabilities in older kernel and Docker versions remain unpatched.

**Remediation**:

```bash
sudo apt update && sudo apt upgrade -y
# Schedule a reboot for kernel update
sudo reboot  # During maintenance window
```

---

#### M2. FTP Service Running (ProFTPd)

**Finding**: ProFTPd is listening on port 21, allowed through UFW.

**Impact**: FTP transmits credentials in plaintext. It is an obsolete protocol with known security issues.

**Remediation**: Replace with SFTP (already available via SSH) and disable FTP:

```bash
sudo systemctl stop proftpd
sudo systemctl disable proftpd
sudo ufw delete allow 21/tcp
```

---

#### M3. Mail Services Running (Dovecot, Exim4)

**Finding**: Multiple mail ports open (25, 110, 143, 465, 587, 993, 995). Dovecot (IMAP/POP3) and Exim4 (SMTP) are running.

**Impact**: Mail services are frequent attack targets and increase attack surface. If not actively used, they should be disabled.

**Remediation**: If mail is not needed:

```bash
sudo systemctl stop dovecot exim4
sudo systemctl disable dovecot exim4
sudo ufw delete allow 25/tcp
sudo ufw delete allow 110/tcp
sudo ufw delete allow 143/tcp
sudo ufw delete allow 465/tcp
sudo ufw delete allow 587/tcp
sudo ufw delete allow 993/tcp
sudo ufw delete allow 995/tcp
```

---

#### M4. DNS Server Running (BIND)

**Finding**: BIND (named) is listening on the public IP 185.200.177.180:53 and on multiple Docker bridge interfaces. DNS is allowed through UFW (53/tcp, 53/udp).

**Impact**: Open DNS resolvers can be abused for DNS amplification attacks. If not serving as an authoritative DNS, this should be restricted.

**Remediation**: If BIND is not needed for hosting:

```bash
sudo systemctl stop named
sudo systemctl disable named
sudo ufw delete allow 53/tcp
sudo ufw delete allow 53/udp
```

If needed, restrict to authoritative-only and disable recursion.

---

#### M5. Amnezia VPN Container High Traffic

**Finding**:

```
amnezia-awg: NET I/O = 297GB / 304GB (sent/received)
```

**Impact**: This VPN container has transferred ~600 GB of data. This is normal for a VPN but worth monitoring for abuse (proxying, torrenting through the server).

---

#### M6. Web Attack Patterns in Nginx Logs

**Finding**: Active scanning/attack attempts observed:

```
GET /.git/config          (3 different IPs)
POST /boaform/admin/formLogin
POST /form/admin/upload
POST /webhook/admin/import
```

**Impact**: Automated scanners are probing for exposed Git configs, admin panels, and upload endpoints. All returned 404, indicating no vulnerability, but the volume suggests the server is being actively targeted.

**Remediation**: Consider adding fail2ban jails for Nginx (currently only SSH jail is configured).

---

### LOW / INFO

#### L1. Only Root in UID=0 -- GOOD

```
root:x:0:0:root:/root:/bin/bash
```

No unauthorized UID=0 accounts.

#### L2. No Cryptominers Detected -- GOOD

No processes matching known cryptominer patterns (xmrig, kinsing, etc.).

#### L3. No Executables in /tmp -- GOOD

No executable files found in /tmp, /var/tmp, or /dev/shm.

#### L4. No OOM Kills -- GOOD

No OOM killer events in dmesg.

#### L5. Cron Jobs -- NORMAL

All cron jobs belong to ISPManager (certificate renewal, stats, monitoring). No suspicious entries.

#### L6. fail2ban Active -- GOOD

fail2ban is running with SSH jail. Currently 7 banned IPs, 299 total bans.

#### L7. Unattended Upgrades Active -- GOOD

`unattended-upgrades.service` is enabled and running.

#### L8. UFW Firewall Active -- GOOD (but Docker bypasses it)

Default policy: deny incoming, allow outgoing.

#### L9. Conntrack Table -- HEALTHY

```
nf_conntrack_count = 319 / 65536 max (0.5% used)
```

#### L10. TCP Keepalive -- DEFAULT

```
tcp_keepalive_time = 1200s (20 min -- slightly high for some use cases)
```

#### L11. Authorized SSH Keys

- `buhbot` user: 3 keys (ISPManager support key with IP restriction, an ed25519 key, github-actions-deploy key)
- `root` user: 1 key (ISPManager support key with IP restriction)
- ISPManager support key is restricted to IPs 85.198.118.171, 85.198.75.83 (good practice)

#### L12. Docker Version

Docker CE 29.0.2 (upgradable to 29.2.1)

#### L13. Nginx Config Valid

```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

#### L14. Established Connections -- NORMAL

```
185.200.177.180:33166 -> 176.123.174.13:443   (outbound HTTPS)
185.200.177.180:22    -> 46.175.28.98:58235    (SSH session - the audit)
185.200.177.180:41704 -> 146.0.72.149:443      (outbound HTTPS)
185.200.177.180:25    -> 185.169.4.122:11841   (SMTP connection)
```

No suspicious outbound connections.

---

## Summary Table

| #      | Severity | Finding                                                         | Status             |
| ------ | -------- | --------------------------------------------------------------- | ------------------ |
| C1     | CRITICAL | SSH: root login + password auth enabled via ISPManager override | ACTION REQUIRED    |
| C2     | CRITICAL | Monitoring ports (9090, 3002, 3003) exposed to internet         | ACTION REQUIRED    |
| C3     | CRITICAL | Redis: no password, protected-mode off                          | ACTION REQUIRED    |
| H1     | HIGH     | Backend/Frontend ports (3000, 3001) exposed to internet         | ACTION REQUIRED    |
| H2     | HIGH     | SSL certificate expires in 11 days (Feb 21)                     | ACTION REQUIRED    |
| H3     | HIGH     | Memory pressure: 722 MB swap used on 3.7 GB server              | MONITOR            |
| H4     | HIGH     | ISPManager (port 1500) unrestricted access                      | ACTION REQUIRED    |
| M1     | MEDIUM   | 29+ pending updates including kernel security                   | SCHEDULE UPDATE    |
| M2     | MEDIUM   | FTP service running (plaintext protocol)                        | REVIEW NEED        |
| M3     | MEDIUM   | Mail services (Dovecot/Exim4) running                           | REVIEW NEED        |
| M4     | MEDIUM   | DNS (BIND) on public IP                                         | REVIEW NEED        |
| M5     | MEDIUM   | VPN container ~600 GB traffic                                   | MONITOR            |
| M6     | MEDIUM   | Active web scanning/attacks in logs                             | ADD FAIL2BAN JAILS |
| L1-L14 | LOW/INFO | Various checks passed                                           | OK                 |

---

## Recommended Action Priority

### Immediate (today/tomorrow)

1. **Fix SSH override** (C1) -- Edit `/etc/ssh/sshd_config.d/40-hosting.conf` to disable root login and password auth
2. **Restrict monitoring ports** (C2) -- Change Docker port bindings to `127.0.0.1:PORT:PORT`
3. **Restrict backend/frontend ports** (H1) -- Same approach
4. **Verify SSL auto-renewal** (H2) -- Run `certbot renew --dry-run` or trigger ISPManager renewal

### This week

5. **Set Redis password** (C3) -- Add `--requirepass` to Redis command
6. **Restrict ISPManager** (H4) -- Limit to admin IPs in UFW
7. **Apply system updates** (M1) -- `apt upgrade` + reboot for kernel

### This month

8. **Review FTP, Mail, DNS** (M2, M3, M4) -- Disable if not needed
9. **Add Nginx fail2ban jails** (M6) -- Protect against web attacks
10. **Memory optimization** (H3) -- Consider RAM upgrade or service redistribution

---

## Server Profile

| Property     | Value                                |
| ------------ | ------------------------------------ |
| Hostname     | vladimir.topb.fvds.ru                |
| Public IP    | 185.200.177.180                      |
| Domain       | buhbot.aidevteam.ru                  |
| OS           | Ubuntu 24.04.3 LTS                   |
| Kernel       | 6.8.0-87-generic                     |
| CPU          | x86_64                               |
| RAM          | 3.7 GB (1.6 GB used + 722 MB swap)   |
| Disk         | 59 GB (31 GB used, 55%)              |
| Docker       | 29.0.2                               |
| Uptime       | 85 days                              |
| Panel        | ISPManager                           |
| Firewall     | UFW (active, but Docker bypasses it) |
| IDS          | fail2ban (SSH jail only)             |
| VPN          | Amnezia WireGuard                    |
| Auto-updates | unattended-upgrades (enabled)        |

---

_Report generated 2026-02-10 by server-hardening-specialist agent (read-only audit)_
