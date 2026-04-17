import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { theme } from '@/theme';
import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/components/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { ChatPage } from '@/components/chat/ChatPage';
import { SinapiPage } from '@/components/knowledge/SinapiPage';
import { SigemPage } from '@/components/knowledge/SigemPage';
import { SomasusPage } from '@/components/knowledge/SomasusPage';
import { InvestimentosPage } from '@/components/knowledge/InvestimentosPage';
import { KnowledgePage } from '@/components/knowledge/KnowledgePage';
import { UsersPage } from '@/components/users/UsersPage';

function LoadingScreen() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={48} />
    </Box>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="sinapi" element={<SinapiPage />} />
        <Route path="sigem" element={<SigemPage />} />
        <Route path="somasus" element={<SomasusPage />} />
        <Route path="investimentos" element={<InvestimentosPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}
