# Plan: Очистка stalled тестовой джобы из Redis

## Context

При перезапуске dev-сервера Stage 6 воркер подхватывает stalled тестовую джобу (`stage6-handler-test-1770641937357-9q4udn-8`) из предыдущего запуска. Джоба имеет невалидный UUID (`00000000-0000-0000-test-mlf6lt2h0007`) и бесконечно крутится в цикле генерации, тратя LLM-токены (~53K за 5 попыток).

## Plan

1. Удалить stalled джобу из очереди `stage6-lesson-content` в Redis через Bull Board UI или redis-cli
2. Проверить, что в очереди нет других застрявших тестовых джоб

## Commands

```bash
# Удалить конкретную джобу и все stalled джобы из очереди stage6
redis-cli KEYS "bull:stage6-lesson-content:*"
# Затем удалить stalled джобы через BullMQ API или redis-cli
```

## Verification

- Перезапустить воркер и убедиться, что stalled джоба больше не подхватывается
- Проверить логи на отсутствие ошибок с `00000000-0000-0000-test-*`
