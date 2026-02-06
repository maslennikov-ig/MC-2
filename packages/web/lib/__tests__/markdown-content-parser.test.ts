import { describe, it, expect } from 'vitest'
import { parseMarkdownToContent, parsedLessonContentSchema } from '../markdown-content-parser'

describe('parseMarkdownToContent', () => {
  describe('Basic parsing - intro headings', () => {
    it('should parse intro from ## Введение', () => {
      const markdown = `## Введение
Это введение урока.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toBe('Это введение урока.')
      expect(result.sections).toBeUndefined()
      expect(result.summary).toBeUndefined()
    })

    it('should parse intro from ## Introduction (English)', () => {
      const markdown = `## Introduction
This is the lesson introduction.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toBe('This is the lesson introduction.')
    })

    it('should parse intro case-insensitively', () => {
      const markdown = `## ВВЕДЕНИЕ
Case insensitive test.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toBe('Case insensitive test.')
    })
  })

  describe('Basic parsing - summary headings', () => {
    it('should parse summary from ## Заключение', () => {
      const markdown = `## Заключение
Это заключение урока.`

      const result = parseMarkdownToContent(markdown)

      expect(result.summary).toBe('Это заключение урока.')
      expect(result.intro).toBeUndefined()
    })

    it('should parse summary from ## Summary', () => {
      const markdown = `## Summary
This is the summary.`

      const result = parseMarkdownToContent(markdown)

      expect(result.summary).toBe('This is the summary.')
    })

    it('should parse summary from ## Итоги', () => {
      const markdown = `## Итоги
Итоги урока.`

      const result = parseMarkdownToContent(markdown)

      expect(result.summary).toBe('Итоги урока.')
    })

    it('should parse summary from ## Выводы', () => {
      const markdown = `## Выводы
Выводы урока.`

      const result = parseMarkdownToContent(markdown)

      expect(result.summary).toBe('Выводы урока.')
    })
  })

  describe('Basic parsing - regular sections', () => {
    it('should parse multiple sections with title and content', () => {
      const markdown = `## Первая секция
Содержание первой секции.

## Вторая секция
Содержание второй секции.

## Третья секция
Содержание третьей секции.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(3)
      expect(result.sections?.[0]).toEqual({
        title: 'Первая секция',
        content: 'Содержание первой секции.',
      })
      expect(result.sections?.[1]).toEqual({
        title: 'Вторая секция',
        content: 'Содержание второй секции.',
      })
      expect(result.sections?.[2]).toEqual({
        title: 'Третья секция',
        content: 'Содержание третьей секции.',
      })
    })

    it('should preserve markdown formatting in section content', () => {
      const markdown = `## Section with Formatting
**Bold text** and *italic text*.

- List item 1
- List item 2

\`\`\`javascript
const code = "example";
\`\`\`

[Link](https://example.com)`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].content).toContain('**Bold text**')
      expect(result.sections?.[0].content).toContain('- List item 1')
      expect(result.sections?.[0].content).toContain('```javascript')
      expect(result.sections?.[0].content).toContain('[Link](https://example.com)')
    })
  })

  describe('Edge cases - empty inputs', () => {
    it('should return empty object for empty string', () => {
      const result = parseMarkdownToContent('')

      expect(result).toEqual({})
    })

    it('should return empty object for only whitespace', () => {
      const result = parseMarkdownToContent('   \n\n  \t  ')

      expect(result).toEqual({})
    })

    it('should treat text without headings as intro', () => {
      const markdown = `This is just plain text without any headings.
It should be treated as intro.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toContain('This is just plain text')
      expect(result.sections).toBeUndefined()
      expect(result.summary).toBeUndefined()
    })
  })

  describe('Edge cases - empty sections', () => {
    it('should skip empty sections (heading with no body)', () => {
      const markdown = `## Empty Section

## Section with Content
This section has content.

## Another Empty Section`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0]).toEqual({
        title: 'Section with Content',
        content: 'This section has content.',
      })
    })

    it('should skip sections with only whitespace body', () => {
      const markdown = `## Whitespace Section



## Real Section
Content here.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].title).toBe('Real Section')
    })

    it('should handle multiple consecutive headings with empty bodies', () => {
      const markdown = `## Empty 1

## Empty 2

## Empty 3

## Has Content
Finally some content.

## Empty 4`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].title).toBe('Has Content')
    })
  })

  describe('Intro handling - preamble vs explicit intro', () => {
    it('should use preamble text before first heading as intro', () => {
      const markdown = `This is preamble text before any headings.
It should become the intro.

## First Section
Section content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toContain('This is preamble text')
      expect(result.sections).toHaveLength(1)
    })

    it('should override preamble with explicit ## Введение heading', () => {
      const markdown = `This is preamble text.

## Введение
This is the explicit intro.

## Section One
Content.`

      const result = parseMarkdownToContent(markdown)

      // Explicit intro overrides preamble
      expect(result.intro).toBe('This is the explicit intro.')
      expect(result.intro).not.toContain('preamble')
    })

    it('should handle only preamble, no headings', () => {
      const markdown = `Just preamble text.
No headings at all.
Should be intro.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toContain('Just preamble text')
      expect(result.sections).toBeUndefined()
      expect(result.summary).toBeUndefined()
    })
  })

  describe('Exercises handling', () => {
    it('should keep ## Упражнения section as regular section', () => {
      const markdown = `## Введение
Intro text.

## Упражнения
### Упражнение 1
Exercise content.

### Упражнение 2
More exercises.`

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toBe('Intro text.')
      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].title).toBe('Упражнения')
      expect(result.sections?.[0].content).toContain('### Упражнение 1')
      expect(result.sections?.[0].content).toContain('### Упражнение 2')
    })

    it('should preserve H3 subsections within exercises', () => {
      const markdown = `## Упражнения

### Простое упражнение
Try this first.

### Сложное упражнение
Try this next.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('### Простое упражнение')
      expect(result.sections?.[0].content).toContain('### Сложное упражнение')
      expect(result.sections?.[0].content).toContain('Try this first.')
      expect(result.sections?.[0].content).toContain('Try this next.')
    })
  })

  describe('Round-trip verification', () => {
    it('should parse full lesson markdown with intro, sections, and summary', () => {
      const markdown = `Preamble text before first heading.

## Введение
This is the introduction section.

## Основные понятия
Key concepts explained here.

## Примеры
Examples are shown here.

## Практика
Practice exercises.

## Заключение
Summary and conclusion.`

      const result = parseMarkdownToContent(markdown)

      // Explicit intro overrides preamble
      expect(result.intro).toBe('This is the introduction section.')
      expect(result.sections).toHaveLength(3)
      expect(result.sections?.[0].title).toBe('Основные понятия')
      expect(result.sections?.[1].title).toBe('Примеры')
      expect(result.sections?.[2].title).toBe('Практика')
      expect(result.summary).toBe('Summary and conclusion.')
    })

    it('should produce parseable structure that can be reconstructed', () => {
      const markdown = `## Введение
Intro content.

## Section 1
Section 1 content.

## Section 2
Section 2 content.

## Заключение
Summary content.`

      const parsed = parseMarkdownToContent(markdown)

      // Reconstruct markdown structure from parsed content
      let reconstructed = ''
      if (parsed.intro) {
        reconstructed += `## Введение\n${parsed.intro}\n\n`
      }
      if (parsed.sections) {
        for (const section of parsed.sections) {
          reconstructed += `## ${section.title}\n${section.content}\n\n`
        }
      }
      if (parsed.summary) {
        reconstructed += `## Заключение\n${parsed.summary}`
      }

      // Parse again
      const reparsed = parseMarkdownToContent(reconstructed.trim())

      expect(reparsed).toEqual(parsed)
    })

    it('should handle minimal valid markdown', () => {
      const markdown = `## Section
Content.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.intro).toBeUndefined()
      expect(result.summary).toBeUndefined()
    })
  })

  describe('Zod schema validation', () => {
    it('should validate valid parsed content', () => {
      const markdown = `## Введение
Valid intro.

## Section 1
Valid content.

## Заключение
Valid summary.`

      const parsed = parseMarkdownToContent(markdown)
      const validated = parsedLessonContentSchema.parse(parsed)

      expect(validated).toEqual(parsed)
    })

    it('should reject content with extra fields (strict mode)', () => {
      const invalid = {
        intro: 'Test',
        sections: [{ title: 'Test', content: 'Test' }],
        extraField: 'This should not be here',
      }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow()
    })

    it('should reject intro exceeding max length', () => {
      const tooLongIntro = 'a'.repeat(10001)
      const invalid = { intro: tooLongIntro }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(/Введение слишком длинное/)
    })

    it('should reject section title exceeding max length', () => {
      const invalid = {
        sections: [{ title: 'a'.repeat(501), content: 'Test' }],
      }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(
        /Заголовок секции слишком длинный/
      )
    })

    it('should reject section content exceeding max length', () => {
      const invalid = {
        sections: [{ title: 'Test', content: 'a'.repeat(100001) }],
      }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(
        /Содержание секции слишком длинное/
      )
    })

    it('should reject too many sections', () => {
      const tooManySections = Array.from({ length: 51 }, (_, i) => ({
        title: `Section ${i}`,
        content: 'Content',
      }))
      const invalid = { sections: tooManySections }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(/Слишком много секций/)
    })

    it('should reject summary exceeding max length', () => {
      const invalid = { summary: 'a'.repeat(10001) }

      expect(() => parsedLessonContentSchema.parse(invalid)).toThrow(/Заключение слишком длинное/)
    })

    it('should accept content at maximum allowed limits', () => {
      const atLimit = {
        intro: 'a'.repeat(10000),
        sections: Array.from({ length: 50 }, (_, i) => ({
          title: 'T'.repeat(500),
          content: 'c'.repeat(100000),
        })),
        summary: 's'.repeat(10000),
      }

      const validated = parsedLessonContentSchema.parse(atLimit)

      expect(validated.intro).toHaveLength(10000)
      expect(validated.sections).toHaveLength(50)
      expect(validated.summary).toHaveLength(10000)
    })
  })

  describe('Whitespace handling', () => {
    it('should trim whitespace from intro', () => {
      const markdown = `## Введение

   Content with surrounding whitespace.

   `

      const result = parseMarkdownToContent(markdown)

      expect(result.intro).toBe('Content with surrounding whitespace.')
      expect(result.intro?.startsWith(' ')).toBe(false)
      expect(result.intro?.endsWith(' ')).toBe(false)
    })

    it('should trim whitespace from section content', () => {
      const markdown = `## Section

   Section content with whitespace.

   `

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toBe('Section content with whitespace.')
    })

    it('should preserve internal whitespace and line breaks', () => {
      const markdown = `## Section
Paragraph 1.

Paragraph 2 with   spaces.

Paragraph 3.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].content).toContain('Paragraph 1.\n\nParagraph 2')
      expect(result.sections?.[0].content).toContain('   spaces')
    })
  })

  describe('Special characters and unicode', () => {
    it('should handle unicode characters in headings and content', () => {
      const markdown = `## Специальные символы: 日本語, 한국어, العربية
Content with unicode: 😀 🎉 ⚡`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections?.[0].title).toContain('日本語')
      expect(result.sections?.[0].content).toContain('😀 🎉 ⚡')
    })

    it('should handle headings with special markdown characters', () => {
      const markdown = `## Section with **bold** and *italic* in title
Content here.`

      const result = parseMarkdownToContent(markdown)

      // Heading title should preserve markdown syntax
      expect(result.sections?.[0].title).toBe('Section with **bold** and *italic* in title')
    })
  })

  describe('H1 headings should not be treated as section boundaries', () => {
    it('should treat # H1 headings as part of content', () => {
      const markdown = `## Section
# This is H1, not a section boundary
Content continues.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].content).toContain('# This is H1')
    })
  })

  describe('H3+ headings within sections', () => {
    it('should preserve ### H3 headings within section content', () => {
      const markdown = `## Main Section
### Subsection 1
Content for subsection 1.

### Subsection 2
Content for subsection 2.`

      const result = parseMarkdownToContent(markdown)

      expect(result.sections).toHaveLength(1)
      expect(result.sections?.[0].content).toContain('### Subsection 1')
      expect(result.sections?.[0].content).toContain('### Subsection 2')
    })
  })
})
