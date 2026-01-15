/**
 * Lesson RAG retrieval configuration
 *
 * These values are optimized for lesson-level content generation:
 * - Higher score threshold (0.75) ensures more relevant chunks
 * - Lower chunk count (5-10) focuses context on lesson specifics
 * - Lower token budget (20K) vs section-level (40K)
 */
export const LESSON_RAG_CONFIG = {
  /** Target number of chunks (middle of 5-10 range) */
  TARGET_CHUNKS: 7,
  /** Minimum acceptable chunks */
  MIN_CHUNKS: 5,
  /** Maximum chunks to retrieve */
  MAX_CHUNKS: 10,
  /** Score threshold - lowered to capture all relevant chunks (reranker handles quality) */
  SCORE_THRESHOLD: 0.25,
  /** Enable hybrid search (dense + sparse) - ENABLED: sparse vectors now uploaded + native Query API with server-side RRF */
  ENABLE_HYBRID: true,
  /** Token budget for lesson-level context */
  MAX_TOKENS: 20_000,
  /** Maximum queries to execute */
  MAX_QUERIES: 10,
} as const;

/**
 * Reranker configuration for lesson-level RAG
 *
 * Fetches more candidates than needed, then reranks with Jina to get top N.
 * This improves relevance by leveraging cross-encoder reranking.
 */
export const RERANKER_CONFIG = {
  /** Enable reranking (set to false to disable) */
  enabled: true,
  /** Fetch N times more candidates for reranking */
  candidateMultiplier: 4,
  /** Use Qdrant scores if reranker fails */
  fallbackOnError: true,
} as const;

/**
 * Technical short terms whitelist - important keywords that shouldn't be filtered out
 * despite being ≤4 characters
 */
export const TECHNICAL_SHORT_TERMS = new Set([
  // Programming languages & runtimes
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
  // Common tech terms
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
  // Data & DB
  'crud',
  'orm',
  'etl',
  'olap',
  'oltp',
  'acid',
  'base',
  'cap',
  // DevOps & Cloud
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
  // Common action verbs
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
  // Russian technical terms
  'код',
  'api',
  'база',
  'тест',
  'файл',
  'тип',
  'дата',
]);
