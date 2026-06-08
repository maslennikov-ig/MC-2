import { expect, test } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'

type HorizontalLayoutSnapshot = {
  headerLeft: number
  contentLeft: number
}

async function getHorizontalLayoutSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate<HorizontalLayoutSnapshot>(() => {
    const headerElement = document.querySelector('[data-testid="site-header"]')
    const contentElement =
      document.querySelector('main') ??
      document.querySelector('[data-testid="career-playbook-workspace"]') ??
      document.body
    const headerRect = headerElement?.getBoundingClientRect()
    const contentRect = contentElement?.getBoundingClientRect()

    return {
      headerLeft: headerRect?.left ?? Number.NaN,
      contentLeft: contentRect?.left ?? Number.NaN,
    }
  })
}

function expectNoHorizontalShift(
  before: HorizontalLayoutSnapshot,
  after: HorizontalLayoutSnapshot
) {
  expect(Math.abs(after.headerLeft - before.headerLeft)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.contentLeft - before.contentLeft)).toBeLessThanOrEqual(1)
}

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
  const beforeOpen = await getHorizontalLayoutSnapshot(page)
  await trigger.click()

  const content = page.getByTestId(ids.content)
  await expect(content).toBeVisible()
  expectNoHorizontalShift(beforeOpen, await getHorizontalLayoutSnapshot(page))

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

  await page.keyboard.press('Escape')
  await expect(content).not.toBeVisible()
  expectNoHorizontalShift(beforeOpen, await getHorizontalLayoutSnapshot(page))
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

    await expectDropdownBelowStickyHeader(page, {
      trigger: 'header-courses-menu-trigger',
      content: 'header-courses-menu',
    })

    await expectDropdownBelowStickyHeader(page, {
      trigger: 'header-language-menu-trigger',
      content: 'header-language-menu',
    })
  })

  test.describe('authenticated profile menu', () => {
    test.use({ storageState: authenticatedStorageState })

    test('keeps the profile menu visible after scrolling down', async ({ page }) => {
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
