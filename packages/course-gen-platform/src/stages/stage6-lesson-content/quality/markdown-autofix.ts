import { lint } from 'markdownlint/sync';
import { applyFixes, type LintError } from 'markdownlint';
import { LESSON_MARKDOWNLINT_CONFIG } from '../judge/markdownlint-config';
import { isAutoFixable } from '../judge/markdownlint-severity';

export interface DeterministicQualityAutoFixResult {
  content: string;
  fixedRules: string[];
}

function normalizeCalloutMarkers(content: string): DeterministicQualityAutoFixResult {
  let nextContent = content;
  const fixedRules = new Set<string>();

  const quoteWrappedPattern =
    /^>\s*["']\s*\[!(PRO\s*TIP|PROTIP|TIP|WARNING|NOTE|INFO|DANGER)\]\s*["']/gim;
  if (quoteWrappedPattern.test(nextContent)) {
    nextContent = nextContent.replace(
      quoteWrappedPattern,
      (_match, marker: string) => `> [!${normalizeCalloutType(marker)}]`
    );
    fixedRules.add('quoteWrappedCallout');
  }

  const nonStandardTypePattern = /^>\s*\[!(PRO\s*TIP|PROTIP)\]/gim;
  if (nonStandardTypePattern.test(nextContent)) {
    nextContent = nextContent.replace(nonStandardTypePattern, '> [!TIP]');
    fixedRules.add('normalizeProTipCallout');
  }

  return {
    content: nextContent,
    fixedRules: Array.from(fixedRules),
  };
}

function normalizeCalloutType(marker: string): string {
  const normalized = marker.toUpperCase().replace(/\s+/g, '');
  return normalized === 'PROTIP' ? 'TIP' : marker.toUpperCase().replace(/\s+/g, ' ');
}

function applyMarkdownLintAutoFixes(content: string): DeterministicQualityAutoFixResult {
  const lintResults = lint({
    strings: { content },
    config: LESSON_MARKDOWNLINT_CONFIG,
  });

  const lintErrors: LintError[] = lintResults.content || [];
  const fixedRulesSet = new Set<string>();

  for (const error of lintErrors) {
    const ruleId = error.ruleNames[0];
    if (isAutoFixable(ruleId) && error.fixInfo) {
      fixedRulesSet.add(ruleId);
    }
  }

  return {
    content: applyFixes(content, lintErrors),
    fixedRules: Array.from(fixedRulesSet),
  };
}

export function applyDeterministicQualityAutoFixes(
  content: string
): DeterministicQualityAutoFixResult {
  const customFixes = normalizeCalloutMarkers(content);
  const lintFixes = applyMarkdownLintAutoFixes(customFixes.content);

  return {
    content: lintFixes.content,
    fixedRules: [...customFixes.fixedRules, ...lintFixes.fixedRules],
  };
}
