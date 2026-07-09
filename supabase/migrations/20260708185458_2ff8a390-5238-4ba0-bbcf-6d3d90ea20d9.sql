
CREATE TABLE IF NOT EXISTS public.discovery_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  help_text TEXT,
  input_type TEXT NOT NULL DEFAULT 'select',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'situation',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_signals TO authenticated;
GRANT SELECT ON public.discovery_signals TO anon;
GRANT ALL ON public.discovery_signals TO service_role;
ALTER TABLE public.discovery_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signals_all" ON public.discovery_signals;
CREATE POLICY "signals_all" ON public.discovery_signals FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_discovery_signals_updated ON public.discovery_signals;
CREATE TRIGGER trg_discovery_signals_updated BEFORE UPDATE ON public.discovery_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recommendation_rules
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS flag TEXT NOT NULL DEFAULT 'recommended',
  ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS document TEXT,
  ADD COLUMN IF NOT EXISTS min_matches INT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS public.recommendation_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INT NOT NULL,
  notes TEXT,
  snapshot JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_rule_versions TO authenticated;
GRANT SELECT ON public.recommendation_rule_versions TO anon;
GRANT ALL ON public.recommendation_rule_versions TO service_role;
ALTER TABLE public.recommendation_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rrv_all" ON public.recommendation_rule_versions;
CREATE POLICY "rrv_all" ON public.recommendation_rule_versions FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.discovery_signals (key, label, help_text, input_type, options, sort_order, category) VALUES
  ('life_stage', 'Life stage', 'Where the member is in life', 'select',
    '[{"value":"young_adult","label":"Young adult"},{"value":"family","label":"Building a family"},{"value":"established","label":"Established"},{"value":"pre_retirement","label":"Pre-retirement"},{"value":"retired","label":"Retired"}]'::jsonb, 10, 'situation'),
  ('marital_status', 'Marital status', NULL, 'select',
    '[{"value":"single","label":"Single"},{"value":"married","label":"Married"},{"value":"partnered","label":"Domestic partnership"},{"value":"divorced","label":"Divorced"},{"value":"widowed","label":"Widowed"}]'::jsonb, 20, 'situation'),
  ('has_children', 'Has children', NULL, 'boolean', '[]'::jsonb, 30, 'situation'),
  ('has_minor_children', 'Any minor children (under 18)', NULL, 'boolean', '[]'::jsonb, 40, 'situation'),
  ('has_dependents', 'Other dependents', 'Elderly parent, disabled sibling, etc.', 'boolean', '[]'::jsonb, 50, 'situation'),
  ('owns_real_estate', 'Owns real estate', NULL, 'boolean', '[]'::jsonb, 60, 'assets'),
  ('owns_business', 'Owns a business', NULL, 'boolean', '[]'::jsonb, 70, 'assets'),
  ('estate_size', 'Estate size / complexity', NULL, 'select',
    '[{"value":"simple","label":"Simple (under $500k)"},{"value":"moderate","label":"Moderate ($500k–$2M)"},{"value":"complex","label":"Complex ($2M+ or multi-state)"}]'::jsonb, 80, 'assets'),
  ('has_pets', 'Has pets to provide for', NULL, 'boolean', '[]'::jsonb, 90, 'situation'),
  ('state', 'State of residence', NULL, 'select',
    '[{"value":"CA","label":"California"},{"value":"NY","label":"New York"},{"value":"TX","label":"Texas"},{"value":"FL","label":"Florida"},{"value":"other","label":"Other"}]'::jsonb, 100, 'situation'),
  ('goals', 'Planning goals', 'What the member wants to accomplish', 'multiselect',
    '[{"value":"provide_family","label":"Provide for family"},{"value":"name_guardians","label":"Name guardians"},{"value":"avoid_probate","label":"Avoid probate"},{"value":"manage_finances_incap","label":"Who manages my money if I can''t"},{"value":"medical_wishes","label":"Record my medical wishes"},{"value":"charitable_giving","label":"Charitable giving"}]'::jsonb, 110, 'goals')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.recommendation_rules (name, description, conditions, recommends, priority, active, reason, flag, rule_type, document, status) VALUES
  ('Baseline — Everyone needs a Will', 'Every adult member should have a Last Will & Testament.',
    '{"op":"AND","clauses":[]}'::jsonb, ARRAY['will']::service_tag[], 100, true,
    'A Will is the foundation of any estate plan — it tells the court who inherits your assets and who should carry out your wishes.',
    'recommended', 'baseline', 'will', 'draft'),
  ('Guardianship for minor children', 'Members with minor kids need guardianship nominations.',
    '{"op":"AND","clauses":[{"attribute":"has_minor_children","op":"eq","value":true}]}'::jsonb, ARRAY['will']::service_tag[], 90, true,
    'You have minor children — your Will is where you name a guardian to raise them if something happens to you.',
    'recommended', 'standard', 'will', 'draft'),
  ('Avoid probate → Revocable Trust', 'When the member wants to avoid probate or owns real estate.',
    '{"op":"OR","clauses":[{"attribute":"goals","op":"in","value":"avoid_probate"},{"attribute":"owns_real_estate","op":"eq","value":true}]}'::jsonb,
    ARRAY['trust']::service_tag[], 80, true,
    'A Revocable Living Trust lets your family skip the probate court process and keeps your affairs private.',
    'recommended', 'standard', 'trust', 'draft'),
  ('Complex estate → Trust', 'Moderate or complex estates benefit from a trust.',
    '{"op":"OR","clauses":[{"attribute":"estate_size","op":"eq","value":"moderate"},{"attribute":"estate_size","op":"eq","value":"complex"}]}'::jsonb,
    ARRAY['trust']::service_tag[], 75, true,
    'Given the size and complexity of your estate, a Trust gives you more control and tax flexibility than a Will alone.',
    'recommended', 'standard', 'trust', 'draft'),
  ('Financial POA — incapacity planning', 'Anyone worried about who manages money if incapacitated.',
    '{"op":"OR","clauses":[{"attribute":"goals","op":"in","value":"manage_finances_incap"},{"attribute":"owns_business","op":"eq","value":true}]}'::jsonb,
    ARRAY['poa']::service_tag[], 70, true,
    'A Durable Power of Attorney names someone you trust to manage your finances if you become unable to.',
    'recommended', 'standard', 'poa', 'draft'),
  ('Healthcare directive — medical wishes', 'When the member wants to record medical preferences.',
    '{"op":"OR","clauses":[{"attribute":"goals","op":"in","value":"medical_wishes"}]}'::jsonb,
    ARRAY['healthcare']::service_tag[], 65, true,
    'A Healthcare Directive (Living Will) puts your medical wishes in writing and names someone to speak for you.',
    'recommended', 'standard', 'healthcare', 'draft'),
  ('Baseline — Healthcare Directive for all adults', 'Every adult should have an advance directive.',
    '{"op":"AND","clauses":[]}'::jsonb, ARRAY['healthcare']::service_tag[], 60, true,
    'Every adult benefits from a Healthcare Directive so doctors and loved ones know your wishes in an emergency.',
    'optional', 'baseline', 'healthcare', 'draft'),
  ('Baseline — Financial POA for all adults', 'Every adult should consider a Power of Attorney.',
    '{"op":"AND","clauses":[]}'::jsonb, ARRAY['poa']::service_tag[], 55, true,
    'A Power of Attorney is inexpensive protection in case you''re ever unable to handle your own finances.',
    'optional', 'baseline', 'poa', 'draft'),
  ('Pet trust provisions', 'Members with pets can add pet-care provisions.',
    '{"op":"AND","clauses":[{"attribute":"has_pets","op":"eq","value":true}]}'::jsonb,
    ARRAY['trust']::service_tag[], 40, true,
    'You can include pet-care instructions and funding in your plan to make sure your pets are cared for.',
    'optional', 'standard', 'trust', 'draft'),
  ('Charitable giving', 'When charitable giving is a stated goal.',
    '{"op":"AND","clauses":[{"attribute":"goals","op":"in","value":"charitable_giving"}]}'::jsonb,
    ARRAY['trust','will']::service_tag[], 35, true,
    'We can add charitable bequests or a charitable trust structure to support the causes you care about.',
    'optional', 'standard', 'trust', 'draft'),
  ('Bundle — Coordinated Estate Plan', 'Recommend the full coordinated package when 2+ documents apply.',
    '{"op":"AND","clauses":[]}'::jsonb, ARRAY['will','trust','poa','healthcare']::service_tag[], 200, true,
    'Because more than one document applies to your situation, we recommend our coordinated Estate Plan bundle — the documents are drafted to work together.',
    'recommended', 'bundle', NULL, 'draft');
