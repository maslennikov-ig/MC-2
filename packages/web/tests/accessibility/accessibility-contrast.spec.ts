import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('WCAG AA Contrast Compliance - Light Theme', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to courses page
    await page.goto('http://localhost:3002/courses')
    
    // Ensure light theme is active
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    })
    
    // Wait for theme to apply
    await page.waitForTimeout(500)
  })

  test('should meet WCAG AA contrast requirements for light theme', async ({ page }) => {
    // Run axe accessibility scan focusing on contrast
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze()

    // Filter for contrast-related violations
    const contrastViolations = accessibilityScanResults.violations.filter(violation => 
      violation.id.includes('contrast') || 
      violation.id === 'color-contrast'
    )

    // Log any contrast violations for debugging
    if (contrastViolations.length > 0) {
      console.log('Contrast violations found:')
      contrastViolations.forEach(violation => {
        console.log(`- ${violation.description}`)
        violation.nodes.forEach(node => {
          console.log(`  Element: ${node.html}`)
          console.log(`  Impact: ${node.impact}`)
          console.log(`  Fix: ${node.failureSummary}`)
        })
      })
    }

    // Assert no contrast violations
    expect(contrastViolations).toHaveLength(0)
  })

  test('should check specific text elements for contrast', async ({ page }) => {
    // Check main title contrast
    const titleContrast = await page.evaluate(() => {
      const title = document.querySelector('h1')
      if (!title) return null
      
      const style = window.getComputedStyle(title)
      const bgColor = window.getComputedStyle(title.parentElement!).backgroundColor
      
      return {
        color: style.color,
        backgroundColor: bgColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight
      }
    })
    
    console.log('Title styles:', titleContrast)

    // Check card text contrast
    const cardContrast = await page.evaluate(() => {
      const card = document.querySelector('[class*="card"]')
      if (!card) return null
      
      const title = card.querySelector('h3')
      const description = card.querySelector('p')
      
      const cardBg = window.getComputedStyle(card).backgroundColor
      
      return {
        card: {
          backgroundColor: cardBg
        },
        title: title ? {
          color: window.getComputedStyle(title).color,
          fontSize: window.getComputedStyle(title).fontSize
        } : null,
        description: description ? {
          color: window.getComputedStyle(description).color,
          fontSize: window.getComputedStyle(description).fontSize
        } : null
      }
    })
    
    console.log('Card styles:', cardContrast)

    // Check button contrast
    const buttonContrast = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.slice(0, 3).map(button => {
        const style = window.getComputedStyle(button)
        return {
          text: button.textContent,
          color: style.color,
          backgroundColor: style.backgroundColor,
          border: style.border
        }
      })
    })
    
    console.log('Button styles:', buttonContrast)
  })

  test('should verify filter components contrast', async ({ page }) => {
    // Check input field contrast
    const inputContrast = await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]')
      if (!input) return null
      
      const style = window.getComputedStyle(input)
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        placeholderColor: style.getPropertyValue('--tw-placeholder-opacity')
      }
    })
    
    console.log('Input styles:', inputContrast)

    // Check select dropdown contrast
    const selectContrast = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('[role="combobox"]'))
      return selects.slice(0, 2).map(select => {
        const style = window.getComputedStyle(select)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor
        }
      })
    })
    
    console.log('Select styles:', selectContrast)
  })

  test('should check badge and status indicator contrast', async ({ page }) => {
    // Check badge contrast
    const badgeContrast = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[class*="badge"]'))
      return badges.slice(0, 3).map(badge => {
        const style = window.getComputedStyle(badge)
        return {
          text: badge.textContent,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor
        }
      })
    })
    
    console.log('Badge styles:', badgeContrast)
  })

  test('should generate accessibility report', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze()

    // Generate summary report
    const report = {
      url: page.url(),
      theme: 'light',
      timestamp: new Date().toISOString(),
      summary: {
        passes: accessibilityScanResults.passes.length,
        violations: accessibilityScanResults.violations.length,
        incomplete: accessibilityScanResults.incomplete.length,
        inapplicable: accessibilityScanResults.inapplicable.length
      },
      contrastIssues: accessibilityScanResults.violations.filter(v => 
        v.id.includes('contrast') || v.id === 'color-contrast'
      ).length,
      criticalViolations: accessibilityScanResults.violations.filter(v => 
        v.impact === 'critical' || v.impact === 'serious'
      ).map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length
      }))
    }

    console.log('\n=== WCAG AA Accessibility Report ===')
    console.log(JSON.stringify(report, null, 2))
    
    // Assert no critical violations
    expect(report.criticalViolations).toHaveLength(0)
    
    // Assert contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
    expect(report.contrastIssues).toBe(0)
  })
})

test.describe('WCAG AA Contrast Compliance - Dark Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3002/courses')
    
    // Ensure dark theme is active
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    })
    
    await page.waitForTimeout(500)
  })

  test('should meet WCAG AA contrast requirements for dark theme', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze()

    const contrastViolations = accessibilityScanResults.violations.filter(violation => 
      violation.id.includes('contrast') || 
      violation.id === 'color-contrast'
    )

    if (contrastViolations.length > 0) {
      console.log('Dark theme contrast violations:')
      contrastViolations.forEach(violation => {
        console.log(`- ${violation.description}`)
      })
    }

    expect(contrastViolations).toHaveLength(0)
  })
})