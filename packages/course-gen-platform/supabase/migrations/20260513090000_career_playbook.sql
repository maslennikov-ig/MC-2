BEGIN;

CREATE TABLE career_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'draft',
    'answering_fixed',
    'awaiting_followups',
    'answering_followups',
    'ready_to_generate',
    'generating',
    'completed',
    'failed'
  )),
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN (
    'ru',
    'en',
    'zh',
    'es',
    'fr',
    'de',
    'ja',
    'ko',
    'ar',
    'pt',
    'it',
    'tr',
    'vi',
    'th',
    'id',
    'ms',
    'hi',
    'bn',
    'pl'
  )),
  slug TEXT,
  position_title TEXT,
  department TEXT,
  specialization TEXT,
  level TEXT CHECK (
    level IS NULL OR level IN ('junior', 'middle', 'senior', 'lead', 'director', 'c-level')
  ),
  q_a_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  role_profile_spec JSONB,
  generated_blocks JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_markdown TEXT,
  web_research JSONB,
  cost_breakdown JSONB,
  share_slug TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT career_playbooks_public_share_slug_check
    CHECK (is_public = false OR share_slug IS NOT NULL)
);

CREATE INDEX idx_career_playbooks_user ON career_playbooks(user_id);
CREATE INDEX idx_career_playbooks_org ON career_playbooks(organization_id);
CREATE INDEX idx_career_playbooks_status
  ON career_playbooks(status)
  WHERE status IN ('generating', 'awaiting_followups');
CREATE UNIQUE INDEX idx_career_playbooks_share_slug
  ON career_playbooks(share_slug)
  WHERE share_slug IS NOT NULL;

CREATE TRIGGER career_playbooks_updated_at
  BEFORE UPDATE ON career_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE career_playbook_fixed_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL CHECK (language IN ('ru', 'en')),
  position INT NOT NULL CHECK (position > 0),
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('open', 'single_choice', 'multi_choice')),
  question_text TEXT NOT NULL,
  helper_text TEXT,
  options JSONB,
  branching_rules JSONB,
  is_required BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(language, question_key)
);

CREATE INDEX idx_career_playbook_fixed_questions_language_position
  ON career_playbook_fixed_questions(language, position);

ALTER TABLE career_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_playbook_fixed_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_playbooks_read_own_or_org
  ON career_playbooks
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
    OR is_superadmin((SELECT auth.uid()))
  );

CREATE POLICY career_playbooks_insert_own_org
  ON career_playbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  );

CREATE POLICY career_playbooks_update_own_org
  ON career_playbooks
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  );

CREATE POLICY career_playbooks_delete_own_org
  ON career_playbooks
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  );

