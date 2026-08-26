#!/usr/bin/env tsx
/**
 * Career Playbook: measure the prose model on groups 1-4 and 6 (mc2-gg65o).
 *
 * The question the owner asked on 2026-08-23 is narrow: those five groups write
 * prose on DeepSeek while `group_5`, `spec`, `proofreader` and `regenerator`
 * run on Luna, and nobody has measured whether that costs the reader anything.
 * The lesson body was settled the same way (`mc2-bneet`) and the METHOD mattered
 * more than the answer: same input twice, read the artifact, and do not trust
 * the judge — it moved only 0.92 -> 0.88 on a difference that included a
 * fabricated statistic.
 *
 * Two rules this script exists to honour:
 *
 * 1. **It changes no stored configuration.** Dev and staging share one Supabase
 *    project, so a global `UPDATE llm_model_config` would move somebody else's
 *    run in the middle of this measurement. `llm_model_config.course_id` is a
 *    foreign key into `courses` and a playbook is not a course, so a
 *    course-scoped override — what the plan suggested — cannot be written for a
 *    playbook at all. Instead the runtime's `modelConfigService` is wrapped for
 *    the duration of the process: the real one answers, and the model id is
 *    swapped on the way out.
 *
 * 2. **It replays one stage, not the pipeline.** The groups are generated from
 *    a `role_profile_spec` that already exists, so the spec builder, the
 *    proofreader, the judges and the cover image are not paid for twice. Those
 *    are on Luna already and are not what is being asked about.
 *
 * Usage:
 *   tsx scripts/career-playbook-model-ab.ts --playbook <uuid> [--out <dir>]
 *                                           [--groups group_1_foundation,...]
 *
 * Writes one markdown file per (group, model) plus a `summary.json`, and prints
 * the measurable differences. What it cannot print is the judgement the plan
 * asks for — length, concreteness, and any statistic without a source — so it
 * ends by naming the files to read.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import {
  generateCareerPlaybookGroup,
  type GenerateCareerPlaybookGroupResult,
} from '../src/stages/stage-career-playbook/nodes/group-generator';
import { createCareerPlaybookRuntime } from '../src/stages/stage-career-playbook/nodes/runtime';
import { createModelConfigService } from '../src/shared/llm/model-config-service';

/** The five groups that write prose on DeepSeek today. */
const DEFAULT_GROUPS = [
  'group_1_foundation',
  'group_2_operations',
  'group_3_people',
  'group_4_growth',
  'group_6_wrap',
] as const;

interface Args {
  playbookId: string;
  outDir: string;
  groups: string[];
  /** Which side of the comparison to run. Both, unless a run was interrupted. */
  models: string[];
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const playbookId = get('--playbook');
  if (!playbookId) {
    throw new Error(
      'Usage: tsx scripts/career-playbook-model-ab.ts --playbook <uuid> [--out <dir>]'
    );
  }

  const groupsRaw = get('--groups');
  const modelsRaw = get('--models');
  return {
    playbookId,
    outDir: get('--out') ?? path.join(process.cwd(), '.career-playbook-ab'),
    groups: groupsRaw ? groupsRaw.split(',').map(value => value.trim()) : [...DEFAULT_GROUPS],
    // DeepSeek took 86-183s per group on 2026-08-23, so a full ten-call run is
    // long enough to be interrupted. This exists so the remainder can be
    // finished without paying again for the half that already succeeded.
    models: modelsRaw ? modelsRaw.split(',').map(value => value.trim()) : ['deepseek', 'luna'],
  };
}

/**
 * The real config service with one model id swapped.
 *
 * Everything else the phase carries — temperature, token budget, timeout,
 * fallback — is left exactly as stored. Changing more than one variable would
 * make the comparison unreadable.
 */
function withModelOverride(modelId: string) {
  const real = createModelConfigService();
  return {
    async getModelForPhase(...args: Parameters<typeof real.getModelForPhase>) {
      const config = await real.getModelForPhase(...args);
      return { ...config, modelId };
    },
  } as ReturnType<typeof createModelConfigService>;
}

