/**
 * ConstruSUS IA – SINAPI Excel Import Script
 *
 * Imports SINAPI Excel data into the cost_references table.
 * Also generates knowledge_base chunks for the RAG system.
 *
 * Usage:
 *   npm install xlsx
 *   SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... npx tsx scripts/import-sinapi.ts
 *
 * Files expected:
 *   - SINAPI_Referência_2026_03.xlsx  → custo unitário de composições
 *   - SINAPI_mao_de_obra_2026_03.xlsx → custo de mão de obra
 *   - SINAPI_familias_e_coeficientes_2026_03.xlsx → composições analíticas
 */

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://acsxqngqcmqxgtvuttbe.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATA_REF = "2026-03";
const ESTADO = "GO";
const BATCH_SIZE = 500;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface SinapiRow {
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  categoria: string;
}

function parseExcelFloat(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[R$\s.]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function processReferenciasSheet(filePath: string): SinapiRow[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  File not found: ${filePath}`);
    return [];
  }

  const workbook = XLSX.readFile(filePath);
  const rows: SinapiRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    for (const row of data) {
      // Try to identify columns by common SINAPI headers
      const codigo = String(
        row["CÓDIGO"] ?? row["Código"] ?? row["codigo"] ?? row["COD"] ?? ""
      ).trim();
      const descricao = String(
        row["DESCRIÇÃO"] ?? row["Descrição"] ?? row["DESCRICAO"] ?? row["descricao"] ?? ""
      ).trim();
      const unidade = String(
        row["UNIDADE"] ?? row["Unidade"] ?? row["UN"] ?? ""
      ).trim();
      const precoRaw =
        row["PREÇO UNITÁRIO"] ??
        row["CUSTO UNITÁRIO"] ??
        row["Preço com Desoneração"] ??
        row["Preço sem Desoneração"] ??
        row["VALOR"] ??
        0;
      const preco = parseExcelFloat(precoRaw);

      if (!codigo || !descricao || preco <= 0) continue;

      rows.push({
        codigo,
        descricao,
        unidade: unidade || "UN",
        preco_unitario: preco,
        categoria: sheetName,
      });
    }
  }

  return rows;
}

async function insertBatch(rows: SinapiRow[], fonte: string): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      unidade: r.unidade,
      preco_unitario: r.preco_unitario,
      fonte,
      estado: ESTADO,
      data_referencia: DATA_REF,
      categoria: r.categoria,
    }));

    const { error, count } = await supabase
      .from("cost_references")
      .upsert(batch, { onConflict: "codigo,fonte,estado,data_referencia" })
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error(`  ❌ Batch error:`, error.message);
    } else {
      inserted += count ?? batch.length;
      process.stdout.write(`  → ${inserted}/${rows.length} rows...\r`);
    }
  }
  return inserted;
}

async function main() {
  console.log("🏗️  ConstruSUS IA – SINAPI Import");
  console.log("==================================\n");

  const projectRoot = path.join(__dirname, "..");
  const files = {
    referencia: path.join(projectRoot, "SINAPI_Referência_2026_03.xlsx"),
    maodeobra: path.join(projectRoot, "SINAPI_mao_de_obra_2026_03.xlsx"),
    familias: path.join(projectRoot, "SINAPI_familias_e_coeficientes_2026_03.xlsx"),
    manutencoes: path.join(projectRoot, "SINAPI_Manutenções_2026_03.xlsx"),
  };

  let totalInserted = 0;

  for (const [type, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${type}: file not found at ${filePath}`);
      continue;
    }

    console.log(`📊 Importing ${path.basename(filePath)}...`);
    const rows = processReferenciasSheet(filePath);
    console.log(`   Found ${rows.length} rows`);

    if (rows.length > 0) {
      const inserted = await insertBatch(rows, "SINAPI");
      totalInserted += inserted;
      console.log(`\n   ✅ Inserted/updated ${inserted} rows`);
    }
  }

  console.log(`\n🎉 Import complete! Total: ${totalInserted} rows`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
