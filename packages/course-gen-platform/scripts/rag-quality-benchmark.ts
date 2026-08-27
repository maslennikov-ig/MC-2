/**
 * Offline RAG retrieval quality benchmark.
 *
 * Answers, with numbers, four questions this repository could not answer:
 * what the dense threshold keeps and what it throws away, whether hybrid search
 * is hybrid, what recall and MRR are at the settings in force, and what parent
 * expansion adds. It runs against the live collection read-only, through the
 * real retrieval code, with an evaluation set and query vectors checked into
 * the repository so a re-run costs nothing and produces the same numbers.
 *
 * Two commands:
 *
 *   pnpm benchmark:rag build   # samples the corpus, derives questions, embeds
 *   pnpm benchmark:rag run     # measures, and writes the report
 *
 * `build` spends money (one small LLM call per sampled chunk, plus one Jina
 * query embedding per query) and its output is committed, so it is run when the
 * corpus changes and not otherwise. `run` spends nothing when the vectors are
 * cached.
 *
 * ## Pointing it at the right Qdrant
 *
 * `QDRANT_URL` must name OUR collection. On a developer workstation
 * `localhost:6333` is a DIFFERENT project's Qdrant with a collection of the
 * same name, and reading it produces a confident, wrong measurement. Ours lives
 * on the dev host; reach it read-only over an SSH tunnel:
 *
 *   ssh -N -L 16335:127.0.0.1:6335 megacampus-prod
 *   QDRANT_URL=http://127.0.0.1:16335 QDRANT_API_KEY=<read-only key> \
 *     pnpm benchmark:rag run
 *
 * The read-only key is enough for every read here and refuses every write, so a
 * mistake cannot mutate the collection.
 *
 * ## Redis
 *
 * The production code caches query embeddings and search responses in Redis, so
 * the benchmark seeds the embedding cache from the committed vectors and clears
 * its own search responses before each run. Point `REDIS_URL` at a database the
 * benchmark owns — the default appends `/9` — so it never shares keys with a
 * running worker. Without Redis the run still works and still produces the same
 * numbers; it just pays Jina for the query vectors.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(PACKAGE_ROOT, 'eval', 'rag-retrieval');
const EVAL_SET_PATH = path.join(DATA_DIR, 'eval-set.json');
const EMBEDDINGS_PATH = path.join(DATA_DIR, 'query-embeddings.json');

loadEnv({ path: path.join(PACKAGE_ROOT, '.env'), quiet: true });

// A benchmark must not share cache keys with production, and `generateCacheKey`
// exists to be namespaced for exactly this. Set before anything imports it.
process.env.EMBEDDING_CACHE_NAMESPACE ??= 'rag-benchmark-embedding';
process.env.REDIS_URL = process.env.RAG_BENCHMARK_REDIS_URL ?? 'redis://127.0.0.1:6379/9';

const { getRedisClient, cache } = await import('../src/shared/cache/redis.js');
const { generateCacheKey } = await import('../src/shared/embeddings/generate-utils.js');
const { generateQueryEmbedding } = await import('../src/shared/embeddings/generate.js');
const { qdrantClient } = await import('../src/shared/qdrant/client.js');
const { QDRANT_COLLECTION_ALIAS } = await import('../src/shared/qdrant/config.js');
const { extractPayload } = await import('../src/shared/qdrant/search-helpers.js');
const { getSupabaseAdmin } = await import('../src/shared/supabase/admin.js');
const { createOpenRouterModel } = await import('../src/shared/llm/langchain-models.js');
const { ENTRY_POINTS, entryPoint, lessonCandidateLimit } = await import(
  '../src/shared/rag-eval/entry-points.js'
);
const { searchChunks } = await import('../src/shared/qdrant/search.js');
const { EVAL_SET_VERSION, assertEvalSet, roundVector, scorableQueries } = await import(
  '../src/shared/rag-eval/eval-set.js'
);
const {
  STRICT_MODE_MAX_LIMIT,
  attributeBranches,
  fetchCourseCorpus,
  measureAtThreshold,
  measureExpansion,
  runQuery,
} = await import('../src/shared/rag-eval/measure.js');

type EvalSet = import('../src/shared/rag-eval/eval-set.js').EvalSet;
type EvalQuery = import('../src/shared/rag-eval/eval-set.js').EvalQuery;
type EvalEmbeddings = import('../src/shared/rag-eval/eval-set.js').EvalEmbeddings;
type ScorableChunk = import('../src/shared/embeddings/retrieval-metrics.js').ScorableChunk;
type EntryPointKey = import('../src/shared/rag-eval/entry-points.js').EntryPointKey;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * The sweep the threshold curve is read from.
 *
 * The interesting number is not the best average, it is where the curve bends.
 * 0.35 is above the highest dense score ever observed on this corpus
 * (`MAX_OBSERVED_DENSE_SCORE` = 0.6 is the rounded-up ceiling, and the observed
 * top-5 means sit near 0.42-0.58), so it is included precisely to show the
 * dense branch going empty rather than to be a candidate.
 */
