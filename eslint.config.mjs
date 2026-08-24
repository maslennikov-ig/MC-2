import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/coverage/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      // ...except this one, which is source, not output: the script that
      // refreshes the committed model-routing fallback from the database. The
      // same `build/` blanket also hid it from Git and Docker (mc2-db696.121).
      '!packages/course-gen-platform/src/build/**',
      '**/database.types.ts', // Auto-generated Supabase types
    ],
  },

  // Base config for all TypeScript files
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // TypeScript configuration
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        // Use explicit project list instead of projectService so that
        // test files (excluded from main tsconfig.json) are covered by
        // tsconfig.test.json / tsconfig.eslint.json.
        project: [
          './tsconfig.json',
          './packages/*/tsconfig.json',
          './packages/*/tsconfig.test.json',
          './packages/*/tsconfig.eslint.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Promoted warn→error (0 violations, audit 2026-02-08)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': true,
          minimumDescriptionLength: 5,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': 'warn',
      // Both numbers were re-derived from this repository on 2026-08-24, over the 845 source
      // files these rules actually govern (course-gen-platform/src and shared-types/src;
      // packages/web has its own config and no length rule at all).
      //
      // `max-lines` 500 -> 800. Length is a PROXY for complexity, and a weak one — it counts
      // lines rather than decisions, so it charges a table of nineteen translations the same
      // as nineteen branches. Measured: median 143, p90 436, p95 512, p99 805. At 500 the rule
      // flagged 44 files, most of them long because they hold DATA; at 800 it flags 11, and
      // those are long because they hold LOGIC. It also demanded harm where no honest seam
      // exists: splitting `analysis-schemas.ts` at its only available seam — moving the
      // `llm*Enum` constants to a sibling module — turned 2 warnings into 67, because Zod's
      // inference does not survive the module boundary and every dependent schema became
      // `any`. A rule that can only be satisfied by making the types worse is mis-calibrated,
      // not unmet. Where the seam IS real the split still happens on its merits, and three
      // did in this same change.
      //
      // `complexity` 30 -> 40. This one is a DIRECT measure — independent paths through a
      // function, which is both the number of tests it needs and the number of states a
      // reader must hold. Measured over the 41 functions above 30, the distribution is not
      // flat: twenty-one sit between 31 and 40, a band where the line is genuinely arguable
      // for pipeline code whose branches are mostly error handling. The rest form a tail —
      // 41 42 42 42 42 46 46 50 51 53 53 55 56 59 59 63 70 74 85 97 — that is not arguable at
      // all, and 40 is where the two separate. Raising this any further would silence the
      // functions that actually cost; the tail is being taken down by refactoring, not by
      // moving the number again.
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 40],
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
    },
  },

  // Relaxed rules for tests and scripts
  {
    files: [
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/tests/**/*.ts',
      '**/tests/**/*.tsx',
      '**/scripts/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': true,
          minimumDescriptionLength: 3,
        },
      ],
      // Was 'error' at 1500 while source files are only 'warn' at 500 — tests were held to a
      // STRICTER standard than the code they cover, and the only fix for an over-length suite is a
      // file split, so an unrelated one-line edit could not be committed. Same severity as source.
      'max-lines': ['warn', { max: 1500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
      // Tracks the source threshold for the same reason the two above are relaxed here: a test
      // must never be held to a stricter standard than the code it covers.
      complexity: ['warn', 40],
    },
  }
);
