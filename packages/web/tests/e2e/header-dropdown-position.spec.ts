import { expect, test } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'

async function expectDropdownBelowStickyHeader(
  page: import('@playwright/test').Page,
  ids: {
    trigger: string
    content: string
  }
) {
  const header = page.getByTestId('site-header')
  const trigger = page.getByTestId(ids.trigger)

  await expect(header).toBeVisible()
  await trigger.click()

  const content = page.getByTestId(ids.content)
  await expect(content).toBeVisible()

  const geometry = await page.evaluate(
    ({ contentTestId }) => {
      const headerElement = document.querySelector('[data-testid="site-header"]')
      const contentElement = document.querySelector(`[data-testid="${contentTestId}"]`)
      const headerRect = headerElement?.getBoundingClientRect()
      const contentRect = contentElement?.getBoundingClientRect()

      return {
        headerTop: headerRect?.top ?? Number.NaN,
        headerBottom: headerRect?.bottom ?? Number.NaN,
        contentTop: contentRect?.top ?? Number.NaN,
        contentBottom: contentRect?.bottom ?? Number.NaN,
        viewportHeight: window.innerHeight,
      }
    },
    { contentTestId: ids.content }
  )

  expect(geometry.headerTop).toBeGreaterThanOrEqual(-1)
  expect(geometry.headerTop).toBeLessThanOrEqual(1)
  expect(geometry.contentTop).toBeGreaterThanOrEqual(geometry.headerBottom - 1)
  expect(geometry.contentBottom).toBeLessThanOrEqual(geometry.viewportHeight)
}

test.describe('Header dropdown positioning', () => {
  test('keeps sticky header product menus visible after scrolling down', async ({ page }) => {
    await page.goto('/en/courses')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => window.scrollTo(0, Math.max(600, document.body.scrollHeight / 2)))

    await expectDropdownBelowStickyHeader(page, {
      trigger: 'header-role-guides-menu-trigger',
      content: 'header-role-guides-menu',
    })

    await page.keyboard.press('Escape')

    await expectDropdownBelowStickyHeader(page, {
      trigger: 'header-courses-menu-trigger',
      content: 'header-courses-menu',
    })
  })

  test.describe('authenticated profile menu', () => {
    test.use(process.env.TOKEN ? { storageState: authenticatedStorageState } : {})

    test('keeps the profile menu visible after scrolling down', async ({ page }) => {
      test.skip(!process.env.TOKEN, 'TOKEN is required for authenticated header profile e2e flow')

      await page.goto('/en/courses')
      await page.waitForLoadState('networkidle')

      await page.evaluate(() => window.scrollTo(0, Math.max(600, document.body.scrollHeight / 2)))

      await expectDropdownBelowStickyHeader(page, {
        trigger: 'header-profile-menu-trigger',
        content: 'header-profile-menu',
      })
    })
  })
})
