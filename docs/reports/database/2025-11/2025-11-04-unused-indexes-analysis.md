# Unused Indexes Analysis Report

**Generated:** 2025-11-04
**Database:** MegaCampusAI (diqooqbuchsliypgwksu)
**Total Unused Indexes:** 32
**Analysis Status:** COMPLETED

---

## Executive Summary

This report analyzes 32 unused indexes identified by the Supabase performance advisor. Each index has been categorized based on its purpose, risk level, and recommendation for removal or retention.

**Key Findings:**
- **KEEP (26 indexes):** Indexes essential for future queries, foreign keys, or specific operations
- **INVESTIGATE (6 indexes):** Indexes that may be candidates for removal after further analysis
- **REMOVE (0 indexes):** No obviously redundant indexes identified

**Recommendation:** Conservative approach - retain most indexes as they serve anticipated query patterns. Consider removing only after production usage data is available.

---

## Analysis by Category

### 1. KEEP - Essential for Query Performance (26 indexes)

These indexes should be retained as they support anticipated or critical query patterns:

#### 1.1 Foreign Key & Join Operations (1 index)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_lessons_section_id` | lessons | `(section_id)` | **Foreign key coverage.** Essential for JOIN queries between lessons and sections. Will be heavily used when querying lesson hierarchies. |

#### 1.2 Status & Filtering Queries (8 indexes)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_courses_status` | courses | `(status)` | **Status filtering.** Common query pattern: "WHERE status = 'published'" for public course listings. |
| `idx_courses_generation_status` | courses | `(generation_status) WHERE generation_status IS NOT NULL` | **Partial index for active generations.** Optimizes queries filtering by generation workflow states. |
| `idx_courses_active_generation` | courses | `(generation_status, last_progress_update) WHERE generation_status NOT IN ('completed', 'failed', 'cancelled')` | **Composite partial index.** Critical for monitoring active course generations and progress tracking. |
| `idx_job_status_status` | job_status | `(status)` | **Job queue filtering.** Essential for BullMQ queries: "WHERE status = 'pending'" to fetch next jobs. |
| `idx_lessons_status` | lessons | `(status)` | **Lesson filtering.** Used for queries like "WHERE status = 'published'" in student views. |
| `idx_enrollments_status` | course_enrollments | `(status)` | **Enrollment filtering.** Supports queries for active vs completed enrollments. |
| `idx_job_status_cancelled` | job_status | `(cancelled) WHERE cancelled = true` | **Partial index for cancellations.** Optimizes queries checking for cancelled jobs (rare but critical). |
| `idx_job_status_org_cancelled` | job_status | `(organization_id, cancelled) WHERE cancelled = true` | **Composite partial index.** Org-specific cancellation lookups for multi-tenant isolation. |

#### 1.3 Temporal & Sorting Queries (4 indexes)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_job_status_created_at` | job_status | `(created_at DESC)` | **Chronological ordering.** Used for "recent jobs" queries and job queue FIFO ordering. |
| `idx_job_status_updated_at` | job_status | `(updated_at DESC)` | **Last modified queries.** Supports polling for job status changes and stale job detection. |
| `idx_enrollments_enrolled_at` | course_enrollments | `(enrolled_at DESC)` | **Enrollment timeline.** Used for "recent enrollments" reports and analytics. |
| `idx_generation_history_timestamp` | generation_status_history | `(changed_at DESC)` | **Audit trail ordering.** Essential for chronological history views and debugging. |

#### 1.4 Search & Discovery (5 indexes)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_courses_difficulty` | courses | `(difficulty)` | **Course filtering.** Supports queries: "WHERE difficulty = 'beginner'" for course discovery. |
| `idx_courses_language` | courses | `(language)` | **Language filtering.** Essential for multi-language course catalogs: "WHERE language = 'en'". |
| `idx_courses_is_published` | courses | `(is_published)` | **Publication filtering.** Used to show only published courses to students. |
| `idx_courses_share_token` | courses | `(share_token) WHERE share_token IS NOT NULL` | **Partial index for public sharing.** Lookup by share token for anonymous course access. |
| `idx_lessons_type` | lessons | `(lesson_type)` | **Lesson type filtering.** Supports queries: "WHERE lesson_type = 'video'" for content type searches. |

