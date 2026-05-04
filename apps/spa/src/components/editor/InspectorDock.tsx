import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MiniMap } from 'reactflow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useExecutionLiveStore, type ExecutionLiveStatus } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';

export const INSPECTOR_DOCK_STORAGE_KEY = 'tietide-inspector-collapsed';

type DockTab = 'overview' | 'run' | 'logs';

const readCollapsed = (): boolean => {
  try {
    const raw = localStorage.getItem(INSPECTOR_DOCK_STORAGE_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : false;
  } catch {
    return false;
  }
};

const writeCollapsed = (value: boolean): void => {
  try {
    localStorage.setItem(INSPECTOR_DOCK_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable / quota exhausted — degrade silently.
  }
};

function EmptyRunState({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-3 py-6 text-center text-xs text-text-secondary">
      {message}
    </div>
  );
}

export function InspectorDock(): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const [activeTab, setActiveTab] = useState<DockTab>('overview');
  const status = useExecutionLiveStore((s) => s.status);
  const previousStatusRef = useRef<ExecutionLiveStatus>(status);

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (previousStatusRef.current !== 'running' && status === 'running') {
      setActiveTab('run');
    }
    previousStatusRef.current = status;
  }, [status]);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  const stopPointerPropagation = useCallback((event: React.PointerEvent) => {
    // React Flow listens for pointer events on the canvas underneath; without
    // this the dock would start a pan gesture every time the user interacts
    // with a tab or the collapse button.
    event.stopPropagation();
  }, []);

  return (
    <div
      data-testid="inspector-dock"
      data-collapsed={collapsed ? 'true' : 'false'}
      onPointerDown={stopPointerPropagation}
      onWheel={(e) => e.stopPropagation()}
      className={cn(
        'absolute bottom-4 right-4 z-10 flex w-80 flex-col overflow-hidden rounded-md border border-white/5 bg-elevated shadow-lg',
        collapsed ? 'h-9' : 'h-60',
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DockTab)}
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-between border-b border-white/5 pr-1">
          <TabsList aria-label="Inspector" className="border-b-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
            title={collapsed ? 'Expand inspector' : 'Collapse inspector'}
            className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
          >
            {collapsed ? (
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>

        {!collapsed && (
          <>
            <TabsContent
              value="overview"
              forceMount
              className={cn('min-h-0 flex-1', activeTab !== 'overview' && 'hidden')}
            >
              <div className="relative h-full w-full">
                <MiniMap pannable zoomable className="!relative !h-full !w-full" />
              </div>
            </TabsContent>
            <TabsContent value="run" className="min-h-0 flex-1">
              <EmptyRunState message="No run yet" />
            </TabsContent>
            <TabsContent value="logs" className="min-h-0 flex-1">
              <EmptyRunState message="No run yet" />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
