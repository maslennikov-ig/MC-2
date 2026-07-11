import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator } from '@playwright/test'

type Rgba = [number, number, number, number]

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const alpha = (value?: string) =>
  !value ? 1 : value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value)

function parseCssColor(input: string): Rgba {
  const value = input.trim().toLowerCase()
  if (value === 'transparent') return [0, 0, 0, 0]
  const rgb = value.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean)
    const channel = (part: string) =>
      part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part) / 255
    return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha(parts[3])]
  }

  const lab = value.match(/^lab\(([^\s]+)\s+([^\s]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\)$/)
  if (lab) {
    const lightness = lab[1].endsWith('%') ? Number(lab[1].slice(0, -1)) : Number(lab[1])
    const f = (value: number) => {
      const cube = value ** 3
      return cube > 216 / 24389 ? cube : (116 * value - 16) / (24389 / 27)
    }
    const fy = (lightness + 16) / 116
    const x50 = 0.96422 * f(fy + Number(lab[2]) / 500)
    const y50 = f(fy)
    const z50 = 0.82521 * f(fy - Number(lab[3]) / 200)
    const x = 0.9555766 * x50 - 0.0230393 * y50 + 0.0631636 * z50
    const y = -0.0282895 * x50 + 1.0099416 * y50 + 0.0210077 * z50
    const z = 0.0122982 * x50 - 0.020483 * y50 + 1.3299098 * z50
    const gamma = (channel: number) =>
      clamp(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)
    return [
      gamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
      gamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
      gamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
      alpha(lab[4]),
    ]
  }

  const match = value.match(
    /^(oklab|oklch)\(([^\s]+)\s+([^\s]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\)$/
  )
  if (!match) throw new Error(`Unsupported computed CSS color: ${input}`)
  const lightness = match[2].endsWith('%') ? Number(match[2].slice(0, -1)) / 100 : Number(match[2])
  const chromaOrA = Number(match[3])
  const hueOrB = Number(match[4])
  const a = match[1] === 'oklch' ? chromaOrA * Math.cos((hueOrB * Math.PI) / 180) : chromaOrA
  const b = match[1] === 'oklch' ? chromaOrA * Math.sin((hueOrB * Math.PI) / 180) : hueOrB
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const gamma = (channel: number) =>
    clamp(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha(match[5]),
  ]
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const opacity = foreground[3] + background[3] * (1 - foreground[3])
  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / opacity,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / opacity,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / opacity,
    opacity,
  ]
}

function luminance(color: Rgba) {
  const linear = color
    .slice(0, 3)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

async function computedContrast(locator: Locator) {
  const computed = await locator.evaluate((element) => {
    const backgrounds: string[] = []
    let current: Element | null = element
    while (current) {
      backgrounds.push(window.getComputedStyle(current).backgroundColor)
      current = current.parentElement
    }
    return { color: window.getComputedStyle(element).color, backgrounds }
  })
  let background: Rgba = [1, 1, 1, 1]
  for (const value of computed.backgrounds.reverse()) {
    background = composite(parseCssColor(value), background)
  }
  const foreground = composite(parseCssColor(computed.color), background)
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2))
}

test.describe('E4 synthetic document-conflict fixture', () => {
  test('blocks manual continuation, supports keyboard choice, exposes RU and system audit', async ({
    page,
  }) => {
    const response = await page.goto('/mocks/document-conflicts-e4')
    expect(response?.status()).toBe(200)

    const continueButton = page.getByRole('button', { name: 'Continue generation' })
    await expect(continueButton).toBeDisabled()
    await expect(page.getByRole('region', { name: 'System audit' }).getByRole('radio')).toHaveCount(
      0
    )

    const manualRegion = page.getByRole('region', { name: 'Manual conflict' })
    const systemRegion = page.getByRole('region', { name: 'System audit' })
    const contrastSamples = {
      conflictBody: await computedContrast(manualRegion.getByTestId('conflict-course-impact')),
      recommendation: await computedContrast(manualRegion.getByTestId('conflict-recommendation')),
      requiredBadge: await computedContrast(manualRegion.getByTestId('document-decision-badge')),
      pendingError: await computedContrast(page.getByTestId('pending-conflict-summary')),
      systemAudit: await computedContrast(systemRegion.getByTestId('system-decision-description')),
    }
    console.log(`[E4 contrast] ${JSON.stringify(contrastSamples)}`)
    for (const ratio of Object.values(contrastSamples)) expect(ratio).toBeGreaterThanOrEqual(4.5)

    const radios = manualRegion.getByRole('radio')
    await expect(radios).toHaveCount(2)
    await radios.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(radios.nth(1)).toBeChecked()
    await manualRegion.getByRole('button', { name: 'Confirm answer' }).click()
    await expect(continueButton).toBeEnabled()

    await page.getByRole('button', { name: 'Русский' }).click()
    await expect(
      page.getByRole('heading', { name: 'Противоречия в документах', level: 1 })
    ).toBeVisible()
    await expect(page.getByText('Системное решение').first()).toBeVisible()

    const accessibility = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa'])
      // Tailwind v4 emits OKLCH colors that axe 4.11 misreads as near-white in
      // Chromium 149. Structural/name/state rules remain enforced; contrast is
      // reviewed from the captured desktop/mobile screenshots.
      .disableRules(['color-contrast'])
      .analyze()
    expect(accessibility.violations).toEqual([])
  })

  test('keeps the conflict decision usable at a mobile viewport', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only assertion')
    await page.goto('/mocks/document-conflicts-e4')

    const manualRegion = page.getByRole('region', { name: 'Manual conflict' })
    await expect(manualRegion).toBeVisible()
    await expect(manualRegion.getByRole('radio')).toHaveCount(2)
    await expect(
      manualRegion.getByText('Safety handbook.pdf · page 12 · Review policy')
    ).toBeVisible()
  })
})