/** Numbers a reader can check, and the one that needs eyes. */
function describe(markdown: string) {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  // A percentage or a "N из M" claim. Not a verdict — a place to look. The
  // 2026-08-22 comparison found "более 60% людей" with no source, and no
  // automatic check would have called that wrong.
  const numericClaims = markdown.match(/\d+([.,]\d+)?\s*%|\b\d+\s+(из|of)\s+\d+\b/gu) ?? [];
  const headings = (markdown.match(/^#{1,6}\s/gmu) ?? []).length;
  const tables = (markdown.match(/^\|/gmu) ?? []).length;
  const bullets = (markdown.match(/^\s*[-*]\s/gmu) ?? []).length;
  return {
    characters: markdown.length,
    words,
    headings,
    tableRows: tables,
    bullets,
    numericClaims: numericClaims.length,
    numericClaimSamples: numericClaims.slice(0, 12),
  };
}

async function loadSpec(playbookId: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, position_title, language, role_profile_spec, q_a_data')
    .eq('id', playbookId)
    .single();

  if (error || !data) throw new Error(`Cannot read playbook ${playbookId}: ${error?.message}`);
  if (!data.role_profile_spec)
    throw new Error(`Playbook ${playbookId} carries no role_profile_spec`);
  return data;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const playbook = await loadSpec(args.playbookId);
  await mkdir(args.outDir, { recursive: true });

  const models = [
    { label: 'deepseek', modelId: 'deepseek/deepseek-v4-flash-0731' },
    { label: 'luna', modelId: 'openai/gpt-5.6-luna' },
    /**
     * The candidate the owner named on 2026-08-26, in place of `luna-pro`.
     *
     * `z-ai/glm-5.3-flash` costs $0.075/$0.25 against luna's $0.20/$1.20, and
     * `probe-model-substitution.ts` measured it 21-41% cheaper per call on the
     * same prompt even though mandatory reasoning makes it write 5-12x more
     * completion tokens. Two things it cannot do are already known and neither
     * touches these groups: it refuses `reasoning: { enabled: false }` with a
     * 400, and it ignores a strict `json_schema` and answers with a shape of
     * its own. The groups write markdown prose and ask for no schema, so this
     * is the one comparison the probe cannot settle — whether the prose is
     * worth reading (mc2-lwrle).
     */
    { label: 'glm-flash', modelId: 'z-ai/glm-5.3-flash' },
  ].filter(model => args.models.includes(model.label));

  if (models.length === 0) {
    throw new Error('--models matched nothing; known labels: deepseek, luna, glm-flash');
  }

  const summary: Record<string, unknown>[] = [];

  for (const model of models) {
    const runtime = createCareerPlaybookRuntime({
      modelConfigService: withModelOverride(model.modelId),
    });

    for (const groupKey of args.groups) {
      const startedAt = Date.now();
      let result: GenerateCareerPlaybookGroupResult;
      try {
        result = await generateCareerPlaybookGroup(
          {
            groupKey: groupKey as never,
            roleProfileSpec: playbook.role_profile_spec as never,
            language: playbook.language ?? 'ru',
            qaData: (playbook.q_a_data ?? undefined) as never,
          },
          runtime
        );
      } catch (error) {
        console.error(
          `[${model.label}/${groupKey}] FAILED: ${error instanceof Error ? error.message : String(error)}`
        );
        summary.push({ model: model.label, groupKey, failed: true });
        continue;
      }

      const file = path.join(args.outDir, `${groupKey}.${model.label}.md`);
      await writeFile(file, result.group.markdown, 'utf8');

      const stats = describe(result.group.markdown);
      const row = {
        model: model.label,
        modelReported: result.group.model,
        groupKey,
        file,
        durationMs: Date.now() - startedAt,
        costUsd: result.nodeCost.cost_usd,
        inputTokens: result.nodeCost.input_tokens,
        outputTokens: result.nodeCost.output_tokens,
        qualityIssues: result.qualityIssues.length,
        ...stats,
      };
      summary.push(row);
      console.log(
        `[${model.label}/${groupKey}] ${stats.characters} chars, ${stats.words} words, ` +
          `${stats.numericClaims} numeric claims, $${(result.nodeCost.cost_usd ?? 0).toFixed(6)}, ` +
          `${row.durationMs}ms`
      );
    }
  }

  await writeFile(
    path.join(args.outDir, `summary.${args.models.join('-')}.json`),
    JSON.stringify(
      { playbook: playbook.id, position: playbook.position_title, models: args.models, summary },
      null,
      2
    ),
    'utf8'
  );

  const total = summary.reduce((sum, row) => sum + ((row.costUsd as number) ?? 0), 0);
  console.log(`\nTotal recorded cost: $${total.toFixed(6)}`);
  console.log(
    `\nRead the artifacts, do not stop at these numbers (mc2-bneet): ${args.outDir}\n` +
      'What to look for: length, whether a claim is worked through or narrated, and any\n' +
      'statistic with no source in the spec.'
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
