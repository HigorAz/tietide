import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { Canvas } from '@/components/editor/Canvas';
import { DocumentationPanel } from '@/components/editor/DocumentationPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { NodeConfigPanel } from '@/components/editor/NodeConfigPanel';
import { NodeLibrary } from '@/components/editor/NodeLibrary';
import { getWorkflow } from '@/api/workflows';
import { useEditorStore } from '@/stores/editorStore';

type LoadStatus = 'loading' | 'ready' | 'error';

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const loadWorkflow = useEditorStore((s) => s.loadWorkflow);
  const resetEditor = useEditorStore((s) => s.resetEditor);
  const isDirty = useEditorStore((s) => s.isDirty);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!id) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getWorkflow(id)
      .then((wf) => {
        if (cancelled) return;
        loadWorkflow({ id: wf.id, definition: wf.definition });
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadWorkflow, fetchKey]);

  useEffect(() => {
    return () => {
      resetEditor();
    };
  }, [resetEditor]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-deep-blue text-text-secondary">
        <span>Loading workflow…</span>
      </div>
    );
  }

  if (status === 'error' || !id) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-deep-blue text-text-primary">
        <p>Failed to load workflow</p>
        <button
          type="button"
          onClick={() => setFetchKey((k) => k + 1)}
          className="rounded bg-accent-teal px-3 py-1.5 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-deep-blue text-text-primary">
      <ReactFlowProvider>
        <NodeLibrary />
        <div className="relative flex-1">
          <Canvas />
          <EditorToolbar workflowId={id} />
          <DocumentationPanel workflowId={id} />
        </div>
        <NodeConfigPanel />
      </ReactFlowProvider>
    </div>
  );
}

export default WorkflowEditorPage;
