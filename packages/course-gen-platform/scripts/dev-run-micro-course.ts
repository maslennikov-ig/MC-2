#!/usr/bin/env tsx
/**
 * Drive one micro course through the **deployed dev** pipeline, from code.
 *
 * The owner does not drive paid runs by clicking the UI (2026-08-20), and a
 * local `scripts/e2e-*.ts` cannot stand in: the local `.env` points at a
 * localhost Redis and the `course-generation-local` queue, so a job enqueued
 * here never reaches a dev worker. The only way in is the API those workers
 * actually sit behind.
 *
 * The session is a real one. `server/trpc.ts` calls `supabase.auth.getUser`,
 * and its local-JWT shortcut only runs under `NODE_ENV === 'test'` while the
 * deployed containers run `production` — so a magic link is minted with the
 * service role and immediately redeemed for an access token.
 *
 * **This spends money.** A micro course is a handful of dollars-cents of LLM
 * calls across Stages 4-7.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/dev-run-micro-course.ts
 *   ... --topic "Основы тайм-менеджмента"
 *   ... --wait 1800    seconds to follow the run before letting go
 */

import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

const DEV_API = 'https://dev.ai.megacampus.ru/api/trpc';
const OWNER_EMAIL = 'maslennikov.ig@gmail.com';
const TEST_ORG_ID = process.env.TEST_ORG_ID ?? '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const TEST_USER_ID = process.env.TEST_USER_ID ?? 'ca704da8-5522-4a39-9691-23f36b85d0ce';

function readFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A genuine access token for the owner, without a mailbox.
 *
 * `generateLink` returns the token that would have been emailed; `verifyOtp`
 * redeems it. Two clients on purpose: minting needs the service role, redeeming
 * must happen as an anonymous caller or the session belongs to nobody.
 */
async function mintAccessToken(): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are required');
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: OWNER_EMAIL,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not mint a magic link: ${error?.message ?? 'no token in response'}`);
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const verified = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session?.access_token) {
    throw new Error(`Could not redeem the magic link: ${verified.error?.message ?? 'no session'}`);
  }

  return verified.data.session.access_token;
}

async function callMutation(
  procedure: string,
  input: unknown,
  accessToken: string
): Promise<unknown> {
  const response = await fetch(`${DEV_API}/${procedure}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as { result?: { data?: unknown }; error?: unknown };
  if (!response.ok || payload.error) {
    throw new Error(`${procedure} failed: ${JSON.stringify(payload.error ?? payload)}`);
  }
  return payload.result?.data;
}

async function main(): Promise<void> {
  const topic = readFlag('--topic', 'Основы тайм-менеджмента');
  const waitSeconds = Number(readFlag('--wait', '1800'));

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log('Minting a session for the deployed API...');
  const accessToken = await mintAccessToken();

  const slug = `tier-check-${Date.now()}`;
  console.log(`Creating the draft course (${slug})...`);
  const { data: course, error } = await admin
    .from('courses')
    .insert({
      organization_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      title: topic,
      slug,
      status: 'draft',
      generation_status: 'pending',
      course_description: `Проверочный микрокурс: ${topic}`,
      language: 'ru',
      style: 'professional',
      course_size: 'micro',
      generation_mode: 'automatic',
      content_strategy: 'auto',
      output_formats: ['text'],
      has_files: false,
      generation_started_at: new Date().toISOString(),
      settings: { lesson_duration_minutes: 10, clarifying_questions_enabled: true },
    })
    .select('id, slug')
    .single();

  if (error || !course) throw new Error(`Could not create the course: ${error?.message}`);
  console.log(`  course ${course.id}`);

  console.log('Starting generation through the deployed API...');
  await callMutation('generation.initiate', { courseId: course.id }, accessToken);

  const deadline = Date.now() + waitSeconds * 1000;
  let lastReport = '';
  while (Date.now() < deadline) {
    await sleep(20_000);

    const { data: row } = await admin
      .from('courses')
      .select('generation_status, failed_at_stage')
      .eq('id', course.id)
      .single();

    const { data: traces } = await admin
      .from('generation_trace')
      .select('cost_usd, output_data')
      .eq('course_id', course.id);

    const tiers = new Map<string, number>();
    let spent = 0;
    for (const trace of traces ?? []) {
      spent += Number(trace.cost_usd ?? 0);
      const tier =
        (trace.output_data as { serviceTier?: string } | null)?.serviceTier ?? '(not settled)';
      tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
    }

    const report = `${row?.generation_status}${
      row?.failed_at_stage ? ` failed_at=${row.failed_at_stage}` : ''
    } calls=${traces?.length ?? 0} spent=$${spent.toFixed(6)} tiers=${JSON.stringify(
      Object.fromEntries(tiers)
    )}`;
    if (report !== lastReport) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${report}`);
      lastReport = report;
    }

    if (row?.generation_status === 'completed' || row?.generation_status === 'failed') break;
  }

  console.log(`\nCourse id: ${course.id}`);
  console.log('Read the tier split with the query in docs/plans/floofy-gliding-oasis.md.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
