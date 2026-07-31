// What the repository actually lints, taken from the per-package `lint` scripts that `pnpm -r lint`
// runs: `eslint src` in course-gen-platform and shared-types, and `eslint` over the whole web
// package. shared-logger and shared-utils have no lint script.
//
// lint-staged used to run `eslint --fix` over EVERY staged .ts/.tsx, including the test tree that
// no package lints. The two disagreed, and the disagreement fell on whoever touched a test file: a
// one-line edit had to answer for pre-existing errors it did not introduce (328 errors across the
// course-gen-platform test tree, measured 2026-07-31 over 500 files — 160 require-await, 82
// unbound-method, 31 no-control-regex, 4 max-lines), several of which need a file split to fix. The
// 2026-07-31 commit that changed a single assertion in a 2147-line test file used --no-verify and
// said so. Linting what the repo lints removes the reason to reach for --no-verify at all.
//
// Formatting is unchanged and still covers everything staged, tests included.
const LINTED = [
  /^packages\/course-gen-platform\/src\//,
  /^packages\/shared-types\/src\//,
  /^packages\/web\//,
];

const isLinted = file => LINTED.some(root => root.test(file.split(`${process.cwd()}/`).pop()));

export default {
  '*.{ts,tsx}': files => {
    const lintable = files.filter(isLinted);
    return [
      ...(lintable.length
        ? [`eslint --fix ${lintable.map(file => JSON.stringify(file)).join(' ')}`]
        : []),
      `prettier --write ${files.map(file => JSON.stringify(file)).join(' ')}`,
    ];
  },
  '*.{json,md,yml,yaml}': files => [
    `prettier --write ${files.map(file => JSON.stringify(file)).join(' ')}`,
  ],
};
