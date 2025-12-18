# URGENT: Credential Rotation Guide

**Status**: CRITICAL - Immediate Action Required
**Generated**: 2025-10-20T09:52:00Z
**Security Incident**: Exposed production credentials in git history

---

## Executive Summary

Production credentials including Supabase service role keys, database passwords, API keys, and OAuth secrets were committed to git history and require immediate rotation. This guide provides step-by-step instructions to remediate the security incident.

**Affected Services**:
- Supabase Project: diqooqbuchsliypgwksu.supabase.co (course-gen-platform)
- Supabase Project: mmtpvtoifqpdcgiwwdvj.supabase.co (courseai-next)
- PostgreSQL Database (direct connection)
- Qdrant Vector Database
- Jina AI Embeddings API
- Telegram Bot (token: 7576300237:...)
- Google OAuth (personal account: maslennikov.ig@gmail.com)
- N8N Webhook

**Timeline**:
- Credentials committed: Multiple commits including f81e4f3, bf9bd65
- Detection: 2025-10-20T09:42:00Z
- Remediation started: 2025-10-20T09:45:00Z

---

## Phase 1: Immediate Credential Rotation (HIGH PRIORITY)

### Step 1: Supabase Service Role Keys

**Affected Projects**:
1. `diqooqbuchsliypgwksu` (course-gen-platform)
2. `mmtpvtoifqpdcgiwwdvj` (courseai-next)

**Actions**:
```bash
# For EACH Supabase project:
# 1. Go to: https://app.supabase.com/project/<project-id>/settings/api
# 2. Click "Generate new service role key"
# 3. Copy the new key
# 4. Update .env files immediately
# 5. Restart all services using this credential
```

**Files to Update**:
- `packages/course-gen-platform/.env` → `SUPABASE_SERVICE_ROLE_KEY`
- `courseai-next/.env.local` → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2: Database Password Rotation

**Exposed Password**: `ngjjYAPo3x9QHKpT` (diqooqbuchsliypgwksu project)

**Actions**:
```bash
# 1. Go to: https://app.supabase.com/project/diqooqbuchsliypgwksu/settings/database
# 2. Click "Reset database password"
# 3. Copy new password
# 4. Update DATABASE_URL in .env:
#    postgresql://postgres.diqooqbuchsliypgwksu:<NEW_PASSWORD>@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

**Files to Update**:
- `packages/course-gen-platform/.env` → `DATABASE_URL`

### Step 3: Telegram Bot Token Rotation

**Exposed Token**: `7576300237:AAGkOl5zwi1-kX8_246ONa53CBI12XKTY_g`

**Actions**:
```bash
# 1. Open Telegram and message @BotFather
# 2. Send command: /token
# 3. Select your bot from the list
# 4. Confirm revocation of old token
# 5. Get new token from BotFather
# 6. Update .env.local
```

**Files to Update**:
- `courseai-next/.env.local` → `TELEGRAM_BOT_TOKEN`

### Step 4: Google OAuth Refresh Token Revocation

**Exposed Email**: `maslennikov.ig@gmail.com`
**Exposed Refresh Token**: `1//09-gaNU1OYFTpCgYIARAAGAkSNwF...`

**Actions**:
```bash
# 1. Go to: https://myaccount.google.com/permissions
# 2. Find your CourseAI application
# 3. Click "Remove Access"
# 4. Re-authorize the application to get new refresh token
# 5. Update .env.local with new refresh token
```

**Files to Update**:
- `courseai-next/.env.local` → `GOOGLE_OAUTH_REFRESH_TOKEN`
- `courseai-next/.env.local` → `GOOGLE_OAUTH_CLIENT_SECRET` (if compromised)

### Step 5: API Keys Rotation

**Qdrant API Key**:
```bash
# 1. Log in to Qdrant Cloud: https://cloud.qdrant.io/
# 2. Navigate to your cluster settings
# 3. Generate new API key
# 4. Update .env
```

**Jina AI API Key**:
```bash
# 1. Log in to Jina AI: https://jina.ai/
# 2. Navigate to API Keys section
# 3. Revoke old key: jina_d7901bb462b54d9a84e4803a47e97f790...
# 4. Generate new API key
# 5. Update .env
```

**Files to Update**:
- `packages/course-gen-platform/.env` → `QDRANT_API_KEY`
- `packages/course-gen-platform/.env` → `JINA_API_KEY`

### Step 6: Secrets Regeneration

**JWT Secret**:
```bash
# Generate new JWT secret
openssl rand -base64 32
# Update in .env
```

**NextAuth Secret**:
```bash
# Generate new NextAuth secret
openssl rand -base64 32
# Update in .env.local
```

**N8N Webhook Secret**:
```bash
# Generate new webhook secret
openssl rand -hex 32
# Update in .env.local AND n8n workflow configuration
```