const THRESHOLD_SWEEP = [0.15, 0.2, 0.25, 0.3, 0.35] as const;

/** Ranks recall and MRR are reported at. */
const REPORT_K = 5;

/** Courses sampled for known-answer pairs, most-indexed first. */
const SAMPLE_COURSES = 10;

/** Known-answer pairs drawn per course. */
const PAIRS_PER_COURSE = 5;

/**
 * Pairs allowed from one document.
 *
 * Spreading across documents is what makes the set measure discrimination
 * between sources rather than within one file, but a hard one-per-document rule
 * left two courses contributing a single pair each: several of these courses
 * are one large document. Two is the compromise, and the per-course cap still
 * bounds how much any single source can dominate.
 */
const PAIRS_PER_DOCUMENT = 2;

/** Real-wording queries taken per course. */
const OBJECTIVES_PER_COURSE = 5;

/**
 * The model that turns a chunk into the question it answers.
 *
 * A cheap instruction-following model is enough and the call is one-off: the
 * questions are committed, so the spend happens on `build` and never on `run`.
 * It is named in the evaluation set so the set can be rebuilt identically.
 */
const QUESTION_MODEL = 'deepseek/deepseek-v4-flash-0731';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function collectionName(): string {
  return process.env.QDRANT_COLLECTION_NAME?.trim() || QDRANT_COLLECTION_ALIAS;
}

/** Refuses to run against a Qdrant that is obviously not ours. */
async function assertOurCollection(): Promise<number> {
  const name = collectionName();
  const info = await qdrantClient.getCollection(name);
  const points = info.points_count ?? 0;
  if (points === 0) {
    throw new Error(
      `Collection ${name} at ${process.env.QDRANT_URL} holds zero points. ` +
        'That is the dev instance or the wrong Qdrant; the live corpus is on the dev host.'
    );
  }
  return points;
}

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function fixed(value: number, digits = 4): string {
  return value.toFixed(digits);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

interface CorpusPoint {
  chunk_id: string;
  course_id: string;
  organization_id: string;
  document_id: string;
  content: string;
  token_count: number;
}

async function scrollCorpus(name: string): Promise<CorpusPoint[]> {
  const points: CorpusPoint[] = [];
  let offset: string | number | undefined;

  do {
    const page = await qdrantClient.scroll(name, {
      limit: STRICT_MODE_MAX_LIMIT,
      with_payload: true,
      with_vector: false,
      ...(offset === undefined ? {} : { offset }),
    });
    for (const point of page.points) {
      const payload = extractPayload(point);
      points.push({
        chunk_id: payload.chunk_id,
        course_id: payload.course_id ?? '',
        organization_id: payload.organization_id ?? '',
        document_id: payload.document_id,
        content: payload.content,
        token_count: payload.token_count,
      });
    }
    const next = page.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);

  return points;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
}

/**
 * Whether a chunk can carry a question at all.
 *
 * A chunk that is mostly a table of amendment numbers, a URL list or a
 * signature block is unique text and therefore a valid fingerprint, but the
 * question derived from it would be answerable by every other header in the
 * corpus — which scores retrieval down for finding a correct answer. Requiring
 * that most of the chunk is letters keeps the ground truth honest.
 */
function isAnswerableChunk(chunk: CorpusPoint): boolean {
  const text = chunk.content;
  if (text.length < 400) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters / text.length < 0.6) return false;
  // A sentence needs a verb-bearing clause; a header list has none of these.
  const sentences = text.split(/[.!?]\s/u).filter(part => part.trim().split(/\s+/u).length >= 6);
  return sentences.length >= 3;
}

/**
 * Picks a phrase that identifies this chunk and no other chunk of the course.
 *
 * Ground truth has to survive the fact that a chunk id is not unique text: the
 * same content sits under several courses, and within a course a phrase is the
 * only thing that distinguishes the answering chunk from its near neighbours.
 * The phrase is taken from the middle of the chunk, because the first sentence
 * is often a heading fragment shared by siblings.
 *
 * Returns null when nothing in the chunk is unique, which is a chunk that
 * cannot be ground truth and is skipped rather than scored.
 */
