import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  CareerPlaybookFixedQuestion,
  CareerPlaybookFollowupQuestion,
} from '@megacampus/shared-types'
import { ProgressIndicator } from '@/components/career-playbook/wizard/ProgressIndicator'
import { QuestionRenderer } from '@/components/career-playbook/wizard/QuestionRenderer'
import { Wizard } from '@/components/career-playbook/wizard/Wizard'

const fixedOpenQuestion: CareerPlaybookFixedQuestion = {
  language: 'ru',
  position: 1,
  question_key: 'position',
  question_type: 'open',
  question_text: 'Какую должность вы хотите оформить?',
  helper_text: 'Например: Product Manager',
  is_required: true,
}

const fixedSingleChoiceQuestion: CareerPlaybookFixedQuestion = {
  language: 'ru',
  position: 2,
  question_key: 'department',
  question_type: 'single_choice',
  question_text: 'Отдел или функциональная область',
  options: [
    { value: 'sales', label: 'Продажи' },
    { value: 'engineering', label: 'Инженерия / IT' },
  ],
  is_required: true,
}

const followupMultiChoiceQuestion: CareerPlaybookFollowupQuestion = {
  question_id: '0a1fcd0e-c329-4a46-91c6-7bfe881d8f7c',
  question_text: 'Какие зоны ответственности включить?',
  question_type: 'multi_choice',
  options: [
    { value: 'hiring', label: 'Найм' },
    { value: 'budgeting', label: 'Бюджетирование' },
    { value: 'coaching', label: 'Наставничество' },
  ],
  rationale: 'Уточняет управленческий контур роли.',
}

describe('ProgressIndicator', () => {
  it('renders fixed total progress with answered count and percent', () => {
    render(<ProgressIndicator answeredCount={3} currentIndex={2} totalCount={7} />)

    expect(screen.getByText('Вопрос 3 из 7')).toBeInTheDocument()
    expect(screen.getByText('Отвечено: 3')).toBeInTheDocument()
    expect(screen.getByText('43%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43')
  })

  it('supports localized question separators', () => {
    render(
      <ProgressIndicator
        answeredCount={2}
        currentIndex={1}
        totalCount={7}
        copy={{ questionLabel: 'Question', answeredLabel: 'Answered', ofLabel: 'of' }}
      />
    )

    expect(screen.getByText('Question 2 of 7')).toBeInTheDocument()
    expect(screen.getByText('Answered: 2')).toBeInTheDocument()
  })
})

describe('QuestionRenderer', () => {
  it('renders an open fixed question and emits a string answer', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedOpenQuestion}
        value=""
        onValueChange={handleValueChange}
        copy={{ openPlaceholder: 'Введите ответ' }}
      />
    )

    await user.type(screen.getByLabelText('Какую должность вы хотите оформить?'), 'Head of Sales')

    expect(handleValueChange).toHaveBeenLastCalledWith('Head of Sales')
    expect(screen.getByText('Например: Product Manager')).toBeInTheDocument()
  })

  it('renders a single-choice fixed question and emits the selected value', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedSingleChoiceQuestion}
        value=""
        onValueChange={handleValueChange}
      />
    )

    await user.click(screen.getByRole('radio', { name: 'Инженерия / IT' }))

    expect(handleValueChange).toHaveBeenCalledWith('engineering')
  })

  it('renders a multi-choice follow-up question and emits string array values', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={followupMultiChoiceQuestion}
        value={['hiring']}
        onValueChange={handleValueChange}
      />
    )

    await user.click(screen.getByRole('checkbox', { name: 'Бюджетирование' }))
    expect(handleValueChange).toHaveBeenLastCalledWith(['hiring', 'budgeting'])

    await user.click(screen.getByRole('checkbox', { name: 'Найм' }))
    expect(handleValueChange).toHaveBeenLastCalledWith(['budgeting'])
  })
})

describe('Wizard', () => {
  it('keeps navigation disabled until the current question is answered', async () => {
    const user = userEvent.setup()
    const handleAnswerChange = vi.fn()
    const handleNext = vi.fn()

    const { rerender } = render(
      <Wizard
        questions={[fixedOpenQuestion, fixedSingleChoiceQuestion]}
        answers={{}}
        currentIndex={0}
        onAnswerChange={handleAnswerChange}
        onNext={handleNext}
        onPrevious={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await user.type(screen.getByLabelText('Какую должность вы хотите оформить?'), 'CPO')
    expect(handleAnswerChange).toHaveBeenLastCalledWith('position', 'CPO')

    rerender(
      <Wizard
        questions={[fixedOpenQuestion, fixedSingleChoiceQuestion]}
        answers={{ position: 'CPO' }}
        currentIndex={0}
        onAnswerChange={handleAnswerChange}
        onNext={handleNext}
        onPrevious={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(handleNext).toHaveBeenCalledTimes(1)
  })
})
