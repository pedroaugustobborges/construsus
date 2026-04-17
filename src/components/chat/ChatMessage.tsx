import { useState } from 'react';
import {
  Box,
  Avatar,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  SmartToy,
  Person,
  ContentCopy,
  Check,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/types';

interface ChatMessageProps {
  message: Message;
  isLoading?: boolean;
}

export function ChatMessage({ message, isLoading }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setSnackOpen(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading && message.content === '') {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, alignItems: 'flex-start' }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
          <SmartToy sx={{ fontSize: 18 }} />
        </Avatar>
        <Box sx={{ flex: 1, maxWidth: 700 }}>
          <Skeleton variant="text" width="65%" height={20} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="82%" height={20} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="50%" height={20} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        mb: 3,
        alignItems: 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <Avatar
        sx={{
          bgcolor: isUser ? 'secondary.main' : 'primary.main',
          width: 36,
          height: 36,
          flexShrink: 0,
        }}
      >
        {isUser ? (
          <Person sx={{ fontSize: 18 }} />
        ) : (
          <SmartToy sx={{ fontSize: 18 }} />
        )}
      </Avatar>

      <Box
        sx={{
          maxWidth: { xs: '85%', md: 700 },
          position: 'relative',
          '&:hover .msg-actions': { opacity: 1 },
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            backgroundColor: isUser ? 'primary.main' : 'background.paper',
            border: isUser ? 'none' : '1px solid',
            borderColor: 'divider',
            boxShadow: isUser ? '0 2px 8px rgba(0,97,155,0.2)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          {isUser ? (
            <Typography variant="body1" sx={{ color: 'white', whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <Box
              sx={{
                '& p': { margin: '0 0 0.75em 0', '&:last-child': { margin: 0 } },
                '& h1, & h2, & h3, & h4': { mt: 1.5, mb: 0.5 },
                '& ul, & ol': { pl: 2.5, mb: 0.75 },
                '& li': { mb: 0.25 },
                '& code': {
                  backgroundColor: 'rgba(0,97,155,0.08)',
                  borderRadius: 1,
                  px: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.85em',
                },
                '& pre': {
                  backgroundColor: '#1A2332',
                  borderRadius: 2,
                  p: 2,
                  overflow: 'auto',
                  '& code': {
                    backgroundColor: 'transparent',
                    color: '#E2E8F0',
                  },
                },
                '& table': {
                  width: '100%',
                  borderCollapse: 'collapse',
                  mb: 1,
                  '& th, & td': {
                    border: '1px solid',
                    borderColor: 'divider',
                    p: '6px 12px',
                    fontSize: '0.85rem',
                  },
                  '& th': {
                    backgroundColor: 'primary.main',
                    color: 'white',
                  },
                  '& tr:nth-of-type(even) td': {
                    backgroundColor: 'rgba(0,97,155,0.04)',
                  },
                },
                '& blockquote': {
                  borderLeft: '3px solid',
                  borderColor: 'primary.main',
                  pl: 2,
                  ml: 0,
                  color: 'text.secondary',
                },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </Box>
          )}
        </Box>

        {/* Message actions */}
        {!isUser && message.content && (
          <Box
            className="msg-actions"
            sx={{
              display: 'flex',
              gap: 0.5,
              mt: 0.5,
              opacity: 0,
              transition: 'opacity 0.15s',
            }}
          >
            <Tooltip title={copied ? 'Copiado!' : 'Copiar'}>
              <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
                {copied ? (
                  <Check sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <ContentCopy sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Timestamp */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.25, textAlign: isUser ? 'right' : 'left' }}
        >
          {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Box>

      <Snackbar
        open={snackOpen}
        autoHideDuration={2000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
          Mensagem copiada!
        </Alert>
      </Snackbar>
    </Box>
  );
}
