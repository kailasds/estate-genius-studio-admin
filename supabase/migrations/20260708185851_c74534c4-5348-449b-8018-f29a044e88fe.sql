
ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS topic_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0;

-- Normalize kinds (existing rows default to 'faq' via NOT NULL default)
UPDATE public.content_assets SET kind = 'faq' WHERE kind NOT IN ('faq','doc','video','link');

CREATE INDEX IF NOT EXISTS content_assets_kind_idx ON public.content_assets(kind);
CREATE INDEX IF NOT EXISTS content_assets_order_idx ON public.content_assets(order_index);

-- Storage policies for content-assets bucket (open for the prototype admin portal)
DROP POLICY IF EXISTS "content_assets_all" ON storage.objects;
CREATE POLICY "content_assets_all" ON storage.objects FOR ALL
  USING (bucket_id = 'content-assets') WITH CHECK (bucket_id = 'content-assets');