function distinctivePhrase(
  chunk: CorpusPoint,
  courseChunks: readonly CorpusPoint[]
): string | null {
  const words = chunk.content.split(/\s+/u).filter(word => word.length > 0);
  if (words.length < 12) return null;

  const others = courseChunks
    .filter(other => other.chunk_id !== chunk.chunk_id)
    .map(other => normalize(other.content));

  for (const width of [8, 10, 12]) {
    const start = Math.max(0, Math.floor(words.length / 2) - Math.floor(width / 2));
    const phrase = words.slice(start, start + width).join(' ');
    const needle = normalize(phrase);
    if (needle.length < 20) continue;
    if (!others.some(other => other.includes(needle))) return phrase;
  }
  return null;
}

/**
 * Walks each document's chunks from the middle outwards.
 *
 * Taking the first candidates in id order concentrated the set on the opening
 * of every document — title pages, tables of contents and preambles — which is
 * the part least likely to answer a question and the part most likely to look
 * like every other document's opening. Interleaving from the middle spreads the
 * ground truth across the body of each source while staying deterministic.
 */
function spreadThroughDocuments(candidates: readonly CorpusPoint[]): CorpusPoint[] {
  const byDocument = new Map<string, CorpusPoint[]>();
  for (const chunk of candidates) {
    const list = byDocument.get(chunk.document_id);
    if (list) list.push(chunk);
    else byDocument.set(chunk.document_id, [chunk]);
  }

  const ordered: CorpusPoint[] = [];
  for (const chunks of byDocument.values()) {
    const middle = Math.floor(chunks.length / 2);
    for (let step = 0; step < chunks.length; step += 1) {
      const offset = step % 2 === 0 ? step / 2 : -(step + 1) / 2;
      const chunk = chunks[middle + offset];
      if (chunk) ordered.push(chunk);
    }
  }
  return ordered;
}

const QUESTION_PROMPT = [
  'Ниже — фрагмент учебного документа. Сформулируй ОДИН вопрос, на который этот фрагмент отвечает.',
  '',
  'Требования:',
  '- вопрос на языке фрагмента;',
  '- так, как его задал бы человек, изучающий тему, а не цитата из текста;',
  '- НЕ переписывай предложения из фрагмента дословно и не используй его редких точных формулировок;',
  '- одна строка, без кавычек, без нумерации, без пояснений.',
  '',
  'Фрагмент:',
].join('\n');

async function deriveQuestions(chunks: readonly CorpusPoint[]): Promise<Map<string, string>> {
  // cost-exempt: a one-off benchmark build with no course to charge; the output
  // is committed, so this spend happens once and never during a measurement.
  const model = createOpenRouterModel(QUESTION_MODEL, 0, 200);
  const questions = new Map<string, string>();

  for (const chunk of chunks) {
    const response = await model.invoke([
      { role: 'user', content: `${QUESTION_PROMPT}\n${chunk.content.slice(0, 4000)}` },
    ]);
    const question = firstQuestionLine(textOf(response.content));
    if (!question) {
      console.warn(`  ! no usable question derived for ${chunk.chunk_id}, skipping`);
      continue;
    }
    questions.set(chunk.chunk_id, question);
  }

  return questions;
}

/**
 * The text of a reply, whatever shape the provider returned it in.
 *
 * LangChain's `content` is a string for most models and an array of typed parts
 * for others. `String()` on the array shape yields `[object Object]`, which
 * would have become a question in the evaluation set.
 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part =>
        typeof part === 'string'
          ? part
          : typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : ''
      )
      .join('');
  }
  return '';
}

/**
 * Takes the question out of a reply that may have led with a preamble.
 *
 * "Одна строка, без пояснений" is an instruction, not a guarantee: the first
 * build produced a query that read `Вот ответ на ваш запрос:` because the first
 * line was taken on trust. A line that ends in a question mark is the thing
 * asked for; anything else is refused rather than measured, since a query that
 * is not a question measures the model's obedience instead of retrieval.
 */
