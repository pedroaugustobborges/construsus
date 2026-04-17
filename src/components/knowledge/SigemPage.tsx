import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import { Search, Inventory } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { CostReference } from '@/types';

export function SigemPage() {
  const [rows, setRows] = useState<CostReference[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('cost_references')
      .select('*', { count: 'exact' })
      .eq('fonte', 'SIGEM')
      .order('codigo');

    if (search) {
      query = query.or(`descricao.ilike.%${search}%,codigo.ilike.%${search}%`);
    }

    const from = page * rowsPerPage;
    query = query.range(from, from + rowsPerPage - 1);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as CostReference[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search]);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Inventory color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>SIGEM</Typography>
          <Typography variant="body2" color="text.secondary">
            Sistema de Gerenciamento de Material Médico-Hospitalar – Referência de Preços
          </Typography>
        </Box>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Buscar equipamento ou material..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {rows.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhum item encontrado. Os dados do SIGEM precisam ser importados pelo administrador.
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell>Código</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell>Unidade</TableCell>
                <TableCell align="right">Preço (R$)</TableCell>
                <TableCell>Categoria</TableCell>
                <TableCell>Referência</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
                : rows.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.codigo}</TableCell>
                    <TableCell sx={{ maxWidth: 400 }}>{row.descricao}</TableCell>
                    <TableCell>{row.unidade}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {row.preco_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {row.categoria && <Chip label={row.categoria} size="small" variant="outlined" />}
                    </TableCell>
                    <TableCell>
                      <Chip label={row.data_referencia} size="small" />
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Linhas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </Card>
    </Box>
  );
}
