export type UserRole = 'admin' | 'user';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  cpf?: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    documento: string;
    titulo?: string;
    ano?: number;
    tema?: string;
    pagina?: string;
    secao?: string;
  };
  created_at: string;
}

export interface CostReference {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  fonte: string;
  estado: string;
  data_referencia: string;
  categoria?: string;
  created_at: string;
}

export interface SinapiInsumo {
  id: string;
  codigo: number;
  descricao: string;
  classificacao: string | null;
  unidade: string | null;
  origem_preco: string | null;
  preco_go: number | null;
  preco_sp: number | null;
  preco_df: number | null;
  data_referencia: string;
}

export interface SinapiComposicao {
  id: string;
  codigo: string | null;
  descricao: string;
  grupo: string | null;
  unidade: string | null;
  custo_go: number | null;
  pct_as_go: number | null;
  custo_sp: number | null;
  data_referencia: string;
}

export interface SigemEquipamento {
  id: string;
  codigo: string;
  nome: string;
  definicao: string | null;
  classificacao: string | null;
  valor_sugerido: number | null;
  dolarizado: boolean;
  especificacao: string | null;
  data_referencia: string;
}

export interface SomasusLinha {
  id: string;
  hierarquia: string;
  nivel: number;
  codigo: string | null;
  banco: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  tipo_linha: 'secao' | 'item';
  grupo_principal: string | null;
  subgrupo: string | null;
  tipologia: string;
  area_construida: number;
  data_referencia: string;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
}
