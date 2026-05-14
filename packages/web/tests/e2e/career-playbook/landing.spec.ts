import { expect, test } from '@playwright/test'

test.describe('Career Playbook landing', () => {
  test('renders the public methodology landing and links to the constructor', async ({ page }) => {
    await page.goto('/en/career-playbook')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', {
        name: 'Turn a job description into a company operating manual',
      })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Create your Career Playbook' }).first()
    ).toHaveAttribute('href', '/en/career-playbook/new')
    await expect(page.getByText('Netflix Context over Control')).toBeVisible()
    await expect(page.getByText('26-block map')).toBeVisible()
    await expect(page.getByRole('button', { name: /Decision matrix/ })).toBeVisible()
    await expect(page.getByText(/Small discounts can move quickly/)).toBeVisible()

    await page.getByRole('button', { name: /Mission and key results/ }).click()
    await expect(page.getByText(/turns B2B pipeline into predictable revenue/)).toBeVisible()
  })
})
