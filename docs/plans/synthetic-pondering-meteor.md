# План: Исправление проблем с Mermaid диаграммами в тёмной теме

## Проблемы (3 штуки)

### Проблема 1: Текст на стрелках не читается

Текст на стрелках (edge labels) практически не виден в тёмной теме - серый текст на тёмном фоне.

### Проблема 2: Текст обрезается в узлах

Длинный текст в узлах обрезается: "Аудитория: Узкая, профессион...", "Каналы: Соцсети, инфлюенсер..."

### Проблема 3: Разный цвет текста в mindmap

В mindmap диаграммах часть узлов имеет белый текст (правильно), а часть - чёрный (неправильно).

## Файл для изменения

`packages/web/components/markdown/components/MermaidDirect.tsx`

## Решения

### 1. Исправить цвет текста на стрелках (строка 17)

```typescript
// Было:
textColor: '#e2e8f0', // slate-200 - низкий контраст

// Стало:
textColor: '#ffffff', // white - максимальный контраст
```

### 2. Добавить обработку edge labels в postProcessSvg (после строки 218)

```typescript
// Force edge label text colors for better contrast
container
  .querySelectorAll('.edgeLabel, .edgeLabels text, .edgeLabel text, .edgeLabel span')
  .forEach(el => {
    const element = el as SVGElement | HTMLElement;
    if (element instanceof SVGElement) {
      element.setAttribute('fill', colors.textColor);
    }
    element.style.color = colors.textColor;
    element.style.fill = colors.textColor;
  });
```

### 3. Добавить обработку mindmap узлов в postProcessSvg

```typescript
// Force mindmap node text colors
container
  .querySelectorAll('.mindmap-node text, .section text, [class*="mindmap"] text')
  .forEach(el => {
    const element = el as SVGElement;
    element.setAttribute('fill', colors.nodeText);
    element.style.fill = colors.nodeText;
  });
```

### 4. Исправить обрезание текста - изменить flowchart config (строка 485-489)

```typescript
flowchart: {
  htmlLabels: true,  // Было false - включить для поддержки переноса
  useMaxWidth: true, // Добавить для адаптивной ширины
  wrappingWidth: 200, // Добавить максимальную ширину текста
},
```

## Верификация

1. Запустить dev-сервер: `pnpm -C packages/web dev`
2. Открыть курс BNM-1906, урок 2 модуля 1
3. Проверить в тёмной теме:
   - [ ] Текст на стрелках читается (белый цвет)
   - [ ] Текст в узлах не обрезается или переносится
   - [ ] Все узлы mindmap имеют белый текст
4. Переключить на светлую тему - убедиться что всё работает
5. Запустить `pnpm type-check`
