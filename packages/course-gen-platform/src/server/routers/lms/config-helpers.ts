/**
 * LMS Configuration Router Helpers
 * @module server/routers/lms/config-helpers
 *
 * Helper functions extracted from config.router.ts to reduce file size
 * and function complexity. Contains business logic for:
 * - Update configuration handler
 * - Test connection handler
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import type { OpenEdXConfig } from '@megacampus/shared-types/lms';
import { lmsLogger } from '../../../integrations/lms/logger';
import { createLMSAdapter } from '../../../integrations/lms';
import { verifyOrganizationAccess, requireAdmin } from './helpers';
import { testConnectionWithTimeout, updateConnectionTestResult } from './config-connection-helpers';

const CONNECTION_TEST_TIMEOUT = 10000;

/**
 * List configurations input type
 */
export interface ListConfigsInput {
  organization_id: string;
  include_inactive: boolean;
}

/**
 * Get configuration input type
 */
export interface GetConfigInput {
  id: string;
}

/**
 * Create configuration input type
 */
export interface CreateConfigInput {
  organization_id: string;
  name: string;
  description?: string;
  lms_url: string;
  studio_url: string;
  client_id: string;
  client_secret: string;
  default_org: string;
  default_run: string;
  import_timeout_seconds: number;
  max_retries: number;
}

/**
 * Create configuration result type
 */
export interface CreateConfigResult {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Update configuration input type
 */
export interface UpdateConfigInput {
  id: string;
  name?: string;
  description?: string | null;
  lms_url?: string;
  studio_url?: string;
  client_id?: string;
  client_secret?: string;
  default_org?: string;
  default_run?: string;
  import_timeout_seconds?: number;
  max_retries?: number;
  is_active?: boolean;
}

/**
 * Update configuration result type
 */
export interface UpdateConfigResult {
  id: string;
  updated_at: string;
}

/**
 * Test connection input type
 */
export interface TestConnectionInput {
  id: string;
}

/**
 * Test connection result type
 */
export interface TestConnectionResult {
  success: boolean;
  latency_ms: number;
  message: string;
  lms_version: string | undefined;
  api_version: string | undefined;
}

/**
 * Delete configuration input type
 */
export interface DeleteConfigInput {
  id: string;
}

/**
 * Delete configuration result type
 */
export interface DeleteConfigResult {
  success: boolean;
}

/**
 * Handle list configurations operation
 *
 * This function:
 * 1. Verifies user belongs to organization
 * 2. Fetches configurations
 * 3. Returns configurations without secrets
 *
 * @param supabase - Supabase admin client
 * @param input - List configurations input
 * @param userId - Current user ID
 * @param userOrgId - Current user's organization ID
 * @param requestId - Request ID for logging
 * @returns Array of configurations without secrets
 * @throws {TRPCError} FORBIDDEN if user doesn't belong to organization
 * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
 */
export async function handleListConfigs(
  supabase: SupabaseClient<Database>,
  input: ListConfigsInput,
  userId: string,
  userOrgId: string,
  requestId: string
): Promise<
  Array<
    Omit<Database['public']['Tables']['lms_configurations']['Row'], 'client_id' | 'client_secret'>
  >
> {
  const { organization_id, include_inactive } = input;

  lmsLogger.info(
    { requestId, userId, organizationId: organization_id, includeInactive: include_inactive },
    'Listing LMS configurations'
  );

  // Verify user belongs to organization
  verifyOrganizationAccess(organization_id, userOrgId, requestId, userId, 'list configs');

  // Build query
  let query = supabase
    .from('lms_configurations')
    .select('*')
    .eq('organization_id', organization_id);

  if (!include_inactive) {
    query = query.eq('is_active', true);
  }

  query = query.order('created_at', { ascending: false });

  const { data: configs, error } = await query;

  if (error) {
    lmsLogger.error({ requestId, error }, 'Failed to fetch LMS configurations');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch LMS configurations',
    });
  }

  lmsLogger.debug({ requestId, count: configs?.length || 0 }, 'LMS configurations retrieved');

  return (configs || []).map(config => {
    const { client_id: _client_id, client_secret: _client_secret, ...publicConfig } = config;
    return publicConfig;
  });
}

