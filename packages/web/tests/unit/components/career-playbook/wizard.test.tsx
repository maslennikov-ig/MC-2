import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  CareerPlaybookFixedQuestion,
  CareerPlaybookFollowupQuestion,
} from '@megacampus/shared-types'
import { CompletionScreen } from '@/components/career-playbook/wizard/CompletionScreen'
import { FollowupPhase } from '@/components/career-playbook/wizard/FollowupPhase'
import { ProgressIndicator } from '@/components/career-playbook/wizard/ProgressIndicator'
import { QuestionRenderer } from '@/components/career-playbook/wizard/QuestionRenderer'
import { Wizard } from '@/components/career-playbook/wizard/Wizard'

const fixedOpenQuestion: CareerPlaybookFixedQuestion = {
  language: 'ru',
  position: 1,
  question_key: 'position',
  question_type: 'open',
  question_text: 'Какую должность вы хотите оформить?',
  helper_text: 'Например: менеджер продукта',
  is_required: true,
}

const fixedOpenQuestionEn: CareerPlaybookFixedQuestion = {
  ...fixedOpenQuestion,
  language: 'en',
  question_text: 'Which role are you documenting?',
  helper_text: 'For example: Product Manager',
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

const optionalSingleChoiceQuestion: CareerPlaybookFixedQuestion = {
  ...fixedSingleChoiceQuestion,
  position: 3,
  question_key: 'company_stage',
  question_text: 'Какая стадия компании / продукта?',
  is_required: false,
}

const contentLanguageQuestion: CareerPlaybookFixedQuestion = {
  language: 'ru',
  position: 6,
  question_key: 'content_language',
  question_type: 'single_choice',
  question_text: 'На каком языке сгенерировать должностную инструкцию?',
  options: [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
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
  it('uses the current step for percent while showing answered count separately', () => {
    render(<ProgressIndicator answeredCount={5} currentIndex={3} totalCount={6} />)

    expect(screen.getByText('Вопрос 4 из 6')).toBeInTheDocument()
    expect(screen.getByText('Отвечено: 5')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67')
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
  it('offers language-aware role suggestions without blocking manual role entry', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedOpenQuestion}
        value=""
        onValueChange={handleValueChange}
        copy={{
          openPlaceholder: 'Введите ответ',
          roleSuggestionsLabel: 'Подходящие роли',
          roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
          roleSuggestionsPopularLabel: 'Популярные роли',
          roleSuggestionsMatchLabel: 'Название роли',
        }}
      />
    )

    await user.click(screen.getByLabelText('Какую должность вы хотите оформить?'))
    expect(screen.getByText('Популярные роли')).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /Менеджер продукта/ })[0]).toBeInTheDocument()
    expect(screen.queryByText('Product Manager')).not.toBeInTheDocument()
    expect(handleValueChange).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Какую должность вы хотите оформить?'), 'prod')

    expect(handleValueChange).toHaveBeenLastCalledWith('prod')
    expect(screen.getByText('Подходящие роли')).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /Менеджер продукта/ })[0]).toBeInTheDocument()
    expect(screen.getByText('Product Manager')).toBeInTheDocument()
    expect(screen.getByText('Продукт')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Продукт' })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('option', { name: /Менеджер продукта/ })[0])

    expect(handleValueChange).toHaveBeenLastCalledWith('Менеджер продукта')
    expect(screen.getByLabelText('Какую должность вы хотите оформить?')).toHaveValue(
      'Менеджер продукта'
    )
  })

  it('supports keyboard selection for role suggestions', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedOpenQuestion}
        value=""
        onValueChange={handleValueChange}
        copy={{
          openPlaceholder: 'Введите ответ',
          roleSuggestionsLabel: 'Подходящие роли',
          roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
          roleSuggestionsMatchLabel: 'Название роли',
        }}
      />
    )

    await user.type(screen.getByLabelText('Какую должность вы хотите оформить?'), 'prod')
    await user.keyboard('{Enter}')

    expect(handleValueChange).toHaveBeenLastCalledWith('Менеджер продукта')
  })

  it('keeps an unmatched typed role as manual entry', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedOpenQuestion}
        value=""
        onValueChange={handleValueChange}
        copy={{
          openPlaceholder: 'Введите ответ',
          roleSuggestionsLabel: 'Подходящие роли',
          roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
          roleSuggestionsNoResultsLabel: 'Нет точного совпадения',
          roleSuggestionsManualTemplate: 'Использовать "{value}"',
        }}
      />
    )

    await user.type(
      screen.getByLabelText('Какую должность вы хотите оформить?'),
      'Chief Meme Officer'
    )

    expect(screen.getByText('Нет точного совпадения')).toBeInTheDocument()
    expect(screen.getByText('Использовать "Chief Meme Officer"')).toBeInTheDocument()

    await user.keyboard('{Enter}')

    expect(handleValueChange).toHaveBeenLastCalledWith('Chief Meme Officer')
  })

  it('renders English role suggestion chrome for English questions', async () => {
    const user = userEvent.setup()

    render(
      <QuestionRenderer
        question={fixedOpenQuestionEn}
        value=""
        onValueChange={vi.fn()}
        copy={{
          openPlaceholder: 'Type your answer',
          roleSuggestionsLabel: 'Suggested roles',
          roleSuggestionsPopularLabel: 'Popular roles',
          roleSuggestionsHint: 'Pick a close role, or keep your own title.',
          roleSuggestionsMatchLabel: 'Role title',
        }}
      />
    )

    await user.click(screen.getByLabelText('Which role are you documenting?'))

    expect(screen.getByText('Popular roles')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Product Manager/ })).toBeInTheDocument()
  })

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
    expect(screen.getByText('Например: менеджер продукта')).toBeInTheDocument()
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

  it('lets single-choice questions save a custom Other value inline', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={fixedSingleChoiceQuestion}
        value=""
        onValueChange={handleValueChange}
        copy={{
          otherOptionLabel: 'Другое',
          otherOptionPlaceholder: 'Введите свой вариант',
        }}
      />
    )

    await user.click(screen.getByRole('radio', { name: 'Другое' }))
    expect(handleValueChange).toHaveBeenLastCalledWith('')

    await user.type(screen.getByPlaceholderText('Введите свой вариант'), 'Коммерция')

    expect(handleValueChange).toHaveBeenLastCalledWith('Коммерция')
  })

  it('keeps the single-choice Other input visible when the parent owns the value', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [value, setValue] = useState('')

      return (
        <QuestionRenderer
          question={fixedSingleChoiceQuestion}
          value={value}
          onValueChange={setValue}
          copy={{
            otherOptionLabel: 'Другое',
            otherOptionPlaceholder: 'Введите свой вариант',
          }}
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('radio', { name: 'Другое' }))
    expect(screen.getByPlaceholderText('Введите свой вариант')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Введите свой вариант'), 'Коммерция')

    expect(screen.getByPlaceholderText('Введите свой вариант')).toHaveValue('Коммерция')
  })

  it('does not add Other to constrained content language choices', () => {
    render(
      <QuestionRenderer
        question={contentLanguageQuestion}
        value=""
        onValueChange={vi.fn()}
        copy={{ otherOptionLabel: 'Другое' }}
      />
    )

    expect(screen.queryByRole('radio', { name: 'Другое' })).not.toBeInTheDocument()
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

  it('lets multi-choice questions include a custom Other value inline', async () => {
    const user = userEvent.setup()
    const handleValueChange = vi.fn()

    render(
      <QuestionRenderer
        question={followupMultiChoiceQuestion}
        value={['hiring']}
        onValueChange={handleValueChange}
        copy={{
          otherOptionLabel: 'Другое',
          otherOptionPlaceholder: 'Введите свой вариант',
        }}
      />
    )

    await user.click(screen.getByRole('checkbox', { name: 'Другое' }))
    await user.type(screen.getByPlaceholderText('Введите свой вариант'), 'Планирование смен')

    expect(handleValueChange).toHaveBeenLastCalledWith(['hiring', 'Планирование смен'])
  })

  it('keeps the multi-choice Other input visible when the parent owns the value', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [value, setValue] = useState<string[]>(['hiring'])

      return (
        <QuestionRenderer
          question={followupMultiChoiceQuestion}
          value={value}
          onValueChange={setValue}
          copy={{
            otherOptionLabel: 'Другое',
            otherOptionPlaceholder: 'Введите свой вариант',
          }}
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('checkbox', { name: 'Другое' }))
    expect(screen.getByPlaceholderText('Введите свой вариант')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Введите свой вариант'), 'Планирование смен')

    expect(screen.getByPlaceholderText('Введите свой вариант')).toHaveValue('Планирование смен')
  })
})

