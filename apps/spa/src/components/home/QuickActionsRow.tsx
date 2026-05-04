import { Plus, BookOpen, Cable } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QuickActionCard } from './QuickActionCard';

export interface QuickActionsRowProps {
  onCreateWorkflow: () => void;
}

export function QuickActionsRow({ onCreateWorkflow }: QuickActionsRowProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <QuickActionCard
        icon={Plus}
        title="Create workflow"
        description="Start from a blank canvas or a template."
        onClick={onCreateWorkflow}
      />
      <QuickActionCard
        icon={BookOpen}
        title="Browse library"
        description="Find ready-made workflow templates to clone."
        onClick={() => navigate('/library')}
      />
      <QuickActionCard
        icon={Cable}
        title="Connect a service"
        description="Add credentials so your nodes can call external apps."
        onClick={() => navigate('/connections')}
      />
    </div>
  );
}
