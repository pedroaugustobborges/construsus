import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  IconButton,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Dashboard as DashboardIcon,
  MenuBook,
  BarChart,
  Construction,
  People,
  Menu as MenuIcon,
  Logout,
  AccountCircle,
  LocalHospital,
  Engineering,
  Inventory,
} from '@mui/icons-material';
import { useAuth } from '@/hooks/useAuth';

const DRAWER_WIDTH = 260;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  dividerBefore?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Chat IA', path: '/chat', icon: <ChatIcon /> },
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'SINAPI', path: '/sinapi', icon: <Construction />, dividerBefore: true },
  { label: 'SOMASUS', path: '/somasus', icon: <Engineering /> },
  { label: 'SIGEM', path: '/sigem', icon: <Inventory /> },
  { label: 'Investimentos SES-GO', path: '/investimentos', icon: <BarChart /> },
  { label: 'Base de Conhecimento', path: '/knowledge', icon: <MenuBook />, dividerBefore: true },
  { label: 'Usuários', path: '/users', icon: <People />, adminOnly: true },
];

export function AppLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const visibleNav = navItems.filter(item => !item.adminOnly || isAdmin);

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand */}
      <Box
        sx={{
          px: 2.5,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            backgroundColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LocalHospital sx={{ color: 'white', fontSize: 20 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} color="primary.main" lineHeight={1.2}>
            ConstruSUS IA
          </Typography>
          <Typography variant="caption" color="text.secondary">
            SES-GO
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Navigation */}
      <List sx={{ flex: 1, px: 1, py: 1 }}>
        {visibleNav.map(item => (
          <Box key={item.path}>
            {item.dividerBefore && (
              <Divider sx={{ my: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Bases de Dados
                </Typography>
              </Divider>
            )}
            <ListItem disablePadding>
              <ListItemButton
                selected={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
                onClick={() => handleNavClick(item.path)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'white',
                    '& .MuiListItemIcon-root': { color: 'white' },
                    '&:hover': { backgroundColor: 'primary.dark' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                />
              </ListItemButton>
            </ListItem>
          </Box>
        ))}
      </List>

      <Divider />

      {/* User info */}
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            backgroundColor: 'background.default',
            cursor: 'pointer',
          }}
          onClick={e => setAnchorEl(e.currentTarget)}
        >
          <Avatar
            sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.875rem' }}
          >
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {profile?.full_name ?? 'Usuário'}
            </Typography>
            <Chip
              label={isAdmin ? 'Admin' : 'Gestor'}
              size="small"
              color={isAdmin ? 'secondary' : 'default'}
              sx={{ height: 16, fontSize: '0.65rem' }}
            />
          </Box>
        </Box>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem disabled>
            <AccountCircle sx={{ mr: 1 }} />
            {profile?.email}
          </MenuItem>
          <Divider />
          <MenuItem onClick={signOut}>
            <Logout sx={{ mr: 1 }} fontSize="small" />
            Sair
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* AppBar (mobile only) */}
      <AppBar
        position="fixed"
        sx={{ display: { md: 'none' }, zIndex: theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <LocalHospital sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            ConstruSUS IA
          </Typography>
          <Tooltip title="Sair">
            <IconButton color="inherit" onClick={signOut}>
              <Logout />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Sidebar drawer */}
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: { xs: '64px', md: 0 },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