describe('Wizard', () => {
  it('renders the document-first shell with a live draft preview', () => {
    render(
      <Wizard
        questions={[fixedOpenQuestion, fixedSingleChoiceQuestion]}
        answers={{ position: 'Менеджер по продажам' }}
        currentIndex={0}
        onAnswerChange={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
      />
    )

    expect(screen.getByTestId('career-playbook-document-shell')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-document-preview')).toHaveTextContent(
      'Менеджер по продажам'
    )
    expect(screen.getByTestId('career-playbook-question-panel')).toHaveTextContent(
      'Какую должность вы хотите оформить?'
    )
  })

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

  it('allows optional questions to be skipped without an answer', async () => {
    const user = userEvent.setup()
    const handleNext = vi.fn()

    render(
      <Wizard
        questions={[optionalSingleChoiceQuestion]}
        answers={{}}
        currentIndex={0}
        onAnswerChange={vi.fn()}
        onNext={handleNext}
        onPrevious={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Завершить' }))

    expect(handleNext).toHaveBeenCalledTimes(1)
  })

  it('does not render a separate free-form action next to primary navigation', () => {
    render(
      <Wizard
        questions={[fixedOpenQuestion]}
        answers={{ position: 'CPO' }}
        currentIndex={0}
        onAnswerChange={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Свободный ответ' })).not.toBeInTheDocument()
  })

  it('lets users reopen answered questions from the left rail', async () => {
    const user = userEvent.setup()
    const handleQuestionSelect = vi.fn()

    render(
      <Wizard
        questions={[fixedOpenQuestion, fixedSingleChoiceQuestion]}
        answers={{ position: 'CPO', department: 'sales' }}
        currentIndex={0}
        onAnswerChange={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQuestionSelect={handleQuestionSelect}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Отдел или функциональная область' }))

    expect(handleQuestionSelect).toHaveBeenCalledWith('department')
  })

  it('shows the finish action when all required questions are already answered', () => {
    render(
      <Wizard
        questions={[fixedOpenQuestion, fixedSingleChoiceQuestion]}
        answers={{ position: 'CPO', department: 'sales' }}
        currentIndex={0}
        onAnswerChange={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Завершить' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument()
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

    expect(screen.getByText('Уточнение 1 из 2')).toBeInTheDocument()
    expect(screen.queryByText(/ИИ-уточнение/)).not.toBeInTheDocument()
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0)
    expect(screen.getByText('Можно собрать основу')).toBeInTheDocument()
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    expect(screen.getByText('Хорошая полнота')).toBeInTheDocument()
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(screen.getByText('Максимум контекста')).toBeInTheDocument()
    expect(screen.getAllByText(followupOpenQuestion.question_text).length).toBeGreaterThan(0)
    expect(screen.queryByRole('checkbox', { name: 'Найм' })).not.toBeInTheDocument()

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
    const { container, rerender } = render(
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

    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Пропустить' }))
    expect(handleSkip).toHaveBeenCalledWith(followupOpenQuestion.question_id)

    rerender(
      <FollowupPhase
        questions={[followupOpenQuestion, followupMultiChoiceQuestion]}
        answers={{
          [followupOpenQuestion.question_id]: 'Ответ',
          [followupMultiChoiceQuestion.question_id]: ['risk-map'],
        }}
        currentIndex={1}
        completenessScore={0.82}
        onAnswerChange={vi.fn()}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onSkip={handleSkip}
        onForceGenerate={vi.fn()}
        handledQuestionIds={[followupOpenQuestion.question_id]}
      />
    )

    expect(container.querySelectorAll('[data-handled="true"]').length).toBeGreaterThan(0)

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

describe('CompletionScreen', () => {
  it('uses the document review shell for the final check', () => {
    render(
      <CompletionScreen
        fixedAnswers={[
          {
            id: 'position',
            title: 'Какую должность вы хотите оформить?',
            value: 'Руководитель продаж',
          },
        ]}
        followupAnswers={[]}
        freeformNotes={[]}
        onEditFixedAnswer={vi.fn()}
        onEditFollowupAnswer={vi.fn()}
        onGenerate={vi.fn()}
      />
    )

    expect(screen.getByTestId('career-playbook-review-shell')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-document-preview')).toHaveTextContent(
      'Руководитель продаж'
    )
  })

  it('summarizes answers and exposes edit plus generate actions', async () => {
    const user = userEvent.setup()
    const handleEditFixed = vi.fn()
    const handleEditFollowup = vi.fn()
    const handleGenerate = vi.fn()
    const fixedAnswers = [
      {
        id: 'position',
        title: 'Какую должность вы хотите оформить?',
        value: 'Head of Sales',
      },
      {
        id: 'department',
        title: 'Отдел или функциональная область',
        value: 'Продажи / Sales',
      },
    ]
    const followupAnswers = [
      {
        id: followupOpenQuestion.question_id,
        title: followupOpenQuestion.question_text,
        value: 'Потеря hiring bar',
        skipped: false,
      },
      {
        id: followupMultiChoiceQuestion.question_id,
        title: followupMultiChoiceQuestion.question_text,
        value: '',
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

    expect(screen.getByRole('heading', { name: 'Готовы создать?' })).toBeInTheDocument()
    expect(screen.getAllByText('Фиксированные ответы').length).toBeGreaterThan(0)
    expect(screen.getByText('Какую должность вы хотите оформить?')).toBeInTheDocument()
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.getByText('Отдел или функциональная область')).toBeInTheDocument()
    expect(screen.getByText('Продажи / Sales')).toBeInTheDocument()
    expect(screen.getAllByText('Уточнения').length).toBeGreaterThan(0)
    expect(screen.getByText('Потеря hiring bar')).toBeInTheDocument()
    expect(screen.getByText('Пропущено')).toBeInTheDocument()
    expect(screen.getAllByText('Свободные заметки').length).toBeGreaterThan(0)
    expect(screen.getByText('Роль строит RevOps контур')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Редактировать Какую должность вы хотите оформить?' })
    )
    expect(handleEditFixed).toHaveBeenCalledWith('position')

    await user.click(
      screen.getByRole('button', { name: `Редактировать ${followupOpenQuestion.question_text}` })
    )
    expect(handleEditFollowup).toHaveBeenCalledWith(followupOpenQuestion.question_id)

    await user.click(screen.getByRole('button', { name: 'Сгенерировать должностную инструкцию' }))
    expect(handleGenerate).toHaveBeenCalledTimes(1)
  })

  it('shows a completed viewer link and wraps long summary text', () => {
    const longAnswer =
      'https://example.com/role-guides/product-lead/very-long-reference-without-natural-breaks'

    render(
      <CompletionScreen
        fixedAnswers={[
          {
            id: 'position',
            title: 'Role source',
            value: longAnswer,
          },
        ]}
        followupAnswers={[]}
        freeformNotes={[longAnswer]}
        onEditFixedAnswer={vi.fn()}
        onEditFollowupAnswer={vi.fn()}
        onGenerate={vi.fn()}
        generationStatus="completed"
        viewGeneratedHref="/career-playbook/123"
        copy={{ viewGenerated: 'Open Role Guide' }}
      />
    )

    expect(screen.getByRole('link', { name: 'Open Role Guide' })).toHaveAttribute(
      'href',
      '/career-playbook/123'
    )
    expect(screen.getAllByText(longAnswer)[0]).toHaveClass('break-words')
  })
})
