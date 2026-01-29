# План: Исправление бага с повторной генерацией clarifying questions

## Статус: ВЫПОЛНЕНО

**Commit**: `1ed07253`
**Push**: develop
**Beads**: mc2-jv8s (closed)

---

## Проблема

После ответа на все вопросы и нажатия "Продолжить генерацию", система заново запускала генерацию вопросов и добавляла дубликаты.

## Корневая причина

В `orchestrator.ts` проверка `pendingQuestions.length === 0` не различала:

- A) Первый запуск (вопросы не генерировались)
- B) Все вопросы отвечены (статус `answered`)

## Исправление

```typescript
// До:
const pendingQuestions = await getPendingQuestions(courseId);
if (pendingQuestions.length === 0) {
  /* генерируем */
}

// После:
const pendingQuestions = await getPendingQuestions(courseId);
const answeredQuestions = await getAnsweredQuestions(courseId);
const hasExistingQuestions = pendingQuestions.length > 0 || answeredQuestions.length > 0;

if (!hasExistingQuestions) {
  /* генерируем только если нет вопросов вообще */
}
```

---

## Дополнительно: Итеративная генерация (Round 2)

Инфраструктура для второго раунда вопросов **реализована** в `phase-0.5-clarifying.ts`, но **не используется** в оркестраторе. Решение: оставить как есть (один раунд достаточен).
