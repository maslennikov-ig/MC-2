import { describe, expectTypeOf, it } from 'vitest';
import type { QuestionMetadata, SuggestedAnswer } from '../src/clarifying-questions.js';

describe('clarifying question document-decision contract', () => {
  it('preserves the optional canonical suggestion value', () => {
    const readValue = (answer: SuggestedAnswer) => answer.value;
    expectTypeOf(readValue).returns.toEqualTypeOf<string | undefined>();
  });

  it('preserves the optional current decision CAS token', () => {
    const readDecisionId = (metadata: QuestionMetadata) => metadata.current_decision_id;
    expectTypeOf(readDecisionId).returns.toEqualTypeOf<string | undefined>();
  });
});
