-- ============================================================
-- ConstruSUS IA – Database Schema
-- Run this script in the Supabase SQL editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  cpf         TEXT UNIQUE,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 2. CONVERSATIONS TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Nova Conversa',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own conversations"
  ON public.conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 3. MESSAGES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read messages from their own conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (true); -- Edge function uses service role

-- ──────────────────────────────────────────────────────────────
-- 4. KNOWLEDGE BASE TABLE (RAG)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  embedding   vector(1536),            -- text-embedding-3-small dimensions
  metadata    JSONB NOT NULL DEFAULT '{}',
  fts_vector  tsvector,                -- Full-text search vector (BM25)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for vector similarity search (cosine distance)
-- m=16, ef_construction=64 balances speed and recall
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_hnsw
  ON public.knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index (BM25/GIN)
CREATE INDEX IF NOT EXISTS knowledge_base_fts_idx
  ON public.knowledge_base
  USING gin (fts_vector);

-- Metadata JSONB index for filtering
CREATE INDEX IF NOT EXISTS knowledge_base_metadata_idx
  ON public.knowledge_base
  USING gin (metadata);

-- Auto-generate fts_vector on insert/update
CREATE OR REPLACE FUNCTION update_knowledge_fts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector = to_tsvector(
    'portuguese',
    COALESCE(NEW.content, '') || ' ' ||
    COALESCE(NEW.metadata->>'documento', '') || ' ' ||
    COALESCE(NEW.metadata->>'titulo', '') || ' ' ||
    COALESCE(NEW.metadata->>'tema', '') || ' ' ||
    COALESCE(NEW.metadata->>'secao', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER knowledge_base_fts_trigger
  BEFORE INSERT OR UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_fts();

-- RLS for knowledge base (readable by all authenticated users)
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read knowledge base"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage knowledge base"
  ON public.knowledge_base FOR ALL
  USING (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- 5. COST REFERENCES TABLE (SINAPI / SIGEM)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_references (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT NOT NULL,
  descricao        TEXT NOT NULL,
  unidade          TEXT,
  preco_unitario   NUMERIC(15, 4) NOT NULL,
  fonte            TEXT NOT NULL,           -- SINAPI, SIGEM
  estado           TEXT DEFAULT 'GO',
  data_referencia  TEXT NOT NULL,            -- Ex: '2026-03'
  categoria        TEXT,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_references_fonte ON public.cost_references(fonte);
CREATE INDEX idx_cost_references_codigo ON public.cost_references(codigo);
CREATE INDEX idx_cost_references_descricao ON public.cost_references USING gin (to_tsvector('portuguese', descricao));

ALTER TABLE public.cost_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cost references"
  ON public.cost_references FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage cost references"
  ON public.cost_references FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 6. INVESTIMENTOS SES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investimentos_ses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano             INTEGER NOT NULL,
  programa        TEXT NOT NULL,
  valor           NUMERIC(15, 2) NOT NULL,
  tipo            TEXT,                     -- Obra, Equipamento, Reforma
  unidade         TEXT,
  municipio       TEXT,
  fonte_recurso   TEXT,                     -- Federal, Estadual, Municipal
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investimentos_ano ON public.investimentos_ses(ano);

ALTER TABLE public.investimentos_ses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read investments"
  ON public.investimentos_ses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage investments"
  ON public.investimentos_ses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 7. RPC FUNCTIONS FOR RAG
-- ──────────────────────────────────────────────────────────────

-- Vector similarity search with HNSW (cosine distance)
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  match_count     INT DEFAULT 20,
  filter          JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base kb
  WHERE
    kb.embedding IS NOT NULL
    AND (
      filter = '{}'::jsonb
      OR kb.metadata @> filter
    )
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- BM25 Full-text search
CREATE OR REPLACE FUNCTION search_knowledge_bm25(
  query_text  TEXT,
  match_count INT DEFAULT 20,
  filter      JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id       UUID,
  content  TEXT,
  metadata JSONB,
  rank     FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    ts_rank_cd(kb.fts_vector, query, 32) AS rank
  FROM
    public.knowledge_base kb,
    plainto_tsquery('portuguese', query_text) query
  WHERE
    kb.fts_vector @@ query
    AND (
      filter = '{}'::jsonb
      OR kb.metadata @> filter
    )
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ──────────────────────────────────────────────────────────────
-- 8. AUTO-CREATE PROFILE ON SIGNUP
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 9. INITIAL ADMIN USER
-- Create via Supabase Auth dashboard or CLI, then run:
-- ──────────────────────────────────────────────────────────────
-- UPDATE public.profiles SET role = 'admin', full_name = 'Pedro Borges', cpf = '03723880193'
-- WHERE email = 'pedroaugustobborges@gmail.com';
