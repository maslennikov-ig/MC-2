# Jina-v3 Migration Guide: Hosted to Self-Hosted

**Version**: 1.0
**Last Updated**: 2025-10-15
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Trigger Conditions](#trigger-conditions)
3. [Prerequisites](#prerequisites)
4. [Self-Hosted Setup](#self-hosted-setup)
5. [API Compatibility](#api-compatibility)
6. [Cost Analysis](#cost-analysis)
7. [Migration Strategy](#migration-strategy)
8. [Testing & Validation](#testing--validation)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)
11. [Validation Checklist](#validation-checklist)

---

## Overview

This guide provides a comprehensive migration path from the hosted Jina AI API to a self-hosted Jina-embeddings-v3 deployment. Self-hosting offers cost savings at scale, data sovereignty, and predictable performance for production workloads.

### Why Migrate to Self-Hosted?

**Benefits**:
- **Cost Savings**: 90%+ savings when processing >20GB indexed data
- **Data Sovereignty**: Keep sensitive data within your infrastructure
- **Predictable Performance**: No API rate limits or quotas
- **Lower Latency**: Eliminate network roundtrips to external APIs
- **Unlimited Throughput**: Scale horizontally as needed

**When NOT to Migrate**:
- Data volume <20GB or <100K queries/month (hosted is more cost-effective)
- Team lacks infrastructure expertise (hosted offers managed service benefits)
- Rapid prototyping phase (hosted provides faster iteration)
- Compliance doesn't require data residency

---

## Trigger Conditions

### Quantitative Migration Triggers

Migrate to self-hosted when **any** of the following conditions are met:

#### 1. Data Volume Threshold
```
Indexed Data > 20GB
```
**Calculation**:
- Documents: 1,000 courses × 200 pages/course = 200,000 pages
- Tokens per page: ~500 tokens (average)
- Total tokens: 200,000 × 500 = 100M tokens
- Storage: 100M tokens × 4 bytes/token ≈ 400MB metadata + 20GB vectors
- **Trigger**: When total indexed data exceeds 20GB

#### 2. Query Volume Threshold
```
Monthly Queries > 100,000
```
**Calculation**:
- Active users: 10,000 students
- Avg queries per user per day: 3 queries
- Monthly queries: 10,000 × 3 × 30 = 900,000 queries/month
- **Trigger**: When monthly queries exceed 100K

#### 3. Cost Threshold
```
Monthly API Cost > $150
```
**Calculation**:
- Jina API pricing: $0.02 per 1M tokens
- Indexing cost: 100M tokens × $0.02/1M = $2.00 one-time
- Query cost: 1M queries × 10 tokens/query × $0.02/1M = $0.20/month (queries)
- Total monthly (with re-indexing): ~$50-150/month
- **Trigger**: When monthly cost exceeds $150

#### 4. Latency Requirements
```
P95 Latency > 500ms
```
**Current Performance**:
- Hosted API: ~500ms per embedding (includes network + API processing)
- Self-hosted: ~50ms per embedding (local GPU inference)
- **Trigger**: When P95 latency exceeds 500ms or 10× improvement needed

#### 5. Throughput Requirements
```
Required Throughput > 1,500 embeddings/minute
```
**Current Limits**:
- Hosted API: 1,500 RPM (rate limited)
- Self-hosted: 10,000+ embeddings/minute (GPU dependent)
- **Trigger**: When batch processing requires >1,500 embeddings/minute

### Qualitative Triggers

- **Data Sovereignty**: Compliance requires data residency (GDPR, SOC2, HIPAA)
- **SLA Requirements**: Need 99.9%+ uptime guarantees
- **Customization**: Require model fine-tuning or custom configurations
- **Predictable Costs**: Budget constraints require fixed infrastructure costs

---

## Prerequisites

### Infrastructure Requirements

#### Hardware (Minimum)
- **CPU**: 4 vCPU (8 vCPU recommended)
- **RAM**: 8GB (16GB recommended for production)
- **Storage**: 50GB SSD (includes model weights + OS)
- **GPU**: Optional but recommended (NVIDIA T4 or better)
  - Without GPU: ~200ms/embedding on CPU
  - With GPU: ~50ms/embedding on GPU

#### Hardware (Recommended for Production)
- **Instance Type**: AWS `g4dn.xlarge` or equivalent
  - 4 vCPU, 16GB RAM, 1× NVIDIA T4 GPU
  - Storage: 125GB NVMe SSD
  - Network: Up to 25 Gbps
- **Monthly Cost**: ~$390/month (us-east-1, on-demand)
- **Reserved Instance**: ~$250/month (1-year commitment, 36% savings)

#### Software Requirements
- **Docker**: 20.10+ with Docker Compose
- **Operating System**: Ubuntu 22.04 LTS or equivalent Linux
- **NVIDIA Drivers**: 525+ (if using GPU)
- **NVIDIA Container Toolkit**: For GPU access in containers

### Network Requirements
- **Inbound**: Port 8080 (API endpoint)
- **Outbound**: HTTPS (443) for model download
- **Bandwidth**: 1 Gbps minimum

### Team Skills
- Docker and container orchestration
- Basic Linux system administration
- Load balancer configuration (nginx, HAProxy, or cloud LB)
- Monitoring and alerting setup (Prometheus, Grafana)

---

## Self-Hosted Setup

### Step 1: Install Docker and Dependencies

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify installation
docker --version
# Expected output: Docker version 24.0+
```

### Step 2: Install NVIDIA Container Toolkit (GPU Only)

```bash
# Add NVIDIA package repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install NVIDIA Container Toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
# Expected output: GPU information table
```

### Step 3: Deploy Jina-v3 with Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  jina-embeddings:
    image: jinaai/jina-embeddings-v3:latest
    container_name: jina-embeddings-v3
    ports:
      - "8080:8080"
    environment:
      # Model configuration
      - MODEL_NAME=jinaai/jina-embeddings-v3
      - MAX_BATCH_SIZE=100
      - MAX_SEQUENCE_LENGTH=8192

      # Performance tuning
      - NUM_WORKERS=4
      - WORKER_TIMEOUT=300

      # GPU configuration (comment out for CPU-only)
      - CUDA_VISIBLE_DEVICES=0

    # GPU support (comment out for CPU-only)
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

    # Resource limits
    mem_limit: 8g
    cpus: '4'

    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

    # Restart policy
    restart: unless-stopped

    # Logging
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

  # Optional: Nginx reverse proxy with load balancing
  nginx:
    image: nginx:alpine
    container_name: jina-nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - jina-embeddings
    restart: unless-stopped
```

Create `nginx.conf` (for load balancing multiple instances):

```nginx
events {
    worker_connections 1024;
}

http {
    upstream jina_backend {
        least_conn;
        server jina-embeddings:8080 max_fails=3 fail_timeout=30s;
        # Add more instances for horizontal scaling:
        # server jina-embeddings-2:8080 max_fails=3 fail_timeout=30s;
        # server jina-embeddings-3:8080 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;

        location /v1/embeddings {
            proxy_pass http://jina_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # Timeouts
            proxy_connect_timeout 10s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;

            # Request size limits
            client_max_body_size 10M;
        }

        location /health {
            proxy_pass http://jina_backend/health;
            access_log off;
        }
    }
}
```

### Step 4: Start the Service

```bash
# Start Jina-v3 service
docker-compose up -d

# Check container status
docker-compose ps
# Expected: jina-embeddings-v3 (healthy)

# View logs
docker-compose logs -f jina-embeddings

# Wait for model download and initialization (first run takes 2-5 minutes)
# Expected log: "Model loaded successfully"
```

### Step 5: Verify Deployment

```bash
# Health check
curl http://localhost:8080/health
# Expected: {"status": "healthy"}

# Test embedding generation
curl -X POST http://localhost:8080/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jina-embeddings-v3",
    "input": "Hello, world!",
    "task": "retrieval.query",
    "dimensions": 768,
    "normalized": false,
    "truncate": true
  }'

# Expected: JSON response with 768-dimensional embedding
```

---

## API Compatibility

### Request Format Compatibility

The self-hosted Jina-v3 API is **100% compatible** with the hosted API. No code changes required.

#### Example: Current Code (Hosted API)
```typescript
// src/shared/embeddings/jina-client.ts
async function makeJinaRequest(payload: JinaEmbeddingRequest): Promise<JinaEmbeddingResponse> {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  // ... error handling
}
```

#### Example: Self-Hosted (Drop-in Replacement)
```typescript
// Configuration change only - no code changes needed
async function makeJinaRequest(payload: JinaEmbeddingRequest): Promise<JinaEmbeddingResponse> {
  // Use environment variable to switch endpoints
  const endpoint = process.env.JINA_ENDPOINT || 'https://api.jina.ai/v1/embeddings';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      // Self-hosted doesn't require API key (secured by network/firewall)
      ...(process.env.JINA_API_KEY && {
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  // ... existing error handling works as-is
}
```

### Environment Variable Changes

```bash
# Before (Hosted)
JINA_API_KEY=jina_your_api_key_here

# After (Self-Hosted)
JINA_ENDPOINT=http://your-server-ip:8080/v1/embeddings
# JINA_API_KEY not required (or set to empty if code checks for it)
```

### Response Format

Both hosted and self-hosted return identical response structures:

```json
{
  "data": [
    {
      "embedding": [0.123, -0.456, ...],
      "index": 0
    }
  ],
  "usage": {
    "total_tokens": 42
  },
  "model": "jina-embeddings-v3"
}
```

### Zero-Downtime Migration Strategy

#### Option 1: Gradual Traffic Shift (Recommended)

```typescript
/**
 * Hybrid client that routes requests between hosted and self-hosted
 * Gradually shift traffic percentage to self-hosted
 */
class HybridJinaClient {
  private hostedEndpoint = 'https://api.jina.ai/v1/embeddings';
  private selfHostedEndpoint = process.env.JINA_SELF_HOSTED_ENDPOINT;
  private selfHostedTrafficPercentage = Number(process.env.SELF_HOSTED_TRAFFIC_PERCENT || 0);

  async makeRequest(payload: JinaEmbeddingRequest): Promise<JinaEmbeddingResponse> {
    // Route based on traffic percentage
    const useSelfHosted = Math.random() * 100 < this.selfHostedTrafficPercentage;

    const endpoint = useSelfHosted && this.selfHostedEndpoint
      ? this.selfHostedEndpoint
      : this.hostedEndpoint;

    const headers = endpoint === this.hostedEndpoint
      ? { 'Authorization': `Bearer ${process.env.JINA_API_KEY}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };

    try {
      return await this.fetchWithRetry(endpoint, payload, headers);
    } catch (error) {
      // Fallback to hosted if self-hosted fails
      if (useSelfHosted && this.selfHostedEndpoint) {
        console.error('Self-hosted failed, falling back to hosted API', error);
        return await this.fetchWithRetry(this.hostedEndpoint, payload, {
          'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
          'Content-Type': 'application/json',
        });
      }
      throw error;
    }
  }

  private async fetchWithRetry(
    endpoint: string,
    payload: JinaEmbeddingRequest,
    headers: Record<string, string>
  ): Promise<JinaEmbeddingResponse> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}
```

**Migration Timeline**:
- **Week 1**: Deploy self-hosted, set `SELF_HOSTED_TRAFFIC_PERCENT=10` (10% traffic)
- **Week 2**: Monitor metrics, increase to 25%
- **Week 3**: Increase to 50%
- **Week 4**: Increase to 75%
- **Week 5**: Increase to 100%, decommission hosted API

#### Option 2: Feature Flag Migration

```typescript
/**
 * Use feature flags for targeted rollout
 */
const usesSelfHosted = await featureFlags.isEnabled('self-hosted-embeddings', {
  organizationId: req.organizationId,
  rolloutPercentage: 25, // Gradual rollout
});

const endpoint = usesSelfHosted
  ? process.env.JINA_SELF_HOSTED_ENDPOINT
  : 'https://api.jina.ai/v1/embeddings';
```

---

## Cost Analysis

### Hosted API Costs (Current)

#### Jina AI API Pricing
- **Embeddings**: $0.02 per 1M tokens

#### Example Workload
- **Indexing**: 100M tokens (one-time)
  - Cost: 100M × $0.02/1M = **$2.00 one-time**

- **Queries**: 1M queries/month × 10 tokens/query = 10M tokens/month
  - Cost: 10M × $0.02/1M = **$0.20/month**

- **Re-indexing**: 10% churn per month = 10M tokens/month
  - Cost: 10M × $0.02/1M = **$0.20/month**

**Total Monthly Cost (Steady State)**: ~$0.40/month (queries + re-indexing)

**Breakeven Point**: When workload reaches ~20GB or 100K+ queries/month

### Self-Hosted Costs

#### Infrastructure Costs (AWS us-east-1)

**Option 1: CPU-Only (Development/Testing)**
- **Instance**: `c6i.2xlarge` (8 vCPU, 16GB RAM)
- **Cost**: ~$250/month (on-demand)
- **Performance**: ~200ms per embedding
- **Throughput**: ~300 embeddings/minute

**Option 2: GPU (Production - Recommended)**
- **Instance**: `g4dn.xlarge` (4 vCPU, 16GB RAM, 1× NVIDIA T4)
- **Cost**: ~$390/month (on-demand)
- **Reserved Instance**: ~$250/month (1-year commitment)
- **Spot Instance**: ~$120/month (savings with interruptions)
- **Performance**: ~50ms per embedding
- **Throughput**: ~10,000 embeddings/minute

#### Storage Costs
- **EBS**: 125GB gp3 SSD = ~$10/month
- **Snapshots**: ~$5/month (automated backups)

#### Network Costs
- **Data Transfer**: $0.09/GB (outbound)
- **Estimated**: ~$10/month (10GB outbound for API responses)

#### Total Monthly Cost (Production)
- **On-Demand**: $390 (instance) + $10 (storage) + $10 (network) = **$410/month**
- **Reserved (1-year)**: $250 + $10 + $10 = **$270/month**
- **Spot**: $120 + $10 + $10 = **$140/month** (with interruption risk)

### Cost Comparison Table

| Workload Size | Hosted API | Self-Hosted (Reserved) | Savings |
|---------------|------------|------------------------|---------|
| 1M tokens/month | $0.40 | $270 | -$269.60 (❌ Not cost-effective) |
| 10M tokens/month | $4.00 | $270 | -$266 (❌ Not cost-effective) |
| 50M tokens/month | $20.00 | $270 | -$250 (❌ Not cost-effective) |
| 100M tokens/month | $40.00 | $270 | -$230 (❌ Not cost-effective) |
| 500M tokens/month | $200.00 | $270 | -$70 (⚠️ Marginal) |
| 1B tokens/month | $400.00 | $270 | **+$130 (✅ Cost-effective)** |
| 5B tokens/month | $2,000.00 | $270 | **+$1,730 (✅ Highly cost-effective)** |
| 10B tokens/month | $4,000.00 | $270 | **+$3,730 (✅ 93% savings)** |

### Break-Even Analysis

**Break-Even Point**: When monthly token usage exceeds **13.5M tokens/month**

```
Hosted API Cost = Self-Hosted Cost
Usage × $0.02/1M = $270
Usage = 13,500M tokens = 13.5B tokens/month
```

**For Our Workload**:
- Current: 100M tokens/month → Hosted is cheaper ($40 vs $270)
- Growth target: 1B tokens/month → Self-hosted saves $130/month
- Scale target: 10B tokens/month → Self-hosted saves $3,730/month (93%)

### Hidden Costs to Consider

#### Self-Hosted Additional Costs
- **Engineering Time**: Setup + maintenance (~20 hours/month) = $2,000-$4,000/month
- **Monitoring Tools**: Datadog/New Relic = $50-200/month
- **Load Balancer**: ALB = $25/month + data processing
- **SSL Certificate**: Let's Encrypt (free) or ACM (free for AWS)

#### Hosted API Hidden Costs
- **Vendor Lock-in**: Switching costs if Jina raises prices
- **Rate Limits**: Unpredictable performance during traffic spikes
- **Data Transfer**: Costs for sending data to external API

### Recommendation

- **Stay Hosted If**: Usage <500M tokens/month AND team lacks infrastructure expertise
- **Migrate to Self-Hosted If**: Usage >1B tokens/month OR data sovereignty required
- **Hybrid Approach**: Use hosted for spiky workloads, self-hosted for baseline

---

## Migration Strategy

### Phase 1: Preparation (Week 1)

#### 1.1 Infrastructure Setup
- [ ] Provision AWS `g4dn.xlarge` instance (or equivalent)
- [ ] Install Docker and NVIDIA Container Toolkit
- [ ] Configure security groups (inbound: 8080, outbound: 443)
- [ ] Set up load balancer (ALB or nginx)
- [ ] Configure SSL certificate (Let's Encrypt or ACM)

#### 1.2 Deployment
- [ ] Deploy Jina-v3 container with Docker Compose
- [ ] Verify health check endpoint
- [ ] Run load test (see Testing & Validation section)
- [ ] Set up monitoring (CloudWatch, Prometheus, or Datadog)

#### 1.3 Code Preparation
- [ ] Add `JINA_ENDPOINT` environment variable support
- [ ] Implement hybrid client with traffic percentage routing
- [ ] Add fallback logic (self-hosted → hosted on failure)
- [ ] Deploy code changes to staging

### Phase 2: Gradual Rollout (Weeks 2-5)

#### Week 2: 10% Traffic
- [ ] Set `SELF_HOSTED_TRAFFIC_PERCENT=10`
- [ ] Monitor metrics: latency, error rate, throughput
- [ ] Compare embedding consistency (cosine similarity >0.99)
- [ ] Verify no regressions in RAG search quality

#### Week 3: 25% Traffic
- [ ] Increase to `SELF_HOSTED_TRAFFIC_PERCENT=25`
- [ ] Monitor cost metrics (AWS bill vs Jina API bill)
- [ ] Test peak load scenarios
- [ ] Verify multi-tenant isolation

#### Week 4: 50% Traffic
- [ ] Increase to `SELF_HOSTED_TRAFFIC_PERCENT=50`
- [ ] Conduct A/B test comparing hosted vs self-hosted search results
- [ ] Measure P95 latency improvements
- [ ] Test failover scenarios (self-hosted outage)

#### Week 5: 100% Traffic
- [ ] Increase to `SELF_HOSTED_TRAFFIC_PERCENT=100`
- [ ] Remove hosted API fallback after 1 week of stable operation
- [ ] Decommission Jina API key
- [ ] Update documentation

### Phase 3: Optimization (Week 6+)

#### 3.1 Horizontal Scaling
- [ ] Deploy 2-3 Jina-v3 instances behind load balancer
- [ ] Configure least-connections load balancing
- [ ] Test automatic failover between instances

#### 3.2 Performance Tuning
- [ ] Optimize batch size (test 50, 100, 200)
- [ ] Tune worker count based on CPU/GPU utilization
- [ ] Enable HTTP/2 for lower latency
- [ ] Consider Redis caching for frequently accessed embeddings

#### 3.3 Cost Optimization
- [ ] Convert to reserved instances (36% savings)
- [ ] Explore spot instances for non-critical workloads
- [ ] Right-size instance type based on actual usage
- [ ] Set up auto-scaling based on traffic patterns

### Rollback Plan

If issues arise during migration:

```bash
# Immediate rollback (within 5 minutes)
# Set traffic percentage to 0
export SELF_HOSTED_TRAFFIC_PERCENT=0

# Restart application to pick up new config
docker-compose restart

# Verify all traffic goes to hosted API
curl http://localhost:3000/api/health/embeddings
# Expected: {"provider": "hosted"}
```

**Rollback Triggers**:
- Error rate >5% for self-hosted requests
- P95 latency >500ms (worse than hosted)
- Embedding consistency <0.99 cosine similarity
- Data sovereignty violation detected

---

## Testing & Validation

### Pre-Migration Testing

#### 1. Embedding Consistency Test

```bash
# Test that self-hosted produces same embeddings as hosted
pnpm tsx scripts/test-embedding-consistency.ts
```

```typescript
// scripts/test-embedding-consistency.ts
import { generateEmbedding as generateHosted } from '../src/shared/embeddings/jina-client';

async function testEmbeddingConsistency() {
  const testTexts = [
    'Machine learning is a subset of artificial intelligence.',
    'Глубокое обучение использует нейронные сети.',
    'Natural language processing helps computers understand text.',
  ];

  for (const text of testTexts) {
    // Generate embedding from hosted API
    const hostedEmbedding = await generateHosted(text, 'retrieval.passage');

    // Generate embedding from self-hosted (temporarily change endpoint)
    process.env.JINA_ENDPOINT = 'http://your-server:8080/v1/embeddings';
    const selfHostedEmbedding = await generateHosted(text, 'retrieval.passage');

    // Calculate cosine similarity
    const similarity = cosineSimilarity(hostedEmbedding, selfHostedEmbedding);

    console.log(`Text: "${text.substring(0, 50)}..."`);
    console.log(`Similarity: ${similarity.toFixed(6)}`);

    // Embeddings should be nearly identical (>99.9% similar)
    if (similarity < 0.999) {
      throw new Error(`Embedding mismatch! Similarity: ${similarity}`);
    }
  }

  console.log('✅ All embeddings are consistent (>99.9% similarity)');
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
```

#### 2. Load Testing

```bash
# Install k6 load testing tool
sudo apt-get install k6

# Run load test
k6 run load-test.js
```

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 50 },  // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.05'],   // Error rate under 5%
  },
};

export default function () {
  const url = 'http://your-server:8080/v1/embeddings';
  const payload = JSON.stringify({
    model: 'jina-embeddings-v3',
    input: 'Test text for load testing',
    task: 'retrieval.query',
    dimensions: 768,
    normalized: false,
    truncate: true,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => JSON.parse(r.body).data.length > 0,
    'embedding has 768 dimensions': (r) => JSON.parse(r.body).data[0].embedding.length === 768,
  });

  sleep(1);
}
```

Expected results:
- **P95 Latency**: <100ms (GPU), <300ms (CPU)
- **Throughput**: >1,000 requests/minute (GPU), >300 req/min (CPU)
- **Error Rate**: <1%

#### 3. RAG Search Quality Test

```typescript
// Test that RAG search results are identical with self-hosted embeddings
async function testRAGSearchQuality() {
  const queries = [
    'What is machine learning?',
    'Explain neural networks',
    'How does backpropagation work?',
  ];

  for (const query of queries) {
    // Search with hosted embeddings
    const hostedResults = await searchWithHosted(query);

    // Search with self-hosted embeddings
    const selfHostedResults = await searchWithSelfHosted(query);

    // Compare top 10 results (order may vary slightly)
    const hostedIds = hostedResults.slice(0, 10).map(r => r.chunk_id);
    const selfHostedIds = selfHostedResults.slice(0, 10).map(r => r.chunk_id);

    const overlap = hostedIds.filter(id => selfHostedIds.includes(id)).length;
    const overlapPercentage = (overlap / 10) * 100;

    console.log(`Query: "${query}"`);
    console.log(`Top-10 overlap: ${overlapPercentage}%`);

    // Expect >80% overlap in top-10 results
    if (overlapPercentage < 80) {
      throw new Error(`Search quality degraded! Overlap: ${overlapPercentage}%`);
    }
  }

  console.log('✅ RAG search quality maintained (>80% overlap)');
}
```

### Post-Migration Validation

#### Daily Health Checks (First 2 Weeks)

```bash
# Check service health
curl http://your-server:8080/health

# Check error rate (from logs)
docker-compose logs jina-embeddings | grep ERROR | wc -l

# Check average latency (from CloudWatch or Prometheus)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=your-alb-name \
  --start-time 2025-10-15T00:00:00Z \
  --end-time 2025-10-15T23:59:59Z \
  --period 300 \
  --statistics Average
```

#### Weekly Cost Review (First 4 Weeks)

```bash
# Check AWS bill (instance + network + storage)
aws ce get-cost-and-usage \
  --time-period Start=2025-10-01,End=2025-10-31 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=SERVICE

# Compare to Jina API usage (check Jina dashboard)
# Expected: AWS bill ~$270/month, Jina bill ~$0
```

---

## Monitoring & Maintenance

### Monitoring Setup

#### 1. CloudWatch Metrics (AWS)

```bash
# CPU Utilization
aws cloudwatch put-metric-alarm \
  --alarm-name jina-high-cpu \
  --alarm-description "Jina CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold

# GPU Utilization
aws cloudwatch put-metric-alarm \
  --alarm-name jina-high-gpu \
  --alarm-description "Jina GPU > 90%" \
  --metric-name GPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 90 \
  --comparison-operator GreaterThanThreshold

# Memory Utilization
aws cloudwatch put-metric-alarm \
  --alarm-name jina-high-memory \
  --alarm-description "Jina Memory > 85%" \
  --metric-name MemoryUtilization \
  --namespace CWAgent \
  --statistic Average \
  --period 300 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold
```

#### 2. Application Metrics (Prometheus)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'jina-embeddings'
    static_configs:
      - targets: ['jina-embeddings:8080']
    metrics_path: '/metrics'
    scrape_interval: 30s

# Key metrics to track:
# - jina_requests_total (counter)
# - jina_request_duration_seconds (histogram)
# - jina_errors_total (counter)
# - jina_active_requests (gauge)
```

#### 3. Log Aggregation (CloudWatch Logs or ELK)

```bash
# Configure Docker logging to CloudWatch
docker run -d \
  --log-driver=awslogs \
  --log-opt awslogs-region=us-east-1 \
  --log-opt awslogs-group=/ecs/jina-embeddings \
  --log-opt awslogs-stream=jina-v3 \
  jinaai/jina-embeddings-v3:latest
```

### Alerting Rules

#### Critical Alerts (PagerDuty / Slack)
- Service down (health check fails 3 times)
- Error rate >10% for 5 minutes
- P95 latency >1000ms for 5 minutes
- GPU utilization >95% for 10 minutes
- Memory utilization >95% for 5 minutes

#### Warning Alerts (Email)
- CPU utilization >80% for 15 minutes
- Disk usage >80%
- Request rate drops by >50% suddenly
- Average latency >200ms for 10 minutes

### Maintenance Tasks

#### Daily
- [ ] Check service health endpoint
- [ ] Review error logs (any 5xx errors?)
- [ ] Monitor latency metrics (P95 <100ms?)
- [ ] Verify throughput meets demand

#### Weekly
- [ ] Review cost metrics (AWS bill on track?)
- [ ] Analyze slow queries (any >500ms?)
- [ ] Check disk space (delete old logs if needed)
- [ ] Review security logs (unauthorized access attempts?)

#### Monthly
- [ ] Update Docker image to latest patch version
- [ ] Rotate logs and backups
- [ ] Review scaling needs (add more instances?)
- [ ] Conduct disaster recovery drill
- [ ] Review and optimize instance type

#### Quarterly
- [ ] Major version updates (test in staging first)
- [ ] Security audit and penetration testing
- [ ] Cost optimization review (reserved instances, spot, right-sizing)
- [ ] Performance benchmarking (compare to previous quarter)

### Disaster Recovery

#### Backup Strategy
- **Docker Image**: Store custom images in ECR or Docker Hub
- **Configuration**: Version control `docker-compose.yml` in Git
- **Model Weights**: Cached in EBS volume (auto-downloaded on first run)

#### Recovery Procedures

```bash
# Scenario 1: Service crash
docker-compose restart jina-embeddings

# Scenario 2: Instance failure
# 1. Launch new instance from AMI snapshot
# 2. Deploy Docker Compose
docker-compose up -d

# 3. Update load balancer target
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --targets Id=new-instance-id

# Scenario 3: Data corruption
# 1. Stop service
docker-compose down

# 2. Restore from EBS snapshot
aws ec2 create-volume \
  --snapshot-id snap-1234567890abcdef0 \
  --availability-zone us-east-1a

# 3. Attach volume and restart
docker-compose up -d
```

**RTO (Recovery Time Objective)**: 15 minutes
**RPO (Recovery Point Objective)**: 0 (stateless service, no data loss)

---

## Troubleshooting

### Common Issues

#### Issue 1: Container Fails to Start

**Symptoms**:
```bash
docker-compose ps
# Status: Restarting (loop)
```

**Diagnosis**:
```bash
docker-compose logs jina-embeddings
# Expected error: OOM (Out of Memory) or model download failure
```

**Solutions**:
```bash
# Check memory allocation
free -h

# Increase Docker memory limit in docker-compose.yml
mem_limit: 16g  # Increase from 8g

# Check disk space for model download
df -h
# Jina-v3 model: ~2GB download

# Manually download model (if network issues)
docker pull jinaai/jina-embeddings-v3:latest
```

#### Issue 2: High Latency (>500ms)

**Symptoms**:
- P95 latency >500ms
- Slower than hosted API

**Diagnosis**:
```bash
# Check CPU/GPU utilization
docker stats jina-embeddings
# Expected: CPU <80%, GPU <90%

# Check request queue length
curl http://localhost:8080/metrics | grep active_requests
# Expected: <10
```

**Solutions**:
```bash
# Increase worker count in docker-compose.yml
environment:
  - NUM_WORKERS=8  # Increase from 4

# Reduce batch size (faster first response)
environment:
  - MAX_BATCH_SIZE=50  # Decrease from 100

# Scale horizontally (add more instances)
docker-compose scale jina-embeddings=3
```

#### Issue 3: Out of Memory (OOM)

**Symptoms**:
```bash
docker-compose logs jina-embeddings
# Error: Killed (OOM)
```

**Diagnosis**:
```bash
# Check memory usage
docker stats jina-embeddings
# If >8GB, increase allocation

# Check GPU memory (if using GPU)
nvidia-smi
# If GPU memory >15GB (T4 has 16GB), reduce batch size
```

**Solutions**:
```bash
# Increase memory limit
mem_limit: 16g

# Reduce batch size
MAX_BATCH_SIZE=50

# Reduce max sequence length
MAX_SEQUENCE_LENGTH=4096  # From 8192
```

#### Issue 4: GPU Not Detected

**Symptoms**:
```bash
docker-compose logs jina-embeddings
# Warning: GPU not found, using CPU
```

**Diagnosis**:
```bash
# Check NVIDIA drivers
nvidia-smi
# If fails, drivers not installed

# Check Docker GPU support
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
# If fails, NVIDIA Container Toolkit not installed
```

**Solutions**:
```bash
# Install NVIDIA drivers (see Step 2 in Self-Hosted Setup)
sudo ubuntu-drivers autoinstall
sudo reboot

# Install NVIDIA Container Toolkit
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

#### Issue 5: Embedding Dimensions Mismatch

**Symptoms**:
```
Error: Expected 768 dimensions, got 512
```

**Diagnosis**:
```bash
# Check model version
docker-compose logs jina-embeddings | grep "Model:"
# Expected: jina-embeddings-v3 (768D)
```

**Solutions**:
```bash
# Ensure correct model version in docker-compose.yml
environment:
  - MODEL_NAME=jinaai/jina-embeddings-v3  # Not v2 (512D)

# Pull latest image
docker-compose pull
docker-compose up -d
```

#### Issue 6: Network Connectivity Issues

**Symptoms**:
```bash
curl http://your-server:8080/health
# Connection refused
```

**Diagnosis**:
```bash
# Check if container is running
docker-compose ps
# Expected: Up

# Check if port is exposed
docker-compose port jina-embeddings 8080
# Expected: 0.0.0.0:8080

# Check security group (AWS)
aws ec2 describe-security-groups --group-ids sg-xxxxxx
# Expected: Inbound rule for port 8080
```

**Solutions**:
```bash
# Check firewall rules
sudo ufw status
# If port 8080 blocked:
sudo ufw allow 8080/tcp

# Check AWS security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxx \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0
```

### Debug Mode

Enable debug logging for troubleshooting:

```yaml
# docker-compose.yml
environment:
  - LOG_LEVEL=DEBUG
  - CUDA_LAUNCH_BLOCKING=1  # GPU debugging
```

```bash
# View debug logs
docker-compose logs -f jina-embeddings | grep DEBUG
```

### Performance Profiling

```bash
# CPU profiling
docker exec -it jina-embeddings python -m cProfile -o profile.stats app.py

# GPU profiling (NVIDIA Nsight)
docker exec -it jina-embeddings nsys profile python app.py
```

---

## Validation Checklist

Use this checklist to verify your migration is complete and successful:

### Pre-Migration Checklist

- [ ] **Infrastructure Provisioned**
  - [ ] AWS instance launched (`g4dn.xlarge` or equivalent)
  - [ ] Security groups configured (inbound 8080, outbound 443)
  - [ ] Docker and NVIDIA Container Toolkit installed
  - [ ] Load balancer configured (ALB or nginx)
  - [ ] SSL certificate obtained and configured

- [ ] **Service Deployed**
  - [ ] Jina-v3 container running and healthy
  - [ ] Health check endpoint responds (200 OK)
  - [ ] Model downloaded and initialized
  - [ ] Test embedding generated successfully
  - [ ] GPU detected (if using GPU instance)

- [ ] **Testing Complete**
  - [ ] Embedding consistency >99.9% (hosted vs self-hosted)
  - [ ] Load test passed (P95 <100ms, error rate <1%)
  - [ ] RAG search quality maintained (>80% top-10 overlap)
  - [ ] Horizontal scaling tested (multiple instances behind LB)

- [ ] **Monitoring Setup**
  - [ ] CloudWatch alarms configured (CPU, GPU, memory)
  - [ ] Application metrics exposed (Prometheus endpoint)
  - [ ] Log aggregation enabled (CloudWatch Logs or ELK)
  - [ ] Alerting configured (PagerDuty or Slack)

- [ ] **Code Changes Deployed**
  - [ ] `JINA_ENDPOINT` environment variable support added
  - [ ] Hybrid client implemented (gradual traffic shift)
  - [ ] Fallback logic added (self-hosted → hosted on failure)
  - [ ] Changes deployed to staging and tested

### Migration Checklist

- [ ] **Week 1: 10% Traffic**
  - [ ] Set `SELF_HOSTED_TRAFFIC_PERCENT=10`
  - [ ] Monitor latency (no degradation)
  - [ ] Monitor error rate (<5%)
  - [ ] Verify embedding consistency
  - [ ] No customer complaints

- [ ] **Week 2: 25% Traffic**
  - [ ] Increase to 25%
  - [ ] Cost metrics on track (AWS bill visible)
  - [ ] Peak load handled successfully
  - [ ] Failover tested (self-hosted outage)

- [ ] **Week 3: 50% Traffic**
  - [ ] Increase to 50%
  - [ ] A/B test shows no quality degradation
  - [ ] P95 latency improved vs hosted
  - [ ] Multi-tenant isolation verified

- [ ] **Week 4: 100% Traffic**
  - [ ] All traffic on self-hosted
  - [ ] Stable for 1 week
  - [ ] No fallback to hosted API triggered
  - [ ] Performance better than hosted

### Post-Migration Checklist

- [ ] **Optimization Complete**
  - [ ] Horizontal scaling implemented (2-3 instances)
  - [ ] Performance tuned (batch size, workers)
  - [ ] Reserved instances purchased (cost optimization)
  - [ ] Auto-scaling configured (if needed)

- [ ] **Documentation Updated**
  - [ ] Architecture diagrams updated
  - [ ] Runbooks created for common issues
  - [ ] Disaster recovery plan documented
  - [ ] Team trained on new infrastructure

- [ ] **Hosted API Decommissioned**
  - [ ] Jina API key revoked
  - [ ] Monitoring confirms 0 requests to hosted API
  - [ ] Cost savings realized (AWS bill vs Jina bill)
  - [ ] Fallback code removed (after 2 weeks stable)

### Success Criteria

Your migration is successful when **all** of the following are true:

1. ✅ **Performance**: P95 latency <100ms (better than hosted 500ms)
2. ✅ **Reliability**: Error rate <1% (better than hosted SLA)
3. ✅ **Quality**: RAG search results >80% overlap with hosted
4. ✅ **Cost**: Monthly cost <$300 (vs hosted >$500 at scale)
5. ✅ **Stability**: 99.9% uptime for 2 consecutive weeks
6. ✅ **Scalability**: Throughput >10,000 embeddings/minute
7. ✅ **Monitoring**: All alerts configured and tested
8. ✅ **Team**: Runbooks created and team trained

### Rollback Criteria

Roll back to hosted API if **any** of the following occur:

1. ❌ Error rate >5% for self-hosted requests
2. ❌ P95 latency >500ms (worse than hosted)
3. ❌ Embedding consistency <99% cosine similarity
4. ❌ RAG search quality <70% top-10 overlap
5. ❌ Unplanned downtime >1 hour in first month
6. ❌ Data sovereignty violation detected
7. ❌ Cost >$500/month (not cost-effective)
8. ❌ Team cannot maintain infrastructure (skill gap)

---

## Appendix: Quick Reference

### Environment Variables

```bash
# Hosted API (Current)
JINA_API_KEY=jina_your_api_key_here

# Self-Hosted (After Migration)
JINA_ENDPOINT=http://your-server:8080/v1/embeddings
JINA_SELF_HOSTED_ENABLED=true
SELF_HOSTED_TRAFFIC_PERCENT=100

# Hybrid (During Migration)
JINA_API_KEY=jina_your_api_key_here
JINA_ENDPOINT=http://your-server:8080/v1/embeddings
SELF_HOSTED_TRAFFIC_PERCENT=50  # Gradually increase 10→25→50→100
```

### Useful Commands

```bash
# Service management
docker-compose up -d          # Start service
docker-compose down           # Stop service
docker-compose restart        # Restart service
docker-compose logs -f        # View logs
docker-compose ps             # Check status

# Health checks
curl http://localhost:8080/health
docker-compose exec jina-embeddings nvidia-smi  # Check GPU

# Monitoring
docker stats jina-embeddings  # Resource usage
docker-compose logs --tail=100 jina-embeddings | grep ERROR

# Scaling
docker-compose scale jina-embeddings=3  # Scale to 3 instances

# Updates
docker-compose pull           # Pull latest image
docker-compose up -d          # Recreate with new image
```

### Support Resources

- **Jina AI Documentation**: https://jina.ai/embeddings/
- **Docker Documentation**: https://docs.docker.com/
- **NVIDIA Container Toolkit**: https://github.com/NVIDIA/nvidia-docker
- **AWS EC2 GPU Instances**: https://aws.amazon.com/ec2/instance-types/g4/

### Contact

For questions or issues during migration:
- **Internal Team**: #embeddings-migration Slack channel
- **Jina AI Support**: support@jina.ai (for model-specific issues)
- **On-Call**: PagerDuty escalation for critical issues

---

**Document Version**: 1.0
**Last Reviewed**: 2025-10-15
**Next Review**: 2026-01-15 (Quarterly)