/**
 * Handle get configuration operation
 *
 * This function:
 * 1. Fetches configuration
 * 2. Verifies user belongs to organization
 * 3. Returns configuration without secrets
 *
 * @param supabase - Supabase admin client
 * @param input - Get configuration input
 * @param userId - Current user ID
 * @param userOrgId - Current user's organization ID
 * @param requestId - Request ID for logging
 * @returns Configuration without secrets or null
 * @throws {TRPCError} FORBIDDEN if user doesn't belong to organization
 * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
 */
export async function handleGetConfig(
  supabase: SupabaseClient<Database>,
  input: GetConfigInput,
  userId: string,
  userOrgId: string,
  requestId: string
): Promise<Omit<
  Database['public']['Tables']['lms_configurations']['Row'],
  'client_id' | 'client_secret'
> | null> {
  const { id: configId } = input;

  lmsLogger.info({ requestId, userId, configId }, 'Fetching LMS configuration');

  const { data: config, error } = await supabase
    .from('lms_configurations')
    .select('*')
    .eq('id', configId)
    .single();

  if (error || !config) {
    lmsLogger.debug({ requestId, configId, error }, 'LMS configuration not found');
    return null;
  }

  // Verify user belongs to same organization
  verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'access config');

  lmsLogger.debug({ requestId, configId, configName: config.name }, 'LMS configuration retrieved');

  const { client_id: _client_id, client_secret: _client_secret, ...publicConfig } = config;
  return publicConfig;
}

/**
 * Handle create configuration operation
 *
 * This function:
 * 1. Verifies user is admin
 * 2. Checks name uniqueness
 * 3. Creates configuration
 *
 * @param supabase - Supabase admin client
 * @param input - Create configuration input
 * @param userId - Current user ID
 * @param userOrgId - Current user's organization ID
 * @param userRole - Current user's role
 * @param requestId - Request ID for logging
 * @returns Created configuration result
 * @throws {TRPCError} FORBIDDEN if user is not admin
 * @throws {TRPCError} CONFLICT if name already exists
 * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
 */
