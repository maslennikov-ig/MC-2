import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

type Rgba = [number, number, number, number]
type SyntheticQuestion = Record<string, unknown> & {
  id: string
  status: string
  metadata: Record<string, unknown> | null
}

const courseId = '30000000-0000-4000-8000-000000000010'
const pendingQuestionId = '30000000-0000-4000-8000-000000000011'
const editableQuestionId = '30000000-0000-4000-8000-000000000012'
const systemQuestionId = '30000000-0000-4000-8000-000000000013'
const ordinaryQuestionId = '30000000-0000-4000-8000-000000000014'
const currentDecisionId = '30000000-0000-4000-8000-000000000015'
const documentA = '30000000-0000-4000-8000-000000000031'
const documentB = '30000000-0000-4000-8000-000000000032'

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
    const f = (component: number) => {
      const cube = component ** 3
      return cube > 216 / 24389 ? cube : (116 * component - 16) / (24389 / 27)
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

function evidenceMetadata(conflictId: string, currentDecision?: string) {
  return {
    schema_version: 'document-conflict-question-v1',
    subject_kind: 'claim_conflict',
    subject_key: `sha256:${conflictId}`,
    run_id: '30000000-0000-4000-8000-000000000020',
    conflict_id: conflictId,
    document_ids: [documentA, documentB],
    documents: [
      { document_id: documentA, document_name: 'Safety handbook.pdf' },
      { document_id: documentB, document_name: 'Operations guide.docx' },
    ],
    document_overflow_count: 0,
    sides: [
      {
        excerpt: `Complete the review within 24 hours. ${'Synthetic bounded context. '.repeat(12)}`,
        source_refs: [{ document_id: documentA, page_number: 12, heading_path: 'Review policy' }],
        source_ref_overflow_count: 0,
      },
      {
        excerpt: 'Complete the review within 48 hours.',
        source_refs: [{ document_id: documentB, heading_path: 'Escalation / Timing' }],
        source_ref_overflow_count: 0,
      },
    ],
    provenance_handle: `synthetic:e4:${conflictId}`,
    course_impact: 'The lesson must teach one unambiguous review deadline.',
    recommendation: 'Teach the 24-hour review window.',
    recommendation_rationale: 'The synthetic safety handbook is marked as current.',
    alternatives: ['Teach the 48-hour review window.'],
    ...(currentDecision ? { current_decision_id: currentDecision } : {}),
  }
}

function conflictQuestion(input: {
  id: string
  conflictId: string
  text: string
  status: 'pending' | 'answered'
  answerSource?: 'suggested' | 'system'
  userAnswer?: string
  currentDecision?: string
}): SyntheticQuestion {
  return {
    id: input.id,
    course_id: courseId,
    question_text: input.text,
    question_type: 'single_choice',
    question_priority: 'critical',
    question_category: 'document_conflicts',
    suggested_answers: [
      {
        text: '24 hours',
        value: `recommendation:${input.conflictId}`,
        rationale: 'Current synthetic policy',
        is_recommended: true,
      },
      {
        text: '48 hours',
        value: `alternative:${input.conflictId}:1`,
        rationale: 'Legacy synthetic guide',
      },
    ],
    user_answer: input.userAnswer ? { value: input.userAnswer } : null,
    answer_source: input.answerSource ?? null,
    status: input.status,
    metadata: evidenceMetadata(input.conflictId, input.currentDecision),
  }
}

async function mockAuthenticatedClarifyingTrpc(page: Page) {
  const expectedToken = process.env.TOKEN
  const pendingConflictId = '30000000-0000-4000-8000-000000000021'
  const editableConflictId = '30000000-0000-4000-8000-000000000022'
  const systemConflictId = '30000000-0000-4000-8000-000000000023'
  const questions: SyntheticQuestion[] = [
    conflictQuestion({
      id: pendingQuestionId,
      conflictId: pendingConflictId,
      text: 'Which deadline should the course teach?',
      status: 'pending',
    }),
    conflictQuestion({
      id: editableQuestionId,
      conflictId: editableConflictId,
      text: 'Which escalation deadline remains current?',
      status: 'answered',
      answerSource: 'suggested',
      userAnswer: '24 hours',
      currentDecision: currentDecisionId,
    }),
    conflictQuestion({
      id: systemQuestionId,
      conflictId: systemConflictId,
      text: 'Automatically resolved policy example',
      status: 'answered',
      answerSource: 'system',
      userAnswer: `recommendation:${systemConflictId}`,
      currentDecision: '30000000-0000-4000-8000-000000000016',
    }),
    {
      id: ordinaryQuestionId,
      course_id: courseId,
      question_text: 'Who is the target audience?',
      question_type: 'open',
      question_priority: 'important',
      question_category: 'audience',
      suggested_answers: [{ text: 'New managers' }],
      user_answer: { value: 'New managers' },
      answer_source: 'suggested',
      status: 'answered',
      metadata: null,
    },
  ]
  const submissions: Array<Record<string, unknown>> = []
  let approveCalls = 0
  let authenticatedCalls = 0

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: '30000000-0000-4000-8000-000000000099',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'synthetic-e4@megacampus.test',
        app_metadata: { provider: 'email' },
        user_metadata: { synthetic: true },
        identities: [],
        created_at: '2026-07-11T00:00:00.000Z',
      }),
    })
  })

  await page.route('**/trpc/clarifying.*', async (route) => {
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
    if (expectedToken && request.headers().authorization === `Bearer ${expectedToken}`) {
      authenticatedCalls += 1
    }

    const url = new URL(request.url())
    const procedurePath = decodeURIComponent(url.pathname.split('/trpc/')[1] ?? '')
    const procedures = procedurePath.split(',')
    const inputs =
      request.method() === 'POST'
        ? (request.postDataJSON() as Record<string, Record<string, unknown>>)
        : (JSON.parse(url.searchParams.get('input') ?? '{}') as Record<
            string,
            Record<string, unknown>
          >)

    const results = procedures.map((procedure, index) => {
      const input = inputs[String(index)] ?? {}
      if (procedure === 'clarifying.getQuestions') return { questions }
      if (procedure === 'clarifying.getProgress') {
        const answered = questions.filter((question) => question.status === 'answered').length
        return {
          total: questions.length,
          answered,
          skipped: 0,
          pending: questions.length - answered,
          criticalTotal: 3,
          criticalAnswered: questions.filter(
            (question) =>
              question.question_priority === 'critical' && question.status === 'answered'
          ).length,
        }
      }
      if (procedure === 'clarifying.submitAnswer') {
        submissions.push(input)
        const question = questions.find((candidate) => candidate.id === input.questionId)
        if (question) {
          question.status = 'answered'
          question.user_answer = { value: input.answer }
          question.answer_source = input.answerSource
          question.metadata = {
            ...(question.metadata ?? {}),
            current_decision_id: '30000000-0000-4000-8000-000000000017',
          }
        }
        return { success: true, canProceed: true }
      }
      if (procedure === 'clarifying.approveAndProceed') {
        approveCalls += 1
        return { success: true, jobId: 'synthetic-e4-job' }
      }
      throw new Error(`Unhandled synthetic tRPC procedure: ${procedure}`)
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(results.map((data) => ({ result: { data } }))),
    })
  })

  return {
    submissions,
    authenticatedCalls: () => authenticatedCalls,
    approveCalls: () => approveCalls,
  }
}

