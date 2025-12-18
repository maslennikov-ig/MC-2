# **Архитектурные стратегии рендеринга Markdown в образовательных платформах на Next.js 15+**

## **1\. Введение: Эволюция образовательных интерфейсов и технологический сдвиг**

Современный ландшафт разработки образовательных технологий (EdTech) переживает фундаментальную трансформацию. Традиционные системы управления обучением (LMS), построенные на серверном рендеринге предыдущего поколения или тяжелых клиентских приложениях (SPA), уступают место высокопроизводительным гибридным архитектурам. В центре этой революции находится стек технологий, объединяющий **Next.js 15**, **React 19**, **Tailwind CSS 4** и библиотеки компонентов, такие как **shadcn/ui**. Для платформ, чья основная ценность заключается в доставке сложного, структурированного контента — от математических формул до интерактивных сред программирования — выбор стратегии рендеринга Markdown становится критическим архитектурным решением.

### **1.1 Контекст: AI-генерация и динамический контент**

Специфика современных образовательных платформ все чаще определяется интеграцией искусственного интеллекта. Если раньше контент создавался методистами и оставался статичным годами, то сегодня AI-модели генерируют персонализированные учебные материалы, объяснения и задачи в реальном времени. Это накладывает новые требования на систему рендеринга: она должна быть не только быстрой, но и безопасной, способной обрабатывать потоковые данные (streaming) и обеспечивать высокую доступность (accessibility) для всех категорий обучающихся. Markdown и его расширенная версия MDX (Markdown \+ JSX) стали де\-факто стандартом для структурирования такого контента благодаря своей легковесности и семантической чистоте.1

### **1.2 Технологический стек 2025 года**

Выход Next.js 15 и React 19 ознаменовал окончательный переход к архитектуре React Server Components (RSC) как стандарту по умолчанию.3 Это меняет правила игры для обработки Markdown: тяжелые операции парсинга абстрактных синтаксических деревьев (AST), транспиляции и подсветки синтаксиса теперь могут и должны выполняться на сервере, освобождая клиентский бандл от сотен килобайт JavaScript-кода. Одновременно с этим, релиз Tailwind CSS 4 с новым движком на Rust и использование shadcn/ui позволяют создавать визуально безупречные интерфейсы с минимальными накладными расходами на CSS-in-JS.5

В данном отчете представлен исчерпывающий анализ архитектурных паттернов, библиотек и методов оптимизации для построения образовательной платформы нового поколения. Мы рассмотрим, как обеспечить визуальное превосходство, доступность и безопасность при работе с Markdown в среде Next.js 15+.

## ---

**2\. Архитектура Next.js 15 и React 19: Новая парадигма рендеринга**

Переход на Next.js 15 с App Router требует переосмысления того, как приложения обрабатывают текстовый контент. В отличие от Pages Router, где выбор стоял между getStaticProps (SSG) и getServerSideProps (SSR), новая модель опирается на гранулярное разделение серверных и клиентских компонентов.

### **2.1 React Server Components (RSC) и обработка контента**

В контексте образовательной платформы RSC предоставляют уникальную возможность. Учебные материалы, как правило, представляют собой длинные тексты с вкраплениями интерактивности (квизы, тренажеры кода). В классическом React-приложении (CSR) весь текст и библиотека для его рендеринга (например, react-markdown) загружались на клиент, блокируя интерактивность до окончания гидратации.

В Next.js 15 обработка Markdown происходит на сервере. Приложение читает MDX-файл или получает строку из базы данных, трансформирует её в HTML или сериализованный формат RSC Payload, и отправляет клиенту уже готовое дерево компонентов.7

**Ключевые преимущества RSC для EdTech:**

* **Нулевой размер бандла парсера:** Библиотеки вроде remark, rehype и shiki (подсветка кода) выполняются исключительно на сервере. Это экономит от 50 КБ до нескольких мегабайт JavaScript в зависимости от сложности контента.  
* **Потоковая передача (Streaming):** Благодаря интеграции с Suspense в React 19, большие главы учебников могут "стримиться" пользователю по мере готовности. Студент может начать читать введение, пока сервер продолжает рендерить сложные диаграммы или блоки кода в конце страницы.7  
* **Доступ к данным:** Серверные компоненты могут напрямую обращаться к базе данных или CMS без необходимости создавать API-энпоинты для фронтенда, что упрощает архитектуру и повышает безопасность.7

### **2.2 React 19: Хуки и компилятор**

React 19 вводит новые примитивы, улучшающие работу с динамическим контентом.

* **React Compiler:** Автоматически оптимизирует ре-рендеринг компонентов. В сложных MDX-документах, где множество вложенных компонентов (заголовки, параграфы, списки) могли вызывать лишние циклы рендеринга, новый компилятор обеспечивает мемоизацию "из коробки", снижая нагрузку на основной поток браузера.3  
* **Хук use:** Позволяет считывать промисы (например, загрузку контента) непосредственно внутри компонентов, упрощая паттерны асинхронного рендеринга MDX-контента.3

### **2.3 Кэширование и инвалидация в Next.js 15**

