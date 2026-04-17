import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAT_MODEL = "gpt-4o";
const EMBEDDING_MODEL = "text-embedding-3-small";
const RRF_K = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function decodeJwt(token: string): { sub?: string; exp?: number; role?: string } | null {
  try {
    const b64url = token.split(".")[1];
    const pad = (4 - b64url.length % 4) % 4;
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    return JSON.parse(atob(b64));
  } catch { return null; }
}

function fmtBRL(v: unknown): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "N/D";
  const parts = n.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${parts[0]},${parts[1]}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const STOPWORDS = new Set([
  "qual","quais","como","quando","onde","quanto","quem","segundo","para",
  "pelo","pela","pelos","pelas","este","esta","esse","essa","aquele","aquela",
  "sobre","existe","diga","fale","pode","obter","quero","buscar","encontrar",
  "mostrar","informar","preciso","gostaria","saber","tipo","valor","médio",
  "média","preço","custo","tabela","lista","tem","ter","são","ser","está",
]);

function keywords(query: string): string[] {
  const sources = new Set(["sigem","sinapi","somasus","rdc","anvisa","cef"]);
  return stripAccents(query.toLowerCase())
    .replace(/[?!.,;:()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w) && !sources.has(w))
    .slice(0, 4);
}

// ─── OpenAI helpers ───────────────────────────────────────────────────────────
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  const d = await res.json();
  return d.data[0].embedding;
}

