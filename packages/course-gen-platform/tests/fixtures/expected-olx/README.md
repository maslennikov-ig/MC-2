# Expected OLX Output Fixtures

This directory contains sample expected OLX (Open Learning XML) output files for regression testing the OLX generator.

## Purpose

These fixtures serve as reference outputs for testing the OLX generation pipeline. They demonstrate the expected XML structure for various course elements when converting from CourseInput to OLX format.

## Files

- **course.xml** - Root course element with chapter references
- **chapter_1_html_fundamentals.xml** - Sample chapter with sequential references
- **section_1_1_intro_html.xml** - Sample sequential (section) with vertical references
- **unit_1_1_1.xml** - Sample vertical (unit) with HTML component reference
- **unit_1_1_1_html.xml** - Sample HTML component with CDATA-wrapped content

## OLX Structure Hierarchy

```
Course (course.xml)
└── Chapter (chapter_*.xml)
    └── Sequential (section_*.xml)
        └── Vertical (unit_*.xml)
            └── Component (unit_*_html.xml)
```

## Usage in Tests

These fixtures can be used to:

1. **Regression Testing**: Verify OLX generator produces consistent output
2. **Structure Validation**: Ensure correct XML hierarchy and attributes
3. **Content Validation**: Confirm proper XML escaping and CDATA wrapping
4. **Integration Testing**: Test full course generation pipeline

## Example Test Pattern

```typescript
import { generateOlxCourse } from '@/integrations/lms/openedx/olx/generator';
import { readFileSync } from 'fs';

const expectedCourseXml = readFileSync(
  'tests/fixtures/expected-olx/course.xml',
  'utf-8'
);

const result = generateOlxCourse(courseInput);
expect(result.files['course.xml']).toBe(expectedCourseXml);
```

## Notes

- All XML files use UTF-8 encoding
- Display names support Cyrillic and Unicode characters
- HTML content is wrapped in CDATA sections to preserve special characters
- File names match url_name attributes for consistency
- Indentation uses 2 spaces for readability
