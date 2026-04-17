import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
} from '@mui/material';
import { BarChart, TrendingUp } from '@mui/icons-material';
import { supabase } from '@/lib/supabase';

interface InvestimentoRow {
  id: string;
  ano: number;
  programa: string;
  valor: number;
  tipo: string;
  unidade?: string;
  municipio?: string;
  fonte_recurso?: string;
}

export function InvestimentosPage() {
  const [data, setData] = useState<InvestimentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalGeral, setTotalGeral] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const { data: rows } = await supabase
        .from('investimentos_ses')
        .select('*')
        .order('ano', { ascending: false })
        .limit(100);

      if (rows) {
        setData(rows as InvestimentoRow[]);
        setTotalGeral(rows.reduce((acc, r) => acc + (r.valor ?? 0), 0));
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const anoMap = data.reduce((acc, r) => {
    acc[r.ano] = (acc[r.ano] ?? 0) + r.valor;
    return acc;
  }, {} as Record<number, number>);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <BarChart color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Investimentos SES-GO</Typography>
          <Typography variant="body2" color="text.secondary">
            Histórico de Investimentos em Infraestrutura de Saúde – Secretaria de Estado da Saúde de Goiás
          </Typography>
        </Box>
      </Box>

      {data.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Os dados de investimentos precisam ser importados pelo administrador via script de população.
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Total Investido
              </Typography>
              <Typography variant="h4" fontWeight={700} color="primary.main" sx={{ mt: 0.5 }}>
                {loading ? <Skeleton /> : `R$ ${(totalGeral / 1e6).toFixed(1)}M`}
              </Typography>
              <Chip label="Histórico" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>

        {Object.entries(anoMap).slice(0, 3).map(([ano, valor]) => (
          <Grid key={ano} size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  Investimento {ano}
                </Typography>
                <Typography variant="h4" fontWeight={700} color="secondary.main" sx={{ mt: 0.5 }}>
                  {`R$ ${(valor / 1e6).toFixed(1)}M`}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                  <TrendingUp sx={{ fontSize: 14, color: 'success.main' }} />
                  <Typography variant="caption" color="success.main">Consolidado</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { backgroundColor: 'primary.main', color: 'white', fontWeight: 600 } }}>
                <TableCell>Ano</TableCell>
                <TableCell>Programa / Projeto</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Município</TableCell>
                <TableCell>Fonte</TableCell>
                <TableCell align="right">Valor (R$)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
                : data.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.ano}</TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>{row.programa}</TableCell>
                    <TableCell>
                      <Chip label={row.tipo} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{row.municipio ?? '-'}</TableCell>
                    <TableCell>{row.fonte_recurso ?? '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {row.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