**Supabase JWT Secret**:
```bash
# This is your project's JWT secret from Supabase
# Get from: https://app.supabase.com/project/<project-id>/settings/api
# Under "JWT Settings" section
# Copy and update in .env.local
```

**Files to Update**:
- `packages/course-gen-platform/.env` → `JWT_SECRET`
- `courseai-next/.env.local` → `NEXTAUTH_SECRET`
- `courseai-next/.env.local` → `N8N_WEBHOOK_SECRET`
- `courseai-next/.env.local` → `SUPABASE_JWT_SECRET`

---

## Phase 2: Remove Credentials from Git History (CRITICAL)

### WARNING: This operation rewrites git history and requires force push

**Prerequisites**:
1. Ensure all team members have committed and pushed their work
2. Coordinate with team before executing
3. Create complete backup first
4. Notify team that force push is coming

### Execution Steps

```bash
# 1. Create backup bundle (IMPORTANT - Keep this safe!)
cd /home/me/code/megacampus2
git bundle create ../megacampus2-backup-$(date +%Y%m%d-%H%M%S).bundle --all
echo "Backup created: ../megacampus2-backup-$(date +%Y%m%d-%H%M%S).bundle"

# 2. Verify backup
git bundle verify ../megacampus2-backup-*.bundle

# 3. Remove .env files from git history using git filter-repo (RECOMMENDED)
# Install git-filter-repo if not installed:
# pip install git-filter-repo

git filter-repo --path packages/course-gen-platform/.env --invert-paths --force
git filter-repo --path courseai-next/.env.local --invert-paths --force

# Alternative using git filter-branch (if filter-repo unavailable):
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch packages/course-gen-platform/.env courseai-next/.env.local" \
  --prune-empty --tag-name-filter cat -- --all

# 4. Clean up repository
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Verify .env files are no longer in history
git log --all --full-history --oneline -- packages/course-gen-platform/.env
git log --all --full-history --oneline -- courseai-next/.env.local
# Should return empty

# 6. Force push to remote (COORDINATE WITH TEAM FIRST!)
git push origin --force --all
git push origin --force --tags

# 7. Notify team members to re-clone or reset their local repositories
# Team members should run:
# git fetch origin
# git reset --hard origin/main  # or their branch name
```

### Team Coordination Message

Send this to all team members BEFORE force pushing:

```
URGENT: Git History Rewrite - Action Required

We're removing exposed credentials from git history TODAY at [TIME].

BEFORE THE REWRITE:
1. Commit and push all your work
2. Note your current branch name
3. List any unpushed commits you want to keep

AFTER THE REWRITE (once you receive confirmation):
1. Fetch latest: git fetch origin
2. Reset your branch: git reset --hard origin/[your-branch]
3. If you had unpushed commits, cherry-pick them back

Questions? Contact [security team contact]
```

---

## Phase 3: Implement Secret Management Best Practices

### Step 1: Verify .gitignore

```bash
# Confirm .env patterns are in .gitignore
cat .gitignore | grep "\.env"

# Should show:
# .env
# .env.local
# .env.development
# .env.test
# .env.production
# *.env
# *.env.local
```

### Step 2: Set Up Pre-commit Hooks

Create `.git/hooks/pre-commit` (or use husky):

```bash
#!/bin/bash

# Check for .env files being committed
if git diff --cached --name-only | grep -E "\.env(\.|$)"; then
    echo "ERROR: Attempting to commit .env file!"
    echo "Files:"
    git diff --cached --name-only | grep -E "\.env(\.|$)"
    echo ""
    echo "Run: git reset HEAD <file>"
    exit 1
fi

# Check for common secret patterns
if git diff --cached | grep -E "(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|API_KEY|PRIVATE_KEY|SECRET)" | grep -v "your-.*-here"; then
    echo "WARNING: Possible secret detected in commit!"
    echo "Review carefully before proceeding."
    git diff --cached | grep -E "(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|API_KEY|PRIVATE_KEY|SECRET)"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

### Step 3: Document Secret Management Process

Create `docs/security/SECRET-MANAGEMENT.md`:

```markdown
# Secret Management Guidelines

## Rules

1. NEVER commit .env files (use .env.example instead)
2. NEVER hardcode credentials in code
3. Use environment variables for ALL secrets
4. Keep .env.example updated with latest required variables
5. Use placeholder values in .env.example (e.g., "your-api-key-here")

## Setting Up New Environment

1. Copy .env.example to .env
2. Fill in actual credentials
3. Verify .env is in .gitignore
4. Never commit .env to git

## Rotating Credentials

See: docs/security/CREDENTIAL-ROTATION-GUIDE.md

## Secret Storage Recommendations

- Local Development: .env files (git ignored)
- CI/CD: GitHub Secrets / GitLab CI Variables
- Production: Use secret management service:
  - AWS Secrets Manager
  - HashiCorp Vault
  - Doppler
  - Azure Key Vault

## Getting Credentials

