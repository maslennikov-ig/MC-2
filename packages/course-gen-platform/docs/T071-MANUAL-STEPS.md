# T071 Manual Setup Checklist

## Quick Reference for Qdrant Cloud Provisioning

### Steps to Complete

- [ ] **Step 1**: Go to https://cloud.qdrant.io/
- [ ] **Step 2**: Sign up using GitHub, Google, or Email
- [ ] **Step 3**: Create new cluster with these settings:
  - Name: `megacampus-stage0`
  - Plan: **Free Tier** (1GB)
  - Cloud: AWS (recommended)
  - Region: `us-east-1` or closest to you
- [ ] **Step 4**: Wait for cluster to provision (2-5 minutes)
- [ ] **Step 5**: Copy cluster credentials from dashboard:
  - Cluster URL (looks like: `https://xxx-xxx-xxx.aws.cloud.qdrant.io`)
  - API Key (long string of characters)
- [ ] **Step 6**: Update `.env` file at:
  ```
  /home/me/code/megacampus2/packages/course-gen-platform/.env
  ```
  Replace lines 14-15:
  ```bash
  QDRANT_URL=https://your-actual-cluster-url.aws.cloud.qdrant.io
  QDRANT_API_KEY=your-actual-api-key-here
  ```
- [ ] **Step 7**: Run verification script:
  ```bash
  cd /home/me/code/megacampus2/packages/course-gen-platform
  pnpm tsx scripts/verify-qdrant-connection.ts
  ```
- [ ] **Step 8**: Confirm all checks pass (green checkmarks)

### Expected Verification Output

```
✓ QDRANT_URL: https://your-cluster.aws.cloud.qdrant.io
✓ QDRANT_API_KEY: **************************************** (hidden)
✓ Qdrant client initialized successfully
✓ Successfully connected to Qdrant Cloud
✓ Test collection created successfully
✓ Cluster is ready for use
```

### Troubleshooting

If verification fails:
1. Check URL starts with `https://` (not `http://`)
2. Ensure no extra spaces in API key
3. Verify cluster status is "Running" in dashboard
4. See full guide: `docs/qdrant-setup.md`

### After Successful Setup

You're ready for:
- **T072**: Create Qdrant client singleton
- **T073**: Create collection with HNSW index
- **T074**: Integrate Jina embeddings

---

**Time Estimate**: 10-15 minutes (including account creation)
**Difficulty**: Easy
**Prerequisites**: None (just need an email or GitHub account)
