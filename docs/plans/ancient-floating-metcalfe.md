# План: Добавить inline feedback после applyProposal

**Issue:** mc2-cnce
**Решение:** Inline сообщение в истории чата

## Проблема

Toast `'Изменения применены'` уже существует (useRefinement.ts:64), но незаметен в правом нижнем углу — пользователь его не видит.

## Решение

Добавить system-сообщение прямо в историю чата после успешного apply:

```
✅ Изменения применены (7 полей обновлено)
```

## Файлы для изменения

### 1. `packages/web/components/generation-graph/hooks/useRefinement.ts`

**Изменить тип ChatMessage** (строка 6-10):

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // добавить 'system'
  content: string;
  timestamp: string;
}
```

**Добавить system message после успешного apply** (после строки 64):

```typescript
toast.success('Изменения применены');

// Добавить inline feedback в историю чата
const updateCount = previousProposal.type === 'field_updates' ? previousProposal.updates.length : 1;
setChatHistory(prev => [
  ...prev,
  {
    role: 'system',
    content: `✅ Изменения применены (${updateCount} ${updateCount === 1 ? 'поле обновлено' : 'полей обновлено'})`,
    timestamp: new Date().toISOString(),
  },
]);
```

**Добавить error message при ошибке** (после строки 80):

```typescript
toast.error(errorMsg);

// Добавить inline error в историю чата
setChatHistory(prev => [
  ...prev,
  {
    role: 'system',
    content: `❌ Ошибка: ${errorMsg}`,
    timestamp: new Date().toISOString(),
  },
]);
```

### 2. `packages/web/components/generation-graph/panels/RefinementChat.tsx`

**Обновить тип ChatMessage** (строка 25-30):

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // добавить 'system'
  content: string;
  timestamp: string;
  pending?: boolean;
}
```

**Добавить рендеринг system-сообщений** (в map блок, около строки 248-278):

```tsx
{msg.role === 'system' ? (
  <div
    className={cn(
      'max-w-[90%] rounded-lg px-3 py-2 text-sm',
      msg.content.startsWith('✅')
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
    )}
  >
    {msg.content}
  </div>
) : msg.role === 'assistant' ? (
  // существующий код для assistant...
```

## Верификация

1. Запустить dev сервер: `pnpm dev`
2. Открыть курс на Stage 5 awaiting approval
3. Написать в чат "добавь больше примеров"
4. Дождаться proposal
5. Нажать "Принять"
6. **Проверить:**
   - В истории чата появилось зелёное сообщение `✅ Изменения применены (N полей обновлено)`
   - Toast также показался (опционально)
   - При ошибке — красное сообщение `❌ Ошибка: ...`

## Type-check

```bash
cd packages/web && pnpm type-check
```
