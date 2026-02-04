/**
 * Unit tests for escapeCurrencyDollarSigns utility
 *
 * Tests verify the currency dollar sign escaping logic:
 * 1. Currency patterns (SHOULD be escaped): $1000, $50,000, $99.99, etc.
 * 2. LaTeX math (should NOT be escaped): $x^2$, $\alpha$, $$block math$$
 * 3. Mixed content: Currency and math in same string
 * 4. Edge cases: Empty string, no dollar signs, end of string, Russian text
 *
 * The function prevents remark-math from misinterpreting currency amounts
 * as LaTeX inline math delimiters by escaping them with backslash.
 */

import { describe, it, expect } from 'vitest'
import { escapeCurrencyDollarSigns } from '@/components/markdown/utils/escape-currency'

describe('escapeCurrencyDollarSigns', () => {
  describe('Currency patterns (SHOULD be escaped)', () => {
    it('should escape simple currency amount: $1000', () => {
      const input = '$1000'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$1000')
    })

    it('should escape currency with comma separator: $50,000', () => {
      const input = '$50,000'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$50,000')
    })

    it('should escape currency with decimal: $99.99', () => {
      const input = '$99.99'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$99.99')
    })

    it('should escape currency with comma and decimal: $1,234.56', () => {
      const input = '$1,234.56'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$1,234.56')
    })

    it('should escape currency followed by space and text: $5 tip', () => {
      const input = '$5 tip'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$5 tip')
    })

    it('should escape multiple currency amounts in one string', () => {
      const input = 'Price: $100, Sale: $50'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Price: \\$100, Sale: \\$50')
    })

    it('should escape currency at end of string: $1000', () => {
      const input = 'Total cost: $1000'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Total cost: \\$1000')
    })

    it('should escape currency followed by punctuation: $100.', () => {
      const input = 'The price is $100.'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('The price is \\$100.')
    })

    it('should escape currency followed by comma: $99,', () => {
      const input = 'Cost $99, including tax'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Cost \\$99, including tax')
    })

    it('should escape large amounts with multiple commas: $1,000,000', () => {
      const input = '$1,000,000'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$1,000,000')
    })

    it('should escape currency with European decimal separator (comma): $99,99', () => {
      const input = '$99,99'
      const result = escapeCurrencyDollarSigns(input)

      // Note: The regex treats comma as thousands separator
      // This is expected behavior for US currency format
      expect(result).toBe('\\$99,99')
    })
  })

  describe('LaTeX math (should NOT be escaped)', () => {
    it('should NOT escape inline math: $x^2$', () => {
      const input = '$x^2$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$x^2$')
    })

    it('should NOT escape Greek letter: $\\alpha$', () => {
      const input = '$\\alpha$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$\\alpha$')
    })

    it('should NOT escape block math: $$x = 2$$', () => {
      const input = '$$x = 2$$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$$x = 2$$')
    })

    it('should NOT escape math starting with digit followed by letter: $2x + 3$', () => {
      const input = '$2x + 3$'
      const result = escapeCurrencyDollarSigns(input)

      // Math expression with variable after digit should not be escaped
      expect(result).toBe('$2x + 3$')
    })

    it('should NOT escape famous equation: $E = mc^2$', () => {
      const input = '$E = mc^2$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$E = mc^2$')
    })

    it('should NOT escape fraction: $\\frac{1}{2}$', () => {
      const input = '$\\frac{1}{2}$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$\\frac{1}{2}$')
    })

    it('should NOT escape summation: $\\sum_{i=1}^{n} i$', () => {
      const input = '$\\sum_{i=1}^{n} i$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$\\sum_{i=1}^{n} i$')
    })

    it('should NOT escape multiline block math', () => {
      const input = '$$\nx = 2\n$$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$$\nx = 2\n$$')
    })
  })

  describe('Mixed content (currency and math)', () => {
    it('should escape currency but preserve math: Cost $100 to solve $x^2 = 4$', () => {
      const input = 'Cost $100 to solve $x^2 = 4$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Cost \\$100 to solve $x^2 = 4$')
    })

    it('should escape multiple currency amounts and preserve math', () => {
      const input = 'Price $50, discount $10, formula: $E = mc^2$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Price \\$50, discount \\$10, formula: $E = mc^2$')
    })

    it('should handle currency, block math, and inline math', () => {
      const input = 'Investment $1000 yields $$P = P_0 e^{rt}$$ profit of $200'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Investment \\$1000 yields $$P = P_0 e^{rt}$$ profit of \\$200')
    })

    it('should handle Russian text with currency amounts: Инвестируя $1000 в билет для вашего CTO... $50,000', () => {
      const input = 'Инвестируя $1000 в билет для вашего CTO... $50,000'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Инвестируя \\$1000 в билет для вашего CTO... \\$50,000')
    })

    it('should handle currency in sentence with Cyrillic: Цена $100 за услугу', () => {
      const input = 'Цена $100 за услугу'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Цена \\$100 за услугу')
    })
  })

  describe('Edge cases', () => {
    it('should return empty string for empty input', () => {
      const input = ''
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('')
    })

    it('should return unchanged string with no dollar signs', () => {
      const input = 'No currency symbols here'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('No currency symbols here')
    })

    it('should handle string with only dollar sign: $', () => {
      const input = '$'
      const result = escapeCurrencyDollarSigns(input)

      // Single $ without following digits is not escaped
      expect(result).toBe('$')
    })

    it('should handle currency at absolute end of string (no space): text$100', () => {
      const input = 'text$100'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('text\\$100')
    })

    it('should NOT escape double dollar without digits: $$', () => {
      const input = '$$'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('$$')
    })

    it('should handle currency followed by newline: $100\\n', () => {
      const input = '$100\nNext line'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$100\nNext line')
    })

    it('should handle very long number with commas: $999,999,999.99', () => {
      const input = '$999,999,999.99'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$999,999,999.99')
    })

    it('should handle single digit currency: $5', () => {
      const input = 'Only $5'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Only \\$5')
    })

    it('should handle currency with multiple decimal places (unusual but valid): $1.999', () => {
      const input = '$1.999'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$1.999')
    })

    it('should NOT escape dollar followed by letter: $variable', () => {
      const input = '$variable'
      const result = escapeCurrencyDollarSigns(input)

      // Dollar followed immediately by letter is likely a variable, not currency
      expect(result).toBe('$variable')
    })

    it('should handle whitespace-only string', () => {
      const input = '   \n\t  '
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('   \n\t  ')
    })

    it('should handle currency in markdown list: - Cost: $50', () => {
      const input = '- Cost: $50\n- Price: $100'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('- Cost: \\$50\n- Price: \\$100')
    })

    it('should handle currency in markdown table cell', () => {
      const input = '| Product | Price |\n|---------|-------|\n| Item A  | $99   |'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('| Product | Price |\n|---------|-------|\n| Item A  | \\$99   |')
    })
  })

  describe('Negative test cases (should NOT be escaped)', () => {
    it('should NOT escape when dollar directly followed by word character: $abc', () => {
      const input = 'Variable $abc is defined'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Variable $abc is defined')
    })

    it('should NOT escape PHP/shell variable: $PATH', () => {
      const input = 'Set $PATH variable'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Set $PATH variable')
    })

    it('should NOT escape dollar in middle of math: $x + $y$', () => {
      const input = '$x + $y$'
      const result = escapeCurrencyDollarSigns(input)

      // Note: The first $ is followed by 'x', so not escaped
      // The second $ is preceded by space and followed by 'y', so not escaped
      expect(result).toBe('$x + $y$')
    })

    it('should NOT escape standalone dollar with spaces: $ text', () => {
      const input = '$ text'
      const result = escapeCurrencyDollarSigns(input)

      // Dollar followed by space without digit is not escaped
      expect(result).toBe('$ text')
    })
  })

  describe('Complex real-world scenarios', () => {
    it('should handle markdown with headers, currency, and math', () => {
      const input = `# Pricing

Cost: $100
Formula: $E = mc^2$
Discount: $20`

      const result = escapeCurrencyDollarSigns(input)

      expect(result).toContain('Cost: \\$100')
      expect(result).toContain('Formula: $E = mc^2$')
      expect(result).toContain('Discount: \\$20')
    })

    it('should handle code block with currency (should escape)', () => {
      const input = 'Price is $50 in code'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('Price is \\$50 in code')
    })

    it('should handle multiple paragraphs with mixed content', () => {
      const input = `Investment $1000

Calculate $\\frac{x}{y}$

Profit $500`

      const result = escapeCurrencyDollarSigns(input)

      expect(result).toContain('Investment \\$1000')
      expect(result).toContain('Calculate $\\frac{x}{y}$')
      expect(result).toContain('Profit \\$500')
    })

    it('should escape even if preceded by backslash (not idempotent)', () => {
      const input = 'Already escaped \\$100'
      const result = escapeCurrencyDollarSigns(input)

      // Lookbehind checks for preceding $, not \. So \$100 still matches.
      // This is acceptable since the function is applied only once per content.
      expect(result).toBe('Already escaped \\\\$100')
    })

    it('should handle consecutive currency amounts: $100 $200 $300', () => {
      const input = '$100 $200 $300'
      const result = escapeCurrencyDollarSigns(input)

      expect(result).toBe('\\$100 \\$200 \\$300')
    })
  })
})