// ─── Structured table search ──────────────────────────────────────────────────
async function tableSearch(sb: ReturnType<typeof createClient>, query: string): Promise<string> {
  const lower = query.toLowerCase();
  const norm = stripAccents(lower);
  const kws = keywords(query);
  if (kws.length === 0) return "";

  const parts: string[] = [];

  const wantsSigem =
    lower.includes("sigem") || lower.includes("renem") ||
    norm.includes("equipamento") || norm.includes("aparelho") ||
    norm.includes("tomografo") || norm.includes("ressonancia") ||
    norm.includes("ultrassom") || norm.includes("monitor") ||
    norm.includes("ventilador") || norm.includes("bisturi") ||
    norm.includes("desfibrilador") || norm.includes("autoclave") ||
    norm.includes("endoscopio") || norm.includes("microscopio") ||
    norm.includes("incubadora") || norm.includes("maca");

  const wantsSinapiInsumo =
    lower.includes("sinapi") || norm.includes("insumo") ||
    norm.includes("cimento") || norm.includes("areia") ||
    norm.includes("tijolo") || norm.includes("concreto") || norm.includes("tinta") ||
    norm.includes("material de construcao") || norm.includes("revestimento");

  const wantsSinapiComp =
    (lower.includes("sinapi") && (norm.includes("composicao") || norm.includes("servico"))) ||
    norm.includes("mao de obra") || norm.includes("pintura") || norm.includes("alvenaria");

  const wantsSomasus =
    lower.includes("somasus") || norm.includes("policlinica") ||
    norm.includes("orcamento referencia");

  for (const kw of kws) {
    if (wantsSigem) {
      const { data } = await sb
        .from("sigem_equipamentos")
        .select("codigo,nome,classificacao,valor_sugerido,dolarizado")
        .ilike("nome", `%${kw}%`)
        .limit(20);
      if (data?.length) {
        const rows = (data as Record<string,unknown>[]).map(r =>
          `| ${r.codigo} | ${r.nome} | ${r.classificacao ?? "-"} | ${fmtBRL(r.valor_sugerido)} | ${r.dolarizado ? "USD" : "BRL"} |`
        ).join("\n");
        parts.push(
          `### SIGEM – Equipamentos RENEM (Nov/2024) — busca: "${kw}"\n` +
          `| Código | Nome | Classificação | Valor Sugerido | Moeda |\n|---|---|---|---|---|\n${rows}\n` +
          `_Fonte: SIGEM/RENEM – MS_`
        );
        break;
      }
    }
  }

  for (const kw of kws) {
    if (wantsSinapiInsumo) {
      const { data } = await sb
        .from("sinapi_insumos")
        .select("codigo,descricao,unidade,preco_go,preco_sp")
        .ilike("descricao", `%${kw}%`)
        .not("preco_go", "is", null)
        .limit(20);
      if (data?.length) {
        const rows = (data as Record<string,unknown>[]).map(r =>
          `| ${r.codigo} | ${r.descricao} | ${r.unidade ?? "-"} | ${fmtBRL(r.preco_go)} | ${fmtBRL(r.preco_sp)} |`
        ).join("\n");
        parts.push(
          `### SINAPI – Insumos (Mar/2026, sem desoneração) — busca: "${kw}"\n` +
          `| Código | Descrição | Un. | Preço GO | Preço SP |\n|---|---|---|---|---|\n${rows}\n` +
          `_Fonte: SINAPI/CEF_`
        );
        break;
      }
    }
  }

  for (const kw of kws) {
    if (wantsSinapiComp) {
      const { data } = await sb
        .from("sinapi_composicoes")
        .select("codigo,descricao,unidade,custo_go,custo_sp")
        .ilike("descricao", `%${kw}%`)
        .not("custo_go", "is", null)
        .limit(15);
      if (data?.length) {
        const rows = (data as Record<string,unknown>[]).map(r =>
          `| ${r.codigo ?? "-"} | ${r.descricao} | ${r.unidade ?? "-"} | ${fmtBRL(r.custo_go)} | ${fmtBRL(r.custo_sp)} |`
        ).join("\n");
        parts.push(
          `### SINAPI – Composições (Mar/2026, sem desoneração) — busca: "${kw}"\n` +
          `| Código | Descrição | Un. | Custo GO | Custo SP |\n|---|---|---|---|---|\n${rows}\n` +
          `_Fonte: SINAPI/CEF_`
        );
        break;
      }
    }
  }

  for (const kw of kws) {
    if (wantsSomasus) {
      const { data } = await sb
        .from("somasus_orcamento")
        .select("hierarquia,codigo,banco,descricao,unidade,quantidade,grupo_principal")
        .ilike("descricao", `%${kw}%`)
        .eq("tipo_linha", "item")
        .limit(20);
      if (data?.length) {
        const rows = (data as Record<string,unknown>[]).map(r =>
          `| ${r.hierarquia} | ${r.descricao} | ${r.banco ?? "-"} | ${r.unidade ?? "-"} | ${r.quantidade ?? "-"} |`
        ).join("\n");
        parts.push(
          `### SOMASUS – Policlínica MS (Nov/2023, 3.213 m²) — busca: "${kw}"\n` +
          `| Hierarquia | Descrição | Banco | Un. | Qtd. |\n|---|---|---|---|---|\n${rows}\n` +
          `_Fonte: SOMASUS/MS_`
        );
        break;
      }
    }
  }

  return parts.join("\n\n");
}

// ─── RAG helpers ──────────────────────────────────────────────────────────────
interface Doc { id: string; content: string; metadata: Record<string,unknown>; }