function firstQuestionLine(reply: string): string | null {
  const lines = reply
    .split('\n')
    .map(line =>
      line
        .replace(/^[\s>*\-–—\d.)]+/u, '')
        .replace(/^["'«»]+|["'«»]+$/gu, '')
        .trim()
    )
    .filter(line => line.length > 0);

  const question = lines.find(line => line.endsWith('?') && line.length >= 15);
  return question ?? null;
}

interface ObjectiveRow {
  course_id: string;
  objective: string;
}

/**
 * Real Stage 6 query wording, recovered from where the wording actually lives.
 *
 * `buildLessonQueries` takes `rag_context.search_queries`, the learning
 * objectives, and the section key points. Of those, the objectives are stored:
 * `generation_trace` records query counts and never the strings, and
 * `rag_context_cache` is empty. So these are the same strings the stage issues,
 * read from their source rather than from a log that did not keep them.
 */
async function fetchObjectives(courseIds: readonly string[]): Promise<ObjectiveRow[]> {
  const supabase = getSupabaseAdmin();
  const { data: sections, error: sectionError } = await supabase
    .from('sections')
    .select('id, course_id')
    .in('course_id', [...courseIds]);
  if (sectionError) throw new Error(`sections lookup failed: ${sectionError.message}`);

  const courseBySection = new Map((sections ?? []).map(row => [row.id, row.course_id]));
  if (courseBySection.size === 0) return [];

  const { data: lessons, error: lessonError } = await supabase
    .from('lessons')
    .select('section_id, objectives')
    .in('section_id', [...courseBySection.keys()]);
  if (lessonError) throw new Error(`lessons lookup failed: ${lessonError.message}`);

  const rows: ObjectiveRow[] = [];
  for (const lesson of lessons ?? []) {
    const courseId = courseBySection.get(lesson.section_id);
    if (!courseId) continue;
    for (const objective of lesson.objectives ?? []) {
      if (typeof objective === 'string' && objective.trim().length > 0) {
        rows.push({ course_id: courseId, objective: objective.trim() });
      }
    }
  }
  return rows;
}

async function commandBuild(): Promise<void> {
  const name = collectionName();
  const corpusPoints = await assertOurCollection();
  console.log(`Corpus: ${name} at ${process.env.QDRANT_URL} — ${corpusPoints} points`);

  const corpus = await scrollCorpus(name);
  const byCourse = new Map<string, CorpusPoint[]>();
  for (const point of corpus) {
    const list = byCourse.get(point.course_id);
    if (list) list.push(point);
    else byCourse.set(point.course_id, [point]);
  }

  const courses = [...byCourse.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, SAMPLE_COURSES)
    .map(([courseId]) => courseId);
  console.log(`Sampling ${courses.length} courses: ${courses.join(', ')}`);

  // Known-answer pairs. Chunks are spread across distinct documents so the set
  // measures discrimination between sources, not within one file.
  const sampled: CorpusPoint[] = [];
  for (const courseId of courses) {
    const chunks = byCourse.get(courseId) ?? [];
    const perDocument = new Map<string, number>();
    let taken = 0;
    const candidates = spreadThroughDocuments(
      [...chunks]
        .filter(isAnswerableChunk)
        .sort((left, right) => left.chunk_id.localeCompare(right.chunk_id))
    );
    for (const chunk of candidates) {
      if (taken >= PAIRS_PER_COURSE) break;
      const fromDocument = perDocument.get(chunk.document_id) ?? 0;
      if (fromDocument >= PAIRS_PER_DOCUMENT) continue;
      if (!distinctivePhrase(chunk, chunks)) continue;
      perDocument.set(chunk.document_id, fromDocument + 1);
      taken += 1;
      sampled.push(chunk);
    }
  }
  console.log(`Known-answer candidates: ${sampled.length}`);

  const questions = await deriveQuestions(sampled);

  const queries: EvalQuery[] = [];
  for (const chunk of sampled) {
    const question = questions.get(chunk.chunk_id);
    const phrase = distinctivePhrase(chunk, byCourse.get(chunk.course_id) ?? []);
    if (!question || !phrase) continue;
    queries.push({
      id: `ka-${chunk.course_id.slice(0, 8)}-${chunk.chunk_id}`,
      source: 'known-answer',
      query: question,
      course_id: chunk.course_id,
      organization_id: chunk.organization_id,
      target_chunk_id: chunk.chunk_id,
      evidence: [{ id: 'answer', tokens: [phrase] }],
    });
  }

  // Real wording.
  const objectives = await fetchObjectives(courses);
  const organizationByCourse = new Map(
    courses.map(courseId => [courseId, byCourse.get(courseId)?.[0]?.organization_id ?? ''])
  );
  const takenPerCourse = new Map<string, number>();
  for (const row of objectives.sort((left, right) =>
    left.objective.localeCompare(right.objective)
  )) {
    const taken = takenPerCourse.get(row.course_id) ?? 0;
    if (taken >= OBJECTIVES_PER_COURSE) continue;
    takenPerCourse.set(row.course_id, taken + 1);
    queries.push({
      id: `obj-${row.course_id.slice(0, 8)}-${taken}`,
      source: 'lesson-objective',
      query: row.objective,
      course_id: row.course_id,
      organization_id: organizationByCourse.get(row.course_id) ?? '',
      evidence: [],
    });
  }

  const set: EvalSet = {
    version: EVAL_SET_VERSION,
    built_at: new Date().toISOString(),
    collection: name,
    corpus_points: corpusPoints,
    question_model: QUESTION_MODEL,
    queries,
  };
  assertEvalSet(set);
  writeJson(EVAL_SET_PATH, set);
  console.log(
    `Wrote ${queries.length} queries ` +
      `(${scorableQueries(set).length} scorable) to ${path.relative(PACKAGE_ROOT, EVAL_SET_PATH)}`
  );

  // Vectors last, so a failed embedding never leaves a set without them.
  const vectors: Record<string, number[]> = {};
  for (const query of queries) {
    if (vectors[query.query]) continue;
    vectors[query.query] = roundVector(await generateQueryEmbedding(query.query));
  }
  const embeddings: EvalEmbeddings = {
    version: EVAL_SET_VERSION,
    model: 'jina-embeddings-v3',
    task: 'retrieval.query',
    dimensions: 768,
    vectors,
  };
  writeJson(EMBEDDINGS_PATH, embeddings);
  console.log(
    `Wrote ${Object.keys(vectors).length} query vectors to ` +
      path.relative(PACKAGE_ROOT, EMBEDDINGS_PATH)
  );
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

/**
 * Puts the committed vectors where the production code looks for them.
 *
 * `generateQueryEmbedding` reads the shared cache before it calls Jina, so
 * seeding it means the measured run uses the exact vectors in the repository
 * and spends nothing. When Redis is unavailable the seed fails softly and the
 * run pays for the vectors instead — same numbers, small bill.
 */
async function seedEmbeddingCache(embeddings: EvalEmbeddings): Promise<number> {
  let seeded = 0;
  for (const [text, vector] of Object.entries(embeddings.vectors)) {
    const key = generateCacheKey(text, {
      task: embeddings.task,
      lateChunking: false,
      dimensions: embeddings.dimensions,
    });
    // Long enough to outlive a full sweep; the namespace is the benchmark's own.
    if (await cache.set(key, vector, { ttl: 6 * 3600 })) seeded += 1;
  }
  return seeded;
}

/**
 * Clears the benchmark's own cached search responses.
 *
 * `searchChunks` caches for five minutes, which is exactly long enough for a
 * re-run after a constant changed to return the previous constant's results.
 * Scoped to the database named by `REDIS_URL`, which the benchmark owns.
 */
async function clearSearchCache(): Promise<number> {
  const redis = getRedisClient();
  let cursor = '0';
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'search:*', 'COUNT', 500);
    cursor = next;
    if (keys.length > 0) removed += await redis.del(...keys);
  } while (cursor !== '0');
  return removed;
}

