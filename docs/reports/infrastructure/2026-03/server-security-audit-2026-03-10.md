---
report_type: security-health-audit
generated: 2026-03-10T18:55:00+01:00
hostname: info511.fvds.ru (95.81.98.230)
os: Ubuntu 24.04.3 LTS (Noble Numbat)
kernel: 6.8.0-100-generic
uptime: 27 days, 23 hours
status: PARTIAL - action required
agent: server-hardening-specialist
audit_type: READ-ONLY
---

# MegaCampus Server Security & Health Audit

**Date**: 2026-03-10
**Server**: info511.fvds.ru (95.81.98.230)
**OS**: Ubuntu 24.04.3 LTS, kernel 6.8.0-100-generic
**Uptime**: 27 days, 23:18

---

## Summary of Findings

| Severity | Count | Details                                                                                                                                       |
| -------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 1     | Postfix (SMTP) listening on 0.0.0.0:25, not firewalled                                                                                        |
| HIGH     | 3     | Pending kernel reboot; legacy TLS 1.0/1.1 in nginx default; Docker build cache 18 GB                                                          |
| MEDIUM   | 5     | SSH on default port 22; PermitRootLogin allows key-based root; weak SSH MACs; AllowTcpForwarding/AllowAgentForwarding enabled; 1 GB APT cache |
| LOW      | 3     | 4 orphan Docker volumes; no AllowUsers directive in SSH; dev cert expires in 32 days                                                          |
| INFO     | 5     | Good baseline: password auth disabled, fail2ban active, UFW enabled, auto-updates on, Docker ports bound to 127.0.0.1                         |

---

## CRITICAL Findings

### C1. Postfix (SMTP) Listening on All Interfaces, Not Firewalled

**Severity**: CRITICAL
**Port**: 25/tcp bound to 0.0.0.0 and [::]
**Process**: Postfix master (pid 3357655)
**Firewall**: No UFW rule blocks or allows port 25 -- default deny SHOULD block it, but Postfix `inet_interfaces = all` means it accepts connections on all interfaces.

**Risk**: Open mail relay potential. Although `smtpd_relay_restrictions` includes `defer_unauth_destination` and SASL is disabled, an exposed SMTP port is a target for spam relay attempts, enumeration, and CVE exploitation. UFW default deny incoming should block external connections, but the service is still binding publicly which is unnecessary.

**Recommended Fix**:

```bash
# Option A: Restrict Postfix to localhost only
sudo postconf -e 'inet_interfaces = loopback-only'
sudo systemctl restart postfix

# Option B: If Postfix is not needed at all, disable it
sudo systemctl stop postfix
sudo systemctl disable postfix
```

---

## HIGH Findings

### H1. Pending Kernel Reboot (12+ Days Overdue)

**Severity**: HIGH
**Current kernel**: 6.8.0-100-generic
**Available kernel**: 6.8.0-101-generic (installed)
**Reboot required since**: 2026-02-26 (12 days ago)

**Risk**: The newer kernel likely contains security patches. Running an outdated kernel with a pending reboot leaves known vulnerabilities unpatched.

**Recommended Fix**:

```bash
# Schedule a maintenance window and reboot
sudo reboot
```

### H2. Legacy TLS 1.0/1.1 Enabled in Nginx Default Config

**Severity**: HIGH
**Location**: Nginx default server block (likely `/etc/nginx/nginx.conf` or a default snippet)
**Current**: `ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;`
**Expected**: `ssl_protocols TLSv1.2 TLSv1.3;`

The application vhosts correctly use `TLSv1.2 TLSv1.3`, but the default/fallback server block still allows TLS 1.0 and 1.1, which are deprecated and vulnerable to BEAST, POODLE, and other attacks.

**Recommended Fix**:

```bash
# Edit the default nginx SSL config (likely /etc/nginx/nginx.conf)
# Change: ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;
# To:     ssl_protocols TLSv1.2 TLSv1.3;
sudo nginx -t && sudo systemctl reload nginx
```

### H3. Docker Build Cache Consuming 18.1 GB

**Severity**: HIGH
**Location**: /var/lib/docker/ (28 GB total)
**Build cache**: 18.11 GB (mostly from docling-mcp image builds with PyTorch/CUDA)
**Disk free**: 113 GB (20% used) -- not urgent, but wasteful

Two old docling-mcp images (8.5 GB + 8.3 GB) account for ~17 GB alone, plus build cache layers with libtorch_cuda.so (~1 GB each).

**Recommended Fix**:

```bash
# Remove unused build cache (keeps recently used layers)
sudo docker builder prune --filter 'until=168h' -f

# Remove the old docling-mcp image if not needed
sudo docker rmi ghcr.io/maslennikov-ig/megacampusai/docling-mcp:latest
```

