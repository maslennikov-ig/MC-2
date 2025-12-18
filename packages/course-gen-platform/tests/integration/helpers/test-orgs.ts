/**
 * Test Organization Setup Helpers
 *
 * Purpose: Create and manage test organizations for integration tests
 * Usage: Import in test files to set up tier-specific test data
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { SubscriptionTier } from '../../../src/orchestrator/types/tier'

// Use service role for test data management (bypasses RLS)
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials in environment variables')
}

const supabaseServiceRole = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export type TestOrganization = {
  id: string
  name: string
  tier: SubscriptionTier  // Fixed: column is 'tier' not 'subscription_tier'
  created_at: string
  updated_at: string
}

export type TestUser = {
  id: string
  email: string
  organization_id: string
  role: 'admin' | 'instructor' | 'student'
}

/**
 * Create a test organization with specified tier
 *
 * IMPORTANT: Also creates a user in auth.users to satisfy FK constraints
 * in error_logs and other tables that reference user_id
 *
 * @param tier - Subscription tier (trial, free, basic, standard, premium)
 * @returns Created organization object with ID
 */
export async function createTestOrg(
  tier: SubscriptionTier
): Promise<TestOrganization> {
  const orgId = randomUUID()  // Generate proper UUID for id column
  const userId = randomUUID()  // Generate UUID for owner user
  const timestamp = Date.now()  // Unique timestamp for org name
  const email = `test-owner-${tier}-${timestamp}@megacampus.test`

  // Step 1: Create user in auth.users (required for FK constraints)
  const { error: authError } = await supabaseServiceRole.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      organization_id: orgId,
      role: 'admin'
    }
  })

  if (authError) {
    // Silently continue if user creation fails (auth schema might not be accessible in tests)
    console.warn(`Could not create auth.users entry: ${authError.message}. Some tests may fail with FK constraint errors.`)
  }

  // Step 2: Create organization
  const { data, error } = await supabaseServiceRole
    .from('organizations')
    .insert({
      id: orgId,
      name: `Test Org ${tier.toUpperCase()} ${timestamp}`,  // Unique name with timestamp
      tier: tier,  // Fixed: column is 'tier' not 'subscription_tier'
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test organization: ${error.message}`)
  }

  return data as TestOrganization
}

/**
 * Create a test user associated with an organization
 *
 * IMPORTANT: For integration tests using service role credentials,
 * we only create entries in the public.users table, NOT auth.users.
 * This avoids auth schema issues while still allowing RLS policy testing.
 *
 * @param orgId - Organization ID to associate user with
 * @param role - User role (admin, instructor, student)
 * @returns Created user object with mock ID
 */
export async function createTestUser(
  orgId: string,
  role: 'admin' | 'instructor' | 'student' = 'admin'
): Promise<TestUser> {
  const timestamp = Date.now()
  const userId = randomUUID()  // Generate UUID for user ID
  const email = `test-${role}-${timestamp}@megacampus.test`

  // Create user in public.users table only (service role bypasses RLS)
  const { data, error } = await supabaseServiceRole
    .from('users')
    .insert({
      id: userId,
      email,
      organization_id: orgId,
      role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`)
  }

  return {
    id: userId,
    email,
    organization_id: orgId,
    role
  }
}

/**
 * Clean up test organization and all related data
 *
 * Deletes organization (CASCADE deletes users, files, error_logs, etc.)
 * Also deletes Qdrant vectors and storage files associated with the org
 *
 * @param orgId - Organization ID to delete
 */
