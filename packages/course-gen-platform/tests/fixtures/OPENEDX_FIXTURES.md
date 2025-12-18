# Open edX LMS Integration Test Fixtures

This document describes the test fixtures created for Open edX LMS integration testing.

## Overview

Three sets of fixtures have been created to support comprehensive testing of the Open edX course generation pipeline:

1. **sample-course-50units.json** - Large English course with 50 units
2. **cyrillic-course.json** - Russian course testing Cyrillic transliteration
3. **expected-olx/** - Sample OLX output files for regression testing

## Fixture Details

### 1. sample-course-50units.json

**Purpose**: Test OLX generation with realistic course structure matching the 50-unit requirement.

**Structure**:
- Course ID: `SAMPLE_COURSE_50`
- Title: "Introduction to Web Development"
- Language: English (`en`)
- Organization: `MegaCampus`
- Run: `2025_Q1`

**Content Hierarchy**:
```
5 Chapters (HTML, CSS, JavaScript, DOM, Frameworks)
├── 2 Sections per chapter (10 total)
    └── 5 Units per section (50 total)
```

**Topics Covered**:
1. **Chapter 1**: HTML Fundamentals (Introduction, Semantic HTML)
2. **Chapter 2**: CSS Styling and Layout (Basics, Layouts)
3. **Chapter 3**: JavaScript Fundamentals (Intro, Advanced Concepts)
4. **Chapter 4**: DOM Manipulation and Events (DOM Basics, Event Handling)
5. **Chapter 5**: Modern Web Frameworks (Overview, Build Tools)

**Use Cases**:
- Test OLX generator with exactly 50 units (requirement from T124)
- Validate chapter/section/unit hierarchy
- Test realistic HTML content with code examples
- Performance testing with larger course structures

**Example Usage**:
```typescript
import sampleCourse from './fixtures/sample-course-50units.json';
import { CourseInputSchema } from '@megacampus/shared-types/lms/course-input';

// Validate fixture
const validated = CourseInputSchema.parse(sampleCourse);

// Generate OLX
const olxPackage = await generateOlxPackage(validated);
expect(olxPackage.files).toHaveProperty('course.xml');
```

### 2. cyrillic-course.json

**Purpose**: Test Cyrillic text handling and ASCII transliteration for url_name generation.

**Structure**:
- Course ID: `PYTHON_BASICS_RU`
- Title: "Основы программирования на Python" (Python Programming Basics)
- Language: Russian (`ru`)
- Organization: `MegaCampus`
- Run: `2025_Vesna` (2025_Spring)

**Content Hierarchy**:
```
5 Chapters (Introduction, Data Structures, Functions, OOP, Modules)
├── 2 Sections per chapter (10 total)
    └── 3 Units per section (30 total)
```

**Cyrillic Content Areas**:
- Course title and description
- Chapter titles (e.g., "Введение в Python", "Структуры данных")
- Section titles (e.g., "Основы языка", "Списки")
- Unit titles (e.g., "Что такое Python?", "Создание классов")
- HTML content with Russian text, code examples with Russian variable names

**Transliteration Examples**:
```
Display Name (Cyrillic)          → url_name (ASCII)
"Введение в Python"              → "glava_1_vvedenie"
"Основы языка"                   → "razdel_1_1_osnovy"
"Что такое Python?"              → "urok_1_1_1"
"Структуры данных"               → "glava_2_struktury_dannykh"
```

**Use Cases**:
- Test Cyrillic display names are preserved in XML
- Validate ASCII transliteration for url_name attributes
- Test UTF-8 encoding in generated OLX files
- Verify special character escaping in XML
- Test realistic Russian educational content

**Example Usage**:
```typescript
import cyrillicCourse from './fixtures/cyrillic-course.json';
import { transliterate } from '@/integrations/lms/openedx/utils/transliterate';

// Test transliteration
const chapter = cyrillicCourse.chapters[0];
expect(transliterate(chapter.title)).toBe('Vvedenie v Python');

// Validate Cyrillic preserved in display_name
const olx = generateChapterXml(chapter);
expect(olx).toContain('display_name="Введение в Python"');
expect(olx).toContain('url_name="glava_1_vvedenie"');
```

### 3. expected-olx/ Directory

**Purpose**: Provide reference OLX output for regression testing.

**Contents**:
- `course.xml` - Root course element
- `chapter_1_html_fundamentals.xml` - Sample chapter
- `section_1_1_intro_html.xml` - Sample sequential (section)
- `unit_1_1_1.xml` - Sample vertical (unit)
- `unit_1_1_1_html.xml` - Sample HTML component with CDATA
- `README.md` - Documentation

**OLX Hierarchy**:
```
course.xml
└── chapter_1_html_fundamentals.xml
    └── section_1_1_intro_html.xml
        └── unit_1_1_1.xml
            └── unit_1_1_1_html.xml
```

**Key Features**:
- Proper XML structure with attributes
- CDATA sections for HTML content
- Self-closing tags for references
- UTF-8 encoding
- Proper indentation (2 spaces)

**Use Cases**:
- Regression testing: compare generator output to expected output
- Structure validation: verify XML hierarchy
- Format validation: check indentation and whitespace
- Content validation: ensure CDATA wrapping

**Example Usage**:
```typescript
import { readFileSync } from 'fs';
import { generateCourseXml } from '@/integrations/lms/openedx/olx/templates/course';

const expectedCourseXml = readFileSync(
  'tests/fixtures/expected-olx/course.xml',
  'utf-8'
);

const meta = {
  org: 'MegaCampus',
  course: 'SAMPLE_COURSE_50',
  run: '2025_Q1',
  display_name: 'Introduction to Web Development',
  language: 'en',
  start: '2025-01-15T00:00:00Z'
};

const chapters = [
  { url_name: 'chapter_1_html_fundamentals' },
  { url_name: 'chapter_2_css_styling' },
  { url_name: 'chapter_3_javascript_basics' },
  { url_name: 'chapter_4_dom_manipulation' },
  { url_name: 'chapter_5_modern_frameworks' }
];

const result = generateCourseXml(meta, chapters);
expect(result).toBe(expectedCourseXml);
```

## Integration Test Scenarios

### Scenario 1: Full Pipeline Test (50 Units)

```typescript
describe('Full OLX Generation Pipeline - 50 Units', () => {
  it('should generate complete OLX package from sample course', async () => {
    const courseInput = CourseInputSchema.parse(sampleCourse);
    const olxPackage = await generateOlxPackage(courseInput);

    // Verify file count
    const fileCount = Object.keys(olxPackage.files).length;
    expect(fileCount).toBeGreaterThan(100); // course + 5 chapters + 10 sections + 50 units + 50 html

    // Verify course.xml
    expect(olxPackage.files['course.xml']).toContain('SAMPLE_COURSE_50');
    expect(olxPackage.files['course.xml']).toContain('chapter_1_html_fundamentals');

    // Verify all chapters present
    expect(olxPackage.files).toHaveProperty('chapter/chapter_1_html_fundamentals.xml');
    expect(olxPackage.files).toHaveProperty('chapter/chapter_5_modern_frameworks.xml');
  });
});
```

### Scenario 2: Cyrillic Content Test

```typescript
describe('Cyrillic Content and Transliteration', () => {
  it('should preserve Cyrillic in display names and transliterate url_names', () => {
    const courseInput = CourseInputSchema.parse(cyrillicCourse);
    const olxPackage = generateOlxPackage(courseInput);

    // Check course title preserved
    expect(olxPackage.files['course.xml']).toContain(
      'display_name="Основы программирования на Python"'
    );

    // Check url_name transliterated
    expect(olxPackage.files['course.xml']).toContain(
      'url_name="MegaCampus_PYTHON_BASICS_RU_2025_Vesna"'
    );

    // Check chapter with Cyrillic
    const chapterXml = olxPackage.files['chapter/glava_1_vvedenie.xml'];
    expect(chapterXml).toContain('display_name="Введение в Python"');
    expect(chapterXml).toContain('url_name="glava_1_vvedenie"');
  });
});
```

### Scenario 3: Regression Test

```typescript
describe('OLX Output Regression', () => {
  it('should match expected course.xml format', () => {
    const expectedCourseXml = readFileSync('tests/fixtures/expected-olx/course.xml', 'utf-8');

    const meta: OlxCourseMeta = {
      org: 'MegaCampus',
      course: 'SAMPLE_COURSE_50',
      run: '2025_Q1',
      display_name: 'Introduction to Web Development',
      language: 'en',
      start: '2025-01-15T00:00:00Z'
    };

    const chapters = [
      { url_name: 'chapter_1_html_fundamentals' },
      { url_name: 'chapter_2_css_styling' },
      { url_name: 'chapter_3_javascript_basics' },
      { url_name: 'chapter_4_dom_manipulation' },
      { url_name: 'chapter_5_modern_frameworks' }
    ];

    const result = generateCourseXml(meta, chapters);
    expect(result).toBe(expectedCourseXml);
  });
});
```

## Validation

All JSON fixtures have been validated:
- ✓ `sample-course-50units.json` - Valid JSON, conforms to CourseInputSchema
- ✓ `cyrillic-course.json` - Valid JSON, conforms to CourseInputSchema
- ✓ Expected OLX files - Valid XML structure

## File Sizes

- `sample-course-50units.json`: ~29 KB (50 units with realistic content)
- `cyrillic-course.json`: ~30 KB (30 units with Russian content)
- `expected-olx/`: ~4 KB total (6 files including README)

## Related Test IDs

- **T124**: Create sample course fixture with 50 units ✓
- **T125**: Create expected OLX output fixture ✓
- **T126**: Create Cyrillic content fixture ✓

## Next Steps

These fixtures support the following integration tests:

1. **T127**: Test OLX generator with sample-course-50units.json
2. **T128**: Test Cyrillic transliteration with cyrillic-course.json
3. **T129**: Regression test against expected-olx/ outputs
4. **T130**: Full pipeline integration test (CourseInput → OLX → tar.gz)

## Notes

- All fixtures use realistic educational content
- Unit content includes HTML formatting, code examples, and structured information
- Cyrillic fixture includes realistic Russian technical terms and programming examples
- Expected OLX files demonstrate proper XML structure and CDATA usage
- Fixtures are designed for both unit and integration testing