---

## MEDIUM Findings

### M1. SSH Running on Default Port 22

**Severity**: MEDIUM

SSH is on port 22, which attracts automated brute-force scanners. fail2ban has already banned 1,201 IPs (22,178 total failed attempts), with ~20 bans just today. Changing the port would eliminate >95% of automated scanning noise.

**Recommended Fix**: Change SSH port to a non-standard port (e.g., 2222) in sshd_config.d, update UFW rules before restarting SSH.

### M2. PermitRootLogin Set to "prohibit-password" (Key-Based Root Login Allowed)

**Severity**: MEDIUM
**Current**: `PermitRootLogin prohibit-password`
**Recommended**: `PermitRootLogin no`

While password-based root login is disabled, key-based root login is still permitted. Best practice is to disable root login entirely and use sudo from a regular user account (which is already set up with `claude-deploy` in the sudo group).

### M3. Weak SSH MACs and Ciphers Still Allowed

**Severity**: MEDIUM

The effective SSH configuration includes legacy/weak algorithms:

- **MACs**: `umac-64-etm`, `umac-64`, `hmac-sha1-etm`, `hmac-sha1` (all weak)
- **Ciphers**: Include `aes128-ctr`, `aes192-ctr` (prefer GCM modes)

**Recommended**: Restrict to strong algorithms only:

```
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```

### M4. AllowTcpForwarding and AllowAgentForwarding Enabled

**Severity**: MEDIUM
**Current**: Both `allowtcpforwarding yes` and `allowagentforwarding yes`

If an attacker compromises an SSH session, TCP forwarding allows pivoting to internal services. Agent forwarding exposes SSH keys to the server.

**Note**: TCP forwarding may be intentionally needed for the SOCKS5 tunnel (port 1080) used by the NotebookLM bridge. Verify before disabling.

### M5. APT Cache Consuming 1 GB

**Severity**: MEDIUM
**Size**: 1019 MB in /var/cache/apt/archives/
**Includes**: 535 MB linux-firmware .deb file

**Recommended Fix**:

```bash
sudo apt-get clean
```

---

## LOW Findings

### L1. Orphan Docker Volumes (4)

**Severity**: LOW

Dangling volumes not attached to any container:

- `megacampus_docling-cache` (0 B)
- `megacampus_docling-models` (0 B)
- `treejar_pgdata-dev` (47.9 MB)
- `treejar_redis-data-dev` (88 B)

The treejar volumes appear to be from a discontinued/test project.

**Recommended Fix**:

```bash
sudo docker volume rm treejar_pgdata-dev treejar_redis-data-dev
sudo docker volume rm megacampus_docling-cache megacampus_docling-models
```

### L2. No AllowUsers Directive in SSH Configuration

**Severity**: LOW

Without `AllowUsers`, any system user with a valid key/password can log in via SSH. Adding an explicit allowlist reduces risk.

**Recommended Fix**: Add `AllowUsers claude-deploy` to sshd_config.d.

### L3. dev.ai.megacampus.ru SSL Certificate Expires in 32 Days

**Severity**: LOW
**Expiry**: 2026-04-12
**Auto-renewal**: Certbot is installed; verify the renewal timer is active.

The ai.megacampus.ru cert is valid for 65 more days (healthy). The dev cert is at 32 days, which is within Let's Encrypt auto-renewal window (30 days), so it should renew soon automatically.

**Verify**:

