# Production Server Security & Health Audit Report

**Date:** 2026-01-14
**Server:** info511.fvds.ru (megacampus-prod)
**Auditor:** Claude Code
**Status:** PASSED (with recommendations)

---

## Executive Summary

The production server is in **good health** with no evidence of malware, trojans, or rootkits. The system is properly protected by fail2ban and UFW firewall, with automatic security updates enabled. However, there are several **security hardening recommendations** and **disk cleanup opportunities** that should be addressed.

### Key Metrics

| Metric           | Status  | Value                    |
| ---------------- | ------- | ------------------------ |
| System Uptime    | OK      | 11 days, 20 hours        |
| CPU Load         | OK      | 0.24 / 0.13 / 0.08       |
| Memory Usage     | OK      | 4.2GB / 11GB (38%)       |
| Disk Usage       | OK      | 52GB / 148GB (38%)       |
| Malware/Rootkits | OK      | None detected            |
| fail2ban         | ACTIVE  | 8 IPs currently banned   |
| Firewall         | ACTIVE  | UFW with proper rules    |
| Auto-updates     | ENABLED | Security updates enabled |

### Risk Assessment

| Category            | Risk Level | Notes                                |
| ------------------- | ---------- | ------------------------------------ |
| Malware/Trojans     | LOW        | No indicators found                  |
| Unauthorized Access | LOW        | fail2ban active, SSH monitored       |
| SSH Configuration   | MEDIUM     | Root login and password auth enabled |
| Disk Space          | LOW        | 38% used, cleanup available          |
| Docker              | LOW        | ~31GB reclaimable space              |

---

## 1. Malware/Trojans/Rootkits Check

### 1.1 Process Analysis

**Status:** CLEAN

- No suspicious processes detected
- No processes running with deleted binaries
- No cryptominers or mining-related network connections
- Process count matches /proc entries (no hidden processes)

**Top CPU Consumers (normal operations):**

- Node.js application processes
- Python docling-mcp-server (21.6% memory - expected for ML model)
- Docker daemon
- systemd processes

### 1.2 Kernel Modules

**Status:** CLEAN

- All loaded modules are standard Ubuntu modules
- No rootkit-related modules detected (diamorphine, reptile, etc.)
- Network filtering modules (iptables, nf_nat) are normal

### 1.3 Cron Jobs

**Status:** CLEAN

- No unauthorized cron jobs found
- Standard system cron directories contain only expected entries

### 1.4 Network Connections

**Status:** CLEAN

- Only expected services listening on network
- No suspicious outbound connections
- Only current SSH session from 80.74.28.160 (your connection)

**Listening Services:**
| Port | Service | Binding | Status |
|------|---------|---------|--------|
| 22 | SSH | 0.0.0.0 | PUBLIC |
| 25 | Postfix | 0.0.0.0 | PUBLIC |
| 80 | Nginx | 0.0.0.0 | PUBLIC |
| 443 | Nginx | 0.0.0.0 | PUBLIC |
| 53 | systemd-resolved | 127.0.0.x | LOCAL |
| 3001, 3010 | Next.js (web) | 127.0.0.1 | LOCAL |
| 4001, 4010 | API | 127.0.0.1 | LOCAL |
| 6379 | Redis | 127.0.0.1 | LOCAL |
| 8000 | Docling MCP | 127.0.0.1 | LOCAL |

### 1.5 User Accounts

**Status:** CLEAN

- Only expected users with shell access:
  - root (UID 0) - standard
  - sync (UID 4) - standard system account
  - claude-deploy (UID 1000) - deployment user
- No unauthorized UID 0 accounts

### 1.6 SSH Keys

**Status:** CLEAN

- Root: 1 authorized key (supportAccessKey, IP-restricted to 85.198.118.171, 85.198.75.83)
- claude-deploy: 2 authorized keys (claude-deploy@megacampus, claude-code-local)

### 1.7 Temporary Directories

**Status:** CLEAN

- /tmp: Only systemd private directories and one legitimate script
- /var/tmp: Only systemd private directories
- No suspicious hidden files or executables

### 1.8 rkhunter Check

**Status:** WARNINGS (minor)

```
Warning: The SSH configuration option 'PermitRootLogin' has not been set.
Warning: Hidden file found: /etc/.updated: ASCII text
```

