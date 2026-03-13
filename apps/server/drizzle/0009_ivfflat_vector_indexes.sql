-- IVFFlat vector indexes for cosine-similarity search.
-- These were created manually on the live DB but were missing from the migration set.
-- A fresh environment rebuilt from repo will now get them automatically.

CREATE INDEX IF NOT EXISTS idx_user_profiles_embedding
  ON public.user_profiles
  USING ivfflat (profile_embedding vector_cosine_ops)
  WITH (lists = '100');

CREATE INDEX IF NOT EXISTS idx_sessions_summary_embedding
  ON public.sessions
  USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = '100');

CREATE INDEX IF NOT EXISTS idx_session_summaries_embedding
  ON public.session_summaries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = '100');
