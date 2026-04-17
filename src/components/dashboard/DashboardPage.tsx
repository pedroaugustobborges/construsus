import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Skeleton,
  Divider,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Button,
} from '@mui/material';
import {
  Chat as ChatIcon,
  TrendingUp,
  Construction,
  LibraryBooks,
  SmartToy,
  ArrowForward,
  CalendarToday,
  Update,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Conversation } from '@/types';

export function DashboardPage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState({ totalChats: 0, totalMessages: 0, knowledgeChunks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const [convsRes, msgRes, kbRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(3),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in(
            'conversation_id',
            (await supabase.from('conversations').select('id').eq('user_id', user.id)).data?.map(c => c.id) ?? []
          ),
        supabase.from('knowledge_base').select('id', { count: 'exact', head: true }),
      ]);

      setRecentConversations((convsRes.data ?? []) as Conversation[]);
      setStats({
        totalChats: convsRes.data?.length ?? 0,
        totalMessages: msgRes.count ?? 0,
        knowledgeChunks: kbRes.count ?? 0,
      });
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const statCards = [
    {
      label: 'Total de Conversas',
      value: stats.totalChats,
      icon: <ChatIcon />,
      color: '#00619B',
      bgColor: 'rgba(0,97,155,0.08)',
    },
    {
      label: 'Mensagens Trocadas',
      value: stats.totalMessages,
      icon: <TrendingUp />,
      color: '#00875A',
      bgColor: 'rgba(0,135,90,0.08)',
    },
    {
      label: 'Chunks na Base de Conhecimento',
      value: stats.knowledgeChunks,
      icon: <LibraryBooks />,
      color: '#ED6C02',
      bgColor: 'rgba(237,108,2,0.08)',
    },
  ];

  const quickActions = [
    {
      title: 'Nova Consulta IA',
      description: 'Faça perguntas sobre normas, custos e planejamento',
      icon: <SmartToy />,
      color: 'primary',
      onClick: () => navigate('/chat'),
    },
    {
      title: 'Consultar SINAPI',
      description: 'Tabela de referência de custos atualizada',
      icon: <Construction />,
      color: 'secondary',
      onClick: () => navigate('/sinapi'),
    },
    {
      title: 'Base de Conhecimento',
      description: 'Documentos normativos indexados (RDC 50, SIGEM)',
      icon: <LibraryBooks />,
      color: 'warning',
      onClick: () => navigate('/knowledge'),
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Olá, {profile?.full_name?.split(' ')[0] ?? 'Gestor'}!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CalendarToday sx={{ fontSize: 16 }} />
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
      </Box>

      {/* Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat, i) => (
          <Grid key={i} size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: stat.bgColor, color: stat.color, width: 48, height: 48 }}>
                  {stat.icon}
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight={700} color={stat.color}>
                    {loading ? <Skeleton width={60} /> : stat.value.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Quick actions */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Acesso Rápido
              </Typography>
              <Grid container spacing={2}>
                {quickActions.map((action, i) => (
                  <Grid key={i} size={{ xs: 12, sm: 4 }}>
                    <Card
                      variant="outlined"
                      sx={{
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          boxShadow: '0 2px 12px rgba(0,97,155,0.15)',
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      <CardActionArea onClick={action.onClick} sx={{ p: 2 }}>
                        <Avatar
                          sx={{
                            bgcolor: `${action.color}.main`,
                            mb: 1.5,
                            width: 44,
                            height: 44,
                          }}
                        >
                          {action.icon}
                        </Avatar>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                          {action.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {action.description}
                        </Typography>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>

          {/* Suggested prompt */}
          <Card sx={{ mt: 3, border: '1px solid', borderColor: 'primary.light', background: 'linear-gradient(135deg, rgba(0,97,155,0.04) 0%, rgba(0,135,90,0.04) 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <SmartToy sx={{ color: 'primary.main', fontSize: 18 }} />
                <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                  Sugestão de Consulta
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                "Considerando a RDC 50, qual a metragem mínima para uma sala de observação de
                pronto-socorro e qual o custo médio por m² para construí-la baseado no SINAPI de 2026?"
              </Typography>
              <Button
                variant="contained"
                size="small"
                endIcon={<ArrowForward />}
                onClick={() => navigate('/chat')}
              >
                Perguntar ao ConstruSUS IA
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent conversations */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  Últimas Conversas
                </Typography>
                <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/chat')}>
                  Ver todas
                </Button>
              </Box>

              {loading ? (
                <Box>
                  {[1, 2, 3].map(i => (
                    <Box key={i} sx={{ mb: 2 }}>
                      <Skeleton variant="text" width="70%" />
                      <Skeleton variant="text" width="40%" />
                    </Box>
                  ))}
                </Box>
              ) : recentConversations.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ChatIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma conversa ainda.
                  </Typography>
                  <Button
                    variant="text"
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => navigate('/chat')}
                  >
                    Iniciar conversa
                  </Button>
                </Box>
              ) : (
                <List disablePadding>
                  {recentConversations.map((conv, i) => (
                    <Box key={conv.id}>
                      {i > 0 && <Divider sx={{ my: 1 }} />}
                      <ListItem
                        disablePadding
                        sx={{
                          cursor: 'pointer',
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: 'action.hover' },
                          py: 0.5,
                          px: 1,
                        }}
                        onClick={() => navigate('/chat')}
                      >
                        <ListItemAvatar sx={{ minWidth: 40 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light' }}>
                            <ChatIcon sx={{ fontSize: 16 }} />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={conv.title}
                          secondary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Update sx={{ fontSize: 11 }} />
                              {new Date(conv.updated_at ?? conv.created_at).toLocaleDateString('pt-BR')}
                            </Box>
                          }
                          primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true, fontWeight: 500 }}
                          secondaryTypographyProps={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center' }}
                        />
                        <Chip label="IA" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: 'primary.main', color: 'white' }} />
                      </ListItem>
                    </Box>
                  ))}
                </List>
              )}

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label="SINAPI Mar/2026"
                  size="small"
                  color="primary"
                  variant="outlined"
                  icon={<Update />}
                />
                <Typography variant="caption" color="text.secondary">
                  Base atualizada
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
