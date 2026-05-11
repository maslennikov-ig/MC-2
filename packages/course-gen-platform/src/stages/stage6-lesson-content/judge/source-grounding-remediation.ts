import type { FactualVerificationResult, VerificationClaim } from './factual-verifier';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { extractNumberedFacts } from './claim-extraction';

export type SourceGroundingRemediationAction = 'replace_from_source' | 'label_as_hypothetical';

export interface SourceGroundingRemediationTask {
  action: SourceGroundingRemediationAction;
  claimText: string;
  replacementText?: string;
  reason: string;
  evidenceChunkIds: string[];
}

export interface SourceGroundingRemediationResult {
  content: LessonContentBody;
  tasks: SourceGroundingRemediationTask[];
  changed: boolean;
}

function isHypotheticalClaim(text: string): boolean {
  return /условн|гипотетическ|hypothetical|illustrative/i.test(text);
}

function hasPreciseUnsupportedClaim(text: string): boolean {
  if (extractNumberedFacts(text).length > 0) return true;
  return /\b(?:19|20)\d{2}\b/.test(text);
}

function buildReplacementFromEvidence(claim: VerificationClaim): string | null {
  const matchedChunkId = claim.diagnostics?.matchedEvidenceChunkIds?.[0];
  const evidence =
    (matchedChunkId
      ? claim.ragEvidence.find(chunk => chunk.chunk_id === matchedChunkId)
      : undefined) ?? claim.ragEvidence[0];
  if (!evidence) return null;

  const claimFacts = extractNumberedFacts(claim.text);
  const evidenceFacts = extractNumberedFacts(evidence.content);

  for (const claimFact of claimFacts) {
    const replacementFact = evidenceFacts.find(
      fact =>
        fact.unitFamily === claimFact.unitFamily && Math.abs(fact.value - claimFact.value) >= 0.0001
    );

    if (replacementFact) {
      return claim.text.replace(claimFact.raw, replacementFact.raw);
    }
  }

  return null;
}

export function buildSourceGroundingRemediationTasks(
  factualResult: FactualVerificationResult | undefined,
  language: string
): SourceGroundingRemediationTask[] {
  if (!factualResult) return [];

  const isRussian = language.toLowerCase().startsWith('ru');
  const tasks: SourceGroundingRemediationTask[] = [];

  for (const claim of factualResult.claims) {
    if (claim.verificationStatus === 'contradicted') {
      const replacementText = buildReplacementFromEvidence(claim);
      if (replacementText && replacementText !== claim.text) {
        tasks.push({
          action: 'replace_from_source',
          claimText: claim.text,
          replacementText,
          reason: claim.diagnostics?.mismatchReason ?? 'Claim contradicts source material',
          evidenceChunkIds: claim.ragEvidence.map(chunk => chunk.chunk_id),
        });
      }
      continue;
    }

    if (
      (claim.verificationStatus === 'no_evidence' || claim.verificationStatus === 'unverified') &&
      hasPreciseUnsupportedClaim(claim.text) &&
      !isHypotheticalClaim(claim.text)
    ) {
      tasks.push({
        action: 'label_as_hypothetical',
        claimText: claim.text,
        replacementText: `${isRussian ? 'Условный пример' : 'Hypothetical example'}: ${claim.text}`,
        reason: 'Precise numeric/date claim has no source support',
        evidenceChunkIds: claim.ragEvidence.map(chunk => chunk.chunk_id),
      });
    }
  }

  return tasks;
}

function replaceInText(text: string, task: SourceGroundingRemediationTask): string {
  if (!task.replacementText || !text.includes(task.claimText)) return text;
  return text.replace(task.claimText, task.replacementText);
}

export function applySourceGroundingRemediation(
  content: LessonContentBody,
  tasks: SourceGroundingRemediationTask[],
  _language: string
): SourceGroundingRemediationResult {
  if (tasks.length === 0) {
    return { content, tasks, changed: false };
  }

  let changed = false;
  let nextContent: LessonContentBody = {
    ...content,
    sections: content.sections.map(section => ({ ...section })),
    examples: content.examples.map(example => ({ ...example })),
    exercises: content.exercises.map(exercise => ({
      ...exercise,
      hints: exercise.hints ? [...exercise.hints] : undefined,
    })),
    interactive_elements: content.interactive_elements
      ? [...content.interactive_elements]
      : undefined,
  };

  for (const task of tasks) {
    const previous = JSON.stringify(nextContent);

    nextContent = {
      ...nextContent,
      intro: replaceInText(nextContent.intro, task),
      sections: nextContent.sections.map(section => ({
        ...section,
        title: replaceInText(section.title, task),
        content: replaceInText(section.content, task),
      })),
      examples: nextContent.examples.map(example => ({
        ...example,
        title: replaceInText(example.title, task),
        content: replaceInText(example.content, task),
        code: example.code ? replaceInText(example.code, task) : example.code,
      })),
      exercises: nextContent.exercises.map(exercise => ({
        ...exercise,
        question: replaceInText(exercise.question, task),
        solution: replaceInText(exercise.solution, task),
        hints: exercise.hints?.map(hint => replaceInText(hint, task)),
      })),
    };

    changed = changed || previous !== JSON.stringify(nextContent);
  }

  return { content: nextContent, tasks, changed };
}
