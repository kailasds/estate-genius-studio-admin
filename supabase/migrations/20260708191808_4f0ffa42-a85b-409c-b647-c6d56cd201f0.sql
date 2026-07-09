
CREATE POLICY "member-uploads anon read" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'member-uploads');
CREATE POLICY "member-uploads anon write" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'member-uploads');
CREATE POLICY "member-uploads anon update" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'member-uploads') WITH CHECK (bucket_id = 'member-uploads');
