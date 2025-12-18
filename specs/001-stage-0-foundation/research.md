# Research: Stage 0 - Foundation

**Date**: 2025-10-10
**Purpose**: Document technology selection decisions for Stage 0 infrastructure

## 1. Database Provider Selection

**Decision**: Supabase free tier
**Rationale**:

- Sufficient for Stage 0 development and initial testing (up to 500MB database, 50K monthly active users)
- Built-in Row-Level Security (RLS) for multi-tenancy enforcement
- Integrated authentication (email/password + OAuth providers)
- Automatic REST API generation
- Free pgvector extension for potential future use
- Easy upgrade path to paid plans when scaling

**Upgrade Trigger**: When approaching 500MB database size or need for custom compute resources

**Alternatives Considered**:

- Self-hosted PostgreSQL: Too much operational overhead for Stage 0
- Neon: No built-in authentication, would need separate auth service
- PlanetScale: MySQL (not PostgreSQL), incompatible with pgvector

## 2. Vector Storage Selection

**Decision**: Qdrant Cloud free tier (1GB storage, 50K vectors)
**Rationale**:

- Stage 0 scope: 3-5 test courses with minimal document indexing
- 1GB sufficient for ~50K vectors (768 dimensions at 32-bit float = ~3KB per vector)
- HNSW index provides <30ms query latency
- Built-in multi-tenancy support via payload filtering
- Managed service eliminates infrastructure management

**Upgrade Trigger**:

- Exceeding 40K vectors (80% of 50K limit)
- OR reaching 50+ courses with document uploads
- OR requiring >95th percentile latency <30ms at scale

**Production Plan**: Upgrade to Qdrant Cloud 1x plan ($49/month) for 25GB storage, 1M vectors

**Alternatives Considered**:

- Pinecone: More expensive ($70/month starter), less control over HNSW parameters
- Weaviate: Complex setup, heavier resource requirements
- pgvector: Insufficient recall for semantic search (<90% vs Qdrant's >95%)
- Chroma: SQLite-based, not production-ready for multi-tenant workloads

## 3. Embeddings Provider Selection

**Decision**: Jina-embeddings-v3 API (hosted)
**Rationale**:

- **Cost**: $0.02 per 1M tokens (3-5x cheaper than alternatives)
- **Quality**: >95% recall on MTEB benchmark, 768-dimensional embeddings
- **Features**: Task-specific embeddings ("retrieval.passage" vs "retrieval.query")
- **Language Support**: Optimized for Russian language (project requirement)
- **Rate Limit**: 1500 RPM sufficient for Stage 0 workload

**Self-hosting Trigger**:

- Indexed data >20GB (cost-effective to self-host at this scale)
- OR query volume >100K/month
- OR need for sub-10ms embedding generation latency

**Migration Path to Self-hosted**:

- Infrastructure: Docker container, 8GB RAM, 4 vCPU
- API compatibility: Maintain same input/output format for zero-downtime migration
- Cost break-even: ~$150/month hosted API vs $50/month self-hosted infrastructure

**Alternatives Considered**:

- Voyage-3.5: 3x more expensive ($0.06/M tokens), marginal quality improvement
- OpenAI text-embedding-3: 2x more expensive, no Russian language optimization
- Cohere embed-v3: Similar cost but lower recall (<93%)
- Self-hosted sentence-transformers: High upfront infrastructure cost, complex deployment

## 4. Redis Deployment Decision

**Decision**: Local Redis for Stage 0 development, Upstash for production
**Rationale**:

- **Development**: Local Redis (Docker or native) provides fast iteration, no network latency
- **Production**: Upstash Redis (serverless, pay-per-request) eliminates infrastructure management
- **Cost**: Upstash free tier (10K commands/day) sufficient for Stage 0, scales to paid as needed

**Upgrade Trigger**: Exceeding 8K commands/day (80% of free tier limit)

**Production Plan**: Upstash Pro plan (~$10/month) for 100K commands/day, 250MB storage

**Alternatives Considered**:

- Redis Cloud: More expensive ($5/month minimum), fixed pricing vs Upstash's pay-per-request
- AWS ElastiCache: Requires VPC setup, overkill for Stage 0
- Self-hosted Redis on VPS: Operational overhead, manual failover management

## 5. OAuth Provider Setup

**Decision**: Enable Google + GitHub OAuth
**Status**: Credentials **NOT YET OBTAINED** - will create during Phase 1 implementation

**Required Actions**:

1. **Google OAuth**:
   - Create project in Google Cloud Console
   - Enable Google+ API
   - Create OAuth 2.0 credentials (Web application)
   - Configure authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Document Client ID and Client Secret in `.env`

2. **GitHub OAuth**:
   - Create GitHub OAuth App in organization/personal settings
   - Configure Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Document Client ID and Client Secret in `.env`

3. **Supabase Configuration**:
   - Add Google provider in Supabase Auth settings
   - Add GitHub provider in Supabase Auth settings
   - Configure email/password authentication (default enabled)

**Note**: OAuth credentials will be created during Phase 1 (Setup) implementation when Supabase project is provisioned.

## 6. BullMQ Orchestration

**Decision**: BullMQ 5.x with Redis backend
**Rationale**:

- Proven job queue system with 100+ jobs/sec throughput
- Built-in retry mechanisms with exponential backoff
- BullMQ UI for real-time monitoring
- TypeScript-first design with excellent type safety
- Horizontal scaling via multiple workers

**Alternatives Considered**:

- Agenda.js: MongoDB-based, slower performance
- Bee-Queue: Simpler but lacks advanced features (priorities, repeatable jobs)
- Celery (Python): Wrong language stack, would require polyglot architecture

## 7. File Storage

**Decision**: Local filesystem for Stage 0, S3-compatible for production
**Rationale**:

- Stage 0 scope: 3-5 test courses, minimal file uploads
- Local storage simplifies development (no cloud credentials required)
- Path structure: `/uploads/{organizationId}/{courseId}/{fileId}.{ext}`
- Migration path: Swap filesystem with S3 adapter (Supabase Storage or Cloudflare R2)

**Production Plan**: Migrate to Supabase Storage (10GB free, $0.021/GB beyond)

## Summary Table

| Component      | Stage 0 Decision        | Production Plan          | Upgrade Trigger       |
| -------------- | ----------------------- | ------------------------ | --------------------- |
| **Database**   | Supabase free tier      | Supabase Pro ($25/month) | >500MB data           |
| **Vector DB**  | Qdrant Cloud free (1GB) | Qdrant 1x ($49/month)    | >40K vectors          |
| **Embeddings** | Jina-v3 API             | Self-hosted Jina-v3      | >20GB data            |
| **Redis**      | Local Redis             | Upstash Pro ($10/month)  | >8K commands/day      |
| **Storage**    | Local filesystem        | Supabase Storage         | Production deployment |
| **OAuth**      | Google + GitHub         | Same                     | N/A                   |

## Implementation Readiness

✅ **All technology decisions documented**
✅ **Upgrade/migration criteria defined**
✅ **Cost projections calculated**
⏳ **OAuth credentials pending** (will create in Phase 1)

**Ready to proceed**: Phase 0.5 (Subagent Setup) → Phase 1 (Setup) → Implementation
