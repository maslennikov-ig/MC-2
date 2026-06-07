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

    test('edits a block and regenerates another block through the viewer fallback', async ({
      page,
    }) => {
      await page.goto(`/en/career-playbook/${playbookId}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Sales Director' })).toBeVisible()

      await page.getByRole('button', { name: 'Edit Role guide header' }).click()
      await page.getByLabel('Block markdown').fill('# Edited viewer block')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(page.getByText('Edited viewer block')).toBeVisible()
      await expect(page.getByRole('status')).toContainText(
        'Block edit saved locally until the backend action is connected'
      )

      await page.getByRole('button', { name: 'Regenerate Mission and key results' }).click()
      await page.getByLabel('Regeneration instruction').fill('Make it specific to enterprise sales')
      await page.getByRole('button', { name: 'Regenerate block' }).click()

      await expect(page.getByRole('article', { name: 'Mission and key results' })).toContainText(
        'Make it specific to enterprise sales'
      )
      await expect(page.getByRole('status')).toContainText(
        'Block regenerated locally until the backend action is connected'
      )
    })
  })
})
