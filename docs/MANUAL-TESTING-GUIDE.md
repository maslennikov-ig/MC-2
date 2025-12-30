# Manual Testing Guide: Stage 7 Enrichment Inspector Panel

## Prerequisites

1. Запущен dev-сервер: `pnpm dev` в `packages/web`
2. Есть тестовый курс в состоянии генерации (Stage 7)
3. Доступ к курсу с уроками в разных состояниях

---

## 1. Navigation Tests (P0 - Critical)

### 1.1 Empty State
- [ ] Открыть курс в режиме генерации
- [ ] Кликнуть на урок **без** enrichments
- [ ] **Ожидание:** Показывается пустое состояние с текстом "No enrichments yet" / "Нет обогащений"
- [ ] **Ожидание:** Видны 4 карточки: Video, Quiz, Audio, Presentation

### 1.2 Discovery Cards Navigation
- [ ] Кликнуть на карточку **Video**
- [ ] **Ожидание:** Открывается форма создания видео
- [ ] Нажать кнопку **Back** (←)
- [ ] **Ожидание:** Возврат к empty state
- [ ] Повторить для **Quiz**, **Audio**, **Presentation**

### 1.3 Back Button Visibility
- [ ] На root view (empty state или список) — кнопка Back **скрыта**
- [ ] На create view — кнопка Back **видна**
- [ ] На detail view — кнопка Back **видна**

### 1.4 Enrichment List Navigation
- [ ] Открыть урок **с** enrichments
- [ ] **Ожидание:** Показывается список enrichments (не empty state)
- [ ] Кликнуть на enrichment в списке
- [ ] **Ожидание:** Открывается detail view с превью
- [ ] Нажать Back
- [ ] **Ожидание:** Возврат к списку

---

## 2. Create Enrichment Tests (P0 - Critical)

### 2.1 Quiz Form
- [ ] Открыть create view для Quiz
- [ ] **Проверить элементы формы:**
  - [ ] Slider "Question Count" (по умолчанию: 5)
  - [ ] Select "Difficulty" (по умолчанию: Balanced)
  - [ ] Кнопки "Create" и "Cancel"
- [ ] Изменить Question Count на 8 (стрелками или перетаскиванием)
- [ ] Изменить Difficulty на "Hard"
- [ ] Нажать **Create**
- [ ] **Ожидание:** Форма отправляется, возврат к root view, новый enrichment в списке

### 2.2 Video Form
- [ ] Открыть create view для Video
- [ ] **Проверить элементы:**
  - [ ] Select "Voice" (Alloy, Echo, Fable, Nova, Onyx, Shimmer)
  - [ ] Slider "Speed" (0.5x - 2.0x, по умолчанию 1.0x)
  - [ ] Select "Format" (MP4, WebM)
- [ ] Выбрать voice "Nova", speed 1.2x
- [ ] Нажать **Create**
- [ ] **Ожидание:** Успешное создание

### 2.3 Audio Form
- [ ] Открыть create view для Audio
- [ ] **Проверить элементы:**
  - [ ] Select "Voice"
  - [ ] Slider "Speed"
  - [ ] Select "Format" (MP3, Opus, AAC)
- [ ] Нажать **Create** с дефолтными значениями
- [ ] **Ожидание:** Успешное создание

### 2.4 Presentation Form
- [ ] Открыть create view для Presentation
- [ ] **Проверить элементы:**
  - [ ] Select "Theme" (Light, Dark, Colorful)
  - [ ] Slider "Maximum Slides" (5-30, по умолчанию 10)
  - [ ] Checkbox "Include Speaker Notes" (по умолчанию: checked)
- [ ] Выбрать theme "Dark", slides 15, отключить notes
- [ ] Нажать **Create**
- [ ] **Ожидание:** Успешное создание

### 2.5 Cancel Flow
- [ ] Открыть любую форму создания
- [ ] Изменить значения
- [ ] Нажать **Cancel**
- [ ] **Ожидание:** Возврат к root view, enrichment **не** создан

