import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { ExecutionHistoryPage } from '@/pages/ExecutionHistoryPage';
import { ExecutionDetailPage } from '@/pages/ExecutionDetailPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';
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
          { path: '/', element: <Navigate to="/workflows" replace /> },
          { path: '/dashboard', element: <PlaceholderPage title="Dashboard" /> },
          { path: '/workflows', element: <WorkflowsPage /> },
          { path: '/workflows/:id', element: <WorkflowEditorPage /> },
          { path: '/workflows/:id/executions', element: <ExecutionHistoryPage /> },
          { path: '/executions/:id', element: <ExecutionDetailPage /> },
          { path: '/history', element: <PlaceholderPage title="History" /> },
          { path: '/library', element: <PlaceholderPage title="Library" /> },
          { path: '/connections', element: <PlaceholderPage title="Connections" /> },
          { path: '/settings', element: <PlaceholderPage title="Account settings" /> },
        ],
      },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