Для образовательного контента, который обновляется нечасто (в отличие от новостных лент), механизмы кэширования Next.js 15 являются критически важными. fetch запросы к CMS по умолчанию кэшируются. Однако, при использовании AI-генерации контента важно правильно настроить стратегии ревалидации (revalidatePath, revalidateTag), чтобы исправления в учебных материалах мгновенно отображались у пользователей, не требуя полной пересборки сайта (как это было в SSG).4

## ---

**3\. Сравнительный анализ библиотек рендеринга MDX**

Выбор "движка" для рендеринга MDX определяет гибкость и производительность всей платформы. На рынке существует несколько основных решений, каждое из которых имеет свои нюансы интеграции с Next.js 15\.

### **3.1 Обзор экосистемы**

В таблице ниже представлено сравнение наиболее популярных библиотек с точки зрения их применимости в Next.js 15 App Router.

| Характеристика | @next/mdx | next-mdx-remote | mdx-bundler | react-markdown |
| :---- | :---- | :---- | :---- | :---- |
| **Тип рендеринга** | Build-time (Webpack) | Runtime (Server) | Runtime (Server) | Runtime (Client) |
| **Поддержка RSC** | Нативная | Нативная (/rsc) | Частичная (требует адаптации) | Нет (Client Component) |
| **Источник данных** | Локальные файлы | CMS / БД / Файлы | CMS / БД / Файлы | Строка |
| **Плагины (Remark/Rehype)** | next.config.mjs | В пропсах | В опциях бандлинга | В пропсах |
| **Сложность настройки** | Низкая | Средняя | Высокая | Низкая |
| **Производительность** | Максимальная (Статика) | Высокая (Кэширование) | Высокая (esbuild) | Низкая (JS на клиенте) |

### **3.2 Глубокий анализ решений**

#### **3.2.1 next-mdx-remote — Золотой стандарт для CMS**

Для платформы, где контент хранится в CMS (Contentful, Strapi) или генерируется AI, библиотека next-mdx-remote является оптимальным выбором.2  
В версии 5+ она предоставляет специальный импорт next-mdx-remote/rsc, который разработан специально для React Server Components. Это позволяет рендерить MDX на сервере, используя кастомные компоненты, которые могут быть как серверными, так и клиентскими.  
**Преимущества:**

* **Безопасность:** Позволяет изолировать процесс рендеринга.  
* **Гибкость:** Не требует файловой структуры маршрутизации, позволяя загружать контент из любого источника.  
* **Поддержка Tailwind:** Легко интегрируется с классами Tailwind через проп components.11

**Пример реализации с типизацией:**

TypeScript

import { MDXRemote } from 'next-mdx-remote/rsc';  
import { useMDXComponents } from '@/mdx-components';

export async function RemoteMdxPage({ content }: { content: string }) {  
  // Объединение глобальных и локальных компонентов  
  const components \= useMDXComponents({});

  return (  
    \<article className\="prose prose-slate dark:prose-invert max-w-none"\>  
      \<MDXRemote  
        source\={content}  
        components\={components}  
        options\={{  
          parseFrontmatter: true,  
          mdxOptions: {  
             remarkPlugins:,  
             rehypePlugins:  
          }  
        }}  
      /\>  
    \</article\>  
  );  
}

Этот подход обеспечивает баланс между производительностью сервера и интерактивностью клиента.7

#### **3.2.2 mdx-bundler — Мощь esbuild**

Библиотека mdx-bundler от Kent C. Dodds использует esbuild, что делает её чрезвычайно быстрой при компиляции. Её уникальная особенность — возможность импортировать компоненты прямо внутри MDX-файла (например, import Chart from './Chart'), даже если MDX загружается из базы данных. Это достигается за счет бандлинга зависимостей на лету.13

Недостатки в контексте Next.js 15:  
Интеграция с RSC сложнее, так как библиотека возвращает код компонента, который нужно выполнить. В среде Server Components использование new Function() (что делает mdx-bundler под капотом) может вызывать сложности с безопасностью и отладкой. Тем не менее, для платформ с очень сложной логикой зависимостей внутри контента это остается мощным инструментом.15

#### **3.2.3 @next/mdx — Статическое совершенство**

Официальный плагин @next/mdx идеален для статических страниц (например, "О нас", "Политика конфиденциальности"), которые хранятся как файлы .mdx в репозитории. Он компилирует Markdown в JavaScript на этапе сборки приложения (build time) с использованием Rust-компилятора в Next.js (через SWC или Turbopack).7  
Однако для EdTech платформы, где контент динамический (сотни уроков в БД), этот подход не масштабируется.

#### **3.2.4 react-markdown — Устаревающий подход для Next.js**

Использование react-markdown подразумевает отправку сырого Markdown на клиент и его парсинг в браузере. В эпоху Next.js 15 это считается антипаттерном для основного контента, так как увеличивает TTI (Time to Interactive) и LCP (Largest Contentful Paint).3 Его использование оправдано только для предпросмотра комментариев пользователя в реальном времени, где серверный рендеринг (RTT) создавал бы задержку.

### **3.3 Рекомендация для архитектуры**

Для описываемой AI-платформы рекомендуется **гибридная архитектура**:

1. Основной учебный контент рендерится через **next-mdx-remote/rsc** на сервере. Это обеспечивает SEO, скорость и доступность.  
2. Пользовательский ввод (комментарии, ответы в чате с AI) может рендериться на клиенте через react-markdown или мемоизированный серверный экшен, возвращающий стрим UI.

