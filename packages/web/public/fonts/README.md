# Font Files

Empty on purpose. The application's fonts live in `packages/web/app/fonts/` and
are declared with `next/font/local`, which hashes and serves them itself — a
font placed here would be served twice, once by Next and once as a static file.

See `packages/web/app/fonts/README.md` for what is bundled and how to
regenerate it.
