import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ExecutionHistoryPage } from '@/pages/ExecutionHistoryPage';
import { ExecutionDetailPage } from '@/pages/ExecutionDetailPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toaster';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workflows" element={<PlaceholderPage title="Workflows" />} />
          <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
          <Route path="/workflows/:id/executions" element={<ExecutionHistoryPage />} />
          <Route path="/executions/:id" element={<ExecutionDetailPage />} />
          <Route path="/history" element={<PlaceholderPage title="History" />} />
          <Route path="/library" element={<PlaceholderPage title="Library" />} />
          <Route path="/connections" element={<PlaceholderPage title="Connections" />} />
          <Route path="/settings" element={<PlaceholderPage title="Account settings" />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
