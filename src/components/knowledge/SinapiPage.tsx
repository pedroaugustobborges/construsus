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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Search, Construction } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { CostReference } from '@/types';

export function SinapiPage() {
  const [rows, setRows] = useState<CostReference[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('cost_references')
      .select('*', { count: 'exact' })
      .eq('fonte', 'SINAPI')
      .order('codigo');

    if (search) {
      query = query.or(`descricao.ilike.%${search}%,codigo.ilike.%${search}%`);
    }
    if (categoria) {
      query = query.eq('categoria', categoria);
    }

    const from = page * rowsPerPage;
    const to = from + rowsPerPage - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as CostReference[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage, categoria]);

  useEffect(() => {
    const fetchCategorias = async () => {
      const { data } = await supabase
        .from('cost_references')
        .select('categoria')
        .eq('fonte', 'SINAPI')
        .not('categoria', 'is', null);
      if (data) {
        const unique = [...new Set(data.map(d => d.categoria).filter(Boolean))];
        setCategorias(unique as string[]);
      }
    };
    fetchCategorias();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [search, categoria]);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Construction color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Tabela SINAPI</Typography>
          <Typography variant="body2" color="text.secondary">
            Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil – Referência Mar/2026
          </Typography>
        </Box>
        <Chip label="Atualizado" color="success" size="small" sx={{ ml: 'auto' }} />
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', pb: '16px !important' }}>
          <TextField
            size="small"
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ minWidth: 300, flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Categoria</InputLabel>
            <Select
              value={categoria}
              label="Categoria"
              onChange={e => setCategoria(e.target.value)}
            >
              <MenuItem value="">Todas</MenuItem>
              {categorias.map(c => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {rows.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhum item encontrado. Os dados da SINAPI precisam ser importados pelo administrador.
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
                <TableCell align="right">Preço Unitário (R$)</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Categoria</TableCell>
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
                    <TableCell>{row.estado}</TableCell>
                    <TableCell>
                      {row.categoria && (
                        <Chip label={row.categoria} size="small" variant="outlined" />
                      )}
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
