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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Search, Engineering } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { SomasusLinha } from '@/types';

function fmtQtd(v: number | null) {
  if (v === null || v === undefined) return '–';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

const BANCO_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'default'> = {
  SINAPI: 'primary',
  'CPOS/CDHU': 'secondary',
  SBC: 'success',
  Próprio: 'warning',
};

export function SomasusPage() {
  const [rows, setRows] = useState<SomasusLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [grupo, setGrupo] = useState('');
  const [grupos, setGrupos] = useState<string[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'secao' | 'item'>('todos');

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('somasus_orcamento')
      .select('*', { count: 'exact' })
      .eq('tipologia', 'POLICLINICA')
      .order('hierarquia');

    if (search.trim()) {
      query = query.or(`descricao.ilike.%${search.trim()}%,codigo.ilike.%${search.trim()}%`);
    }
    if (grupo) query = query.eq('grupo_principal', grupo);
    if (tipoFiltro !== 'todos') query = query.eq('tipo_linha', tipoFiltro);

    const from = page * rowsPerPage;
    query = query.range(from, from + rowsPerPage - 1);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as SomasusLinha[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage, grupo, tipoFiltro]);

  useEffect(() => {
    supabase
      .from('somasus_orcamento')
      .select('grupo_principal')
      .eq('tipologia', 'POLICLINICA')
      .not('grupo_principal', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(d => d.grupo_principal).filter(Boolean))].sort();
          setGrupos(unique as string[]);
        }
      });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search, grupo, tipoFiltro]);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Engineering color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>SOMASUS – Orçamento de Referência</Typography>
          <Typography variant="body2" color="text.secondary">
            Policlínica MS · Planilha Sintética Sem Desoneração · Referência Nov/2023 · Área: 3.213 m²
          </Typography>
        </Box>
        <Chip label="Policlínica" color="primary" size="small" sx={{ ml: 'auto' }} />
        <Chip label="Nov/2023" color="success" size="small" />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip label="3.213 m² AC" size="small" variant="outlined" />
        <Chip label="SINAPI Mar/2026" size="small" variant="outlined" color="primary" />
        <Chip label="Sem Desoneração" size="small" variant="outlined" />
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', pb: '16px !important' }}>
          <TextField
            size="small"
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ minWidth: 240, flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Grupo Principal</InputLabel>
            <Select value={grupo} label="Grupo Principal" onChange={e => setGrupo(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {grupos.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={tipoFiltro}
            exclusive
            onChange={(_, v) => { if (v) setTipoFiltro(v); }}
            size="small"
          >
            <ToggleButton value="todos">Todos</ToggleButton>
            <ToggleButton value="secao">Seções</ToggleButton>
            <ToggleButton value="item">Itens</ToggleButton>
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      {!loading && total === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhum dado encontrado. Execute <code>npm run import-data</code> para importar o orçamento SOMASUS.
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell sx={{ width: 90 }}>Hierarquia</TableCell>
                <TableCell sx={{ width: 80 }}>Código</TableCell>
                <TableCell sx={{ width: 90 }}>Banco</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell sx={{ width: 50 }}>Un.</TableCell>
                <TableCell align="right" sx={{ width: 90 }}>Qtd.</TableCell>
                <TableCell sx={{ width: 70 }}>Tipo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
                : rows.map(row => {
                  const isSecao = row.tipo_linha === 'secao';
                  const indent = Math.max(0, (row.nivel - 1)) * 16;
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{
                        bgcolor: isSecao
                          ? row.nivel === 1 ? 'primary.50' : 'grey.50'
                          : undefined,
                      }}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'text.secondary' }}>
                        {row.hierarquia}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {row.codigo ?? ''}
                      </TableCell>
                      <TableCell>
                        {row.banco && (
                          <Chip
                            label={row.banco}
                            size="small"
                            color={BANCO_COLORS[row.banco] ?? 'default'}
                            variant="outlined"
                            sx={{ fontSize: '0.68rem' }}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          pl: `${indent + 8}px`,
                          fontWeight: isSecao ? 700 : 400,
                          fontSize: isSecao ? '0.85rem' : '0.82rem',
                          color: isSecao && row.nivel === 1 ? 'primary.dark' : undefined,
                        }}
                      >
                        {row.descricao}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{row.unidade ?? ''}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: !isSecao ? 500 : 400 }}>
                        {fmtQtd(row.quantidade)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isSecao ? 'Seção' : 'Item'}
                          size="small"
                          color={isSecao ? 'default' : 'success'}
                          variant={isSecao ? 'outlined' : 'filled'}
                          sx={{ fontSize: '0.68rem' }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
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
          rowsPerPageOptions={[25, 50, 100, 200]}
          labelRowsPerPage="Linhas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Card>
    </Box>
  );
}
