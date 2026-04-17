import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Alert,
  Chip,
} from '@mui/material';
import { Engineering, OpenInNew, Info } from '@mui/icons-material';

const SOMASUS_MODULES = [
  {
    title: 'Programação Física de Saúde',
    description: 'Parâmetros e critérios para programação de serviços de saúde.',
    tag: 'Planejamento',
  },
  {
    title: 'Equipamentos de Saúde',
    description: 'Relação de equipamentos recomendados por tipo de unidade de saúde.',
    tag: 'Equipamentos',
  },
  {
    title: 'Ambiência em Saúde',
    description: 'Diretrizes para humanização dos espaços de saúde.',
    tag: 'Infraestrutura',
  },
  {
    title: 'Projetos e Obras',
    description: 'Parâmetros técnicos para obras e reformas em estabelecimentos de saúde.',
    tag: 'Obras',
  },
];

export function SomasusPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Engineering color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>SOMASUS</Typography>
          <Typography variant="body2" color="text.secondary">
            Sistema de Apoio à Elaboração de Projetos de Investimentos em Saúde – Ministério da Saúde
          </Typography>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }} icon={<Info />}>
        O SOMASUS é um sistema externo do Ministério da Saúde. Os dados normativos relevantes foram
        indexados na Base de Conhecimento do ConstruSUS IA para consulta via chat.
      </Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {SOMASUS_MODULES.map((mod, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Chip
                  label={mod.tag}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ mb: 1.5 }}
                />
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  {mod.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {mod.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Engineering sx={{ fontSize: 48, color: 'primary.light', mb: 2 }} />
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Acesse o SOMASUS Oficial
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
            Para acessar o sistema completo com todos os módulos e funcionalidades do SOMASUS,
            acesse o portal oficial do Ministério da Saúde.
          </Typography>
          <Button
            variant="contained"
            endIcon={<OpenInNew />}
            href="https://somasus.saude.gov.br"
            target="_blank"
            rel="noopener noreferrer"
          >
            Acessar SOMASUS
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
