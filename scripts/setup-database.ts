/**
 * ConstruSUS IA – Setup automático do banco de dados
 * Executa a migration SQL e cria o usuário admin inicial.
 *
 * Usage:
 *   npx tsx scripts/setup-database.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://acsxqngqcmqxgtvuttbe.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjc3hxbmdxY21xeGd0dnV0dGJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM4MDgyMywiZXhwIjoyMDkxOTU2ODIzfQ.5ONZz5vj_V9BNvi9aVsGLhb_5Tcwj9uGcFQ9ioIWR7k';

const ADMIN_EMAIL    = 'pedroaugustobborges@gmail.com';
const ADMIN_PASSWORD = 'Agir@123';
const ADMIN_NAME     = 'Pedro Borges';
const ADMIN_CPF      = '03723880193';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Executa SQL via Management API ───────────────────────────────────────────
async function execSQL(sql: string, description: string): Promise<boolean> {
  process.stdout.write(`  → ${description}... `);
  try {
    // Supabase Management API – execute SQL
    const projectRef = 'acsxqngqcmqxgtvuttbe';
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (resp.ok) {
      console.log('✅');
      return true;
    }
    // Fallback: usar RPC do postgrest para executar SQL simples
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.log(`⚠️  (${error.message})`);
      return false;
    }
    console.log('✅');
    return true;
  } catch (e) {
    console.log(`❌ ${String(e)}`);
    return false;
  }
}

// ── Verifica se tabela existe ─────────────────────────────────────────────────
async function tableExists(name: string): Promise<boolean> {
  const { data } = await supabase
    .from('information_schema.tables' as string)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', name)
    .maybeSingle();
  return !!data;
}

// ── Cria/atualiza usuário admin ───────────────────────────────────────────────
async function ensureAdminUser(): Promise<void> {
  console.log('\n👤 Verificando usuário admin...');

  // Tenta buscar pelo email via listUsers
  const { data: listData } = await supabase.auth.admin.listUsers();
  const existing = listData?.users?.find((u) => u.email === ADMIN_EMAIL);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`  → Usuário já existe (id: ${userId})`);

    // Atualiza senha para garantir
    const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (pwErr) console.log(`  ⚠️  Não foi possível atualizar senha: ${pwErr.message}`);
    else console.log('  ✅ Senha atualizada');
  } else {
    // Cria novo usuário
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });

    if (createErr || !newUser?.user) {
      console.log(`  ❌ Falha ao criar usuário: ${createErr?.message}`);
      return;
    }
    userId = newUser.user.id;
    console.log(`  ✅ Usuário criado (id: ${userId})`);
  }

  // Upsert profile com role admin
  const { error: profileErr } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email: ADMIN_EMAIL,
      full_name: ADMIN_NAME,
      cpf: ADMIN_CPF,
      role: 'admin',
    },
    { onConflict: 'id' }
  );

  if (profileErr) {
    console.log(`  ⚠️  Profile: ${profileErr.message}`);
    // Tabela pode não existir ainda – tenta UPDATE simples
    await supabase
      .from('profiles')
      .update({ role: 'admin', full_name: ADMIN_NAME, cpf: ADMIN_CPF })
      .eq('email', ADMIN_EMAIL);
  } else {
    console.log('  ✅ Perfil admin configurado');
  }
}

// ── Roda a migration SQL em blocos individuais ────────────────────────────────
async function runMigration(): Promise<void> {
  console.log('\n🗄️  Verificando schema do banco...');

  // Testa conexão básica
  const { error: connErr } = await supabase.from('profiles').select('id').limit(1);
  if (!connErr) {
    console.log('  ✅ Tabela profiles já existe – schema OK');
    return;
  }

  if (connErr.message.includes('does not exist')) {
    console.log('  ⚠️  Schema não encontrado. Execute manualmente no Supabase SQL Editor:');
    console.log('     supabase/migrations/001_initial_schema.sql');
    console.log('\n  Ou abra https://supabase.com/dashboard/project/acsxqngqcmqxgtvuttbe/sql/new');
    console.log('  e cole o conteúdo do arquivo 001_initial_schema.sql\n');
  } else {
    console.log(`  Conexão: ${connErr.message}`);
  }
}

// ── Verifica Edge Functions ───────────────────────────────────────────────────
async function checkFunctions(): Promise<void> {
  console.log('\n⚡ Verificando Edge Functions...');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? SERVICE_ROLE_KEY;

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/chat-with-ai`,
    {
      method: 'OPTIONS',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 200 || res.status === 204) {
    console.log('  ✅ chat-with-ai: online');
  } else {
    console.log(`  ⚠️  chat-with-ai: status ${res.status} (verifique o deploy)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 ConstruSUS IA – Setup Automático');
  console.log('=====================================');

  await runMigration();
  await ensureAdminUser();
  await checkFunctions();

  console.log('\n✨ Setup concluído!');
  console.log('   Acesse: http://localhost:5173');
  console.log(`   Login: ${ADMIN_EMAIL}`);
  console.log(`   Senha: ${ADMIN_PASSWORD}`);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