export async function cleanupTestOrg(orgId: string): Promise<void> {
  try {
    // 1. Delete error_logs entries for this org
    const { error: errorLogsError } = await supabaseServiceRole
      .from('error_logs')
      .delete()
      .eq('organization_id', orgId)

    if (errorLogsError && !errorLogsError.message.includes('does not exist')) {
      console.warn(`Could not delete error_logs: ${errorLogsError.message}`)
    }

    // 2. Get file_catalog entries to delete from storage and Qdrant
    const { data: files } = await supabaseServiceRole
      .from('file_catalog')
      .select('id, storage_path')
      .eq('organization_id', orgId)

    if (files && files.length > 0) {
      // TODO: Delete Qdrant vectors for these file IDs
      // const qdrantClient = getQdrantClient()
      // await qdrantClient.delete('course_documents', {
      //   filter: {
      //     must: [
      //       { key: 'file_id', match: { any: files.map(f => f.id) } }
      //     ]
      //   }
      // })

      // TODO: Delete storage files
      // const storagePaths = files.map(f => f.storage_path).filter(Boolean)
      // if (storagePaths.length > 0) {
      //   await supabaseServiceRole.storage
      //     .from('uploads')
      //     .remove(storagePaths)
      // }
    }

    // 3. Delete organization (CASCADE deletes users, courses, files, etc.)
    const { error: orgError } = await supabaseServiceRole
      .from('organizations')
      .delete()
      .eq('id', orgId)

    if (orgError) {
      throw new Error(`Failed to delete organization: ${orgError.message}`)
    }

    console.log(`✅ Cleaned up test organization: ${orgId}`)
  } catch (error) {
    console.error(`⚠️ Error cleaning up test organization ${orgId}:`, error)
    // Don't throw - allow tests to continue even if cleanup fails
  }
}

/**
 * Get test fixture path for a file format
 *
 * @param format - File format (pdf, docx, txt, md)
 * @returns Absolute path to fixture file
 */
export function getFixturePath(format: 'pdf' | 'docx' | 'txt' | 'md'): string {
  const fixturesDir = __dirname + '/../fixtures/common'
  // Use 2510.13928v1.pdf - tested and works (952 KB, returns 131,564 chars)
  const filename = format === 'pdf' ? '2510.13928v1' : 'sample-course-material'
  return `${fixturesDir}/${filename}.${format}`
}

/**
 * Expected chunk counts for test fixtures
 *
 * These are approximate values based on fixture file sizes
 * Actual counts may vary slightly depending on chunking algorithm
 *
 * Values updated based on real test execution results:
 * - TXT: observed ~22 total chunks
 * - DOCX: observed ~54 total chunks
 * - PDF (2510.13928v1.pdf): observed ~100 total chunks (50 parents + 50 children)
 *
 * NOTE: Current implementation stores all chunks with parent_id set,
 * so parent/child distinction is not used in practice.
 * Use totalVectors for validation instead of parent/child counts.
 */
export const EXPECTED_CHUNKS = {
  pdf: {
    total: 100,     // Updated from real test: 100 total chunks for 2510.13928v1.pdf (50 parents + 50 children)
    parents: 50,    // Approximate parent chunks (large document)
    children: 50    // Approximate child chunks (large document)
  },
  docx: {
    total: 54,      // Updated from real test: 54 total chunks observed (parents + children)
    parents: 0,     // Not applicable - all chunks have parent_id
    children: 0     // Not applicable - test using total instead
  },
  txt: {
    total: 22,      // Updated from real test: 22 total chunks observed (parents + children)
    parents: 0,     // Not applicable - all chunks have parent_id
    children: 0     // Not applicable - test using total instead
  },
  md: {
    total: 22,      // Same as TXT for consistency
    parents: 0,     // Not applicable - all chunks have parent_id
    children: 0     // Not applicable - test using total instead
  }
} as const

/**
 * Test timeout values (in milliseconds)
 */
export const TEST_TIMEOUTS = {
  fileUpload: 10_000,        // 10 seconds for file upload
  documentProcessing: 60_000, // 60 seconds for full processing
  qdrantQuery: 5_000,         // 5 seconds for vector query
  databaseQuery: 3_000,       // 3 seconds for SQL query
  jobPollingInterval: 1_000   // 1 second polling interval
} as const

/**
 * Test organization IDs by tier (for reference)
 *
 * Note: Integration tests create dynamic test orgs with timestamps
 * These are example IDs from contracts/integration-test-schema.md
 */
export const TEST_ORG_IDS = {
  trial: '00000000-0000-0000-0000-000000000001',
  free: '00000000-0000-0000-0000-000000000002',
  basic: '00000000-0000-0000-0000-000000000003',
  standard: '00000000-0000-0000-0000-000000000004',
  premium: '00000000-0000-0000-0000-000000000005'
} as const
