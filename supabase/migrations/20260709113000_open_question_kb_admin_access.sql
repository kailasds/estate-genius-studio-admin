-- Open question KB assets for the prototype admin portal, matching the rest of
-- the admin-managed content tables and storage buckets.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_kb_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_versions TO anon;

DROP POLICY IF EXISTS "question_kb_assets_anon_all" ON public.question_kb_assets;
CREATE POLICY "question_kb_assets_anon_all"
  ON public.question_kb_assets FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "question_set_versions_anon_all" ON public.question_set_versions;
CREATE POLICY "question_set_versions_anon_all"
  ON public.question_set_versions FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "question-kb anon read" ON storage.objects;
CREATE POLICY "question-kb anon read"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'question-kb');

DROP POLICY IF EXISTS "question-kb anon write" ON storage.objects;
CREATE POLICY "question-kb anon write"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'question-kb');

DROP POLICY IF EXISTS "question-kb anon update" ON storage.objects;
CREATE POLICY "question-kb anon update"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'question-kb')
  WITH CHECK (bucket_id = 'question-kb');

DROP POLICY IF EXISTS "question-kb anon delete" ON storage.objects;
CREATE POLICY "question-kb anon delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'question-kb');
