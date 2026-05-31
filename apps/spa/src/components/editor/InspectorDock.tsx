import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useExecutionLiveStore, type ExecutionLiveStatus } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { InspectorRunPanel } from './InspectorRunPanel';
import { InspectorLogsPanel } from './InspectorLogsPanel';
import { InspectorDocumentationPanel } from './InspectorDocumentationPanel';
import { InspectorOverviewPanel } from './InspectorOverviewPanel';
import { ReplayScrubber } from './ReplayScrubber';
import { VersionHistoryPanel } from './VersionHistoryPanel';

export const INSPECTOR_DOCK_STORAGE_KEY = 'tietide-inspector-collapsed';
export const INSPECTOR_DOCK_SIZE_STORAGE_KEY = 'tietide-inspector-size';

type DockTab = 'overview' | 'run' | 'logs' | 'versions' | 'documentation';

interface DockSize {
  width: number;
  height: number;
}

// Matches the legacy `w-80 h-72` Tailwind defaults so existing users see no
// visual change on first load.
const DEFAULT_SIZE: DockSize = { width: 320, height: 288 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
// Hard ceiling so a runaway drag can't push the panel beyond reasonable
// screen estimates. At render time we also soft-clamp to 90vw / 80vh.
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

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

const clampSize = (raw: { width: number; height: number }): DockSize => ({
  width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(raw.width))),
  height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(raw.height))),
});

const readSize = (): DockSize => {
  try {
    const raw = localStorage.getItem(INSPECTOR_DOCK_SIZE_STORAGE_KEY);
    if (raw === null) return DEFAULT_SIZE;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { width?: unknown }).width === 'number' &&
      typeof (parsed as { height?: unknown }).height === 'number'
    ) {
      return clampSize(parsed as { width: number; height: number });
    }
    return DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
};

const writeSize = (size: DockSize): void => {
  try {
    localStorage.setItem(INSPECTOR_DOCK_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // ignore
  }
};

export function InspectorDock(): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const [size, setSize] = useState<DockSize>(() => readSize());
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

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Anchored top-right: dragging the SW handle DOWN-LEFT grows the dock.
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = size.width;
      const startH = size.height;
      // Track the most recent size from mousemove so mouseUp can persist it
      // without re-reading event coords (jsdom-emitted mouseUp may omit them).
      let latestSize: DockSize = { width: startW, height: startH };

      const onMove = (e: MouseEvent): void => {
        latestSize = clampSize({
          // Drag LEFT widens (anchored right); drag DOWN heightens (anchored top).
          width: startW + (startX - e.clientX),
          height: startH + (e.clientY - startY),
        });
        setSize(latestSize);
      };
      const onUp = (): void => {
        writeSize(latestSize);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [size.width, size.height],
  );

  return (
    <div
      data-testid="inspector-dock"
      data-collapsed={collapsed ? 'true' : 'false'}
      onPointerDown={stopPointerPropagation}
      onWheel={(e) => e.stopPropagation()}
      style={
        collapsed
          ? undefined
          : {
              width: `${size.width}px`,
              height: `${size.height}px`,
              maxWidth: '90vw',
              maxHeight: '80vh',
            }
      }
      className={cn(
        // Re-anchored below the editor toolbar (top-right) so the bottom-right
        // slot is free for the DataPillPicker.
        'absolute right-4 top-16 z-10 flex flex-col overflow-hidden rounded-md border border-white/5 bg-elevated shadow-lg',
        collapsed ? 'h-9 w-80' : '',
      )}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-label="Resize inspector"
          aria-orientation="horizontal"
          data-testid="inspector-dock-resize-handle"
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize bg-transparent before:absolute before:bottom-0.5 before:left-0.5 before:h-2 before:w-2 before:rounded-sm before:border-b-2 before:border-l-2 before:border-text-secondary/40 hover:before:border-accent-teal"
        />
      )}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DockTab)}
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-between border-b border-white/5 pr-1">
          <TabsList aria-label="Inspector" className="overflow-x-auto border-b-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="documentation">Docs</TabsTrigger>
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
            <ReplayScrubber />
            <TabsContent
              value="overview"
              forceMount
              className={cn('min-h-0 flex-1', activeTab !== 'overview' && 'hidden')}
            >
              <InspectorOverviewPanel />
            </TabsContent>
            <TabsContent value="run" className="min-h-0 flex-1">
              <InspectorRunPanel />
            </TabsContent>
            <TabsContent value="logs" className="min-h-0 flex-1">
              <InspectorLogsPanel />
            </TabsContent>
            <TabsContent value="versions" className="min-h-0 flex-1">
              <VersionHistoryPanel />
            </TabsContent>
            <TabsContent value="documentation" className="min-h-0 flex-1">
              <InspectorDocumentationPanel />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