The /etc/.updated file is a standard Ubuntu marker file.

---

## 2. Server Load Analysis

### 2.1 CPU

**Status:** EXCELLENT

```
Load Average: 0.24, 0.13, 0.08 (1min, 5min, 15min)
```

The server is under minimal load. 8-core system with load average well under 1.0.

### 2.2 Memory

**Status:** GOOD

```
Total: 11GB
Used: 4.2GB (38%)
Available: 7.4GB
Swap Used: 8.2MB / 4GB (<1%)
```

**Top Memory Consumers:**
| Process | Memory | Notes |
|---------|--------|-------|
| docling-mcp-server | 2.6GB (21.6%) | ML model server - expected |
| Node.js workers | ~250MB each | Application workers |
| next-server | ~165MB each | Web servers |
| containerd/dockerd | ~100MB | Container runtime |

### 2.3 Disk I/O

iostat not installed, but no I/O wait issues observed in process list.

---

## 3. Disk Usage & Garbage

### 3.1 Overall Disk Usage

```
Filesystem      Size  Used  Avail  Use%
/dev/vda3       148G   52G   89G   38%
```

**Status:** GOOD - 89GB available

### 3.2 Directory Breakdown

| Directory       | Size  | Notes                     |
| --------------- | ----- | ------------------------- |
| /var            | 62GB  | Mostly Docker             |
| /var/lib/docker | 61GB  | Images, containers, cache |
| /usr            | 2.2GB | System binaries           |
| /opt            | 181MB | Application data          |
| /boot           | 181MB | Kernels                   |

### 3.3 Docker Disk Usage

**CRITICAL FINDING: ~31GB reclaimable space**

```
TYPE           TOTAL    ACTIVE   SIZE      RECLAIMABLE
Images         123      7        26.59GB   11.81GB (44%)
Containers     11       11       575.6MB   0B (0%)
Local Volumes  6        6        84.94MB   0B (0%)
Build Cache    173      0        27.8GB    19.42GB
```

**Issues:**

- 114 dangling images consuming ~11.8GB
- Build cache with 19.4GB reclaimable
- Total potential cleanup: **~31GB**

### 3.4 Log Files

**Status:** OK - properly rotated

- Systemd journal: ~500MB (rotating 56MB files)
- Nginx logs: ~6MB (properly rotated with 14-day retention)
- btmp (failed logins): **38MB total** - cleanup recommended

### 3.5 Other Cleanup Candidates

| Item                  | Size   | Action             |
| --------------------- | ------ | ------------------ |
| APT cache             | 711MB  | `apt clean`        |
| Old kernel (6.8.0-88) | ~200MB | `apt autoremove`   |
| btmp.1                | 30MB   | Rotate or truncate |

---

## 4. Security Configuration

### 4.1 SSH Configuration

**Status:** NEEDS HARDENING

Current settings:

```
Port: 22 (default)
PermitRootLogin: yes       [WARNING]
PasswordAuthentication: yes [WARNING]
PubkeyAuthentication: yes   [OK]
MaxAuthTries: 3            [OK]
X11Forwarding: no          [OK]
PermitEmptyPasswords: no   [OK]
```

**Recommendations:**

1. Set `PermitRootLogin no` (use sudo instead)
2. Set `PasswordAuthentication no` (keys already configured)
3. Consider changing SSH port from 22

### 4.2 Firewall (UFW)

**Status:** PROPERLY CONFIGURED

```
Default: deny (incoming), allow (outgoing)
```

**Allowed Ports:**

- 22/tcp (SSH)
- 80/tcp (HTTP)
- 443/tcp (HTTPS)
- 1500,1501/tcp (ispmanager - hosting panel)

**Currently Banned IPs (8):**

- 5.187.35.21, 92.118.39.56, 167.71.70.135
- 91.202.233.33, 161.35.145.173, 157.245.66.5
- 45.140.17.124, 45.135.232.92

### 4.3 fail2ban

**Status:** ACTIVE AND EFFECTIVE

```
Jails: sshd, recidive
Total Failed: 110
Currently Banned: 8 IPs
Total Banned: 20 IPs
```

fail2ban is actively blocking brute-force attempts.

### 4.4 Failed Login Attempts

**Status:** ACTIVE ATTACKS BEING BLOCKED

