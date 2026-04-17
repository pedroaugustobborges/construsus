-- ============================================================
-- ConstruSUS IA – Migration 002: Data Tables
-- SINAPI Insumos, Composições, SIGEM e SOMASUS
-- Execute no Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- SINAPI INSUMOS (Preços Medianos por Estado)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sinapi_insumos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           INTEGER NOT NULL,
  descricao        TEXT NOT NULL,
  classificacao    TEXT,
  unidade          TEXT,
  origem_preco     TEXT,          -- C=Coletado, CR=Coef. Representatividade
  preco_go         NUMERIC(15,4), -- Goiás (referência principal)
  preco_sp         NUMERIC(15,4), -- São Paulo (para comparação)
  preco_df         NUMERIC(15,4), -- Brasília
  data_referencia  TEXT NOT NULL DEFAULT '2026-03',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_codigo      ON public.sinapi_insumos(codigo);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_classif     ON public.sinapi_insumos(classificacao);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_data_ref    ON public.sinapi_insumos(data_referencia);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_descricao   ON public.sinapi_insumos
  USING gin(to_tsvector('portuguese', descricao));

ALTER TABLE public.sinapi_insumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read sinapi_insumos"
  ON public.sinapi_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages sinapi_insumos"
  ON public.sinapi_insumos FOR ALL USING (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- SINAPI COMPOSIÇÕES (Custos por Estado)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sinapi_composicoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT,               -- pode ser 0 ou texto em alguns grupos
  descricao        TEXT NOT NULL,
  grupo            TEXT,
  unidade          TEXT,
  custo_go         NUMERIC(15,4),      -- Custo total Goiás (sem desoneração)
  pct_as_go        NUMERIC(8,4),       -- % atribuído SP em GO
  custo_sp         NUMERIC(15,4),      -- Custo total São Paulo (referência)
  data_referencia  TEXT NOT NULL DEFAULT '2026-03',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sinapi_comp_grupo   ON public.sinapi_composicoes(grupo);
CREATE INDEX IF NOT EXISTS idx_sinapi_comp_codigo  ON public.sinapi_composicoes(codigo);
CREATE INDEX IF NOT EXISTS idx_sinapi_comp_descr   ON public.sinapi_composicoes
  USING gin(to_tsvector('portuguese', descricao));

ALTER TABLE public.sinapi_composicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read sinapi_composicoes"
  ON public.sinapi_composicoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages sinapi_composicoes"
  ON public.sinapi_composicoes FOR ALL USING (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- SIGEM – Equipamentos e Materiais Permanentes (RENEM/SUS)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sigem_equipamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT NOT NULL,
  nome             TEXT NOT NULL,
  definicao        TEXT,
  classificacao    TEXT,             -- Médico Assistencial, Apoio, etc.
  valor_sugerido   NUMERIC(15,2),
  dolarizado       BOOLEAN DEFAULT FALSE,
  especificacao    TEXT,
  data_referencia  TEXT NOT NULL DEFAULT '2024-11',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sigem_codigo      ON public.sigem_equipamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_sigem_classif     ON public.sigem_equipamentos(classificacao);
CREATE INDEX IF NOT EXISTS idx_sigem_nome        ON public.sigem_equipamentos
  USING gin(to_tsvector('portuguese', nome));

ALTER TABLE public.sigem_equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read sigem"
  ON public.sigem_equipamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages sigem"
  ON public.sigem_equipamentos FOR ALL USING (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- SOMASUS – Orçamento de Referência (Policlínica MS)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.somasus_orcamento (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hierarquia       TEXT NOT NULL,     -- ex: "1.2.3"
  nivel            INTEGER NOT NULL,  -- profundidade: 1=grupo, 2=subgrupo, 3=item
  codigo           TEXT,              -- código SINAPI/CPOS/SBC etc.
  banco            TEXT,              -- SINAPI, CPOS/CDHU, SBC, Próprio
  descricao        TEXT NOT NULL,
  unidade          TEXT,
  quantidade       NUMERIC(15,3),
  tipo_linha       TEXT NOT NULL DEFAULT 'item'  -- 'secao' ou 'item'
                   CHECK (tipo_linha IN ('secao','item')),
  grupo_principal  TEXT,              -- nível 1 pai
  subgrupo         TEXT,              -- nível 2 pai
  tipologia        TEXT NOT NULL DEFAULT 'POLICLINICA',
  area_construida  NUMERIC(10,2) DEFAULT 3213.00, -- m²
  data_referencia  TEXT NOT NULL DEFAULT '2023-11',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_somasus_hierarquia  ON public.somasus_orcamento(hierarquia);
CREATE INDEX IF NOT EXISTS idx_somasus_grupo       ON public.somasus_orcamento(grupo_principal);
CREATE INDEX IF NOT EXISTS idx_somasus_banco       ON public.somasus_orcamento(banco);
CREATE INDEX IF NOT EXISTS idx_somasus_codigo      ON public.somasus_orcamento(codigo);
CREATE INDEX IF NOT EXISTS idx_somasus_descricao   ON public.somasus_orcamento
  USING gin(to_tsvector('portuguese', descricao));

ALTER TABLE public.somasus_orcamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read somasus"
  ON public.somasus_orcamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages somasus"
  ON public.somasus_orcamento FOR ALL USING (auth.role() = 'service_role');