CREATE POLICY career_playbook_fixed_questions_read_all
  ON career_playbook_fixed_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO career_playbook_fixed_questions (
  language,
  position,
  question_key,
  question_type,
  question_text,
  helper_text,
  options,
  branching_rules,
  is_required
) VALUES
  ('ru', 1, 'position', 'open', 'Какую должность вы хотите оформить?', 'Например: Менеджер по продажам B2B, DevOps-инженер, Product Manager', NULL, NULL, true),
  ('ru', 2, 'department', 'single_choice', 'Отдел или функциональная область', NULL, '[{"value":"sales","label":"Продажи / Sales"},{"value":"marketing","label":"Маркетинг"},{"value":"product","label":"Продукт / Product"},{"value":"engineering","label":"Инженерия / IT"},{"value":"design","label":"Дизайн / UX"},{"value":"data","label":"Аналитика / Data"},{"value":"operations","label":"Операционка / Operations"},{"value":"hr","label":"HR / People"},{"value":"finance","label":"Финансы"},{"value":"support","label":"Поддержка / Customer Success"},{"value":"legal","label":"Юридический"},{"value":"other","label":"Другое"}]'::jsonb, NULL, true),
  ('ru', 3, 'level', 'single_choice', 'Уровень должности', NULL, '[{"value":"junior","label":"Junior (до 2 лет опыта)"},{"value":"middle","label":"Middle (2-5 лет)"},{"value":"senior","label":"Senior (5+ лет, эксперт)"},{"value":"lead","label":"Lead / Team Lead (ведёт команду)"},{"value":"director","label":"Director / Head (руководит направлением)"},{"value":"c-level","label":"C-level (CEO, CTO, CFO ...)"}]'::jsonb, NULL, true),
  ('ru', 4, 'reporting', 'open', 'Кому подчиняется и есть ли подчинённые?', 'Например: Подчиняется CRO. В подчинении 3 SDR + 2 AE.', NULL, NULL, true),
  ('ru', 5, 'team_size', 'single_choice', 'Размер компании', NULL, '[{"value":"1-10","label":"1-10 человек (early-stage стартап)"},{"value":"11-50","label":"11-50 человек (растущий стартап)"},{"value":"51-200","label":"51-200 человек (Scale-up)"},{"value":"201-1000","label":"201-1000 человек (Established)"},{"value":"1000+","label":"1000+ человек (Enterprise)"}]'::jsonb, NULL, true),
  ('ru', 6, 'company_stage', 'single_choice', 'Какая стадия компании / продукта?', NULL, '[{"value":"pre-pmf","label":"Pre-PMF (ищем product-market fit)"},{"value":"growth","label":"Growth (PMF найден, масштабируем)"},{"value":"scale","label":"Scale (отлаженная машина, расширяем рынки)"},{"value":"mature","label":"Mature (стабильный бизнес, оптимизация)"}]'::jsonb, '{"when":{"question_key":"team_size","value_in":["1-10","11-50","51-200"]}}'::jsonb, false),
  ('ru', 7, 'content_language', 'single_choice', 'На каком языке сгенерировать Role Guide?', 'Если документ будет использоваться в международной компании, выберите English. По умолчанию совпадает с языком интерфейса.', '[{"value":"ru","label":"Русский"},{"value":"en","label":"English"},{"value":"zh","label":"Chinese"},{"value":"es","label":"Español"},{"value":"fr","label":"Français"},{"value":"de","label":"Deutsch"},{"value":"ja","label":"Japanese"},{"value":"ko","label":"Korean"},{"value":"ar","label":"Arabic"},{"value":"pt","label":"Português"},{"value":"it","label":"Italiano"},{"value":"tr","label":"Turkish"},{"value":"vi","label":"Vietnamese"},{"value":"th","label":"Thai"},{"value":"id","label":"Indonesian"},{"value":"ms","label":"Malay"},{"value":"hi","label":"Hindi"},{"value":"bn","label":"Bengali"},{"value":"pl","label":"Polski"}]'::jsonb, NULL, true),
  ('en', 1, 'position', 'open', 'Which role do you want to document?', 'For example: B2B Sales Manager, DevOps Engineer, Product Manager', NULL, NULL, true),
  ('en', 2, 'department', 'single_choice', 'Department or functional area', NULL, '[{"value":"sales","label":"Sales"},{"value":"marketing","label":"Marketing"},{"value":"product","label":"Product"},{"value":"engineering","label":"Engineering / IT"},{"value":"design","label":"Design / UX"},{"value":"data","label":"Analytics / Data"},{"value":"operations","label":"Operations"},{"value":"hr","label":"HR / People"},{"value":"finance","label":"Finance"},{"value":"support","label":"Support / Customer Success"},{"value":"legal","label":"Legal"},{"value":"other","label":"Other"}]'::jsonb, NULL, true),
  ('en', 3, 'level', 'single_choice', 'Role level', NULL, '[{"value":"junior","label":"Junior (up to 2 years)"},{"value":"middle","label":"Middle (2-5 years)"},{"value":"senior","label":"Senior (5+ years, expert)"},{"value":"lead","label":"Lead / Team Lead"},{"value":"director","label":"Director / Head"},{"value":"c-level","label":"C-level (CEO, CTO, CFO ...)"}]'::jsonb, NULL, true),
  ('en', 4, 'reporting', 'open', 'Who does this role report to, and does it have direct reports?', 'For example: Reports to CRO. Manages 3 SDRs and 2 AEs.', NULL, NULL, true),
  ('en', 5, 'team_size', 'single_choice', 'Company size', NULL, '[{"value":"1-10","label":"1-10 people (early-stage startup)"},{"value":"11-50","label":"11-50 people (growing startup)"},{"value":"51-200","label":"51-200 people (scale-up)"},{"value":"201-1000","label":"201-1000 people (established)"},{"value":"1000+","label":"1000+ people (enterprise)"}]'::jsonb, NULL, true),
  ('en', 6, 'company_stage', 'single_choice', 'What stage is the company or product in?', NULL, '[{"value":"pre-pmf","label":"Pre-PMF (finding product-market fit)"},{"value":"growth","label":"Growth (PMF found, scaling)"},{"value":"scale","label":"Scale (operating model is working, expanding markets)"},{"value":"mature","label":"Mature (stable business, optimization)"}]'::jsonb, '{"when":{"question_key":"team_size","value_in":["1-10","11-50","51-200"]}}'::jsonb, false),
  ('en', 7, 'content_language', 'single_choice', 'Which language should the Role Guide use?', 'Choose English for international teams. By default this matches the interface language.', '[{"value":"ru","label":"Russian"},{"value":"en","label":"English"},{"value":"zh","label":"Chinese"},{"value":"es","label":"Spanish"},{"value":"fr","label":"French"},{"value":"de","label":"German"},{"value":"ja","label":"Japanese"},{"value":"ko","label":"Korean"},{"value":"ar","label":"Arabic"},{"value":"pt","label":"Portuguese"},{"value":"it","label":"Italian"},{"value":"tr","label":"Turkish"},{"value":"vi","label":"Vietnamese"},{"value":"th","label":"Thai"},{"value":"id","label":"Indonesian"},{"value":"ms","label":"Malay"},{"value":"hi","label":"Hindi"},{"value":"bn","label":"Bengali"},{"value":"pl","label":"Polish"}]'::jsonb, NULL, true);

COMMENT ON TABLE career_playbooks IS 'Career Playbook Role Guide sessions and generated output';
COMMENT ON TABLE career_playbook_fixed_questions IS 'Localized fixed Phase A wizard questions for Career Playbook';
COMMENT ON POLICY career_playbooks_read_own_or_org ON career_playbooks IS
  'Authenticated users read their own playbooks or playbooks in organizations they belong to; public share uses service-role route only.';
COMMENT ON POLICY career_playbook_fixed_questions_read_all ON career_playbook_fixed_questions IS
  'Static wizard seed questions are readable by anonymous and authenticated clients.';

COMMIT;
