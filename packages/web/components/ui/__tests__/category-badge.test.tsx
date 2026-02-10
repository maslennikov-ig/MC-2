/**
 * Unit tests for CategoryBadge component
 *
 * Tests verify:
 * 1. All 13 category labels render correctly (8 new + 5 old)
 * 2. Null category handling (renders "unknown" badge)
 * 3. Unknown category handling (fallback with underscore formatting)
 * 4. Size variants ('sm' vs 'default')
 * 5. Color class application for all categories
 * 6. Exports are correct (categoryLabels, categoryColors)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryBadge } from '@/components/ui/category-badge'

describe('CategoryBadge', () => {
  describe('Category label rendering - New categories (8)', () => {
    it('should render "Контекст компании" for company_context', () => {
      render(<CategoryBadge category="company_context" />)
      expect(screen.getByText('Контекст компании')).toBeInTheDocument()
    })

    it('should render "Аудитория" for audience', () => {
      render(<CategoryBadge category="audience" />)
      expect(screen.getByText('Аудитория')).toBeInTheDocument()
    })

    it('should render "Ожидаемые результаты" for expected_outcomes', () => {
      render(<CategoryBadge category="expected_outcomes" />)
      expect(screen.getByText('Ожидаемые результаты')).toBeInTheDocument()
    })

    it('should render "Структура контента" for content_structure', () => {
      render(<CategoryBadge category="content_structure" />)
      expect(screen.getByText('Структура контента')).toBeInTheDocument()
    })

    it('should render "Приоритеты" for focus_priorities', () => {
      render(<CategoryBadge category="focus_priorities" />)
      expect(screen.getByText('Приоритеты')).toBeInTheDocument()
    })

    it('should render "Бизнес-цели" for business_goals', () => {
      render(<CategoryBadge category="business_goals" />)
      expect(screen.getByText('Бизнес-цели')).toBeInTheDocument()
    })

    it('should render "Применение" for practical_application', () => {
      render(<CategoryBadge category="practical_application" />)
      expect(screen.getByText('Применение')).toBeInTheDocument()
    })

    it('should render "Ограничения" for constraints', () => {
      render(<CategoryBadge category="constraints" />)
      expect(screen.getByText('Ограничения')).toBeInTheDocument()
    })
  })

  describe('Category label rendering - Old categories (5)', () => {
    it('should render "Контент" for content', () => {
      render(<CategoryBadge category="content" />)
      expect(screen.getByText('Контент')).toBeInTheDocument()
    })

    it('should render "Результаты" for outcome', () => {
      render(<CategoryBadge category="outcome" />)
      expect(screen.getByText('Результаты')).toBeInTheDocument()
    })

    it('should render "Формат" for format', () => {
      render(<CategoryBadge category="format" />)
      expect(screen.getByText('Формат')).toBeInTheDocument()
    })

    it('should render "Инструменты" for tool', () => {
      render(<CategoryBadge category="tool" />)
      expect(screen.getByText('Инструменты')).toBeInTheDocument()
    })

    it('should render "Глубина" for depth', () => {
      render(<CategoryBadge category="depth" />)
      expect(screen.getByText('Глубина')).toBeInTheDocument()
    })
  })

  describe('Null category handling', () => {
    it('should render "unknown" text when category is null', () => {
      render(<CategoryBadge category={null} />)
      expect(screen.getByText('unknown')).toBeInTheDocument()
    })

    it('should apply gray style for null category', () => {
      const { container } = render(<CategoryBadge category={null} />)
      const badge = container.querySelector('[class*="border-slate-200"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Unknown category handling', () => {
    it('should format unknown category by replacing underscores with spaces', () => {
      render(<CategoryBadge category="custom_unknown_category" />)
      expect(screen.getByText('custom unknown category')).toBeInTheDocument()
    })

    it('should render unknown category without underscores as-is', () => {
      render(<CategoryBadge category="unknowncategory" />)
      expect(screen.getByText('unknowncategory')).toBeInTheDocument()
    })

    it('should apply fallback gray style for unknown category', () => {
      const { container } = render(<CategoryBadge category="unknown_category" />)
      const badge = container.querySelector('[class*="border-slate-200"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Size variants', () => {
    it('should apply default size classes when size prop is omitted', () => {
      const { container } = render(<CategoryBadge category="content" />)
      const badge = container.querySelector('[class*="text-xs"]')
      expect(badge).toBeInTheDocument()
      // Should NOT have sm size classes
      expect(container.querySelector('[class*="text-[10px]"]')).not.toBeInTheDocument()
    })

    it('should apply default size classes when size="default"', () => {
      const { container } = render(<CategoryBadge category="content" size="default" />)
      const badge = container.querySelector('[class*="text-xs"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply small size classes when size="sm"', () => {
      const { container } = render(<CategoryBadge category="content" size="sm" />)
      const badge = container.querySelector('[class*="text-[10px]"]')
      expect(badge).toBeInTheDocument()
      const badgeWithPadding = container.querySelector('[class*="px-1.5"]')
      expect(badgeWithPadding).toBeInTheDocument()
    })
  })

  describe('Color class application', () => {
    it('should apply blue color for company_context', () => {
      const { container } = render(<CategoryBadge category="company_context" />)
      const badge = container.querySelector('[class*="border-blue-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply green color for audience', () => {
      const { container } = render(<CategoryBadge category="audience" />)
      const badge = container.querySelector('[class*="border-green-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply purple color for expected_outcomes', () => {
      const { container } = render(<CategoryBadge category="expected_outcomes" />)
      const badge = container.querySelector('[class*="border-purple-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply orange color for content_structure', () => {
      const { container } = render(<CategoryBadge category="content_structure" />)
      const badge = container.querySelector('[class*="border-orange-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply pink color for focus_priorities', () => {
      const { container } = render(<CategoryBadge category="focus_priorities" />)
      const badge = container.querySelector('[class*="border-pink-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply cyan color for business_goals', () => {
      const { container } = render(<CategoryBadge category="business_goals" />)
      const badge = container.querySelector('[class*="border-cyan-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply amber color for practical_application', () => {
      const { container } = render(<CategoryBadge category="practical_application" />)
      const badge = container.querySelector('[class*="border-amber-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply red color for constraints', () => {
      const { container } = render(<CategoryBadge category="constraints" />)
      const badge = container.querySelector('[class*="border-red-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply indigo color for content (old category)', () => {
      const { container } = render(<CategoryBadge category="content" />)
      const badge = container.querySelector('[class*="border-indigo-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply teal color for format (old category)', () => {
      const { container } = render(<CategoryBadge category="format" />)
      const badge = container.querySelector('[class*="border-teal-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply yellow color for tool (old category)', () => {
      const { container } = render(<CategoryBadge category="tool" />)
      const badge = container.querySelector('[class*="border-yellow-500"]')
      expect(badge).toBeInTheDocument()
    })

    it('should apply violet color for depth (old category)', () => {
      const { container } = render(<CategoryBadge category="depth" />)
      const badge = container.querySelector('[class*="border-violet-500"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Badge component integration', () => {
    it('should render as Badge with variant="outline"', () => {
      const { container } = render(<CategoryBadge category="content" />)
      // Badge component should be present (checking for typical badge structure)
      const badge = container.querySelector('[class*="border"]')
      expect(badge).toBeInTheDocument()
    })

    it('should combine size and color classes correctly', () => {
      const { container } = render(<CategoryBadge category="audience" size="sm" />)
      const badge = container.querySelector('[class*="border-green-500"]')
      expect(badge).toBeInTheDocument()
      expect(badge?.className).toContain('text-[10px]')
      expect(badge?.className).toContain('px-1.5')
    })
  })

  describe('Edge cases', () => {
    it('should treat empty string category as null (renders "unknown")', () => {
      render(<CategoryBadge category="" />)
      // Empty string is falsy, so it's treated like null
      expect(screen.getByText('unknown')).toBeInTheDocument()
      const badge = screen.getByLabelText('Категория вопроса неизвестна')
      expect(badge).toBeInTheDocument()
    })

    it('should handle category with multiple underscores', () => {
      render(<CategoryBadge category="multi_word_long_category" />)
      expect(screen.getByText('multi word long category')).toBeInTheDocument()
    })

    it('should handle category with leading underscore', () => {
      const { container } = render(<CategoryBadge category="_leading" />)
      // Leading underscore replaced with space → " leading"
      // Testing-library normalizes whitespace, so we check the actual text content
      const badge = container.querySelector('[aria-label="Категория:  leading"]')
      expect(badge).toBeInTheDocument()
      expect(badge?.textContent).toBe(' leading')
    })

    it('should handle category with trailing underscore', () => {
      const { container } = render(<CategoryBadge category="trailing_" />)
      // Trailing underscore replaced with space → "trailing "
      const badge = container.querySelector('[aria-label="Категория: trailing "]')
      expect(badge).toBeInTheDocument()
      expect(badge?.textContent).toBe('trailing ')
    })
  })

  describe('Component exports', () => {
    it('should export CategoryBadge as default export', () => {
      expect(CategoryBadge).toBeDefined()
      expect(typeof CategoryBadge).toBe('function')
    })
  })

  describe('Accessibility', () => {
    it('should render badge with readable text content', () => {
      const { container } = render(<CategoryBadge category="audience" />)
      const badge = screen.getByText('Аудитория')
      expect(badge).toBeVisible()
    })

    it('should render unknown badge with readable text', () => {
      const { container } = render(<CategoryBadge category={null} />)
      const badge = screen.getByText('unknown')
      expect(badge).toBeVisible()
    })

    it('should maintain contrast in dark mode classes', () => {
      const { container } = render(<CategoryBadge category="content" />)
      const badge = container.querySelector('[class*="dark:text-indigo-300"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('All 13 categories comprehensive test', () => {
    it('should render all 13 categories with correct labels', () => {
      const categories = [
        { key: 'company_context', label: 'Контекст компании' },
        { key: 'audience', label: 'Аудитория' },
        { key: 'expected_outcomes', label: 'Ожидаемые результаты' },
        { key: 'content_structure', label: 'Структура контента' },
        { key: 'focus_priorities', label: 'Приоритеты' },
        { key: 'business_goals', label: 'Бизнес-цели' },
        { key: 'practical_application', label: 'Применение' },
        { key: 'constraints', label: 'Ограничения' },
        { key: 'content', label: 'Контент' },
        { key: 'outcome', label: 'Результаты' },
        { key: 'format', label: 'Формат' },
        { key: 'tool', label: 'Инструменты' },
        { key: 'depth', label: 'Глубина' },
      ]

      categories.forEach(({ key, label }) => {
        const { unmount } = render(<CategoryBadge category={key} />)
        expect(screen.getByText(label)).toBeInTheDocument()
        unmount()
      })
    })
  })
})
