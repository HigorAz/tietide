import { X } from 'lucide-react';
import { NODE_CATALOG } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { BottomSheet } from './BottomSheet';
import { FORM_REGISTRY } from './config/formRegistry';
import { NodeGlyph } from './NodeGlyph';
import { NodeRunInspection } from './NodeRunInspection';
import { ConfigSteps } from './steps/ConfigSteps';
import { useResizableWidth, PanelResizeHandle } from './NodeConfigPanelResize';

export function NodeConfigPanel() {
  const isMobile = useIsMobile();
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedNode = useEditorStore((s) =>
    s.selectedNodeId ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null) : null,
  );
  const selectNode = useEditorStore((s) => s.selectNode);
  // The global Configure/Result toggle drives this panel: in 'result' it flips
  // into inspection mode (resolved config + the run's input/output/error); in
  // 'configure' it stays the editable stepped form — even while a run is loaded —
  // so the user can edit and re-test without leaving the run view.
  const isExecutionMode = useEditorStore((s) => s.viewMode === 'result');
  const { width, onPointerDown } = useResizableWidth();

  if (selectedNodeId === null) {
    return null;
  }

  if (!selectedNode) {
    const empty = <p className="text-sm text-text-muted">No node selected.</p>;
    if (isMobile) {
      return (
        <BottomSheet
          open
          onClose={() => selectNode(null)}
          title="Configure"
          data-testid="node-config-panel"
        >
          <div className="p-4">{empty}</div>
        </BottomSheet>
      );
    }
    return (
      <aside
        data-testid="node-config-panel"
        style={{ width }}
        className="relative flex h-full flex-col gap-4 border-l border-white/5 bg-surface p-4"
      >
        <PanelResizeHandle onPointerDown={onPointerDown} />
        {empty}
      </aside>
    );
  }

  const { data } = selectedNode;
  const catalogEntry = NODE_CATALOG.find((d) => d.type === data.nodeType);
  const Form = FORM_REGISTRY[data.nodeType];
  const config = data.config ?? {};

  const body = isExecutionMode ? (
    <NodeRunInspection nodeId={selectedNodeId} config={config} />
  ) : (
    <ConfigSteps nodeId={selectedNodeId} config={config} Form={Form} />
  );

  // Mobile: a bottom sheet (the sheet supplies its own title + close button).
  if (isMobile) {
    return (
      <BottomSheet
        open
        onClose={() => selectNode(null)}
        title={data.label}
        data-testid="node-config-panel"
      >
        <div className="flex flex-col gap-4 p-4">{body}</div>
      </BottomSheet>
    );
  }

  // Desktop: a resizable right-hand side panel.
  return (
    <aside
      data-testid="node-config-panel"
      style={{ width }}
      className="relative flex h-full flex-col gap-4 border-l border-white/5 bg-surface p-4"
    >
      <PanelResizeHandle onPointerDown={onPointerDown} />
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-accent-teal">
            <NodeGlyph type={data.nodeType} size={18} />
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

      <div className="flex-1 overflow-y-auto pr-1">{body}</div>
    </aside>
  );
}
