import type { Language, Tier } from '@megacampus/shared-types';

import { getSupabaseAdmin } from '@/shared/supabase/admin';

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
  count?: number | null;
}

interface ListQueryResult<T> {
  data: T[] | null;
  error: QueryError | null;
  count?: number | null;
}

interface MutationResult {
  data?: unknown;
  error: QueryError | null;
  count?: number | null;
}

interface BusinessContextQueryBuilder<T> extends PromiseLike<MutationResult> {
  insert: (values: Partial<T> | Partial<T>[]) => BusinessContextQueryBuilder<T>;
  update: (values: Partial<T>) => BusinessContextQueryBuilder<T>;
  delete: () => BusinessContextQueryBuilder<T>;
  select: (
    columns?: string,
    options?: { count?: 'exact'; head?: boolean }
  ) => BusinessContextQueryBuilder<T>;
  eq: (column: string, value: unknown) => BusinessContextQueryBuilder<T>;
  neq: (column: string, value: unknown) => BusinessContextQueryBuilder<T>;
  in: (column: string, values: unknown[]) => BusinessContextQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => Promise<ListQueryResult<T>>;
  single: () => Promise<QueryResult<T>>;
  maybeSingle: () => Promise<QueryResult<T>>;
}

export interface CareerPlaybookSourceRow {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  source_type?: string | null;
  status: string;
  filename: string | null;
  file_catalog_id: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CareerPlaybookFileCatalogRow {
  id: string;
  organization_id: string | null;
  course_id: string | null;
  storage_path: string | null;
  file_size: number | null;
  filename: string | null;
  processed_content: string | null;
  markdown_content: string | null;
  original_file_id: string | null;
  reference_count: number | null;
  updated_at?: string | null;
  vector_status?: string | null;
}

export interface CareerPlaybookRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: string;
  language: Language;
}

export interface OrganizationTierRow {
  id: string;
  tier: Tier | null;
}

interface CareerPlaybookBusinessContextSupabase {
  from(table: 'career_playbooks'): BusinessContextQueryBuilder<CareerPlaybookRow>;
  from(table: 'career_playbook_sources'): BusinessContextQueryBuilder<CareerPlaybookSourceRow>;
  from(table: 'file_catalog'): BusinessContextQueryBuilder<CareerPlaybookFileCatalogRow>;
  from(table: 'organizations'): BusinessContextQueryBuilder<OrganizationTierRow>;
}

export function getCareerPlaybookBusinessContextSupabase(): CareerPlaybookBusinessContextSupabase {
  return getSupabaseAdmin() as unknown as CareerPlaybookBusinessContextSupabase;
}
