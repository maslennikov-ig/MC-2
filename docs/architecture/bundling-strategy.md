# Processor Bundling Strategy

**For:** BullMQ sandboxed processor ESM compatibility
**Location:** `packages/course-gen-platform/tsup.config.ts`
**Status:** Production (deployed)

---

## TL;DR

BullMQ sandboxed processors run in Node.js worker threads with native ESM resolution, which requires explicit `.js` extensions for relative imports. Our TypeScript uses `moduleResolution: "Bundler"` which does not add them. Solution: Bundle `processor.ts` with tsup, inlining workspace packages while keeping external dependencies external.

---

## Problem

### The ESM Extension Issue

Node.js native ESM requires explicit file extensions for relative imports:

```javascript
// Node.js ESM requires this:
import { something } from './module.js';

// This fails in Node.js ESM:
import { something } from './module';
```

However, our TypeScript configuration uses:

```json
{
  "moduleResolution": "Bundler"
}
```

The "Bundler" resolution mode does not add `.js` extensions to compiled output because it assumes a bundler will resolve imports. This works fine for:

- Development with tsx (which handles resolution)
- Next.js (uses its own bundler)
- Regular Node.js with CommonJS

But it breaks for **BullMQ sandboxed processors** because they run in a separate Node.js worker thread with native ESM resolution.

### Why Sandboxed Processors?

BullMQ sandboxed processing provides critical benefits:

| Feature           | Benefit                               |
| ----------------- | ------------------------------------- |
| Process isolation | Crashes do not affect the main worker |
| No stalled jobs   | Blocking code cannot stall the job    |
| CPU utilization   | Better use of multi-core systems      |
| Memory management | Independent memory per job            |

We need sandboxed processors for reliability, so we cannot simply disable them.

---

## Solution

### tsup Bundling

