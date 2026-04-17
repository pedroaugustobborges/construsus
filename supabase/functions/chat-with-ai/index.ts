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

    // ── STEP 7: Build context string ──────────────────────────────────────────
    const contextString = finalContext
      .map((chunk, i) => {
        const meta = chunk.metadata ?? {};
        const header = [
          meta.documento && `Documento: ${meta.documento}`,
          meta.secao && `Seção: ${meta.secao}`,
          meta.titulo && `Título: ${meta.titulo}`,
          meta.ano && `Ano: ${meta.ano}`,
        ]
          .filter(Boolean)
          .join(" | ");

        return `[Fonte ${i + 1}${header ? ` – ${header}` : ""}]\n${chunk.content}`;
      })
      .join("\n\n---\n\n");

    const hasContext = contextString.trim().length > 0;

    // ── STEP 8: Build prompt & call OpenAI ───────────────────────────────────
    const systemPrompt = `Você é o ConstruSUS IA, um especialista em engenharia hospitalar pública e planejamento de infraestrutura de saúde do SUS (Sistema Único de Saúde). Você foi desenvolvido pela Secretaria de Estado da Saúde de Goiás (SES-GO).

Suas especialidades incluem:
- Normas ANVISA (RDC 50/2002 e atualizações) para projetos físicos de estabelecimentos de saúde
- Tabela SINAPI de custos de construção civil
- SIGEM (equipamentos médico-hospitalares)
- SOMASUS (parâmetros de programação de saúde)
- Planejamento e orçamento de obras hospitalares
- Gestão de infraestrutura do SUS

${hasContext ? `CONTEXTO RECUPERADO (use EXCLUSIVAMENTE estas informações para responder):
===
${contextString}
===

INSTRUÇÕES CRÍTICAS:
- Responda EXCLUSIVAMENTE com base no contexto acima
- Se o contexto não contiver informação suficiente, diga: "Não encontrei dados suficientes na base de conhecimento sobre este tema específico. Recomendo consultar diretamente [fonte relevante]."
- Cite sempre a fonte (ex: "Conforme RDC 50, Seção X.X.X...")
- Formate tabelas em Markdown quando apresentar dados comparativos
- Use R$ e m² corretamente para valores monetários e áreas` : `INSTRUÇÃO: Não encontrei documentos relevantes na base de conhecimento para esta pergunta específica. Informe ao usuário que não possui dados suficientes nesta base e sugira as fontes oficiais (RDC 50 ANVISA, portal SINAPI da CEF, SOMASUS do Ministério da Saúde).`}

Responda sempre em português brasileiro. Seja preciso, técnico e objetivo.`;

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
