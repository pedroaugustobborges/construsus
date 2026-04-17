import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Grid,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
} from '@mui/material';
import { Search, MenuBook } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

export function KnowledgePage() {
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      let query = supabase
        .from('knowledge_base')
        .select('id, content, metadata, created_at', { count: 'exact' });

      if (search) {
        query = query.ilike('content', `%${search}%`);
      }

      const from = page * rowsPerPage;
      query = query.range(from, from + rowsPerPage - 1).order('created_at', { ascending: false });

      const { data, count } = await query;
      if (data) setChunks(data as KnowledgeChunk[]);
      setTotal(count ?? 0);
      setLoading(false);
    };
    fetch();
  }, [search, page, rowsPerPage]);

  useEffect(() => { setPage(0); }, [search]);

  // Stats by document
  const docStats: Record<string, number> = {};
  chunks.forEach(c => {
    const doc = c.metadata?.documento ?? 'Outros';
    docStats[doc] = (docStats[doc] ?? 0) + 1;
  });

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <MenuBook color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Base de Conhecimento</Typography>
          <Typography variant="body2" color="text.secondary">
            Documentos normativos indexados para o sistema RAG – RDC 50, SINAPI, SIGEM e mais
          </Typography>
        </Box>
        <Chip label={`${total} chunks`} color="primary" sx={{ ml: 'auto' }} />
      </Box>

      {total === 0 && !loading && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          A base de conhecimento está vazia. Execute o script de população:
          <Box component="code" sx={{ display: 'block', mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
            npm run populate-kb
          </Box>
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {Object.entries(docStats).map(([doc, count]) => (
          <Grid key={doc} size={{ xs: 6, sm: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ py: '12px !important', px: 2 }}>
                <Typography variant="h5" fontWeight={700} color="primary.main">{count}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{doc}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar no conteúdo dos documentos..."
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

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell>Documento</TableCell>
                <TableCell>Seção</TableCell>
                <TableCell>Tema</TableCell>
                <TableCell>Conteúdo (prévia)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4].map(j => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
                : chunks.map(chunk => (
                  <TableRow key={chunk.id} hover>
                    <TableCell>
                      <Chip
                        label={chunk.metadata?.documento ?? 'N/A'}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', maxWidth: 160 }} title={chunk.metadata?.secao}>
                      {chunk.metadata?.secao ?? '-'}
                    </TableCell>
                    <TableCell>
                      {chunk.metadata?.tema && (
                        <Chip label={chunk.metadata.tema} size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 500, fontSize: '0.8rem', color: 'text.secondary' }}>
                      {chunk.content.substring(0, 200)}…
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
          onRowsPerPageChange={() => {}}
          rowsPerPageOptions={[20]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </Card>
    </Box>
  );
}
