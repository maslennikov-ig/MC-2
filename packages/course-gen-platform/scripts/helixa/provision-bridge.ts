#!/usr/bin/env tsx

import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

export type BridgeProvisioningMode = 'plan' | 'apply';
export type BridgeMembershipRole = 'owner' | 'admin' | 'instructor';
type PublicUserRole = 'admin' | 'instructor';

export interface BridgeProvisioningInput {
  organizationId: string;
  bindingId: string;
  environment: string;
  destinationBindingId: string;
  sourceHelixaOrganizationId: string;
  sourceHelixaProjectId: string;
  membershipRole: BridgeMembershipRole;
}

export interface BridgeAuthUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  banned_until: string | null;
}

export interface BridgePublicUserRow {
  id: string;
  email: string;
  organization_id: string;
  role: PublicUserRole;
}

export interface BridgeMembershipRow {
  organization_id: string;
  user_id: string;
  role: BridgeMembershipRole;
}

export interface BridgeBindingRow {
  binding_id: string;
  organization_id: string;
  environment: string;
  destination_binding_id: string;
  enabled: boolean;
  generation_service_principal_user_id: string;
  job_instruction_creation_enabled: boolean;
  course_from_job_instruction_creation_enabled: boolean;
  course_creation_enabled: boolean;
  source_helixa_organization_id: string;
  source_helixa_project_id: string;
}

export interface CreateBridgePrincipalAttributes {
  email: string;
  password: string;
  appMetadata: Record<string, unknown>;
  publicRole: PublicUserRole;
}

export interface BridgeProvisioningStore {
  findOrganization(organizationId: string): Promise<{ id: string } | null>;
  findOrganizationByName(name: string): Promise<{ id: string } | null>;
  listAuthUsers(): Promise<BridgeAuthUser[]>;
  findPublicUser(userId: string): Promise<BridgePublicUserRow | null>;
  findMembership(organizationId: string, userId: string): Promise<BridgeMembershipRow | null>;
  findBinding(bindingId: string): Promise<BridgeBindingRow | null>;
  createAuthPrincipal(attributes: CreateBridgePrincipalAttributes): Promise<BridgeAuthUser>;
  updateCreatedPublicUser(userId: string, row: Omit<BridgePublicUserRow, 'id'>): Promise<void>;
  insertPublicUser(row: BridgePublicUserRow): Promise<void>;
  insertMembership(row: BridgeMembershipRow): Promise<void>;
  insertBinding(row: BridgeBindingRow): Promise<void>;
  deleteCreatedPrincipal(userId: string): Promise<void>;
}

type BridgeChange =
  | 'create_service_principal'
  | 'align_created_public_user'
  | 'insert_public_user'
  | 'insert_membership'
  | 'insert_binding';

export interface BridgeProvisioningResult {
  mode: BridgeProvisioningMode;
  organizationId: string;
  bindingId: string;
  environment: string;
  destinationBindingId: string;
  principalId: string | null;
  changes: BridgeChange[];
  counts: { planned: number; applied: number };
}

