# 1. Blue/Green Deployment Strategy and Staging Environment

Date: 2025-10-29
Status: Accepted

## Context

The project currently relies on a single development environment. As we move towards production, we require:
1.  A dedicated **Staging environment** to validate changes before they reach production.
2.  A **Zero-Downtime deployment strategy** for Production to ensure high availability during updates.
3.  A robust **Rollback mechanism** in case of deployment failures.

## Decision

We have decided to implement a **Blue/Green Deployment** strategy orchestrated via GitHub Actions and shell scripts, and to formalize the **Staging Environment** using GitHub Environments.

### 1. GitHub Environments
We will utilize GitHub Environments to manage configuration differences between `staging` and `production`.
- **Secrets**: Environment-specific secrets (e.g., `SUPABASE_URL`, `DEPLOY_SSH_KEY`).
- **Variables**: Non-sensitive configuration (e.g., `DEPLOY_HOST`, `DEPLOY_PATH`, `SITE_URL`).

### 2. Blue/Green Architecture
We will run two identical application instances ("Blue" and "Green") on the production server, listening on different ports (e.g., 4001 and 4002).
- **Nginx** will serve as the reverse proxy and traffic switch.
- **Docker Compose** will manage the application containers for each color slot.

### 3. Deployment Workflow
The deployment process will be automated via `scripts/deploy_blue_green.sh`:
1.  **Identify Active Color**: Determine which slot (Blue or Green) is currently live.
2.  **Deploy to Idle Color**: Pull and start the new version on the idle slot.
3.  **Health Check**: Perform smoke tests (HTTP health check) on the new slot.
4.  **Traffic Switch**: If healthy, update Nginx configuration to point to the new slot and reload.
5.  **Cleanup**: Stop the old slot to save resources.

## Consequences

### Positive
- **Zero Downtime**: Users experience no interruption during deployments.
- **Instant Rollback**: If the new version fails health checks, traffic is never switched. If issues arise post-switch, we can revert Nginx to the previous port immediately.
- **Environment Parity**: Staging and Production use the same deployment logic, reducing "it works on my machine" issues.
- **Automated Verification**: Deployment is gated by successful health checks on the live infrastructure.

### Negative
- **Complexity**: The deployment script is more complex than a simple `docker compose up`.
- **Server Configuration**: Requires Nginx configuration templates and specific `sudo` permissions for the deploy user.
- **Resource Usage**: During deployment, two instances of the application run simultaneously, temporarily doubling resource consumption.

## Compliance
This decision aligns with our DevSecOps best practices by ensuring automated verification before traffic switching and maintaining immutable deployment artifacts (Docker images).