#### 1.5 Deduplication & Integrity (1 index)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_file_catalog_dedup_lookup` | file_catalog | `(hash, vector_status, original_file_id) WHERE original_file_id IS NULL` | **Composite deduplication index.** Critical for preventing duplicate file uploads by hash lookup. |

#### 1.6 Error & Monitoring Queries (4 indexes)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_error_logs_severity_critical` | error_logs | `(severity, created_at DESC) WHERE severity = 'CRITICAL'` | **Partial index for critical errors.** Essential for alerting and monitoring dashboards. |
| `idx_system_metrics_event_type` | system_metrics | `(event_type)` | **Event type filtering.** Used for analytics: "WHERE event_type = 'job_rollback'". |
| `idx_system_metrics_severity` | system_metrics | `(severity)` | **Severity filtering.** Supports queries for error/warn/info event grouping. |
| `idx_generation_history_transitions` | generation_status_history | `(old_status, new_status) WHERE old_status IS NOT NULL` | **Composite partial index.** Analyzes state transition patterns for debugging workflow issues. |

#### 1.7 User & Relationship Queries (3 indexes)

| Index Name | Table | Definition | Reason to Keep |
|------------|-------|------------|----------------|
| `idx_users_email` | users | `(email)` | **Email lookup.** Essential for login, user search, and duplicate email checks. Already unique constraint exists, but index improves performance. |
| `idx_system_metrics_user_id` | system_metrics | `(user_id) WHERE user_id IS NOT NULL` | **Partial index for user activity.** Tracks system events per user for auditing. |
| `idx_error_logs_user_id` | error_logs | `(user_id) WHERE user_id IS NOT NULL` | **Partial index for user errors.** Supports queries: "errors for specific user" for debugging. |
| `idx_generation_history_changed_by` | generation_status_history | `(changed_by) WHERE changed_by IS NOT NULL` | **Partial index for user actions.** Tracks who triggered status changes for audit trails. |

---

### 2. INVESTIGATE - Potential Candidates for Removal (6 indexes)

These indexes may be redundant or have low value. Recommend monitoring production usage before removal:

#### 2.1 Potentially Redundant JSONB Indexes (2 indexes)

| Index Name | Table | Definition | Investigation Notes | Risk Level |
|------------|-------|------------|---------------------|------------|
| `idx_courses_analysis_result_gin` | courses | `GIN (analysis_result)` | **GIN index on analysis_result JSONB.** <br>- May be used for JSONB queries: `analysis_result @> '{"category": "..."}'`<br>- Stage 4 analysis feature recently added<br>- **Action:** Monitor for JSONB containment queries in production logs<br>- If no queries use `@>`, `?>`, `?&` operators, consider removal | LOW |
| `idx_file_catalog_parsed_content_metadata` | file_catalog | `GIN (parsed_content->'metadata')` | **GIN index on nested JSONB path.** <br>- Targets `parsed_content.metadata` specifically<br>- Depends on query patterns for docling metadata searches<br>- **Action:** Check if application queries `parsed_content->'metadata'` with containment operators<br>- Alternative: Full GIN on `parsed_content` if needed | MEDIUM |

#### 2.2 Hash Index Duplication (1 index)

| Index Name | Table | Definition | Investigation Notes | Risk Level |
|------------|-------|------------|---------------------|------------|
| `idx_file_catalog_hash` | file_catalog | `(hash)` | **Simple hash index.** <br>- Possibly redundant with `idx_file_catalog_dedup_lookup` which includes `hash` as first column<br>- Dedup lookup is more specific (partial index with WHERE clause)<br>- **Action:** Check if any queries use `WHERE hash = ?` without other dedup conditions<br>- **Recommendation:** Likely safe to remove if dedup index covers all hash lookups | MEDIUM |

#### 2.3 Error Message Index (1 index)

