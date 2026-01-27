# UX Research: Clarifying Questions v2 - Multi-Type Question Support

**Date:** 2026-01-27
**Researcher:** research-specialist
**Status:** Complete
**Project:** MegaCampus Course Generation Platform

---

## Executive Summary

This UX research document provides comprehensive recommendations for expanding the Clarifying Questions functionality to support three question types: **open** (recommended + free input), **single_choice** (select one), and **multi_choice** (select multiple). Based on industry best practices, WCAG accessibility standards, and mobile-first design principles, this document addresses current UX issues including immediate submission without confirmation, inability to edit answers, and lack of visual differentiation between question types.

**Key Findings:**

- Two-phase selection (select → confirm) is recommended for single/multi-choice to prevent accidental submissions
- Inline editing patterns enable answer modification without navigation disruption
- Visual affordances (radio buttons, checkboxes, text inputs) must follow 40+ years of UI conventions
- Touch targets must meet WCAG 2.5.8 minimum (44×44px recommended, 24×24px legal minimum)
- Question type indicators improve cognitive load and user confidence

---

## Research Methodology

This research analyzed five key areas through web search:

1. **Survey Design Best Practices** - Multiple choice, single choice, and open-ended question patterns
2. **Two-Phase Selection Patterns** - When to require confirmation before submission
3. **Inline Editing Patterns** - Best practices for editing form responses
4. **Mobile-First & Accessibility** - WCAG touch target sizes and responsive design
5. **Visual Affordances** - Form field differentiation strategies

---

## Current State Analysis

### Existing Implementation (QuestionCard.tsx)

**Current Behavior:**

- Click on suggestion → immediately saves (no confirmation)
- Three modes: `select`, `modify`, `custom`
- "Скорректировать" button appears after selection (but answer already submitted)
- All questions look identical regardless of type

**Current Problems:**

1. **No undo mechanism** - Accidental clicks immediately submit answers
2. **Confusing edit flow** - "Modify" button appears after answer is already saved
3. **Lack of visual differentiation** - All questions use same button-based interface
4. **Mobile usability concerns** - Buttons may be too small for touch targets

### User Flow Issues

```
Current Flow (BROKEN):
1. User clicks suggestion → Answer IMMEDIATELY saved
2. "Скорректировать" button appears
3. User clicks "Modify" → Opens textarea
4. User edits → Saves modified answer (now has 2 submissions)

Problem: Steps 1-2 happen too fast, no chance to reconsider
```

---

## Research Findings

### 1. Survey Design Best Practices