async function hybridSearch(
  sb: ReturnType<typeof createClient>,
  query: string,
  embedding: number[],
): Promise<string> {
  const [vRes, bRes] = await Promise.all([
    sb.rpc("match_knowledge_base", { query_embedding: embedding, match_count: 10 }),
    sb.rpc("search_knowledge_bm25", { query_text: query, match_count: 10 }),
  ]);

  const vDocs: Doc[] = (vRes.data ?? []).map((d: Doc, i: number) => ({ ...d, _rank: i }));
  const bDocs: Doc[] = (bRes.data ?? []).map((d: Doc, i: number) => ({ ...d, _rank: i }));

  const scores = new Map<string, { doc: Doc; score: number }>();
  for (const [list, docs] of [[vDocs],[bDocs]] as [Doc[][], never]) {
    for (const arr of list) {
      // @ts-ignore - arr is actually the docs array
      (arr as Doc[]).forEach((d, i) => {
        const s = 1 / (RRF_K + i + 1);
        const ex = scores.get(d.id);
        ex ? (ex.score += s) : scores.set(d.id, { doc: d, score: s });
      });
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r, i) => {
      const m = r.doc.metadata ?? {};
      const hdr = [m.documento, m.secao].filter(Boolean).join(" – ");
      return `[Fonte ${i+1}${hdr ? ` | ${hdr}` : ""}]\n${r.doc.content}`;
    })
    .join("\n\n---\n\n");
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "").trim();
    const claims = decodeJwt(token);
    if (!claims?.sub || claims.role === "anon" || claims.role === "service_role") {
      // Check if token expired
      if (claims?.exp && claims.exp < Math.floor(Date.now() / 1000)) {
        return new Response(JSON.stringify({ error: "Token expirado. Faça login novamente." }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = claims.sub;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Parse body ───────────────────────────────────────────────────────────
    const { message, conversation_id, history = [] } = await req.json() as {
      message: string;
      conversation_id: string;
      history?: { role: string; content: string }[];
    };
    if (!message || !conversation_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Context: RAG + structured tables (parallel, fail-safe) ──────────────
    let ragContext = "";
    let tableCtx = "";

    try {
      const emb = await getEmbedding(message);
      ragContext = await hybridSearch(sb, message, emb);
    } catch (e) { console.error("RAG error:", e); }

    try {
      tableCtx = await tableSearch(sb, message);
    } catch (e) { console.error("Table search error:", e); }

    const context = [ragContext, tableCtx].filter(s => s.trim()).join("\n\n---\n\n");
    const hasCtx = context.trim().length > 0;

    // ── System prompt ────────────────────────────────────────────────────────
    const system = `Você é o ConstruSUS IA, assistente especializado em engenharia hospitalar pública e infraestrutura do SUS, desenvolvido pela Secretaria de Estado da Saúde de Goiás (SES-GO).

Bases de dados disponíveis: SINAPI Mar/2026 · SIGEM/RENEM Nov/2024 · SOMASUS Nov/2023 · RDC 50/2002 ANVISA.

${hasCtx
  ? `## DADOS ENCONTRADOS\n\n${context}\n\n## INSTRUÇÕES\n- Responda com base exclusivamente nos dados acima\n- Apresente tabelas Markdown para múltiplos itens com preços\n- Cite a fonte e data de referência (ex: "SIGEM Nov/2024")\n- Use português brasileiro correto e linguagem técnica`
  : `## INSTRUÇÃO\nNão foram encontrados dados específicos para esta consulta. Informe claramente ao usuário e sugira as fontes oficiais: SIGEM, SINAPI/CEF, SOMASUS/MS ou RDC 50/ANVISA. Não invente dados, preços ou normas.`}

Responda sempre em português brasileiro correto e formal.`;

    const openaiMessages = [
      { role: "system", content: system },
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    // ── Call OpenAI streaming ────────────────────────────────────────────────
    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: openaiMessages,
        stream: true,
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!oaRes.ok) {
      const err = await oaRes.text();
      console.error("OpenAI error:", oaRes.status, err);
      return new Response(JSON.stringify({ error: `OpenAI ${oaRes.status}` }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Stream to client ─────────────────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();

    // Persist user message (fire-and-forget)
    sb.from("messages").insert({
      conversation_id, role: "user", content: message, metadata: { user_id: userId },
    }).then(({ error }) => { if (error) console.error("msg insert:", error.message); });

    (async () => {
      const reader = oaRes.body!.getReader();
      const dec = new TextDecoder();
      let full = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as { choices: [{ delta: { content?: string } }] };
              const tok = parsed.choices[0]?.delta?.content ?? "";
              if (tok) {
                full += tok;
                await writer.write(enc.encode(`data: ${JSON.stringify({ content: tok })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      } catch (e) { console.error("Stream read error:", e); }
      finally {
        // Persist assistant response
        try {
          await sb.from("messages").insert({
            conversation_id, role: "assistant",
            content: full || "(sem resposta)",
            metadata: { model: CHAT_MODEL },
          });
          await sb.from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversation_id);
        } catch (e) { console.error("Persist error:", e); }
        try {
          await writer.write(enc.encode("data: [DONE]\n\n"));
          await writer.close();
        } catch { /* already closed */ }
      }
    })();

    return new Response(readable, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (err) {
    console.error("Handler error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