export async function handleCreateConfig(
  supabase: SupabaseClient<Database>,
  input: CreateConfigInput,
  userId: string,
  userOrgId: string,
  userRole: string,
  requestId: string
): Promise<CreateConfigResult> {
  lmsLogger.info(
    { requestId, userId, organizationId: input.organization_id, configName: input.name },
    'Creating LMS configuration'
  );

  // Verify user is admin of the organization
  verifyOrganizationAccess(input.organization_id, userOrgId, requestId, userId, 'create config');
  requireAdmin(userRole, requestId, userId, userOrgId);

  // Check if name is unique per organization
  const { data: existing } = await supabase
    .from('lms_configurations')
    .select('id')
    .eq('organization_id', input.organization_id)
    .eq('name', input.name)
    .single();

  if (existing) {
    lmsLogger.warn(
      { requestId, organizationId: input.organization_id, configName: input.name },
      'LMS configuration name already exists'
    );
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A configuration named "${input.name}" already exists in this organization`,
    });
  }

  // Create configuration
  const { data: config, error: createError } = await supabase
    .from('lms_configurations')
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      description: input.description || null,
      lms_url: input.lms_url,
      studio_url: input.studio_url,
      client_id: input.client_id,
      client_secret: input.client_secret,
      default_org: input.default_org,
      default_run: input.default_run,
      import_timeout_seconds: input.import_timeout_seconds,
      max_retries: input.max_retries,
      created_by: userId,
      is_active: true,
    })
    .select('id, name, created_at')
    .single();

  if (createError || !config) {
    lmsLogger.error({ requestId, error: createError }, 'Failed to create LMS configuration');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create LMS configuration',
    });
  }

  lmsLogger.info(
    { requestId, configId: config.id, configName: config.name },
    'LMS configuration created successfully'
  );

  return {
    id: config.id,
    name: config.name,
    created_at: config.created_at,
  };
}

/**
 * Handle update configuration operation
 *
 * This function:
 * 1. Fetches existing config
 * 2. Verifies user is admin
 * 3. Checks name uniqueness if name is being updated
 * 4. Builds update payload
 * 5. Updates configuration
 *
 * @param supabase - Supabase admin client
 * @param input - Update configuration input
 * @param userId - Current user ID
 * @param userOrgId - Current user's organization ID
 * @param userRole - Current user's role
 * @param requestId - Request ID for logging
 * @returns Updated configuration result
 * @throws {TRPCError} NOT_FOUND if configuration not found
 * @throws {TRPCError} FORBIDDEN if user is not admin
 * @throws {TRPCError} CONFLICT if name already exists
 * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
 */
export async function handleUpdateConfig(
  supabase: SupabaseClient<Database>,
  input: UpdateConfigInput,
  userId: string,
  userOrgId: string,
  userRole: string,
  requestId: string
): Promise<UpdateConfigResult> {
  const { id: configId, ...updates } = input;

  lmsLogger.info({ requestId, userId, configId }, 'Updating LMS configuration');

  // Fetch existing config
  const { data: config, error: fetchError } = await supabase
    .from('lms_configurations')
    .select('id, organization_id, name')
    .eq('id', configId)
    .single();

  if (fetchError || !config) {
    lmsLogger.warn({ requestId, configId, error: fetchError }, 'LMS configuration not found');
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'LMS configuration not found',
    });
  }

  // Verify user is admin of the organization
  verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'update config');
  requireAdmin(userRole, requestId, userId, userOrgId);

  // Check name uniqueness if name is being updated
  if (updates.name && updates.name !== config.name) {
    const { data: existing } = await supabase
      .from('lms_configurations')
      .select('id')
      .eq('organization_id', config.organization_id)
      .eq('name', updates.name)
      .single();

    if (existing) {
      lmsLogger.warn(
        { requestId, configId, newName: updates.name },
        'LMS configuration name already exists'
      );
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A configuration named "${updates.name}" already exists in this organization`,
      });
    }
  }

  // Build update payload (only include provided fields)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.lms_url !== undefined) updatePayload.lms_url = updates.lms_url;
  if (updates.studio_url !== undefined) updatePayload.studio_url = updates.studio_url;
  if (updates.client_id !== undefined) updatePayload.client_id = updates.client_id;
  if (updates.client_secret !== undefined) updatePayload.client_secret = updates.client_secret;
  if (updates.default_org !== undefined) updatePayload.default_org = updates.default_org;
  if (updates.default_run !== undefined) updatePayload.default_run = updates.default_run;
  if (updates.import_timeout_seconds !== undefined)
    updatePayload.import_timeout_seconds = updates.import_timeout_seconds;
  if (updates.max_retries !== undefined) updatePayload.max_retries = updates.max_retries;
  if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

  // Update configuration
  const { data: updated, error: updateError } = await supabase
    .from('lms_configurations')
    .update(updatePayload)
    .eq('id', configId)
    .select('id, updated_at')
    .single();

  if (updateError || !updated) {
    lmsLogger.error(
      { requestId, configId, error: updateError },
      'Failed to update LMS configuration'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update LMS configuration',
    });
  }

  lmsLogger.info({ requestId, configId }, 'LMS configuration updated successfully');

  return {
    id: updated.id,
    updated_at: updated.updated_at,
  };
}

/**
 * Handle test connection operation
 *
 * This function:
 * 1. Verifies user is organization admin
 * 2. Fetches LMS configuration from database
 * 3. Creates adapter and tests connection with timeout
 * 4. Updates last_connection_test and last_connection_status in database
 * 5. Returns connection test result
 *
 * @param supabase - Supabase admin client
 * @param input - Test connection input
 * @param userId - Current user ID
 * @param organizationId - Current user's organization ID
 * @param userRole - Current user's role
 * @param requestId - Request ID for logging
 * @returns Connection test result
 * @throws {TRPCError} FORBIDDEN if user is not admin
 * @throws {TRPCError} NOT_FOUND if LMS configuration not found
 * @throws {TRPCError} BAD_REQUEST if Studio URL is missing
 * @throws {TRPCError} INTERNAL_SERVER_ERROR if database update fails
 */
