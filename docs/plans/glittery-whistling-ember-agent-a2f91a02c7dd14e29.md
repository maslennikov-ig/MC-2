# Research: React Video Player Library Comparison

**Date**: 2026-02-24
**Status**: Complete (research only, no changes made)

## Context: Current Usage in This Codebase

The project uses `react-player ^3.4.0` (latest: 3.4.0) in two components:

- `/home/me/code/mc2/packages/web/components/common/video-player.tsx`
- `/home/me/code/mc2/packages/web/components/common/persistent-video-player.tsx`

Both components are `'use client'` components that use:

- `ReactPlayer` for video rendering (local files only, no YouTube URLs observed in current usage)
- `playerRef.current.getInternalPlayer()` for native PiP and fullscreen
- `controls={true}` (native browser controls + custom overlay)
- `onProgress`, `onDuration`, `onPlay`, `onPause` callbacks
- Custom floating window / draggable overlay built on top

Both components currently use `ReactPlayer as any` — a TypeScript workaround indicating type friction.

---

## Libraries Evaluated

### 1. react-player (Current Baseline)

| Metric               | Value                                       |
| -------------------- | ------------------------------------------- |
| GitHub Stars         | ~9.9k                                       |
| npm weekly downloads | ~1.5M                                       |
| Latest version       | 3.4.0                                       |
| License              | MIT                                         |
| Bundle size          | ~97 kB minified / ~31 kB gzip (lazy-loaded) |
| Last publish         | ~3 months ago                               |
| Maintenance          | Mux took over from cookpete                 |

**YouTube support**: Yes — YouTube, Vimeo, Twitch, SoundCloud, Facebook, Wistia, Mixcloud, DailyMotion, HLS (via hls.js), DASH, local files.

**TypeScript support**: Has types, but the codebase uses `ReactPlayer as any` — indicating real-world friction with the type definitions.

