# Fonts

The application serves its fonts from this directory. Nothing in the build talks
to `fonts.googleapis.com` or `fonts.gstatic.com`.

That is the point of them being here: `next/font/google` downloads font files
during `next build`, so a network failure at Google — or blocked egress on a CI
runner — fails the build. On 2026-08-13 exactly that happened: `Build Packages`
died on `Failed to fetch font file`, which skipped the image build and the
deploy to dev, on a commit whose only change was a dependency pin.

| File                                  | Family         | Used for                              |
| ------------------------------------- | -------------- | ------------------------------------- |
| `manrope-latin-cyrillic.woff2`        | Manrope        | UI text (`--font-manrope`)            |
| `jetbrains-mono-latin-cyrillic.woff2` | JetBrains Mono | code blocks (`--font-jetbrains-mono`) |

Both are the upstream **variable** fonts (`wght` axis intact), subset to the
same `latin` + `cyrillic` unicode ranges Google used to serve, so the rendered
result is unchanged. They are declared with `next/font/local` in
`app/[locale]/layout.tsx` and `app/(mocks)/layout.tsx`.

## Regenerating

Sources are the upstream repositories, both under the SIL Open Font License
(licences kept next to the fonts as `Manrope-OFL.txt` and
`JetBrainsMono-OFL.txt`).

```bash
curl -sSL -o Manrope-var.ttf \
  'https://github.com/google/fonts/raw/main/ofl/manrope/Manrope%5Bwght%5D.ttf'
curl -sSL -o JetBrainsMono-var.ttf \
  'https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf'

LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
CYRILLIC='U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'

uvx --from 'fonttools[woff]' pyftsubset Manrope-var.ttf \
  --output-file=manrope-latin-cyrillic.woff2 --flavor=woff2 \
  --layout-features='*' --unicodes="$LATIN,$CYRILLIC"
```

Repeat for JetBrains Mono. Check afterwards that the `wght` axis survived —
without it every weight collapses to one:

```bash
uvx --from 'fonttools[woff]' python -c "
from fontTools.ttLib import TTFont
f = TTFont('manrope-latin-cyrillic.woff2')
print([(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes])"
```

Adding a language beyond Latin and Cyrillic means adding its unicode range here
and regenerating; the files carry no glyphs for it otherwise.