## ---

**4\. Визуальное совершенство: Tailwind CSS 4 и Shadcn/UI**

Образовательный контент требует высокой читаемости и четкой визуальной иерархии. Интеграция Tailwind CSS 4 и библиотеки компонентов shadcn/ui позволяет создать дизайн-систему, которая автоматически применяется к Markdown-контенту.

### **4.1 Tailwind CSS 4: Новый движок стилизации**

Tailwind CSS 4 представляет собой значительный шаг вперед по сравнению с v3. Новый движок, написанный на Rust, обеспечивает мгновенную компиляцию стилей.5

Ключевые изменения для конфигурации:  
Вместо JavaScript-файла tailwind.config.js, конфигурация теперь может полностью жить в CSS файле с использованием директивы @theme.  
Для типографики это означает возможность определять семантические переменные прямо в CSS:

CSS

@import "tailwindcss";  
@plugin "@tailwindcss/typography";

@theme {  
  \--font-display: "Inter", sans-serif;  
  \--font\-body: "Merriweather", serif;  
  \--color\-brand-primary: oklch(0.6 0.15 250);  
}

### **4.2 Плагин @tailwindcss/typography (Prose)**

Этот плагин является стандартом для стилизации HTML, полученного из Markdown. Он предоставляет класс prose, который устанавливает гармоничные размеры шрифтов, отступы и цвета для заголовков, параграфов, списков и цитат.20

Кастомизация для образования:  
Стандартная тема prose ориентирована на блоги. Для учебных материалов требуется адаптация:

* **Контрастность:** Увеличение контраста текста для соответствия стандартам доступности WCAG AAA.  
* **Ширина строки:** Ограничение max-w-prose (около 65 символов) для комфортного чтения, но с возможностью расширения для таблиц и блоков кода.  
* **Цветовые акценты:** Использование переменных CSS темы для ссылок и акцентных элементов, чтобы они соответствовали брендингу платформы.20

Пример настройки tailwind.config.ts (если используется совместимость) или CSS переменных для адаптации prose под темную тему, которая критически важна для разработчиков и студентов, занимающихся по ночам.23

### **4.3 Shadcn/UI и маппинг компонентов**

Библиотека shadcn/ui, основанная на Radix UI и Tailwind, предоставляет набор доступных и стилизуемых компонентов. Мощь MDX заключается в возможности заменять стандартные HTML-теги на компоненты React.6

**Стратегия маппинга (mdx-components.tsx):**

1. **Ссылки (\<a\>):** Заменяются на компонент Link из Next.js для SPA-навигации или на стилизованный компонент с тултипом для глоссария терминов.  
2. **Горизонтальная линия (\<hr\>):** Заменяется на компонент Separator из shadcn/ui для элегантного разделения секций.  
3. **Цитаты (\<blockquote\>):** Это один из самых мощных паттернов. Стандартные цитаты Markdown могут трансформироваться в компоненты **Callout** (или Alert).25