interface Inspection {
  principal: BridgeAuthUser | null;
  identityEmail: string;
  appMetadata: Record<string, unknown>;
  publicRole: PublicUserRole;
  changes: BridgeChange[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVISIONER = 'helixa_bridge';
const BAN_DURATION = '876000h';

function failConflict(subject: string): never {
  throw new Error(`${subject} conflict; refusing to update existing state`);
}

function assertCleanValue(name: string, value: string): void {
  if (!value || value.trim() !== value) {
    throw new Error(`${name} must be non-empty and have no surrounding whitespace`);
  }
}

function validateInput(input: BridgeProvisioningInput): void {
  if (!UUID_PATTERN.test(input.organizationId)) {
    throw new Error('organizationId must be a UUID');
  }
  for (const [name, value] of Object.entries({
    bindingId: input.bindingId,
    environment: input.environment,
    destinationBindingId: input.destinationBindingId,
    sourceHelixaOrganizationId: input.sourceHelixaOrganizationId,
    sourceHelixaProjectId: input.sourceHelixaProjectId,
  })) {
    assertCleanValue(name, value);
  }
  if (!['owner', 'admin', 'instructor'].includes(input.membershipRole)) {
    throw new Error('membershipRole must be owner, admin, or instructor');
  }
}

function expectedIdentity(input: BridgeProvisioningInput): {
  email: string;
  appMetadata: Record<string, unknown>;
  publicRole: PublicUserRole;
} {
  const publicRole = input.membershipRole === 'instructor' ? 'instructor' : 'admin';
  const identityHash = createHash('sha256')
    .update(
      JSON.stringify([
        'megacampus.helixa-bridge-service-principal.v1',
        input.bindingId,
        input.organizationId,
        input.environment,
        input.destinationBindingId,
      ])
    )
    .digest('hex')
    .slice(0, 32);
  return {
    email: `helixa-bridge-${identityHash}@service-principal.invalid`,
    publicRole,
    appMetadata: {
      kind: 'service_principal',
      interactive_login_allowed: false,
      provisioner: PROVISIONER,
      helixa_binding_id: input.bindingId,
      organization_id: input.organizationId,
      environment: input.environment,
      destination_binding_id: input.destinationBindingId,
      role: publicRole,
      membership_role: input.membershipRole,
    },
  };
}

function hasExpectedMetadata(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function isSignInBlocked(user: BridgeAuthUser): boolean {
  if (!user.banned_until) return false;
  const timestamp = Date.parse(user.banned_until);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function bindingMatches(actual: BridgeBindingRow, expected: BridgeBindingRow): boolean {
  return (Object.keys(expected) as Array<keyof BridgeBindingRow>).every(
    key => actual[key] === expected[key]
  );
}

async function inspectProvisioning(
  store: BridgeProvisioningStore,
  input: BridgeProvisioningInput
): Promise<Inspection> {
  validateInput(input);
  const identity = expectedIdentity(input);
  const [organization, defaultOrganization, binding, authUsers] = await Promise.all([
    store.findOrganization(input.organizationId),
    store.findOrganizationByName('Default Organization'),
    store.findBinding(input.bindingId),
    store.listAuthUsers(),
  ]);
  if (!organization) throw new Error(`organization ${input.organizationId} does not exist`);
  if (!defaultOrganization) {
    throw new Error(
      'Default Organization does not exist; refusing an Auth create that would create it implicitly'
    );
  }

  const candidates = authUsers.filter(user => {
    const metadataMatch =
      user.app_metadata.provisioner === PROVISIONER &&
      user.app_metadata.helixa_binding_id === input.bindingId;
    return (
      user.email === identity.email ||
      metadataMatch ||
      user.id === binding?.generation_service_principal_user_id
    );
  });
  if (candidates.length > 1) failConflict('service principal identity');
  const principal = candidates[0] ?? null;

  if (principal) {
    if (
      principal.email !== identity.email ||
      !hasExpectedMetadata(principal.app_metadata, identity.appMetadata) ||
      !isSignInBlocked(principal)
    ) {
      failConflict('service principal identity');
    }
  }

  if (binding && !principal) failConflict('binding principal identity');

  const changes: BridgeChange[] = [];
  if (!principal) {
    changes.push('create_service_principal', 'align_created_public_user', 'insert_membership');
  } else {
    const [publicUser, membership] = await Promise.all([
      store.findPublicUser(principal.id),
      store.findMembership(input.organizationId, principal.id),
    ]);
    if (!publicUser) {
      changes.push('insert_public_user');
    } else if (
      publicUser.email !== identity.email ||
      publicUser.organization_id !== input.organizationId ||
      publicUser.role !== identity.publicRole
    ) {
      failConflict('service principal public identity');
    }
    if (!membership) {
      changes.push('insert_membership');
    } else if (membership.role !== input.membershipRole) {
      failConflict('service principal membership permission');
    }
  }

  if (!binding) {
    changes.push('insert_binding');
  } else {
    const expectedBinding: BridgeBindingRow = {
      binding_id: input.bindingId,
      organization_id: input.organizationId,
      environment: input.environment,
      destination_binding_id: input.destinationBindingId,
      enabled: false,
      generation_service_principal_user_id: principal.id,
      job_instruction_creation_enabled: true,
      course_from_job_instruction_creation_enabled: true,
      course_creation_enabled: true,
      source_helixa_organization_id: input.sourceHelixaOrganizationId,
      source_helixa_project_id: input.sourceHelixaProjectId,
    };
    if (!bindingMatches(binding, expectedBinding)) failConflict('Helixa bridge binding');
  }

  return {
    principal,
    identityEmail: identity.email,
    appMetadata: identity.appMetadata,
    publicRole: identity.publicRole,
    changes,
  };
}

export async function provisionHelixaBridge(
  store: BridgeProvisioningStore,
  input: BridgeProvisioningInput,
  mode: BridgeProvisioningMode = 'plan'
): Promise<BridgeProvisioningResult> {
  const inspection = await inspectProvisioning(store, input);
  const plannedChanges = [...inspection.changes];
  if (mode === 'plan') {
    return {
      mode,
      organizationId: input.organizationId,
      bindingId: input.bindingId,
      environment: input.environment,
      destinationBindingId: input.destinationBindingId,
      principalId: inspection.principal?.id ?? null,
      changes: plannedChanges,
      counts: { planned: plannedChanges.length, applied: 0 },
    };
  }
  if (mode !== 'apply') throw new Error(`unsupported provisioning mode: ${String(mode)}`);

  let principal = inspection.principal;
  let createdPrincipalId: string | null = null;
  try {
    if (plannedChanges.includes('create_service_principal')) {
      principal = await store.createAuthPrincipal({
        email: inspection.identityEmail,
        password: randomBytes(48).toString('base64url'),
        appMetadata: inspection.appMetadata,
        publicRole: inspection.publicRole,
      });
      createdPrincipalId = principal.id;
      if (
        principal.email !== inspection.identityEmail ||
        !hasExpectedMetadata(principal.app_metadata, inspection.appMetadata) ||
        !isSignInBlocked(principal)
      ) {
        failConflict('created service principal identity');
      }
      const triggeredPublicUser = await store.findPublicUser(principal.id);
      const publicRow = {
        email: inspection.identityEmail,
        organization_id: input.organizationId,
        role: inspection.publicRole,
      };
      if (triggeredPublicUser) {
        await store.updateCreatedPublicUser(principal.id, publicRow);
      } else {
        await store.insertPublicUser({ id: principal.id, ...publicRow });
      }
    } else if (plannedChanges.includes('insert_public_user')) {
      await store.insertPublicUser({
        id: principal!.id,
        email: inspection.identityEmail,
        organization_id: input.organizationId,
        role: inspection.publicRole,
      });
    }

    if (plannedChanges.includes('insert_membership')) {
      await store.insertMembership({
        organization_id: input.organizationId,
        user_id: principal!.id,
        role: input.membershipRole,
      });
    }
    if (plannedChanges.includes('insert_binding')) {
      await store.insertBinding({
        binding_id: input.bindingId,
        organization_id: input.organizationId,
        environment: input.environment,
        destination_binding_id: input.destinationBindingId,
        enabled: false,
        generation_service_principal_user_id: principal!.id,
        job_instruction_creation_enabled: true,
        course_from_job_instruction_creation_enabled: true,
        course_creation_enabled: true,
        source_helixa_organization_id: input.sourceHelixaOrganizationId,
        source_helixa_project_id: input.sourceHelixaProjectId,
      });
    }

    const finalInspection = await inspectProvisioning(store, input);
    if (finalInspection.changes.length > 0) {
      throw new Error(`provisioning verification failed: ${finalInspection.changes.join(',')}`);
    }
  } catch (error) {
    if (createdPrincipalId) {
      let recoveryInspection: Inspection;
      try {
        recoveryInspection = await inspectProvisioning(store, input);
      } catch (reconciliationError) {
        throw new AggregateError(
          [error, reconciliationError],
          `provisioning outcome is uncertain; retained principal ${createdPrincipalId} for explicit reconciliation`
        );
      }
      if (recoveryInspection.changes.length === 0) {
        return {
          mode,
          organizationId: input.organizationId,
          bindingId: input.bindingId,
          environment: input.environment,
          destinationBindingId: input.destinationBindingId,
          principalId: createdPrincipalId,
          changes: plannedChanges,
          counts: { planned: plannedChanges.length, applied: plannedChanges.length },
        };
      }
      try {
        await store.deleteCreatedPrincipal(createdPrincipalId);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `provisioning failed and newly created principal ${createdPrincipalId} could not be removed`
        );
      }
    }
    throw error;
  }

  return {
    mode,
    organizationId: input.organizationId,
    bindingId: input.bindingId,
    environment: input.environment,
    destinationBindingId: input.destinationBindingId,
    principalId: principal!.id,
    changes: plannedChanges,
    counts: { planned: plannedChanges.length, applied: plannedChanges.length },
  };
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

function inputFromEnvironment(): BridgeProvisioningInput {
  const role = process.env.MC2_HELIXA_SERVICE_PRINCIPAL_ROLE ?? 'instructor';
  return {
    organizationId: requireEnvironment('MC2_HELIXA_ORGANIZATION_ID'),
    bindingId: requireEnvironment('MC2_HELIXA_BINDING_ID'),
    environment: requireEnvironment('MC2_HELIXA_ENVIRONMENT'),
    destinationBindingId: requireEnvironment('MC2_HELIXA_DESTINATION_BINDING_ID'),
    sourceHelixaOrganizationId: requireEnvironment('MC2_HELIXA_SOURCE_ORGANIZATION_ID'),
    sourceHelixaProjectId: requireEnvironment('MC2_HELIXA_SOURCE_PROJECT_ID'),
    membershipRole: role as BridgeMembershipRole,
  };
}

function createSupabaseStore(): BridgeProvisioningStore {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const serviceKey = requireEnvironment('SUPABASE_SERVICE_KEY');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const assertNoError = (subject: string, error: { message: string } | null): void => {
    if (error) throw new Error(`${subject}: ${error.message}`);
  };

  return {
    async findOrganization(organizationId) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .maybeSingle();
      assertNoError('failed to read organization', error);
      return data as { id: string } | null;
    },
    async findOrganizationByName(name) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', name)
        .maybeSingle();
      assertNoError('failed to read default organization', error);
      return data as { id: string } | null;
    },
    async listAuthUsers() {
      const users: BridgeAuthUser[] = [];
      for (let page = 1; ; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        assertNoError('failed to list auth users', error);
        users.push(
          ...data.users.map(user => ({
            id: user.id,
            email: user.email ?? null,
            app_metadata: user.app_metadata ?? {},
            banned_until: user.banned_until ?? null,
          }))
        );
        if (data.users.length < 1000) return users;
      }
    },
    async findPublicUser(userId) {
      const { data, error } = await supabase
        .from('users')
        .select('id,email,organization_id,role')
        .eq('id', userId)
        .maybeSingle();
      assertNoError('failed to read public user', error);
      return data as BridgePublicUserRow | null;
    },
    async findMembership(organizationId, userId) {
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id,user_id,role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();
      assertNoError('failed to read organization membership', error);
      return data as BridgeMembershipRow | null;
    },
    async findBinding(bindingId) {
      const { data, error } = await supabase
        .from('helixa_knowledge_sync_bindings')
        .select(
          'binding_id,organization_id,environment,destination_binding_id,enabled,generation_service_principal_user_id,job_instruction_creation_enabled,course_from_job_instruction_creation_enabled,course_creation_enabled,source_helixa_organization_id,source_helixa_project_id'
        )
        .eq('binding_id', bindingId)
        .maybeSingle();
      assertNoError('failed to read Helixa bridge binding', error);
      return data as BridgeBindingRow | null;
    },
    async createAuthPrincipal(attributes) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: attributes.email,
        password: attributes.password,
        email_confirm: false,
        ban_duration: BAN_DURATION,
        app_metadata: attributes.appMetadata,
      });
      assertNoError('failed to create service principal', error);
      if (!data.user) throw new Error('admin API returned no service principal');
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        app_metadata: data.user.app_metadata ?? {},
        banned_until: data.user.banned_until ?? null,
      };
    },
    async updateCreatedPublicUser(userId, row) {
      const { data, error } = await supabase
        .from('users')
        .update(row)
        .eq('id', userId)
        .select('id');
      assertNoError('failed to align newly created public user', error);
      if (data?.length !== 1) throw new Error('newly created public user was not updated');
    },
    async insertPublicUser(row) {
      const { error } = await supabase.from('users').insert(row);
      assertNoError('failed to insert public user', error);
    },
    async insertMembership(row) {
      const { error } = await supabase.from('organization_members').insert(row);
      assertNoError('failed to insert organization membership', error);
    },
    async insertBinding(row) {
      const { error } = await supabase.from('helixa_knowledge_sync_bindings').insert(row);
      assertNoError('failed to insert Helixa bridge binding', error);
    },
    async deleteCreatedPrincipal(userId) {
      const { error: publicUserError } = await supabase.from('users').delete().eq('id', userId);
      assertNoError('failed to remove newly created public user', publicUserError);
      const { error: authUserError } = await supabase.auth.admin.deleteUser(userId);
      assertNoError('failed to remove newly created Auth principal', authUserError);
    },
  };
}

async function main(): Promise<void> {
  const rawMode = process.argv[2] ?? 'plan';
  if (rawMode !== 'plan' && rawMode !== 'apply') {
    throw new Error('usage: tsx scripts/helixa/provision-bridge.ts [plan|apply]');
  }
  const result = await provisionHelixaBridge(
    createSupabaseStore(),
    inputFromEnvironment(),
    rawMode
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
