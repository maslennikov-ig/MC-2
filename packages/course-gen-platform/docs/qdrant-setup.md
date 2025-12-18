# Qdrant Cloud Setup Guide

## Task T071: Provision Qdrant Cloud Free Tier Instance

This guide walks you through setting up Qdrant Cloud for the MegaCampusAI RAG infrastructure.

## Overview

**Qdrant Cloud Free Tier Specifications:**
- Storage: 1GB
- Max vectors: ~50,000 (768 dimensions, 32-bit float)
- Query latency: <30ms (p95)
- Distance metrics: Cosine, Euclidean, Dot Product
- Multi-tenancy: Supported via payload filtering
- HNSW indexing: Fully supported

## Step-by-Step Setup

### 1. Create Qdrant Cloud Account

1. Navigate to https://cloud.qdrant.io/
2. Click "Sign Up" or "Get Started"
3. Choose your preferred authentication method:
   - GitHub (recommended for developers)
   - Google
   - Email/Password
4. Complete the account registration process
5. Verify your email if required

### 2. Create Free Tier Cluster

1. After logging in, you'll see the Qdrant Cloud dashboard
2. Click "Create Cluster" or "New Cluster"
3. Configure your cluster:
   - **Cluster Name**: `megacampus-stage0` (or your preferred name)
   - **Cloud Provider**: Choose based on your primary deployment region
     - AWS (recommended for US deployments)
     - Google Cloud Platform
     - Azure
   - **Region**: Select closest to your application servers
     - For US East: `us-east-1` (AWS) or equivalent
     - For US West: `us-west-2` (AWS) or equivalent
   - **Plan**: Select "Free Tier" (1GB storage, 1 node)
4. Review the configuration
5. Click "Create Cluster"
6. Wait for cluster provisioning (typically 2-5 minutes)

### 3. Retrieve Connection Credentials

Once your cluster is provisioned:

1. Click on your cluster name in the dashboard
2. Navigate to the "API Keys" or "Access" section
3. You'll see:
   - **Cluster URL**: Format: `https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.us-east-1.aws.cloud.qdrant.io`
   - **API Key**: A long string of characters (keep this secret!)

4. Copy both values

### 4. Update Environment Variables

1. Open your `.env` file at:
   ```
   /home/me/code/megacampus2/packages/course-gen-platform/.env
   ```

2. Update the Qdrant configuration section:
   ```bash
   # Qdrant Configuration
   QDRANT_URL=https://your-actual-cluster-url.aws.cloud.qdrant.io
   QDRANT_API_KEY=your-actual-api-key-here
   ```

3. Replace the placeholder values with your actual credentials
4. Save the file

**Security Note:** Never commit your `.env` file to version control. Ensure it's listed in `.gitignore`.

### 5. Verify Connection

Run the verification script to ensure everything is configured correctly:

```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
pnpm tsx scripts/verify-qdrant-connection.ts
```

Expected output:
```
Qdrant Cloud Connection Verification

1. Environment Variables Check
────────────────────────────────────────────────────────────
✓ QDRANT_URL: https://your-cluster.aws.cloud.qdrant.io
✓ QDRANT_API_KEY: **************************************** (hidden)

2. Initializing Qdrant Client
────────────────────────────────────────────────────────────
✓ Qdrant client initialized successfully

3. Testing Connection
────────────────────────────────────────────────────────────
✓ Successfully connected to Qdrant Cloud
ℹ Found 0 collection(s)

4. Advanced Connection Test
────────────────────────────────────────────────────────────
ℹ Creating temporary test collection...
✓ Test collection created successfully
ℹ Collection status: green
ℹ Vector size: 768
ℹ Distance metric: Cosine
ℹ Cleaning up test collection...
✓ Test collection deleted successfully

5. Cluster Capabilities Summary
────────────────────────────────────────────────────────────
✓ Cluster is ready for use
```

## Troubleshooting

### Connection Failed

**Issue**: Cannot connect to Qdrant Cloud

**Solutions**:
1. Verify QDRANT_URL format (should start with `https://`)
2. Check API key for typos or extra spaces
3. Ensure cluster status is "Running" in the dashboard
4. Check your network connection and firewall settings
5. Verify API key has not been revoked

### Invalid API Key

**Issue**: "Unauthorized" or "Invalid API Key" error

**Solutions**:
1. Generate a new API key from the Qdrant Cloud dashboard
2. Ensure no extra spaces or characters in the `.env` file
3. Restart your application after updating `.env`

### Timeout Errors

**Issue**: Connection times out

**Solutions**:
1. Check if your cluster region is far from your location
2. Verify cluster is in "Running" state (not "Starting" or "Stopped")
3. Check for network issues or corporate firewall blocking the connection
4. Try increasing timeout in client configuration

## Next Steps

After successful verification:

1. **T072**: Create Qdrant client singleton
   - Location: `packages/course-gen-platform/src/lib/qdrant.ts`
   - Purpose: Reusable connection management

2. **T073**: Create Qdrant collection with HNSW index
   - Collection name: `course_documents`
   - Vector size: 768 (Jina v2 base)
   - Distance metric: Cosine
   - HNSW parameters: m=16, ef_construct=100

3. **T074**: Implement Jina embeddings integration
   - API endpoint: `https://api.jina.ai/v1/embeddings`
   - Model: `jina-embeddings-v2-base-en`
   - Batch size: 100 texts per request

## Architecture Notes

### Stage 0 Capacity Planning

With 1GB storage and 768-dimensional vectors:
- Max vectors: ~50,000
- Recommended allocation:
  - 3-5 test courses
  - ~10,000 vectors per course
  - Average document: 512 tokens (1 vector per chunk)
  - Total indexed content: ~25-50K vectors

### Vector Dimensions

Using Jina AI embeddings v2 base:
- Dimensions: 768
- Precision: 32-bit float
- Storage per vector: ~3KB (including payload metadata)

### Distance Metrics

**Cosine Similarity** (recommended for semantic search):
- Best for text embeddings
- Normalizes vector length
- Range: [-1, 1] (1 = identical, -1 = opposite)

### HNSW Index Parameters

**m=16** (number of bi-directional links):
- Higher = better recall, more memory
- Sweet spot for 768-dim vectors

**ef_construct=100** (construction time search depth):
- Higher = better index quality, slower indexing
- Recommended for production use

## References

- [Qdrant Cloud Documentation](https://qdrant.tech/documentation/cloud/)
- [Qdrant JavaScript Client](https://github.com/qdrant/qdrant-js)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [Jina AI Embeddings](https://jina.ai/embeddings/)

## Support

If you encounter issues:
1. Check the Qdrant Cloud dashboard for cluster status
2. Review the verification script output for detailed error messages
3. Consult the Qdrant Discord community: https://qdrant.to/discord
4. Check Qdrant status page: https://status.qdrant.io/

---

**Task Completed**: T071 - Provision Qdrant Cloud free tier instance
**Next Task**: T072 - Create Qdrant client singleton
