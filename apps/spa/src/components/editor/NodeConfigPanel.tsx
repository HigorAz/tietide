import { X } from 'lucide-react';
import { NODE_CATALOG } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { FORM_REGISTRY } from './config/formRegistry';
import { getNodeIcon } from './nodes/nodeIcons';
import { NodePreviewPanel } from './preview/NodePreviewPanel';
import { NodeRunInspection } from './NodeRunInspection';

export function NodeConfigPanel() {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedNode = useEditorStore((s) =>
    s.selectedNodeId ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null) : null,
  );
  const selectNode = useEditorStore((s) => s.selectNode);
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  // When viewing a run (live or replay) the panel flips into inspection mode:
  // it shows the node's resolved config + the input/output/error from the
  // execution instead of the editable config form.
  const executionMode = useExecutionLiveStore((s) => s.mode);
  const isExecutionMode = executionMode === 'live' || executionMode === 'replay';

  if (selectedNodeId === null) {
    return null;
  }

  if (!selectedNode) {
    return (
      <aside
        data-testid="node-config-panel"
        className="flex h-full w-80 flex-col gap-4 border-l border-white/5 bg-surface p-4"
      >
        <p className="text-sm text-text-muted">No node selected.</p>
      </aside>
    );
  }

  const { data } = selectedNode;
  const Icon = getNodeIcon(data.nodeType);
  const catalogEntry = NODE_CATALOG.find((d) => d.type === data.nodeType);
  const Form = FORM_REGISTRY[data.nodeType];
  const config = data.config ?? {};
  const hasErrorHandler = config.hasErrorHandler === true;

  return (
    <aside
      data-testid="node-config-panel"
      className="flex h-full w-80 flex-col gap-4 border-l border-white/5 bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-accent-teal">
            <Icon size={18} strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">{data.label}</h2>
            {catalogEntry?.description && (
              <p className="mt-0.5 text-xs leading-snug text-text-secondary">
                {catalogEntry.description}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          data-testid="node-config-close"
          aria-label="Close configuration panel"
          onClick={() => selectNode(null)}
          className={cn(
            'rounded-md p-1 text-text-muted transition',
            'hover:bg-elevated hover:text-text-primary focus:outline-none',
            'focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-1">
        {isExecutionMode ? (
          <NodeRunInspection nodeId={selectedNodeId} config={config} />
        ) : (
          <>
            {Form ? (
              <Form key={selectedNodeId} nodeId={selectedNodeId} config={config} />
            ) : (
              <p className="text-sm text-text-muted">No configuration available for this node.</p>
            )}

            <div className="mt-4 flex items-start gap-2 border-t border-white/5 pt-3">
              <input
                type="checkbox"
                id={`error-handler-${selectedNodeId}`}
                data-testid="node-config-error-handler-toggle"
                checked={hasErrorHandler}
                onChange={(e) =>
                  updateNodeConfig(selectedNodeId, { hasErrorHandler: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 cursor-pointer accent-red-500"
              />
              <label
                htmlFor={`error-handler-${selectedNodeId}`}
                className="cursor-pointer text-xs leading-snug text-text-secondary"
              >
                <span className="font-medium text-text-primary">Add error handler</span>
                <span className="block text-text-muted">
                  Reveals a red output handle. Connect it to route execution down an error path when
                  this node fails.
                </span>
              </label>
            </div>
          </>
        )}
      </div>

      {!isExecutionMode && (
        <footer data-testid="node-preview-panel">
          <NodePreviewPanel nodeId={selectedNodeId} />
        </footer>
      )}
    </aside>
  );
}
