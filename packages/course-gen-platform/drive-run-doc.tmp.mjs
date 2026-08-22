#!/usr/bin/env node
/**
 * Track B acceptance (mc2-b7olk.4): a run WITH an uploaded document, whose
 * window must reconcile against the /api/v1/credits delta. Document-evidence
 * spend now prices itself into generation_trace like any other paid call; this
 * is the run that proves it, and lifting the runbook's "do not upload a
 * document" caveat depends on it.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://dev.ai.megacampus.ru';
const EMAIL = 'maslennikov.ig@gmail.com';
const ORG = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const USER = 'ca704da8-5522-4a39-9691-23f36b85d0ce';

const TOPIC = 'Финансовая подушка безопасности: сколько и где держать';

const DOC = `Методические указания по формированию резервного фонда домохозяйства

1. Назначение резервного фонда
Резервный фонд покрывает обязательные расходы домохозяйства в период, когда
основной доход прерван. Он не является инвестиционным инструментом и не
предназначен для получения дохода.

2. Размер
Базовый норматив: от трёх до шести месяцев обязательных расходов.
Для одного работающего в семье с иждивенцами норматив повышается до девяти
месяцев. Обязательные расходы считаются без расходов на отдых, подарки
и необязательные подписки.

3. Где хранить
Средства размещаются раздельно от текущего счёта. Допустимые инструменты:
накопительный счёт с ежедневным начислением, краткосрочный депозит с частичным
снятием без потери процента. Недопустимо: брокерский счёт, валютная позиция без
понимания риска, наличные дома сверх суммы одной недели расходов.

4. Порядок пополнения
Пополнение производится в день поступления дохода, до совершения любых иных
расходов, в размере не менее десяти процентов чистого дохода.

5. Порядок расходования
Расходование допускается при потере дохода, неотложных медицинских расходах и
аварийном ремонте жилья. После расходования фонд восстанавливается в первую
очередь, до возобновления любых накоплений на цели.

6. Пересмотр
Норматив пересматривается при изменении состава семьи, при смене работы и не
реже одного раза в год.
`;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function mintToken() {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (error) throw new Error('generateLink: ' + error.message);
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: s, error: e2 } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (e2) throw new Error('verifyOtp: ' + e2.message);
  return s.session.access_token;
}

async function trpc(token, proc, input) {
  const res = await fetch(`${BASE}/api/trpc/${proc}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input ?? {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${proc} -> ${res.status} non-json: ${text.slice(0, 400)}`);
  }
  if (json.error) throw new Error(`${proc} -> ${JSON.stringify(json.error).slice(0, 800)}`);
  return json.result?.data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('T0', new Date().toISOString());
  const token = await mintToken();
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const slug = `shadow-run-${Date.now()}`;
  const { data: course, error } = await userClient
    .from('courses')
    .insert({
      organization_id: ORG,
      user_id: USER,
      title: TOPIC,
      slug,
      course_description:
        'Короткий курс о резервном фонде домохозяйства на основе загруженных методических указаний.',
      generation_mode: 'automatic',
      course_size: 'micro',
      language: 'ru',
      style: 'storytelling',
      target_audience: 'beginner',
      difficulty: 'beginner',
      generation_status: 'pending',
      has_files: true,
      auto_finalize_after_stage6: true,
      settings: { lesson_duration_minutes: 10 },
    })
    .select('id, slug')
    .single();
  if (error) throw new Error('insert course: ' + error.message);
  console.log('COURSE', course.id);

  const fileContent = Buffer.from(DOC, 'utf8').toString('base64');
  const uploaded = await trpc(token, 'generation.uploadFile', {
    courseId: course.id,
    filename: 'rezervnyy-fond-metodicheskie-ukazaniya.txt',
    fileSize: Buffer.byteLength(DOC, 'utf8'),
    mimeType: 'text/plain',
    fileContent,
  });
  console.log('UPLOADED', JSON.stringify(uploaded).slice(0, 300));

  const init = await trpc(token, 'generation.initiate', { courseId: course.id });
  console.log('initiate', JSON.stringify(init));

  const deadline = Date.now() + 35 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    await sleep(15000);
    const { data: row } = await admin
      .from('courses')
      .select(
        'generation_status, generation_progress, estimated_cost_usd, failed_at_stage, error_message'
      )
      .eq('id', course.id)
      .single();
    const line = JSON.stringify(row);
    if (line !== last) {
      console.log(new Date().toISOString(), line.slice(0, 400));
      last = line;
    }
    if (['completed', 'failed'].includes(row?.generation_status)) break;
  }

  console.log('DONE_T1', new Date().toISOString());
  console.log('COURSE_ID', course.id);
}

main().catch(e => {
  console.error('FATAL', e.message);
  process.exit(1);
});
