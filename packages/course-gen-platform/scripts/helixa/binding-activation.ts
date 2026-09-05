#!/usr/bin/env tsx

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import type { BridgeBindingRow } from './provision-bridge';

export type BridgeActivationMode = 'plan' | 'apply';
export type BridgeActivationAction = 'activate' | 'deactivate';

export interface BridgeActivationInput {
  organizationId: string;
  bindingId: string;
  environment: string;
  destinationBindingId: string;
  sourceHelixaOrganizationId: string;
  sourceHelixaProjectId: string;
  servicePrincipalUserId: string;
}

export interface BridgeActivationStore {
  findBinding(bindingId: string): Promise<BridgeBindingRow | null>;
  compareAndSetBindingEnabled(
    expected: BridgeBindingRow,
    desiredEnabled: boolean
  ): Promise<BridgeBindingRow | null>;
}

type BridgeActivationChange = 'activate_binding' | 'deactivate_binding';

export interface BridgeActivationResult {
  mode: BridgeActivationMode;
  action: BridgeActivationAction;
  organizationId: string;
  bindingId: string;
  environment: string;
  destinationBindingId: string;
  principalId: string;
  enabledBefore: boolean;
  enabled: boolean;
  changes: BridgeActivationChange[];
  counts: { planned: number; applied: number };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BINDING_COLUMNS =
  'binding_id,organization_id,environment,destination_binding_id,enabled,generation_service_principal_user_id,job_instruction_creation_enabled,course_from_job_instruction_creation_enabled,course_creation_enabled,source_helixa_organization_id,source_helixa_project_id';

function requireCleanValue(name: string, value: string): void {
  if (!value || value.trim() !== value) {
    throw new Error(`${name} must be non-empty and have no surrounding whitespace`);
  }
}

function validateInput(input: BridgeActivationInput): void {
  if (!UUID_PATTERN.test(input.organizationId)) {
    throw new Error('organizationId must be a UUID');
  }
  if (!UUID_PATTERN.test(input.servicePrincipalUserId)) {
    throw new Error('servicePrincipalUserId must be a UUID');
  }
  for (const [name, value] of Object.entries({
    bindingId: input.bindingId,
    environment: input.environment,
    destinationBindingId: input.destinationBindingId,
    sourceHelixaOrganizationId: input.sourceHelixaOrganizationId,
    sourceHelixaProjectId: input.sourceHelixaProjectId,
  })) {
    requireCleanValue(name, value);
  }
}

function bindingMatchesInput(
  row: BridgeBindingRow,
  input: BridgeActivationInput
): boolean {
  return (
    row.binding_id === input.bindingId &&
    row.organization_id === input.organizationId &&
    row.environment === input.environment &&
    row.destination_binding_id === input.destinationBindingId &&
    row.generation_service_principal_user_id === input.servicePrincipalUserId &&
    row.job_instruction_creation_enabled === true &&
    row.course_from_job_instruction_creation_enabled === true &&
    row.course_creation_enabled === true &&
    row.source_helixa_organization_id === input.sourceHelixaOrganizationId &&
    row.source_helixa_project_id === input.sourceHelixaProjectId
  );
}

function assertExactBinding(
  row: BridgeBindingRow | null,
  input: BridgeActivationInput
): asserts row is BridgeBindingRow {
  if (!row) throw new Error(`Helixa bridge binding ${input.bindingId} does not exist`);
  if (!bindingMatchesInput(row, input)) {
    throw new Error('Helixa bridge binding conflict; refusing to update existing state');
  }
}

function resultFor(
  input: BridgeActivationInput,
  mode: BridgeActivationMode,
  action: BridgeActivationAction,
  enabledBefore: boolean,
  enabled: boolean,
  changes: BridgeActivationChange[],
  applied: number
): BridgeActivationResult {
  return {
    mode,
    action,
    organizationId: input.organizationId,
    bindingId: input.bindingId,
    environment: input.environment,
    destinationBindingId: input.destinationBindingId,
    principalId: input.servicePrincipalUserId,
    enabledBefore,
    enabled,
    changes,
    counts: { planned: changes.length, applied },
  };
}

export async function setHelixaBridgeActivation(
  store: BridgeActivationStore,
  input: BridgeActivationInput,
  mode: BridgeActivationMode,
  action: BridgeActivationAction
): Promise<BridgeActivationResult> {
  validateInput(input);
  if (mode !== 'plan' && mode !== 'apply') {
    throw new Error(`unsupported activation mode: ${String(mode)}`);
  }
  if (action !== 'activate' && action !== 'deactivate') {
    throw new Error(`unsupported activation action: ${String(action)}`);
  }

  const desiredEnabled = action === 'activate';
  const initial = await store.findBinding(input.bindingId);
  assertExactBinding(initial, input);
  if (initial.enabled === desiredEnabled) {
    return resultFor(input, mode, action, initial.enabled, desiredEnabled, [], 0);
  }

  const change: BridgeActivationChange = desiredEnabled
    ? 'activate_binding'
    : 'deactivate_binding';
  if (mode === 'plan') {
    return resultFor(input, mode, action, initial.enabled, desiredEnabled, [change], 0);
  }

  try {
    const updated = await store.compareAndSetBindingEnabled(initial, desiredEnabled);
    if (updated) {
      assertExactBinding(updated, input);
      if (updated.enabled !== desiredEnabled) {
        throw new Error('Helixa bridge binding update returned the wrong enabled state');
      }
    }
  } catch (error) {
    let recovered: BridgeBindingRow | null;
    try {
      recovered = await store.findBinding(input.bindingId);
      assertExactBinding(recovered, input);
    } catch (readbackError) {
      throw new AggregateError(
        [error, readbackError],
        'Helixa bridge activation outcome is uncertain; exact readback failed'
      );
    }
    if (recovered.enabled !== desiredEnabled) throw error;
    return resultFor(input, mode, action, initial.enabled, desiredEnabled, [change], 1);
  }

  const final = await store.findBinding(input.bindingId);
  assertExactBinding(final, input);
  if (final.enabled !== desiredEnabled) {
    throw new Error('Helixa bridge binding conditional update was not applied');
  }
  return resultFor(input, mode, action, initial.enabled, desiredEnabled, [change], 1);
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

function inputFromEnvironment(): BridgeActivationInput {
  return {
    organizationId: requireEnvironment('MC2_HELIXA_ORGANIZATION_ID'),
    bindingId: requireEnvironment('MC2_HELIXA_BINDING_ID'),
    environment: requireEnvironment('MC2_HELIXA_ENVIRONMENT'),
    destinationBindingId: requireEnvironment('MC2_HELIXA_DESTINATION_BINDING_ID'),
    sourceHelixaOrganizationId: requireEnvironment('MC2_HELIXA_SOURCE_ORGANIZATION_ID'),
    sourceHelixaProjectId: requireEnvironment('MC2_HELIXA_SOURCE_PROJECT_ID'),
    servicePrincipalUserId: requireEnvironment('MC2_HELIXA_SERVICE_PRINCIPAL_USER_ID'),
  };
}

export function createSupabaseActivationStore(): BridgeActivationStore {
  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SERVICE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const assertNoError = (subject: string, error: { message: string } | null): void => {
    if (error) throw new Error(`${subject}: ${error.message}`);
  };

  return {
    async findBinding(bindingId) {
      const { data, error } = await supabase
        .from('helixa_knowledge_sync_bindings')
        .select(BINDING_COLUMNS)
        .eq('binding_id', bindingId)
        .maybeSingle();
      assertNoError('failed to read Helixa bridge binding', error);
      return data as BridgeBindingRow | null;
    },

    async compareAndSetBindingEnabled(expected, desiredEnabled) {
      const { data, error } = await supabase
        .from('helixa_knowledge_sync_bindings')
        .update({ enabled: desiredEnabled })
        .eq('binding_id', expected.binding_id)
        .eq('organization_id', expected.organization_id)
        .eq('environment', expected.environment)
        .eq('destination_binding_id', expected.destination_binding_id)
        .eq('enabled', expected.enabled)
        .eq(
          'generation_service_principal_user_id',
          expected.generation_service_principal_user_id
        )
        .eq('job_instruction_creation_enabled', expected.job_instruction_creation_enabled)
        .eq(
          'course_from_job_instruction_creation_enabled',
          expected.course_from_job_instruction_creation_enabled
        )
        .eq('course_creation_enabled', expected.course_creation_enabled)
        .eq('source_helixa_organization_id', expected.source_helixa_organization_id)
        .eq('source_helixa_project_id', expected.source_helixa_project_id)
        .select(BINDING_COLUMNS)
        .maybeSingle();
      assertNoError('failed to conditionally update Helixa bridge binding', error);
      return data as BridgeBindingRow | null;
    },
  };
}

async function main(): Promise<void> {
  const rawMode = process.argv[2];
  const rawAction = process.argv[3];
  if (
    (rawMode !== 'plan' && rawMode !== 'apply') ||
    (rawAction !== 'activate' && rawAction !== 'deactivate')
  ) {
    throw new Error(
      'usage: tsx scripts/helixa/binding-activation.ts [plan|apply] [activate|deactivate]'
    );
  }
  const result = await setHelixaBridgeActivation(
    createSupabaseActivationStore(),
    inputFromEnvironment(),
    rawMode,
    rawAction
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
