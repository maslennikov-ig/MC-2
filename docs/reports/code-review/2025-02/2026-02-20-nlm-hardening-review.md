# Code Review Report: NLM Audio/Video Production Hardening

**Date**: 2026-02-20
**Scope**: Stage 7 NLM Audio/Video pipeline (stage7 commit `0e312599`)
**Reviewer**: code-reviewer agent
**Status**: PARTIAL — critical bug and several improvements required

---

## Executive Summary

The NLM Audio/Video Production Hardening implementation is architecturally sound: the Python bridge
is well-structured, auth is done correctly, the TypeScript client handles edge cases carefully, and
the two-stage handler flow is clean. However there is one runtime crash that will fire in production
under a specific (but non-exotic) condition, plus significant code duplication that will cause the
audio and video handlers to silently diverge over time.

| Category  | Count |
| --------- | ----- |
| Critical  | 1     |
| High      | 3     |
| Medium    | 4     |
| Low       | 5     |
| Test gaps | 6     |

---

## Bugs

### [CRITICAL] `asyncio` used without import in `generator.py:299`

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`, line 299

**Description**: The fallback path inside `_wait_for_sources_ready` calls `asyncio.gather()`, but
`asyncio` is never imported. The file's imports are:

```python
import importlib, io, logging, math, tempfile, wave
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Protocol, runtime_checkable
```

**When it fires**: Every time `client.sources.wait_for_sources` does not exist as a callable on the
notebooklm-py client. Given that `wait_for_sources` is a non-standard batch helper that may not be
present in all versions of notebooklm-py, the fallback path is designed to be reached. When it is
reached, Python raises `NameError: name 'asyncio' is not defined` and the entire generation request
fails — even when `notebooklm_allow_fallback=True` is configured, because the fallback applies to
`MediaGenerationError` / `MediaGenerationTimeoutError`, not to `NameError`.

**Fix**: Add `import asyncio` at the top of `generator.py`.

```python
# Add to the imports block at the top of generator.py
import asyncio
```

---

### [HIGH] `getLessonContent` called twice per request in `nlm-audio-handler.ts`

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`, lines 222 and 285

**Description**: `generateDraft` fetches the lesson content at line 222 to build the prompt. Then
`generateFinal` independently fetches it again at line 285 to build the source bundle. The draft
result object is the bridge between the two phases, but the lesson content is not carried in it.
This doubles the database round-trip on every generation request.

**Impact**: Extra latency and load on every two-stage NLM audio generation. The video handler does
not have this problem because it delegates draft generation entirely to `videoHandler.generateDraft`.

**Fix**: Add `rawLessonContent` to `NlmAudioDraft` (or pass it through `DraftResult.metadata`) so
`generateFinal` can reuse what `generateDraft` already loaded. Alternatively, cache at the handler
scope if the handler is reconstructed per call.

---

### [HIGH] Video bridge call omits `voice` field; audio bridge call includes it

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`, lines 320-331

**Description**: `generateAudio` passes `voice: request.voice` to the bridge (line 295).
`generateVideoOverview` does not pass `voice` at all — the field is silently dropped. The Python
bridge `MediaGenerationRequest` model accepts `voice` for both media types, and `_build_instructions`
uses it for both audio and video:

```python
# generator.py line 344-345
if request.voice:
    return f"{base} Voice preference: {request.voice}."
```

So voice preference is respected when generating audio but silently ignored when generating video,
even though the underlying API accepts it and the Python model is defined to use it.

**Fix**: Add `voice: request.voice` to the body object in `generateVideoOverview`.

---

### [HIGH] Dead code in `_resolve_sources`: redundant `if resolved:` guard

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`, lines 271-277

**Description**:

```python
def _resolve_sources(self, request: MediaGenerationRequest) -> list[tuple[str, str]]:
    if request.sources:                                          # sources is truthy (non-empty list)
        resolved = [(source.title, source.content) for source in request.sources]
        if resolved:                                             # always True here
            return resolved
    return [(f"{request.lesson_title} Script", request.script)]
```

When `request.sources` is truthy (i.e. a non-empty list), the list comprehension is a 1:1 map over
the same list and will always produce a non-empty result. The `if resolved:` check on line 274 can
never be False. This is not a crash, but it is misleading — a future reader might try to add a
filtering comprehension here and be confused about why the outer guard is needed.

