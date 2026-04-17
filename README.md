# ConstruSUS IA

**Assistente Virtual Inteligente para Planejamento e Manutenção de Infraestrutura em Saúde**

Desenvolvido para a **Secretaria de Estado da Saúde de Goiás (SES-GO)**, o ConstruSUS IA é um assistente conversacional baseado em IA (GPT-4o + RAG avançado) para apoiar gestores do SUS no planejamento, manutenção e orçamento de infraestrutura hospitalar.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + Vite + TypeScript + Material UI v7 |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| IA | OpenAI GPT-4o + text-embedding-3-small |
| Busca | pgvector (HNSW) + BM25 (tsvector) |
| Deploy | Vercel (frontend) + Supabase Cloud |

---

## Instalação e Execução Local

### Pré-requisitos
- Node.js 18+
- Conta no Supabase (projeto configurado)
- Chave da API OpenAI

### 1. Clone e instale dependências
```bash
git clone <repo>
cd construsus
npm install
```

### 2. Configure as variáveis de ambiente
```bash
cp .env.example .env.local
```

Edite `.env.local`:
```env
VITE_SUPABASE_URL=https://acsxqngqcmqxgtvuttbe.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. Configure o banco de dados
Execute o script SQL no painel do Supabase (SQL Editor):
```
supabase/migrations/001_initial_schema.sql
```

### 4. Configure as Edge Functions
No painel do Supabase > Edge Functions > Secrets, adicione:
```
OPENAI_API_KEY = sk-proj-...
```

### 5. Crie o usuário administrador inicial
No Supabase > Authentication > Users, crie o usuário `pedroaugustobborges@gmail.com`, depois execute no SQL Editor:
```sql
UPDATE public.profiles 
SET role = 'admin', 
    full_name = 'Pedro Borges', 
    cpf = '03723880193'
WHERE email = 'pedroaugustobborges@gmail.com';
```

### 6. Popule a base de conhecimento
```bash
# Configure as variáveis adicionais
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
export OPENAI_API_KEY="sk-proj-..."

# Execute o script de população (RDC 50 + SINAPI)
npm run populate-kb
```

### 7. Importe os dados SINAPI/SIGEM
```bash
npm install xlsx
npx tsx scripts/import-sinapi.ts
```

### 8. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

Acesse: `http://localhost:5173`

---

## Deploy no Vercel

1. Faça push do código para um repositório GitHub
2. No Vercel, importe o projeto
3. Configure as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy! O `vercel.json` já está configurado para SPA routing.

---

## Estrutura do Projeto

```
construsus/
├── src/
│   ├── components/
│   │   ├── auth/          # Tela de login
│   │   ├── chat/          # Interface de chat com IA
│   │   ├── dashboard/     # Painel principal
│   │   ├── knowledge/     # SINAPI, SIGEM, SOMASUS, Investimentos
│   │   ├── layout/        # AppBar + Drawer (navegação)
│   │   └── users/         # Gestão de usuários
│   ├── hooks/             # useAuth, useConversations
│   ├── lib/               # Supabase client
│   ├── theme/             # Tema MUI (cores SUS)
│   └── types/             # TypeScript types
├── supabase/
│   ├── functions/
│   │   ├── chat-with-ai/  # Edge Function – Pipeline RAG completo
│   │   └── admin-create-user/  # Edge Function – Criar usuários
│   └── migrations/
│       └── 001_initial_schema.sql  # Schema completo
├── scripts/
│   ├── populate-knowledge-base.ts  # Popular RAG com RDC 50 + SINAPI
│   └── import-sinapi.ts            # Importar Excel SINAPI/SIGEM
└── vercel.json
```

---

## Pipeline RAG (Arquitetura da IA)

O fluxo de resposta do ConstruSUS IA segue 10 etapas:

```
Pergunta do usuário
        ↓
1. Gerar embedding (text-embedding-3-small)
2. Extração de filtros de metadados (RDC 50, SINAPI, UTI...)
3. Expansão de consulta (2 variações via GPT-4o-mini)
4. Busca Híbrida:
   ├── Busca Vetorial (HNSW cosine, Top-20)
   └── Busca BM25 (tsvector PostgreSQL, Top-20)
5. Fusão RRF (Reciprocal Rank Fusion, k=60)
6. Re-ranking Cross-Encoder (GPT-4o-mini, Top-5)
7. Montagem do System Prompt com contexto
8. Geração GPT-4o (streaming)
9. Persistência (Supabase messages)
10. Resposta ao usuário
```

---

## Funcionalidades

| Feature | Status |
|---------|--------|
| Login com Supabase Auth | ✅ |
| Chat conversacional com IA | ✅ |
| RAG avançado (híbrido, re-ranking) | ✅ |
| Histórico de conversas | ✅ |
| Dashboard com KPIs | ✅ |
| Tabela SINAPI | ✅ |
| Tabela SIGEM | ✅ |
| SOMASUS (link externo) | ✅ |
| Investimentos SES-GO | ✅ |
| Base de Conhecimento (viewer) | ✅ |
| Gestão de usuários (admin) | ✅ |
| Streaming de respostas | ✅ |
| Responsivo (mobile) | ✅ |

---

## Bases de Dados Integradas

- **RDC 50/2002 (ANVISA)**: Normas de projetos físicos de EAS
- **SINAPI (Mar/2026)**: Custos de construção civil (GO)
- **SIGEM**: Preços de equipamentos médico-hospitalares
- **SOMASUS**: Link externo ao Ministério da Saúde
- **Investimentos SES-GO**: Histórico de investimentos

---

## Segurança

- Row Level Security (RLS) em todas as tabelas
- Chave OpenAI nunca exposta no frontend (Edge Function)
- Autenticação JWT via Supabase Auth
- Permissões por papel: `admin` e `user`

---

## Desenvolvido por
SES-GO – Secretaria de Estado da Saúde de Goiás