### Supabase
- URL & Anon Key: https://app.supabase.com/project/<project-id>/settings/api
- Service Role Key: Same page (keep secret!)
- Database URL: https://app.supabase.com/project/<project-id>/settings/database

### API Keys
- Qdrant: https://cloud.qdrant.io/
- Jina AI: https://jina.ai/
- Telegram Bot: @BotFather on Telegram
- Google OAuth: https://console.cloud.google.com/apis/credentials
```

---

## Phase 4: Monitoring and Verification

### Step 1: Monitor for Suspicious Activity

**Supabase Logs**:
```bash
# Check for unauthorized access
# Go to: https://app.supabase.com/project/<project-id>/logs/explorer
# Query for:
# - Failed authentication attempts
# - Service role key usage from unexpected IPs
# - Unusual database queries
```

**Check GitHub Activity**:
```bash
# Who has accessed the repository?
# Go to: https://github.com/<org>/<repo>/insights/traffic
# Review:
# - Clones
# - Visitors
# - Popular content
```

### Step 2: Verify Rotation Complete

**Checklist**:
- [ ] All Supabase service role keys rotated
- [ ] Database password changed
- [ ] Telegram bot token rotated
- [ ] Google OAuth refresh token revoked
- [ ] Qdrant API key regenerated
- [ ] Jina AI API key regenerated
- [ ] JWT secrets regenerated
- [ ] NextAuth secret regenerated
- [ ] N8N webhook secret regenerated
- [ ] All .env files updated with new credentials
- [ ] All services restarted with new credentials
- [ ] Git history cleaned
- [ ] Force push completed
- [ ] Team notified and repositories updated
- [ ] Pre-commit hooks installed
- [ ] Documentation updated

### Step 3: Test Applications

```bash
# Test course-gen-platform
cd packages/course-gen-platform
pnpm install
pnpm type-check
pnpm build
pnpm test

# Test courseai-next
cd courseai-next
pnpm install
pnpm type-check
pnpm build

# Verify authentication works
# Verify database connectivity
# Verify API integrations (Qdrant, Jina)
# Verify Telegram bot notifications
# Verify n8n webhooks
```

---

## Phase 5: Post-Incident Actions

### Step 1: Security Audit

- [ ] Review all files in repository for other secrets
- [ ] Check git history for other sensitive data
- [ ] Audit team access to repository
- [ ] Review deployment logs for suspicious activity
- [ ] Check Supabase audit logs
- [ ] Review API usage logs (Qdrant, Jina)

### Step 2: Implement Continuous Monitoring

**Tools to Consider**:
- GitGuardian (secret detection in git)
- TruffleHog (git history scanning)
- GitHub Advanced Security (if available)
- Pre-commit hooks (already implemented above)

### Step 3: Team Training

- [ ] Document incident in security runbook
- [ ] Share lessons learned with team
- [ ] Review secret management best practices
- [ ] Update onboarding documentation
- [ ] Schedule quarterly security review

---

## Emergency Contacts

If you detect active exploitation or unauthorized access:

1. Immediately rotate ALL credentials
2. Contact Supabase support: https://supabase.com/support
3. Review audit logs for damage assessment
4. Consider reporting to security@github.com if repository was public

---

## Verification Checklist

After completing all phases:

### Credential Rotation
- [ ] Supabase service role keys (both projects)
- [ ] Database password
- [ ] Telegram bot token
- [ ] Google OAuth refresh token
- [ ] Qdrant API key
- [ ] Jina AI API key
- [ ] JWT secret
- [ ] NextAuth secret
- [ ] N8N webhook secret
- [ ] Supabase JWT secret

### Git History Cleanup
- [ ] Backup created and verified
- [ ] .env files removed from history
- [ ] Verification commands confirm removal
- [ ] Force push completed
- [ ] Team repositories updated

### Prevention Measures
- [ ] .gitignore verified
- [ ] Pre-commit hooks installed
- [ ] .env.example files updated
- [ ] Documentation created
- [ ] Team trained

### Testing
- [ ] Applications build successfully
- [ ] Authentication works
- [ ] Database connectivity verified
- [ ] API integrations tested
- [ ] No errors in production logs

### Monitoring
- [ ] Supabase logs reviewed
- [ ] No suspicious activity detected
- [ ] Continuous monitoring set up
- [ ] Alert system configured

---

## Appendix: Quick Reference

### Generate Secure Secrets
```bash
# Random hex (64 chars)
openssl rand -hex 32

# Random base64 (44 chars)
openssl rand -base64 32

# UUID
uuidgen
```

### Check if File is in Git History
```bash
git log --all --full-history --oneline -- <file-path>
```

### Verify .gitignore Working
```bash
git check-ignore -v <file-path>
```

### List Tracked Files Matching Pattern
```bash
git ls-files | grep "\.env"
```

---

**Document Status**: ACTIVE - Use immediately
**Last Updated**: 2025-10-20T09:52:00Z
**Next Review**: After incident resolution
