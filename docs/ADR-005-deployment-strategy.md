# ADR-005: Deployment Strategy and Environment Architecture

Date: 2026-01-11
Status: Accepted

## Context

The current domain ai.megacampus.ru is used for both development and staging. We need proper environment isolation while operating on a single server with limited resources (8 CPU, 11GB RAM).

Key requirements:

1. Distinct Dev and Staging environments
2. Zero-downtime deployment for Staging
3. Fast rollback mechanism
4. Efficient resource utilization

## Decision

We adopt a multi-environment architecture with Blue/Green deployment for staging.

### 1. Environment Architecture

| Domain               | Environment | Branch  | Deploy Strategy  |
| -------------------- | ----------- | ------- | ---------------- |
| dev.ai.megacampus.ru | Dev         | develop | Simple (rolling) |
| ai.megacampus.ru     | Staging     | master  | Blue/Green       |
| TBD                  | Production  | TBD     | Blue/Green       |

### 2. Blue/Green Deployment

Zero-downtime deployment via nginx port switching:

- **Blue slot**: web:3001, api:4001
- **Green slot**: web:3002, api:4002
- Health check before traffic switch
- Instant rollback via nginx reload

### 3. Shared Infrastructure

Single instances for stateful/heavy services (shared across Blue/Green):

- Redis (queue state)
- Docling MCP (document processing)
- Workers (job processing)

Application services (Blue/Green switchable):

- web (Next.js frontend)
- api (Backend API)

### 4. Docker Compose Split

```
docker-compose.infra.yml    # Redis, Docling, Workers (1 instance)
docker-compose.app.yml      # Web, API (Blue/Green)
```

### 5. CI/CD Pipeline

- Pre-commit: Husky + lint-staged
- Tiered testing per branch
- Docker cache with GitHub Actions
- Automated deployment on branch push

### 6. Branch Strategy

- `develop` → dev.ai.megacampus.ru (simple deploy)
- `master` → ai.megacampus.ru (Blue/Green deploy)
- `feature/*` → PR to develop

## Consequences

### Positive

- Zero downtime during deployments
- Instant rollback capability
- Environment isolation
- Fast feedback loop on develop branch
- Resource-efficient (shared infrastructure)

### Negative

- Initial setup complexity (one-time)
- Two application container sets on same server
- Requires DNS configuration for dev subdomain

## Related Documents

- [ADR-004: Blue/Green Deployment Strategy](./ADR-004-blue-green-deployment.md)
- [RFC-001: Branching Strategy](./RFC-001-branching-strategy.md)
- `.github/workflows/ci-cd.yml`
