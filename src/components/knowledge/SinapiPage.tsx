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
  Tab,
  Tabs,
} from '@mui/material';
import { Search, Construction } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { SinapiInsumo, SinapiComposicao } from '@/types';

function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Aba Insumos ───────────────────────────────────────────────────────────────
function InsumosTab() {
  const [rows, setRows] = useState<SinapiInsumo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [classificacao, setClassificacao] = useState('');
  const [classificacoes, setClassificacoes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('sinapi_insumos')
      .select('*', { count: 'exact' })
      .order('codigo');

    if (search.trim()) {
      const num = parseInt(search.trim());
      if (!isNaN(num)) {
        query = query.eq('codigo', num);
      } else {
        query = query.ilike('descricao', `%${search.trim()}%`);
      }
    }
    if (classificacao) query = query.eq('classificacao', classificacao);

    const from = page * rowsPerPage;
    query = query.range(from, from + rowsPerPage - 1);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as SinapiInsumo[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage, classificacao]);

  useEffect(() => {
    supabase
      .from('sinapi_insumos')
      .select('classificacao')
      .not('classificacao', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(d => d.classificacao).filter(Boolean))].sort();
          setClassificacoes(unique as string[]);
        }
      });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search, classificacao]);

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', pb: '16px !important' }}>
          <TextField
            size="small"
            placeholder="Código ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ minWidth: 280, flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Classificação</InputLabel>
            <Select value={classificacao} label="Classificação" onChange={e => setClassificacao(e.target.value)}>
              <MenuItem value="">Todas</MenuItem>
              {classificacoes.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {!loading && total === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhum insumo encontrado. Execute <code>npm run import-data</code> para importar os dados SINAPI.
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell sx={{ width: 80 }}>Código</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell sx={{ width: 60 }}>Un.</TableCell>
                <TableCell sx={{ width: 80 }}>Origem</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>GO (R$)</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>SP (R$)</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>DF (R$)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
                : rows.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.codigo}</TableCell>
                    <TableCell sx={{ maxWidth: 380, fontSize: '0.82rem' }}>{row.descricao}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{row.unidade}</TableCell>
                    <TableCell>
                      {row.origem_preco && (
                        <Chip label={row.origem_preco} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.85rem' }}>
                      {fmtBRL(row.preco_go)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {fmtBRL(row.preco_sp)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {fmtBRL(row.preco_df)}
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
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Card>
    </>
  );
}

// ── Aba Composições ───────────────────────────────────────────────────────────
function ComposicoesTab() {
  const [rows, setRows] = useState<SinapiComposicao[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [grupo, setGrupo] = useState('');
  const [grupos, setGrupos] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('sinapi_composicoes')
      .select('*', { count: 'exact' })
      .order('descricao');

    if (search.trim()) query = query.ilike('descricao', `%${search.trim()}%`);
    if (grupo) query = query.eq('grupo', grupo);

    const from = page * rowsPerPage;
    query = query.range(from, from + rowsPerPage - 1);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as SinapiComposicao[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage, grupo]);

  useEffect(() => {
    supabase
      .from('sinapi_composicoes')
      .select('grupo')
      .not('grupo', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(d => d.grupo).filter(Boolean))].sort();
          setGrupos(unique as string[]);
        }
      });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search, grupo]);

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', pb: '16px !important' }}>
          <TextField
            size="small"
            placeholder="Buscar por descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ minWidth: 280, flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Grupo</InputLabel>
            <Select value={grupo} label="Grupo" onChange={e => setGrupo(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {grupos.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {!loading && total === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhuma composição encontrada. Execute <code>npm run import-data</code> para importar os dados SINAPI.
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell sx={{ width: 80 }}>Código</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell sx={{ width: 60 }}>Un.</TableCell>
                <TableCell sx={{ width: 140 }}>Grupo</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Custo GO (R$)</TableCell>
                <TableCell align="right" sx={{ width: 80 }}>%AS GO</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Custo SP (R$)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
                : rows.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.codigo ?? '–'}</TableCell>
                    <TableCell sx={{ maxWidth: 380, fontSize: '0.82rem' }}>{row.descricao}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{row.unidade}</TableCell>
                    <TableCell>
                      {row.grupo && (
                        <Chip label={row.grupo} size="small" variant="outlined" sx={{ fontSize: '0.7rem', maxWidth: 130 }} />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.85rem' }}>
                      {fmtBRL(row.custo_go)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {row.pct_as_go !== null ? `${row.pct_as_go.toFixed(2)}%` : '–'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {fmtBRL(row.custo_sp)}
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
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Card>
    </>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
export function SinapiPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Construction color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Tabela SINAPI</Typography>
          <Typography variant="body2" color="text.secondary">
            Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil – Referência Mar/2026 · Sem desoneração
          </Typography>
        </Box>
        <Chip label="Mar/2026" color="success" size="small" sx={{ ml: 'auto' }} />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Insumos (ISD)" />
        <Tab label="Composições (CSD)" />
      </Tabs>

      {tab === 0 && <InsumosTab />}
      {tab === 1 && <ComposicoesTab />}
    </Box>
  );
}
