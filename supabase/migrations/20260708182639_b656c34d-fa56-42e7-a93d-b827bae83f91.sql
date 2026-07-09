
-- template_families
CREATE TABLE public.template_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  service_tag service_tag NOT NULL,
  jurisdiction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_families TO anon, authenticated;
GRANT ALL ON public.template_families TO service_role;
ALTER TABLE public.template_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw template_families" ON public.template_families FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tf_updated BEFORE UPDATE ON public.template_families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- templates: add family_id / status / version_notes
ALTER TABLE public.templates
  ADD COLUMN family_id uuid REFERENCES public.template_families(id) ON DELETE CASCADE,
  ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ADD COLUMN version_notes text;

-- Backfill: one family per existing template row
DO $$
DECLARE t record; fid uuid;
BEGIN
  FOR t IN SELECT * FROM public.templates WHERE family_id IS NULL LOOP
    INSERT INTO public.template_families (name, description, service_tag)
    VALUES (
      t.name,
      t.description,
      COALESCE((SELECT x FROM unnest(t.tags) x WHERE x <> 'common' LIMIT 1), (t.tags)[1], 'common'::service_tag)
    )
    RETURNING id INTO fid;
    UPDATE public.templates
      SET family_id = fid,
          status = CASE WHEN published THEN 'published' ELSE 'draft' END
      WHERE id = t.id;
  END LOOP;
END$$;

-- template_selection_rules
CREATE TABLE public.template_selection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_tag service_tag NOT NULL,
  name text NOT NULL,
  description text,
  priority integer NOT NULL DEFAULT 100,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_family_id uuid REFERENCES public.template_families(id) ON DELETE CASCADE,
  is_fallback boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_selection_rules TO anon, authenticated;
GRANT ALL ON public.template_selection_rules TO service_role;
ALTER TABLE public.template_selection_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw template_selection_rules" ON public.template_selection_rules FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tsr_updated BEFORE UPDATE ON public.template_selection_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- detected_attributes (staging area)
CREATE TABLE public.detected_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.templates(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  data_type attribute_type NOT NULL DEFAULT 'text',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detected_attributes TO anon, authenticated;
GRANT ALL ON public.detected_attributes TO service_role;
ALTER TABLE public.detected_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw detected_attributes" ON public.detected_attributes FOR ALL USING (true) WITH CHECK (true);