**Source:** [Multiple Choice Questions in Surveys - Polling.com](https://blog.polling.com/multiple-choice-questions-in-surveys-types-examples-and-best-practices/), [Multiple-choice survey questions - Jotform](https://www.jotform.com/blog/multiple-choice-survey-questions/)

#### Open-Ended Questions

- Best for collecting qualitative data and detailed feedback
- Allow respondents to share knowledge in their own words
- More complex to analyze but provide richer context
- **UX Recommendation:** Provide suggested answers as "starting points" users can accept or modify

#### Single Choice Questions

- Use **radio buttons** for mutually exclusive options
- Limit to one selection per question
- Best for binary questions, ratings, or nominal classifications
- **UX Recommendation:** Clear visual indicator (circular radio buttons) that only one option allowed

#### Multiple Choice Questions

- Use **checkboxes** for non-exclusive options
- Clearly communicate that multiple selections are allowed
- Consider restricting maximum selections if needed
- **UX Recommendation:** Add helper text "Выберите один или несколько вариантов"

#### Key Insights

- **Language clarity:** Use simple, unambiguous language; avoid jargon
- **Mutually exclusive options:** Answer choices must be clear and non-overlapping
- **"Other" option:** Always provide escape hatch for unexpected answers
- **Randomization:** Avoid order bias by randomizing option order (low priority for our use case)

---

### 2. Two-Phase Selection Pattern

**Source:** [Checkbox UX Best Practices - Eleken](https://www.eleken.co/blog-posts/checkbox-ux), [Confirmation Dialogs - Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/)

#### When to Use Confirmation Patterns

**Use two-phase selection (select → confirm) when:**

- Actions have significant consequences (e.g., submitting course generation data)
- Reversing the action is costly or impossible
- User might accidentally click wrong option (mobile touch targets)
- Decision requires review before commitment

**Use immediate action (no confirmation) when:**

- Changes are easily reversible (e.g., toggles, preferences)
- Actions have no serious consequences
- Confirmation would be "clunky" (e.g., turning on Bluetooth)

**Recommendation for Clarifying Questions:**
✅ **Use two-phase selection** - Course generation is high-impact; wrong answers waste time/resources

#### Recommended Interaction Flow

```
New Flow (FIXED):
1. User clicks suggestion → Visual selection (highlighted, not saved)
2. User reviews selection → Can change mind, select different option
3. User clicks "Подтвердить ответ" → Answer saved to backend
4. Answer displayed as "locked" with "Изменить" button

Edit Flow:
1. User clicks "Изменить" on locked answer
2. Question returns to selection mode with current answer pre-selected
3. User modifies selection or switches to custom input
4. User clicks "Подтвердить изменения" → Updated answer saved
```

**Key Benefit:** Separates selection (low commitment) from submission (high commitment)

---

### 3. Inline Editing Patterns

**Source:** [Form Design Best Practices - DesignStudioUIUX](https://www.designstudiouiux.com/blog/form-ux-design-best-practices/), [Inline Editing Implementation - Apiko](https://apiko.com/blog/inline-editing/)

#### Core Principles

**Inline editing enables users to:**

- Edit content directly on the same page (no navigation)
- See changes reflected immediately in real-time
- Save or discard updates with explicit controls

**Best Practices:**

1. **Visual mode switching:** Clear distinction between "read mode" and "edit mode"
2. **Save/Cancel always visible:** Users need explicit control over changes
3. **Real-time preview:** Show impact of edits before committing
4. **Inline validation:** Validate 500ms after user stops typing (not keystroke-by-keystroke)

#### Recommended States for Clarifying Questions

**State 1: Unanswered (Selection Mode)**

- Show all answer options
- Enable selection interaction
- Display "Подтвердить ответ" button (disabled until selection made)

**State 2: Answered (Read Mode)**

- Show green "locked" answer badge
- Display current answer text
- Show "Изменить" button

**State 3: Editing (Edit Mode)**

- Return to selection interface with current answer pre-selected
- Change confirm button to "Подтвердить изменения"
- Add "Отмена" button to revert to read mode

---

### 4. Mobile-First & WCAG Touch Target Sizes

**Source:** [WCAG 2.5.8 Target Size Implementation - AllAccessible](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide), [Accessible Touch Target Sizes - Smashing Magazine](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)

#### WCAG Standards (2026)

| Standard                  | Size    | Level | Status             |
| ------------------------- | ------- | ----- | ------------------ |
| **WCAG 2.5.8** (Minimum)  | 24×24px | AA    | Legal minimum      |
| **WCAG 2.5.5** (Enhanced) | 44×44px | AAA   | Recommended        |
| **Apple iOS**             | 44×44pt | -     | Platform guideline |
| **Google Android**        | 48×48dp | -     | Platform guideline |
| **Microsoft**             | 44×44px | -     | Platform guideline |

#### Recommendations for Clarifying Questions

**Touch Target Sizes:**

- **Buttons (Подтвердить, Изменить, Отмена):** 44×44px minimum
- **Checkboxes/Radio buttons:** 44×44px tap area (visual element can be smaller with padding)
- **Suggestion cards:** Full width, 48px minimum height
- **Text input fields:** 44px minimum height

**Mobile-First Responsive Design:**

```css
/* Mobile (default) */
.answer-option {
  min-height: 48px;
  padding: 12px 16px;
  touch-action: manipulation; /* Prevents double-tap zoom */
}

.button-primary {
  min-width: 44px;
  min-height: 44px;
  padding: 12px 20px;
}

/* Desktop (min-width: 768px) */
@media (min-width: 768px) {
  .answer-option {
    min-height: 40px; /* Can be smaller on desktop */
  }
}
```

**Key Insight:** Always design for mobile first, then enhance for desktop. Touch targets are critical for accessibility.

---

### 5. Visual Affordances for Form Field Types

**Source:** [Input Field Design - Eleken](https://www.eleken.co/blog-posts/input-field-design), [Radio Button vs Checkbox - IvyForms](https://ivyforms.com/blog/radio-button-vs-checkbox/)

#### Critical UI Conventions (40+ Years)

**DO NOT violate these conventions:**

- ⭕ **Radio buttons = CIRCLES** (single selection)
- ☑️ **Checkboxes = SQUARES** (multiple selection)
- 📝 **Text inputs = RECTANGULAR FIELDS** (free text entry)

**Why conventions matter:**

> "Making checkboxes circular or radio buttons square breaks 40+ years of UI convention, and users won't understand behavior."
> — Source: [Input Field Design - Eleken](https://www.eleken.co/blog-posts/input-field-design)

#### Visual Differentiation Strategy

Each question type MUST have distinct visual identity:

**1. Open Questions (Recommended + Free Input)**

- Show suggested answers as **highlighted text pills** (not radio buttons)
- Include textarea for custom input
- Label: "💡 Рекомендуемый ответ (можно изменить)"

**2. Single Choice (Select One)**

- Use **circular radio buttons** (native HTML `<input type="radio">`)
- Label: "⭕ Выберите один вариант"
- Only one option can be selected at a time

**3. Multi Choice (Select Multiple)**

- Use **square checkboxes** (native HTML `<input type="checkbox">`)
- Label: "☑️ Выберите один или несколько вариантов"
- Multiple options can be selected simultaneously

---

## UX Recommendations by Question Type

### Type 1: Open Questions (Recommended + Free Input)

**Purpose:** Provide AI-suggested answer as starting point, allow free-form customization

#### Wireframe (ASCII Art)

```
┌─────────────────────────────────────────────────────────────┐
│ 💡 ОТКРЫТЫЙ ВОПРОС                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🔴 ОБЯЗАТЕЛЬНЫЙ                                             │
│                                                             │
│ Какова основная цель вашего курса?                          │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 💡 Рекомендуемый ответ (можно изменить):            │   │
│ │                                                     │   │
│ │ ┌─────────────────────────────────────────────────┐ │   │
│ │ │ Обучить студентов основам программирования на   │ │   │
│ │ │ Python для решения практических задач           │ │   │
│ │ └─────────────────────────────────────────────────┘ │   │
│ │                                                     │   │
│ │ [ Принять ]  [ Изменить ]                          │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ✏️ Или введите свой вариант:                        │   │
│ │                                                     │   │
│ │ ┌─────────────────────────────────────────────────┐ │   │
│ │ │ [Textarea для свободного ввода]                 │ │   │
│ │ │                                                  │ │   │
│ │ │                                                  │ │   │
│ │ └─────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Подтвердить ответ ]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER ANSWERING:
┌─────────────────────────────────────────────────────────────┐
│ 💡 ОТКРЫТЫЙ ВОПРОС                       ✅ Отвечено        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🔴 ОБЯЗАТЕЛЬНЫЙ                                             │
│                                                             │
│ Какова основная цель вашего курса?                          │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ✅ Ваш ответ:                                       │   │
│ │                                                     │   │
│ │ Обучить студентов основам программирования на Python │   │
│ │ для решения практических задач в области анализа   │   │
│ │ данных                                              │   │
│ │                                                     │   │
│ │ 📝 Источник: Изменён (suggested → modified)         │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Изменить ответ ]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Interaction Flow

**Initial State:**

1. Display recommended answer in highlighted box (light purple background)
2. Show two action buttons: "Принять" (accept as-is) and "Изменить" (modify)
3. Show textarea section below for custom input

**User Actions:**

- **Clicks "Принять"** → Enable "Подтвердить ответ" button (two-phase)
- **Clicks "Изменить"** → Populate textarea with suggested text, auto-focus cursor
- **Types in textarea** → Clear suggestion selection, enable "Подтвердить ответ"

**After Submission:**

- Lock answer in green success box
- Show answer source: "Принят" (accepted), "Изменён" (modified), or "Свой вариант" (custom)
- Display "Изменить ответ" button

**Touch Target Requirements:**

- Suggestion box: Full width, 48px minimum height
- Action buttons: 44×44px each
- Textarea: Full width, 120px minimum height

---

### Type 2: Single Choice (Select One)

**Purpose:** User must choose exactly one option from mutually exclusive choices

#### Wireframe (ASCII Art)

```
┌─────────────────────────────────────────────────────────────┐
│ ⭕ ВЫБОР ОДНОГО ВАРИАНТА                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🟡 ВАЖНЫЙ                                                   │
│                                                             │
│ Какой уровень сложности курса вы предпочитаете?             │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⭕ Начальный (без предварительных знаний)           │   │
│ │   Подходит для студентов без опыта программирования│   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⚪ Средний (базовые знания программирования)        │   │
│ │   Требуется понимание переменных и функций         │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⚪ Продвинутый (опыт 1+ год)                        │   │
│ │   Требуется знание ООП и структур данных           │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⚪ Другое (укажите):                                │   │
│ │   ┌───────────────────────────────────────────────┐ │   │
│ │   │ [Text input для custom варианта]              │ │   │
│ │   └───────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Подтвердить выбор ] (disabled until selection)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER SELECTION (before confirmation):
┌─────────────────────────────────────────────────────────────┐
│ ⭕ ВЫБОР ОДНОГО ВАРИАНТА                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🟡 ВАЖНЫЙ                                                   │
│                                                             │
│ Какой уровень сложности курса вы предпочитаете?             │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⭕ Начальный (без предварительных знаний)           │   │◄─ SELECTED
│ │   Подходит для студентов без опыта программирования│   │  (purple border)
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⚪ Средний (базовые знания программирования)        │   │
│ │   Требуется понимание переменных и функций         │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ⚪ Продвинутый (опыт 1+ год)                        │   │
│ │   Требуется знание ООП и структур данных           │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Подтвердить выбор ] ← NOW ENABLED (purple primary)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER CONFIRMATION:
┌─────────────────────────────────────────────────────────────┐
│ ⭕ ВЫБОР ОДНОГО ВАРИАНТА                  ✅ Отвечено        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🟡 ВАЖНЫЙ                                                   │
│                                                             │
│ Какой уровень сложности курса вы предпочитаете?             │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ✅ Ваш выбор:                                       │   │
│ │                                                     │   │
│ │ Начальный (без предварительных знаний)             │   │
│ │ Подходит для студентов без опыта программирования  │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Изменить выбор ]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Interaction Flow

**Initial State:**

1. Display all options with empty radio buttons (⚪)
2. "Подтвердить выбор" button disabled (gray)
3. Helper text: "Выберите один вариант"

**User Actions:**

- **Clicks option** → Radio button fills (⭕), option card gets purple border, button enables
- **Clicks different option** → Previous selection clears, new option selected (mutual exclusion)
- **Selects "Другое"** → Text input appears, auto-focused

**Two-Phase Confirmation:**

- Selection highlights option (visual only, not saved)
- "Подтвердить выбор" button becomes primary (purple)
- User can change selection before confirming
- Click "Подтвердить" → Save to backend, transition to answered state

**After Confirmation:**

- Lock answer in green success box
- Show selected option text + rationale
- Display "Изменить выбор" button

**Touch Target Requirements:**

- Each option card: Full width, 56px minimum height
- Radio button tap area: 44×44px (visual circle can be 20px with padding)
- Confirm button: 44×44px minimum

**Visual Conventions:**

- ✅ Use circular radio buttons (HTML `<input type="radio">`)
- ✅ Only one option can be selected at a time
- ✅ Native browser behavior for keyboard navigation (arrow keys)

---

### Type 3: Multi Choice (Select Multiple)

**Purpose:** User can select one, several, or all options (non-exclusive)

#### Wireframe (ASCII Art)

```
┌─────────────────────────────────────────────────────────────┐
│ ☑️ ВЫБОР НЕСКОЛЬКИХ ВАРИАНТОВ                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚪ ЖЕЛАТЕЛЬНЫЙ                                               │
│                                                             │
│ Какие форматы контента включить в курс?                     │
│ (Выберите один или несколько вариантов)                     │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Текстовые уроки                                   │   │
│ │   Подробные статьи с примерами и иллюстрациями     │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Видео-лекции                                      │   │
│ │   Записанные видео с объяснениями и демонстрациями │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Интерактивные упражнения                          │   │
│ │   Практические задания с автоматической проверкой  │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Тесты и квизы                                     │   │
│ │   Проверка знаний после каждого модуля             │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Другое (укажите):                                 │   │
│ │   ┌───────────────────────────────────────────────┐ │   │
│ │   │ [Text input для custom варианта]              │ │   │
│ │   └───────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Подтвердить выбор ] (disabled until ≥1 selected)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER SELECTION (before confirmation):
┌─────────────────────────────────────────────────────────────┐
│ ☑️ ВЫБОР НЕСКОЛЬКИХ ВАРИАНТОВ                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚪ ЖЕЛАТЕЛЬНЫЙ                                               │
│                                                             │
│ Какие форматы контента включить в курс?                     │
│ (Выбрано: 2 варианта)                              ← COUNT │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☑ Текстовые уроки                                   │   │◄─ CHECKED
│ │   Подробные статьи с примерами и иллюстрациями     │   │  (purple border)
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Видео-лекции                                      │   │
│ │   Записанные видео с объяснениями и демонстрациями │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☑ Интерактивные упражнения                          │   │◄─ CHECKED
│ │   Практические задания с автоматической проверкой  │   │  (purple border)
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ☐ Тесты и квизы                                     │   │
│ │   Проверка знаний после каждого модуля             │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Подтвердить выбор ] ← NOW ENABLED (purple primary)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER CONFIRMATION:
┌─────────────────────────────────────────────────────────────┐
│ ☑️ ВЫБОР НЕСКОЛЬКИХ ВАРИАНТОВ             ✅ Отвечено        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚪ ЖЕЛАТЕЛЬНЫЙ                                               │
│                                                             │
│ Какие форматы контента включить в курс?                     │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ ✅ Ваш выбор (2 варианта):                          │   │
│ │                                                     │   │
│ │ • Текстовые уроки                                   │   │
│ │   Подробные статьи с примерами и иллюстрациями     │   │
│ │                                                     │   │
│ │ • Интерактивные упражнения                          │   │
│ │   Практические задания с автоматической проверкой  │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ [ Изменить выбор ]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Interaction Flow

**Initial State:**

1. Display all options with empty checkboxes (☐)
2. "Подтвердить выбор" button disabled (gray)
3. Helper text: "Выберите один или несколько вариантов"

**User Actions:**

- **Clicks option** → Checkbox checks (☑), option card gets purple border, counter updates
- **Clicks another option** → Both remain checked (non-exclusive)
- **Clicks checked option** → Unchecks, counter decrements
- **Minimum 1 selection required** → Button enables when ≥1 selected

**Two-Phase Confirmation:**

- Selections accumulate (visual only, not saved)
- Live counter shows "Выбрано: N вариантов"
- "Подтвердить выбор" button enables when ≥1 selected
- User can toggle selections before confirming
- Click "Подтвердить" → Save all selections to backend

**After Confirmation:**

- Lock answer in green success box
- Show all selected options as bulleted list
- Display "Изменить выбор" button

**Touch Target Requirements:**

- Each option card: Full width, 56px minimum height
- Checkbox tap area: 44×44px (visual square can be 20px with padding)
- Confirm button: 44×44px minimum

**Visual Conventions:**

- ✅ Use square checkboxes (HTML `<input type="checkbox">`)
- ✅ Multiple options can be checked simultaneously
- ✅ Native browser behavior for keyboard navigation (spacebar toggles)

**Advanced Feature (Optional):**

- Add "min/max selections" constraint (e.g., "Select 2-4 options")
- Display constraint in helper text: "Выберите от 2 до 4 вариантов"
- Disable confirm button until constraint satisfied

---

## Cross-Cutting UX Patterns

### 1. Two-Phase Confirmation Pattern (Universal)

**Applied to ALL question types:**

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: SELECTION                        │
│                                                              │
│ User interacts with options (click, type, check)            │
│ → Visual feedback (highlight, border, fill)                 │
│ → NO backend save yet                                       │
│ → "Подтвердить" button becomes enabled & primary (purple)   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    PHASE 2: CONFIRMATION                     │
│                                                              │
│ User clicks "Подтвердить ответ/выбор"                       │
│ → Backend API call (mutation)                               │
│ → Loading state (spinner in button)                         │
│ → Success: Transition to "answered" state                   │
│ → Error: Show toast, remain in selection mode               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Benefits:**

- Prevents accidental submissions
- Gives users time to review before committing
- Reduces backend load (only 1 API call per question)
- Improves perceived control and confidence

**Button States:**

```
Disabled (no selection):   [ Подтвердить ответ ]  (gray, cursor not-allowed)
Enabled (has selection):   [ Подтвердить ответ ]  (purple, cursor pointer)
Loading (submitting):      [ ⏳ Сохранение... ]    (purple, spinner, disabled)
```

---

### 2. Edit Mode Pattern (Universal)

**Applied to ALL answered questions:**

```
┌─────────────────────────────────────────────────────────────┐
│                   ANSWERED STATE (Read Mode)                 │
│                                                              │
│ ✅ Ваш ответ:                                                │
│ [Locked answer text displayed in green box]                 │
│                                                              │
│ 📝 Источник: [suggested/modified/custom]                     │
│                                                              │
│ [ Изменить ответ ]  ← Click to enter edit mode              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                   EDIT MODE (Selection Mode)                 │
│                                                              │
│ [Return to original selection interface]                    │
│ [Current answer pre-selected/pre-filled]                    │
│                                                              │
│ [ Подтвердить изменения ]  [ Отмена ]                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Edit Flow Details:**

**Step 1: User clicks "Изменить ответ"**

- Transition from read mode to edit mode
- Pre-populate previous answer:
  - **Open:** Fill textarea with previous text
  - **Single:** Pre-select previous radio button
  - **Multi:** Pre-check previous checkboxes

**Step 2: User modifies selection**

- Any change enables "Подтвердить изменения" button
- "Отмена" button always visible (returns to read mode without saving)

**Step 3: User confirms or cancels**

- **Click "Подтвердить изменения"** → API call to update answer, return to read mode
- **Click "Отмена"** → Discard changes, return to read mode with original answer

**Visual Differentiation:**

- Read mode: Green border (emerald-500), checkmark icon
- Edit mode: Purple border (purple-500), same as unanswered state

---

### 3. Priority Visual System

**Maintain existing priority colors** (they work well):

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 ОБЯЗАТЕЛЬНЫЙ (critical)                                   │
│ Border: 4px solid red-500 (left), red-50 background         │
│ Icon: AlertCircle (red)                                     │
│ Cannot skip, required for "Продолжить генерацию"            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🟡 ВАЖНЫЙ (important)                                        │
│ Border: 4px solid amber-500 (left), amber-50 background     │
│ Icon: AlertTriangle (amber)                                 │
│ Recommended but not blocking                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ⚪ ЖЕЛАТЕЛЬНЫЙ (nice_to_have)                                │
│ Border: 4px dashed slate-300 (left), slate-50 background    │
│ Icon: Info (slate)                                          │
│ Optional, can be skipped                                    │
└─────────────────────────────────────────────────────────────┘
```

**No changes needed** - Priority system is already optimal.

---

### 4. Question Type Header Icons

**Add visual indicator at top of each question card:**

```typescript
const questionTypeConfig = {
  open: {
    icon: Lightbulb, // 💡
    label: 'ОТКРЫТЫЙ ВОПРОС',
    color: 'text-blue-600',
    description: 'Рекомендуемый ответ (можно изменить)',
  },
  single_choice: {
    icon: CircleDot, // ⭕ or RadioButtonChecked
    label: 'ВЫБОР ОДНОГО ВАРИАНТА',
    color: 'text-purple-600',
    description: 'Выберите один вариант',
  },
  multi_choice: {
    icon: CheckSquare, // ☑️
    label: 'ВЫБОР НЕСКОЛЬКИХ ВАРИАНТОВ',
    color: 'text-indigo-600',
    description: 'Выберите один или несколько вариантов',
  },
};
```

**Visual Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ 💡 ОТКРЫТЫЙ ВОПРОС                                          │ ← Type indicator
│ 🔴 ОБЯЗАТЕЛЬНЫЙ                                             │ ← Priority badge
│                                                             │
│ [Question text]                                             │
│ [Рекомендуемый ответ (можно изменить)]                     │ ← Type helper text
│                                                             │
│ [Question-specific UI]                                      │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**

- Immediate visual recognition of question type
- Reduces cognitive load (users know what to expect)
- Complements priority system (type + priority = full context)

---

### 5. Accessibility & Keyboard Navigation

**WCAG 2.1 Level AA Compliance:**

#### Focus Management

```css
/* Visible focus indicator for keyboard navigation */
.answer-option:focus-visible {
  outline: 2px solid purple-500;
  outline-offset: 2px;
}

/* Skip links for screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  clip: rect(0, 0, 0, 0);
}
```

#### Keyboard Shortcuts

- **Tab:** Navigate between questions and interactive elements
- **Enter/Space:** Select option (radio/checkbox) or activate button
- **Arrow keys:** Navigate between radio options in same group (native behavior)
- **Escape:** Cancel edit mode (return to read mode)

#### Screen Reader Support

```html
<!-- Open question -->
<fieldset aria-labelledby="question-123-label">
  <legend id="question-123-label">
    <span class="sr-only">Открытый вопрос. Обязательный.</span>
    Какова основная цель вашего курса?
  </legend>
  <div aria-describedby="question-123-hint">
    <p id="question-123-hint">Рекомендуемый ответ (можно изменить)</p>
    <!-- Options -->
  </div>
</fieldset>

<!-- Single choice -->
<fieldset aria-labelledby="question-456-label">
  <legend id="question-456-label">
    <span class="sr-only">Выбор одного варианта. Важный.</span>
    Какой уровень сложности курса?
  </legend>
  <div role="radiogroup" aria-required="false">
    <label>
      <input type="radio" name="q-456" value="beginner" />
      <span>Начальный</span>
    </label>
    <!-- More options -->
  </div>
</fieldset>
```

#### ARIA Live Regions

```html
<!-- Announce answer submission success -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  {isSubmitting && 'Сохранение ответа...'} {isSuccess && 'Ответ успешно сохранён'} {isError &&
  'Ошибка при сохранении. Попробуйте ещё раз.'}
</div>
```

---

### 6. Loading & Error States

#### Loading States

**During submission:**

```
[ ⏳ Сохранение... ]  (button disabled, spinner icon, purple bg)
```

**During edit mode entry:**

```
Card dims slightly with opacity-90, cursor set to wait
```

#### Error States

**Validation errors (inline):**

```
┌─────────────────────────────────────────────────────────────┐
│ ✏️ Или введите свой вариант:                                │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ [User typed: "  "] (only whitespace)                   │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ⚠️ Ответ не может быть пустым                                │ ← Inline validation
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Network errors (toast notification):**

```typescript
toast.error('Не удалось сохранить ответ', {
  description: error.message || 'Попробуйте ещё раз',
  action: {
    label: 'Повторить',
    onClick: () => retrySubmission(),
  },
});
```

**Rate limit errors (backend protection):**

```typescript
// If user spams confirm button
toast.warning('Слишком много запросов', {
  description: 'Подождите несколько секунд перед повтором',
});
```

---

## Implementation Recommendations

### Data Model Changes

**Extend existing `clarifying_questions` table:**

```sql
-- Add question_type column
ALTER TABLE clarifying_questions
ADD COLUMN question_type VARCHAR(20) DEFAULT 'open'
CHECK (question_type IN ('open', 'single_choice', 'multi_choice'));

-- For multi_choice, suggested_answers can store multiple selected indices
-- Store user_answer as JSON array for multi-choice:
-- single: {"selected": "Начальный"}
-- multi:  {"selected": ["Текстовые уроки", "Интерактивные упражнения"]}
```

**Question interface updates:**

```typescript
interface Question {
  id: string;
  text: string;
  priority: 'critical' | 'important' | 'nice_to_have';
  questionType: 'open' | 'single_choice' | 'multi_choice'; // NEW
  suggestedAnswers: SuggestedAnswer[];
  currentAnswer?: string | string[]; // string[] for multi_choice
  isAnswered: boolean;

  // Additional metadata
  minSelections?: number; // For multi_choice (default: 1)
  maxSelections?: number; // For multi_choice (default: unlimited)
}
```

---

### Component Architecture

**Recommended structure:**

```
QuestionCard.tsx  (orchestrator)
├── QuestionHeader.tsx          (type icon + priority badge)
├── QuestionBody.tsx            (question text + helper)
├── OpenQuestion.tsx            (suggested + textarea)
│   ├── SuggestedAnswerBox.tsx
│   └── CustomAnswerTextarea.tsx
├── SingleChoiceQuestion.tsx    (radio buttons)
│   └── RadioOption.tsx
├── MultiChoiceQuestion.tsx     (checkboxes)
│   └── CheckboxOption.tsx
├── AnswerDisplay.tsx           (locked green box)
└── QuestionActions.tsx         (confirm/edit/cancel buttons)
```

**QuestionCard orchestrator logic:**

```typescript
const QuestionCard = ({ question, onAnswer, ... }) => {
  const [mode, setMode] = useState<'unanswered' | 'answered' | 'editing'>()
  const [selection, setSelection] = useState<any>(null)

  // Determine which question component to render
  const QuestionComponent = {
    open: OpenQuestion,
    single_choice: SingleChoiceQuestion,
    multi_choice: MultiChoiceQuestion,
  }[question.questionType]

  return (
    <Card>
      <QuestionHeader type={question.questionType} priority={question.priority} />
      <QuestionBody text={question.text} type={question.questionType} />

      {mode === 'answered' ? (
        <AnswerDisplay
          answer={question.currentAnswer}
          onEdit={() => setMode('editing')}
        />
      ) : (
        <>
          <QuestionComponent
            question={question}
            selection={selection}
            onSelectionChange={setSelection}
          />
          <QuestionActions
            mode={mode}
            hasSelection={!!selection}
            onConfirm={() => handleConfirm(selection)}
            onCancel={() => handleCancel()}
          />
        </>
      )}
    </Card>
  )
}
```

---

### Animation & Transitions

**Smooth transitions between states:**

```typescript
// Framer Motion variants
const cardVariants = {
  unanswered: {
    borderColor: 'var(--slate-200)',
    backgroundColor: 'var(--white)',
  },
  selecting: {
    borderColor: 'var(--purple-500)',
    backgroundColor: 'var(--purple-50)',
  },
  answered: {
    borderColor: 'var(--emerald-500)',
    backgroundColor: 'var(--emerald-50)',
  },
}

<motion.div
  variants={cardVariants}
  animate={mode}
  transition={{ duration: 0.3 }}
>
  {/* Card content */}
</motion.div>
```

**Button state transitions:**

```typescript
const buttonVariants = {
  disabled: {
    opacity: 0.5,
    scale: 1,
    cursor: 'not-allowed',
  },
  enabled: {
    opacity: 1,
    scale: 1,
    cursor: 'pointer',
  },
  hover: {
    scale: 1.02,
    transition: { duration: 0.15 },
  },
  tap: {
    scale: 0.98,
  },
};
```

---

### Performance Considerations

**Optimization strategies:**

1. **Debounce textarea input** (open questions):

```typescript
const [debouncedValue] = useDebounce(textareaValue, 300);
// Only validate after user stops typing for 300ms
```

2. **Memoize question components:**

```typescript
const MemoizedSingleChoice = React.memo(SingleChoiceQuestion);
// Prevent re-renders when parent state changes
```

3. **Virtual scrolling** (if >20 questions):

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
// Only render visible questions
```

4. **Optimistic UI updates:**

```typescript
const submitAnswer = useMutation({
  onMutate: async newAnswer => {
    // Immediately show "answered" state
    setMode('answered');
    return { previousAnswer: question.currentAnswer };
  },
  onError: (err, newAnswer, context) => {
    // Rollback on error
    setMode('editing');
    toast.error('Ошибка сохранения');
  },
});
```

---

## Testing Recommendations

### Manual Testing Checklist

**Functional Testing:**

- [ ] Open question: Accept suggestion → confirms → displays locked answer
- [ ] Open question: Modify suggestion → saves → displays as "modified"
- [ ] Open question: Custom input → validates non-empty → saves
- [ ] Single choice: Select option → confirm → displays locked answer
- [ ] Single choice: Change selection before confirm → only last selection saves
- [ ] Single choice: "Другое" → text input appears → saves custom value
- [ ] Multi choice: Select multiple → counter updates → confirms all selections
- [ ] Multi choice: Uncheck option → counter decrements → confirms remaining
- [ ] Multi choice: Min/max constraints → button disabled until satisfied
- [ ] Edit mode: Click "Изменить" → pre-populates previous answer
- [ ] Edit mode: Modify → confirm → updates answer
- [ ] Edit mode: Cancel → reverts to previous answer (no save)
- [ ] Two-phase: Selection highlights option but doesn't save until confirm
- [ ] Skip: "Пропустить" button only visible for `nice_to_have` priority

**Mobile Testing (Responsive):**

- [ ] Touch targets ≥44×44px on mobile (test with touch device)
- [ ] Buttons don't overlap on small screens (320px width)
- [ ] Textarea resizes correctly on mobile keyboards
- [ ] No horizontal scroll on any screen size
- [ ] Auto-scroll to next question works smoothly

**Accessibility Testing:**

- [ ] Keyboard navigation: Tab through all interactive elements
- [ ] Focus indicators visible on all focusable elements
- [ ] Screen reader announces question type and priority
- [ ] ARIA labels correctly describe form controls
- [ ] Radio buttons/checkboxes announce checked state
- [ ] Error messages announced to screen readers (aria-live)

**Edge Cases:**

- [ ] Network error during submission → shows toast, stays in edit mode
- [ ] Multiple rapid clicks on confirm → only one submission (debounce)
- [ ] Empty textarea → shows inline validation error
- [ ] Whitespace-only input → shows validation error
- [ ] Very long question text → card expands properly
- [ ] Very long answer → truncates with "show more" in locked state
- [ ] User refreshes page during edit → returns to last saved state

### Automated Testing Strategy

**Unit Tests (Vitest + React Testing Library):**

```typescript
describe('QuestionCard - Open Question', () => {
  it('shows suggested answer by default', () => {
    render(<QuestionCard question={openQuestion} onAnswer={mockFn} />)
    expect(screen.getByText('Рекомендуемый ответ')).toBeInTheDocument()
  })

  it('enables confirm button when suggestion selected', () => {
    render(<QuestionCard question={openQuestion} onAnswer={mockFn} />)
    fireEvent.click(screen.getByText('Принять'))
    expect(screen.getByText('Подтвердить ответ')).not.toBeDisabled()
  })

  it('calls onAnswer with correct params on confirm', async () => {
    render(<QuestionCard question={openQuestion} onAnswer={mockOnAnswer} />)
    fireEvent.click(screen.getByText('Принять'))
    fireEvent.click(screen.getByText('Подтвердить ответ'))
    await waitFor(() => {
      expect(mockOnAnswer).toHaveBeenCalledWith(
        question.id,
        'suggested answer text',
        'suggested',
        0
      )
    })
  })
})

describe('QuestionCard - Single Choice', () => {
  it('allows only one radio button to be selected', () => {
    render(<QuestionCard question={singleChoiceQuestion} onAnswer={mockFn} />)
    const radio1 = screen.getByLabelText('Начальный')
    const radio2 = screen.getByLabelText('Средний')

    fireEvent.click(radio1)
    expect(radio1).toBeChecked()
    expect(radio2).not.toBeChecked()

    fireEvent.click(radio2)
    expect(radio1).not.toBeChecked()
    expect(radio2).toBeChecked()
  })
})

describe('QuestionCard - Multi Choice', () => {
  it('allows multiple checkboxes to be selected', () => {
    render(<QuestionCard question={multiChoiceQuestion} onAnswer={mockFn} />)
    const checkbox1 = screen.getByLabelText('Текстовые уроки')
    const checkbox2 = screen.getByLabelText('Видео-лекции')

    fireEvent.click(checkbox1)
    fireEvent.click(checkbox2)

    expect(checkbox1).toBeChecked()
    expect(checkbox2).toBeChecked()
    expect(screen.getByText('Выбрано: 2 варианта')).toBeInTheDocument()
  })
})
```

**Integration Tests (Playwright):**

```typescript
test('complete question flow: select → confirm → edit → save', async ({ page }) => {
  await page.goto('/course/123/clarifying');

  // Select option
  await page.click('text=Начальный');
  await expect(page.locator('button:has-text("Подтвердить выбор")')).toBeEnabled();

  // Confirm
  await page.click('text=Подтвердить выбор');
  await expect(page.locator('text=✅ Ваш выбор:')).toBeVisible();

  // Edit
  await page.click('text=Изменить выбор');
  await page.click('text=Средний');
  await page.click('text=Подтвердить изменения');

  // Verify update
  await expect(page.locator('text=Средний')).toBeVisible();
});

test('mobile: touch targets are at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
  await page.goto('/course/123/clarifying');

  const confirmButton = page.locator('button:has-text("Подтвердить")');
  const box = await confirmButton.boundingBox();

  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});
```

---

## Migration Strategy

### Phase 1: Backend Changes (Week 1)

1. **Database migration:**
   - Add `question_type` column to `clarifying_questions` table
   - Update seed data with mixed question types
   - Test data integrity

2. **API updates:**
   - Update tRPC schemas to include `questionType`
   - Modify `submitAnswer` mutation to handle different answer formats
   - Add validation for multi-choice min/max selections

3. **Backward compatibility:**
   - Default `question_type = 'open'` for existing questions
   - Existing frontend continues to work (ignores new field)

### Phase 2: Frontend Components (Week 2)

1. **Create new question type components:**
   - `OpenQuestion.tsx` (refactor existing code)
   - `SingleChoiceQuestion.tsx` (new)
   - `MultiChoiceQuestion.tsx` (new)

2. **Update QuestionCard orchestrator:**
   - Add question type routing logic
   - Implement two-phase confirmation for all types
   - Add edit mode for all types

3. **Testing:**
   - Unit tests for each question type
   - Integration tests for full flow

### Phase 3: UX Enhancements (Week 3)

1. **Visual improvements:**
   - Question type header icons
   - Animation transitions between states
   - Touch target size optimization

2. **Accessibility:**
   - ARIA labels and roles
   - Keyboard navigation
   - Screen reader testing

3. **Polish:**
   - Loading states
   - Error handling
   - Mobile responsiveness

### Phase 4: Production Rollout (Week 4)

1. **Feature flag:**
   - Enable new question types for 10% of users
   - Monitor error rates and user behavior
   - Gather feedback

2. **Full rollout:**
   - Enable for 100% of users
   - Update documentation
   - Train support team

---

## Success Metrics

**Quantitative Metrics:**

1. **Submission accuracy:** % of answers changed after initial selection
   - **Baseline:** N/A (current implementation auto-submits)
   - **Target:** <10% of answers edited after confirmation (indicates good decision-making)

2. **Error rate:** Failed submissions due to validation errors
   - **Target:** <2% of total submissions

3. **Completion rate:** % of users who answer all critical questions
   - **Baseline:** Track current rate
   - **Target:** ≥95% completion rate

4. **Time to complete:** Average time to answer all questions
   - **Baseline:** Track current time
   - **Target:** No significant increase (<10% slower acceptable for better quality)

**Qualitative Metrics:**

1. **User confidence:** Post-task survey "I felt confident in my answers"
   - **Target:** ≥4.5/5.0 average rating

2. **Perceived control:** "I could easily change my mind before submitting"
   - **Target:** ≥4.5/5.0 average rating

3. **Mobile usability:** "The form was easy to use on my phone"
   - **Target:** ≥4.0/5.0 average rating

---

## Appendix: Design Tokens

### Colors

```typescript
// Question Type Colors
const typeColors = {
  open: {
    primary: 'blue-600',
    light: 'blue-50',
    border: 'blue-200',
  },
  single_choice: {
    primary: 'purple-600',
    light: 'purple-50',
    border: 'purple-200',
  },
  multi_choice: {
    primary: 'indigo-600',
    light: 'indigo-50',
    border: 'indigo-200',
  },
};

// State Colors (existing)
const stateColors = {
  selected: 'purple-500',
  answered: 'emerald-500',
  error: 'red-500',
};

// Priority Colors (existing - no changes)
const priorityColors = {
  critical: 'red-500',
  important: 'amber-500',
  nice_to_have: 'slate-300',
};
```

### Spacing

```typescript
// Touch Targets (Mobile-First)
const touchTargets = {
  button: {
    minWidth: '44px',
    minHeight: '44px',
    padding: '12px 20px',
  },
  radioCheckbox: {
    tapArea: '44px', // Invisible tap area
    visual: '20px', // Visible radio/checkbox
  },
  card: {
    minHeight: '48px',
    padding: '12px 16px',
  },
};

// Spacing Scale
const spacing = {
  cardGap: '12px', // Between question cards
  elementGap: '8px', // Between options
  sectionGap: '16px', // Between sections (header/body/actions)
};
```

### Typography

```typescript
// Text Sizes
const textSizes = {
  questionText: 'text-sm font-medium', // 14px
  helperText: 'text-xs text-slate-600', // 12px
  optionText: 'text-sm', // 14px
  answerText: 'text-sm text-emerald-900', // 14px
  buttonText: 'text-sm font-medium', // 14px
};
```

### Border Radius

```typescript
const borderRadius = {
  card: '8px',
  button: '6px',
  input: '6px',
  badge: '4px',
};
```

---

## Sources & References

This research is based on current industry best practices and accessibility standards as of 2026:

### Survey Design Best Practices

- [Multiple Choice Questions in Surveys: Types, Examples, and Best Practices - Polling.com](https://blog.polling.com/multiple-choice-questions-in-surveys-types-examples-and-best-practices/)
- [Multiple-choice survey questions: Examples and tips - Jotform Blog](https://www.jotform.com/blog/multiple-choice-survey-questions/)
- [The Ultimate Guide to Crafting Multiple Choice Questions for Surveys - Sogolytics](https://www.sogolytics.com/guide-to-multiple-choice-questions/)

### Two-Phase Selection & Confirmation Patterns

- [Checkbox UX: Best Practices, Common Mistakes & Design Tips - Eleken](https://www.eleken.co/blog-posts/checkbox-ux)
- [Confirmation Dialogs Can Prevent User Errors (If Not Overused) - Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/)

### Inline Editing Patterns

- [12 Form UI/UX Design Best Practices to Follow in 2026 - DesignStudioUIUX](https://www.designstudiouiux.com/blog/form-ux-design-best-practices/)
- [Inline Editing Implementation Experience and Use Case Examples - Apiko](https://apiko.com/blog/inline-editing/)
- [How to Design UI Forms in 2025: Your Best Guide - IxDF](https://www.interaction-design.org/literature/article/ui-form-design)

### WCAG Touch Target Sizes & Mobile Accessibility

- [WCAG 2.5.8 Target Size (Minimum): Complete Implementation Guide - AllAccessible](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
- [All accessible touch target sizes - LogRocket Blog](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [Accessible Target Sizes Cheatsheet - Smashing Magazine](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [Understanding Success Criterion 2.5.5: Target Size - W3C](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)

### Visual Affordances & Form Field Differentiation

- [54 Input Field Design Examples with Expert Tips - Eleken](https://www.eleken.co/blog-posts/input-field-design)
- [Radio Button Vs Checkbox: Which One To Use In Forms And When - IvyForms](https://ivyforms.com/blog/radio-button-vs-checkbox/)
- [Creating Accessible Forms - Accessible Form Controls - WebAIM](https://webaim.org/techniques/forms/controls)
- [The anatomy of accessible forms: Best practices - Deque](https://www.deque.com/blog/anatomy-of-accessible-forms-best-practices/)

---

**Document Status:** Complete
**Next Steps:** Review with team → Prioritize implementation phases → Create technical specifications
**Contact:** research-specialist (research-agent)
**Last Updated:** 2026-01-27
