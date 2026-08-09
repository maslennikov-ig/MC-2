import { expect, test, type Page } from '@playwright/test'

const authenticatedStorageState = './tests/.auth/user.json'
const syntheticPlaybookId = '00000000-0000-4000-8000-000000000860'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function mockFollowupTransition(page: Page) {
  const syncGate = deferred()
  const syncStarted = deferred()
  const followupGate = deferred()
  const followupStarted = deferred()
  const calls: string[] = []
  let syncCompleted = false

  await page.route('**/trpc/careerPlaybook.*', async (route) => {
    const request = route.request()
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }

    const url = new URL(request.url())
    const procedurePath = decodeURIComponent(url.pathname.split('/trpc/')[1] ?? '')
    const procedures = procedurePath.split(',')
    const results = await Promise.all(
      procedures.map(async (procedure) => {
        calls.push(procedure)

        if (procedure === 'careerPlaybook.session.start') {
          return {
            playbookId: syntheticPlaybookId,
            uiLanguage: 'ru',
            contentLanguage: 'ru',
            fixedAnswers: {
              position: { question_key: 'position', value: 'Руководитель продаж' },
              department: { question_key: 'department', value: 'sales' },
              level: { question_key: 'level', value: 'lead' },
              reporting: { question_key: 'reporting', value: 'Подчиняется CRO.' },
              team_size: { question_key: 'team_size', value: '201-1000' },
              company_stage: { question_key: 'company_stage', value: 'growth' },
              content_language: { question_key: 'content_language', value: 'ru' },
            },
            freeformDraft:
              'B2B SaaS, enterprise sales cycle, pilot before contract, strict implementation SLA.',
            businessContext: {
              mode: 'universal',
              status: 'not_started',
              digest: null,
              source_ids: [],
            },
            phase: 'business_context',
            status: 'awaiting_followups',
          }
        }

        if (procedure === 'careerPlaybook.sources.listSources') return []

        if (
          procedure === 'careerPlaybook.session.submitAnswer' ||
          procedure === 'careerPlaybook.session.saveProgress'
        ) {
          syncStarted.resolve()
          await syncGate.promise
          syncCompleted = true
          return { savedAt: '2026-08-09T00:00:00.000Z' }
        }

        if (procedure === 'careerPlaybook.generation.requestFollowups') {
          if (!syncCompleted) {
            throw new Error('Follow-up request started before session sync completed')
          }
          followupStarted.resolve()
          await followupGate.promise
          return {
            questions: [
              {
                question_id: '00000000-0000-4000-8000-000000000861',
                question_text: 'Какие KPI определяют успех руководителя продаж?',
                question_type: 'open',
                options: null,
                rationale: 'KPI делают должностную инструкцию проверяемой.',
              },
            ],
            completeness_score: 0.62,
            stop_recommendation: 'continue',
          }
        }

        throw new Error(`Unhandled synthetic Career Playbook procedure: ${procedure}`)
      })
    )

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(results.map((data) => ({ result: { data } }))),
    })
  })

  return {
    calls,
    syncStarted: syncStarted.promise,
    releaseSync: syncGate.resolve,
    followupStarted: followupStarted.promise,
    releaseFollowup: followupGate.resolve,
  }
}

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

  test.describe('synthetic Business Context transition', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('waits for session sync, then moves through follow-ups to ready', async ({ page }) => {
      const backend = await mockFollowupTransition(page)
      const invalidCspSources: string[] = []
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          /Content Security Policy.*contains an invalid source/i.test(message.text())
        ) {
          invalidCspSources.push(message.text())
        }
      })

      await page.goto('/mocks/career-playbook-followups')
      await expect(page.getByRole('heading', { name: 'Материалы и заметки' })).toBeVisible()

      const continueButton = page.getByRole('button', { name: 'Продолжить к уточнениям' })
      await expect(continueButton).toBeEnabled()
      await continueButton.click()

      await backend.syncStarted
      expect(backend.calls).not.toContain('careerPlaybook.generation.requestFollowups')
      await expect(continueButton).toBeDisabled()
      await expect(page.getByTestId('career-playbook-summary-panel')).toContainText(
        'Сохраняем изменения...'
      )

      backend.releaseSync()
      await backend.followupStarted
      await expect(page.getByRole('status')).toContainText('Готовим уточнения')

      backend.releaseFollowup()
      const followupWorkspace = page.getByTestId('career-playbook-followup-workspace')
      await expect(followupWorkspace).toBeVisible()
      await expect(
        followupWorkspace.getByText('Какие KPI определяют успех руководителя продаж?', {
          exact: true,
        })
      ).toBeVisible()
      await expect(page.getByText('Полнота: 62%', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Достаточно, сгенерируй' }).click()
      await expect(page.getByRole('heading', { name: 'Готовы создать?' })).toBeVisible()
      expect(
        backend.calls.filter(
          (procedure) => procedure === 'careerPlaybook.generation.requestFollowups'
        )
      ).toHaveLength(1)
      expect(invalidCspSources).toEqual([])
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
