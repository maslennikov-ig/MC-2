#!/usr/bin/env tsx
/**
 * Bring `prompt_templates` rows that no longer fit their caller back into line.
 *
 * `prompt_templates` overrides `PROMPT_REGISTRY` at runtime so a prompt can be
 * changed without a deploy. Nothing checked that a row still matched the code
 * calling it, and on 2026-08-23 eight of twenty-one active rows did not. Two
 * were on a live path:
 *
 * - `stage4_phase3_expert`, dated 2025-12-04, asking for `{{userRequirements}}`
 *   that no caller passes and dropping `{{schemaDescription}}` — the model was
 *   told to match a schema it could not see. That is mc2-51epl warning 2.
 * - `stage7_cover_user`, ignoring `colorScheme`, `aesthetic`, `visualElements`
 *   and `mood`, so every lesson cover was drawn without its art direction. That
 *   one printed nothing at all.
 *
 * `checkOverrideContract` now refuses such a row at runtime and uses the
 * registry, so this script is not what makes the system correct — it is what
 * stops the log repeating a problem already solved, and it puts the table back
 * to meaning what it says.
 *
 * Read-only unless `--apply` is passed. Only touches rows the contract check
 * rejects; a row that fits is somebody's deliberate override and is left alone.
 *
 * A row with no registry entry is a third case, and neither `--apply` nor the
 * runtime guard can do anything with it: there is nothing to compare it to, and
 * overwriting it would delete the only copy. Such a row is still reported by
 * name, because a count alone (`5 with no registry entry`) cost an hour of
 * grepping to turn back into five keys (mc2-jraut). Retiring one is
 * `--deactivate`, and it takes the keys explicitly — the pipeline-admin screen
 * can create a prompt whose key the registry has never heard of, so "deactivate
 * every orphan" would silently retire somebody's new prompt.
 *
 * Usage:
 *   tsx scripts/sync-prompt-templates-to-registry.ts            # report only
 *   tsx scripts/sync-prompt-templates-to-registry.ts --apply
 *   tsx scripts/sync-prompt-templates-to-registry.ts --deactivate=key_a,key_b
 */

import 'dotenv/config';

import { getSupabaseAdmin } from '../src/shared/supabase/admin.js';
import { PROMPT_REGISTRY } from '../src/shared/prompts/prompt-registry.js';
import { checkOverrideContract } from '../src/shared/prompts/prompt-override-contract.js';
import { decideDeactivation } from '../src/shared/prompts/prompt-deactivation.js';

interface Row {
  prompt_key: string;
  prompt_template: string;
  is_active: boolean;
  version: number | null;
}

/** Keys named on the command line as `--deactivate=a,b`; empty when absent. */
function requestedDeactivations(argv: string[]): string[] {
  const flag = argv.find(argument => argument.startsWith('--deactivate='));
  if (!flag) return [];
  return flag
    .slice('--deactivate='.length)
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);
}

/**
 * Retire the named keys by clearing `is_active`. The template text stays, so
 * the move is one `is_active = true` from reversible. `decideDeactivation`
 * holds the rules and the reasons; this only carries them out.
 */
async function deactivate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  keys: string[],
  rows: Row[]
): Promise<void> {
  const active = new Set(rows.map(row => row.prompt_key));

  for (const key of keys) {
    const decision = decideDeactivation({
      key,
      declaredInRegistry: PROMPT_REGISTRY.has(key),
      activeInDatabase: active.has(key),
    });

    if (decision.action === 'refuse') {
      console.error(`REFUSED ${key}: ${decision.reason}`);
      process.exitCode = 1;
      continue;
    }
    if (decision.action === 'skip') {
      console.log(`skipped ${key}: ${decision.reason}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('prompt_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('prompt_key', key);

    if (updateError) {
      console.error(`FAILED ${key}: ${updateError.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`deactivated ${key} (template kept; reverse with is_active = true)`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const toDeactivate = requestedDeactivations(process.argv);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('prompt_key, prompt_template, is_active, version')
    .eq('is_active', true)
    .order('prompt_key');

  if (error) throw new Error(`Failed to read prompt_templates: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const broken: Array<{ row: Row; unknown: string[]; dropped: string[] }> = [];
  const orphans: Row[] = [];

  for (const row of rows) {
    const registryPrompt = PROMPT_REGISTRY.get(row.prompt_key);
    if (!registryPrompt) {
      // The database is this key's only source. Nothing to compare against, and
      // overwriting it would delete the only copy.
      orphans.push(row);
      continue;
    }

    const violation = checkOverrideContract(row.prompt_template, registryPrompt);
    if (violation) {
      broken.push({
        row,
        unknown: violation.unknownPlaceholders,
        dropped: violation.droppedRequiredVariables,
      });
    }
  }

  console.log(
    `${rows.length} active rows; ${orphans.length} with no registry entry (left alone); ${broken.length} that no longer fit their caller.\n`
  );

  if (orphans.length > 0) {
    console.log('no registry entry — nothing reads these unless a caller names the key directly:');
    for (const row of orphans)
      console.log(`  ${row.prompt_key}  db=${row.prompt_template.length} chars`);
    console.log('');
  }

  if (toDeactivate.length > 0) {
    await deactivate(supabase, toDeactivate, rows);
    return;
  }

  for (const { row, unknown, dropped } of broken) {
    const registryPrompt = PROMPT_REGISTRY.get(row.prompt_key)!;
    console.log(
      `${row.prompt_key}  db=${row.prompt_template.length} chars  registry=${registryPrompt.promptTemplate.length} chars`
    );
    if (unknown.length > 0) console.log(`  placeholders no caller fills: ${unknown.join(', ')}`);
    if (dropped.length > 0) console.log(`  required variables dropped:   ${dropped.join(', ')}`);
  }

  if (broken.length === 0) return;

  if (!apply) {
    console.log('\nRe-run with --apply to replace these with the registry text and variables.');
    return;
  }

  for (const { row } of broken) {
    const registryPrompt = PROMPT_REGISTRY.get(row.prompt_key)!;
    const { error: updateError } = await supabase
      .from('prompt_templates')
      .update({
        prompt_template: registryPrompt.promptTemplate,
        prompt_name: registryPrompt.promptName,
        prompt_description: registryPrompt.promptDescription,
        variables: registryPrompt.variables,
        version: (row.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('prompt_key', row.prompt_key);

    if (updateError) {
      console.error(`FAILED ${row.prompt_key}: ${updateError.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`updated ${row.prompt_key} -> version ${(row.version ?? 1) + 1}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
