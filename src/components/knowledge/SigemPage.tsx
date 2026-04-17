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
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Search, Inventory, KeyboardArrowDown, KeyboardArrowUp, AttachMoney, PublicOutlined } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { SigemEquipamento } from '@/types';

function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ExpandableRow({ row }: { row: SigemEquipamento }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(row.definicao || row.especificacao);

  return (
    <>
      <TableRow hover sx={{ '& td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell sx={{ width: 32, p: 0.5 }}>
          {hasDetail && (
            <IconButton size="small" onClick={() => setOpen(o => !o)}>
              {open ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', width: 100 }}>{row.codigo}</TableCell>
        <TableCell sx={{ maxWidth: 320, fontSize: '0.82rem' }}>{row.nome}</TableCell>
        <TableCell>
          {row.classificacao && (
            <Chip label={row.classificacao} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.7rem', maxWidth: 160 }} />
          )}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.85rem', width: 130 }}>
          {fmtBRL(row.valor_sugerido)}
        </TableCell>
        <TableCell sx={{ width: 80, textAlign: 'center' }}>
          {row.dolarizado ? (
            <Tooltip title="Equipamento dolarizado (preço em USD)">
              <Chip icon={<PublicOutlined sx={{ fontSize: 14 }} />} label="USD" size="small" color="warning" variant="outlined" />
            </Tooltip>
          ) : (
            <Chip icon={<AttachMoney sx={{ fontSize: 14 }} />} label="BRL" size="small" color="success" variant="outlined" />
          )}
        </TableCell>
      </TableRow>
      {hasDetail && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0 }}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ py: 1.5, px: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 0.5 }}>
                {row.definicao && (
                  <Typography variant="body2" sx={{ mb: row.especificacao ? 1 : 0 }}>
                    <strong>Definição:</strong> {row.definicao}
                  </Typography>
                )}
                {row.especificacao && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Especificação:</strong> {row.especificacao}
                  </Typography>
                )}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function SigemPage() {
  const [rows, setRows] = useState<SigemEquipamento[]>([]);
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
      .from('sigem_equipamentos')
      .select('*', { count: 'exact' })
      .order('codigo');

    if (search.trim()) {
      query = query.or(`nome.ilike.%${search.trim()}%,codigo.ilike.%${search.trim()}%`);
    }
    if (classificacao) query = query.eq('classificacao', classificacao);

    const from = page * rowsPerPage;
    query = query.range(from, from + rowsPerPage - 1);

    const { data, count, error } = await query;
    if (!error) {
      setRows((data ?? []) as SigemEquipamento[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, page, rowsPerPage, classificacao]);

  useEffect(() => {
    supabase
      .from('sigem_equipamentos')
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
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Inventory color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>SIGEM – Equipamentos RENEM/SUS</Typography>
          <Typography variant="body2" color="text.secondary">
            Relação Nacional de Equipamentos e Material Permanente – Referência Nov/2024
          </Typography>
        </Box>
        <Chip label="Nov/2024" color="success" size="small" sx={{ ml: 'auto' }} />
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', pb: '16px !important' }}>
          <TextField
            size="small"
            placeholder="Código ou nome do equipamento..."
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
          Nenhum equipamento encontrado. Execute <code>npm run import-data</code> para importar os dados SIGEM.
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {total > 0 && `${total.toLocaleString('pt-BR')} equipamentos · Clique na seta para ver definição e especificação`}
      </Typography>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell sx={{ width: 32 }} />
                <TableCell sx={{ width: 100 }}>Código</TableCell>
                <TableCell>Nome / Equipamento</TableCell>
                <TableCell sx={{ width: 180 }}>Classificação</TableCell>
                <TableCell align="right" sx={{ width: 130 }}>Valor Sugerido (R$)</TableCell>
                <TableCell sx={{ width: 80, textAlign: 'center' }}>Moeda</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
                : rows.map(row => <ExpandableRow key={row.id} row={row} />)
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
    </Box>
  );
}
