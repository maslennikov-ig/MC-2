# TASK: Implement Stale-While-Revalidate Cache Pattern

## Problem Statement

Current implementation uses hardcoded model constants as fallback when database is unavailable. This creates a maintenance problem:

1. **Hardcoded fallback becomes stale** - Models are frequently updated (new versions, deprecations), but hardcoded constants in code require releases to update
2. **Silent degradation** - System silently falls back to potentially outdated models without alerts
3. **No visibility** - Teams don't know when system is running in degraded mode

## Target Architecture: Stale-While-Revalidate

Industry-standard pattern used by Netflix, Spotify, AWS for resilient configuration management.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Request                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: Check In-Memory Cache                                       │
│    ├─ Fresh (TTL < 5 min) → Return immediately                      │
│    └─ Stale or Miss → Continue to Step 2                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: Database Query                                              │
│    ├─ Success → Update cache → Return fresh data                    │
│    └─ Failure → Continue to Step 3                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 3: Use Stale Cache (if available)                             │
│    ├─ Stale data exists → Return with WARNING log                   │
│    └─ No stale data → Continue to Step 4                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 4: FAIL with explicit error                                    │
│    └─ Throw Error: "Cannot get config: DB unavailable, no cache"    │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **No hardcoded fallback in code** - All configuration comes from database
2. **Stale cache is better than nothing** - Use last known good config during DB outage
3. **Explicit failure on cold start** - Better to fail fast than use outdated config
4. **Observable degradation** - Always log WARNING when using stale data

## Technical Implementation

### Current Cache Implementation

```typescript
// packages/course-gen-platform/src/shared/llm/model-config-service.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ConfigCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // PROBLEM: Deletes data when TTL expires
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }
}
```

### Target Cache Implementation

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheResult<T> {
  data: T;
  isStale: boolean;
  age: number; // milliseconds since last refresh
}

class StaleWhileRevalidateCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly freshTTL: number;

  constructor(freshTTLMs: number = 5 * 60 * 1000) {
    this.freshTTL = freshTTLMs;
  }

  /**
   * Get cached data with staleness indicator
   * NEVER deletes data - stale data is kept for fallback
   */
  get(key: string): CacheResult<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    const isStale = age > this.freshTTL;

    return {
      data: entry.data,
      isStale,
      age,
    };
  }

  /**
   * Store fresh data in cache
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if key has any data (fresh or stale)
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }
}
```

### Usage Pattern in ModelConfigService

```typescript
async getJudgeModels(language: string): Promise<JudgeModelsResult> {
  const cacheKey = `judges:${language}`;
  const cached = this.judgeCache.get(cacheKey);

  // Step 1: Return fresh cache immediately
  if (cached && !cached.isStale) {
    logger.debug({ cacheKey, age: cached.age }, 'Judge config cache hit (fresh)');
    return cached.data;
  }

  // Step 2: Try database lookup
  try {
    const dbConfig = await this.fetchJudgeConfigsFromDb(language);
    if (dbConfig) {
      logger.info(
        { language, primary: dbConfig.primary.modelId, source: 'database' },
        'Using fresh database judge config'
      );
      this.judgeCache.set(cacheKey, dbConfig);
      return dbConfig;
    }
  } catch (err) {
    logger.error({ language, error: err }, 'Database judge lookup failed');
  }

  // Step 3: Use stale cache if available
  if (cached) {
    const ageMinutes = Math.round(cached.age / 60000);
    logger.warn(
      { language, ageMinutes, primary: cached.data.primary.modelId },
      'Using STALE judge config due to database error - DATA MAY BE OUTDATED'
    );
    // TODO: Emit metric for monitoring (e.g., Prometheus counter)
    return cached.data;
  }

  // Step 4: No cache, no database - explicit failure
  const errorMsg = `Cannot get judge models for language "${language}": database unavailable and no cached data`;
  logger.fatal({ language }, errorMsg);
  throw new Error(errorMsg);
}
```

## Tasks

### Task 1: Implement StaleWhileRevalidateCache Class
**Subagent**: `llm-service-specialist`

**Files to modify:**
- `packages/course-gen-platform/src/shared/llm/model-config-service.ts`

**Changes:**
1. Create new `StaleWhileRevalidateCache<T>` class with:
   - `get(key)` returns `{ data, isStale, age } | null`
   - `set(key, data)` stores with current timestamp
   - `has(key)` checks existence
   - `clear()` removes all entries
   - NEVER deletes stale entries automatically

2. Replace existing `ConfigCache` with `StaleWhileRevalidateCache` for:
   - `stageCache`
   - `phaseCache`
   - `judgeCache`

3. Update all `get*` methods to use new pattern:
   - Return fresh cache immediately
   - On stale/miss: try database
   - On DB failure: use stale cache with WARNING
   - No stale cache: throw explicit error

**Context - Current ConfigCache:**
```typescript
// Location: packages/course-gen-platform/src/shared/llm/model-config-service.ts:68-101

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ConfigCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);  // PROBLEM: Deletes stale data
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Task 2: Remove Hardcoded Fallbacks from ModelConfigService
**Subagent**: `llm-service-specialist`

**Files to modify:**
- `packages/course-gen-platform/src/shared/llm/model-config-service.ts`

**Changes:**
1. Remove `getHardcodedJudgeConfig()` method entirely
2. Remove `getHardcodedStageConfig()` method entirely
3. Remove `getHardcodedPhaseConfig()` method entirely
4. Update `getJudgeModels()`, `getModelForStage()`, `getModelForPhase()` to:
   - Use stale cache on DB failure
   - Throw explicit error when no cache available

**Context - Methods to remove:**
```typescript
// getHardcodedJudgeConfig() - lines ~520-560
// getHardcodedStageConfig() - lines ~420-450
// getHardcodedPhaseConfig() - lines ~460-520
```

### Task 3: Remove Hardcoded Constants from CLEV Voter
**Subagent**: `judge-specialist`

**Files to modify:**
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`

**Changes:**
1. Delete `AVAILABLE_JUDGE_MODELS` constant entirely
2. Delete `GENERATION_MODELS` constant entirely
3. Delete `selectJudgeModelsHardcoded()` function entirely
4. Delete `CLEV_JUDGE_MODELS` constant entirely
5. Update `selectJudgeModels()` to not use any hardcoded fallback - let it throw on error
6. Update `getModelWeight()` function to fetch weights from ModelConfigService instead of `AVAILABLE_JUDGE_MODELS`

**Context - Constants to remove:**
```typescript
// GENERATION_MODELS - line ~111
export const GENERATION_MODELS = {
  russian: 'qwen/qwen3-235b-a22b-2507',
  other: 'deepseek/deepseek-v3.1-terminus',
};

// AVAILABLE_JUDGE_MODELS - lines ~137-180
export const AVAILABLE_JUDGE_MODELS: Record<string, JudgeModelConfig> = { ... };

// selectJudgeModelsHardcoded() - lines ~260-280
function selectJudgeModelsHardcoded(language: string) { ... }

// CLEV_JUDGE_MODELS - line ~285
export const CLEV_JUDGE_MODELS = selectJudgeModelsHardcoded('en');
```

### Task 4: Remove Hardcoded Constants from Node Files
**Subagent**: `code-structure-refactorer`

**Files to modify:**
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts`

**Changes for each file:**
1. Remove `DEFAULT_*_MODEL` constant
2. Update model selection logic to:
   - Call `ModelConfigService.getModelForPhase()`
   - Let it throw if DB unavailable and no cache
   - Remove try/catch that falls back to hardcoded

**Context - Pattern to change:**
```typescript
// Current pattern (with hardcoded fallback):
let modelId = DEFAULT_PLANNER_MODEL;
try {
  const config = await modelConfigService.getModelForPhase('stage_6_planner');
  modelId = config.modelId;
} catch (error) {
  logger.warn('Using hardcoded fallback');
}

// Target pattern (no hardcoded fallback):
const config = await modelConfigService.getModelForPhase('stage_6_planner');
const modelId = config.modelId;
// Let error propagate if DB unavailable and no cache
```

### Task 5: Remove Hardcoded Constants from model-selector.ts (Optional)
**Subagent**: `code-structure-refactorer`

**Files to modify:**
- `packages/course-gen-platform/src/shared/llm/model-selector.ts`

**Analysis needed:**
- Check if `MODEL_TIERS` and `STAGE4_MODELS` are still used
- If used only as fallback → remove
- If used for other purposes → keep but document

### Task 6: Update Tests
**Subagent**: `test-writer`

**Files to modify:**
- Create/update tests for `StaleWhileRevalidateCache`
- Update tests for `ModelConfigService` to verify:
  - Fresh cache returns immediately
  - Stale cache used on DB error
  - Error thrown when no cache and DB fails

### Task 7: Add Observability (Optional Enhancement)
**Subagent**: `infrastructure-specialist`

**Changes:**
1. Add Prometheus metrics for:
   - `model_config_cache_hits_total{status="fresh|stale"}`
   - `model_config_db_failures_total`
   - `model_config_fallback_usage_total`
2. Consider Sentry alert when stale cache is used for extended period

## Execution Order

```
Wave 1 (Sequential - Core Implementation):
├── Task 1: StaleWhileRevalidateCache class
└── Task 2: Remove hardcoded from ModelConfigService

Wave 2 (Parallel - Remove Hardcoded Constants):
├── Task 3: Remove from CLEV Voter
├── Task 4: Remove from Node files
└── Task 5: Analyze model-selector.ts

Wave 3 (Sequential - Validation):
├── Task 6: Update/add tests
└── Type-check and build verification

Wave 4 (Optional - Observability):
└── Task 7: Add metrics
```

## Acceptance Criteria

1. [ ] `StaleWhileRevalidateCache` implemented with `{ data, isStale, age }` return
2. [ ] Cache NEVER auto-deletes stale entries
3. [ ] All `getModelFor*` methods use stale-while-revalidate pattern
4. [ ] No hardcoded model constants in:
   - [ ] `model-config-service.ts`
   - [ ] `clev-voter.ts`
   - [ ] Node files (`planner.ts`, `expander.ts`, `smoother.ts`, `assembler.ts`)
5. [ ] WARNING logged when using stale cache
6. [ ] Explicit error thrown when DB unavailable AND no cache
7. [ ] Type-check passes
8. [ ] Build passes

## Risk Assessment

**Risk: Cold start without database**
- Mitigation: System will fail to start with clear error message
- This is acceptable - better to fail explicitly than run with outdated config

**Risk: Extended DB outage with stale cache**
- Mitigation: WARNING logs provide visibility
- Future: Add alerting when stale cache age exceeds threshold (e.g., 1 hour)

**Risk: Cache memory growth**
- Mitigation: Cache entries are small (model configs ~1KB each)
- Maximum expected entries: ~50 (all phases × languages × tiers)
- Total memory: <100KB - negligible

## Related Files

- `packages/course-gen-platform/src/shared/llm/model-config-service.ts`
- `packages/course-gen-platform/src/shared/llm/model-selector.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/*.ts`

## References

- [Stale-While-Revalidate Pattern (RFC 5861)](https://datatracker.ietf.org/doc/html/rfc5861)
- [Netflix Configuration Management](https://netflixtechblog.com/tagged/configuration)
- [TypeScript Proxy Pattern](https://refactoring.guru/design-patterns/proxy/typescript/example)