export async function handleTestConnection(
  supabase: SupabaseClient<Database>,
  input: TestConnectionInput,
  userId: string,
  organizationId: string,
  userRole: string,
  requestId: string
): Promise<TestConnectionResult> {
  const { id: configId } = input;

  lmsLogger.info(
    { requestId, userId, configId, userRole, organizationId },
    'Starting LMS connection test'
  );

  // Step 1: Verify user is organization admin
  if (userRole !== 'admin') {
    lmsLogger.warn(
      { requestId, userId, userRole, organizationId },
      'Connection test attempted by non-admin user'
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only organization administrators can test LMS connections',
    });
  }

  // Step 2: Fetch LMS configuration (must belong to user's organization)
  const { data: config, error: configError } = await supabase
    .from('lms_configurations')
    .select('*')
    .eq('id', configId)
    .eq('organization_id', organizationId)
    .single();

  if (configError || !config) {
    lmsLogger.warn(
      { requestId, configId, organizationId, error: configError },
      'LMS configuration not found'
    );
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'LMS configuration not found or access denied',
    });
  }

  lmsLogger.debug(
    { requestId, configId, lmsName: config.name, lmsUrl: config.lms_url },
    'LMS configuration loaded'
  );

  // Step 3: Validate Studio URL exists
  if (!config.studio_url) {
    lmsLogger.error({ requestId, configId }, 'LMS configuration missing Studio URL');
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'LMS configuration is missing Studio URL. Please update the configuration.',
    });
  }

  // Step 4: Create adapter configuration
  const adapterConfig: OpenEdXConfig = {
    instanceId: config.id,
    name: config.name,
    type: 'openedx' as const,
    organization: config.default_org,
    lmsUrl: config.lms_url,
    cmsUrl: config.studio_url,
    clientId: config.client_id,
    clientSecret: config.client_secret,
    timeout: CONNECTION_TEST_TIMEOUT,
    maxRetries: 1,
    pollInterval: 5000,
    enabled: config.is_active,
    autoCreateCourse: false,
  };

  const adapter = createLMSAdapter('openedx', adapterConfig);

  // Step 5: Test connection with timeout
  const connectionResult = await testConnectionWithTimeout(adapter, configId, requestId);

  // Step 6: Update database with connection test result
  await updateConnectionTestResult(supabase, configId, connectionResult, requestId);

  // Step 7: Return result
  return connectionResult;
}

/**
 * Handle delete configuration operation
 *
 * This function:
 * 1. Fetches existing config
 * 2. Verifies user is admin
 * 3. Checks for active import jobs
 * 4. Deletes configuration
 *
 * @param supabase - Supabase admin client
 * @param input - Delete configuration input
 * @param userId - Current user ID
 * @param userOrgId - Current user's organization ID
 * @param userRole - Current user's role
 * @param requestId - Request ID for logging
 * @returns Delete configuration result
 * @throws {TRPCError} NOT_FOUND if configuration not found
 * @throws {TRPCError} FORBIDDEN if user is not admin
 * @throws {TRPCError} CONFLICT if active import jobs reference this configuration
 * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
 */
export async function handleDeleteConfig(
  supabase: SupabaseClient<Database>,
  input: DeleteConfigInput,
  userId: string,
  userOrgId: string,
  userRole: string,
  requestId: string
): Promise<DeleteConfigResult> {
  const { id: configId } = input;

  lmsLogger.info({ requestId, userId, configId }, 'Deleting LMS configuration');

  // Fetch existing config
  const { data: config, error: fetchError } = await supabase
    .from('lms_configurations')
    .select('id, organization_id, name')
    .eq('id', configId)
    .single();

  if (fetchError || !config) {
    lmsLogger.warn({ requestId, configId, error: fetchError }, 'LMS configuration not found');
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'LMS configuration not found',
    });
  }

  // Verify user is admin of the organization
  verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'delete config');
  requireAdmin(userRole, requestId, userId, userOrgId);

  // Check for active import jobs
  const { data: activeJobs, error: jobsError } = await supabase
    .from('lms_import_jobs')
    .select('id')
    .eq('lms_configuration_id', configId)
    .in('status', ['pending', 'uploading', 'processing'])
    .limit(1);

  if (jobsError) {
    lmsLogger.error(
      { requestId, configId, error: jobsError },
      'Failed to check for active import jobs'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to check for active import jobs',
    });
  }

  if (activeJobs && activeJobs.length > 0) {
    lmsLogger.warn(
      { requestId, configId, activeJobCount: activeJobs.length },
      'Cannot delete config with active import jobs'
    );
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'Cannot delete configuration while import jobs are active. Please wait for jobs to complete or cancel them first.',
    });
  }

  // Delete configuration
  const { error: deleteError } = await supabase
    .from('lms_configurations')
    .delete()
    .eq('id', configId);

  if (deleteError) {
    lmsLogger.error(
      { requestId, configId, error: deleteError },
      'Failed to delete LMS configuration'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete LMS configuration',
    });
  }

  lmsLogger.info(
    { requestId, configId, configName: config.name },
    'LMS configuration deleted successfully'
  );

  return { success: true };
}
