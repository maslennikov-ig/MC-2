# GPU Rental for BGE-Reranker Inference: Provider Comparison

**RunPod with an A4000 GPU offers the best balance of cost, reliability, and ease of deployment for your 60,000 monthly rerank calls, costing approximately $100-144/month.** Vast.ai can be 30% cheaper but carries reliability risks. Serverless options like Modal or RunPod Serverless exceed your budget at ~$240-295/month, making dedicated instances the clear winner for your workload. Google Colab is definitively unsuitable for production use due to Terms of Service violations and session instability.

---

## 1. Provider comparison table

| Provider | GPU | $/hour | $/month (24/7) | $/month (500 hrs) | Cold Start | Reliability | Setup Ease |
|----------|-----|--------|----------------|-------------------|------------|-------------|------------|
| **Vast.ai** | A4000 | $0.11-0.15 | ~$108 | **~$75** | N/A (dedicated) | ⚠️ Variable | Moderate |
| **GCP Spot** | T4 | $0.15-0.19 | ~$120 | **~$85** | N/A | ⚠️ Preemptible | Moderate |
| **AWS Spot** | T4 (g4dn.xlarge) | $0.17-0.19 | ~$137 | **~$92** | N/A | ⚠️ 5-10% interrupt | Moderate |
| **RunPod Community** | A4000 | $0.20 | ~$144 | **~$100** | N/A | ✅ Good | ✅ Easy |
| **RunPod Secure** | A4000 | $0.27 | ~$194 | ~$135 | N/A | ✅ Excellent | ✅ Easy |
| **Jarvislabs** | RTX 5000 | $0.39 | ~$280 | ~$195 | N/A | ✅ Good | ✅ Easy |
| **RunPod Serverless** | L4 Active | $0.48 | N/A | **~$240** | 0 (always-on) | ✅ Excellent | Easy |
| **HF Endpoints** | T4 | $0.50 | $365 | **$250** | 1-3 min (scale-to-zero) | ✅ Excellent | ✅ Easiest |
| **Modal** | T4 | $0.59 | N/A | **~$295** | 2-4 sec | ✅ Excellent | ✅ Easy |
| **Paperspace** | P4000 | $0.51 | $303 | ~$255 | N/A | ✅ Excellent | ✅ Easy |
| **Azure Spot** | T4 (NC4as) | $0.22-0.25 | ~$170 | ~$118 | N/A | ✅ Good | Moderate |
| **Lambda Labs** | RTX 6000 | $0.50 | $360 | $250 | N/A | ✅ Good | Moderate |

*Sorted by 500 GPU-hours monthly cost. Lambda Labs lacks mid-range GPUs; RTX 6000 is their cheapest option.*

---

## 2. Google Colab verdict: Not viable for production

**Definitive answer: No, Google Colab cannot be used for production inference API workloads.** The Terms of Service explicitly prohibit "file hosting, media serving, or other web service offerings not related to interactive compute." Running an inference API—even via ngrok tunneling—constitutes exactly this kind of prohibited use.

Beyond policy concerns, technical limitations make Colab fundamentally unsuitable:

- **Session limits**: Maximum 12 hours (free) or 24 hours (Pro+), requiring constant reconnection logic
- **No uptime guarantees**: GPU availability is dynamic and unpredictable, making 99% uptime impossible
- **Account ban risk**: Production-like usage patterns trigger abuse detection—Stable Diffusion users have been banned
- **No static endpoints**: ngrok URLs change with every session restart
- **Idle timeouts**: Sessions terminate after 90 minutes of inactivity on free tier

**Colab Pro ($9.99/month)** and **Pro+ ($49.99/month)** do not solve these fundamental issues—they provide priority access and longer runtimes but still prohibit production API usage. For legitimate production workloads, Google offers **Colab Enterprise** through Google Cloud with guaranteed resources, but this is essentially GCP pricing with Colab's notebook interface.

---

## 3. HuggingFace Inference Endpoints analysis

**BGE-reranker-v2-m3 is natively supported** on HuggingFace Inference Endpoints via Text Embeddings Inference (TEI), requiring no custom handler. The model's 568M parameters (~2.3GB) fit comfortably on a T4 with 14GB VRAM.