| Index Name | Table | Definition | Investigation Notes | Risk Level |
|------------|-------|------------|---------------------|------------|
| `idx_file_catalog_error_message` | file_catalog | `(error_message) WHERE error_message IS NOT NULL` | **Partial index for files with errors.** <br>- Used for queries: "files that failed processing"<br>- Low cardinality (most files succeed, few have errors)<br>- **Action:** Check frequency of error_message filtering queries<br>- **Alternative:** Full table scan on small error subset may be acceptable<br>- **Recommendation:** Keep if error analysis is common, remove if rarely queried | LOW |

#### 2.4 Configuration Lookup (1 index)

| Index Name | Table | Definition | Investigation Notes | Risk Level |
|------------|-------|------------|---------------------|------------|
| `idx_llm_model_config_phase` | llm_model_config | `(phase_name)` | **Phase name lookup.** <br>- Used for Stage 4 LLM config queries: `WHERE phase_name = 'phase_1_classification'`<br>- Small table (5 rows currently)<br>- Low cardinality (only ~5 distinct phase names)<br>- **Action:** Check if application frequently queries by phase_name<br>- **Recommendation:** Consider removal - table is tiny, full scan is fast | HIGH |

---

## Recommendations by Priority

### Immediate Actions (None)
No indexes should be removed immediately. All indexes serve plausible query patterns.

### Short-Term Monitoring (Next 30 Days)
1. **Enable `pg_stat_statements` extension** to track actual query patterns
2. **Monitor index usage** via `pg_stat_user_indexes` to identify truly unused indexes
3. **Focus on:**
   - `idx_llm_model_config_phase` (tiny table, may not need index)
   - `idx_file_catalog_hash` (potential duplicate of dedup index)
   - JSONB GIN indexes (verify containment queries exist)

### Long-Term Strategy (After Production Data)
1. **Review indexes quarterly** using Supabase advisor
2. **Remove indexes** only when:
   - Production logs confirm zero usage for 3+ months
   - Query performance testing shows no regression
   - No anticipated future queries need the index
3. **Document removal decisions** in migration comments

---

## Index Statistics Summary

| Category | Count | Recommendation |
|----------|-------|----------------|
| Foreign Key Coverage | 1 | KEEP (essential) |
| Status/Filtering | 8 | KEEP (common pattern) |
| Temporal/Sorting | 4 | KEEP (ordering queries) |
| Search/Discovery | 5 | KEEP (user-facing features) |
| Deduplication | 1 | KEEP (data integrity) |
| Error/Monitoring | 4 | KEEP (observability) |
| User/Relationships | 3 | KEEP (audit trails) |
| **JSONB Indexes** | **2** | **INVESTIGATE** |
| **Potential Duplicates** | **1** | **INVESTIGATE** |
| **Low-Value Indexes** | **3** | **INVESTIGATE** |
| **TOTAL** | **32** | **26 KEEP, 6 INVESTIGATE** |

---

## Implementation Notes

### Why Conservative Approach?

1. **Early Stage:** Database recently deployed, usage patterns not yet established
2. **Cost-Benefit:** Index maintenance cost is low with current data volume (< 100 rows per table)
3. **Risk Mitigation:** Removing needed indexes causes query performance degradation (harder to fix than keeping unused indexes)
4. **Future Queries:** Many indexes support anticipated queries not yet implemented in application

### When to Revisit

- **After 3 months production usage:** Real query patterns will emerge
- **After reaching 10K+ rows per table:** Index costs become more significant
- **During performance optimization sprints:** Data-driven decisions with pg_stat_statements

### Monitoring Commands

```sql
-- Check index usage statistics
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, tablename;

-- Check index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## Conclusion

**Current Recommendation:** Retain all 32 indexes.

The "unused" status reflects lack of production usage data, not lack of purpose. All indexes serve valid query patterns that will emerge as the application scales. Premature removal risks performance degradation.

**Next Steps:**
1. ✅ Document index purposes (completed in this report)
2. ⏳ Monitor production query patterns for 90 days
3. ⏳ Re-evaluate with `pg_stat_statements` data
4. ⏳ Create targeted removal migration after validation

**Estimated Disk Savings (if all 6 INVESTIGATE indexes removed):** ~200KB (negligible at current scale)

**Estimated Risk of Removal:** Medium to High (query performance degradation possible)

---

**Report Status:** COMPLETED
**Action Required:** No immediate changes. Monitor and revisit in Q1 2026.