We use [tsup](https://tsup.egoist.dev/) to bundle `processor.ts` into a standalone ESM file that:

1. **Inlines** workspace packages (`@megacampus/shared-types`, `@megacampus/shared-logger`)
2. **Keeps external** npm packages that handle their own ESM resolution
3. **Produces** a single `.js` file with no relative imports to resolve

```
Before (tsc output):
processor.js → imports → shared-types/index.js → imports → database.types.js
                                                            ↑
                                              Node.js ESM fails here (no .js extension)

After (tsup bundle):
processor.js (self-contained, all workspace code inlined)
       ↓
    imports only → bullmq, pino, supabase, etc. (npm packages)
```

### Build Process

The build command runs both tsc and tsup:

```bash
pnpm build  # Runs: tsc -p tsconfig.json && tsup
```

- **tsc**: Compiles all TypeScript to `dist/` (for server, worker-entrypoint, etc.)
- **tsup**: Bundles only `processor.ts` to `dist/orchestrator/processor.js`

---

## Configuration

### tsup.config.ts Explained

```typescript
export default defineConfig({
  // Only bundle the sandboxed processor
  entry: ['src/orchestrator/processor.ts'],
  outDir: 'dist/orchestrator',

  // ESM format for Node.js 20+
  format: ['esm'],
  target: 'node20',

  // Single file output (no code splitting)
  splitting: false,

  // Enable source maps for debugging
  sourcemap: true,

  // IMPORTANT: Don't clean dist/ - tsc builds other files there
  clean: false,

  // Types not needed for runtime processor
  dts: false,

  // Keep npm packages external (they handle ESM properly)
  external: [
    'bullmq', // BullMQ handles its own ESM
    'pino',
    'pino-pretty', // Native bindings
    'ioredis', // Large, works as-is
    '@supabase/supabase-js',
    '@langchain/core',
    '@langchain/openai',
    '@langchain/langgraph',
    'openai',
    '@qdrant/js-client-rest',
    'sharp',
    'tiktoken',
    'axios',
    'zod',
    // Node built-ins
    'fs',
    'path',
    'url',
    'crypto',
    'stream' /* etc. */,
  ],

  // INLINE workspace packages - this is the key fix
  noExternal: ['@megacampus/shared-types', '@megacampus/shared-logger'],

  esbuildOptions(options) {
    options.platform = 'node';
    // Prefer ESM entry points from packages
    options.mainFields = ['module', 'main'];
  },
});
```

### Key Configuration Decisions

| Option             | Value              | Reason                         |
| ------------------ | ------------------ | ------------------------------ |
| `clean: false`     | Do not clean dist  | tsc outputs to same directory  |
| `external`         | npm packages       | They resolve ESM correctly     |
| `noExternal`       | workspace packages | These have the extension issue |
| `splitting: false` | Single file        | Simpler, no chunk resolution   |

---

## Trade-offs

### Pros

- Solves ESM resolution without changing project-wide TypeScript config
- Minimal scope: only bundles what is necessary
- No runtime overhead: same code, just pre-bundled
- Maintains sandboxed processor benefits

### Cons

- Build complexity: two-step build (tsc + tsup)
- Bundle size: workspace code is duplicated in bundle
- Maintenance: must update `external`/`noExternal` lists when adding dependencies
- Debugging: bundled code slightly harder to trace (source maps help)

### Alternative Approaches Considered

| Approach                         | Why Not Used                               |
| -------------------------------- | ------------------------------------------ |
| Add `.js` extensions everywhere  | Requires changing all imports project-wide |
| Use `moduleResolution: "Node16"` | Breaks other tooling (Next.js, etc.)       |
| Use CommonJS                     | Loses ESM benefits, some deps are ESM-only |
| Don't use sandboxed processors   | Loses process isolation benefits           |

---

## Monitoring

### Bundle Size Analysis

Run after build to check bundle size:

```bash
pnpm analyze:bundle
```

Output:

```
Processor Bundle Analysis
----------------------------------------
   Path: dist/orchestrator/processor.js
   Size: 0.45 MB
   Warn threshold: 1.5 MB
   Max threshold: 2.0 MB
----------------------------------------
OK: Bundle size 0.45 MB is within limits
```

### Thresholds

| Threshold | Value  | Action                         |
| --------- | ------ | ------------------------------ |
| Warning   | 1.5 MB | Consider auditing dependencies |
| Maximum   | 2.0 MB | Build fails, must fix          |

### CI Integration

The analyzer writes to `$GITHUB_OUTPUT` environment file (GitHub Actions):

```
bundle_size_mb=0.45
```

---

## Maintenance

### When Bundle Grows

If bundle exceeds thresholds:

1. **Audit imports** in processor.ts and its dependencies
2. **Move to external** any npm package that handles ESM properly
3. **Check for accidental imports** of large modules
4. **Consider lazy loading** for rarely-used code paths

### Adding New Dependencies

When adding a dependency used by the processor:

```typescript
// In tsup.config.ts

external: [
  // Add npm packages that handle ESM properly
  'new-package',
],

noExternal: [
  // Add workspace packages that need bundling
  '@megacampus/new-workspace-package',
],
```

### Verification

After any changes to bundling:

```bash
# Build and verify
pnpm build

# Check bundle size
pnpm analyze:bundle

# Test sandboxed processor
pnpm test:integration
```

---

## Related Files

| File                                  | Purpose                           |
| ------------------------------------- | --------------------------------- |
| `tsup.config.ts`                      | Bundle configuration              |
| `scripts/analyze-processor-bundle.ts` | Size monitoring                   |
| `src/orchestrator/processor.ts`       | The bundled processor             |
| `src/orchestrator/worker.ts`          | Loads processor in sandboxed mode |

---

## References

- [tsup Documentation](https://tsup.egoist.dev/)
- [BullMQ Sandboxed Processors](https://docs.bullmq.io/guide/workers/sandboxed-processors)
- [Node.js ESM Resolution](https://nodejs.org/api/esm.html#resolution-algorithm)
- [TypeScript moduleResolution](https://www.typescriptlang.org/tsconfig#moduleResolution)
