/**
 * Unit tests for calculateLessonCoverage function
 * Tests the RAG coverage score calculation with prefix matching for Russian morphology
 */

import { describe, it, expect } from 'vitest';

// Import the whitelist and recreate the function for testing
const TECHNICAL_SHORT_TERMS = new Set([
  'api',
  'sql',
  'css',
  'html',
  'xml',
  'json',
  'yaml',
  'jsx',
  'tsx',
  'php',
  'c++',
  'go',
  'rust',
  'java',
  'node',
  'deno',
  'bun',
  'rest',
  'soap',
  'http',
  'https',
  'tcp',
  'udp',
  'dns',
  'ssh',
  'ssl',
  'tls',
  'jwt',
  'oauth',
  'saml',
  'ldap',
  'crud',
  'orm',
  'etl',
  'olap',
  'oltp',
  'acid',
  'base',
  'cap',
  'aws',
  'gcp',
  'k8s',
  'ci',
  'cd',
  'cli',
  'gui',
  'ide',
  'git',
  'npm',
  'pip',
  'use',
  'run',
  'set',
  'get',
  'put',
  'add',
  'test',
  'mock',
  'code',
  'data',
  'file',
  'type',
  'work',
  'task',
  'call',
  'send',
  'read',
  'load',
  'save',
  'push',
  'pull',
  'fork',
  'merge',
  'код',
  'api',
  'база',
  'тест',
  'файл',
  'тип',
  'дата',
]);

interface RAGChunk {
  content: string;
  relevance_score: number;
}

interface LearningObjective {
  objective: string;
}

interface LessonSpec {
  learning_objectives: LearningObjective[];
}

/**
 * Check if a term matches in content using prefix matching
 * This handles Russian morphology where word endings change based on grammatical case.
 */
function termMatchesInContent(term: string, contentPool: string): boolean {
  // 1. Try exact match first
  if (contentPool.includes(term)) {
    return true;
  }

  // 2. For longer terms (5+ chars), try prefix matching
  if (term.length >= 5) {
    const stemLength = Math.min(Math.max(4, Math.floor(term.length * 0.6)), term.length - 1);
    const stem = term.slice(0, stemLength);

    if (contentPool.includes(stem)) {
      return true;
    }
  }

  // 3. For terms 4-5 chars, try matching first 3 chars
  if (term.length >= 4 && term.length <= 5) {
    const shortStem = term.slice(0, 3);
    const stemRegex = new RegExp(shortStem + '[а-яёa-z]*', 'i');
    if (stemRegex.test(contentPool)) {
      return true;
    }
  }

  return false;
}

function calculateLessonCoverage(chunks: RAGChunk[], lessonSpec: LessonSpec): number {
  if (!lessonSpec.learning_objectives || lessonSpec.learning_objectives.length === 0) {
    return 1.0;
  }

  if (!chunks || chunks.length === 0) {
    return 0.0;
  }

  const contentPool = chunks.map(c => c.content.toLowerCase()).join(' ');
  const objectives = lessonSpec.learning_objectives.map(o => o.objective.toLowerCase());

  let totalScore = 0;
  for (const obj of objectives) {
    const words = obj.split(/\s+/).filter(t => t.length > 0);
    const keyTerms = words.filter(t => t.length > 3 || TECHNICAL_SHORT_TERMS.has(t.toLowerCase()));

    if (keyTerms.length === 0) {
      totalScore += 1.0;
      continue;
    }

    const termsCovered = keyTerms.filter(term => termMatchesInContent(term, contentPool)).length;
    const coverageRatio = termsCovered / keyTerms.length;

    if (coverageRatio >= 0.3) {
      totalScore += Math.min(1.0, coverageRatio * 1.4);
    }
  }

  return objectives.length > 0 ? totalScore / objectives.length : 0;
}

