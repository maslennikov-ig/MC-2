/**
 * Career Playbook — the answers the live smoke submits
 * @module smoke/career-playbook-live-smoke-fixtures
 *
 * Split out of `career-playbook-live-smoke.ts` when adding the Russian fixture
 * pushed that file past the 800-line lint budget. The seam is the one the repo
 * has used before: the runner decides what to do, this file says what it says.
 */

import type {
  CareerPlaybookAnswerSubmission,
  CareerPlaybookFixedAnswer,
} from '@megacampus/shared-types';

/** The two languages the smoke fixture is written in. */
export type CareerPlaybookLiveSmokeLanguage = 'en' | 'ru';

/**
 * The same role in both languages, so a Russian run is comparable with the
 * English series rather than being a different subject as well as a different
 * language. Only the free-text answers are translated: `department`, `level`,
 * `team_size` and `company_stage` are enum-ish keys the spec builder reads.
 */
export const SALES_MANAGER_B2B_FIXED_ANSWERS: Record<
  CareerPlaybookLiveSmokeLanguage,
  CareerPlaybookFixedAnswer[]
> = {
  en: [
    { question_key: 'position', value: 'Sales Manager B2B' },
    { question_key: 'department', value: 'sales' },
    { question_key: 'level', value: 'lead' },
    { question_key: 'reporting', value: 'Reports to CRO. Leads SDR and AE team.' },
    { question_key: 'team_size', value: '51-200' },
    { question_key: 'company_stage', value: 'growth' },
    { question_key: 'content_language', value: 'en' },
  ],
  ru: [
    { question_key: 'position', value: 'Руководитель отдела продаж B2B' },
    { question_key: 'department', value: 'sales' },
    { question_key: 'level', value: 'lead' },
    {
      question_key: 'reporting',
      value:
        'Подчиняется коммерческому директору. Руководит командой SDR и менеджеров по продажам.',
    },
    { question_key: 'team_size', value: '51-200' },
    { question_key: 'company_stage', value: 'growth' },
    { question_key: 'content_language', value: 'ru' },
  ],
};

export const LIVE_SMOKE_BUSINESS_CONTEXT: CareerPlaybookAnswerSubmission = {
  business_context: {
    mode: 'universal',
    status: 'skipped',
    digest: null,
    source_ids: [],
    skip_reason: 'live_smoke_universal_business_context',
  },
};

export function careerPlaybookFixedAnswerRecord(
  language: CareerPlaybookLiveSmokeLanguage
): Record<string, CareerPlaybookFixedAnswer> {
  return Object.fromEntries(
    SALES_MANAGER_B2B_FIXED_ANSWERS[language].map(answer => [answer.question_key, answer])
  );
}