interface EntryReport {
  key: EntryPointKey;
  label: string;
  defaultThreshold: number;
  sweep: Array<{
    threshold: number;
    recallAtK: number;
    recallCeilingAtK: number;
    mrr: number;
    ndcgAtK: number;
    atomCoverageAtK: number;
    queriesReturningNothing: number;
    meanResults: number;
    fallbacks: number;
    unreachableQuestions: string[];
  }>;
  branches: {
    queries: number;
    accepted: number;
    denseOnly: number;
    sparseOnly: number;
    both: number;
    beyondBranchDepth: number;
    meanDenseCandidates: number;
    meanSparseCandidates: number;
    queriesWithUniqueDense: number;
    queriesWithUniqueSparse: number;
  } | null;
  expansion: {
    results: number;
    expanded: number;
    meanTokensBefore: number;
    meanTokensAfter: number;
    multiplier: number;
    retainedMatchedText: number;
    stayedInSection: number;
    resultsWithDeclaredSiblings: number;
  } | null;
  ranked: Record<string, string[]>;
}

async function commandRun(): Promise<void> {
  const name = collectionName();
  const corpusPoints = await assertOurCollection();
  const set = readJson<EvalSet>(EVAL_SET_PATH);
  assertEvalSet(set);

  const embeddings = readJson<EvalEmbeddings>(EMBEDDINGS_PATH);
  const seeded = await seedEmbeddingCache(embeddings).catch(() => 0);
  const cleared = await clearSearchCache().catch(() => 0);

  console.log(`Collection ${name} at ${process.env.QDRANT_URL} — ${corpusPoints} points`);
  if (corpusPoints !== set.corpus_points) {
    console.warn(
      `! corpus drifted since the set was built: ${set.corpus_points} -> ${corpusPoints}. ` +
        'Recall numbers stay comparable only while the sampled chunks are still indexed.'
    );
  }
  console.log(
    `Evaluation set: ${set.queries.length} queries, ${scorableQueries(set).length} with ground truth`
  );
  console.log(`Seeded ${seeded} query vectors, cleared ${cleared} cached search responses\n`);

  const courses = [...new Set(set.queries.map(query => query.course_id))];
  const corpusByCourse = new Map<string, ScorableChunk[]>();
  for (const courseId of courses) {
    corpusByCourse.set(courseId, await fetchCourseCorpus(courseId, name));
  }

  const requested = (process.env.RAG_BENCHMARK_ENTRY_POINTS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0) as EntryPointKey[];
  const points = requested.length > 0 ? requested.map(entryPoint) : ENTRY_POINTS;

  const reports: EntryReport[] = [];

  for (const point of points) {
    console.log(`── ${point.label} (default threshold ${point.defaultThreshold})`);
    const report: EntryReport = {
      key: point.key,
      label: point.label,
      defaultThreshold: point.defaultThreshold,
      sweep: [],
      branches: null,
      expansion: null,
      ranked: {},
    };

    for (const threshold of THRESHOLD_SWEEP) {
      const outcome = await measureAtThreshold(
        point,
        set,
        threshold,
        name,
        corpusByCourse,
        REPORT_K
      );
      report.sweep.push({
        threshold,
        recallAtK: outcome.report.recallAtK,
        recallCeilingAtK: outcome.report.recallCeilingAtK,
        mrr: outcome.report.mrr,
        ndcgAtK: outcome.report.ndcgAtK,
        atomCoverageAtK: outcome.report.atomCoverageAtK,
        queriesReturningNothing: outcome.queriesReturningNothing,
        meanResults: outcome.meanResults,
        fallbacks: outcome.fallbacks,
        unreachableQuestions: outcome.report.unreachableQuestions,
      });
      console.log(
        `   t=${threshold.toFixed(2)}  recall@${REPORT_K}=${fixed(outcome.report.recallAtK)}` +
          `  mrr=${fixed(outcome.report.mrr)}` +
          `  coverage=${fixed(outcome.report.atomCoverageAtK)}` +
          `  results/query=${outcome.meanResults.toFixed(2)}` +
          `  empty=${outcome.queriesReturningNothing}/${outcome.queriesRun}` +
          `  fallback=${outcome.fallbacks}`
      );
      if (threshold === point.defaultThreshold) {
        for (const entry of outcome.ranked) report.ranked[entry.id] = entry.chunkIds;
      }
    }

    // Branch attribution only means something where a hybrid query was issued.
    const hybrid = point.buildOptions(set.queries[0], point.defaultThreshold).enable_hybrid;
    if (hybrid) {
      const attributions = [];
      for (const query of set.queries) {
        attributions.push(await attributeBranches(point, query, point.defaultThreshold, name));
      }
      report.branches = {
        queries: attributions.length,
        accepted: attributions.reduce((sum, item) => sum + item.accepted, 0),
        denseOnly: attributions.reduce((sum, item) => sum + item.fromDenseOnly, 0),
        sparseOnly: attributions.reduce((sum, item) => sum + item.fromSparseOnly, 0),
        both: attributions.reduce((sum, item) => sum + item.fromBoth, 0),
        beyondBranchDepth: attributions.reduce((sum, item) => sum + item.fromBeyondBranchDepth, 0),
        meanDenseCandidates: mean(attributions.map(item => item.denseCandidates)),
        meanSparseCandidates: mean(attributions.map(item => item.sparseCandidates)),
        queriesWithUniqueDense: attributions.filter(item => item.fromDenseOnly > 0).length,
        queriesWithUniqueSparse: attributions.filter(item => item.fromSparseOnly > 0).length,
      };
      const branches = report.branches;
      console.log(
        `   branches: dense-only=${branches.denseOnly} sparse-only=${branches.sparseOnly}` +
          ` both=${branches.both} beyond-prefetch=${branches.beyondBranchDepth}` +
          ` | queries contributing a unique result: dense=${branches.queriesWithUniqueDense}` +
          `/${branches.queries} sparse=${branches.queriesWithUniqueSparse}/${branches.queries}`
      );
    } else {
      console.log('   branches: not applicable, this entry point does not request hybrid');
    }

    if (point.expansionBudget !== null) {
      const outcomes = [];
      for (const query of set.queries) {
        const run = await runQuery(point, query, point.defaultThreshold, name);
        outcomes.push(...(await measureExpansion(run, point.expansionBudget, name)));
      }
      const before = outcomes.map(item => item.tokensBefore);
      const after = outcomes.map(item => item.tokensAfter);
      const beforeTotal = before.reduce((sum, value) => sum + value, 0);
      const afterTotal = after.reduce((sum, value) => sum + value, 0);
      report.expansion = {
        results: outcomes.length,
        expanded: outcomes.filter(item => item.tokensAfter > item.tokensBefore).length,
        meanTokensBefore: mean(before),
        meanTokensAfter: mean(after),
        // A ratio of totals, not a mean of ratios: the cost is the tokens the
        // prompt carries, and a mean of per-result ratios would let a short
        // chunk that doubled outweigh a long one that did not move.
        multiplier: beforeTotal > 0 ? afterTotal / beforeTotal : 1,
        retainedMatchedText: outcomes.filter(item => item.retainsMatchedText).length,
        stayedInSection: outcomes.filter(item => item.staysInSection).length,
        resultsWithDeclaredSiblings: outcomes.filter(item => item.declaredSiblings > 0).length,
      };
      const expansion = report.expansion;
      console.log(
        `   expansion: ${expansion.expanded}/${expansion.results} results widened,` +
          ` ${expansion.multiplier.toFixed(2)}x tokens,` +
          ` ${expansion.resultsWithDeclaredSiblings}/${expansion.results} points declare a sibling,` +
          ` matched text retained ${expansion.retainedMatchedText}/${expansion.results}`
      );
    } else {
      console.log('   expansion: not applicable, this entry point does not expand');
    }

    console.log('');
    reports.push(report);
  }

  const outputPath = path.join(DATA_DIR, 'last-run.json');
  writeJson(outputPath, {
    collection: name,
    corpus_points: corpusPoints,
    eval_set_built_at: set.built_at,
    k: REPORT_K,
    thresholds: THRESHOLD_SWEEP,
    entry_points: reports,
  });
  console.log(`Full results: ${path.relative(PACKAGE_ROOT, outputPath)}`);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// variants
// ---------------------------------------------------------------------------

/**
 * What each of Stage 6's request-shape decisions is worth.
 *
 * `run` measures the entry points as configured. This measures the two options
 * Stage 6 turns on that Stage 5 does not — grouping by document and the
 * priority boost — by holding everything else fixed and switching one at a
 * time. A constant is only worth moving once the measurement says which one is
 * responsible, and the two entry points differ in four ways at once, so the
 * difference between them attributes nothing on its own.
 */
async function commandVariants(): Promise<void> {
  const name = collectionName();
  await assertOurCollection();
  const set = readJson<EvalSet>(EVAL_SET_PATH);
  assertEvalSet(set);
  await seedEmbeddingCache(readJson<EvalEmbeddings>(EMBEDDINGS_PATH)).catch(() => 0);
  await clearSearchCache().catch(() => 0);

  const corpusByCourse = new Map<string, ScorableChunk[]>();
  for (const courseId of [...new Set(set.queries.map(query => query.course_id))]) {
    corpusByCourse.set(courseId, await fetchCourseCorpus(courseId, name));
  }

  const stage6 = entryPoint('stage6');
  const shapes = [
    { label: 'as configured (group_size 2)', patch: {} },
    { label: 'group_size 3', patch: { group_size: 3 } },
    { label: 'group_size 4', patch: { group_size: 4 } },
    { label: 'group_size 6', patch: { group_size: 6 } },
    { label: 'group_size 10', patch: { group_size: 10 } },
    { label: 'grouping off', patch: { group_by_document: false } },
    { label: 'priority boost off', patch: { enable_priority_boost: false } },
    {
      label: 'grouping and boost off',
      patch: { group_by_document: false, enable_priority_boost: false },
    },
  ] as const;

  const rows = [];
  for (const shape of shapes) {
    const variant = {
      ...stage6,
      buildOptions: (query: EvalQuery, threshold: number) => ({
        ...stage6.buildOptions(query, threshold),
        ...shape.patch,
      }),
    };
    const outcome = await measureAtThreshold(
      variant,
      set,
      stage6.defaultThreshold,
      name,
      corpusByCourse,
      REPORT_K
    );
    rows.push({
      shape: shape.label,
      recallAtK: outcome.report.recallAtK,
      mrr: outcome.report.mrr,
      ndcgAtK: outcome.report.ndcgAtK,
      meanResults: outcome.meanResults,
    });
    console.log(
      `   ${shape.label.padEnd(24)} recall@${REPORT_K}=${fixed(outcome.report.recallAtK)}` +
        `  mrr=${fixed(outcome.report.mrr)}  ndcg=${fixed(outcome.report.ndcgAtK)}` +
        `  results/query=${outcome.meanResults.toFixed(2)}`
    );
  }

  const outputPath = path.join(DATA_DIR, 'last-variants.json');
  writeJson(outputPath, {
    collection: name,
    k: REPORT_K,
    threshold: stage6.defaultThreshold,
    rows,
  });
  console.log(`\nFull results: ${path.relative(PACKAGE_ROOT, outputPath)}`);
}

// ---------------------------------------------------------------------------
// concentration
// ---------------------------------------------------------------------------

/**
 * How many documents a whole lesson's context would actually come from.
 *
 * `run` and `variants` score one query at a time, which is the right unit for
 * ranking but the wrong one for the question grouping exists to answer. Stage 6
 * issues up to `MAX_QUERIES` queries per lesson and keeps the union of what they
 * return, so the concentration that matters is the concentration of that union
 * — and a single-query measurement overstates it, because one query has one
 * best document while ten queries pull in whatever each of them finds.
 *
 * This runs a course's real objectives together as one lesson's query set, takes
 * the union the way `runQueryPass` does, keeps the top `TARGET_CHUNKS` by score,
 * and reports how many distinct documents those chunks came from — with the cap
 * on and with it off. Read-only, no reranker, no spend.
 */
async function commandConcentration(): Promise<void> {
  const name = collectionName();
  await assertOurCollection();
  const set = readJson<EvalSet>(EVAL_SET_PATH);
  assertEvalSet(set);
  await seedEmbeddingCache(readJson<EvalEmbeddings>(EMBEDDINGS_PATH)).catch(() => 0);
  await clearSearchCache().catch(() => 0);

  const stage6 = entryPoint('stage6');
  const byCourse = new Map<string, EvalQuery[]>();
  for (const query of set.queries) {
    if (query.source !== 'lesson-objective') continue;
    const list = byCourse.get(query.course_id);
    if (list) list.push(query);
    else byCourse.set(query.course_id, [query]);
  }

  const shapes = [
    { label: 'grouping on (as configured)', patch: {} },
    { label: 'grouping off', patch: { group_by_document: false } },
  ] as const;

  const rows = [];
  for (const shape of shapes) {
    console.log(`\n   ${shape.label}`);
    const perCourse = [];
    for (const [courseId, queries] of byCourse) {
      const best = new Map<string, { documentId: string; score: number }>();
      for (const query of queries) {
        const options = {
          ...stage6.buildOptions(query, stage6.defaultThreshold),
          ...shape.patch,
          // The whole lesson shares the candidate budget, exactly as the stage
          // divides it across the queries a lesson produced.
          limit: lessonCandidateLimit(7, queries.length),
        };
        const response = await searchChunks(query.query, {
          ...options,
          collection_name: name,
        });
        for (const result of response.results) {
          const seen = best.get(result.chunk_id);
          if (!seen || result.score > seen.score) {
            best.set(result.chunk_id, { documentId: result.document_id, score: result.score });
          }
        }
      }

      const top = [...best.values()].sort((left, right) => right.score - left.score).slice(0, 7);
      const perDocument = new Map<string, number>();
      for (const chunk of top) {
        perDocument.set(chunk.documentId, (perDocument.get(chunk.documentId) ?? 0) + 1);
      }
      const largest = Math.max(0, ...perDocument.values());
      perCourse.push({
        courseId,
        queries: queries.length,
        unionChunks: best.size,
        contextChunks: top.length,
        documentsInContext: perDocument.size,
        largestDocumentShare: top.length > 0 ? largest / top.length : 0,
      });
      console.log(
        `      ${courseId.slice(0, 8)}  ${queries.length} queries  union=${String(best.size).padStart(3)}` +
          `  context=${top.length} chunks from ${perDocument.size} document(s)` +
          `  biggest share ${(top.length > 0 ? (largest / top.length) * 100 : 0).toFixed(0)}%`
      );
    }

    const single = perCourse.filter(course => course.documentsInContext <= 1).length;
    console.log(
      `      -> mean ${mean(perCourse.map(c => c.documentsInContext)).toFixed(2)} documents per lesson;` +
        ` largest document holds ${(mean(perCourse.map(c => c.largestDocumentShare)) * 100).toFixed(0)}% of the context on average;` +
        ` ${single}/${perCourse.length} lessons come from a single document`
    );
    rows.push({ shape: shape.label, perCourse });
  }

  writeJson(path.join(DATA_DIR, 'last-concentration.json'), { collection: name, rows });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'run';
  if (command === 'build') await commandBuild();
  else if (command === 'variants') {
    if (!existsSync(EVAL_SET_PATH)) {
      throw new Error(`No evaluation set at ${EVAL_SET_PATH}; run \`pnpm benchmark:rag build\``);
    }
    await commandVariants();
  } else if (command === 'concentration') {
    if (!existsSync(EVAL_SET_PATH)) {
      throw new Error(`No evaluation set at ${EVAL_SET_PATH}; run \`pnpm benchmark:rag build\``);
    }
    await commandConcentration();
  } else if (command === 'run') {
    if (!existsSync(EVAL_SET_PATH)) {
      throw new Error(`No evaluation set at ${EVAL_SET_PATH}; run \`pnpm benchmark:rag build\``);
    }
    await commandRun();
  } else
    throw new Error(
      `Unknown command "${command}". Use "build", "run", "variants" or "concentration".`
    );
}

await main()
  .then(async () => {
    await getRedisClient()
      .quit()
      .catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    await getRedisClient()
      .quit()
      .catch(() => undefined);
    process.exit(1);
  });
