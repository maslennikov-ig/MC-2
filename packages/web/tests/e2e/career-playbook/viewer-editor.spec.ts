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
