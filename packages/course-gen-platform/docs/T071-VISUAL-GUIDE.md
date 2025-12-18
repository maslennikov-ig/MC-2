# T071 Visual Setup Guide

## Setup Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    T071: Qdrant Cloud Setup                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Create Account                                         │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  https://cloud.qdrant.io/                             │     │
│  │  → Sign up with GitHub/Google/Email                   │     │
│  │  → Verify email (if required)                         │     │
│  └───────────────────────────────────────────────────────┘     │
│  Time: ~3 minutes                                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Create Cluster                                         │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  Name: megacampus-stage0                              │     │
│  │  Plan: Free Tier (1GB)                                │     │
│  │  Cloud: AWS                                           │     │
│  │  Region: us-east-1                                    │     │
│  │  → Click "Create Cluster"                             │     │
│  │  → Wait for provisioning...                           │     │
│  └───────────────────────────────────────────────────────┘     │
│  Time: ~5 minutes (mostly waiting)                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Get Credentials                                        │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  Dashboard → Your Cluster → API Keys                  │     │
│  │  ┌─────────────────────────────────────────────────┐  │     │
│  │  │  Cluster URL:                                   │  │     │
│  │  │  https://xxx-xxx-xxx.aws.cloud.qdrant.io       │  │     │
│  │  │                                                 │  │     │
│  │  │  API Key:                                       │  │     │
│  │  │  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx       │  │     │
│  │  └─────────────────────────────────────────────────┘  │     │
│  │  → Copy both values                                   │     │
│  └───────────────────────────────────────────────────────┘     │
│  Time: ~1 minute                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Update .env File                                       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  File: packages/course-gen-platform/.env              │     │
│  │  ┌─────────────────────────────────────────────────┐  │     │
│  │  │  # Qdrant Configuration                         │  │     │
│  │  │  QDRANT_URL=https://xxx-xxx.aws.cloud.qdrant.io │  │     │
│  │  │  QDRANT_API_KEY=xxxxxxxxxxxxxxxxxxxxxxx         │  │     │
│  │  └─────────────────────────────────────────────────┘  │     │
│  │  → Paste your actual values                           │     │
│  │  → Save file                                          │     │
│  └───────────────────────────────────────────────────────┘     │
│  Time: ~1 minute                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Verify Connection                                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  $ cd packages/course-gen-platform                    │     │
│  │  $ pnpm verify:qdrant                                 │     │
│  │  ┌─────────────────────────────────────────────────┐  │     │
│  │  │  ✓ QDRANT_URL: https://xxx.aws.cloud.qdrant.io │  │     │
│  │  │  ✓ QDRANT_API_KEY: *************************** │  │     │
│  │  │  ✓ Qdrant client initialized successfully      │  │     │
│  │  │  ✓ Successfully connected to Qdrant Cloud      │  │     │
│  │  │  ✓ Test collection created successfully        │  │     │
│  │  │  ✓ Cluster is ready for use                    │  │     │
│  │  └─────────────────────────────────────────────────┘  │     │
│  └───────────────────────────────────────────────────────┘     │
│  Time: ~30 seconds                                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ✓ COMPLETE                              │
│                   Ready for T072, T073, T074                    │
└─────────────────────────────────────────────────────────────────┘
```

## What Each Step Does

### Step 1: Account Creation
- Creates your Qdrant Cloud account
- No credit card required
- Uses OAuth (GitHub/Google) or email

### Step 2: Cluster Provisioning
- Allocates 1GB storage in cloud
- Configures HNSW indexing engine
- Sets up API endpoint
- Initializes security (API key generation)

### Step 3: Credential Retrieval
- Provides unique cluster URL
- Generates secure API key
- Enables programmatic access

### Step 4: Environment Configuration
- Stores credentials locally
- Keeps secrets out of version control
- Makes credentials available to application

### Step 5: Connection Verification
- Tests network connectivity
- Validates API key
- Confirms cluster is operational
- Runs basic CRUD operations

## Color Guide for Verification Output

When you run `pnpm verify:qdrant`, you'll see:

- ✓ (Green): Success - everything working
- ✗ (Red): Error - needs attention
- ⚠ (Yellow): Warning - non-critical issue
- ℹ (Blue): Information - FYI only

## Common Screenshots Locations

If you need visual help, check these sections in Qdrant Cloud dashboard:

1. **Dashboard Home**: List of all clusters
2. **Cluster Details**: Click cluster name → Overview tab
3. **API Keys**: Cluster → "API Keys" or "Access" tab
4. **Monitoring**: Cluster → "Metrics" tab (for later use)

## Troubleshooting Flow

```
Verification Failed?
        │
        ├─→ Error: "QDRANT_URL not configured"
        │   └─→ Check .env file line 14
        │       Is it the placeholder value?
        │       → Yes: Copy actual URL from dashboard
        │       → No: Check for typos
        │
        ├─→ Error: "Unauthorized" or "Invalid API Key"
        │   └─→ Check .env file line 15
        │       Is it the placeholder value?
        │       → Yes: Copy actual key from dashboard
        │       → No: Regenerate key in dashboard
        │
        ├─→ Error: "Connection timeout"
        │   └─→ Check cluster status in dashboard
        │       Is status "Running"?
        │       → No: Wait for provisioning
        │       → Yes: Check network/firewall
        │
        └─→ Other errors
            └─→ See docs/qdrant-setup.md
                Troubleshooting section