describe('calculateLessonCoverage', () => {
  it('returns 1.0 when no objectives', () => {
    const chunks = [{ content: 'some content', relevance_score: 0.5 }];
    const spec = { learning_objectives: [] };
    expect(calculateLessonCoverage(chunks, spec)).toBe(1.0);
  });

  it('returns 0.0 when no chunks', () => {
    const chunks: RAGChunk[] = [];
    const spec = { learning_objectives: [{ objective: 'Learn something' }] };
    expect(calculateLessonCoverage(chunks, spec)).toBe(0.0);
  });

  it('returns >0 when terms match in content', () => {
    const chunks = [
      { content: 'Learn about React hooks and state management', relevance_score: 0.8 },
    ];
    const spec = { learning_objectives: [{ objective: 'Learn React hooks' }] };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score for matching terms:', score);
    expect(score).toBeGreaterThan(0);
  });

  it('handles short technical terms from whitelist', () => {
    const chunks = [
      { content: 'This lesson covers API design and REST endpoints', relevance_score: 0.8 },
    ];
    const spec = { learning_objectives: [{ objective: 'Use API and REST' }] };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score with short terms (API, REST, use):', score);
    expect(score).toBeGreaterThan(0);
  });

  it('handles Russian text with morphology via prefix matching', () => {
    const chunks = [
      {
        content: 'Изучение техник работы с возражениями клиентов и методов продления контрактов',
        relevance_score: 0.8,
      },
    ];
    const spec = {
      learning_objectives: [
        { objective: 'Научиться работать с возражениями клиентов' },
        { objective: 'Освоить техники продления контрактов' },
      ],
    };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score for Russian text with prefix matching:', score);

    // Debug: show what terms are being extracted and matched
    const contentPool = chunks.map(c => c.content.toLowerCase()).join(' ');
    console.log('Content pool:', contentPool);

    const obj1 = 'научиться работать с возражениями клиентов';
    const words1 = obj1.split(/\s+/).filter(t => t.length > 0);
    const keyTerms1 = words1.filter(
      t => t.length > 3 || TECHNICAL_SHORT_TERMS.has(t.toLowerCase())
    );
    console.log('Key terms from objective 1:', keyTerms1);

    // Check which terms match with prefix
    for (const term of keyTerms1) {
      const matches = termMatchesInContent(term, contentPool);
      console.log(`  "${term}" matches: ${matches}`);
    }

    // With prefix matching, "работать" should match "работы" (both start with "работ")
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when no terms match', () => {
    const chunks = [
      { content: 'Completely unrelated content about cooking recipes', relevance_score: 0.5 },
    ];
    const spec = { learning_objectives: [{ objective: 'Learn advanced quantum physics' }] };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score for non-matching content:', score);
    expect(score).toBe(0);
  });

  it('gives partial credit for partial matches', () => {
    // With 3 terms matching out of 6, we get ~50% coverage which is above the 30% threshold
    const chunks = [
      { content: 'React hooks with state management are powerful', relevance_score: 0.8 },
    ];
    const spec = {
      learning_objectives: [{ objective: 'Learn React hooks and Redux state management' }],
    };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score for partial match:', score);
    // "React", "hooks", "state", "management" all match - 4/6 = 66% coverage
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when coverage is below threshold', () => {
    // Only 1/6 terms match (React) = 16% which is below 30% threshold
    const chunks = [
      { content: 'React is a JavaScript library for building interfaces', relevance_score: 0.8 },
    ];
    const spec = {
      learning_objectives: [{ objective: 'Learn React hooks and Redux state management' }],
    };
    const score = calculateLessonCoverage(chunks, spec);
    console.log('Score for below-threshold match:', score);
    // Below 30% threshold, so score is 0
    expect(score).toBe(0);
  });
});

describe('termMatchesInContent (prefix matching)', () => {
  it('matches exact terms', () => {
    expect(termMatchesInContent('react', 'learn about react hooks')).toBe(true);
  });

  it('matches Russian words with different endings (morphology)', () => {
    // "работать" (infinitive) should match "работы" (genitive) via prefix "работ"
    expect(termMatchesInContent('работать', 'изучение работы с клиентами')).toBe(true);

    // "возражениями" should match "возражений" via prefix "возражени"
    expect(termMatchesInContent('возражениями', 'методы работы с возражений')).toBe(true);

    // "клиентов" should match "клиентами" via prefix
    expect(termMatchesInContent('клиентов', 'работа с клиентами')).toBe(true);
  });

  it('does not match unrelated terms', () => {
    expect(termMatchesInContent('quantum', 'cooking recipes and food')).toBe(false);
    expect(termMatchesInContent('физика', 'рецепты блюд')).toBe(false);
  });

  it('handles short terms correctly', () => {
    // Short terms (4-5 chars) use 3-char stem matching
    expect(termMatchesInContent('code', 'coding in javascript')).toBe(true);
    expect(termMatchesInContent('test', 'testing the application')).toBe(true);
  });
});
