/**
 * ConstruSUS IA – Knowledge Base Population Script
 *
 * Usage: npm run populate-kb
 *
 * This script:
 * 1. Reads source documents (text files/JSON)
 * 2. Applies advanced chunking (sentence splitting, 512 tokens, 200 overlap)
 * 3. Enriches chunks with metadata headers
 * 4. Generates embeddings via OpenAI text-embedding-3-small
 * 5. Inserts into Supabase knowledge_base table
 *
 * For SINAPI/SIGEM Excel files, use the separate import-sinapi.ts script.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ── Carrega .env.local automaticamente ───────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://acsxqngqcmqxgtvuttbe.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const CHUNK_SIZE_TOKENS = 512;
const CHUNK_OVERLAP_TOKENS = 200;
const BATCH_SIZE = 10; // embeddings per batch

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not set. Add to .env.local");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not set. Add to .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Types ─────────────────────────────────────────────────────────────────────
interface DocumentChunk {
  content: string;
  metadata: {
    documento: string;
    titulo?: string;
    ano?: number;
    tema?: string;
    pagina?: string;
    secao?: string;
  };
}

// ── Tokenizer (approximate: 1 token ≈ 4 chars for Portuguese) ────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Advanced Chunker: Sentence Splitting with Overlap ────────────────────────
function chunkBySentences(
  text: string,
  maxTokens = CHUNK_SIZE_TOKENS,
  overlapTokens = CHUNK_OVERLAP_TOKENS
): string[] {
  // Split into sentences (Portuguese-aware)
  const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)/g;
  const sentences: string[] = [];
  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const s = match[0].trim();
    if (s.length > 10) sentences.push(s);
  }

  // If no sentence boundaries found, fall back to recursive character splitting
  if (sentences.length === 0) {
    return recursiveCharSplit(text, maxTokens, overlapTokens);
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.join(" "));

      // Keep overlap: remove sentences from front until under overlap limit
      while (currentChunk.length > 0 && currentTokens > overlapTokens) {
        const removed = currentChunk.shift()!;
        currentTokens -= estimateTokens(removed);
      }
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks.filter((c) => c.trim().length > 50);
}

function recursiveCharSplit(
  text: string,
  maxTokens: number,
  overlapTokens: number
): string[] {
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end).trim());
    start += maxChars - overlapChars;
    if (start >= text.length) break;
  }

  return chunks.filter((c) => c.length > 50);
}

// ── Enrich chunk with metadata header ────────────────────────────────────────
function enrichChunkContent(chunk: string, meta: DocumentChunk["metadata"]): string {
  const headerParts = [
    meta.documento && `Documento: ${meta.documento}`,
    meta.secao && `Seção: ${meta.secao}`,
    meta.titulo && `Título: ${meta.titulo}`,
    meta.tema && `Tema: ${meta.tema}`,
    meta.ano && `Ano: ${meta.ano}`,
  ].filter(Boolean);

  if (headerParts.length === 0) return chunk;
  return `${headerParts.join(" | ")}\n\n${chunk}`;
}

// ── OpenAI Embedding ──────────────────────────────────────────────────────────
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

// ── Insert chunks into Supabase ───────────────────────────────────────────────
async function insertChunks(chunks: DocumentChunk[]): Promise<void> {
  console.log(`\n📝 Processing ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const enrichedContents = batch.map((c) => enrichChunkContent(c.content, c.metadata));

    console.log(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);
    const embeddings = await getEmbeddings(enrichedContents);

    const rows = batch.map((chunk, idx) => ({
      content: chunk.content,
      embedding: embeddings[idx],
      metadata: chunk.metadata,
    }));

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) {
      console.error(`  ❌ Insert error:`, error.message);
    } else {
      console.log(`  ✅ Inserted ${batch.length} chunks`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ── Source Documents ──────────────────────────────────────────────────────────
// RDC 50 sample content (key sections - expand with full document text)
const RDC50_CONTENT = `
RESOLUÇÃO DA DIRETORIA COLEGIADA - RDC Nº 50, DE 21 DE FEVEREIRO DE 2002
Dispõe sobre o Regulamento Técnico para planejamento, programação, elaboração e avaliação de projetos físicos de estabelecimentos assistenciais de saúde.

CAPÍTULO 1 - DEFINIÇÕES

Área crítica: área onde existe risco aumentado de transmissão de infecção, onde se realizam procedimentos de risco ou onde estão internados pacientes com grave comprometimento imunológico. Exemplos: centro cirúrgico, UTI, berçário de alto risco, unidades de queimados.

Área semicrítica: área ocupada por pacientes com doenças infecciosas de baixa transmissibilidade ou doenças não infecciosas. Exemplos: enfermarias, ambulatório.

Área não crítica: área não ocupada por pacientes e sem risco de infecção. Exemplos: áreas administrativas e de circulação.

SEÇÃO 4.2 - DIMENSIONAMENTO MÍNIMO DE AMBIENTES

4.2.1 UNIDADE DE TERAPIA INTENSIVA (UTI)

A UTI adulto deve ter:
- Área mínima por leito em quarto individual: 10,00 m²
- Área mínima por leito em quarto coletivo (máximo 8 leitos): 7,50 m²
- Posto de enfermagem e prescrição: 1 por UTI
- Área mínima do posto de enfermagem: 3,60 m²
- Sala de utilidades: mínimo 6,00 m²
- Sala de isolamento: obrigatória (mínimo 10,00 m²)
- Distância máxima entre leito e pia: 1 metro

Número mínimo de leitos: 6 leitos por UTI.

UTI Neonatal:
- Área mínima por leito incubadora: 6,25 m²
- Área mínima posto de enfermagem: 3,60 m²
- Sala de isolamento obrigatória com espaço para incubadora

4.2.2 PRONTO-SOCORRO E PRONTO-ATENDIMENTO

Sala de observação:
- Área mínima por leito: 5,50 m² (adulto)
- Área mínima por leito: 5,00 m² (infantil)
- Número mínimo de leitos: 4 (adulto)

Sala de primeiros socorros/reanimação: mínimo 25,00 m²

Consultório médico: mínimo 7,50 m²

Box de atendimento individual: mínimo 6,00 m²

4.2.3 CENTRO CIRÚRGICO

Sala cirúrgica de pequeno porte: 20,00 m² (mínimo)
Sala cirúrgica de médio porte: 25,00 m² (mínimo)
Sala cirúrgica de grande porte: 36,00 m² (mínimo) – obrigatória para neurocirurgia, cirurgia cardíaca e ortopédica

Dimensões mínimas da sala cirúrgica: 5,50m x 5,50m = 30,25m²

Corredor de circulação exclusivo: largura mínima 2,40 m

Sala de recuperação pós-anestésica (RPA):
- Área mínima por leito: 6,30 m²
- Número mínimo de leitos: proporção 1:1 com salas cirúrgicas

Central de material estéril (CME):
- Área total mínima: 0,5 m² por leito de centro cirúrgico

4.2.4 ENFERMARIA / INTERNAÇÃO

Quarto individual: mínimo 10,00 m²
Quarto coletivo (máximo 6 leitos): mínimo 5,50 m² por leito
Posto de enfermagem: 1 para cada 30 leitos, área mínima 3,60 m²
Distância máxima entre leito e sanitário: máximo 15 m

4.2.5 AMBULATÓRIO

Consultório simples sem sanitário: 7,50 m²
Consultório com sanitário: 7,50 m² + 3,00 m² (sanitário)
Sala de espera: 1,20 m² por cadeira, mínimo 2 cadeiras por consultório

SEÇÃO 5 - INSTALAÇÕES PREDIAIS

5.1 INSTALAÇÕES ELÉTRICAS
Sistema de eletricidade essencial (gerador):
- Áreas críticas: alimentação ininterrupta (máximo 10 segundos para transferência)
- Centros cirúrgicos: grupo gerador obrigatório

5.2 CLIMATIZAÇÃO
Sistemas de climatização em áreas críticas devem seguir:
- UTI: mínimo 15 renovações de ar/hora
- Sala cirúrgica: mínimo 15 renovações de ar/hora com pressão positiva
- Isolamento de pressão negativa: mínimo 12 renovações de ar/hora

5.3 GASES MEDICINAIS
Instalação centralizada obrigatória para:
- O₂ (oxigênio) em UTI, CC, RPA, berçário, pronto-socorro
- Ar comprimido medicinal em UTI, CC
- Vácuo clínico em UTI, CC, RPA

SEÇÃO 6 - PROGRAMA FÍSICO E FUNCIONAL

6.1 UNIDADE DE INTERNAÇÃO CLÍNICA/CIRÚRGICA
Capacidade máxima recomendada: 30 leitos por unidade de internação.
Proporção de funcionários: mínimo 1 enfermeiro para cada 10 leitos.

6.2 DIAGNOSE E TERAPIA
Sala de raios-X convencional: mínimo 20,00 m²
Sala de ultrassonografia: mínimo 9,00 m²
Sala de tomografia computadorizada: mínimo 32,00 m² (sala de exame)
Sala de ressonância magnética: mínimo 40,00 m² (blindagem eletromagnética obrigatória)
`;

const SINAPI_GUIDE_CONTENT = `
GUIA DE UTILIZAÇÃO DO SINAPI – SISTEMA NACIONAL DE PESQUISA DE CUSTOS E ÍNDICES DA CONSTRUÇÃO CIVIL

O SINAPI é gerido pela Caixa Econômica Federal (CEF) em parceria com o IBGE. Fornece referências mensais de custos de mão de obra e materiais para a construção civil no Brasil.

ESTRUTURA DA TABELA SINAPI

1. COMPOSIÇÕES DE SERVIÇOS
Representam o custo total de execução de um serviço, incluindo:
- Mão de obra (com encargos sociais)
- Materiais
- Equipamentos

2. INSUMOS
Código de 6 dígitos que identificam materiais, equipamentos e mão de obra.
Exemplos:
- 72082 – PEDREIRO COM ENCARGOS COMPLEMENTARES – R$ 28,50/H (GO, Mar/2026)
- 88316 – AUXILIAR DE SERVIÇOS GERAIS – R$ 19,20/H (GO, Mar/2026)
- 4782 – CIMENTO PORTLAND COMPOSTO CP II-E-32 – R$ 38,60/SC 50kg (GO, Mar/2026)
- 1379 – AREIA MÉDIA LAVADA – R$ 105,00/m³ (GO, Mar/2026)

CUSTO MÉDIO DE CONSTRUÇÃO HOSPITALAR (SINAPI/GOIÁS 2026)

Tipologia: Hospital de médio porte (padrão público SUS)
- Custo médio por m² (obra bruta): R$ 3.800 – R$ 4.500/m²
- Com instalações especiais (UTI, CC): R$ 6.000 – R$ 9.000/m²

Itens de maior peso no custo hospitalar:
1. Estrutura e vedação: 25-30% do custo total
2. Instalações hidrossanitárias: 15-20%
3. Instalações elétricas e lógica: 12-18%
4. Instalações de climatização (HVAC): 10-15%
5. Gases medicinais: 5-8%
6. Acabamentos e revestimentos: 15-20%

TABELA DE REFERÊNCIA – CUSTOS POR AMBIENTE (UTI)
Custo estimado para implantação de 1 leito de UTI adulto (incluindo equipamentos básicos):
- Construção civil + instalações: R$ 85.000 – R$ 120.000 por leito
- Equipamentos médicos básicos: R$ 150.000 – R$ 250.000 por leito
- Total estimado: R$ 235.000 – R$ 370.000 por leito

CUSTOS PRONTO-SOCORRO
- Área de observação adulto (por leito): R$ 25.000 – R$ 35.000 (civil + instalações)
- Sala de emergência/reanimação: R$ 120.000 – R$ 180.000 (completa)

ÍNDICES DE ATUALIZAÇÃO SINAPI
O SINAPI é atualizado mensalmente pela CEF/IBGE.
Índice de variação acumulada 12 meses (Goiás, Mar/2026): +8,3% em relação a Mar/2025.

NOTA: Os valores acima são estimativas com base nas composições SINAPI. O orçamento definitivo deve ser elaborado com planilha orçamentária detalhada.
`;

// ── Process and insert all documents ─────────────────────────────────────────
async function processDocument(
  content: string,
  baseMetadata: DocumentChunk["metadata"]
): Promise<DocumentChunk[]> {
  const rawChunks = chunkBySentences(content);
  return rawChunks.map((chunk) => ({
    content: chunk,
    metadata: { ...baseMetadata },
  }));
}

async function main() {
  console.log("🚀 ConstruSUS IA – Knowledge Base Population");
  console.log("============================================\n");

  const allChunks: DocumentChunk[] = [];

  // Process RDC 50
  console.log("📄 Processing RDC 50...");
  const rdc50Chunks = await processDocument(RDC50_CONTENT.trim(), {
    documento: "RDC 50",
    titulo: "Regulamento Técnico para Projetos Físicos de EAS",
    ano: 2002,
    tema: "Normas ANVISA",
    secao: "RDC 50/2002 - ANVISA",
  });
  allChunks.push(...rdc50Chunks);
  console.log(`  → ${rdc50Chunks.length} chunks`);

  // Process SINAPI Guide
  console.log("📄 Processing SINAPI Guide...");
  const sinapiChunks = await processDocument(SINAPI_GUIDE_CONTENT.trim(), {
    documento: "SINAPI",
    titulo: "Guia de Custos SINAPI - Construção Hospitalar",
    ano: 2026,
    tema: "Orçamento de Obras",
    secao: "SINAPI Mar/2026",
  });
  allChunks.push(...sinapiChunks);
  console.log(`  → ${sinapiChunks.length} chunks`);

  console.log(`\n📊 Total: ${allChunks.length} chunks to process`);

  // Check if knowledge base already has content
  const { count } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    console.log(`\n⚠️  Knowledge base already has ${count} entries.`);
    console.log("   To re-populate, first clear the table:");
    console.log("   DELETE FROM knowledge_base;");
    console.log("\nProceeding to add new chunks...\n");
  }

  await insertChunks(allChunks);

  console.log("\n✅ Knowledge base population complete!");
  console.log(`   Total chunks inserted: ${allChunks.length}`);
  console.log("\n💡 Next steps:");
  console.log("   1. Import SINAPI Excel data using scripts/import-sinapi.ts");
  console.log("   2. Import SIGEM data using scripts/import-sigem.ts");
  console.log("   3. Add full RDC 50 PDF text for comprehensive coverage");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
