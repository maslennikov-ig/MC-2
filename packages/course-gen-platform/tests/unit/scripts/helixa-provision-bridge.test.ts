import { describe, expect, it } from 'vitest';

import {
  provisionHelixaBridge,
  type BridgeAuthUser,
  type BridgeBindingRow,
  type BridgeMembershipRow,
  type BridgeProvisioningInput,
  type BridgeProvisioningStore,
  type BridgePublicUserRow,
} from '../../../scripts/helixa/provision-bridge';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL_ID = '22222222-2222-4222-8222-222222222222';

const input: BridgeProvisioningInput = {
  organizationId: ORGANIZATION_ID,
  bindingId: 'helixa-production',
  environment: 'production',
  destinationBindingId: 'mc2-production',
  sourceHelixaOrganizationId: 'helixa-org-1',
  sourceHelixaProjectId: 'helixa-project-1',
  membershipRole: 'instructor',
};

class MemoryStore implements BridgeProvisioningStore {
  organizationExists = true;
  authUsers: BridgeAuthUser[] = [];
  publicUsers: BridgePublicUserRow[] = [];
  memberships: BridgeMembershipRow[] = [];
  bindings: BridgeBindingRow[] = [];
  writes: string[] = [];

  findOrganization(organizationId: string) {
    return Promise.resolve(
      this.organizationExists && organizationId === ORGANIZATION_ID ? { id: ORGANIZATION_ID } : null
    );
  }

  findOrganizationByName(name: string) {
    return Promise.resolve(name === 'Default Organization' ? { id: ORGANIZATION_ID } : null);
  }

  listAuthUsers() {
    return Promise.resolve(this.authUsers);
  }

  findPublicUser(userId: string) {
    return Promise.resolve(this.publicUsers.find(row => row.id === userId) ?? null);
  }

  findMembership(organizationId: string, userId: string) {
    return Promise.resolve(
      this.memberships.find(
        row => row.organization_id === organizationId && row.user_id === userId
      ) ?? null
    );
  }

  findBinding(bindingId: string) {
    return Promise.resolve(this.bindings.find(row => row.binding_id === bindingId) ?? null);
  }

  createAuthPrincipal(attributes: Parameters<BridgeProvisioningStore['createAuthPrincipal']>[0]) {
    this.writes.push('create-auth');
    const user: BridgeAuthUser = {
      id: PRINCIPAL_ID,
      email: attributes.email,
      app_metadata: attributes.appMetadata,
      banned_until: '2126-01-01T00:00:00.000Z',
    };
    this.authUsers.push(user);
    this.publicUsers.push({
      id: PRINCIPAL_ID,
      email: attributes.email,
      organization_id: '00000000-0000-4000-8000-000000000000',
      role: attributes.publicRole,
    });
    return Promise.resolve(user);
  }

  updateCreatedPublicUser(userId: string, row: Omit<BridgePublicUserRow, 'id'>) {
    this.writes.push('update-created-public-user');
    const index = this.publicUsers.findIndex(user => user.id === userId);
    this.publicUsers[index] = { id: userId, ...row };
    return Promise.resolve();
  }

  insertPublicUser(row: BridgePublicUserRow) {
    this.writes.push('insert-public-user');
    this.publicUsers.push(row);
    return Promise.resolve();
  }

  insertMembership(row: BridgeMembershipRow) {
    this.writes.push('insert-membership');
    this.memberships.push(row);
    return Promise.resolve();
  }

  insertBinding(row: BridgeBindingRow) {
    this.writes.push('insert-binding');
    this.bindings.push(row);
    return Promise.resolve();
  }

  deleteCreatedPrincipal(userId: string) {
    this.writes.push('delete-created-principal');
    this.authUsers = this.authUsers.filter(user => user.id !== userId);
    this.publicUsers = this.publicUsers.filter(user => user.id !== userId);
    this.memberships = this.memberships.filter(member => member.user_id !== userId);
    return Promise.resolve();
  }
}

describe('Helixa bridge provisioning', () => {
  it('plans every missing object without writing', async () => {
    const store = new MemoryStore();

    const result = await provisionHelixaBridge(store, input, 'plan');

    expect(result.mode).toBe('plan');
    expect(result.changes).toEqual([
      'create_service_principal',
      'align_created_public_user',
      'insert_membership',
      'insert_binding',
    ]);
    expect(result.counts).toEqual({ planned: 4, applied: 0 });
    expect(store.writes).toEqual([]);
  });

  it('applies an exact disabled three-capability binding', async () => {
    const store = new MemoryStore();

    const result = await provisionHelixaBridge(store, input, 'apply');

    expect(result.mode).toBe('apply');
    expect(result.principalId).toBe(PRINCIPAL_ID);
    expect(result.counts).toEqual({ planned: 4, applied: 4 });
    expect(store.bindings).toEqual([
      {
        binding_id: input.bindingId,
        organization_id: input.organizationId,
        environment: input.environment,
        destination_binding_id: input.destinationBindingId,
        enabled: false,
        generation_service_principal_user_id: PRINCIPAL_ID,
        job_instruction_creation_enabled: true,
        course_from_job_instruction_creation_enabled: true,
        course_creation_enabled: true,
        source_helixa_organization_id: input.sourceHelixaOrganizationId,
        source_helixa_project_id: input.sourceHelixaProjectId,
      },
    ]);
    expect(store.memberships).toEqual([
      { organization_id: ORGANIZATION_ID, user_id: PRINCIPAL_ID, role: 'instructor' },
    ]);
  });

  it('replays an exact provisioned state without writes', async () => {
    const store = new MemoryStore();
    await provisionHelixaBridge(store, input, 'apply');
    store.writes = [];

    const result = await provisionHelixaBridge(store, input, 'apply');

    expect(result.changes).toEqual([]);
    expect(result.counts).toEqual({ planned: 0, applied: 0 });
    expect(store.writes).toEqual([]);
  });

  it('fails closed when the existing identity has a different permission tuple', async () => {
    const store = new MemoryStore();
    await provisionHelixaBridge(store, input, 'apply');
    store.authUsers[0].app_metadata.role = 'admin';
    store.writes = [];

    await expect(provisionHelixaBridge(store, input, 'apply')).rejects.toThrow(
      'service principal identity conflict'
    );
    expect(store.writes).toEqual([]);
  });
});