Реализация Callout-компонентов:  
Вместо того чтобы вводить нестандартный синтаксис в Markdown, можно использовать соглашение GitHub Flavored Markdown (GFM) для алертов:  
Это важная информация для студента.  
На уровне rehype или компонента-обертки blockquote можно парсить содержимое. Если строка начинается с , рендерится компонент \`\<Alert variant="info"\>\`. Если , рендерится \<Alert variant="destructive"\>. Это сохраняет совместимость Markdown с другими редакторами, но дает богатый UI на платформе.26

**Пример кода маппинга:**

TypeScript

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"

const components \= {  
  blockquote: ({ children }) \=\> {  
    // Логика обнаружения типа алерта  
    const type \= detectAlertType(children);  
    if (type \=== 'warning') {  
      return (  
        \<Alert variant="destructive" className="my-4"\>  
           \<AlertTitle\>Внимание\</AlertTitle\>  
           \<AlertDescription\>{children}\</AlertDescription\>  
        \</Alert\>  
      )  
    }  
    return \<blockquote className="border-l-4 pl-4 italic"\>{children}\</blockquote\>  
  }  
}

## ---

**5\. Математическая типографика: Точность и Производительность**

Для платформ, обучающих точным наукам, рендеринг формул является одной из самых сложных задач. Существует два основных подхода: MathJax и KaTeX.

### **5.1 KaTeX против MathJax**

| Характеристика | KaTeX | MathJax (v3/v4) |
| :---- | :---- | :---- |
| **Скорость рендеринга** | Экстремально высокая | Средняя (сложный движок) |
| **Режим работы** | Синхронный (SSR-friendly) | Асинхронный (в основном) |
| **Вывод** | HTML \+ CSS | HTML / SVG / MathML |
| **Поддержка LaTeX** | Высокая (основной набор) | Полная (включая редкие пакеты) |
| **Размер** | Легковесный | Тяжелый |

**Вердикт:** Для Next.js 15 рекомендуется **KaTeX**. Он позволяет рендерить формулы синхронно на сервере во время генерации HTML. Это предотвращает "сдвиг макета" (CLS \- Cumulative Layout Shift), который происходит при использовании MathJax на клиенте, когда формула "прыгает" после загрузки скрипта.27

### **5.2 Интеграция в Next.js 15**

Пайплайн обработки выглядит следующим образом:

1. **Remark Plugin:** remark-math. Парсит символы $ (инлайн) и $$ (блок) в AST.  
2. **Rehype Plugin:** rehype-katex. Преобразует математические узлы AST в HTML-разметку с классами KaTeX.30

Критический момент — Стилизация:  
KaTeX требует подключения CSS файла. В Next.js 15 App Router этот файл (katex/dist/katex.min.css) следует импортировать в корневой layout.tsx или в компонент-обертку MDX. Если этого не сделать, формулы появятся как неформатированный текст, что неприемлемо.30

### **5.3 Доступность математики (Accessibility)**

Просто отобразить формулу недостаточно. Скринридеры не могут "прочитать" визуальное представление дроби или интеграла.  
rehype-katex поддерживает опцию генерации MathML. Это стандарт разметки, который понимают современные скринридеры (NVDA, VoiceOver).  
Конфигурация должна выглядеть так:

JavaScript

rehypePlugins: \[rehypeKatex, { output: 'htmlAndMathml' }\]

Это создает невидимый блок MathML поверх визуального HTML, обеспечивая идеальную доступность.32

## ---

**6\. Техническая документация и подсветка кода**

Для курсов по программированию качество отображения кода напрямую влияет на усвоение материала.

### **6.1 Отказ от Prism.js в пользу Shiki**

Традиционно использовался Prism.js, который работает в браузере и использует регулярные выражения. Это неточно и медленно.  
Современный стандарт — Shiki. Он использует TextMate grammars (те же, что и VS Code), обеспечивая идеальную точность подсветки.  
Главное преимущество в Next.js 15: Shiki работает на сервере (build time/request time). Клиент получает только раскрашенный HTML. Нулевой JavaScript для подсветки кода отправляется в браузер.34

### **6.2 Библиотека rehype-pretty-code**

Это обертка над Shiki, специально созданная для экосистемы MDX. Она предоставляет функции, необходимые для учебников:

* **Подсветка строк:** Возможность выделить строки 3-5, чтобы акцентировать внимание студента.  
* **Подсветка слов:** Выделение конкретных токенов внутри строки.  
* **Номера строк:** Автоматическая генерация.  
* **Заголовки файлов:** Визуализация имени файла над блоком кода.35

Конфигурация темы:  
Shiki позволяет загружать темы VS Code. Для shadcn/ui часто используется тема, совпадающая с цветовой палитрой сайта (например, "Vesper" или кастомная JSON-тема). Важно настроить поддержку темной/светлой темы: rehype-pretty-code может генерировать стили для обоих режимов одновременно, используя CSS-переменные или классы-модификаторы.37

### **6.3 Интерактивность: Копирование кода**

Поскольку подсветка происходит на сервере, блок кода приходит как статический HTML (\<figure\>, \<pre\>, \<code\>). Чтобы добавить кнопку "Копировать", необходимо использовать паттерн клиентской обертки.  
В mdx-components.tsx компонент pre заменяется на клиентский компонент \<CodeBlockWrapper\>, который иньецирует кнопку копирования и логику взаимодействия с Clipboard API, сохраняя при этом серверный HTML внутри.38

## ---

**7\. Визуализация данных: Диаграммы и Таблицы**

Сложные данные требуют особых подходов к рендерингу.

### **7.1 Mermaid.js: Проблема SSR**

Mermaid.js — стандарт для диаграмм в Markdown (flowcharts, sequence diagrams). Однако он полагается на браузерный API (getBBox) для расчета размеров SVG, что делает серверный рендеринг сложным.

Решение 1: Изоморфный рендеринг (Mermaid Isomorphic)  
Использование библиотек, запускающих Headless-браузер (например, Playwright) на сервере для генерации SVG. Это дает идеальный результат без JS на клиенте, но очень ресурсоемко. Подходит для SSG (статической генерации), но может быть слишком медленным для SSR/RSC динамического контента.39  
Решение 2: Ленивая загрузка (Lazy Loading)  
Более прагматичный подход для Next.js 15\.

1. MDX парсер обнаруживает блок кода с языком mermaid.  
2. Заменяет его на кастомный компонент \<MermaidDiagram source={...} /\>.  
3. Этот компонент использует next/dynamic или React.lazy для загрузки тяжелой библиотеки Mermaid только когда диаграмма попадает во viewport.  
   Это сохраняет высокий балл Core Web Vitals (LCP/TBT).41

### **7.2 Таблицы: От адаптивности до интерактивности**

Стандартные HTML-таблицы ужасны на мобильных устройствах.

Уровень 1: Адаптивная обертка  
Любая таблица из Markdown должна быть обернута в div с overflow-x: auto. Это позволяет таблице скроллиться горизонтально, не ломая верстку страницы.  
В Tailwind:

JavaScript

\<div className="my-6 w-full overflow-y-auto"\>  
  \<table className\="w-full text-sm..." {...props} /\>  
\</div\>

Это реализуется через замену компонента table в маппинге MDX.43

Уровень 2: Интерактивность (TanStack Table)  
Если в запросе указаны "сложные таблицы", статики недостаточно. Студентам нужно сортировать данные (например, "Список элементов по атомной массе").  
Архитектурный паттерн:

1. Создать специальный компонент \<DataTable data={json} /\> доступный в MDX.  
2. Использовать **TanStack Table** (headless UI) внутри этого компонента.  
3. Визуализировать его с помощью табличных примитивов shadcn/ui.  
   Это превращает статические данные в мощный инструмент анализа прямо в уроке.45

## ---

**8\. Архитектура доступности (Accessibility)**

Доступность в образовании — это не опция, а юридическое требование (WCAG 2.1/2.2, ADA).

### **8.1 Семантика и навигация**

* **Иерархия заголовков:** Контент внутри MDX не должен содержать \<h1\>, если заголовок страницы уже является \<h1\>. Необходимо программно понижать уровень заголовков в MDX (h1 \-\> h2) через rehype плагины, чтобы сохранить логическую структуру документа.47  
* **Skip Links:** Реализация ссылок "Перейти к основному контенту", позволяющих пользователям клавиатуры пропускать навигационное меню и попадать сразу в учебный материал.48

### **8.2 Доступность сложных элементов**

* **Таблицы:** Обязательное наличие тега \<caption\>. Для сложных таблиц — атрибуты scope="col" и scope="row", помогающие скринридерам понимать связи ячеек.  
* **Код:** Блоки кода должны иметь tabindex="0", чтобы быть доступными для фокуса с клавиатуры, если они имеют скролл.  
* **Диаграммы:** Mermaid диаграммы должны сопровождаться текстовым описанием или атрибутами aria-description, так как SVG часто сложны для интерпретации скринридерами.49

## ---

**9\. Безопасность контента: Защита от RCE и XSS**

Внедрение React Server Components открыло новый вектор атак, известный как "React2Shell" (CVE-2025-55182). Уязвимость связана с небезопасной десериализацией данных в RSC payload.51

### **9.1 Принцип доверенного источника**

Критическое правило: Никогда не передавайте пользовательский ввод (Markdown из комментариев) напрямую в MDXRemote или другие серверные рендеры без строжайшей санации.  
В next-mdx-remote версии 5+ и Next.js 15, если злоумышленник сможет внедрить специально сформированный payload в пропсы компонента, это может привести к удаленному выполнению кода (RCE) на сервере.

### **9.2 Санация и CSP**

* **Rehype-Sanitize:** Использование плагина rehype-sanitize обязательно для любого контента, происхождение которого не на 100% доверено (например, контент, генерируемый AI, если модель скомпрометирована, или User Generated Content). Необходимо настроить схему (schema), разрешающую только безопасные теги и атрибуты, удаляя script, iframe (за исключением разрешенных источников, например YouTube), object.53  
* **Content Security Policy (CSP):** Настройка HTTP-заголовков в next.config.js для запрета загрузки скриптов со сторонних доменов. Использование nonce для инлайн-скриптов.55

## ---

**10\. Производительность и оптимизация доставки**

### **10.1 Кэширование данных**

Next.js 15 предоставляет мощный механизм unstable\_cache (или Data Cache). Парсинг MDX — дорогая операция.  
Результат работы compileMDX или serialize должен кэшироваться.

TypeScript

import { unstable\_cache } from 'next/cache';

const getCachedContent \= unstable\_cache(  
  async (slug) \=\> fetchAndCompileMdx(slug),  
  \['mdx-content'\],  
  { revalidate: 3600 }  
);

Это гарантирует, что тяжелая трансформация Remark/Rehype выполняется один раз, а последующие запросы получают готовый результат мгновенно.56

### **10.2 Анализ бандла**

Необходимо регулярно использовать @next/bundle-analyzer. Библиотеки для работы с MDX часто тянут за собой полифиллы буферов или тяжелые парсеры. Использование серверных компонентов (RSC) для рендеринга позволяет исключить эти библиотеки из клиентского бандла, что является главным преимуществом архитектуры Next.js 15\.57

## ---

**11\. Заключение**

Создание современной образовательной платформы на Next.js 15 — это баланс между мощью серверного рендеринга и интерактивностью клиента. Использование **React Server Components** в связке с **next-mdx-remote** позволяет достичь беспрецедентной производительности при доставке тяжелого контента. Интеграция **Tailwind CSS 4** и **shadcn/ui** обеспечивает визуальную привлекательность и системность дизайна.

Ключ к успеху лежит в деталях: правильной настройке **KaTeX** для математики, использовании **Shiki** для кода и строгом соблюдении стандартов доступности **WCAG**. При этом безопасность (санация контента) должна быть заложена в фундамент архитектуры, учитывая новые риски эпохи RSC. Следуя описанным паттернам, разработчики могут создавать платформы, которые не просто отображают текст, а создают эффективную и инклюзивную среду обучения.

#### **Источники**

1. Advanced Markdown Editor Development with Next.js | by @rnab \- Medium, дата последнего обращения: декабря 9, 2025, [https://arnab-k.medium.com/advanced-markdown-editor-development-with-next-js-f91f7d22353b](https://arnab-k.medium.com/advanced-markdown-editor-development-with-next-js-f91f7d22353b)  
2. Guides: MDX \- Next.js, дата последнего обращения: декабря 9, 2025, [https://nextjs.org/docs/pages/guides/mdx](https://nextjs.org/docs/pages/guides/mdx)  
3. React & Next.js in 2025 \- Modern Best Practices \- Strapi, дата последнего обращения: декабря 9, 2025, [https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices)  
4. Is React 19 going to be the same as Next.js : r/reactjs \- Reddit, дата последнего обращения: декабря 9, 2025, [https://www.reddit.com/r/reactjs/comments/1e0qtry/is\_react\_19\_going\_to\_be\_the\_same\_as\_nextjs/](https://www.reddit.com/r/reactjs/comments/1e0qtry/is_react_19_going_to_be_the_same_as_nextjs/)  
5. MDX with Next.js App Router \- YouTube, дата последнего обращения: декабря 9, 2025, [https://www.youtube.com/watch?v=34bRv6cQezo](https://www.youtube.com/watch?v=34bRv6cQezo)  
6. crafter-station/elements: full-stack shadcn/ui components \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/crafter-station/elements](https://github.com/crafter-station/elements)  
7. Guides: MDX \- Next.js, дата последнего обращения: декабря 9, 2025, [https://nextjs.org/docs/app/guides/mdx](https://nextjs.org/docs/app/guides/mdx)  
8. React Server Components in Next.js 15: A Deep Dive \- DZone, дата последнего обращения: декабря 9, 2025, [https://dzone.com/articles/react-server-components-nextjs-15](https://dzone.com/articles/react-server-components-nextjs-15)  
9. Understanding Server-Side Rendering in Next.js 15: Benefits and Drawbacks \- Medium, дата последнего обращения: декабря 9, 2025, [https://medium.com/@bloodturtle/understanding-server-side-rendering-in-next-js-15-benefits-and-drawbacks-5f4a11346666](https://medium.com/@bloodturtle/understanding-server-side-rendering-in-next-js-15-benefits-and-drawbacks-5f4a11346666)  
10. Using next-mdx-remote as alternative to react-markdown \- Help \- Vercel Community, дата последнего обращения: декабря 9, 2025, [https://community.vercel.com/t/using-next-mdx-remote-as-alternative-to-react-markdown/2629](https://community.vercel.com/t/using-next-mdx-remote-as-alternative-to-react-markdown/2629)  
11. hashicorp/next-mdx-remote: Load MDX content from anywhere \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/hashicorp/next-mdx-remote](https://github.com/hashicorp/next-mdx-remote)  
12. Step-by-Step Tutorial: Building a Blog with Next.js and MDX \- Dimitris Anastasiadis, дата последнего обращения: декабря 9, 2025, [https://dimitrisanastasiadis.com/blog/how-to-create-a-blog-with-nextjs-and-mdx](https://dimitrisanastasiadis.com/blog/how-to-create-a-blog-with-nextjs-and-mdx)  
13. MDX Bundler with Next.JS \- Adam Laycock, дата последнего обращения: декабря 9, 2025, [https://alaycock.co.uk/2021/03/mdx-bundler](https://alaycock.co.uk/2021/03/mdx-bundler)  
14. Comparison of MDX integration strategies with Next.js \- DEV Community, дата последнего обращения: декабря 9, 2025, [https://dev.to/tylerlwsmith/quick-comparison-of-mdx-integration-strategies-with-next-js-1kcm](https://dev.to/tylerlwsmith/quick-comparison-of-mdx-integration-strategies-with-next-js-1kcm)  
15. MDX bundler with Next.JS | iamyadav, дата последнего обращения: декабря 9, 2025, [https://www.iamyadav.com/blogs/use-mdx-bundler-with-next-js](https://www.iamyadav.com/blogs/use-mdx-bundler-with-next-js)  
16. Configuring: MDX \- Next.js, дата последнего обращения: декабря 9, 2025, [https://nextjs.org/docs/13/app/building-your-application/configuring/mdx](https://nextjs.org/docs/13/app/building-your-application/configuring/mdx)  
17. remarkjs/react-markdown: Markdown component for React \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)  
18. How do I render Markdown from a React component? \- Stack Overflow, дата последнего обращения: декабря 9, 2025, [https://stackoverflow.com/questions/31875748/how-do-i-render-markdown-from-a-react-component](https://stackoverflow.com/questions/31875748/how-do-i-render-markdown-from-a-react-component)  
19. Theme variables \- Core concepts \- Tailwind CSS, дата последнего обращения: декабря 9, 2025, [https://tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme)  
20. Style rendered Markdown with Tailwind Typography \- Astro Docs, дата последнего обращения: декабря 9, 2025, [https://docs.astro.build/en/recipes/tailwind-rendered-markdown/](https://docs.astro.build/en/recipes/tailwind-rendered-markdown/)  
21. Introducing Tailwind CSS Typography, дата последнего обращения: декабря 9, 2025, [https://tailwindcss.com/blog/tailwindcss-typography](https://tailwindcss.com/blog/tailwindcss-typography)  
22. tailwindlabs/tailwindcss-typography: Beautiful typographic defaults for HTML you don't control. \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/tailwindlabs/tailwindcss-typography](https://github.com/tailwindlabs/tailwindcss-typography)  
23. Building Responsive Tables with Tailwind CSS \- Tailkits, дата последнего обращения: декабря 9, 2025, [https://tailkits.com/blog/tailwind-responsive-tables/](https://tailkits.com/blog/tailwind-responsive-tables/)  
24. Versatile Accordion Component Built with ShadCN and MDX Support \- MDX Blog, дата последнего обращения: декабря 9, 2025, [https://www.mdxblog.io/blog/versatile-accordion-component-with-shadcn-and-mdx-support](https://www.mdxblog.io/blog/versatile-accordion-component-with-shadcn-and-mdx-support)  
25. Components \- Taxonomy \- shadcn, дата последнего обращения: декабря 9, 2025, [https://tx.shadcn.com/docs/documentation/components](https://tx.shadcn.com/docs/documentation/components)  
26. Easy call-outs with blockquote, MDX, and Rehype \- Ty Barho, дата последнего обращения: декабря 9, 2025, [https://www.tybarho.com/articles/easy-callout-content-with-rehype-plugins](https://www.tybarho.com/articles/easy-callout-content-with-rehype-plugins)  
27. I used to think KaTeX was far superior to MathJax but now I'm not so sure. I mad... | Hacker News, дата последнего обращения: декабря 9, 2025, [https://news.ycombinator.com/item?id=31441979](https://news.ycombinator.com/item?id=31441979)  
28. Next math renderer MathJax v3 versus KaTeX? \- Meta Stack Exchange, дата последнего обращения: декабря 9, 2025, [https://meta.stackexchange.com/questions/338933/next-math-renderer-mathjax-v3-versus-katex](https://meta.stackexchange.com/questions/338933/next-math-renderer-mathjax-v3-versus-katex)  
29. compare performance MathJax vs MathQuill vs Katex \- Stack Overflow, дата последнего обращения: декабря 9, 2025, [https://stackoverflow.com/questions/27217242/compare-performance-mathjax-vs-mathquill-vs-katex](https://stackoverflow.com/questions/27217242/compare-performance-mathjax-vs-mathquill-vs-katex)  
30. How to use KaTex to render math formulas with Nextjs? \- DEV Community, дата последнего обращения: декабря 9, 2025, [https://dev.to/kouliavtsev/how-to-use-katex-to-render-math-formulas-with-nextjs-38p1](https://dev.to/kouliavtsev/how-to-use-katex-to-render-math-formulas-with-nextjs-38p1)  
31. How to use KaTeX in next.js \#15479 \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/vercel/next.js/discussions/15479](https://github.com/vercel/next.js/discussions/15479)  
32. Options \- KaTeX, дата последнего обращения: декабря 9, 2025, [https://katex.org/docs/options.html](https://katex.org/docs/options.html)  
33. Make KaTeX accessible · Issue \#38 \- GitHub, дата последнего обращения: декабря 9, 2025, [https://github.com/KaTeX/KaTeX/issues/38](https://github.com/KaTeX/KaTeX/issues/38)  
34. Modern Syntax Highlighting with Shiki in Next.js 14 | Nikolai Lehbrink, дата последнего обращения: декабря 9, 2025, [https://www.nikolailehbr.ink/blog/syntax-highlighting-shiki-next-js/](https://www.nikolailehbr.ink/blog/syntax-highlighting-shiki-next-js/)  
35. Code highlighting plugin \- Next.js 15 Tutorial \- Chris.lu, дата последнего обращения: декабря 9, 2025, [https://chris.lu/web\_development/tutorials/next-js-static-first-mdx-starterkit/code-highlighting-plugin](https://chris.lu/web_development/tutorials/next-js-static-first-mdx-starterkit/code-highlighting-plugin)  
36. Rehype Pretty Code | Rehype Pretty, дата последнего обращения: декабря 9, 2025, [https://rehype-pretty.pages.dev/](https://rehype-pretty.pages.dev/)  
37. How you guys using mdx-remote with rehype-pretty-code? : r/nextjs \- Reddit, дата последнего обращения: декабря 9, 2025, [https://www.reddit.com/r/nextjs/comments/155mc7w/how\_you\_guys\_using\_mdxremote\_with\_rehypeprettycode/](https://www.reddit.com/r/nextjs/comments/155mc7w/how_you_guys_using_mdxremote_with_rehypeprettycode/)  
38. rehype-mdx-code-props is not working correctly with nextjs app router \- Stack Overflow, дата последнего обращения: декабря 9, 2025, [https://stackoverflow.com/questions/78982077/rehype-mdx-code-props-is-not-working-correctly-with-nextjs-app-router](https://stackoverflow.com/questions/78982077/rehype-mdx-code-props-is-not-working-correctly-with-nextjs-app-router)  
39. remcohaszing/mermaid-isomorphic: Transform mermaid diagrams in the browser or Node.js, дата последнего обращения: декабря 9, 2025, [https://github.com/remcohaszing/mermaid-isomorphic](https://github.com/remcohaszing/mermaid-isomorphic)  
40. mermaid-isomorphic in mcp-mermaid codebase. \- DEV Community, дата последнего обращения: декабря 9, 2025, [https://dev.to/ramunarasinga-11/mermaid-isomorphic-in-mcp-mermaid-codebase-41jl](https://dev.to/ramunarasinga-11/mermaid-isomorphic-in-mcp-mermaid-codebase-41jl)  
41. Guides: Lazy Loading | Next.js, дата последнего обращения: декабря 9, 2025, [https://nextjs.org/docs/app/guides/lazy-loading](https://nextjs.org/docs/app/guides/lazy-loading)  
42. Lazy Loading the Mermaid Diagram Library \- Rick Strahl's Web Log, дата последнего обращения: декабря 9, 2025, [https://weblog.west-wind.com/posts/2025/May/10/Lazy-Loading-the-Mermaid-Diagram-Library](https://weblog.west-wind.com/posts/2025/May/10/Lazy-Loading-the-Mermaid-Diagram-Library)  
43. How to build a scrollable table with a sticky header using Tailwind CSS \- Michael Andreuzza, дата последнего обращения: декабря 9, 2025, [https://michael-andreuzza.medium.com/how-to-build-a-scrollable-table-with-a-sticky-header-using-tailwind-css-1a07b6ce9295](https://michael-andreuzza.medium.com/how-to-build-a-scrollable-table-with-a-sticky-header-using-tailwind-css-1a07b6ce9295)  
44. html \- Horizontal scroll on overflow of table, дата последнего обращения: декабря 9, 2025, [https://stackoverflow.com/questions/19794211/horizontal-scroll-on-overflow-of-table](https://stackoverflow.com/questions/19794211/horizontal-scroll-on-overflow-of-table)  
45. A complete guide to TanStack Table (formerly React Table) \- Contentful, дата последнего обращения: декабря 9, 2025, [https://www.contentful.com/blog/tanstack-table-react-table/](https://www.contentful.com/blog/tanstack-table-react-table/)  
46. I built a lightweight React table with per-column filtering and sorting : r/reactjs \- Reddit, дата последнего обращения: декабря 9, 2025, [https://www.reddit.com/r/reactjs/comments/1oqvnbp/i\_built\_a\_lightweight\_react\_table\_with\_percolumn/](https://www.reddit.com/r/reactjs/comments/1oqvnbp/i_built_a_lightweight_react_table_with_percolumn/)  
47. Technique: Structuring content \- Harvard Digital Accessibility Services, дата последнего обращения: декабря 9, 2025, [https://accessibility.huit.harvard.edu/technique-structuring-content](https://accessibility.huit.harvard.edu/technique-structuring-content)  
48. Accessibility \- Visual Studio Code, дата последнего обращения: декабря 9, 2025, [https://code.visualstudio.com/docs/configure/accessibility/accessibility](https://code.visualstudio.com/docs/configure/accessibility/accessibility)  
49. Accessibility Best Practices Checklist \- Open edX Documentation, дата последнего обращения: декабря 9, 2025, [https://docs.openedx.org/en/latest/educators/references/accessibility/accessibility\_best\_practices\_checklist.html](https://docs.openedx.org/en/latest/educators/references/accessibility/accessibility_best_practices_checklist.html)  
50. WebAIM's WCAG 2 Checklist, дата последнего обращения: декабря 9, 2025, [https://webaim.org/standards/wcag/checklist](https://webaim.org/standards/wcag/checklist)  
51. Critical RSC Bugs in React and Next.js Allow Unauthenticated Remote Code Execution, дата последнего обращения: декабря 9, 2025, [https://thehackernews.com/2025/12/critical-rsc-bugs-in-react-and-nextjs.html](https://thehackernews.com/2025/12/critical-rsc-bugs-in-react-and-nextjs.html)  
52. React Server Components RCE: Impact on Next.js and ecosystem dependencies, дата последнего обращения: декабря 9, 2025, [https://fieldeffect.com/blog/react-server-components-rce](https://fieldeffect.com/blog/react-server-components-rce)  
53. Cross Site Scripting Prevention \- OWASP Cheat Sheet Series, дата последнего обращения: декабря 9, 2025, [https://cheatsheetseries.owasp.org/cheatsheets/Cross\_Site\_Scripting\_Prevention\_Cheat\_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)  
54. rehype-sanitize \- npm Package Security Analysis \- Socket.dev, дата последнего обращения: декабря 9, 2025, [https://socket.dev/npm/package/rehype-sanitize/overview/4.0.0](https://socket.dev/npm/package/rehype-sanitize/overview/4.0.0)  
55. Mitigate cross-site scripting (XSS) with a strict Content Security Policy (CSP) \- web.dev, дата последнего обращения: декабря 9, 2025, [https://web.dev/articles/strict-csp](https://web.dev/articles/strict-csp)  
56. Optimizing Build Strategy for High-Traffic Next.js Site with Real-Time and Personalized Data, дата последнего обращения: декабря 9, 2025, [https://www.reddit.com/r/nextjs/comments/1d1hvon/optimizing\_build\_strategy\_for\_hightraffic\_nextjs/](https://www.reddit.com/r/nextjs/comments/1d1hvon/optimizing_build_strategy_for_hightraffic_nextjs/)  
57. How we optimized our Next.js app for web performance \- Medium, дата последнего обращения: декабря 9, 2025, [https://medium.com/typeforms-engineering-blog/how-we-optimized-our-next-js-site-for-web-performance-88bed643c85c](https://medium.com/typeforms-engineering-blog/how-we-optimized-our-next-js-site-for-web-performance-88bed643c85c)