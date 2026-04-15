import { ReactFlowProvider } from 'reactflow';
import { Canvas } from '@/components/editor/Canvas';
import { NodeConfigPanel } from '@/components/editor/NodeConfigPanel';
import { NodeLibrary } from '@/components/editor/NodeLibrary';

export function WorkflowEditorPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-deep-blue text-text-primary">
      <ReactFlowProvider>
        <NodeLibrary />
        <Canvas />
        <NodeConfigPanel />
      </ReactFlowProvider>
    </div>
  );
}

export default WorkflowEditorPage;
