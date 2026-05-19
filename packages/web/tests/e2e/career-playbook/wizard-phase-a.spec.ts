import { expect, test } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'

test.describe('Career Playbook Phase A wizard', () => {
  test.describe('unauthenticated access', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('requires authentication before showing the wizard', async ({ page }) => {
      await page.goto('/ru/career-playbook/new')
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Требуется авторизация' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Конструктор Role Guide' })).not.toBeVisible()
    })
  })

  test.describe('authenticated flow', () => {
    test.use(process.env.TOKEN ? { storageState: authenticatedStorageState } : {})

    test('answers fixed questions and resumes the local draft after reload', async ({ page }) => {
      test.skip(!process.env.TOKEN, 'TOKEN is required for authenticated Career Playbook e2e flow')

      await page.goto('/ru/career-playbook/new')
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Конструктор Role Guide' })).toBeVisible()
      await expect(page.getByLabel('Какую должность вы хотите оформить?')).toBeVisible()

      await page.getByLabel('Какую должность вы хотите оформить?').fill('Руководитель продаж')
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('radio', { name: 'Продажи / Sales' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('radio', { name: 'Lead / Team Lead (ведёт команду)' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByLabel('Кому подчиняется и есть ли подчинённые?').fill('Подчиняется CRO.')
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('radio', { name: '201-1000 человек (Established)' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()

      await expect(page.getByText('Какая стадия компании / продукта?')).not.toBeVisible()
      await expect(page.getByText('На каком языке сгенерировать Role Guide?')).toBeVisible()

      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('На каком языке сгенерировать Role Guide?')).toBeVisible()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await expect(page.getByLabel('Какую должность вы хотите оформить?')).toHaveValue(
        'Руководитель продаж'
      )

      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('button', { name: 'Завершить Phase A' }).click()

      await expect(page.getByRole('heading', { name: 'Phase A готова' })).toBeVisible()
    })
  })
})