### Pricing breakdown

| Configuration | Hourly | Monthly Cost | Notes |
|--------------|--------|--------------|-------|
| T4 always-on | $0.50 | **$365** | Exceeds budget, but zero cold starts |
| T4 with scale-to-zero (500 hrs) | $0.50 | **$250** | 15-min idle timeout before scaling down |
| T4 with scale-to-zero (300 hrs) | $0.50 | **$150** | Fits budget but requires aggressive scaling |

**Scale-to-zero behavior**: After 15 minutes of inactivity, endpoints scale to zero replicas. Cold starts return **HTTP 502** for 1-3 minutes while the model reinitializes—there's no request queuing during this period. This creates a poor user experience for bursty traffic patterns.

### HF Endpoints vs self-hosted TEI comparison

| Factor | HF Endpoints (T4) | Self-hosted TEI (RunPod A4000) |
|--------|-------------------|-------------------------------|
| Monthly cost (always-on) | $365 | **~$144** |
| Setup time | Minutes (one-click) | Hours (Docker + networking) |
| Maintenance | Fully managed | Self-managed |
| Scale-to-zero | Built-in | Manual scripting required |
| Cold start latency | 1-3 minutes | N/A if always-on |
| Monitoring | Built-in analytics | DIY (Prometheus/Grafana) |

**Recommendation**: Self-hosted TEI on RunPod offers **2.5x cost savings** over HF Endpoints. If you have DevOps capability, deploy TEI directly:
```bash
docker run ghcr.io/huggingface/text-embeddings-inference:1.8 \
  --model-id BAAI/bge-reranker-v2-m3
```

HF Endpoints make sense only if you require zero maintenance and can accept the $365/month always-on cost or tolerate 1-3 minute cold starts with scale-to-zero.

---

## 4. Serverless vs dedicated analysis

### Break-even calculation

The critical question: at what monthly usage does dedicated become cheaper than serverless?

| Provider Comparison | Dedicated $/hr | Serverless $/hr | Break-even (hrs/month) |
|--------------------|----------------|-----------------|------------------------|
| RunPod Pod vs Serverless | $0.20 (A4000) | $0.48 (L4 Active) | **Always dedicated** |
| RunPod Pod vs Modal | $0.20 (A4000) | $0.59 (T4) | **Always dedicated** |
| AWS Spot vs HF Endpoints | $0.18 (T4) | $0.50 (T4) | **Always dedicated** |

**For 500 GPU-hours/month**: Dedicated instances are unambiguously cheaper.

- **RunPod dedicated**: ~$100/month
- **RunPod Serverless Active**: ~$240/month
- **Modal serverless**: ~$295/month
- **HF Endpoints (scale-to-zero)**: ~$250/month

**When serverless makes sense**: Only if your actual compute usage is under **150-200 GPU-hours/month**—roughly 30% of your estimated workload. At your projected 500 hours, dedicated saves $140-195/month.

**Latency considerations**: Your <500ms requirement is challenging for pure serverless. Modal's 2-4 second cold starts and RunPod's variable FlashBoot times (500ms-42 seconds) mean you must either:
1. Keep containers warm (negating serverless cost benefits)
2. Accept occasional latency spikes during scale-up
3. Use dedicated instances for guaranteed latency

---

## 5. Top 3 recommendations

### Budget option: RunPod Community Cloud A4000 (~$100/month)

Deploy TEI on RunPod's community cloud with an A4000 GPU at $0.20/hour. For 500 GPU-hours, expect **~$100/month**—or **~$144/month** for 24/7 operation.

- **Pros**: No egress fees, 7 EU datacenters, excellent Docker support, SOC 2 compliant
- **Cons**: Community cloud instances can theoretically be preempted (rare in practice)
- **Setup**: Deploy `ghcr.io/huggingface/text-embeddings-inference` container directly
- **Scaling path**: Seamless upgrade to Secure Cloud or additional pods as traffic grows

### Balanced option: GCP Spot T4 + Spot Instance Manager (~$130/month)

Run a g2-standard-4 (L4) or n1-standard-4+T4 on GCP spot pricing in europe-west1.

