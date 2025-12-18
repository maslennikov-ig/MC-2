# MegaCampusAI Developer Quickstart Guide

Complete step-by-step guide to set up your local development environment for MegaCampusAI.

**Target Audience**: Backend and full-stack developers
**Estimated Setup Time**: 30-45 minutes
**Last Updated**: 2025-11-04
**Project Status**: Stages 0-4 Complete (56%) - Document Processing, Summarization, Analysis Ready

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Configuration](#database-configuration)
4. [External Services Setup](#external-services-setup)
5. [Running the Application](#running-the-application)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

Before starting, ensure you have the following installed:

#### 1. Node.js 20+

**Check version:**
```bash
node --version  # Should output v20.x.x or higher
```

**Install if needed:**
- macOS: `brew install node@20`
- Ubuntu/Debian:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- Windows: Download from [nodejs.org](https://nodejs.org/)

#### 2. pnpm 8+

**Check version:**
```bash
pnpm --version  # Should output 8.x.x or higher
```

**Install if needed:**
```bash
npm install -g pnpm@8
```

#### 3. Docker (for local Redis)

**Check version:**
```bash
docker --version  # Should output Docker version 20.x or higher
```

**Install if needed:**
- macOS: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- Ubuntu:
  ```bash
  sudo apt-get update
  sudo apt-get install docker.io docker-compose
  sudo usermod -aG docker $USER  # Add yourself to docker group
  newgrp docker  # Activate group changes
  ```
- Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

#### 4. Git

**Check version:**
```bash
git --version  # Should output git version 2.x or higher
```

**Install if needed:**
- macOS: `brew install git`
- Ubuntu: `sudo apt-get install git`
- Windows: Download from [git-scm.com](https://git-scm.com/)

#### 5. Supabase CLI

**Install:**
```bash
npm install -g supabase
```

**Verify installation:**
```bash
supabase --version
```

---

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url> megacampus2
cd megacampus2
```

### 2. Install Dependencies

Install all packages in the monorepo:

```bash
pnpm install
```

**Expected outcome:**
- All dependencies installed
- No errors in console
- `node_modules/` directories created in root and packages

**If you encounter errors:**
- Ensure pnpm version is 8+: `pnpm --version`
- Clear pnpm cache: `pnpm store prune`
- Retry: `pnpm install --force`

### 3. Create Environment File

```bash
cd packages/course-gen-platform
cp .env.example .env
```

**You should see:**
```bash
packages/course-gen-platform/.env created
```

---

## Database Configuration

### 1. Create Supabase Project

**Steps:**

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in:
   - **Name**: `megacampus-dev` (or your preferred name)
   - **Database Password**: Generate strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is sufficient for development
4. Click "Create New Project"
5. Wait 2-3 minutes for project provisioning

**Expected outcome:**
- Project created successfully
- Dashboard shows project URL and API keys

### 2. Get Supabase Credentials

From your Supabase project dashboard:

1. Go to **Project Settings** (gear icon in sidebar)
2. Click **API** tab
3. Copy the following values:

**Project URL:**
```
https://<your-project-ref>.supabase.co
```

**Project API keys:**
- `anon` key (public)
- `service_role` key (secret - keep secure!)

### 3. Configure Supabase Environment Variables

Edit `packages/course-gen-platform/.env`:

```bash
# Supabase Configuration
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>
```

### 4. Link Local Project to Supabase

From `packages/course-gen-platform/` directory:

```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>
# Example: supabase link --project-ref abcdefghijklmnop
```

**You'll be prompted for:**
- Database password (from step 1)

**Expected outcome:**
```
Linked to project <your-project-ref>
```

### 5. Run Database Migrations

Apply all schema migrations to your Supabase database:

```bash
# From packages/course-gen-platform/
supabase db push
```

**Expected outcome:**
```
Applying migration 20250110_initial_schema.sql...
Applying migration 20250110_job_status.sql...
Applying migration 20250111_job_cancellation.sql...
... (all migrations applied successfully)
✓ Database migrations applied
```

**Verify migrations:**
```bash
supabase db remote list
```

Should show all applied migration files.

---

## External Services Setup

### 1. Qdrant Cloud Setup

Qdrant is our vector database for semantic search.

**Steps:**

1. Go to [cloud.qdrant.io](https://cloud.qdrant.io/)
2. Sign up for free account
3. Click "Create Cluster"
4. Fill in:
   - **Cluster Name**: `megacampus-dev`
   - **Region**: Choose closest to you
   - **Tier**: Free (1GB storage, 50K vectors)
5. Click "Create"
6. Wait 1-2 minutes for provisioning

**Get credentials:**

1. Click on your cluster name
2. Copy **Cluster URL**: `https://<cluster-id>.qdrant.cloud`
3. Click **API Keys** tab
4. Create new API key
5. Copy the key (shown only once!)

**Configure environment:**

Edit `packages/course-gen-platform/.env`:

```bash
# Qdrant Configuration
QDRANT_URL=https://<cluster-id>.qdrant.cloud
QDRANT_API_KEY=<your-qdrant-api-key>
```

**Verify connection:**

```bash
# From packages/course-gen-platform/
pnpm run verify:qdrant
```

**Expected outcome:**
```
✓ Connected to Qdrant Cloud
✓ Cluster info retrieved
Collection count: 0
```

### 2. Jina AI API Key

Jina provides our embedding generation API.

**Steps:**

1. Go to [jina.ai](https://jina.ai/)
2. Sign up for free account
3. Navigate to [API Keys](https://jina.ai/api-keys)
4. Click "Create API Key"
5. Name it: `megacampus-dev`
6. Copy the API key

**Configure environment:**

Edit `packages/course-gen-platform/.env`:

```bash
# Jina AI Embeddings
JINA_API_KEY=<your-jina-api-key>
```

**Free tier limits:**
- 1,500 requests/minute
- $0.02 per 1M tokens (generous free credits on signup)

### 3. OpenRouter API Key (LLM Models)

OpenRouter provides access to multiple LLM models for document summarization and analysis (Stages 3-4).

**Steps:**

1. Go to [openrouter.ai](https://openrouter.ai/)
2. Sign up for free account
3. Navigate to [API Keys](https://openrouter.ai/keys)
4. Click "Create Key"
5. Name it: `megacampus-dev`
6. Copy the API key

**Configure environment:**

Edit `packages/course-gen-platform/.env`:

```bash
# OpenRouter API (Stage 3-4: Summarization & Analysis)
OPENROUTER_API_KEY=<your-openrouter-api-key>
```

**Available Models:**
- GPT OSS-20B (simple tasks: classification, scope analysis)
- GPT OSS-120B (expert tasks: deep analysis, research flags)
- Gemini 2.5 Flash (fallback model for quality escalation)

**Free tier credits:**
- $5-10 credits on signup
- Pay-as-you-go after credits exhausted
- Stage 3-4 usage: ~$0.01-0.05 per course analysis

### 4. Redis Setup (Local Development)

Redis is required for BullMQ job queue.

**Start Redis with Docker:**

```bash
# Start Redis container
docker run -d \
  --name megacampus-redis \
  -p 6379:6379 \
  redis:7-alpine
```

**Expected outcome:**
```
<container-id>
```

**Verify Redis is running:**

```bash
docker ps | grep redis
```

Should show running container on port 6379.

**Configure environment:**

Edit `packages/course-gen-platform/.env`:

```bash
# Redis Configuration (BullMQ)
REDIS_URL=redis://localhost:6379
```

**Test Redis connection:**

```bash
# Using redis-cli (if installed)
redis-cli ping
# Should output: PONG
```

**Or test via Docker:**

```bash
docker exec megacampus-redis redis-cli ping
# Should output: PONG
```

### 5. OAuth Providers (Optional)

OAuth setup is optional for development. Email/password authentication works without OAuth.

**If you want to enable Google/GitHub OAuth:**

See [Supabase Auth Providers Guide](https://supabase.com/docs/guides/auth/social-login) for detailed setup instructions.

Configuration in `.env`:
```bash
# OAuth Providers (Optional - for testing social login)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## Running the Application

### 1. Create Qdrant Collection

Initialize the vector database collection:

```bash
# From packages/course-gen-platform/
pnpm run qdrant:create-collection
```

**Expected outcome:**
```
✓ Collection 'course_documents' created successfully
Configuration:
  - Vectors: 768 dimensions (Jina-v3)
  - Distance: Cosine
  - Index: HNSW (m=16, ef_construct=100)
  - Sparse vectors: BM25 enabled
```

### 2. Start Development Server

**In one terminal** (from project root):

```bash
pnpm dev
```

**Expected outcome:**
```
> @megacampus/course-gen-platform dev
> tsx watch src/server/index.ts

[INFO] Starting tRPC server...
[INFO] Server listening on http://localhost:3000
[INFO] tRPC endpoint: http://localhost:3000/trpc
[INFO] BullMQ worker started
[INFO] Health check: http://localhost:3000/health
```

### 3. Access BullMQ UI (Optional)

The BullMQ UI runs automatically with the dev server.

**Access at:**
```
http://localhost:3001
```

**Expected features:**
- View job queues
- Monitor job status
- Inspect failed jobs
- Retry/remove jobs manually

---

## Development Workflow

### Available Scripts

From **project root** (`/home/me/code/megacampus2/`):

```bash
# Development
pnpm dev              # Start tRPC dev server (auto-restart on changes)

# Building
pnpm build            # Build all packages
pnpm -r build         # Build packages recursively

# Testing
pnpm test             # Run all unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:all         # Run unit + integration + RLS tests

# Code Quality
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript type checking
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting
```

From **course-gen-platform package** (`packages/course-gen-platform/`):

```bash
# Development
pnpm dev              # Start tRPC server with hot reload

# Testing
pnpm test             # Run Vitest unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:fixtures    # Seed test database
pnpm test:rls         # Run Row Level Security tests (pgTAP)
pnpm test:all         # Run all tests

# Database
pnpm seed             # Seed database with test data
pnpm seed:clean       # Clean and re-seed database

# Utilities
pnpm verify:qdrant    # Test Qdrant connection
pnpm qdrant:create-collection  # Initialize Qdrant collection

# Code Quality
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript type checking
```

### Hot Reloading

Changes to TypeScript files automatically restart the server:

1. Edit any `.ts` file in `src/`
2. Server automatically restarts
3. Changes reflected immediately

**Monitored directories:**
- `src/server/`
- `src/routers/`
- `src/shared/`
- `src/orchestrator/`

### Environment Variables

**Development vs Production:**

The `.env` file is for **local development only**. Never commit it to git.

For production/staging:
- Set environment variables in your hosting platform
- Use secrets management (GitHub Secrets, Vercel/Railway env vars, etc.)

**Sensitive credentials:**
- `SUPABASE_SERVICE_KEY` - Never expose client-side
- `OPENROUTER_API_KEY` - Backend only (tracks usage and billing)
- `JINA_API_KEY` - Backend only
- `QDRANT_API_KEY` - Backend only
- `JWT_SECRET` - Backend only

---

## Testing

### 1. Run Unit Tests

```bash
# From project root
pnpm test

# Or from course-gen-platform package
cd packages/course-gen-platform
pnpm test
```

**Expected outcome:**
```
✓ src/shared/validation/file-validator.test.ts (12 tests)
✓ src/shared/embeddings/chunker.test.ts (8 tests)
✓ src/shared/qdrant/search.test.ts (10 tests)
✓ src/orchestrator/services/analysis/phase-1-classifier.test.ts (Stage 4)
✓ src/orchestrator/services/analysis/phase-2-scope.test.ts (Stage 4)
... (all tests passing)

Test Files  25+ passed
Tests       150+ passed (70+ integration, 20 contract, 5 unit, E2E)
```

### 2. Run Integration Tests

**Prerequisites:**
- Redis running (Docker container)
- Qdrant connection configured
- Supabase project linked

```bash
cd packages/course-gen-platform
pnpm test tests/integration/
```

**Test coverage:**
- Qdrant connection and search
- Jina embeddings generation
- BM25 hybrid search
- Document processing pipeline
- Content deduplication
- LLM summarization (Stage 3: quality validation, cost tracking)
- Multi-phase analysis (Stage 4: 20 contract tests, 6-phase orchestration)
- E2E pipeline (T055: upload → processing → summarization → analysis)

### 3. Run Database (RLS) Tests

Tests Row Level Security policies using pgTAP:

```bash
cd packages/course-gen-platform
pnpm test:rls
```

**Expected outcome:**
```
✓ RLS policies for organizations table
✓ RLS policies for courses table
✓ RLS policies for file_catalog table
... (all RLS tests passing)
```

### 4. Seed Test Data

Create test organizations, users, and courses:

```bash
cd packages/course-gen-platform
pnpm seed
```

**Creates:**
- 3 test organizations (FREE, STANDARD, PREMIUM tiers)
- Test users with different roles (admin, teacher, student)
- Sample courses
- Test documents

**Clean and re-seed:**
```bash
pnpm seed:clean
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: `pnpm install` fails

**Symptoms:**
```
ERR_PNPM_FETCH_* errors
```

**Solutions:**
1. Clear pnpm cache:
   ```bash
   pnpm store prune
   ```
2. Delete lockfile and retry:
   ```bash
   rm pnpm-lock.yaml
   pnpm install
   ```
3. Ensure Node.js version is 20+:
   ```bash
   node --version
   ```

#### Issue: Supabase connection fails

**Symptoms:**
```
Error: Failed to connect to Supabase
Invalid API key
```

**Solutions:**
1. Verify credentials in `.env`:
   - Check `SUPABASE_URL` format: `https://<project-ref>.supabase.co`
   - Check `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` are correct
2. Test connection:
   ```bash
   curl -H "apikey: <SUPABASE_ANON_KEY>" \
     -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
     <SUPABASE_URL>/rest/v1/
   ```
3. Ensure Supabase project is active (check dashboard)

#### Issue: Database migrations fail

**Symptoms:**
```
Error applying migration 20250110_initial_schema.sql
```

**Solutions:**
1. Check you're in correct directory:
   ```bash
   cd packages/course-gen-platform
   pwd  # Should end with /course-gen-platform
   ```
2. Verify project is linked:
   ```bash
   supabase status
   ```
3. Re-link project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
4. Check migration files exist:
   ```bash
   ls -la supabase/migrations/
   ```

#### Issue: Qdrant connection fails

**Symptoms:**
```
Error: Failed to connect to Qdrant
Unauthorized (401)
```

**Solutions:**
1. Verify credentials in `.env`:
   - `QDRANT_URL` should be: `https://<cluster-id>.qdrant.cloud`
   - `QDRANT_API_KEY` should be valid (check Qdrant dashboard)
2. Test connection manually:
   ```bash
   pnpm run verify:qdrant
   ```
3. Check cluster status in [Qdrant Cloud dashboard](https://cloud.qdrant.io/)
4. Regenerate API key if needed

#### Issue: Redis connection fails

**Symptoms:**
```
Error: Redis connection to localhost:6379 failed
ECONNREFUSED
```

**Solutions:**
1. Check Redis container is running:
   ```bash
   docker ps | grep redis
   ```
2. Start Redis if stopped:
   ```bash
   docker start megacampus-redis
   ```
3. Or create new container:
   ```bash
   docker run -d --name megacampus-redis -p 6379:6379 redis:7-alpine
   ```
4. Verify connection:
   ```bash
   docker exec megacampus-redis redis-cli ping
   # Should output: PONG
   ```

#### Issue: Port 3000 already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
1. Find process using port 3000:
   ```bash
   # macOS/Linux
   lsof -i :3000

   # Or use netstat
   netstat -anp | grep :3000
   ```
2. Kill the process:
   ```bash
   kill -9 <PID>
   ```
3. Or change port in `.env`:
   ```bash
   PORT=3001
   ```

#### Issue: Tests fail with "SUPABASE_SERVICE_KEY not found"

**Symptoms:**
```
Error: Environment variable SUPABASE_SERVICE_KEY is required
```

**Solutions:**
1. Ensure `.env` file exists in `packages/course-gen-platform/`
2. Check `SUPABASE_SERVICE_KEY` is set (not `SUPABASE_SERVICE_ROLE_KEY`)
3. For CI/CD: Set GitHub Secrets
4. Restart test:
   ```bash
   pnpm test
   ```

#### Issue: BullMQ jobs stuck in "waiting"

**Symptoms:**
- Jobs appear in BullMQ UI but never process
- Worker not consuming jobs

**Solutions:**
1. Verify Redis is running:
   ```bash
   docker ps | grep redis
   ```
2. Check worker is started (should happen automatically with `pnpm dev`)
3. Restart development server:
   ```bash
   # Ctrl+C to stop
   pnpm dev
   ```
4. Check BullMQ UI at `http://localhost:3001`

#### Issue: TypeScript errors after pulling changes

**Symptoms:**
```
Error: Cannot find module './types'
Type errors in IDE
```

**Solutions:**
1. Rebuild TypeScript:
   ```bash
   pnpm build
   ```
2. Clear TypeScript cache:
   ```bash
   rm -rf packages/*/dist
   rm -rf packages/*/tsconfig.tsbuildinfo
   pnpm build
   ```
3. Reinstall dependencies:
   ```bash
   pnpm install --force
   ```

#### Issue: Jina API rate limit exceeded

**Symptoms:**
```
Error: Rate limit exceeded (1500 RPM)
```

**Solutions:**
1. **Development**: Use embedding cache (automatic with Redis)
2. **Testing**: Reduce test concurrency
3. **Production**: Upgrade Jina plan or implement self-hosted embeddings
4. Wait 60 seconds for rate limit reset

#### Issue: Docker permission denied (Linux)

**Symptoms:**
```
Got permission denied while trying to connect to the Docker daemon socket
```

**Solutions:**
1. Add user to docker group:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```
2. Or run with sudo (not recommended):
   ```bash
   sudo docker run ...
   ```
3. Restart terminal and retry

#### Issue: OpenRouter API errors (Stage 3-4)

**Symptoms:**
```
Error: OpenRouter API request failed
Invalid API key
Insufficient credits
```

**Solutions:**
1. Verify API key in `.env`:
   ```bash
   # Check OPENROUTER_API_KEY is set
   grep OPENROUTER_API_KEY packages/course-gen-platform/.env
   ```
2. Check API key validity at [OpenRouter Dashboard](https://openrouter.ai/keys)
3. Verify account has credits:
   - Check balance at [OpenRouter Usage](https://openrouter.ai/usage)
   - Free tier includes $5-10 credits on signup
   - Add payment method if credits exhausted
4. Check model availability:
   - Some models require explicit permission
   - Try fallback model (Gemini 2.5 Flash) if primary fails
5. Rate limit handling (automatic retry with exponential backoff in code)

---

## Next Steps

After successful setup, you can:

1. **Explore the API**:
   - Check health endpoint: `http://localhost:3000/health`
   - View tRPC endpoints: `http://localhost:3000/trpc`

2. **Test Document Processing**:
   ```bash
   cd packages/course-gen-platform
   pnpm run seed  # Creates test data
   ```

3. **Review Architecture**:
   - Read [README.md](../README.md) for project overview
   - Check [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md) for complete system architecture
   - Review Stage 4 specs: [specs/007-stage-4-analyze/](../specs/007-stage-4-analyze/) for multi-phase analysis

4. **Start Developing**:
   - See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines (if available)
   - Check current stage specs: [specs/](../specs/) (Stages 0-4 complete, Stage 5 next)

5. **Explore Documentation**:
   - [Docling Setup](./docling-setup.md) - Document processing
   - [Release Process](./release-process.md) - How to create releases
   - [Pricing Tiers](./PRICING-TIERS.md) - Subscription tier details
   - [RAG Chunking Strategy](./RAG-CHUNKING-STRATEGY.md) - Hierarchical chunking details
   - [ADR-001](./ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) - LangChain + LangGraph decision (Stage 4)

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check existing documentation in `docs/`
2. Review current stage specs in `specs/` for known issues and implementation details
3. Check [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md) for system overview
4. Check logs:
   ```bash
   # Server logs
   pnpm dev

   # Test logs
   pnpm test -- --reporter=verbose

   # Docker logs
   docker logs megacampus-redis
   ```

5. Create an issue with:
   - Error message (full stack trace)
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)

---

## Appendix: Complete Environment Variables Reference

Copy this template to `packages/course-gen-platform/.env`:

```bash
# ============================================
# Supabase Configuration
# ============================================
# Get these from: https://supabase.com/dashboard/project/<project-ref>/settings/api
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>

# ============================================
# Redis Configuration (BullMQ Job Queue)
# ============================================
# Local development (Docker):
REDIS_URL=redis://localhost:6379
# Production (Upstash/Redis Cloud):
# REDIS_URL=redis://:password@hostname:port

# ============================================
# Qdrant Configuration (Vector Database)
# ============================================
# Get these from: https://cloud.qdrant.io/
QDRANT_URL=https://<cluster-id>.qdrant.cloud
QDRANT_API_KEY=<your-qdrant-api-key>

# ============================================
# Jina AI Embeddings
# ============================================
# Get this from: https://jina.ai/api-keys
JINA_API_KEY=<your-jina-api-key>

# ============================================
# OpenRouter API (Stage 3-4: LLM Models)
# ============================================
# Get this from: https://openrouter.ai/keys
# Used for: Document summarization, multi-phase analysis
# Models: GPT OSS-20B, GPT OSS-120B, Gemini 2.5 Flash
OPENROUTER_API_KEY=<your-openrouter-api-key>

# ============================================
# OAuth Providers (Optional)
# ============================================
# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# ============================================
# Server Configuration
# ============================================
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# ============================================
# File Upload Configuration
# ============================================
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600  # 100MB in bytes

# ============================================
# Multi-tenancy Configuration
# ============================================
# Generate with: openssl rand -base64 32
JWT_SECRET=<your-jwt-secret-here>

# ============================================
# Docling MCP Server (Document Processing)
# ============================================
# Local development (if running Docling MCP separately)
DOCLING_MCP_URL=http://localhost:8000/mcp
DOCLING_MCP_TIMEOUT=300000  # 5 minutes
```

**Security Notes:**
- Never commit `.env` to version control
- Keep `SUPABASE_SERVICE_KEY` secret (server-side only)
- Keep `OPENROUTER_API_KEY` secret (server-side only, tracks usage and billing)
- Rotate API keys regularly in production
- Use different credentials for dev/staging/production
- Monitor OpenRouter usage dashboard to track LLM costs

---

**Document Version**: 1.1
**Last Updated**: 2025-11-04
**Maintained By**: MegaCampusAI Development Team
**Changes in v1.1**: Added OpenRouter API setup (Stage 3-4), updated test statistics (150+ tests), updated project status (56% complete)
