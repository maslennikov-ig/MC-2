import { expect, test } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'
const playbookId = '00000000-0000-4000-8000-000000002001'

test.describe('Career Playbook viewer editor', () => {
  test.describe('unauthenticated access', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('requires authentication before showing the viewer', async ({ page }) => {
      await page.goto(`/en/career-playbook/${playbookId}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Authorization Required' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Role Guide preview' })).not.toBeVisible()
    })
  })

  test.describe('authenticated flow', () => {
    test.use({ storageState: authenticatedStorageState })

    test('animates both reader panels and preserves their URL state', async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 900 })
      await page.goto(`/en/career-playbook/${playbookId}`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Sales Director' })).toBeVisible({
        timeout: 20000,
      })

      const contents = page.getByRole('navigation', { name: 'Role guide contents' })
      await page.getByRole('button', { name: 'Hide left panel' }).click()
      await expect(contents).toBeAttached()
      await expect(contents).not.toBeAttached()
      await expect(page).toHaveURL(/\btoc=closed\b/)

      await page.getByRole('button', { name: 'Show left panel' }).click()
      await expect(contents).toBeVisible()

      const inspector = page.getByRole('complementary', { name: 'Document inspector' })
      await page.getByRole('button', { name: 'Hide right panel' }).click()
      await expect(inspector).toBeAttached()
      await expect(inspector).not.toBeAttached()
      await expect(page).toHaveURL(/\bpanel=closed\b/)
    })

    test('persists a block edit after the viewer reloads', async ({ page }) => {
      await page.goto(`/en/career-playbook/${playbookId}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Sales Director' })).toBeVisible({
        timeout: 20000,
      })

      await page.getByRole('button', { name: 'Edit Role guide header' }).click()
      await page.getByLabel('Block markdown').fill('# Edited viewer block')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.getByText('Edited viewer block')).toBeVisible()
      await page.reload()
      await expect(page.getByText('Edited viewer block')).toBeVisible({ timeout: 20000 })
    })
  })
})
