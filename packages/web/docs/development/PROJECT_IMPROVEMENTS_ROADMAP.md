# CourseAI-Next Project Improvements Roadmap

## Current Status
- ✅ Completed major reorganization (2025-09-11)
- ✅ Page-specific components moved to `_components` folders
- ✅ Removed 7 unused/duplicate components
- ✅ All tests passing (type-check, lint, build)

## Priority 1: Critical Improvements (Week 1)

### 1.1 Component Organization
```bash
# Create better component categories
components/
├── ui/          # Keep Shadcn components
├── auth/        # Already exists
├── layouts/     # NEW: Move header, backgrounds, footers here
├── course/      # NEW: Shared course components
├── forms/       # NEW: Move form components here
└── common/      # NEW: Other shared components
```

**Action Items:**
- [ ] Move `header.tsx`, `*-background.tsx` → `/components/layouts/`
- [ ] Move `course-generation-progress.tsx`, `course-viewer-enhanced.tsx` → `/components/course/`
- [ ] Move `create-course-form.tsx` → `/components/forms/`
- [ ] Move remaining misc components → `/components/common/`

### 1.2 Library Consolidation
```bash
# Fix duplicate folders
lib/
├── hooks/       # DELETE - merge with /hooks
├── validation/  # Keep this one
└── validations/ # DELETE - merge into validation/
```

**Action Items:**
- [ ] Merge `/lib/hooks/` content into `/hooks/`
- [ ] Merge `/lib/validations/` into `/lib/validation/`
- [ ] Update all imports

### 1.3 Documentation Organization
```bash
# Move docs out of root
docs/
├── architecture/
│   ├── database-schema.md
│   ├── n8n-workflows.md
│   └── system-design.md
├── deployment/
│   ├── docker-setup.md
│   └── environment-variables.md
└── development/
    ├── coding-standards.md
    ├── testing-guide.md
    └── CLAUDE.md
```

**Action Items:**
- [ ] Create `/docs/` folder structure
- [ ] Move all `.md` files from root (except README.md)
- [ ] Update references in CLAUDE.md

## Priority 2: Developer Experience (Week 2)

### 2.1 Testing Structure
```bash
# Co-locate tests with components
app/courses/_components/
├── course-card.tsx
├── course-card.test.tsx    # NEW
├── course-grid.tsx
└── course-grid.test.tsx    # NEW
```

**Action Items:**
- [ ] Move tests from `/tests/` to be co-located
- [ ] Update jest.config.js to find co-located tests
- [ ] Add test files for untested components

### 2.2 Barrel Exports
```typescript
// components/course/index.ts
export { CourseViewerEnhanced } from './course-viewer-enhanced'
export { CourseGenerationProgress } from './course-generation-progress'
export { CourseStatsBar } from './course-stats-bar'
```

**Action Items:**
- [ ] Add `index.ts` to each component folder
- [ ] Update imports to use barrel exports
- [ ] Benefits: Cleaner imports, better IntelliSense

### 2.3 Environment Configuration
```bash
# Centralize config
config/
├── constants.ts      # App-wide constants
├── features.ts       # Feature flags
└── routes.ts         # Route definitions
```

**Action Items:**
- [ ] Create `/config/` folder
- [ ] Extract constants from components
- [ ] Centralize route definitions

## Priority 3: Code Quality (Week 3)

### 3.1 TypeScript Improvements
```typescript
// types/index.ts - Create central type exports
export * from './database'
export * from './api'
export * from './components'
```

**Action Items:**
- [ ] Create type categories in `/types/`
- [ ] Add stricter TypeScript rules
- [ ] Fix the one `any` type warning

### 3.2 Component Standards
```typescript
// Template for consistent component structure
interface ComponentProps {
  // Props with JSDoc comments
}

export function Component({ ...props }: ComponentProps) {
  // 1. Hooks
  // 2. State
  // 3. Effects
  // 4. Handlers
  // 5. Render
}
```

**Action Items:**
- [ ] Document component standards
- [ ] Add prop validation where missing
- [ ] Ensure consistent export style

### 3.3 Performance Optimizations
```typescript
// Add performance monitoring
- [ ] Implement React.memo for heavy components
- [ ] Add lazy loading for route components
- [ ] Optimize bundle splitting
```

## Priority 4: Future Enhancements (Month 2)

### 4.1 Feature-Based Architecture (For Complex Features)
```bash
# Consider for large features
features/
├── course-generation/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── types.ts
└── user-dashboard/
    ├── components/
    ├── hooks/
    └── utils/
```

### 4.2 Monorepo Structure (If Scaling)
```bash
# If adding more apps/packages
packages/
├── web/          # Current Next.js app
├── mobile/       # Future React Native app
├── shared/       # Shared utilities
└── ui/           # Shared UI components
```

### 4.3 Advanced Tooling
- [ ] Add Storybook for component documentation
- [ ] Implement E2E testing with Playwright
- [ ] Add commit hooks with Husky
- [ ] Set up GitHub Actions for CI/CD

## Quick Wins (Can Do Immediately)

1. **Remove unused dependencies**
   ```bash
   pnpm dlx depcheck
   ```

2. **Add path aliases to tsconfig**
   ```json
   {
     "paths": {
       "@/course/*": ["components/course/*"],
       "@/layouts/*": ["components/layouts/*"],
       "@/forms/*": ["components/forms/*"]
     }
   }
   ```

3. **Create component template snippets**
   ```bash
   # .vscode/snippets/component.code-snippets
   ```

4. **Add pre-commit validation**
   ```json
   // package.json
   "pre-commit": "pnpm type-check && pnpm lint"
   ```

## Success Metrics

- [ ] Build time < 30s
- [ ] Type checking < 10s
- [ ] 0 TypeScript errors
- [ ] 0 ESLint errors
- [ ] Test coverage > 60%
- [ ] Developer onboarding < 30 minutes

## Implementation Order

1. **Week 1**: Priority 1 items (Critical structure)
2. **Week 2**: Priority 2 items (Developer experience)
3. **Week 3**: Priority 3 items (Code quality)
4. **Month 2**: Evaluate need for Priority 4 items

## Notes

- Each change should pass `pnpm type-check && pnpm lint && pnpm build`
- Update CLAUDE.md after significant changes
- Consider team feedback before major architectural changes
- Maintain backward compatibility during migration