**Fix**: Remove the inner `if resolved:` guard or collapse the two conditions:

```python
def _resolve_sources(self, request: MediaGenerationRequest) -> list[tuple[str, str]]:
    if request.sources:
        return [(source.title, source.content) for source in request.sources]
    return [(f"{request.lesson_title} Script", request.script)]
```

---

## Code Quality and Duplication

### [MEDIUM] Six items duplicated verbatim between `nlm-audio-handler.ts` and `nlm-video-handler.ts`

The following are copied character-for-character between the two handler files:

| Item                                                                             | Audio handler line | Video handler line |
| -------------------------------------------------------------------------------- | ------------------ | ------------------ |
| `type NlmSourceStrategy`                                                         | 39                 | 32                 |
| `NLM_SOURCE_STRATEGIES` array                                                    | 41                 | 34                 |
| `NLM_DEFAULT_SOURCE_STRATEGY`                                                    | 49                 | 48                 |
| `isStringInSet<T>()` function                                                    | 104-106            | 118-120            |
| `resolveSourceStrategy()` function                                               | 108-114            | 122-128            |
| `buildObjectivesAndMetadataSource()` function                                    | 132-159            | 146-173            |
| `buildNotebookLMSources()` function (structurally identical, param name differs) | 161-207            | 175-221            |

`NlmSourceStrategy` is also defined a third time in `enrichment-settings.ts` as
`nlmSourceStrategySchema` / `NlmSourceStrategy`, and a fourth time as
`onDemandNlmSourceStrategySchema` in `enrichment-on-demand.ts` (not reusing the settings schema).

**Impact**: Any behavioural change to `buildObjectivesAndMetadataSource` or `resolveSourceStrategy`
must be made in two places. The only difference between the two `buildNotebookLMSources`
implementations is the `script` vs `fullScript` parameter name — they are identical in logic.

**Fix**: Extract a shared module, e.g.:

```
handlers/nlm-shared.ts
```

Containing: `NlmSourceStrategy`, `NLM_SOURCE_STRATEGIES`, `NLM_DEFAULT_SOURCE_STRATEGY`,
`isStringInSet`, `resolveSourceStrategy`, `buildObjectivesAndMetadataSource`,
`buildNotebookLMSources`. Both handlers import from there. The `buildNotebookLMSources` signature
can use a single `script` parameter name.

Additionally, `onDemandNlmSourceStrategySchema` in `enrichment-on-demand.ts` should reuse
`nlmSourceStrategySchema` from `enrichment-settings.ts` rather than re-declaring the enum values.

---

### [MEDIUM] `quality_score: 1.0` hardcoded in both handlers

**Files**:

- `nlm-audio-handler.ts` line 337
- `nlm-video-handler.ts` line 305

**Description**: Both handlers emit `quality_score: 1.0` unconditionally for every generation
result — including fallback results from the Python bridge. The score does not reflect any actual
quality signal. Any downstream dashboard or analytics that aggregates this field will report 100%
quality for all NLM enrichments permanently.

**Fix**: Either remove the field (if NLM quality cannot be meaningfully computed), set it to `null`
or `undefined`, or compute it from available signals (e.g. whether the bridge used a fallback, the
estimated vs actual duration ratio).

---

### [MEDIUM] `getBridgeConfig()` reads environment variables on every call

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`, lines 78-106

**Description**: `getBridgeConfig()` is called once per `generateAudio` and once per
`generateVideoOverview`. In a long-lived worker process, `process.env` is effectively static, so
reading and re-validating it per call adds minor unnecessary work. More importantly, it means a
misconfigured environment will throw on the first generation call rather than at startup, making
misconfiguration harder to detect quickly.

**Fix**: Move config resolution to module initialization or use a lazily-evaluated constant:

```typescript
let _bridgeConfig: NotebookLMBridgeConfig | null = null;

function getBridgeConfig(): NotebookLMBridgeConfig {
  if (!_bridgeConfig) {
    _bridgeConfig = resolveBridgeConfig(); // throws on bad env
  }
  return _bridgeConfig;
}
```

This also makes testing easier since config errors surface at module load time, not mid-test.

---

### [MEDIUM] `MediaSourceInput.content` has no `max_length` constraint

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/models.py`, line 12

