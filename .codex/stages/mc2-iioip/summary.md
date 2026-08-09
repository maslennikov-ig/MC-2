# Stage `mc2-iioip` — prompt-check heading compatibility

Status: accepted in external commit `fada910`; external branch integration pending.

## Classification and boundary

Root-owned shared-tool compatibility slice. The boundary is required-section recognition in
`orch-prompts prompt-check`: existing `Label:` prompts and equivalent Markdown headings must both
work without changing budgets, warning rules, or native same-session prompt routing.

## Acceptance intent

- reproduce the five missing-section failures for a valid Markdown-heading prompt;
- accept exact heading aliases while preserving the current colon-form parser behavior;
- prove the shared Codex and Claude prompt-check suites and full console validation remain green;
- leave the native four-field `mc2` template on its current contract.

## Next action

Record and close `mc2-iioip`, then confirm `mc2-3gz2m` remains blocked on its required research and
continue with the next accessible Tier 5 item. Merge and push the external branch only during final
delivery.

project-index: reviewed-no-change — no mc2 application package, service, import, or public facade
changed; the implementation is in the separate shared orchestration-console.

docs-reviewed: updated - the external console README documents both supported section forms.

documentation-decision: no external/versioned boundary - section recognition is a local parser
contract proved by repository tests in both supported runtimes.

graph-reviewed: no-change-needed - the mc2 application graph is unchanged and the external
orchestration-console has no Graphify closeout requirement.
