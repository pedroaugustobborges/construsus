/**
 * ConstruSUS IA – Importação Completa de Dados
 * SINAPI Insumos + Composições + SIGEM + SOMASUS Policlínica
 *
 * Usage:  npm run import-data
 *
 * Requer: npm install xlsx (já instalado)
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Carrega .env.local ────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SERVICE_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrado no .env.local'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH = 300;
const DATA_REF_SINAPI  = '2026-03';
const DATA_REF_SIGEM   = '2024-11';
const DATA_REF_SOMASUS = '2023-11';

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseFloat2(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const n = parseFloat(String(v).replace(/[R$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ');
}

function hierarquiaNivel(h: string): number {
  return h.trim().split('.').filter(Boolean).length;
}

async function truncateAndInsert<T extends object>(table: string, rows: T[]) {
  // Truncate via delete-all (service role bypasses RLS)
  const { error: delErr } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) console.warn(`  ⚠️  Truncate ${table}: ${delErr.message}`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(batch);
    if (error) console.error(`  ⚠️  ${table} batch ${i}: ${error.message}`);
    else process.stdout.write(`  → ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SINAPI INSUMOS (ISD – Sem Desoneração, foco GO)
// Colunas header (linha 10 = índice 9):
//   0=Classif, 1=Código, 2=Descrição, 3=Unidade, 4=Origem,
//   5=AC,6=AL,7=AM,8=AP,9=BA,10=CE,11=DF,12=ES,13=GO,...,28=SC,29=SP,30=TO
// ─────────────────────────────────────────────────────────────────────────────
async function importSinapiInsumos() {
  const file = path.join(ROOT, 'SINAPI_Referência_2026_03.xlsx');
  if (!fs.existsSync(file)) { console.log('⚠️  SINAPI_Referência não encontrado'); return; }

  console.log('\n📊 SINAPI Insumos (ISD)...');
  const wb = XLSX.readFile(file, { cellFormula: false });
  const ws = wb.Sheets['ISD'];
  if (!ws) { console.log('⚠️  Aba ISD não encontrada'); return; }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  // Header na linha 10 (índice 9): verifica
  // Dados a partir da linha 11 (índice 10)

  type Row = {
    codigo: number; descricao: string; classificacao: string | null;
    unidade: string | null; origem_preco: string | null;
    preco_go: number | null; preco_sp: number | null; preco_df: number | null;
    data_referencia: string;
  };

  const rows: Row[] = [];

  for (let i = 10; i < data.length; i++) {
    const r = data[i] as unknown[];
    const classif = cleanStr(r[0]);
    const codigo  = typeof r[1] === 'number' ? r[1] : parseInt(String(r[1]));
    const descr   = cleanStr(r[2]);

    // Pula linhas de metadados / vazias
    if (!classif || !descr || isNaN(codigo) || codigo <= 0) continue;
    if (classif.startsWith('Acessar') || classif.startsWith('Preço')) continue;

    rows.push({
      codigo,
      descricao:    descr,
      classificacao: classif || null,
      unidade:      cleanStr(r[3]) || null,
      origem_preco: cleanStr(r[4]) || null,
      preco_go:     parseFloat2(r[13]),   // GO = índice 13
      preco_df:     parseFloat2(r[11]),   // DF = índice 11
      preco_sp:     parseFloat2(r[29]),   // SP = índice 29
      data_referencia: DATA_REF_SINAPI,
    });
  }

  console.log(`  Total: ${rows.length} insumos`);
  await truncateAndInsert('sinapi_insumos', rows);
  console.log('  ✅ Insumos importados');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SINAPI COMPOSIÇÕES (CSD – Sem Desoneração, foco GO)
// Colunas header (linha 10 = índice 9):
//   0=Grupo, 1=Código, 2=Descrição, 3=Unidade,
//   4=AC_custo,5=AC_%AS, 6=AL_custo,7=AL_%AS, ...
//   20=GO_custo, 21=GO_%AS, ..., 58=SP_custo, 59=SP_%AS
// ─────────────────────────────────────────────────────────────────────────────
async function importSinapiComposicoes() {
  const file = path.join(ROOT, 'SINAPI_Referência_2026_03.xlsx');
  if (!fs.existsSync(file)) return;

  console.log('\n📊 SINAPI Composições (CSD)...');
  const wb = XLSX.readFile(file, { cellFormula: false });
  const ws = wb.Sheets['CSD'];
  if (!ws) { console.log('⚠️  Aba CSD não encontrada'); return; }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  type Row = {
    codigo: string | null; descricao: string; grupo: string | null;
    unidade: string | null; custo_go: number | null; pct_as_go: number | null;
    custo_sp: number | null; data_referencia: string;
  };

  const rows: Row[] = [];

  for (let i = 10; i < data.length; i++) {
    const r = data[i] as unknown[];
    const grupo  = cleanStr(r[0]);
    const codigo = r[1];
    const descr  = cleanStr(r[2]);

    if (!grupo || !descr) continue;
    if (grupo.startsWith('Observ') || grupo.startsWith('compos')) continue;

    // Código pode ser 0 (template) ou número real
    const codigoStr = (typeof codigo === 'number' && codigo > 0)
      ? String(codigo)
      : null;

    rows.push({
      codigo:          codigoStr,
      descricao:       descr,
      grupo:           grupo || null,
      unidade:         cleanStr(r[3]) || null,
      custo_go:        parseFloat2(r[20]),   // GO custo
      pct_as_go:       parseFloat2(r[21]),   // GO %AS
      custo_sp:        parseFloat2(r[58]),   // SP custo (índice 58)
      data_referencia: DATA_REF_SINAPI,
    });
  }

  console.log(`  Total: ${rows.length} composições`);
  await truncateAndInsert('sinapi_composicoes', rows);
  console.log('  ✅ Composições importadas');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SIGEM – Equipamentos RENEM
// Header linha 2 (índice 1): Cod.Item, Item, Definição, Classificação, R$ Valor, Dolarizado, Especificação
// Dados a partir da linha 3 (índice 2)
// ─────────────────────────────────────────────────────────────────────────────
async function importSigem() {
  const file = path.join(ROOT, 'SIGEM.xlsx');
  if (!fs.existsSync(file)) { console.log('⚠️  SIGEM.xlsx não encontrado'); return; }

  console.log('\n📊 SIGEM Equipamentos...');
  const wb = XLSX.readFile(file, { cellFormula: false });
  const ws = wb.Sheets['Renem_07.11.2024'] ?? wb.Sheets[wb.SheetNames[0]];

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  // Linha 1 (índice 0) = info geral, linha 2 (índice 1) = header, dados de índice 2

  type Row = {
    codigo: string; nome: string; definicao: string | null;
    classificacao: string | null; valor_sugerido: number | null;
    dolarizado: boolean; especificacao: string | null;
    data_referencia: string;
  };

  const rows: Row[] = [];

  for (let i = 2; i < data.length; i++) {
    const r = data[i] as unknown[];
    const codigo = cleanStr(r[0]);
    const nome   = cleanStr(r[1]);
    if (!codigo || !nome) continue;

    rows.push({
      codigo,
      nome,
      definicao:       cleanStr(r[2]) || null,
      classificacao:   cleanStr(r[3]) || null,
      valor_sugerido:  parseFloat2(r[4]),
      dolarizado:      String(r[5]).toLowerCase().includes('sim'),
      especificacao:   cleanStr(r[6]) || null,
      data_referencia: DATA_REF_SIGEM,
    });
  }

  console.log(`  Total: ${rows.length} equipamentos`);
  await truncateAndInsert('sigem_equipamentos', rows);
  console.log('  ✅ SIGEM importado');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOMASUS – Policlínica ORC. SINTÉTICO
// Colunas (dados a partir de linha 18, índice 17):
//   [0]=vazio, [1]=Item hierárquico, [2]=Código, [3]=Banco, [4]=Descrição, [5]=Und, [6]=Quant.
// ─────────────────────────────────────────────────────────────────────────────
async function importSomasus() {
  const file = path.join(
    ROOT, 'XLS', 'Planilha Orçamentária_excel',
    'MS_POLI_PLANILHA DE ORÇAMENTO_SEM DESONERAÇÃO_TEMPLATE.xlsx'
  );
  if (!fs.existsSync(file)) { console.log('⚠️  Arquivo SOMASUS não encontrado em XLS/'); return; }

  console.log('\n📊 SOMASUS Policlínica...');
  const wb = XLSX.readFile(file, { cellFormula: false });
  const ws = wb.Sheets['ORC. SINTÉTICO'];
  if (!ws) { console.log('⚠️  Aba ORC. SINTÉTICO não encontrada'); return; }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  type Row = {
    hierarquia: string; nivel: number; codigo: string | null;
    banco: string | null; descricao: string; unidade: string | null;
    quantidade: number | null; tipo_linha: 'secao' | 'item';
    grupo_principal: string | null; subgrupo: string | null;
    tipologia: string; area_construida: number;
    data_referencia: string;
  };

  const rows: Row[] = [];
  let grupoPrincipal: string | null = null;
  let subgrupo: string | null = null;

  for (let i = 17; i < data.length; i++) {
    const r = data[i] as unknown[];
    // col 1 = hierarquia/item, col 2 = código, col 3 = banco, col 4 = descrição
    const itemStr  = cleanStr(r[1]);
    const codigoR  = cleanStr(r[2]);
    const bancoR   = cleanStr(r[3]);
    const descrR   = cleanStr(r[4]);
    const undR     = cleanStr(r[5]);
    const qtdR     = r[6];

    if (!itemStr && !descrR) continue;

    // Determine se é seção ou item
    const temCodigo = codigoR !== '' && codigoR !== 'Código';
    const nivel     = hierarquiaNivel(itemStr);

    // Normaliza hierarquia
    const hierarquia = itemStr.replace(/\s+/g, '');

    if (!temCodigo) {
      // É uma seção/subseção
      if (nivel === 1) grupoPrincipal = descrR;
      if (nivel === 2) subgrupo = descrR;

      rows.push({
        hierarquia,
        nivel: nivel || 1,
        codigo:          null,
        banco:           null,
        descricao:       descrR || codigoR, // Às vezes a descrição está na col código
        unidade:         null,
        quantidade:      null,
        tipo_linha:      'secao',
        grupo_principal: grupoPrincipal,
        subgrupo:        nivel >= 2 ? subgrupo : null,
        tipologia:       'POLICLINICA',
        area_construida: 3213.00,
        data_referencia: DATA_REF_SOMASUS,
      });
    } else {
      // É um item com código
      rows.push({
        hierarquia,
        nivel,
        codigo:          codigoR,
        banco:           bancoR || null,
        descricao:       descrR,
        unidade:         undR || null,
        quantidade:      parseFloat2(qtdR),
        tipo_linha:      'item',
        grupo_principal: grupoPrincipal,
        subgrupo,
        tipologia:       'POLICLINICA',
        area_construida: 3213.00,
        data_referencia: DATA_REF_SOMASUS,
      });
    }
  }

  console.log(`  Total: ${rows.length} linhas (seções + itens)`);
  await truncateAndInsert('somasus_orcamento', rows);
  console.log('  ✅ SOMASUS importado');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏗️  ConstruSUS IA – Importação de Dados');
  console.log('========================================\n');
  console.log('📌 Verifique que o SQL da migration 002 foi executado no Supabase!');
  console.log('   (supabase/migrations/002_data_tables.sql)\n');

  await importSinapiInsumos();
  await importSinapiComposicoes();
  await importSigem();
  await importSomasus();

  console.log('\n✅ Importação concluída!');

  // Resumo
  const tables = ['sinapi_insumos','sinapi_composicoes','sigem_equipamentos','somasus_orcamento'];
  console.log('\n📊 Contagem final:');
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`   ${t}: ${count?.toLocaleString('pt-BR') ?? 0} linhas`);
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
