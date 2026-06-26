#!/usr/bin/env tsx

import { JobType, type CareerPlaybookGenerateImageJobData } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob, removeTerminalJobById } from '../src/orchestrator/queue';

type Row = {
  id: string;
  user_id: string;
  organization_id: string;
  language: string | null;
  image_status: string | null;
};

function readFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const enqueue = readFlag('--enqueue');
  const limit = readNumberArg('--limit', 100);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id,user_id,organization_id,language,image_status')
    .eq('status', 'completed')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load completed Career Playbooks: ${error.message}`);
  }

  const rows = ((data ?? []) as Row[]).filter(row => row.image_status !== 'completed');

  console.log(
    JSON.stringify(
      {
        mode: enqueue ? 'enqueue' : 'dry-run',
        scanned: data?.length ?? 0,
        missingImages: rows.length,
        limit,
      },
      null,
      2
    )
  );

  if (!enqueue) {
    for (const row of rows) {
      console.log(`${row.id}\t${row.image_status ?? 'null'}`);
    }
    console.log('Dry run only. Re-run with --enqueue after explicit approval to queue jobs.');
    return;
  }

  for (const row of rows) {
    const now = new Date().toISOString();
    const jobId = `career-playbook-image-${row.id}`;
    const language = row.language === 'en' ? 'en' : 'ru';
    const jobData: CareerPlaybookGenerateImageJobData = {
      jobType: JobType.CAREER_PLAYBOOK,
      operation: 'GENERATE_IMAGE',
      playbookId: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      language,
      locale: language,
      createdAt: now,
      force: true,
    };

    await supabase
      .from('career_playbooks')
      .update({
        image_status: 'pending',
        image_error_message: null,
        image_updated_at: now,
      })
      .eq('id', row.id);

    await removeTerminalJobById(jobId);
    await addJob(JobType.CAREER_PLAYBOOK, jobData, {
      jobId,
      priority: 4,
    });
    console.log(`queued\t${row.id}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
