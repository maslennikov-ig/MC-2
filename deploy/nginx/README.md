# Nginx Configuration - Single Source of Truth

## Overview

This directory contains the **authoritative** nginx configurations for all environments.
**Do NOT edit nginx configs directly on the server** - changes will be lost on next deploy.

## Files

| File                       | Environment          | Description                                                          |
| -------------------------- | -------------------- | -------------------------------------------------------------------- |
| `megacampus.conf.template` | Production (Staging) | Blue/Green template with `{{WEB_PORT}}`, `{{API_PORT}}`, `{{COLOR}}` |
| `megacampus-dev.conf`      | Dev                  | Static config for dev environment (ports 3010/4010)                  |

## Blue/Green Deployment (Production)

Production uses Blue/Green deployment with dynamic ports:

| Color | Web Port | API Port |
| ----- | -------- | -------- |
| Blue  | 3001     | 4001     |
| Green | 3002     | 4002     |

The template variables are replaced during deployment:

- `{{WEB_PORT}}` → 3001 or 3002
- `{{API_PORT}}` → 4001 or 4002
- `{{COLOR}}` → blue or green

## Deployment

### Automatic (CI/CD)

CI/CD automatically:

1. Copies template to server `/opt/megacampus/nginx.conf.template`
2. `deploy_blue_green.sh` applies template with current color ports
3. Reloads nginx

### Manual Update

If you need to update nginx config manually:

```bash
# 1. Edit the file in THIS directory (not on server!)
# 2. Copy to server
scp deploy/nginx/megacampus.conf.template megacampus-prod:/opt/megacampus/

# 3. Apply with current color (check active_color first)
ssh megacampus-prod "cat /opt/megacampus/active_color"  # e.g., "blue"

# 4. Apply template
ssh megacampus-prod "sed -e 's/{{WEB_PORT}}/3001/g' -e 's/{{API_PORT}}/4001/g' -e 's/{{COLOR}}/blue/g' /opt/megacampus/nginx.conf.template | sudo tee /etc/nginx/sites-enabled/megacampus > /dev/null && sudo nginx -t && sudo nginx -s reload"
```

## Troubleshooting

### 502 Bad Gateway

1. Check which ports are listening:

   ```bash
   ssh megacampus-prod "ss -tlnp | grep -E ':(3001|3002|4001|4002)'"
   ```

2. Check active color:

   ```bash
   ssh megacampus-prod "cat /opt/megacampus/active_color"
   ```

3. Compare with nginx config:

   ```bash
   ssh megacampus-prod "grep 'server 127.0.0.1' /etc/nginx/sites-enabled/megacampus"
   ```

4. If ports don't match, re-apply template with correct ports.

### Port Mapping

| active_color | WEB_PORT | API_PORT |
| ------------ | -------- | -------- |
| blue         | 3001     | 4001     |
| green        | 3002     | 4002     |

## History

- 2026-01-23: Created single source of truth after 502 incident (mc2-qcnz)