---

## 3. Drag and Drop Tests (P1 - High Priority)

### 3.1 Visual Drag Handles
- [ ] Открыть урок с 3+ enrichments
- [ ] **Ожидание:** У каждого элемента есть иконка перетаскивания (⋮⋮)
- [ ] Навести курсор на drag handle
- [ ] **Ожидание:** Курсор меняется на `grab`

### 3.2 Mouse Drag
- [ ] Записать текущий порядок enrichments
- [ ] Зажать drag handle первого элемента
- [ ] Перетащить на место второго элемента
- [ ] Отпустить
- [ ] **Ожидание:** Элементы поменялись местами
- [ ] Обновить страницу (F5)
- [ ] **Ожидание:** Новый порядок сохранился

### 3.3 Keyboard Drag
- [ ] Сфокусироваться на drag handle (Tab)
- [ ] Нажать **Space** (начать перетаскивание)
- [ ] Нажать **Arrow Down** (переместить вниз)
- [ ] Нажать **Space** (завершить)
- [ ] **Ожидание:** Элемент переместился

### 3.4 Cancel Drag
- [ ] Начать keyboard drag (Space)
- [ ] Нажать **Escape**
- [ ] **Ожидание:** Порядок не изменился

### 3.5 Drag Handle Isolation
- [ ] Кликнуть на drag handle (не перетаскивая)
- [ ] **Ожидание:** Detail view **не** открывается
- [ ] Кликнуть на остальную часть элемента
- [ ] **Ожидание:** Detail view открывается

---

## 4. Error Handling Tests (P1 - High Priority)

### 4.1 Failed Enrichment Display
- [ ] Найти урок с enrichment в статусе "failed"
- [ ] **Ожидание:** Элемент отмечен красным/ошибкой
- [ ] Кликнуть на failed enrichment
- [ ] **Ожидание:** Detail view показывает сообщение об ошибке
- [ ] **Ожидание:** Есть кнопка "Retry" / "Try Again"

### 4.2 Form Submission Error
- [ ] Отключить интернет / заблокировать API
- [ ] Попробовать создать enrichment
- [ ] **Ожидание:** Показывается ошибка (alert/toast)
- [ ] **Ожидание:** Форма остается открытой (данные не потеряны)
- [ ] **Ожидание:** Можно закрыть ошибку и попробовать снова

### 4.3 Network Error Recovery
- [ ] Включить интернет обратно
- [ ] Нажать "Retry" или отправить форму снова
- [ ] **Ожидание:** Успешное создание

---

## 5. Accessibility Tests (P2)

### 5.1 Keyboard Navigation
- [ ] Начать с фокуса на панели
- [ ] Использовать **Tab** для навигации
- [ ] **Ожидание:** Все интерактивные элементы достижимы
- [ ] Использовать **Enter** для активации кнопок/карточек
- [ ] Использовать **Escape** для закрытия/отмены

### 5.2 Screen Reader (VoiceOver/NVDA)
- [ ] Discovery cards имеют читаемые названия
- [ ] Drag handles объявляют "Drag to reorder"
- [ ] Form inputs имеют label'ы
- [ ] Статусы enrichments объявляются

### 5.3 Focus Management
- [ ] При открытии create view фокус переходит в форму
- [ ] При возврате (Back) фокус возвращается к триггеру

---

## 6. i18n Tests (P2)

### 6.1 English Locale
- [ ] Перейти на `/en/courses/generating/...`
- [ ] **Проверить тексты:**
  - [ ] "Enrichments" (заголовок)
  - [ ] "No enrichments yet" (empty state)
  - [ ] "Video", "Quiz", "Audio", "Presentation" (карточки)
  - [ ] "Question Count", "Difficulty" (форма quiz)
  - [ ] "Create", "Cancel" (кнопки)
  - [ ] "Pending", "Generating", "Completed", "Failed" (статусы)