**Description**: `content: str = Field(..., min_length=1)` accepts unbounded input. A caller
(the TS handlers) currently sends the full raw lesson content as one of the sources. NotebookLM has
its own limits, but an unbounded field on the Python side means arbitrarily large payloads can reach
the bridge and cause memory pressure or opaque upstream errors. There is no server-side guard.

**Compare**: `lesson_title` has `max_length=300`, `voice` has `max_length=128` — but `content`
(which holds full lesson text) has none.

**Fix**: Add a reasonable upper bound:

```python
content: str = Field(..., min_length=1, max_length=200_000)  # ~150k word cap
```

And validate the same bound on the TS side before calling the bridge.

---

### [LOW] `_build_fallback_audio_bytes` always produces a 1-second 440 Hz tone regardless of script length

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`, lines 429-452

**Description**: The fallback audio is a fixed 1-second sine wave. The `GenerationResult` returned
alongside it correctly uses `_estimate_duration_seconds(request.script, "audio")` for
`duration_seconds`, so the metadata carries an estimated reading time. But the actual bytes are
always exactly 1 second. Anyone who relies on the returned bytes for playback will get a 1-second
beep regardless of script length. This is arguably intentional (it is a placeholder), but it is not
documented as such on the result object and there is no `placeholder: true` field on the
`GenerationResult` dataclass — only in the metadata dict.

**Fix**: Add a `placeholder: bool = False` field to `GenerationResult`, and set it to `True` when
returning from `_fallback_result`. This makes downstream consumers able to detect and handle
placeholder results appropriately.

---

### [LOW] Video fallback result encodes the script as `application/octet-stream`

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`, lines 395-397

**Description**:

```python
else:  # media_type == "video"
    media_bytes = request.script.encode("utf-8")
    mime_type = "application/octet-stream"
    extension = "bin"
```

The video fallback returns the raw script text encoded as UTF-8 bytes with mime type
`application/octet-stream`. This is extremely opaque for downstream consumers. There is no way to
know programmatically that the bytes are UTF-8 text without inspecting them.

**Fix**: Use `text/plain; charset=utf-8` as the mime type and `txt` as the extension, or define a
structured JSON fallback format so consumers can detect and display it gracefully.

---

### [LOW] `lru_cache` on `_build_default_generator` is never invalidated in tests

**File**: `packages/course-gen-platform/docker/notebooklm-bridge/app/main.py`, lines 25-27

**Description**: `_build_default_generator` is decorated with `@lru_cache(maxsize=1)` and
constructs the generator at first call. The test fixture correctly overrides `get_media_generator`
via `app.dependency_overrides`, so this does not affect correctness in tests. However if tests were
ever written that call `_build_default_generator` directly, the cache would leak state between tests.
The current design is fine but fragile — note it as a maintenance concern.

---

