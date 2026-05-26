# Two-Product Navigation And Course Landing

Дата: 2026-05-26
Beads: `mc2-db696.36`
Ветка: `codex/product-ia-course-landing`

## Цель

Сделать понятную структуру из двух продуктов:

- `Должностные инструкции` - вход в лендинг, конструктор и каталог должностных инструкций.
- `Курсы` - вход в новый лендинг, создание курса и каталог курсов.

Пользователь должен понимать, что курс лучше начинать с ясной роли: сначала оформить должностную инструкцию, затем на её основе собрать обучение.

## Референсы

Используем паттерны из LazyWeb-исследования:

- Apple Business, Microsoft Power Platform, Canva Business Features - крупные продуктовые пути и понятные действия.
- 360Learning LXP, Appcues Product Adoption Academy, Opus Course Marketplace, Canva Design School - лендинг продукта с превью, процессом и примерами.
- Replit for Product Managers, Asana Creative Production - объяснение рабочего процесса через последовательность шагов.

21st.dev рассматривался только как источник вдохновения для меню продукта. В реализацию не добавляются новые зависимости: достаточно существующих `DropdownMenu`, `Link`, `Header` и локальных UI-примитивов.

## Маршруты

- `/` - витрина двух продуктов.
- `/courses` - новый лендинг курсов.
- `/courses/library` - каталог курсов, перенесённый с прежнего `/courses`.
- `/create` - существующее создание курса.
- `/career-playbook` - лендинг должностных инструкций.
- `/career-playbook/library` - каталог должностных инструкций.
- `/career-playbook/new` - конструктор должностной инструкции.

## Изменения

- Header показывает два продуктовых пункта: `Должностные инструкции` и `Курсы`.
- Клик по названию продукта ведёт на лендинг продукта.
- У каждого продукта есть меню быстрых действий: описание продукта, создание, каталог.
- Home превращается в витрину двух продуктов с рекомендацией начинать с должностной инструкции.
- `/courses` становится полноценным лендингом курсов с hero, превью, процессом, возможностями, примерами и финальным призывом.
- Старый каталог курсов переносится на `/courses/library`; ссылки, `revalidatePath` и тесты обновляются.
- RU/EN тексты добавлены в `common.json`; в русском тексте используется "искусственный интеллект" вместо нерасшифрованного `AI`.

## Границы

- Не меняются backend-схемы, генерация курсов, данные курсов и Career Playbook generation flow.
- Не добавляются новые UI-библиотеки и внешние зависимости.
- Старые внешние ссылки на `/courses` попадают на новый продуктовый лендинг, а не на каталог.

## Проверка

Обязательные проверки для доставки:

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/layouts/header.test.tsx tests/unit/components/courses/landing-page.test.tsx tests/unit/components/courses/library-page.test.tsx`
- `pnpm --filter @megacampus/web type-check`
- `pnpm --filter @megacampus/web build`
- `pnpm type-check`
- `pnpm build`
- Browser smoke для `/`, `/courses`, `/courses/library`, `/career-playbook`, `/career-playbook/library` на 390, 1440 и 1920 px в светлой и тёмной темах.
