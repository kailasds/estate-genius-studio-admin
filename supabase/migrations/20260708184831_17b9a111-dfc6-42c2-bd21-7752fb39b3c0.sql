
-- 1) Expand question_input_type enum
ALTER TYPE public.question_input_type ADD VALUE IF NOT EXISTS 'document_upload';
ALTER TYPE public.question_input_type ADD VALUE IF NOT EXISTS 'voice_input';

-- 2) question_kb_assets
CREATE TABLE public.question_kb_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','link')),
  title text,
  notes text,
  file_path text,
  filename text,
  mime_type text,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_kb_assets TO authenticated;
GRANT ALL ON public.question_kb_assets TO service_role;

ALTER TABLE public.question_kb_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read KB assets"
  ON public.question_kb_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert KB assets"
  ON public.question_kb_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update KB assets"
  ON public.question_kb_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete KB assets"
  ON public.question_kb_assets FOR DELETE TO authenticated USING (true);

CREATE INDEX question_kb_assets_question_id_idx ON public.question_kb_assets(question_id);

CREATE TRIGGER trg_question_kb_assets_updated_at
BEFORE UPDATE ON public.question_kb_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) question_set_versions
CREATE TABLE public.question_set_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  notes text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_versions TO authenticated;
GRANT ALL ON public.question_set_versions TO service_role;

ALTER TABLE public.question_set_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read question set versions"
  ON public.question_set_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert question set versions"
  ON public.question_set_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update question set versions"
  ON public.question_set_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete question set versions"
  ON public.question_set_versions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_question_set_versions_updated_at
BEFORE UPDATE ON public.question_set_versions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
