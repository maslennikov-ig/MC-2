# Native Subagent Prompt

Use this four-field shape for a visible same-session Codex subagent. Add a task
reference, selected skill/docs, or artifact path only when the stream needs it.

```md
Goal: <one finished outcome>

Write zone: <owned files/directories; preserve unrelated and concurrent work>

Verification: <focused red/green command when assigned, otherwise: none during work; root final acceptance>

Stop: <scope expansion, ownership conflict, missing required context, or out-of-zone write>
```
