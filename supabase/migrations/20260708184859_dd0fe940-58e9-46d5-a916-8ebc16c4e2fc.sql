
CREATE POLICY "Staff can read question-kb"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-kb');
CREATE POLICY "Staff can upload question-kb"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-kb');
CREATE POLICY "Staff can update question-kb"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'question-kb') WITH CHECK (bucket_id = 'question-kb');
CREATE POLICY "Staff can delete question-kb"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-kb');
