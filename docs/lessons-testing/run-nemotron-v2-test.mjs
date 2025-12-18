/**
 * Run tests for Nemotron Nano 9B V2 (newer model)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OUTPUT_DIR = '/home/me/code/megacampus2/docs/lessons-testing/test-results';

if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY required');
  process.exit(1);
}

const MODEL = {
  slug: 'nemotron-nano-9b-v2',
  apiName: 'nvidia/nemotron-nano-9b-v2',
  name: 'Nemotron Nano 9B V2'
};

const LESSONS = {
  '1.1': {
    id: '1.1', language: 'ru',
    title: 'Что такое нематериальный продукт: билет как товар',
    section_title: 'Основы продаж билетов как нематериального продукта',
    learning_objectives: [
      'Распознать отличие билета от физического товара по пяти критериям',
      'Описать три ключевые особенности нематериального продукта в собственных словах',
      'Применить аналогию «навигатора» для объяснения роли CRM при продаже билетов'
    ],
    key_topics: [
      'Определение нематериального продукта',
      'Билет как право на участие, а не на владение',
      'Сравнение: билет vs физический товар',
      'Особенности потребления — немедленное и невозвратное',
      'CRM как навигатор клиента'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Менеджеры отдела продаж, работающие с продажей билетов на мероприятия'
  },
  '1.2': {
    id: '1.2', language: 'ru',
    title: 'Ценообразование на билеты: как работают скидки и тарифы',
    section_title: 'Основы продаж билетов как нематериального продукта',
    learning_objectives: [
      'Применить early-bird скидку в коммуникации с клиентом',
      'Рассчитать разницу между базовым и VIP-тарифом для конкретного мероприятия',
      'Объяснить клиенту выгоду скидки с акцентом на ограниченности'
    ],
    key_topics: [
      'Эффект дефицита через early-bird',
      'VIP-тарифы и дополнительные опции',
      'Групповые скидки: условия и ограничения',
      'Календарь цен: когда и как менять',
      'Объяснение цены через ценность, а не стоимость'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Менеджеры отдела продаж, работающие с продажей билетов на мероприятия'
  },
  '1.1-en': {
    id: '1.1-en', language: 'en',
    title: 'What is an Intangible Product: Ticket as a Product',
    section_title: 'Fundamentals of Selling Tickets as Intangible Products',
    learning_objectives: [
      'Identify five key differences between tickets and physical products',
      'Describe three key characteristics of intangible products in your own words',
      'Apply the "navigator" analogy to explain the role of CRM in ticket sales'
    ],
    key_topics: [
      'Definition of intangible products',
      'Ticket as a right to participate, not ownership',
      'Comparison: ticket vs physical product',
      'Consumption characteristics — immediate and non-refundable',
      'CRM as a customer navigator'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Sales managers working with event ticket sales'
  },
  '1.2-en': {
    id: '1.2-en', language: 'en',
    title: 'Ticket Pricing: How Discounts and Tiers Work',
    section_title: 'Fundamentals of Selling Tickets as Intangible Products',
    learning_objectives: [
      'Apply early-bird discounts in customer communication',
      'Calculate the difference between basic and VIP tiers for a specific event',
      'Explain discount benefits to customers with emphasis on scarcity'
    ],
    key_topics: [
      'Scarcity effect through early-bird pricing',
      'VIP tiers and additional options',
      'Group discounts: conditions and limitations',
      'Price calendar: when and how to adjust',
      'Explaining price through value, not cost'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Sales managers working with event ticket sales'
  }
};

const ALL_LESSONS = ['1.1', '1.2', '1.1-en', '1.2-en'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildLessonPrompt(lesson) {
  const lang = lesson.language === 'ru' ? 'Russian' : 'English';
  return `You are an expert educational content creator. Generate comprehensive lesson content for an online course.

## Lesson Specification
**Title**: ${lesson.title}
**Section**: ${lesson.section_title}
**Language**: ${lang} (ALL content must be in ${lang})
**Difficulty**: ${lesson.difficulty_level}
**Duration**: ${lesson.estimated_duration_minutes} minutes
**Target Audience**: ${lesson.target_audience}

## Learning Objectives
${lesson.learning_objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}

## Key Topics
${lesson.key_topics.map(t => `- ${t}`).join('\n')}

## Output: Generate JSON with this structure:
{
  "title": "Lesson title",
  "intro": "100-150 word introduction",
  "sections": [{"title": "...", "content": "200-400 words markdown"}],
  "examples": [{"title": "...", "content": "...", "code": "optional"}],
  "exercises": [{"question": "...", "hints": ["..."]}],
  "summary": "3-5 bullet points"
}

Generate 3-5 sections, 2+ examples, 2+ exercises. Write ONLY in ${lang}.
CRITICAL: Return ONLY valid JSON. No code blocks, no explanations. Use standard ASCII quotes (\\").`;
}

function cleanJson(text) {
  let c = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  c = c.replace(/[""]/g, '"').replace(/['']/g, "'");
  const f = c.indexOf('{'), l = c.lastIndexOf('}');
  return (f !== -1 && l !== -1) ? c.substring(f, l + 1) : c;
}

async function callAPI(model, prompt) {
  const res = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://megacampus.ai',
      'X-Title': 'MegaCampus Test'
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 8000 })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { content: data.choices[0].message.content, usage: data.usage || {} };
}

function evalQuality(content, lesson) {
  if (!content) return { qualityScore: 0 };
  let score = 0;
  score += content.intro?.length > 50 ? 10 : 0;
  score += content.sections?.length > 0 ? 15 : 0;
  score += content.examples?.length > 0 ? 10 : 0;
  score += content.exercises?.length > 0 ? 10 : 0;
  score += content.summary ? 5 : 0;
  score += Math.min(content.sections?.length || 0, 5) * 4;
  score += Math.min(content.examples?.length || 0, 3) * 5;
  score += Math.min(content.exercises?.length || 0, 3) * 5;
  const text = JSON.stringify(content).toLowerCase();
  const objCov = lesson.learning_objectives.filter(o => o.toLowerCase().split(/\s+/).filter(w => w.length > 4).some(k => text.includes(k))).length;
  const topCov = lesson.key_topics.filter(t => t.toLowerCase().split(/\s+/).filter(w => w.length > 4).some(k => text.includes(k))).length;
  score += (objCov / lesson.learning_objectives.length) * 10;
  score += (topCov / lesson.key_topics.length) * 10;
  const wc = (content.intro || '').split(/\s+/).length + (content.sections || []).reduce((s, sec) => s + (sec.content || '').split(/\s+/).length, 0);
  if (wc > 500) score += 5;
  if (wc > 1000) score += 5;
  return { qualityScore: Math.min(Math.round(score), 100) };
}

async function runTest(lessonId) {
  const lesson = LESSONS[lessonId];
  const start = Date.now();
  console.log(`  [${MODEL.slug}] ${lessonId} (${lesson.language}) - Starting...`);

  try {
    const { content, usage } = await callAPI(MODEL.apiName, buildLessonPrompt(lesson));
    const dur = Date.now() - start;
    const cleaned = cleanJson(content);

    let parsed, parseError;
    try { parsed = JSON.parse(cleaned); } catch (e) { parseError = e.message; }

    const quality = parsed ? evalQuality(parsed, lesson) : null;
    const dir = join(OUTPUT_DIR, MODEL.slug);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, `lesson-${lesson.id}.raw`), content);
    writeFileSync(join(dir, `lesson-${lesson.id}.json`), JSON.stringify(parsed || { error: 'Parse error', parseError, raw: cleaned.substring(0, 1000) }, null, 2));
    writeFileSync(join(dir, `lesson-${lesson.id}-metrics.json`), JSON.stringify({
      model: MODEL.name, lessonId: lesson.id, language: lesson.language, duration: dur,
      parseSuccess: !!parsed, parseError, usage, quality
    }, null, 2));

    console.log(`  [${MODEL.slug}] ${lessonId} - ${parsed ? `Score: ${quality.qualityScore}/100` : 'Parse error'} (${(dur/1000).toFixed(1)}s)`);
    return { parseSuccess: !!parsed, quality };
  } catch (e) {
    console.log(`  [${MODEL.slug}] ${lessonId} - Error: ${e.message.substring(0, 60)}`);
    return { parseSuccess: false, error: e.message };
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${MODEL.name} (${MODEL.apiName})`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  for (const id of ALL_LESSONS) {
    results.push(await runTest(id));
    await sleep(3000);
  }

  const ok = results.filter(r => r.parseSuccess);
  const avg = ok.length ? ok.reduce((s, r) => s + (r.quality?.qualityScore || 0), 0) / ok.length : 0;
  console.log(`\n  Summary: ${ok.length}/4 success, avg score: ${avg.toFixed(0)}/100\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
