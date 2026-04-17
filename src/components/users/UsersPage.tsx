import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { People, Add, Delete, Edit } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';

export function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [form, setForm] = useState({ email: '', full_name: '', password: '', cpf: '', role: 'user' as UserRole });
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    if (!form.email || !form.full_name || !form.password) {
      setSnackbar({ open: true, message: 'Preencha todos os campos obrigatórios.', severity: 'error' });
      return;
    }
    setSubmitting(true);

    // Use service role via Edge Function to create user
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      }
    );

    if (res.ok) {
      setSnackbar({ open: true, message: 'Usuário criado com sucesso!', severity: 'success' });
      setDialogOpen(false);
      setForm({ email: '', full_name: '', password: '', cpf: '', role: 'user' });
      fetchUsers();
    } else {
      const err = await res.json() as { error?: string };
      setSnackbar({ open: true, message: err.error ?? 'Erro ao criar usuário.', severity: 'error' });
    }
    setSubmitting(false);
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Acesso restrito a administradores.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <People color="primary" sx={{ fontSize: 32 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>Gestão de Usuários</Typography>
          <Typography variant="body2" color="text.secondary">
            Administre os gestores com acesso ao ConstruSUS IA
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setDialogOpen(true)}
        >
          Novo Usuário
        </Button>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell>Usuário</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>CPF</TableCell>
                <TableCell>Perfil</TableCell>
                <TableCell>Cadastro</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4, 5, 6].map(j => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
                : users.map(u => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8rem' }}>
                          {u.full_name?.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>{u.full_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {u.cpf ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.role === 'admin' ? 'Administrador' : 'Gestor'}
                        size="small"
                        color={u.role === 'admin' ? 'secondary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar (em breve)">
                        <span>
                          <IconButton size="small" disabled>
                            <Edit fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create user dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Criar Novo Usuário</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Nome completo *"
            fullWidth
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          />
          <TextField
            label="E-mail institucional *"
            type="email"
            fullWidth
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <TextField
            label="CPF"
            fullWidth
            value={form.cpf}
            onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
            placeholder="00000000000"
          />
          <TextField
            label="Senha temporária *"
            type="password"
            fullWidth
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
          <FormControl fullWidth>
            <InputLabel>Perfil de acesso</InputLabel>
            <Select
              value={form.role}
              label="Perfil de acesso"
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
            >
              <MenuItem value="user">Gestor (usuário comum)</MenuItem>
              <MenuItem value="admin">Administrador</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? 'Criando...' : 'Criar Usuário'}
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
