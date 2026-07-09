
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS how_to_answer text,
  ADD COLUMN IF NOT EXISTS why_we_ask text;