- **Spot T4**: ~$0.15-0.19/hour = **$108-137/month** for 24/7
- **Pros**: 4x faster inference with L4 for similar cost, Google's reliability, committed use discounts available
- **Cons**: Spot can be preempted; requires instance restart automation
- **Setup**: Use GCP's Spot Instance Manager or a simple watchdog script to restart preempted instances
- **Hidden costs**: Add ~$10/month for storage and static IP

### Premium option: RunPod Secure Cloud + HF Fallback (~$200/month)

Deploy TEI on RunPod Secure Cloud (A4000 at $0.27/hour = ~$194/month) with HuggingFace Inference API as emergency fallback.

- **Primary**: Dedicated, non-interruptible instance with guaranteed availability
- **Fallback**: Configure application to retry failed requests against HF's free/PRO Inference API
- **Pros**: 99.9%+ effective uptime, sub-200ms latency, EU datacenters
- **Cons**: Slightly over budget at $194-200/month
- **HF PRO ($9.99/month)**: Provides higher rate limits for fallback scenarios

---

## 6. Hidden costs checklist

| Cost Type | RunPod | Vast.ai | AWS | GCP | HF Endpoints |
|-----------|--------|---------|-----|-----|--------------|
| **Egress/bandwidth** | ✅ Free | ⚠️ Variable ($0.02-0.10/GB on some hosts) | $0.09/GB after 100GB | $0.12/GB | ✅ Included |
| **Storage** | $0.10/GB/mo (running) | ⚠️ Charged even when stopped | $0.08/GB EBS | $0.04/GB HDD | ✅ Included |
| **Static IP** | ✅ Free | ✅ Free | $3.60/mo if unattached | $7.30/mo | ✅ Included |
| **Minimum commitment** | None | None | None (spot), 1yr (reserved) | None (spot), 1yr (CUD) | None |
| **Model storage** | ~5GB needed | ~5GB needed | ~5GB needed | ~5GB needed | ✅ Managed |

**Vast.ai warning**: Some community hosts charge **$30+ for 1TB of bandwidth transfer**. Always filter for verified datacenter hosts with no bandwidth charges to avoid surprise bills.

**Cloud provider totals**: Add approximately **$10-15/month** to base compute costs for storage, static IPs, and minimal egress on AWS/GCP/Azure.

---

## Operational considerations summary

| Requirement | Best Options |
|-------------|--------------|
| **Docker/TEI support** | RunPod (native), Modal (TEI example), GCP (container-optimized VMs) |
| **Persistent model storage** | RunPod Network Volumes, GCP Persistent Disk, AWS EBS |
| **Built-in monitoring** | HF Endpoints (excellent), RunPod (good dashboard), Modal (built-in) |
| **Easy HTTPS endpoint** | HF Endpoints (automatic), RunPod (proxy built-in), Modal (automatic) |
| **Auto-restart on failure** | GCP Managed Instance Groups, AWS Auto Scaling, RunPod health checks |
| **Multi-region EU** | RunPod (7 EU datacenters), AWS (eu-west-1, eu-central-1), GCP (4 EU regions) |

---

## Final recommendation for your constraints

**For <$150/month with 99% uptime and <500ms latency**: Deploy **RunPod Community Cloud A4000** with self-hosted TEI.

This configuration provides:
- **Cost**: ~$100-144/month (within budget)
- **Latency**: <100ms for 100 documents (dedicated instance, no cold starts)
- **Uptime**: 99%+ (add Jina API fallback for 99.9%+)
- **EU availability**: Netherlands, France, Romania, Sweden datacenters
- **Scalability**: Add pods or upgrade to Secure Cloud for 5x growth

**Implementation steps**:
1. Create RunPod account, select EU region (EU-NL-1 recommended)
2. Deploy pod with A4000 GPU using TEI Docker template
3. Configure persistent network volume for model caching
4. Set up health check endpoint and auto-restart
5. (Optional) Configure Jina Reranker API as fallback for 99.9% effective uptime

The serverless vs dedicated analysis strongly favors dedicated for your 500 GPU-hours workload—you'll save $140-195/month compared to serverless alternatives while achieving better latency guarantees.