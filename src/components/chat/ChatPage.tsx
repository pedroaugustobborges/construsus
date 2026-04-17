import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  Skeleton,
  Tooltip,
  Button,
  Chip,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Send,
  Add,
  Delete,
  Chat as ChatIcon,
  AutoAwesome,
  ContentCopy,
  ThumbUp,
} from '@mui/icons-material';
import { useAuth } from '@/hooks/useAuth';
import { useConversations, useMessages } from '@/hooks/useConversations';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types';
import { ChatMessage } from './ChatMessage';

const SUGGESTED_PROMPTS = [
  'Qual a metragem mínima para uma sala de observação de pronto-socorro segundo a RDC 50?',
  'Qual o custo médio por m² para construção de UTI adulta pelo SINAPI 2026?',
  'Quais são os requisitos normativos para uma sala de cirurgia geral?',
  'Como calcular o número de leitos necessários para uma UPA 24h?',
];

export function ChatPage() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { conversations, createConversation, deleteConversation } = useConversations(user?.id);
  const { messages, addMessage, updateLastMessage } = useMessages(activeConvId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  const handleNewChat = async () => {
    const conv = await createConversation('Nova Conversa');
    if (conv) setActiveConvId(conv.id);
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isAiLoading) return;

    let convId = activeConvId;
    if (!convId) {
      const title = content.length > 60 ? content.substring(0, 57) + '...' : content;
      const conv = await createConversation(title);
      if (!conv) return;
      convId = conv.id;
      setActiveConvId(convId);
    }

    setInput('');

    // Add user message to UI
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);

    // Add placeholder assistant message
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    addMessage(assistantMsg);
    setIsAiLoading(true);

    try {
      // Call the Supabase Edge Function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-ai`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content,
            conversation_id: convId,
            history: messages.slice(-6).map(m => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data) as { content?: string };
                if (parsed.content) {
                  fullContent += parsed.content;
                  updateLastMessage(fullContent);
                }
              } catch {
                // non-JSON chunk
              }
            }
          }
        }
      }

      // Update conversation title if it was the first message
      if (messages.length === 0) {
        const shortTitle = content.length > 60 ? content.substring(0, 57) + '...' : content;
        await supabase
          .from('conversations')
          .update({ title: shortTitle, updated_at: new Date().toISOString() })
          .eq('id', convId);
      }

    } catch (err) {
      console.error('Error calling AI:', err);
      updateLastMessage('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
      setSnackbar({ open: true, message: 'Erro ao conectar com a IA. Verifique sua conexão.', severity: 'error' });
    } finally {
      setIsAiLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteConversation = async () => {
    if (deleteDialogId) {
      await deleteConversation(deleteDialogId);
      if (activeConvId === deleteDialogId) {
        setActiveConvId(null);
      }
      setDeleteDialogId(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Conversation sidebar */}
      {!isMobile && (
        <Box
          sx={{
            width: 280,
            borderRight: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.paper',
          }}
        >
          <Box sx={{ p: 2 }}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<Add />}
              onClick={handleNewChat}
              sx={{ borderRadius: 2 }}
            >
              Nova Conversa
            </Button>
          </Box>
          <Divider />
          <List sx={{ flex: 1, overflow: 'auto', px: 1 }}>
            {conversations.length === 0 && (
              <ListItem>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', width: '100%', py: 2 }}>
                  Nenhuma conversa ainda
                </Typography>
              </ListItem>
            )}
            {conversations.map(conv => (
              <ListItem
                key={conv.id}
                disablePadding
                secondaryAction={
                  <Tooltip title="Excluir">
                    <IconButton
                      size="small"
                      onClick={e => { e.stopPropagation(); setDeleteDialogId(conv.id); }}
                      sx={{ opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 } }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton
                  selected={activeConvId === conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  sx={{ borderRadius: 1.5, mb: 0.25 }}
                >
                  <ChatIcon sx={{ mr: 1.5, fontSize: 16, color: 'text.secondary' }} />
                  <ListItemText
                    primary={conv.title}
                    primaryTypographyProps={{
                      fontSize: '0.8rem',
                      fontWeight: activeConvId === conv.id ? 600 : 400,
                      noWrap: true,
                    }}
                    secondary={new Date(conv.created_at).toLocaleDateString('pt-BR')}
                    secondaryTypographyProps={{ fontSize: '0.7rem' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Chat area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Chat header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <AutoAwesome sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={600}>
            {conversations.find(c => c.id === activeConvId)?.title ?? 'ConstruSUS IA'}
          </Typography>
          <Chip
            label="GPT-4o + RAG"
            size="small"
            sx={{ ml: 'auto', backgroundColor: 'primary.light', color: 'white', fontSize: '0.65rem' }}
          />
        </Box>

        {/* Messages area */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: { xs: 2, md: 4 },
            py: 3,
          }}
        >
          {!activeConvId && messages.length === 0 && (
            <WelcomeScreen
              userName={profile?.full_name?.split(' ')[0]}
              onPromptClick={p => { handleNewChat().then(() => handleSend(p)); }}
            />
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isLoading={isAiLoading && msg.role === 'assistant' && msg.content === '' && msg.id === messages[messages.length - 1]?.id}
            />
          ))}

          {isAiLoading && messages[messages.length - 1]?.content === '' && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="45%" />
              </Box>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>

        {/* Input area */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', maxWidth: 900, mx: 'auto' }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={6}
              placeholder="Faça uma pergunta sobre infraestrutura hospitalar, normas, custos..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAiLoading}
              variant="outlined"
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  backgroundColor: 'background.default',
                },
              }}
            />
            <Tooltip title="Enviar (Enter)">
              <span>
                <IconButton
                  color="primary"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isAiLoading}
                  sx={{
                    backgroundColor: 'primary.main',
                    color: 'white',
                    borderRadius: 2,
                    width: 44,
                    height: 44,
                    '&:hover': { backgroundColor: 'primary.dark' },
                    '&.Mui-disabled': { backgroundColor: 'action.disabledBackground' },
                  }}
                >
                  <Send fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
            Respostas baseadas em SINAPI, RDC 50, SIGEM e dados históricos SES-GO · Use Shift+Enter para nova linha
          </Typography>
        </Paper>
      </Box>

      {/* Delete dialog */}
      <Dialog open={Boolean(deleteDialogId)} onClose={() => setDeleteDialogId(null)}>
        <DialogTitle>Excluir conversa?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Esta ação não pode ser desfeita.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogId(null)}>Cancelar</Button>
          <Button color="error" onClick={handleDeleteConversation} variant="contained">
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function WelcomeScreen({
  userName,
  onPromptClick,
}: {
  userName?: string;
  onPromptClick: (p: string) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        gap: 3,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '20px',
          backgroundColor: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AutoAwesome sx={{ fontSize: 36, color: 'white' }} />
      </Box>

      <Box>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Olá{userName ? `, ${userName}` : ''}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500 }}>
          Sou o <strong>ConstruSUS IA</strong>, seu assistente especializado em planejamento e
          infraestrutura hospitalar pública. Posso ajudar com normas, custos, análises e
          planejamento de obras.
        </Typography>
      </Box>

      <Box sx={{ width: '100%', maxWidth: 700 }}>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
          Sugestões de perguntas
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.5,
            mt: 1,
          }}
        >
          {SUGGESTED_PROMPTS.map((prompt, i) => (
            <Paper
              key={i}
              variant="outlined"
              onClick={() => onPromptClick(prompt)}
              sx={{
                p: 2,
                cursor: 'pointer',
                borderRadius: 2,
                textAlign: 'left',
                transition: 'all 0.15s',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'action.hover',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <Typography variant="body2" color="text.primary">
                {prompt}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
