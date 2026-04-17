import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o";
const TOP_K_VECTOR = 20;
const TOP_K_BM25 = 20;
const TOP_K_RERANK = 5;
const RRF_K = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Embedding ───────────────────────────────────────────────────────────────
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

// ─── Query Expansion ─────────────────────────────────────────────────────────
async function expandQuery(query: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de busca para um sistema de infraestrutura hospitalar do SUS.
Gere 2 variações da pergunta do usuário que ajudem a recuperar documentos técnicos relevantes.
Inclua sinônimos técnicos da construção civil, normas (RDC 50, SINAPI, ANVISA) e gestão em saúde.
Retorne APENAS as 2 variações, uma por linha, sem numeração.`,
        },
        { role: "user", content: query },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  const variations = data.choices[0].message.content
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)
    .slice(0, 2);
  return [query, ...variations];
}

// ─── Metadata filter extraction ───────────────────────────────────────────────
function extractMetadataFilters(query: string): Record<string, string> | null {
  const lower = query.toLowerCase();
  const filters: Record<string, string> = {};

  if (lower.includes("rdc 50") || lower.includes("rdc50")) {
    filters["documento"] = "RDC 50";
  } else if (lower.includes("sinapi")) {
    filters["documento"] = "SINAPI";
  } else if (lower.includes("sigem")) {
    filters["documento"] = "SIGEM";
  }

  if (lower.includes("uti") || lower.includes("terapia intensiva")) {
    filters["tema"] = "UTI";
  } else if (lower.includes("pronto-socorro") || lower.includes("emergência") || lower.includes("upa")) {
    filters["tema"] = "Urgência e Emergência";
  } else if (lower.includes("cirurgi")) {
    filters["tema"] = "Centro Cirúrgico";
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

// ─── Vector Search ────────────────────────────────────────────────────────────
async function vectorSearch(
  supabase: ReturnType<typeof createClient>,
  embedding: number[],
  filters: Record<string, string> | null,
  limit: number
): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown>; similarity: number }>> {
  const params: Record<string, unknown> = {
    query_embedding: embedding,
    match_count: limit,
  };

  if (filters && Object.keys(filters).length > 0) {
    params.filter = filters;
  }

  const { data, error } = await supabase.rpc("match_knowledge_base", params);
  if (error) {
    console.error("Vector search error:", error);
    return [];
  }
  return data ?? [];
}

// ─── BM25 (Full-text) Search ──────────────────────────────────────────────────
async function bm25Search(
  supabase: ReturnType<typeof createClient>,
  query: string,
  filters: Record<string, string> | null,
  limit: number
): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown>; rank: number }>> {
  const params: Record<string, unknown> = {
    query_text: query,
    match_count: limit,
  };

  if (filters) {
    params.filter = filters;
  }

  const { data, error } = await supabase.rpc("search_knowledge_bm25", params);
  if (error) {
    console.error("BM25 search error:", error);
    return [];
  }
  return data ?? [];
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────
interface RankedDoc {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  rrf_score: number;
}

function reciprocalRankFusion(
  lists: Array<Array<{ id: string; content: string; metadata: Record<string, unknown> }>>
): RankedDoc[] {
  const scores: Map<string, { doc: { id: string; content: string; metadata: Record<string, unknown> }; score: number }> = new Map();

  for (const list of lists) {
    list.forEach((doc, rank) => {
      const existing = scores.get(doc.id);
      const rrfScore = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(doc.id, { doc, score: rrfScore });
      }
    });
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ doc, score }) => ({ ...doc, rrf_score: score }));
}

// ─── Cross-Encoder Re-ranking ─────────────────────────────────────────────────
async function rerankWithCrossEncoder(
  query: string,
  candidates: RankedDoc[],
  topK: number
): Promise<RankedDoc[]> {
  // Use GPT-4o-mini as a cross-encoder for re-ranking
  const scoringPrompt = candidates
    .map(
      (c, i) =>
        `[Documento ${i + 1}]\n${c.content.substring(0, 400)}`
    )
    .join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um avaliador de relevância para um sistema de recuperação de documentos técnicos de infraestrutura hospitalar.
Para cada documento abaixo, avalie sua relevância para a pergunta do usuário com uma pontuação de 0 a 10.
Retorne APENAS um JSON com o formato: {"scores": [score1, score2, ...]}`,
        },
        {
          role: "user",
          content: `Pergunta: ${query}\n\nDocumentos:\n${scoringPrompt}`,
        },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  try {
    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content) as { scores: number[] };
    const scores = result.scores ?? [];

    const ranked = candidates
      .map((doc, i) => ({ ...doc, rerank_score: scores[i] ?? 0 }))
      .sort((a, b) => b.rerank_score - a.rerank_score)
      .slice(0, topK);

    return ranked;
  } catch {
    // Fallback to RRF order if re-ranking fails
    return candidates.slice(0, topK);
  }
}

