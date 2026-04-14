import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage';

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-2xl text-text-primary">{name}</h1>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Placeholder name="Login" />} />
        <Route path="/register" element={<Placeholder name="Register" />} />
        <Route path="/dashboard" element={<Placeholder name="Dashboard" />} />
        <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
        <Route path="/executions" element={<Placeholder name="Execution History" />} />
        <Route path="/executions/:id" element={<Placeholder name="Execution Detail" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
