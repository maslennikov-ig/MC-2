import { describe, it, expect } from 'vitest';

import { decideDeactivation } from '@/shared/prompts/prompt-deactivation';
import { PROMPT_REGISTRY } from '@/shared/prompts/prompt-registry';

describe('decideDeactivation', () => {
  // The expensive mistake is not leaving a dead row alive — it is retiring a
  // live one. `stage4_phase1_classification` (dead) and
  // `stage4_phase1_classification_system` (live) differ by a suffix, and both
  // were sitting in the same table on 2026-08-23.
  it('refuses a key the registry still declares, even if a human named it', () => {
    const decision = decideDeactivation({
      key: 'stage4_phase1_classification_system',
      declaredInRegistry: true,
      activeInDatabase: true,
    });

    expect(decision.action).toBe('refuse');
  });

  it('retires an orphan that has an active row', () => {
    expect(
      decideDeactivation({
        key: 'stage4_phase1_classification',
        declaredInRegistry: false,
        activeInDatabase: true,
      })
    ).toEqual({ action: 'deactivate' });
  });

  // A typo in the key must not report success. It looks identical to a finished
  // job otherwise, and the row it was meant to retire stays live.
  it('skips rather than claims success when no active row carries the key', () => {
    const decision = decideDeactivation({
      key: 'stage4_phase1_clasification',
      declaredInRegistry: false,
      activeInDatabase: false,
    });

    expect(decision.action).toBe('skip');
  });

  // The suffix pair is the trap this guard exists for, so assert the registry
  // really does still hold the live half. If Stage 4 renames its phases again,
  // this fails here rather than in a retirement that takes a live prompt down.
  it('the live half of the Stage 4 split is in the registry and the dead half is not', () => {
    expect(PROMPT_REGISTRY.has('stage4_phase1_classification_system')).toBe(true);
    expect(PROMPT_REGISTRY.has('stage4_phase1_classification_user')).toBe(true);
    expect(PROMPT_REGISTRY.has('stage4_phase1_classification')).toBe(false);
  });
});