Recent failed login attempts (being blocked by fail2ban):

- Multiple IPs attempting root/ubuntu/admin/guest logins
- IPs: 63.135.169.175, 45.135.232.92, 14.98.28.43, etc.
- All being properly handled by fail2ban

### 4.5 Recent Successful Logins

Only legitimate logins detected:

- Root logins from 185.200.177.180 (Dec 15-18)
- Current session

### 4.6 Automatic Security Updates

**Status:** ENABLED

```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
```

### 4.7 Running Services

**Status:** OK - No unnecessary services

Active services are all expected:

- containerd, docker (container runtime)
- nginx (web server)
- postfix (mail - could be disabled if not needed)
- fail2ban, ssh (security)
- systemd services (system management)

### 4.8 Exposed Ports Security

| Port      | Service    | Risk   | Notes                          |
| --------- | ---------- | ------ | ------------------------------ |
| 22        | SSH        | MEDIUM | Exposed, protected by fail2ban |
| 25        | SMTP       | LOW    | Postfix for outgoing mail      |
| 80/443    | HTTP/HTTPS | LOW    | Expected, behind nginx         |
| 1500/1501 | ispmanager | LOW    | Hosting panel                  |

---

## 5. Recommendations

### CRITICAL (Do within 24 hours)

1. **Harden SSH Configuration**

   ```bash
   sudo vim /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   # Set: PasswordAuthentication no
   sudo systemctl reload sshd
   ```

   **WARNING:** Ensure claude-deploy sudo access works before disabling root login!

### HIGH Priority (This week)

2. **Docker Cleanup** (~31GB recoverable)

   ```bash
   # Remove dangling images
   docker image prune -f

   # Remove unused build cache
   docker builder prune -f

   # Full cleanup (careful - removes all unused data)
   docker system prune -a --volumes
   ```

3. **System Cleanup** (~1GB recoverable)
   ```bash
   sudo apt clean
   sudo apt autoremove -y
   sudo truncate -s 0 /var/log/btmp.1
   ```

### MEDIUM Priority (This month)

4. **Consider Changing SSH Port**
   - Reduces automated scanning noise
   - Not security through obscurity alone, but reduces attack surface

5. **Review Port 25 (Postfix)**
   - If mail is not needed, disable postfix

   ```bash
   sudo systemctl disable postfix
   sudo systemctl stop postfix
   ```

6. **Install iostat for monitoring**
   ```bash
   sudo apt install sysstat
   ```

### LOW Priority (Ongoing)

7. **Regular Maintenance Schedule**
   - Weekly: Docker cleanup (`docker system prune`)
   - Monthly: Full security audit
   - Monthly: Review fail2ban logs
   - Monthly: Check for system updates

---

## 6. Cleanup Commands (Copy-Paste Ready)

### Safe Docker Cleanup (~20GB)

```bash
# Remove dangling images only
docker image prune -f

# Remove unused build cache
docker builder prune -f

# Show what would be removed (dry run)
docker system prune --dry-run
```

### Aggressive Docker Cleanup (~31GB)

```bash
# WARNING: Removes all unused images, not just dangling
docker system prune -a -f

# Also clean volumes (be careful with data!)
# docker volume prune -f
```

### System Cleanup

```bash
# Clean APT cache
sudo apt clean

# Remove old kernels and packages
sudo apt autoremove -y

# Truncate old btmp log
sudo truncate -s 0 /var/log/btmp.1
```

---

## 7. Summary

| Area             | Status     | Action Required      |
| ---------------- | ---------- | -------------------- |
| Malware/Rootkits | CLEAN      | None                 |
| Server Load      | EXCELLENT  | None                 |
| Disk Usage       | GOOD       | Cleanup recommended  |
| SSH Security     | NEEDS WORK | Harden configuration |
| Firewall         | GOOD       | None                 |
| fail2ban         | ACTIVE     | None                 |
| Auto-updates     | ENABLED    | None                 |

**Overall Assessment:** The server is healthy and secure. The main concerns are:

1. SSH allows root login and password authentication (should be disabled)
2. Docker consuming 61GB (31GB reclaimable)

No evidence of compromise or malicious activity.

---

_Report generated: 2026-01-14 09:20 UTC_
_Next audit recommended: 2026-02-14_
