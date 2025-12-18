# Font Files

This directory is intentionally kept for potential future use of local fonts.

Currently, the application uses Google Fonts through Next.js's `next/font/google` package:
- Inter (variable font)
- JetBrains Mono (variable font)

The font files `inter-var.woff2` and `jetbrains-mono-var.woff2` are not needed as fonts are loaded from Google's CDN.

If you see 404 errors for these files in the browser console, they can be safely ignored as the fonts are properly loaded through Next.js font optimization.