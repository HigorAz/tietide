import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { HomePage } from '@/pages/HomePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { GlobalHistoryPage } from '@/pages/GlobalHistoryPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { ConnectionsPage } from '@/pages/ConnectionsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { SettingsEnvVarsPage } from '@/pages/settings/EnvVarsPage';
import { AdminEnvVarsPage } from '@/pages/admin/EnvVarsPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { AdminRoute, ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { RootLayout } from '@/components/layout/RootLayout';

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/workflows', element: <WorkflowsPage /> },
          { path: '/workflows/:id', element: <WorkflowEditorPage /> },
          { path: '/history', element: <GlobalHistoryPage /> },
          { path: '/library', element: <LibraryPage /> },
          { path: '/connections', element: <ConnectionsPage /> },
          { path: '/settings', element: <PlaceholderPage title="Account settings" /> },
          { path: '/settings/env-vars', element: <SettingsEnvVarsPage /> },
          {
            path: '/admin/env-vars',
            element: (
              <AdminRoute>
                <AdminEnvVarsPage />
              </AdminRoute>
            ),
          },
          {
            path: '/admin/audit',
            element: (
              <AdminRoute>
                <AuditLogPage />
              </AdminRoute>
            ),
          },
        ],
      },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
