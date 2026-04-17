import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  LocalHospital,
} from '@mui/icons-material';
import { useAuth } from '@/hooks/useAuth';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await signIn(email, password);
      if (authError) {
        // Mostra mensagem baseada no código do erro
        const msg = authError.message ?? '';
        if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
          setError('Email ou senha incorretos.');
        } else if (msg.includes('Email not confirmed')) {
          setError('E-mail não confirmado. Verifique sua caixa de entrada.');
        } else if (msg.includes('User not found')) {
          setError('Usuário não encontrado. Solicite cadastro ao administrador.');
        } else {
          setError(`Erro ao entrar: ${msg || 'Tente novamente.'}`);
        }
      }
      // Se não há erro, o AuthProvider detecta a sessão automaticamente e redireciona
    } catch (err) {
      console.error('Login exception:', err);
      setError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #00619B 0%, #004A75 50%, #003356 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      {/* Background pattern */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(0,135,90,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 40%)`,
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ width: '100%', maxWidth: 460, position: 'relative' }}>
        {/* Logo / Brand */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: '20px',
              backgroundColor: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              mb: 2,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <LocalHospital sx={{ fontSize: 40, color: '#fff' }} />
          </Box>
          <Typography
            variant="h4"
            fontWeight={700}
            color="white"
            gutterBottom
            sx={{ letterSpacing: '-0.5px' }}
          >
            ConstruSUS IA
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            Assistente Virtual para Infraestrutura em Saúde
          </Typography>
        </Box>

        {/* Login card */}
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            border: 'none',
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight={600} color="text.primary" gutterBottom>
              Acesse sua conta
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Sistema restrito a gestores autorizados do SUS
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                fullWidth
                label="E-mail institucional"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                sx={{ mb: 2 }}
                disabled={loading}
              />
              <TextField
                fullWidth
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                sx={{ mb: 3 }}
                disabled={loading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(v => !v)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ py: 1.5, fontSize: '1rem', borderRadius: 2 }}
              >
                {loading ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  'Entrar'
                )}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Para acesso, solicite cadastro ao administrador do sistema.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Typography
          variant="caption"
          sx={{ display: 'block', textAlign: 'center', mt: 3, color: 'rgba(255,255,255,0.5)' }}
        >
          SES-GO · Secretaria de Estado da Saúde de Goiás © {new Date().getFullYear()}
        </Typography>
      </Box>
    </Box>
  );
}