### 6.2 Russian Locale
- [ ] Перейти на `/ru/courses/generating/...`
- [ ] **Проверить тексты:**
  - [ ] "Обогащения" (заголовок)
  - [ ] "Нет обогащений" (empty state)
  - [ ] "Видео", "Тест", "Аудио", "Презентация" (карточки)
  - [ ] "Количество вопросов", "Сложность" (форма quiz)
  - [ ] "Создать", "Отмена" (кнопки)
  - [ ] "Ожидание", "Генерация", "Завершено", "Ошибка" (статусы)

### 6.3 Locale Switch
- [ ] Переключить язык во время работы с панелью
- [ ] **Ожидание:** Все тексты обновились, состояние сохранилось

---

## 7. Generation Progress Tests (P2)

### 7.1 Progress Indicator
- [ ] Найти enrichment в статусе "generating"
- [ ] **Ожидание:** Показывается индикатор прогресса (%, полоса, или spinner)
- [ ] **Ожидание:** Анимация (пульсация, вращение, или движущиеся точки)

### 7.2 Generation Log
- [ ] Кликнуть на generating enrichment
- [ ] **Ожидание:** Detail view показывает лог генерации
- [ ] **Ожидание:** Лог обновляется в реальном времени

### 7.3 Cancel Generation
- [ ] На generating enrichment найти кнопку "Cancel"
- [ ] Нажать Cancel
- [ ] **Ожидание:** Генерация останавливается, статус меняется

### 7.4 Completion Transition
- [ ] Наблюдать за generating enrichment
- [ ] **Ожидание:** После завершения статус меняется на "completed"
- [ ] **Ожидание:** Progress indicator исчезает
- [ ] **Ожидание:** Появляется превью контента

---

## 8. Deep Links Tests (P2)

### 8.1 URL State Sync
- [ ] Открыть урок, записать URL
- [ ] URL содержит параметр `lesson=...`
- [ ] Кликнуть на enrichment
- [ ] **Ожидание:** URL обновляется (добавляется `enrichment=...`)

### 8.2 Direct Navigation
- [ ] Скопировать URL с enrichment ID
- [ ] Открыть в новой вкладке
- [ ] **Ожидание:** Панель открывается сразу на detail view этого enrichment

### 8.3 Refresh Persistence
- [ ] Находясь в detail view, обновить страницу (F5)
- [ ] **Ожидание:** Та же панель, тот же enrichment открыт

### 8.4 Invalid Deep Link
- [ ] Изменить enrichment ID в URL на несуществующий
- [ ] **Ожидание:** Graceful fallback (список или ошибка), не crash

### 8.5 Graph Sync
- [ ] Открыть панель для одного урока
- [ ] Кликнуть на другой урок в графе
- [ ] **Ожидание:** Панель обновляется для нового урока

---

## Test Results Log

| Section | Passed | Failed | Notes |
|---------|--------|--------|-------|
| 1. Navigation | /10 | | |
| 2. Create Enrichment | /12 | | |
| 3. Drag and Drop | /8 | | |
| 4. Error Handling | /6 | | |
| 5. Accessibility | /6 | | |
| 6. i18n | /6 | | |
| 7. Generation Progress | /8 | | |
| 8. Deep Links | /8 | | |
| **TOTAL** | /64 | | |

---

## Bug Report Template

```markdown
### Bug Title
[Краткое описание]

### Section
[Номер теста, например: 3.2 Mouse Drag]

### Steps to Reproduce
1. ...
2. ...
3. ...

### Expected Result
[Что должно произойти]

### Actual Result
[Что произошло на самом деле]

### Screenshot/Video
[Приложить если есть]

### Browser/OS
- Browser: Chrome 120 / Firefox 121 / Safari 17
- OS: macOS 14 / Windows 11 / Ubuntu 22.04

### Priority
- [ ] P0 - Blocker
- [ ] P1 - High
- [ ] P2 - Medium
- [ ] P3 - Low
```
