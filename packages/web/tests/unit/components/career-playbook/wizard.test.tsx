import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  CareerPlaybookFixedAnswer,
  CareerPlaybookFixedQuestion,
  CareerPlaybookFollowupAnswer,
  CareerPlaybookFollowupQuestion,
} from '@megacampus/shared-types'
import { CompletionScreen } from '@/components/career-playbook/wizard/CompletionScreen'
import { FollowupPhase } from '@/components/career-playbook/wizard/FollowupPhase'
import { FreeFormInput } from '@/components/career-playbook/wizard/FreeFormInput'
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

const followupOpenQuestion: CareerPlaybookFollowupQuestion = {
  question_id: '8a95f79e-7b1f-4d55-b50b-899dfc0ab6f0',
  question_text: 'Какие ошибки в роли особенно дорого стоят?',
  question_type: 'open',
  options: null,
  rationale: 'Помогает настроить раздел про риски и анти-паттерны.',
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

describe('FollowupPhase', () => {
  it('renders one focused follow-up at a time with completeness labels and enough CTA', async () => {
    const user = userEvent.setup()
    const handleAnswerChange = vi.fn()
    const handleForceGenerate = vi.fn()

    render(
      <FollowupPhase
        questions={[followupOpenQuestion, followupMultiChoiceQuestion]}
        answers={{}}
        currentIndex={0}
        completenessScore={0.6}
        onAnswerChange={handleAnswerChange}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onForceGenerate={handleForceGenerate}
      />
    )

    expect(screen.getByText('ИИ-уточнение 1 из 2')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Можно собрать основу')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Хорошая полнота')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Максимум контекста')).toBeInTheDocument()
    expect(screen.getByText(followupOpenQuestion.question_text)).toBeInTheDocument()
    expect(screen.queryByText(followupMultiChoiceQuestion.question_text)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(followupOpenQuestion.question_text), 'Потеря hiring bar')
    expect(handleAnswerChange).toHaveBeenLastCalledWith(
      followupOpenQuestion.question_id,
      'Потеря hiring bar'
    )

    await user.click(screen.getByRole('button', { name: 'Достаточно, сгенерируй' }))
    expect(handleForceGenerate).toHaveBeenCalledTimes(1)
  })

  it('supports skip and back/next navigation callbacks', async () => {
    const user = userEvent.setup()
    const handlePrevious = vi.fn()
    const handleNext = vi.fn()
    const handleSkip = vi.fn()

    render(
      <FollowupPhase
        questions={[followupOpenQuestion, followupMultiChoiceQuestion]}
        answers={{ [followupOpenQuestion.question_id]: 'Ответ' }}
        currentIndex={0}
        completenessScore={0.82}
        onAnswerChange={vi.fn()}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onSkip={handleSkip}
        onForceGenerate={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Пропустить' }))
    expect(handleSkip).toHaveBeenCalledWith(followupOpenQuestion.question_id)

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(handlePrevious).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(handleNext).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit answer before using Next', async () => {
    const user = userEvent.setup()
    const handleNext = vi.fn()
    const { rerender } = render(
      <FollowupPhase
        questions={[followupOpenQuestion]}
        answers={{}}
        currentIndex={0}
        completenessScore={0.6}
        onAnswerChange={vi.fn()}
        onNext={handleNext}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onForceGenerate={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    rerender(
      <FollowupPhase
        questions={[followupOpenQuestion]}
        answers={{ [followupOpenQuestion.question_id]: 'Потеря hiring bar' }}
        currentIndex={0}
        completenessScore={0.6}
        onAnswerChange={vi.fn()}
        onNext={handleNext}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
        onForceGenerate={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(handleNext).toHaveBeenCalledTimes(1)
  })
})

describe('FreeFormInput', () => {
  it('opens a textarea dialog and submits trimmed text only when text exists', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(<FreeFormInput onSubmit={handleSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Я расскажу свободно' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить текст' })).toBeDisabled()

    await user.type(screen.getByLabelText('Свободный ответ'), '  Роль строит RevOps контур  ')
    await user.click(screen.getByRole('button', { name: 'Сохранить текст' }))

    expect(handleSubmit).toHaveBeenCalledWith('Роль строит RevOps контур')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('CompletionScreen', () => {
  it('summarizes answers and exposes edit plus generate actions', async () => {
    const user = userEvent.setup()
    const handleEditFixed = vi.fn()
    const handleEditFollowup = vi.fn()
    const handleGenerate = vi.fn()
    const fixedAnswers: CareerPlaybookFixedAnswer[] = [
      {
        question_key: 'position',
        value: 'Head of Sales',
      },
    ]
    const followupAnswers: CareerPlaybookFollowupAnswer[] = [
      {
        question_id: followupOpenQuestion.question_id,
        question_text: followupOpenQuestion.question_text,
        question_type: 'open',
        value: 'Потеря hiring bar',
        skipped: false,
      },
      {
        question_id: followupMultiChoiceQuestion.question_id,
        question_text: followupMultiChoiceQuestion.question_text,
        question_type: 'multi_choice',
        skipped: true,
      },
    ]

    render(
      <CompletionScreen
        fixedAnswers={fixedAnswers}
        followupAnswers={followupAnswers}
        freeformNotes={['Роль строит RevOps контур']}
        onEditFixedAnswer={handleEditFixed}
        onEditFollowupAnswer={handleEditFollowup}
        onGenerate={handleGenerate}
      />
    )

    expect(screen.getByText('Готовы создать?')).toBeInTheDocument()
    expect(screen.getByText('Фиксированные ответы')).toBeInTheDocument()
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.getByText('Уточнения')).toBeInTheDocument()
    expect(screen.getByText('Потеря hiring bar')).toBeInTheDocument()
    expect(screen.getByText('Пропущено')).toBeInTheDocument()
    expect(screen.getByText('Свободные заметки')).toBeInTheDocument()
    expect(screen.getByText('Роль строит RevOps контур')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Редактировать position' }))
    expect(handleEditFixed).toHaveBeenCalledWith('position')

    await user.click(
      screen.getByRole('button', { name: `Редактировать ${followupOpenQuestion.question_text}` })
    )
    expect(handleEditFollowup).toHaveBeenCalledWith(followupOpenQuestion.question_id)

    await user.click(screen.getByRole('button', { name: 'Сгенерировать Role Guide' }))
    expect(handleGenerate).toHaveBeenCalledTimes(1)
  })
})