**SSR/Next.js**: Known hydration error bug (GitHub issues #1428, #1474, unresolved at library level). Requires `next/dynamic` with `ssr: false` or `useEffect` workaround. The current codebase uses `'use client'` which partially mitigates this.

**Customization**: Simple prop-based API. Limited deep customization — custom controls must be built as overlays (as this project does). No headless/unstyled option.

**Known issues**:

- Hydration error with SSR/React 18 (long-standing, unresolved)
- Mobile playback not guaranteed
- `ReactPlayer as any` TypeScript workaround required in this codebase
- ~26+ open issues filed through January 2026

**Verdict for this project**: Works but shows TypeScript friction. The `ReactPlayer as any` cast is a code smell. Mux ownership may accelerate improvement but also means potential pivot to Mux-centric features.

---

### 2. Vidstack (`@vidstack/react`)

| Metric               | Value                                            |
| -------------------- | ------------------------------------------------ |
| GitHub Stars         | ~3.3–3.4k                                        |
| npm weekly downloads | Lower than react-player (newer library)          |
| Latest version       | Active (issues filed Dec 2025–Jan 2026)          |
| License              | MIT                                              |
| Bundle size          | ~60 kB / ~20.5 kB gzip (modular, tree-shakeable) |
| Last publish         | Actively maintained                              |
| Maintenance          | Strong — originally built at Reddit              |

**YouTube support**: Yes — has a dedicated YouTube provider using the YouTube IFrame API. Enhancements over native embed: WebP poster auto-detection, GDPR (no cookies by default), lazy loading, 224x faster render via preconnects, hides recommendation popup when using custom controls.

**TypeScript support**: First-class — everything is typed (player, state, events, hooks, props). No `as any` needed.

**SSR/Next.js**: React Server Component ready, Next.js App Router (`app/`) directory ready. Has an open SSR issue (#1260) but the library explicitly targets RSC compatibility.

**Customization**: Extensive — headless + styled modes, custom controls via hooks (`useMediaState`, `useMediaStore`), themes, WCAG 2.1 compliant. This is arguably the best customization story of all options.

**Supported sources**: HLS, DASH, YouTube, Vimeo, local files, audio, live streaming.

**Known issues**:

- Smaller community/ecosystem than react-player or video.js
- Custom iframe providers not yet supported (issue #1530)
- SSR issue #1260 (partially resolved but documented)
- Steeper learning curve vs react-player

**Verdict for this project**: Best technical fit if you want to eliminate the `ReactPlayer as any` hack and gain proper TypeScript support. YouTube provider is excellent. Bundle is smaller. The floating/custom controls architecture this project uses maps well to Vidstack's headless mode. Plyr's creator is also merging Plyr into Vidstack, signaling long-term ecosystem consolidation.

---

### 3. Video.js (with React wrapper)

| Metric               | Value                                       |
| -------------------- | ------------------------------------------- |
| GitHub Stars         | ~39.5k                                      |
| npm weekly downloads | ~400k–735k                                  |
| Latest version       | 8.23.6 (v10 expected early 2026)            |
| License              | Apache 2.0                                  |
| Bundle size          | ~225 kB minified / ~183–195 kB gzip — LARGE |
| Last publish         | Actively maintained                         |
| Maintenance          | Strong, long-term project                   |

**YouTube support**: Via `videojs-youtube` plugin (not built-in core).

**TypeScript support**: Via `@types/video.js`. Wrapper `videojs-react-enhanced` has TypeScript types.

**SSR/Next.js**: Requires `next/dynamic` with `ssr: false` — Video.js uses browser APIs at module load time. Standard workaround.

**Customization**: Extensive plugin ecosystem. However monolithic architecture (no tree-shaking), CSS adds 45.8 kB extra.

**Known issues**:

- Very large bundle (183–195 kB gzip) — biggest of all options
- Monolithic, no tree-shaking: you get everything whether you need it or not
- React is not the primary target — it's a third-party script adapted for npm
- React wrapper libraries (`videojs-react-enhanced`) are community-maintained, not official
- v10 rewrite coming in early 2026, may introduce breaking changes

**Verdict for this project**: Overkill for simple YouTube + local video use case. Bundle size penalty is significant for a Next.js production app. Best suited for complex streaming/live broadcast scenarios with plugin needs.

---

### 4. Plyr / plyr-react

| Metric               | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| GitHub Stars         | plyr: significant; plyr-react: smaller                       |
| npm weekly downloads | plyr: moderate; plyr-react: low (~14 dependents in registry) |
| Latest version       | plyr-react 6.0.0 / plyr 3.8.4 (both ~2 months ago)           |
| License              | MIT                                                          |
| Bundle size          | plyr ~35 kB gzip; plyr-react adds overhead                   |
| Last publish         | Active                                                       |
| Maintenance          | plyr is merging into Vidstack — sunset signal                |

**YouTube support**: Yes — HTML5, YouTube, Vimeo.

**TypeScript support**: v6 tightened TypeScript typings.

**SSR/Next.js**: Known `document is not defined` crash on Next.js 14+ during SSR (reported in vercel/next.js#60862 and sampotts/plyr#2770). Requires `next/dynamic` with `ssr: false`.

**Customization**: Good CSS-based theming. Less flexible than Vidstack headless approach.

**Known issues**:

- Plyr creator announced merger into Vidstack — Plyr is effectively in maintenance/sunset mode
- `document is not defined` crash on Next.js 14+ SSR
- Small ecosystem for plyr-react (only 14 dependent packages)
- CSS relies on DOM access at module load time

**Verdict for this project**: Do NOT choose. The creator has announced Plyr is merging into Vidstack. Choosing Plyr today means migrating again in 1–2 years. Use Vidstack directly if you want the Plyr-style UI.

---

### 5. Media Chrome (by Mux)

| Metric               | Value                                              |
| -------------------- | -------------------------------------------------- |
| GitHub Stars         | Moderate (exact figure not surfaced in search)     |
| npm weekly downloads | ~38 dependents in registry — low adoption          |
| Latest version       | 4.18.0 (published ~18 hours before research)       |
| License              | Open source (Mux)                                  |
| Bundle size          | Available on Bundlephobia — modular web components |
| Last publish         | Actively maintained by Mux                         |
| Maintenance          | Strong — Mux commercial backing                    |

**YouTube support**: Yes — compatible with YouTube and many players. However it is a _controls UI layer_, not a player itself. You combine it with a video source (HTML5 video, hls-video, mux-video, etc.).

**TypeScript support**: Web Components, React wrapper via `media-chrome/react` (camelCase props).

**SSR/Next.js**: Works with `next-video` (Mux's Next.js package). Web Components have some React friction (need `media-chrome/react` import for idiomatic React usage). Mux has a dedicated `next-video` package that uses Media Chrome as its default player.

**Customization**: This IS the customization layer — it's a toolkit for building custom controls, not a pre-built player. Maximum flexibility.

**Known issues**:

- Not a drop-in player: it's a UI primitives library, requires more assembly
- React Web Component integration friction (mitigated by `media-chrome/react`)
- Primarily targets Mux video infrastructure use cases
- Only 38 dependent packages — low community adoption outside Mux ecosystem
- YouTube support is indirect (you provide a YouTube iframe, Media Chrome wraps the controls)

**Verdict for this project**: Wrong fit. Media Chrome is a low-level controls toolkit, not a replacement for react-player. Requires significantly more assembly work. Best if you are already using Mux for video hosting.

---

## Comparison Table

|                    | react-player (current) | Vidstack                | Video.js            | Plyr/plyr-react       | Media Chrome         |
| ------------------ | ---------------------- | ----------------------- | ------------------- | --------------------- | -------------------- |
| GitHub Stars       | 9.9k                   | 3.4k                    | 39.5k               | significant           | moderate             |
| npm downloads/week | ~1.5M                  | growing                 | ~400k-735k          | moderate              | low                  |
| Bundle (gzip)      | ~31 kB                 | ~20.5 kB                | ~183-195 kB         | ~35 kB                | modular              |
| TypeScript         | friction (`as any`)    | first-class             | via @types          | v6 improved           | React wrapper        |
| YouTube support    | yes                    | yes (built-in provider) | via plugin          | yes                   | indirect             |
| HLS/DASH           | yes                    | yes                     | yes                 | via hls.js            | yes                  |
| SSR/Next.js        | workaround needed      | RSC-ready               | workaround needed   | crashes on Next.js 14 | next-video           |
| Customization      | limited (overlay)      | excellent (headless)    | extensive (plugins) | CSS-based             | maximum (primitives) |
| Maintenance        | Mux took over          | active                  | very active         | merging into Vidstack | active (Mux)         |
| Future outlook     | stable                 | growing/promising       | v10 rewrite 2026    | sunset/merge          | Mux ecosystem        |
| Migration effort   | — (baseline)           | moderate                | high                | moderate              | high                 |

---

## Recommendation

### For this project (Next.js 15, YouTube + local video, custom floating player)

**Recommended: Vidstack (`@vidstack/react`)**

Reasoning:

1. **Eliminates the `ReactPlayer as any` TypeScript hack** — Vidstack has first-class TypeScript support with no type workarounds needed.

2. **Smaller bundle** — ~20.5 kB gzip vs react-player's ~31 kB. Matters for a production Next.js app.

3. **Best YouTube provider** — built-in, enhanced (WebP posters, GDPR, lazy loading, no recommendation popup). Better than react-player's YouTube handling.

4. **Headless/hooks API fits the existing architecture** — Both current components build custom controls as overlays over the player. Vidstack's `useMediaState` and `useMediaStore` hooks are designed exactly for this pattern. The migration would be additive, not a rewrite.

5. **RSC/Next.js 15 ready** — No hydration issues requiring `dynamic/no-ssr` workarounds.

6. **Future-proof** — Plyr is merging into Vidstack. react-player is now Mux-owned. Vidstack is growing and was production-tested at Reddit scale.

7. **`getInternalPlayer()` equivalent** — Vidstack exposes the media element through refs and hooks, supporting the PiP and fullscreen patterns used in the current components.

### What to keep

- The custom controls overlay architecture (progress bar, play/pause, mute, fullscreen, PiP, floating window)
- The `Rnd` draggable floating window implementation
- All the `lucide-react` icons

### What to replace

- `import ReactPlayer from 'react-player'` → `import { MediaPlayer, MediaProvider } from '@vidstack/react'`
- `const Player = ReactPlayer as any` → typed Vidstack components, no cast needed
- `playerRef.current.getInternalPlayer()` → `useMediaPlayer()` hook or ref access via Vidstack API

### Migration complexity: Low-Medium

The current components are `'use client'` already, use callback-based state management, and the custom controls are purely React (not react-player-provided). Vidstack's React hooks map cleanly to the existing state variables (`isPlaying`, `isMuted`, `currentTime`, `duration`).

---

## If Vidstack is not acceptable

**Second choice: stay on react-player** — the `'use client'` directive already avoids the SSR hydration issue. The main pain point is TypeScript (`as any`), which could be partially addressed with better type assertions. Mux's ownership may improve types in v4+.

**Do not choose**: Video.js (bundle too large), Plyr/plyr-react (sunset), Media Chrome (wrong abstraction level).