### [LOW] `audio_base64` searched before `video_base64` in `parseMediaPayload` for all media types

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`, lines 187-194

**Description**:

```typescript
const base64Value = getStringValue(payload, [
    'audio_base64',   // checked first for BOTH audio and video
    'video_base64',
    ...
]);
```

`parseMediaPayload` is called with different `defaults` for audio vs video, but the key search order
is the same for both. If a video response ever contained both `audio_base64` and `video_base64`, the
audio field would win. In practice the bridge returns only the correct field, so this does not cause
a bug today. But it is an implementation detail that should be made explicit.

**Fix**: Pass the media-type-specific primary key as first in the list at each call site, or split
`parseMediaPayload` into `parseAudioPayload` / `parseVideoPayload`.

---

## Security Considerations

### Auth implementation is correct

`auth.py` uses `secrets.compare_digest` for constant-time token comparison (line 26). This
correctly mitigates timing attacks. The bearer scheme check is correct. No issues here.

### Token in TS client is never logged

`notebooklm-bridge-client.ts` constructs the `Authorization` header directly in `postToBridge` and
the config object is local to the function. The token does not appear in any log call. Good.

### No secrets in code

Neither the TS handlers nor the Python bridge hardcode any credentials. Configuration is exclusively
via environment variables. Good.

### Script content is passed directly to NotebookLM

Both handlers pass `normalizedDraft.script` as the `script` field and also as part of the source
bundle. This content comes from LLM-generated output (not raw user input), so injection risk is low.
However if user-provided content ever flows through, the absence of sanitization between lesson
content and NotebookLM sources should be reconsidered.

---

## Test Coverage Gaps

### 1. No test for the `asyncio` crash path

There is no test that exercises the `_wait_for_sources_ready` fallback path (i.e. when
`client.sources.wait_for_sources` is absent). Adding such a test would have caught the missing
import immediately.

**Suggested test**: Mock `client.sources` without a `wait_for_sources` attribute, assert that
individual `wait_until_ready` calls are made and that the method completes successfully.

### 2. No test for bridge timeout in TS client

`postToBridge` uses `AbortController` with a configurable timeout. There is no test that verifies
the abort fires correctly when the timeout elapses, nor that the error is propagated as expected.

**Suggested test**: Mock `fetch` to delay beyond the timeout, assert the call rejects with an
abort-related error.

### 3. No test for bridge HTTP error responses in TS client

The test suite covers the happy path and missing config. It does not cover:

- HTTP 502 from the bridge (generation failed)
- HTTP 504 from the bridge (generation timed out)
- HTTP 401 (wrong token)
- Non-JSON response body

All of these code paths exist in `postToBridge` and are untested.

### 4. No test for `parseDraft` failure path in `nlm-video-handler.ts`

`parseDraft` throws `'Draft does not contain a valid video script'` when neither Zod parse nor the
plain script fallback succeeds. There is no test covering this branch. This path is reachable
whenever `videoHandler.generateDraft` produces unexpected output.

### 5. No test for empty sources in `raw_only` strategy

When `nlm_source_strategy` is `raw_only` and `rawLessonContent` is null (database returns nothing),
`buildNotebookLMSources` falls through to the emergency `sources.push(scriptSource)` guard. This
guard exists but is not tested. A test that passes `rawLessonContent: null` with `raw_only` strategy
should verify that the script source is used as fallback.

### 6. No test for `nlm-video-handler` draft phase

`generateDraft` in `nlm-video-handler.ts` delegates to `videoHandler.generateDraft`. The mock in
`stage7-nlm-video-handler.test.ts` sets `generateDraft: vi.fn()` but never asserts it was called
(the tests only call `generateFinal` directly). The wiring between draft and final generation is
untested.

---

## Summary Table

| #   | Severity | File                                  | Issue                                                                   |
| --- | -------- | ------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Critical | `generator.py:299`                    | `asyncio.gather()` used without `import asyncio` — NameError at runtime |
| 2   | High     | `nlm-audio-handler.ts:222,285`        | `getLessonContent` called twice per request                             |
| 3   | High     | `notebooklm-bridge-client.ts:320-331` | `voice` field omitted from video bridge call                            |
| 4   | High     | `generator.py:274`                    | Dead code — `if resolved:` is always True                               |
| 5   | Medium   | Both handlers                         | ~7 items duplicated verbatim; will diverge                              |
| 6   | Medium   | Both handlers                         | `quality_score: 1.0` hardcoded — meaningless metric                     |
| 7   | Medium   | `notebooklm-bridge-client.ts:78`      | `getBridgeConfig` re-reads env vars per call                            |
| 8   | Medium   | `models.py:12`                        | `content` field has no `max_length` — unbounded payload                 |
| 9   | Low      | `generator.py:429`                    | Fallback audio always 1 second regardless of script length              |
| 10  | Low      | `generator.py:395`                    | Video fallback mime type is `application/octet-stream`                  |
| 11  | Low      | `generator.py:25`                     | `lru_cache` on generator fragile in test environments                   |
| 12  | Low      | `notebooklm-bridge-client.ts:187`     | `audio_base64` checked before `video_base64` for all types              |
| 13  | Low      | `enrichment-on-demand.ts:94`          | Source strategy enum redeclared instead of reusing shared schema        |

---

## Required Actions Before Next Deployment

1. **Fix**: Add `import asyncio` to `generator.py` (fixes issue 1, blocks production correctness)
2. **Fix**: Add `voice` to video bridge payload in `notebooklm-bridge-client.ts:generateVideoOverview`
3. **Consider**: Extract `nlm-shared.ts` to eliminate handler duplication (before the handlers diverge further)
4. **Consider**: Add a test for the `_wait_for_sources_ready` fallback path to prevent regressions

Issues 5-13 are recommended but not blocking.
