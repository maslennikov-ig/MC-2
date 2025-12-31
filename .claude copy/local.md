# Local Private Notes

## Server Access

Production server: `95.81.98.230`

### SSH Quick Connect
```bash
ssh megacampus-prod
```

### SSH Details
- Host alias: `megacampus-prod` (configured in ~/.ssh/config)
- User: `claude-deploy`
- Key: `~/.ssh/megacampus/claude-deploy`
- Working dir: `/opt/megacampus`

### Docker Commands
```bash
# List containers
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.production.yml ps"

# View logs
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.production.yml logs -f --tail=100 worker"

# Restart service
ssh megacampus-prod "cd /opt/megacampus && docker compose -f docker-compose.production.yml restart worker"

# Flush Redis
ssh megacampus-prod "docker exec megacampus-redis redis-cli FLUSHALL"
```

### Container Names
- `megacampus-api` - API server
- `megacampus-web` - Next.js frontend
- `megacampus-worker` - BullMQ worker
- `megacampus-redis` - Redis for jobs/cache
- `megacampus-docling-mcp` - Document processing

## Notes

- This file is gitignored - safe to store sensitive info

## API Keys

**OpenRouter** (обновлён 2025-12-19):
- Используем единый ключ: `sk-or-v1-224...fb21`
- Хранится на проде: `/opt/megacampus/.env.production`
- Локально: `packages/course-gen-platform/.env`
- GitHub Secrets: `OPENROUTER_API_KEY`
