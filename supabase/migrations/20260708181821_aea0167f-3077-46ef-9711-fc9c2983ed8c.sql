
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- service tag enum
DO $$ BEGIN
  CREATE TYPE public.service_tag AS ENUM ('common','will','trust','poa','healthcare','bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.question_input_type AS ENUM ('short_text','long_text','number','date','select','multiselect','boolean','address');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attribute_type AS ENUM ('text','number','date','boolean','select','multiselect','address','json');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ATTRIBUTES: canonical facts
CREATE TABLE public.attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  data_type public.attribute_type NOT NULL DEFAULT 'text',
  tags public.service_tag[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attributes TO anon, authenticated;
GRANT ALL ON public.attributes TO service_role;
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw attributes" ON public.attributes FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_attr_updated BEFORE UPDATE ON public.attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- QUESTIONS
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  help_text text,
  input_type public.question_input_type NOT NULL DEFAULT 'short_text',
  attribute_id uuid REFERENCES public.attributes(id) ON DELETE SET NULL,
  tags public.service_tag[] NOT NULL DEFAULT '{}',
  options jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{value,label}]
  required boolean NOT NULL DEFAULT false,
  routing jsonb NOT NULL DEFAULT '{}'::jsonb, -- {show_if:{...}}
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RECOMMENDATION RULES
CREATE TABLE public.recommendation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '{"op":"AND","clauses":[]}'::jsonb,
  recommends public.service_tag[] NOT NULL DEFAULT '{}',
  priority int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_rules TO anon, authenticated;
GRANT ALL ON public.recommendation_rules TO service_role;
ALTER TABLE public.recommendation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw rec_rules" ON public.recommendation_rules FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_rr_updated BEFORE UPDATE ON public.recommendation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTENT ASSETS (FAQ + snippets)
CREATE TABLE public.content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'faq', -- faq | snippet | tooltip
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  category text,
  tags public.service_tag[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_assets TO anon, authenticated;
GRANT ALL ON public.content_assets TO service_role;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw content" ON public.content_assets FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_content_updated BEFORE UPDATE ON public.content_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TEMPLATES
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  body text NOT NULL DEFAULT '',
  tags public.service_tag[] NOT NULL DEFAULT '{}',
  merge_fields jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{key, attribute_id}]
  source_file_path text,
  version int NOT NULL DEFAULT 1,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO anon, authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw templates" ON public.templates FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FUTURE ROLES stub
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
