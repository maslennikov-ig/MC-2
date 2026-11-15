import { CareerPlaybookFixedQuestionSchema } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

interface FixedQuestionQuery {
  select(columns: string): FixedQuestionQuery;
  eq(column: string, value: string): FixedQuestionQuery;
  order(
    column: string,
    options: { ascending: boolean }
  ): Promise<{ data: unknown; error: unknown }>;
}
interface FixedQuestionClient {
  from(table: 'career_playbook_fixed_questions'): FixedQuestionQuery;
}

/** Native reader shared by authenticated product and signed server integration. */
export async function loadCareerPlaybookFixedQuestions(uiLanguage: 'ru' | 'en') {
  const { data, error } = await (getSupabaseAdmin() as unknown as FixedQuestionClient)
    .from('career_playbook_fixed_questions')
    .select('*')
    .eq('language', uiLanguage)
    .order('position', { ascending: true });
  if (error) throw new Error('Failed to load Career Playbook fixed questions');
  return CareerPlaybookFixedQuestionSchema.array().parse(data ?? []);
}