test.describe('E4 real ClarifyingPanel with intercepted authenticated tRPC', () => {
  test.use({ storageState: './tests/.auth/user.json' })

  test('groups, focuses, submits CAS decisions, gates progress and remains accessible', async ({
    page,
  }, testInfo) => {
    const trpc = await mockAuthenticatedClarifyingTrpc(page)
    const response = await page.goto('/mocks/document-conflicts-e4')
    expect(response?.status()).toBe(200)
    if (testInfo.project.name === 'dark-mode') {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }

    await expect(page.getByRole('region', { name: 'Document conflicts' })).toBeVisible()
    await expect(page.getByText('Other clarifying questions', { exact: true })).toHaveCount(1)
    await expect(page.getByTestId('pending-conflict-summary')).toHaveText(
      '1 required document conflict needs a decision'
    )
    await expect(page.getByRole('button', { name: 'Continue generation' })).toHaveCount(0)
    await expect.poll(trpc.authenticatedCalls).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Review the first unresolved conflict' }).click()
    const pendingCard = page.locator(`[id="clarifying-question-${pendingQuestionId}"]`)
    await expect(pendingCard).toBeFocused()

    const contrastSamples = {
      impact: await computedContrast(pendingCard.getByTestId('conflict-course-impact')),
      recommendation: await computedContrast(pendingCard.getByTestId('conflict-recommendation')),
      source: await computedContrast(pendingCard.getByTestId('conflict-source-0-0')),
      disclosure: await computedContrast(pendingCard.getByTestId('conflict-disclosure-0')),
      radioText: await computedContrast(pendingCard.getByTestId('document-option-0')),
      questionText: await computedContrast(pendingCard.getByTestId('clarifying-question-text')),
      requiredBadge: await computedContrast(pendingCard.getByTestId('document-decision-badge')),
      pendingError: await computedContrast(page.getByTestId('pending-conflict-summary')),
    }
    console.log(`[E4 ${testInfo.project.name} contrast] ${JSON.stringify(contrastSamples)}`)
    for (const ratio of Object.values(contrastSamples)) expect(ratio).toBeGreaterThanOrEqual(4.5)

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Which escalation deadline remains current?')).toBeVisible()
    await page.getByRole('button', { name: 'Edit answer' }).click()
    const editableCard = page.locator(`[id="clarifying-question-${editableQuestionId}"]`)
    await editableCard.getByRole('radio', { name: /48 hours/ }).click()
    await editableCard.getByRole('button', { name: 'Confirm changes' }).click()
    await expect.poll(() => trpc.submissions.length).toBe(1)
    expect(trpc.submissions[0]).toMatchObject({
      questionId: editableQuestionId,
      answer: '48 hours',
      answerSource: 'suggested',
      selectedSuggestionIndex: 1,
      expectedCurrentDecisionId: currentDecisionId,
    })

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Automatically resolved policy example')).toBeVisible()
    await expect(page.getByText('24 hours', { exact: true })).toBeVisible()
    await expect(page.getByText(/^recommendation:/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit answer' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(pendingCard).toBeVisible()
    const radios = pendingCard.getByRole('radio')
    await radios.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(radios.nth(1)).toBeChecked()
    await pendingCard.getByRole('button', { name: 'Confirm answer' }).click()
    await expect.poll(() => trpc.submissions.length).toBe(2)
    expect(trpc.submissions[1]).toMatchObject({
      questionId: pendingQuestionId,
      answer: '48 hours',
      answerSource: 'suggested',
      selectedSuggestionIndex: 1,
    })
    expect(trpc.submissions[1]).not.toHaveProperty('expectedCurrentDecisionId')
    await expect(page.getByTestId('pending-conflict-summary')).toHaveCount(0)
    const continueButton = page.getByRole('button', { name: 'Continue generation' })
    await expect(continueButton).toBeEnabled()

    const accessibility = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa'])
      // Axe 4.11 misreads Tailwind v4 OKLCH/Lab serialization. Structural
      // rules remain enforced; computed WCAG contrast is asserted above.
      .disableRules(['color-contrast'])
      .analyze()
    expect(accessibility.violations).toEqual([])

    await continueButton.click()
    await expect.poll(trpc.approveCalls).toBe(1)
    await page.getByRole('button', { name: 'Русский' }).click()
    await expect(
      page.getByRole('heading', { name: 'Противоречия в документах', level: 1 })
    ).toBeVisible()
  })

  test('keeps real conflict evidence usable at a mobile viewport', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only assertion')
    await mockAuthenticatedClarifyingTrpc(page)
    await page.goto('/mocks/document-conflicts-e4')

    const pendingCard = page.locator(`[id="clarifying-question-${pendingQuestionId}"]`)
    await expect(pendingCard.getByRole('radio')).toHaveCount(2)
    await expect(
      pendingCard.getByText('Safety handbook.pdf · page 12 · Review policy')
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    )
  })
})