// ─── Structured Table Search ─────────────────────────────────────────────────
// Extracts meaningful Portuguese keywords (ignores stopwords and source names)
const STOPWORDS = new Set([
  "o","a","os","as","um","uma","uns","umas","de","do","da","dos","das",
  "em","no","na","nos","nas","para","por","com","sem","que","qual","quais",
  "como","quando","onde","quanto","quem","segundo","pela","pelo","pelas","pelos",
  "este","esta","esse","essa","aquele","aquela","seu","sua","seus","suas",
  "não","mais","muito","também","mas","ou","e","se","ao","aos",
  "preço","custo","valor","médio","média","tabela","lista","sobre","existe",
  "tem","ter","são","ser","está","me","diga","fale","pode","obter","quero",
  "buscar","encontrar","listar","mostrar","apresentar","informar","devo",
  "preciso","gostaria","saber","qual","quero","tipo","tipos","tipos",
]);
const SOURCE_NAMES = new Set(["sigem","sinapi","somasus","rdc","anvisa","cef","ibge"]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents for matching
    .replace(/[?!.,;:()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w) && !SOURCE_NAMES.has(w))
    .slice(0, 4);
}

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return "N/D";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

async function searchStructuredTables(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<string> {
  const lower = query.toLowerCase();
  const lowerNorm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const keywords = extractKeywords(query);
  const sections: string[] = [];

  // ── Detect intent ────────────────────────────────────────────────────────────
  const wantsSigem =
    lower.includes("sigem") || lower.includes("renem") ||
    lowerNorm.includes("equipamento") || lowerNorm.includes("aparelho") ||
    lowerNorm.includes("tomografo") || lowerNorm.includes("ressonancia") ||
    lowerNorm.includes("ultrassom") || lowerNorm.includes("monitor") ||
    lowerNorm.includes("ventilador") || lowerNorm.includes("bisturi") ||
    lowerNorm.includes("autoclave") || lowerNorm.includes("desfibrilador") ||
    lowerNorm.includes("microscopio") || lowerNorm.includes("endoscopio") ||
    lowerNorm.includes("raio-x") || lowerNorm.includes("raio x") ||
    lowerNorm.includes("maca") || lowerNorm.includes("cadeira") ||
    lowerNorm.includes("eletrocardiografo") || lowerNorm.includes("incubadora") ||
    lowerNorm.includes("equipamento medico") || lowerNorm.includes("material permanente");

  const wantsSinapiInsumo =
    lower.includes("sinapi") || lowerNorm.includes("insumo") ||
    lowerNorm.includes("cimento") || lowerNorm.includes("areia") ||
    lowerNorm.includes("aco") || lowerNorm.includes("tijolo") ||
    lowerNorm.includes("concreto") || lowerNorm.includes("tinta") ||
    lowerNorm.includes("fio eletrico") || lowerNorm.includes("tubo") ||
    lowerNorm.includes("material de construcao") || lowerNorm.includes("revestimento");

  const wantsSinapiComp =
    lower.includes("sinapi") && (lowerNorm.includes("composicao") || lowerNorm.includes("servico")) ||
    lowerNorm.includes("mao de obra") || lowerNorm.includes("pintura") ||
    lowerNorm.includes("assentamento") || lowerNorm.includes("instalacao eletrica") ||
    lowerNorm.includes("fundacao") || lowerNorm.includes("alvenaria");

  const wantsSomasus =
    lower.includes("somasus") || lowerNorm.includes("policlinica") ||
    lowerNorm.includes("orcamento referencia") || lowerNorm.includes("planilha orcamentaria");

  // ── SIGEM search ─────────────────────────────────────────────────────────────
  if (wantsSigem && keywords.length > 0) {
    for (const kw of keywords) {
      const { data } = await supabase
        .from("sigem_equipamentos")
        .select("codigo,nome,classificacao,valor_sugerido,dolarizado,especificacao")
        .ilike("nome", `%${kw}%`)
        .limit(20);

      if (data && data.length > 0) {
        const rows = data.map((eq: Record<string, unknown>) =>
          `| ${eq.codigo} | ${eq.nome} | ${eq.classificacao ?? "-"} | ${fmtBRL(eq.valor_sugerido as number | null)} | ${eq.dolarizado ? "USD" : "BRL"} |`
        ).join("\n");

        sections.push(
          `### SIGEM – Equipamentos RENEM (Referência Nov/2024)\n` +
          `Busca: "${kw}"\n\n` +
          `| Código | Nome | Classificação | Valor Sugerido | Moeda |\n` +
          `|--------|------|---------------|----------------|-------|\n` +
          rows +
          `\n\n*Fonte: SIGEM/RENEM – Sistema de Gerenciamento de Material Médico-Hospitalar*`
        );
        break; // found results, stop trying other keywords
      }
    }
  }

  // ── SINAPI Insumos search ─────────────────────────────────────────────────────
  if (wantsSinapiInsumo && keywords.length > 0) {
    for (const kw of keywords) {
      const { data } = await supabase
        .from("sinapi_insumos")
        .select("codigo,descricao,unidade,preco_go,preco_sp,origem_preco")
        .ilike("descricao", `%${kw}%`)
        .not("preco_go", "is", null)
        .limit(20);

      if (data && data.length > 0) {
        const rows = data.map((ins: Record<string, unknown>) =>
          `| ${ins.codigo} | ${ins.descricao} | ${ins.unidade ?? "-"} | ${fmtBRL(ins.preco_go as number | null)} | ${fmtBRL(ins.preco_sp as number | null)} |`
        ).join("\n");

        sections.push(
          `### SINAPI – Insumos (Referência Mar/2026, sem desoneração)\n` +
          `Busca: "${kw}"\n\n` +
          `| Código | Descrição | Unidade | Preço GO | Preço SP |\n` +
          `|--------|-----------|---------|----------|----------|\n` +
          rows +
          `\n\n*Fonte: SINAPI/CEF – tabela de insumos, estado de Goiás (GO)*`
        );
        break;
      }
    }
  }

  // ── SINAPI Composições search ─────────────────────────────────────────────────
  if (wantsSinapiComp && keywords.length > 0) {
    for (const kw of keywords) {
      const { data } = await supabase
        .from("sinapi_composicoes")
        .select("codigo,descricao,grupo,unidade,custo_go,custo_sp")
        .ilike("descricao", `%${kw}%`)
        .not("custo_go", "is", null)
        .limit(15);

      if (data && data.length > 0) {
        const rows = data.map((comp: Record<string, unknown>) =>
          `| ${comp.codigo ?? "-"} | ${comp.descricao} | ${comp.unidade ?? "-"} | ${fmtBRL(comp.custo_go as number | null)} | ${fmtBRL(comp.custo_sp as number | null)} |`
        ).join("\n");

        sections.push(
          `### SINAPI – Composições (Referência Mar/2026, sem desoneração)\n` +
          `Busca: "${kw}"\n\n` +
          `| Código | Descrição | Unidade | Custo GO | Custo SP |\n` +
          `|--------|-----------|---------|----------|----------|\n` +
          rows +
          `\n\n*Fonte: SINAPI/CEF – tabela de composições analíticas*`
        );
        break;
      }
    }
  }

  // ── SOMASUS Policlínica search ─────────────────────────────────────────────────
  if (wantsSomasus && keywords.length > 0) {
    for (const kw of keywords) {
      const { data } = await supabase
        .from("somasus_orcamento")
        .select("hierarquia,codigo,banco,descricao,unidade,quantidade,grupo_principal")
        .ilike("descricao", `%${kw}%`)
        .eq("tipo_linha", "item")
        .limit(20);

      if (data && data.length > 0) {
        const rows = data.map((item: Record<string, unknown>) =>
          `| ${item.hierarquia} | ${item.descricao} | ${item.banco ?? "-"} | ${item.unidade ?? "-"} | ${item.quantidade ?? "-"} | ${item.grupo_principal ?? "-"} |`
        ).join("\n");

        sections.push(
          `### SOMASUS – Orçamento Policlínica MS (Referência Nov/2023, 3.213 m²)\n` +
          `Busca: "${kw}"\n\n` +
          `| Hierarquia | Descrição | Banco | Unidade | Quantidade | Grupo |\n` +
          `|------------|-----------|-------|---------|------------|-------|\n` +
          rows +
          `\n\n*Fonte: SOMASUS/MS – Planilha orçamentária de referência Policlínica, sem desoneração*`
        );
        break;
      }
    }
  }

  return sections.join("\n\n");
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check — decode JWT locally (platform already validates signature)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string | undefined;
    try {
      // JWT payload is base64url — convert to standard base64 before atob()
      const b64url = token.split(".")[1];
      const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(
        b64url.length + (4 - b64url.length % 4) % 4, "="
      );
      const claims = JSON.parse(atob(b64)) as { sub?: string; exp?: number; role?: string };
      // Reject anon/service tokens — only real user sessions
      if (!claims.sub || claims.role === "anon" || claims.role === "service_role") {
        throw new Error("not a user session");
      }
      // Reject expired tokens
      if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
        throw new Error("token expired");
      }
      userId = claims.sub;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json() as {
      message: string;
      conversation_id: string;
      history?: Array<{ role: string; content: string }>;
    };
    const { message, conversation_id, history = [] } = body;

    if (!message || !conversation_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 1-6: RAG pipeline (fail-safe — errors produce empty context) ─────
    let finalContext: RankedDoc[] = [];
    try {
      const queryEmbedding = await getEmbedding(message);
      const metadataFilters = extractMetadataFilters(message);
      const queryVariations = await expandQuery(message);

      const allVectorLists: Array<{ id: string; content: string; metadata: Record<string, unknown> }[]> = [];
      const allBm25Lists: Array<{ id: string; content: string; metadata: Record<string, unknown> }[]> = [];

      await Promise.all(
        queryVariations.map(async (variant) => {
          const varEmbedding = variant === message ? queryEmbedding : await getEmbedding(variant);
          const [vectorResults, bm25Results] = await Promise.all([
            vectorSearch(supabase, varEmbedding, metadataFilters, TOP_K_VECTOR),
            bm25Search(supabase, variant, metadataFilters, TOP_K_BM25),
          ]);
          allVectorLists.push(vectorResults);
          allBm25Lists.push(bm25Results);
        })
      );

      const fusedResults = reciprocalRankFusion([...allVectorLists, ...allBm25Lists]);
      const top30 = fusedResults.slice(0, 30);
      finalContext = top30.length > 0 ? await rerankWithCrossEncoder(message, top30, TOP_K_RERANK) : [];
    } catch (ragErr) {
      console.error("RAG pipeline error (continuing without context):", ragErr);
    }

    // ── STEP 7: Build context string ─────────────────────────────────────────
    // 7a. RAG context (knowledge_base)
    const ragContext = finalContext
      .map((chunk, i) => {
        const meta = chunk.metadata ?? {};
        const header = [
          meta.documento && `Documento: ${meta.documento}`,
          meta.secao && `Seção: ${meta.secao}`,
          meta.titulo && `Título: ${meta.titulo}`,
          meta.ano && `Ano: ${meta.ano}`,
        ].filter(Boolean).join(" | ");
        return `[Fonte ${i + 1}${header ? ` – ${header}` : ""}]\n${chunk.content}`;
      })
      .join("\n\n---\n\n");

    // 7b. Direct structured table search (SIGEM, SINAPI, SOMASUS)
    let tableContext = "";
    try {
      tableContext = await searchStructuredTables(supabase, message);
    } catch (err) {
      console.error("Structured search error:", err);
    }

    const fullContext = [ragContext, tableContext].filter(s => s.trim()).join("\n\n---\n\n");
    const hasContext = fullContext.trim().length > 0;

    // ── STEP 8: Build prompt & call OpenAI ───────────────────────────────────
    const systemPrompt = `Você é o ConstruSUS IA, assistente especializado em engenharia hospitalar pública e infraestrutura do SUS, desenvolvido pela Secretaria de Estado da Saúde de Goiás (SES-GO).

Suas bases de dados incluem:
- SINAPI Mar/2026 (insumos e composições, sem desoneração, referência GO/SP)
- SIGEM/RENEM Nov/2024 (equipamentos médico-hospitalares permanentes)
- SOMASUS Nov/2023 (orçamento de referência Policlínica, 3.213 m²)
- RDC 50/2002 ANVISA (normas físicas para estabelecimentos de saúde)

${hasContext ? `## DADOS ENCONTRADOS

${fullContext}

## INSTRUÇÕES
- Responda com base nos dados acima, que foram extraídos diretamente das bases de dados oficiais
- Apresente tabelas Markdown quando houver múltiplos itens com preços ou quantidades
- Calcule médias, totais ou comparações quando solicitado
- Cite a fonte e data de referência de cada dado (ex: "SIGEM Nov/2024", "SINAPI Mar/2026 – GO")
- Use português brasileiro correto e linguagem técnica apropriada
- Se os dados encontrados não responderem completamente à pergunta, indique o que foi encontrado e sugira onde buscar o restante` : `## INSTRUÇÃO
Não foram encontrados dados específicos nas bases de dados para esta consulta.
Informe ao usuário de forma clara e correta em português, e sugira as fontes oficiais: SIGEM (saude.gov.br/sigem), SINAPI (caixa.gov.br/sinapi), SOMASUS (somasus.saude.gov.br), ou RDC 50 (ANVISA).
Não invente dados, preços ou normas.`}

Responda sempre em português brasileiro correto e formal. Não use gírias. Não invente informações.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    // ── Streaming response ────────────────────────────────────────────────────
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI API error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({ error: `OpenAI error ${openaiRes.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STEP 9: Stream response & persist message ─────────────────────────────
    let fullResponse = "";

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Persist user message (non-blocking — don't let DB errors stop the stream)
    supabase.from("messages").insert({
      conversation_id,
      role: "user",
      content: message,
      metadata: { user_id: userId },
    }).then(({ error }) => {
      if (error) console.error("User message persist error:", error.message);
    });

    // Stream OpenAI response
    (async () => {
      const reader = openaiRes.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data) as {
                choices: [{ delta: { content?: string } }];
              };
              const content = parsed.choices[0]?.delta?.content ?? "";
              if (content) {
                fullResponse += content;
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (streamErr) {
        console.error("Streaming error:", streamErr);
      } finally {
        // Persist assistant message — must not throw, or writer.close() is skipped
        try {
          await supabase.from("messages").insert({
            conversation_id,
            role: "assistant",
            content: fullResponse || "(sem resposta)",
            metadata: {
              model: CHAT_MODEL,
              sources: finalContext.map((c) => c.metadata?.documento).filter(Boolean),
              chunks_used: finalContext.length,
            },
          });
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversation_id);
        } catch (dbErr) {
          console.error("Assistant message persist error:", dbErr);
        }

        // Always close the stream
        try {
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
        } catch {
          // stream already closed
        }
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
