# CourseAI-Next Project Structure Reorganization Specification

## STATUS: ✅ COMPLETED (2025-09-11)

### Summary of Changes:
- Moved 11 page-specific components from `/app/courses/components/` to `/app/courses/_components/`
- Moved 1 component from `/app/create/components/` to `/app/create/_components/`
- Deleted 7 unused/duplicate components
- Updated all import statements
- All validation checks passed (type-check, lint, build)

## Current Issues
1. **Duplicate components** exist in both `/components` and `/app/*/components` folders
2. **Unclear separation** between shared and page-specific components
3. **Inconsistent naming** and file organization
4. **Unused legacy components** still present in the codebase

## Target Structure

### Folder Organization Principles

```
courseai-next/
├── app/                      # Next.js 13+ App Router
│   ├── (routes)/            # Route groups
│   │   ├── page.tsx         # Page components
│   │   ├── layout.tsx       # Layout components
│   │   └── _components/     # Page-specific components (prefixed with _)
│   └── api/                 # API routes
├── components/              # ONLY shared, reusable components
│   ├── ui/                  # Shadcn UI components
│   ├── layouts/             # Shared layout components
│   ├── forms/               # Shared form components
│   └── common/              # Other shared components
├── lib/                     # Utilities, helpers, configurations
├── hooks/                   # Custom React hooks
├── types/                   # TypeScript type definitions
└── public/                  # Static assets
```

## Reorganization Plan

### Phase 1: Audit Current Structure
```bash
# 1. List all components and their locations
find . -name "*.tsx" -o -name "*.ts" | grep -E "(components|app)" | sort

# 2. Find duplicate component names
find . -name "*.tsx" | xargs basename | sort | uniq -d

# 3. Check import usage for each component
for file in $(find ./components -name "*.tsx"); do
  basename_file=$(basename "$file")
  echo "=== Checking usage of $basename_file ==="
  grep -r "from.*$basename_file" --include="*.tsx" --include="*.ts" .
done
```

### Phase 2: Categorize Components

#### Shared Components (stay in `/components/`)
- Components used in 2+ different pages
- UI primitives (buttons, cards, modals)
- Layout components (headers, footers)
- Generic forms and inputs

#### Page-Specific Components (move to `/app/[page]/_components/`)
- Components only used on one page
- Page-specific filters, grids, lists
- Custom layouts for specific routes

### Phase 3: Safe Migration Process

```bash
# FOR EACH COMPONENT TO MOVE:

# 1. Verify current usage
component_name="course-card"
grep -r "import.*$component_name" --include="*.tsx" --include="*.ts" .

# 2. Create backup
cp -r ./components ./components.backup.$(date +%Y%m%d)

# 3. Move component
mv ./components/$component_name.tsx ./app/courses/_components/

# 4. Update all imports
# From: import { ComponentName } from '@/components/component-name'
# To:   import { ComponentName } from '@/app/courses/_components/component-name'

# 5. Test build
pnpm type-check && pnpm lint && pnpm build

# 6. If successful, commit
git add -A && git commit -m "refactor: move $component_name to page-specific folder"
```

### Phase 4: Component Consolidation

#### Identify Duplicates
```bash
# Find components with similar names
ls components/*.tsx app/**/components/*.tsx | xargs -I {} basename {} | sort | uniq -d
```

#### Merge Strategy
1. Compare functionality of duplicates
2. Keep the most feature-complete version
3. Merge unique features from both
4. Update all imports to use single version
5. Delete redundant version

### Phase 5: Cleanup Unused Components

```bash
# Find potentially unused components
for file in $(find ./components -name "*.tsx"); do
  component=$(basename "$file" .tsx)
  count=$(grep -r "$component" --include="*.tsx" --include="*.ts" . | grep -v "^$file" | wc -l)
  if [ $count -eq 0 ]; then
    echo "Potentially unused: $file"
  fi
done
```

## Specific Actions for CourseAI-Next

### Components to Move to `/app/courses/_components/`
- [x] course-card.tsx (already page-specific)
- [x] course-grid.tsx
- [x] courses-filters.tsx
- [x] course-skeleton.tsx
- [x] course-statistics.tsx
- [x] courses-header.tsx
- [x] auth-status.tsx
- [x] courses-content-client.tsx
- [x] courses-filters-improved.tsx
- [x] courses-loading.tsx
- [x] keyboard-navigation.tsx

### Components to Keep in `/components/`
- [x] create-course-form.tsx (used in /create page)
- [x] course-generation-progress.tsx (used in multiple places)
- [x] course-viewer-enhanced.tsx (used for viewing any course)
- [x] shader backgrounds (shared visual components)
- [x] course-stats-bar.tsx (used across pages)

### Components to Delete (unused/legacy)
- [x] course-catalog*.tsx (replaced by new components) - DELETED
- [x] swipeable-course-cards.tsx (unused) - DELETED
- [x] mobile-course-filters*.tsx (unused) - DELETED
- [x] course-filters-compact.tsx (duplicate) - DELETED
- [x] course-details-modal.tsx (unused) - DELETED
- [x] course-skeleton-server.tsx (unused) - DELETED
- [x] course-stats-server.tsx (unused) - DELETED

## Safety Checklist

### Before Moving Any Component:
- [x] Run `grep -r "ComponentName"` to find all usages ✅
- [x] Check if component is exported from any index files ✅
- [x] Verify no dynamic imports reference the component ✅
- [x] Create a backup of current working state (via Git) ✅

### After Moving:
- [x] Update all import statements ✅
- [x] Run `pnpm type-check` - must pass with 0 errors ✅
- [x] Run `pnpm lint` - should have minimal warnings ✅ (1 warning only)
- [x] Run `pnpm build` - must complete successfully ✅
- [ ] Test affected pages in browser (manual testing needed)
- [ ] Check console for runtime errors (manual testing needed)

### Testing Commands Sequence:
```bash
# Full validation suite
pnpm type-check && \
pnpm lint && \
pnpm build && \
echo "✅ All checks passed"
```

## Migration Order (Recommended)

1. **Start with unused components** - Delete first (lowest risk)
2. **Move page-specific components** - Clear ownership
3. **Consolidate duplicates** - Merge carefully
4. **Update shared components** - Ensure proper exports
5. **Final cleanup** - Remove empty folders, update imports

## Rollback Plan

If issues arise:
```bash
# Restore from backup
rm -rf ./components ./app
cp -r ./components.backup.[date] ./components
cp -r ./app.backup.[date] ./app

# Or use git
git stash
git checkout HEAD~1
```

## Success Criteria

- [x] No duplicate components with same functionality ✅
- [x] Clear separation: shared vs page-specific ✅
- [x] All imports use correct paths ✅
- [x] Zero TypeScript errors ✅
- [x] Build completes successfully ✅
- [ ] No runtime errors in browser (needs testing)
- [x] Folder structure follows Next.js 13+ best practices ✅

## Notes

- Use `_components` folder name for page-specific components to clearly distinguish from routes
- Keep ui/ folder for shadcn components - don't reorganize these
- Consider creating barrel exports (index.ts) for component folders
- Document any special cases or exceptions in CLAUDE.md