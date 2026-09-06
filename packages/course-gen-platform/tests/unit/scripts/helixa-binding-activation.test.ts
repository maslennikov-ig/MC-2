import { describe, expect, it } from 'vitest';

import type { BridgeBindingRow } from '../../../scripts/helixa/provision-bridge';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL_ID = '22222222-2222-4222-8222-222222222222';

interface ActivationInput {
  organizationId: string;
  bindingId: string;
  environment: string;
  destinationBindingId: string;
  sourceHelixaOrganizationId: string;
  sourceHelixaProjectId: string;
  servicePrincipalUserId: string;
}

interface ActivationStore {
  findBinding(bindingId: string): Promise<BridgeBindingRow | null>;
  compareAndSetBindingEnabled(
    expected: BridgeBindingRow,
    desiredEnabled: boolean
  ): Promise<BridgeBindingRow | null>;
}

type ActivationSubject = {
  setHelixaBridgeActivation(
    store: ActivationStore,
    input: ActivationInput,
    mode: 'plan' | 'apply',
    action: 'activate' | 'deactivate'
  ): Promise<{
    enabledBefore: boolean;
    enabled: boolean;
    changes: string[];
    counts: { planned: number; applied: number };
  }>;
};

const input: ActivationInput = {
  organizationId: ORGANIZATION_ID,
  bindingId: 'helixa-production',
  environment: 'production',
  destinationBindingId: 'mc2-production',
  sourceHelixaOrganizationId: 'helixa-org-1',
  sourceHelixaProjectId: 'helixa-project-1',
  servicePrincipalUserId: PRINCIPAL_ID,
};

function binding(enabled = false): BridgeBindingRow {
  return {
    binding_id: input.bindingId,
    organization_id: input.organizationId,
    environment: input.environment,
    destination_binding_id: input.destinationBindingId,
    enabled,
    generation_service_principal_user_id: input.servicePrincipalUserId,
    job_instruction_creation_enabled: true,
    course_from_job_instruction_creation_enabled: true,
    course_creation_enabled: true,
    source_helixa_organization_id: input.sourceHelixaOrganizationId,
    source_helixa_project_id: input.sourceHelixaProjectId,
  };
}

function rowsEqual(left: BridgeBindingRow, right: BridgeBindingRow): boolean {
  return (Object.keys(right) as Array<keyof BridgeBindingRow>).every(
    key => left[key] === right[key]
  );
}

class MemoryActivationStore implements ActivationStore {
  row: BridgeBindingRow | null = binding();
  updates: Array<{ expected: BridgeBindingRow; desiredEnabled: boolean }> = [];
  loseUpdateResponse = false;
  beforeCompareAndSet: (() => void) | null = null;

  findBinding(bindingId: string) {
    return Promise.resolve(this.row?.binding_id === bindingId ? { ...this.row } : null);
  }

  compareAndSetBindingEnabled(expected: BridgeBindingRow, desiredEnabled: boolean) {
    this.updates.push({ expected: { ...expected }, desiredEnabled });
    this.beforeCompareAndSet?.();
    if (!this.row || !rowsEqual(this.row, expected)) return Promise.resolve(null);
    this.row = { ...this.row, enabled: desiredEnabled };
    if (this.loseUpdateResponse) return Promise.reject(new Error('update response lost'));
    return Promise.resolve({ ...this.row });
  }
}

async function loadSubject(): Promise<ActivationSubject> {
  const modulePath = '../../../scripts/helixa/' + 'binding-activation';
  const subject = (await import(modulePath).catch(() => null)) as ActivationSubject | null;
  expect(subject, 'binding activation operator must exist').not.toBeNull();
  return subject!;
}

describe('Helixa bridge binding activation', () => {
  it('plans activation without writing', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();

    const result = await subject.setHelixaBridgeActivation(store, input, 'plan', 'activate');

    expect(result).toMatchObject({
      enabledBefore: false,
      enabled: true,
      changes: ['activate_binding'],
      counts: { planned: 1, applied: 0 },
    });
    expect(store.updates).toEqual([]);
  });

  it('activates only through a full exact-row comparison and readback', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();

    const result = await subject.setHelixaBridgeActivation(store, input, 'apply', 'activate');

    expect(result).toMatchObject({
      enabledBefore: false,
      enabled: true,
      changes: ['activate_binding'],
      counts: { planned: 1, applied: 1 },
    });
    expect(store.updates).toEqual([{ expected: binding(false), desiredEnabled: true }]);
    expect(store.row).toEqual(binding(true));
  });

  it('replays an already active exact binding without writing', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();
    store.row = binding(true);

    const result = await subject.setHelixaBridgeActivation(store, input, 'apply', 'activate');

    expect(result).toMatchObject({
      enabledBefore: true,
      enabled: true,
      changes: [],
      counts: { planned: 0, applied: 0 },
    });
    expect(store.updates).toEqual([]);
  });

  it('deactivates the exact binding as the rollback operation', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();
    store.row = binding(true);

    const result = await subject.setHelixaBridgeActivation(
      store,
      input,
      'apply',
      'deactivate'
    );

    expect(result).toMatchObject({
      enabledBefore: true,
      enabled: false,
      changes: ['deactivate_binding'],
      counts: { planned: 1, applied: 1 },
    });
    expect(store.updates).toEqual([{ expected: binding(true), desiredEnabled: false }]);
  });

  it.each([
    ['organization', 'organization_id', '33333333-3333-4333-8333-333333333333'],
    ['environment', 'environment', 'staging'],
    ['destination', 'destination_binding_id', 'other-destination'],
    ['source organization', 'source_helixa_organization_id', 'other-source-org'],
    ['source project', 'source_helixa_project_id', 'other-source-project'],
    ['principal', 'generation_service_principal_user_id', '44444444-4444-4444-8444-444444444444'],
    ['permission', 'course_creation_enabled', false],
  ] as const)('refuses a %s mismatch without writing', async (_name, key, value) => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();
    store.row = { ...binding(false), [key]: value };

    await expect(
      subject.setHelixaBridgeActivation(store, input, 'apply', 'activate')
    ).rejects.toThrow('Helixa bridge binding conflict');
    expect(store.updates).toEqual([]);
  });

  it('treats a lost update response as success only after exact readback', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();
    store.loseUpdateResponse = true;

    const result = await subject.setHelixaBridgeActivation(store, input, 'apply', 'activate');

    expect(result.counts).toEqual({ planned: 1, applied: 1 });
    expect(result.enabled).toBe(true);
    expect(store.row).toEqual(binding(true));
  });

  it('fails closed if the tuple changes between inspection and conditional update', async () => {
    const subject = await loadSubject();
    const store = new MemoryActivationStore();
    store.beforeCompareAndSet = () => {
      store.row = { ...binding(false), destination_binding_id: 'raced-destination' };
    };

    await expect(
      subject.setHelixaBridgeActivation(store, input, 'apply', 'activate')
    ).rejects.toThrow('Helixa bridge binding conflict');
    expect(store.row?.enabled).toBe(false);
  });
});
