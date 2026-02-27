# Plan: Remove FormatsSection and Reorganize Course Creation Page

## Context

The "Форматы генерации" panel on the course creation page (`/create`) is rudimentary and non-functional. Only the "Текст" format is available (required, always on), while all 8 other formats (video, audio, tests, etc.) show "Скоро" badges. The actual format selection happens later, per-lesson, after course generation. The panel takes up an entire grid column but provides zero value to the user. Removing it and reorganizing the remaining sections will create a cleaner, more logical form flow.

## Current Layout (2-column grid on xl)

```
Row 1: BasicInfoSection (col1)      | FormatsSection (col2)     <-- REMOVING
Row 2: StyleSection (col1)          | UploadSection (col2)
Row 3: GenerationSettingsSection (col-span-2)
Row 4: AdvancedSettingsSection (col-span-2, collapsible)
Row 5: SubmitSection (col-span-2)
```

## New Layout

```
Row 1: BasicInfoSection (col1)      | StyleSection (col2)
Row 2: UploadSection (col-span-2, full width)
Row 3: GenerationSettingsSection (col-span-2)
Row 4: AdvancedSettingsSection (col-span-2, collapsible)
Row 5: SubmitSection (col-span-2)
```

Rationale:

- BasicInfo + Style paired together = "content definition" (what & how)
- UploadSection full-width = wider drop zone, better UX for file uploads
- Rest stays the same (already full-width)

## Changes

### 1. Remove FormatsSection component and related files

**Delete files:**

- `packages/web/components/forms/create-course/components/FormatsSection.tsx`
- `packages/web/components/forms/create-course/_data/constants.ts` (only contains generationFormats)
- `packages/web/components/forms/create-course/_types/index.ts` (only contains GenerationFormat interface)

### 2. Clean up form schema

**File:** `packages/web/components/forms/create-course/_schemas/form-schema.ts`

- Remove line 34: `formats: z.array(z.string()).optional(),`

### 3. Clean up main form component

**File:** `packages/web/components/forms/create-course-form.tsx`

- Remove `FormatsSection` import (line 8)
- Remove `toggleFormat` and `formats` from destructured hook return (lines 32, 34)
- Remove `<FormatsSection ... />` JSX (line 88)
- Move `<StyleSection>` to render right after `<BasicInfoSection>` (it already does, just remove the gap left by FormatsSection)

### 4. Clean up form hook

**File:** `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts`

- Remove `formats` from defaultValues (line 58)
- Remove `rawFormats` / `formats` watch and memo (lines 77-78)
- Remove formats from localStorage saving effect (lines 289, 295)
- Remove formats fallback effect (lines 312-317: ensures formats has at least ['text'])
- Remove entire `toggleFormat` callback (lines 334-349)
- Remove `toggleFormat` and `formats` from the return object (lines 368, 371)

### 5. Hardcode output_formats in submission

**File:** `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts`

- Replace lines 122-124:
  ```ts
  // Before:
  if (data.formats && data.formats.length > 0) {
    data.formats.forEach(format => formData.append('output_formats', format));
  }
  // After:
  formData.append('output_formats', 'text');
  ```

### 6. Make UploadSection full-width

**File:** `packages/web/components/forms/create-course/components/UploadSection.tsx`

- Change `xl:col-span-1` to `xl:col-span-2` in root `motion.div` className (line 49)
- Reorganize internal layout for full-width: wrap info box and FileUpload in a responsive grid:
  ```tsx
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <div>{/* info box */}</div>
    <div>{/* FileUpload + tier loading + success indicator */}</div>
  </div>
  ```

### 7. Adjust animation delays

Current delays: BasicInfo 0.0, FormatsSection 0.2, Style 0.3, Upload 0.4, GenSettings 0.4, Advanced 0.5, Submit 0.6

New delays (remove 0.2 gap, shift down):

- BasicInfo: 0.0 (unchanged)
- StyleSection: 0.2 (was 0.3)
- UploadSection: 0.3 (was 0.4)
- GenerationSettings: 0.4 (unchanged)
- AdvancedSettings: 0.5 (unchanged)
- SubmitSection: 0.6 (unchanged)

## Files Modified

| File                                                           | Action                            |
| -------------------------------------------------------------- | --------------------------------- |
| `components/forms/create-course/components/FormatsSection.tsx` | DELETE                            |
| `components/forms/create-course/_data/constants.ts`            | DELETE                            |
| `components/forms/create-course/_types/index.ts`               | DELETE                            |
| `components/forms/create-course-form.tsx`                      | Remove FormatsSection usage       |
| `components/forms/create-course/_schemas/form-schema.ts`       | Remove `formats` field            |
| `components/forms/create-course/_hooks/useCreateCourseForm.ts` | Remove format-related state/logic |
| `components/forms/create-course/_hooks/useSubmitCourse.ts`     | Hardcode `output_formats: text`   |
| `components/forms/create-course/components/UploadSection.tsx`  | Full-width + internal layout      |
| `components/forms/create-course/components/StyleSection.tsx`   | Update animation delay to 0.2     |

All paths relative to `packages/web/`.

## Verification

1. `pnpm type-check` — no TypeScript errors
2. `pnpm build` — clean build
3. Visual check: open `/create` page, verify layout renders correctly in both mobile and desktop views
4. Functional check: submit a course creation form, verify `output_formats: text` is sent correctly