```

## File Locations Reference

```
/home/me/code/megacampus2/
└── packages/
    └── course-gen-platform/
        ├── .env                          ← Update this (lines 14-15)
        ├── package.json                  ← Contains verify:qdrant script
        ├── scripts/
        │   └── verify-qdrant-connection.ts  ← Verification script
        └── docs/
            ├── T071-README.md            ← Start here
            ├── T071-MANUAL-STEPS.md      ← Quick checklist
            ├── T071-VISUAL-GUIDE.md      ← This file
            ├── T071-COMPLETION-SUMMARY.md ← Technical details
            └── qdrant-setup.md           ← Comprehensive guide
```

## Quick Command Reference

```bash
# Navigate to project
cd /home/me/code/megacampus2/packages/course-gen-platform

# Verify connection (short form)
pnpm verify:qdrant

# Verify connection (long form)
pnpm tsx scripts/verify-qdrant-connection.ts

# Check environment variables
cat .env | grep QDRANT

# View verification script
cat scripts/verify-qdrant-connection.ts
```

## Success Criteria Checklist

After setup, you should have:

- [ ] Qdrant Cloud account exists
- [ ] Cluster status shows "Running" in dashboard
- [ ] QDRANT_URL in .env (starts with https://)
- [ ] QDRANT_API_KEY in .env (long string)
- [ ] `pnpm verify:qdrant` shows all green checkmarks
- [ ] No error messages in verification output

## Next Steps After Success

1. **T072**: Create Qdrant client singleton
   - File: `src/lib/qdrant.ts`
   - Purpose: Reusable connection

2. **T073**: Create collection with HNSW index
   - Collection: `course_documents`
   - Config: 768-dim vectors, Cosine distance

3. **T074**: Integrate Jina embeddings
   - API: Jina AI embeddings v2
   - Purpose: Convert text to vectors

## Time Investment

| Activity | Time | Can Skip? |
|----------|------|-----------|
| Account creation | 3 min | No |
| Cluster provisioning | 5 min | No (automated waiting) |
| Get credentials | 1 min | No |
| Update .env | 1 min | No |
| Run verification | 30 sec | Recommended |
| Read documentation | 5-10 min | Optional |

**Minimum time**: 10 minutes
**With documentation**: 15-20 minutes

---

**Quick Start**: Open `T071-MANUAL-STEPS.md` and follow the checklist!
