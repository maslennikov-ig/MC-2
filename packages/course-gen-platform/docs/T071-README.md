# T071: Qdrant Cloud Setup - Quick Start

## What You Need to Do

This task requires manual steps to provision a Qdrant Cloud instance. Follow the guide below.

## Quick Start (3 Steps)

### 1. Follow the Setup Guide
Read: `qdrant-setup.md` for detailed instructions

OR

### 2. Use the Quick Checklist
Read: `T071-MANUAL-STEPS.md` for a condensed checklist

### 3. Verify Your Setup
```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
pnpm verify:qdrant
```

## File Guide

| File | Purpose | When to Use |
|------|---------|-------------|
| `T071-MANUAL-STEPS.md` | Quick checklist | When you want fast setup steps |
| `qdrant-setup.md` | Comprehensive guide | When you need detailed explanations |
| `T071-COMPLETION-SUMMARY.md` | Technical summary | For architecture review |
| `T071-README.md` (this file) | Navigation | Starting point |

## Scripts Available

```bash
# Verify Qdrant connection
pnpm verify:qdrant

# Alternative (direct execution)
pnpm tsx scripts/verify-qdrant-connection.ts
```

## Time Required

- Account creation: 3 minutes
- Cluster provisioning: 5 minutes (mostly waiting)
- Configuration: 2 minutes
- Verification: 1 minute

**Total: 10-15 minutes**

## What Gets Created

1. Qdrant Cloud account
2. Free tier cluster (1GB storage)
3. API credentials (URL + Key)
4. Environment variables in `.env`

## Prerequisites

- Email address or GitHub/Google account
- Internet connection
- No credit card required (free tier)

## After Completion

You'll be ready for:
- T072: Create Qdrant client singleton
- T073: Create collection with HNSW index
- T074: Integrate Jina embeddings

## Need Help?

1. Check the troubleshooting section in `qdrant-setup.md`
2. Run verification script for detailed error messages
3. Check Qdrant status: https://status.qdrant.io/
4. Join Qdrant Discord: https://qdrant.to/discord

---

Start here: `T071-MANUAL-STEPS.md`
