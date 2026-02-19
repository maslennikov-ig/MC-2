# Research: Language Detection Libraries for English Heading Detection in Non-English Content

## Problem Statement

LLM-generated educational content in non-English languages (primarily Russian, but also 18 other languages) sometimes contains English structural markers as headings:

- `## SECTION CONCLUSION`
- `## COURSE SUMMARY`
- `## MODULE INTRODUCTION`
- `## LESSON DIGEST`

These are Latin-script headings in otherwise Cyrillic/CJK/Arabic/etc content. The current `checkLanguageConsistency()` in `content-quality.ts` deliberately **does not** flag Latin characters in Russian content (because technical terms like KPI, CEO, API are legitimate). This is the gap.

The existing plan (`lucky-foraging-conway.md`, Task 3) proposes a regex-based approach. This research evaluates whether a language detection library would be better or if heuristics suffice.

---

## Part 1: Library Comparison

### 1. `franc` / `franc-min`

| Attribute            | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **npm**              | [franc](https://www.npmjs.com/package/franc), [franc-min](https://www.npmjs.com/package/franc-min) |
| **GitHub**           | [wooorm/franc](https://github.com/wooorm/franc)                                                    |
| **Weekly Downloads** | ~140K (most popular)                                                                               |
| **Size**             | franc: 210KB, franc-min: 17KB                                                                      |
| **Dependencies**     | 1 (trigram-utils)                                                                                  |
| **Languages**        | franc: 186, franc-min: 82                                                                          |
| **Algorithm**        | Trigram frequency comparison                                                                       |
| **Native module**    | No (pure JS)                                                                                       |
| **Last updated**     | ~2 years ago                                                                                       |

**Pros:**

- Most popular, well-known, widely documented
- Pure JS, no native compilation
- franc-min is very small (17KB)
- Supports ISO 639-3 codes

**Cons:**

- **Terrible on short text (2-5 words)** -- this is a known, documented limitation
- Default `minLength` is 10 chars; `franc('the')` returns `'und'` or misdetects as Scots
- Official docs say: "franc supports many languages, which means it's easily confused on small samples. Make sure to pass it big documents to get reliable results."
- Overall WiLI benchmark accuracy: 62% (significantly worse than alternatives)
- For 2-word headings like "SECTION CONCLUSION" -- **unreliable**

**Verdict: NOT SUITABLE for our use case (short headings)**

---

### 2. `cld3-asm` (Google CLD3 via WebAssembly)

| Attribute            | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| **npm**              | [cld3-asm](https://www.npmjs.com/package/cld3-asm)    |
| **GitHub**           | [kwonoj/cld3-asm](https://github.com/kwonoj/cld3-asm) |
| **Weekly Downloads** | Low (niche)                                           |
| **Size**             | ~5MB (WASM binary)                                    |
| **Dependencies**     | Multiple (WASM toolchain)                             |
| **Languages**        | 107                                                   |
| **Algorithm**        | Neural network (Google CLD3)                          |
| **Native module**    | No (WASM), but async init required                    |

**Pros:**

- Based on Google's CLD3 (neural network approach, better on short text than n-grams)
- No native compilation (WASM instead)
- `findMostFrequentLanguages()` can detect per-span language
- High accuracy for short text compared to trigram approaches

**Cons:**

- **5MB WASM binary** -- heavy for server-side
- Requires async initialization (`loadModule()` + factory pattern)
- Low adoption, potential maintenance risk
- Complex lifecycle management (must `dispose()` instances)
- Overkill for detecting "is this 2-word heading English?"
- Last significant update: 2020 (v4.0.0)

**Verdict: Technically capable but OVERKILL -- 5MB WASM binary for pattern matching we can do with regex**

---

### 3. `languagedetect`

| Attribute            | Value                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| **npm**              | [languagedetect](https://www.npmjs.com/package/languagedetect)                      |
| **GitHub**           | [FGRibreau/node-language-detect](https://github.com/FGRibreau/node-language-detect) |
| **Weekly Downloads** | ~46-63K                                                                             |
| **Size**             | ~1MB (with language profiles)                                                       |
| **Dependencies**     | 0                                                                                   |
| **Languages**        | 52                                                                                  |
| **Algorithm**        | N-gram frequency (port of PEAR::Text_LanguageDetect)                                |
| **Native module**    | No (pure JS)                                                                        |

**Pros:**

- Zero dependencies
- Simple API (`detect(text)` returns array of [lang, probability])
- Decent community adoption

**Cons:**

- **Poor on short text** -- designed for longer documents
- Limited to 52 languages (all Indo-European focus)
- Does NOT support CJK, Arabic, Devanagari, Thai
- TinyLD's benchmark says: "light but just not accurate enough, really focused on indo-european languages"
- Returns language names (not ISO codes) by default

**Verdict: NOT SUITABLE -- poor short text support, limited language coverage**

---

### 4. `tinyld`

| Attribute            | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| **npm**              | [tinyld](https://www.npmjs.com/package/tinyld)           |
| **GitHub**           | [komodojp/tinyld](https://github.com/komodojp/tinyld)    |
| **Weekly Downloads** | ~32K                                                     |
| **Size**             | ~400KB (node), ~150KB (light)                            |
| **Dependencies**     | 0                                                        |
| **Languages**        | 62 (node), 24 (light)                                    |
| **Algorithm**        | Custom (Tatoeba + UDHR trained, n-gram + word frequency) |
| **Native module**    | No (pure JS)                                             |

**Pros:**

- **Best balance of size, speed, and accuracy for short text**
- Zero dependencies, pure JS
- Claims reliable results from ~24 characters
- Returns ISO 639-1 codes directly
- Both `detect()` and `detectAll()` with confidence scores
- TypeScript package
- Light version available (`tinyld/light`)

**Cons:**

- **Maintenance classified as "Inactive"** -- no new versions in 12+ months (last: 1.3.4, ~2 years ago)
- Still may struggle with 2-word headings (the ~24 char threshold means "SECTION CONCLUSION" at 18 chars is borderline)
- 62 languages (less than franc, but covers our 19)

**Verdict: Best library option IF we needed a library, but still borderline for 2-word headings. Maintenance concern.**

---

### 5. `eld` (Efficient Language Detector / Nito-ELD)

| Attribute            | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **npm**              | [eld](https://www.npmjs.com/package/eld)                                                           |
| **GitHub**           | [nitotm/efficient-language-detector-js](https://github.com/nitotm/efficient-language-detector-js/) |
| **Weekly Downloads** | Low (niche)                                                                                        |
| **Size**             | XS: 940KB, S: ~2MB, M: ~4MB, L: ~8MB                                                               |
| **Dependencies**     | 0                                                                                                  |
| **Languages**        | 60                                                                                                 |
| **Algorithm**        | Custom (optimized n-gram + frequency)                                                              |
| **Native module**    | No (pure JS)                                                                                       |
| **RAM**              | XS: 37MB, S: 54MB, M: 71MB, L: 138MB                                                               |

**Pros:**

- **Best benchmark scores among JS detectors** (especially for tweets/short text)
- Actively maintained (v2.0.2, ~1 month ago)
- Multiple DB sizes (XS for server, L for maximum accuracy)
- Zero dependencies
- Tested specifically on tweets (short sentences, 140 chars max)

**Cons:**

- Low adoption (niche)
- Even XS version uses 37MB RAM
- Large DB sizes may be impractical in a pipeline context
- Still struggles below ~20 chars reliably
- Apache-2.0 license (compatible but worth noting)

**Verdict: Best pure detection accuracy, but heavy RAM footprint and still unreliable for 2-word headings**

---

### 6. `cld` / `cldpre` (CLD2 native)

| Attribute         | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **npm**           | [cld](https://www.npmjs.com/package/cld), [cldpre](https://www.npmjs.com/package/cldpre) |
| **Languages**     | 160+                                                                                     |
| **Algorithm**     | Google CLD2 (native C++)                                                                 |
| **Native module** | Yes (node-gyp required)                                                                  |

**Pros:**

- Highest accuracy on short text among all options
- 160+ languages
- 10x faster than JS alternatives
- `bestEffort` mode for very short text

**Cons:**

- **Native compilation (node-gyp)** -- significant CI/CD pain
- Known build failures on M1/ARM64 Macs, certain Linux configs, Windows
- C++17 incompatibility (`std::unexpected_handler` removed)
- 100MB+ disk footprint for C sources
- Maintenance concerns (many open issues, limited fixes)
- **Deployment risk** in Docker/cloud environments

**Verdict: NOT SUITABLE -- native compilation is a deal-breaker for our Docker-based deployment**

---

## Summary Table

| Library          | Short Text (2-5 words) | Size   | Dependencies | Native    | Maintenance | Our Use Case Fit |
| ---------------- | ---------------------- | ------ | ------------ | --------- | ----------- | ---------------- |
| `franc-min`      | Poor                   | 17KB   | 1            | No        | Stale       | **Bad**          |
| `cld3-asm`       | Good                   | 5MB    | Multiple     | No (WASM) | Stale       | Overkill         |
| `languagedetect` | Poor                   | 1MB    | 0            | No        | Stale       | **Bad**          |
| `tinyld`         | Fair (~24+ chars)      | 400KB  | 0            | No        | Inactive    | Marginal         |
| `eld`            | Good (tweets)          | 940KB+ | 0            | No        | Active      | Heavy            |
| `cld`/`cldpre`   | Excellent              | 100MB+ | Native       | Yes       | Stale       | Infeasible       |

---

## Part 2: The Heuristic Approach (Recommended)

### Why Heuristics Beat Libraries Here

The key insight is that **we don't need general-purpose language detection**. Our problem is extremely narrow:

1. We know the **exact target language** (stored in course metadata)
2. We know the **exact set of English structural markers** the LLM produces
3. We already have **localized labels for all 19 languages** (`CONTENT_LABELS` in `common-enums.ts`)
4. The markers appear as **markdown headings** (prefixed with `#`, `##`, `###`)

This is a **pattern matching problem**, not a language detection problem.

### Existing Infrastructure

The codebase already has:

1. **`CONTENT_LABELS`** (`packages/shared-types/src/common-enums.ts:95-478`) -- localized labels for 19 languages:
   - `introduction`, `summary`, `examples`, `exercises`, `exercise`, `task`, `scenario`, `yourAnswer`, `hint`, `hints`, `sampleAnswer`, `lessonDigest`, `calloutNote`, `calloutTip`, `calloutWarning`, `calloutDanger`, `calloutInfo`

2. **`CHATBOT_ARTIFACT_PATTERNS`** (`self-reviewer-heuristics.ts:364-380`) -- regex-based artifact removal already running in the pipeline

3. **`removeChatbotArtifacts()`** -- protects code blocks/LaTeX, then applies patterns to prose

4. **`PROMPT_TEMPLATE_MARKERS`** (`prohibited-content.ts:98-107`) -- detects prompt hallucination markers

5. **`checkLanguageConsistency()`** (`content-quality.ts:217-306`) -- Unicode script detection (but deliberately excludes Latin from Russian checks)

### Proposed Heuristic Solution

**Approach A: Regex Pattern Matching (as proposed in `lucky-foraging-conway.md` Task 3)**

Add patterns to `CHATBOT_ARTIFACT_PATTERNS` in `self-reviewer-heuristics.ts`:

```typescript
// English structural markers (in non-English content)
/^#+\s*SECTION\s+(CONCLUSION|INTRODUCTION|SUMMARY)\s*$/gim,
/^#+\s*COURSE\s+(CONCLUSION|INTRODUCTION|SUMMARY)\s*$/gim,
/^#+\s*MODULE\s+(CONCLUSION|INTRODUCTION|SUMMARY)\s*$/gim,
/^#+\s*LESSON\s+DIGEST\s*$/gim,
```

**Pros:** Zero dependencies, zero cost, instant, deterministic, already integrated into pipeline.
**Cons:** Only catches known patterns. Novel English headings would slip through.

---

**Approach B: Reverse Lookup + Regex (Enhanced Heuristic)**

Build a function that:

1. Takes the target language code
2. If language !== 'en', builds a set of English `CONTENT_LABELS.en` values
3. Scans all markdown headings (`/^#{1,6}\s+(.+)$/gm`)
4. For each heading, checks if the text matches any English label (case-insensitive)
5. Auto-replaces with the corresponding localized label from `CONTENT_LABELS[targetLang]`

```typescript
function replaceEnglishHeadings(
  content: string,
  targetLang: Language
): { content: string; replacements: number } {
  if (targetLang === 'en') return { content, replacements: 0 };

  const enLabels = CONTENT_LABELS.en;
  const localLabels = CONTENT_LABELS[targetLang] || CONTENT_LABELS.en;

  // Build reverse lookup: English label -> localized label
  const reverseLookup = new Map<string, string>();
  for (const [key, enValue] of Object.entries(enLabels)) {
    reverseLookup.set(enValue.toLowerCase(), localLabels[key as keyof typeof localLabels]);
  }

  let replacements = 0;
  const result = content.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
    const trimmedTitle = title.trim().toLowerCase();
    const localizedTitle = reverseLookup.get(trimmedTitle);
    if (localizedTitle) {
      replacements++;
      return `${hashes} ${localizedTitle}`;
    }
    return match;
  });

  return { content: result, replacements };
}
```

**Pros:**

- Auto-corrects (not just detects) -- heading becomes properly localized
- Uses existing `CONTENT_LABELS` (single source of truth)
- Covers all 19 languages automatically
- Zero false positives on legitimate English technical terms (they won't match label names)
- Can be extended: add more structural terms like "Section Conclusion", "Module Introduction" to a separate pattern set

**Cons:**

- Only catches headings whose text EXACTLY matches known labels (case-insensitive)
- Won't catch creative variations like "SECTION: CONCLUSION" or "Concluding Remarks"
- Needs a supplementary list for compound markers like "SECTION CONCLUSION", "MODULE INTRODUCTION" that aren't in `CONTENT_LABELS`

---

**Approach C: Combined (Recommended)**

Combine both:

1. **Approach B** for auto-replacement of known `CONTENT_LABELS` English headings
2. **Approach A** (regex) for structural compound markers ("SECTION CONCLUSION", "COURSE SUMMARY", etc.) -- these get **removed** (not replaced, since they're LLM artifacts without a clean localized equivalent)
3. **Optional future enhancement**: If novel patterns keep appearing, add a lightweight heading-level language check using Unicode script ratio (all-Latin heading in non-Latin content = suspicious)

### False Positive Analysis

**Risk: Legitimate English headings in non-English courses**

| Scenario                                                        | Risk Level | Mitigation                                                                |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Technical section headings (e.g., "## API Reference")           | None       | Not in `CONTENT_LABELS`, won't match                                      |
| English course titles in Russian courses                        | None       | Course titles are h1 (`#`), not section headings                          |
| "Introduction" in French content                                | Low        | French `introduction` = English `Introduction` -- same word, no harm done |
| Code block content                                              | None       | `protectMarkdownElements()` already excludes code blocks                  |
| Mixed-language courses (e.g., English lesson in Russian course) | None       | Target language is per-lesson, not per-course                             |

**Overall false positive risk: VERY LOW** -- the `CONTENT_LABELS.en` values are generic structural terms that should never appear as headings in non-English educational content.

**One edge case to handle:** French `introduction` == English `Introduction`. Since both are the same word, replacing it with the localized version is a no-op for French. Same applies for some Portuguese/Italian/Spanish cognates (e.g., Spanish `Introduccion` is close but not identical to English `Introduction`). No harm done in any case.

---

## Recommendation

**Do NOT add a language detection library.** Use the combined heuristic approach (Approach C):

1. **Immediate (Task 3 from existing plan):** Add regex patterns to `CHATBOT_ARTIFACT_PATTERNS` for known structural markers -- this is already planned and correct
2. **Enhancement:** Add a `replaceEnglishHeadings()` function using `CONTENT_LABELS` reverse lookup for auto-correction of standard headings
3. **Integration point:** Call it from `removeChatbotArtifacts()` or as a separate step in the self-reviewer heuristic phase

**Rationale:**

- All library options are unreliable for 2-5 word headings (our primary use case)
- Best library (`tinyld`) is borderline at 18 chars ("SECTION CONCLUSION") and maintenance-inactive
- Heuristic approach is deterministic, zero-dependency, zero-cost, and already fits the existing pipeline architecture
- We already have all the data we need (`CONTENT_LABELS` for 19 languages)
- The problem is pattern matching, not language detection

### If we ever need a library in the future

If requirements expand beyond structural headings (e.g., detecting mixed-language paragraphs), the ranking would be:

1. **`eld`** (best accuracy, active maintenance) -- if RAM budget allows
2. **`tinyld`** (best balance) -- if maintenance resumes
3. **`franc-min`** -- only for long text detection (100+ chars)

Sources:

- [franc - GitHub](https://github.com/wooorm/franc)
- [franc-min - npm](https://www.npmjs.com/package/franc-min)
- [tinyld - GitHub](https://github.com/komodojp/tinyld)
- [tinyld - npm](https://www.npmjs.com/package/tinyld)
- [tinyld benchmarks](https://github.com/komodojp/tinyld/blob/develop/docs/benchmark.md)
- [cld3-asm - GitHub](https://github.com/kwonoj/cld3-asm)
- [cld3-asm - npm](https://www.npmjs.com/package/cld3-asm)
- [languagedetect - npm](https://www.npmjs.com/package/languagedetect)
- [eld (Nito-ELD) - GitHub](https://github.com/nitotm/efficient-language-detector-js/)
- [eld - npm](https://www.npmjs.com/package/eld)
- [node-cld - GitHub](https://github.com/dachev/node-cld)
- [cld - npm](https://www.npmjs.com/package/cld)
- [npm-compare: franc vs languagedetect vs cld](https://npm-compare.com/cld,franc,languagedetect)
- [franc issue #100: Improved accuracy for small documents](https://github.com/wooorm/franc/issues/100)