```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

---

## INFO Findings (Positive)

### I1. Password Authentication Disabled -- GOOD

SSH `PasswordAuthentication no` and `KbdInteractiveAuthentication no` are correctly set. Key-only authentication is enforced.

### I2. fail2ban Active and Effective -- GOOD

- Running for 2+ weeks continuously
- SSH jail active with 5-attempt threshold, 2-hour ban
- Recidive jail active (24h ban for repeat offenders)
- 1,201 total IPs banned, 3 currently banned
- Using UFW as ban action (correct integration)

### I3. UFW Firewall Enabled with Default Deny -- GOOD

- Default: deny incoming, allow outgoing, deny routed
- Only ports 22, 80, 443 open to the internet
- Privoxy (8118) and SOCKS5 (1080) restricted to Docker network 172.19.0.0/16

### I4. Automatic Security Updates Enabled -- GOOD

- unattended-upgrades installed and running
- Daily package list updates, daily security upgrades
- Weekly auto-clean configured

### I5. Docker Ports Properly Bound to 127.0.0.1 -- GOOD

All application containers bind to localhost only:

- API blue: 127.0.0.1:4001
- API dev: 127.0.0.1:4010
- Web blue: 127.0.0.1:3001
- Web dev: 127.0.0.1:3010
- Redis: 127.0.0.1:6379
- NotebookLM bridge dev: 127.0.0.1:8010

Worker containers expose no ports. This is correct -- nginx reverse proxy handles external traffic.

---

## System Health Summary

### Disk Usage -- HEALTHY

| Mount     | Size   | Used   | Avail  | Use% |
| --------- | ------ | ------ | ------ | ---- |
| / (vda3)  | 148 GB | 28 GB  | 113 GB | 20%  |
| /boot/efi | 100 MB | 4.4 MB | 96 MB  | 5%   |
| Inodes    | 9.6M   | 499K   | 9.1M   | 6%   |

**Top consumers**:

- /var/lib/docker/: 28 GB (build cache is 18 GB of this)
- /opt/megacampus/data/: 1.1 GB
- /opt/megacampus/backups/: 827 MB
- /var/log/: 218 MB
- /var/cache/apt/: 1 GB

### Memory -- HEALTHY

|      | Total  | Used   | Free   | Available |
| ---- | ------ | ------ | ------ | --------- |
| RAM  | 11 Gi  | 3.1 Gi | 649 Mi | 8.5 Gi    |
| Swap | 4.0 Gi | 19 Mi  | 4.0 Gi | -         |

Memory is well-managed: 3.1 GB used, 8.3 GB in buff/cache, 8.5 GB available. Swap usage is negligible (19 MB on zram).

### CPU Load -- HEALTHY

Load average: 0.06, 1.02, 2.53

Current load is very low (0.06). The 15-min average of 2.53 suggests recent container restarts (several containers show "Up X minutes" status), which is normal after a deployment.

### Docker Containers -- HEALTHY

All 12 containers are running:

- 6 containers show "healthy" status (API, web, redis, notebooklm-bridge)
- 6 worker containers running without health checks (normal for worker processes)
- No exited or crashed containers
- No restart loops detected

### File Permissions -- GOOD

- All .env files: `-rw-------` (600) owned by claude-deploy -- correct
- /opt/megacampus/secrets/: owned by root -- correct
- Docker socket: `srw-rw----` owned by root:docker -- correct
- No world-writable files found in /opt/megacampus
- SUID binaries are all standard system utilities (no anomalies)

---

## Prioritized Action Plan

### Immediate (This Week)

| #   | Severity | Action                                        | Effort |
| --- | -------- | --------------------------------------------- | ------ |
| 1   | CRITICAL | Restrict Postfix to localhost or disable it   | 2 min  |
| 2   | HIGH     | Schedule reboot for pending kernel update     | 5 min  |
| 3   | HIGH     | Fix legacy TLS 1.0/1.1 in nginx default block | 5 min  |

### Short-Term (This Month)

| #   | Severity | Action                                                | Effort |
| --- | -------- | ----------------------------------------------------- | ------ |
| 4   | HIGH     | Clean Docker build cache (reclaim ~18 GB)             | 2 min  |
| 5   | MEDIUM   | Harden SSH: disable root login, restrict MACs/ciphers | 10 min |
| 6   | MEDIUM   | Clean APT cache (reclaim ~1 GB)                       | 1 min  |
| 7   | LOW      | Remove orphan Docker volumes                          | 1 min  |

### Optional Hardening (Recommended)

| #   | Severity | Action                                                     | Effort |
| --- | -------- | ---------------------------------------------------------- | ------ |
| 8   | MEDIUM   | Change SSH to non-standard port (reduce scan noise)        | 15 min |
| 9   | MEDIUM   | Evaluate AllowTcpForwarding necessity, disable if possible | 10 min |
| 10  | LOW      | Add AllowUsers directive to SSH                            | 5 min  |
| 11  | LOW      | Verify certbot auto-renewal timer                          | 2 min  |

---

## Security Scorecard

| Category             | Score | Notes                                                                  |
| -------------------- | ----- | ---------------------------------------------------------------------- |
| SSH Hardening        | 7/10  | Password auth off, but root key login allowed, default port, weak MACs |
| Firewall             | 8/10  | UFW active with default deny, but SMTP oversight                       |
| Intrusion Prevention | 9/10  | fail2ban with SSH + recidive jails, effective                          |
| TLS/SSL              | 7/10  | Certs valid, strong ciphers on vhosts, but legacy TLS in default block |
| Docker Security      | 9/10  | All ports on 127.0.0.1, no privileged containers visible               |
| File Permissions     | 9/10  | Secrets properly locked down, no world-writable files                  |
| Patch Management     | 7/10  | Auto-updates on, but pending reboot for 12 days                        |
| System Health        | 9/10  | Low resource usage, healthy containers, clean disk                     |

**Overall Security Posture**: 8/10 -- Good baseline with specific gaps to address.

---

_Audit performed: 2026-03-10 by server-hardening-specialist_
_Type: READ-ONLY -- no changes were made to the server_
