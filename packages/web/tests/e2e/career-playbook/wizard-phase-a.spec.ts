import { expect, test } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'

test.describe('Career Playbook Phase A wizard', () => {
  test.describe('unauthenticated access', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('requires authentication before showing the wizard', async ({ page }) => {
      await page.goto('/career-playbook/new')
      await page.waitForLoadState('networkidle')

      await expect(
        page.getByRole('heading', { name: /Authorization Required|Требуется авторизация/ })
      ).toBeVisible()
      await expect(
        page.getByRole('heading', {
          name: /Role Guide constructor|Конструктор должностной инструкции/,
        })
      ).not.toBeVisible()
    })
  })

  test.describe('authenticated flow', () => {
    test.use({ storageState: authenticatedStorageState })

    test('answers fixed questions, resumes the draft, and saves pasted business notes', async ({
      page,
    }) => {
      test.setTimeout(90000)

      await page.goto('/ru/career-playbook/new?fresh=1')
      await page.waitForLoadState('networkidle')

      await expect(
        page.getByRole('heading', { name: 'Конструктор должностной инструкции' })
      ).toBeVisible()
      await expect(page.getByLabel('Какую должность вы хотите оформить?')).toBeVisible()

      await page.getByLabel('Какую должность вы хотите оформить?').fill('Руководитель продаж')
      await page.getByRole('button', { name: 'Далее' }).click()
      await expect(page.getByText(/Функциональная область: Продажи/)).toBeVisible()
      const levelRadio = page.getByRole('radio', { name: /Ведущий специалист/ })
      await expect(async () => {
        if (!(await levelRadio.isVisible())) {
          const nextButton = page.getByRole('button', { name: 'Далее' })
          if (await nextButton.isEnabled()) {
            await nextButton.click()
          }
        }
        await expect(levelRadio).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 15000, intervals: [500, 1000] })
      await levelRadio.click()
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByLabel('Кому подчиняется и есть ли подчинённые?').fill('Подчиняется CRO.')
      await page.getByRole('button', { name: 'Далее' }).click()
      await page.getByRole('radio', { name: /201-1000 человек/ }).click()
      await page.getByRole('button', { name: 'Далее' }).click()

      const questionWorkspace = page.getByTestId('career-playbook-question-workspace')
      await expect(questionWorkspace.getByText('Какая стадия компании / продукта?')).toBeVisible()

      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(questionWorkspace.getByText('Какая стадия компании / продукта?')).toBeVisible()
      await page.getByRole('radio', { name: /Спрос подтверждён/ }).click()
      await expect(page.getByRole('button', { name: 'Завершить базовые вопросы' })).toBeVisible()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await page.getByRole('button', { name: 'Назад' }).click()
      await expect(page.getByLabel('Какую должность вы хотите оформить?')).toHaveValue(
        'Руководитель продаж'
      )

      await page.getByRole('button', { name: 'Завершить базовые вопросы' }).click()

      await expect(page.getByTestId('career-playbook-business-context-workspace')).toContainText(
        'Материалы и заметки'
      )
      await expect(page.getByRole('heading', { name: 'Материалы и заметки' })).toBeVisible()
      await expect(page.getByTestId('career-playbook-summary-panel')).toContainText('Сводка')

      const continueButton = page.getByRole('button', { name: 'Продолжить к уточнениям' })
      const notesInput = page.getByRole('textbox', { name: 'Текст и заметки' })
      await expect(continueButton).toBeDisabled()
      await expect(notesInput).toHaveAttribute('maxlength', '20000')

      await notesInput.fill('x'.repeat(20005))
      await expect(notesInput).toHaveValue('x'.repeat(20000))
      await expect(page.locator('#career-playbook-freeform-counter')).toContainText(
        '20 000 / 20 000'
      )

      const businessNotes =
        'B2B SaaS, enterprise sales cycle, pilot before contract, strict implementation SLA.'
      await notesInput.fill(businessNotes)
      await expect(continueButton).toBeEnabled()
      await expect(page.locator('#career-playbook-freeform-counter')).toContainText('/ 20 000')

      await page.waitForTimeout(6000)
      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Материалы и заметки' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Текст и заметки' })).toHaveValue(
        businessNotes
      )

      await page.getByRole('textbox', { name: 'Текст и заметки' }).fill('')
      await page.waitForTimeout(6000)
      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('textbox', { name: 'Текст и заметки' })).toHaveValue('')
      await expect(page.getByRole('button', { name: 'Продолжить к уточнениям' })).toBeDisabled()

      await page.getByRole('textbox', { name: 'Текст и заметки' }).fill(businessNotes)
      await expect(page.getByRole('button', { name: 'Продолжить к уточнениям' })).toBeEnabled()

      await page.getByRole('button', { name: 'Продукт' }).click()
      await expect(page.getByRole('heading', { name: 'Продукт' })).toBeVisible()
      await page.getByRole('textbox', { name: 'Продукт' }).fill('B2B SaaS platform')

      await page.waitForTimeout(6000)
      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Материалы и заметки' })).toBeVisible()
      await page.getByRole('button', { name: 'Продукт' }).click()
      await expect(page.getByRole('textbox', { name: 'Продукт' })).toHaveValue('B2B SaaS platform')
    })
  })
})
