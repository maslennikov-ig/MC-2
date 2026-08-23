/**
 * `nlm_slide_deck`, `nlm_report` and `nlm_data_table` are supported end to end,
 * not just spelled (mc2-6ye5z.4/.5/.8).
 *
 * The rule this file enforces is written into `enrichmentTypeSchema` itself:
 * the database enum may be wider than the application schema, because a value
 * is added there first so handlers can be written and rows stored. What must
 * never happen is the reverse — a value in the application schema with no
 * handler behind it. That is a type claiming support the runtime does not have,
 * and every exhaustive `Record` keyed on `EnrichmentType` would then compile
 * while one branch does nothing.
 *
 * So this does not test the three types individually. It tests the invariant:
 * every value the schema accepts routes to a handler.
 */
import { describe, expect, it } from 'vitest';

import {
  enrichmentTypeSchema,
  getDefaultEnrichmentTitle,
  type EnrichmentType,
} from '@megacampus/shared-types';

import { routeEnrichment } from '@/stages/stage7-enrichments/services/enrichment-router';

const ALL_TYPES = enrichmentTypeSchema.options as readonly EnrichmentType[];

const NEW_TYPES = ['nlm_slide_deck', 'nlm_report', 'nlm_data_table'] as const;

describe('every supported enrichment type has a handler', () => {
  it.each(ALL_TYPES)('%s routes to a handler', type => {
    const handler = routeEnrichment(type);

    expect(handler, type).toBeDefined();
    expect(typeof handler.generate, type).toBe('function');
  });

  it.each(ALL_TYPES)('%s has a title in both locales', type => {
    expect(getDefaultEnrichmentTitle(type, 'en')).toBeTruthy();
    expect(getDefaultEnrichmentTitle(type, 'ru')).toBeTruthy();
  });

  it.each(NEW_TYPES)('%s is in the schema at all', type => {
    // The half that was missing until 2026-08-23: the database enum accepted
    // these from 2026-08-22 and the application did not.
    expect(enrichmentTypeSchema.safeParse(type).success).toBe(true);
  });
});

describe('report and study guide stay distinguishable', () => {
  it('are two separate enrichment types', () => {
    // NotebookLM makes every report the same artifact type and differs only by
    // format, so without this they would be one thing stored under two names.
    expect(enrichmentTypeSchema.safeParse('nlm_report').success).toBe(true);
    expect(enrichmentTypeSchema.safeParse('nlm_study_guide').success).toBe(true);
    expect(routeEnrichment('nlm_report')).not.toBe(routeEnrichment('nlm_study_guide'));
  });
});
