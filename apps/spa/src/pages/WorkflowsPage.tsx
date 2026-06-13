import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { Folder } from '@tietide/shared';
import { useWorkflowsStore, type FolderFilter } from '@/stores/workflowsStore';
import type { WorkflowListItem } from '@/api/workflows';
import { useFoldersStore } from '@/stores/foldersStore';
import { useTagsStore } from '@/stores/tagsStore';
import { WorkflowRow } from '@/components/dashboard/WorkflowRow';
import { NewWorkflowModal } from '@/components/dashboard/NewWorkflowModal';
import { DeleteWorkflowDialog } from '@/components/dashboard/DeleteWorkflowDialog';
import { BulkActionsToolbar } from '@/components/dashboard/BulkActionsToolbar';
import { BulkDeleteDialog } from '@/components/dashboard/BulkDeleteDialog';
import { ImportWorkflowButton } from '@/components/dashboard/ImportWorkflowButton';
import {
  FolderTree,
  FOLDER_TREE_ALL_DROP_ID,
  FOLDER_TREE_ROOT_DROP_ID,
} from '@/components/workflows/FolderTree';
import { FolderDeleteDialog } from '@/components/workflows/FolderDeleteDialog';
import { TagFilter } from '@/components/workflows/TagFilter';
import { TagManagerDialog } from '@/components/workflows/TagManagerDialog';
import { DraggableWorkflowRow } from '@/components/workflows/DraggableWorkflowRow';
import { useToastStore } from '@/stores/toastStore';
import {
  getWorkflowDocs,
  saveWorkflowDocs,
  startWorkflowDocsRegeneration,
  type WorkflowDocumentationResponse,
} from '@/api/ai';
import { DocumentationModal } from '@/components/documentation/DocumentationModal';
import { DOC_POLL_INTERVAL_MS, DOC_POLL_MAX_ATTEMPTS } from '@/stores/documentationStore';
import { cn } from '@/utils/cn';

interface RowDocsState {
  isExpanded: boolean;
  isGenerating: boolean;
  content: string | null;
  error: string | null;
}

const emptyRowDocs: RowDocsState = {
  isExpanded: false,
  isGenerating: false,
  content: null,
  error: null,
};

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const parseFolderParam = (raw: string | null): FolderFilter => {
  if (raw === null) return undefined;
  if (raw === 'null') return null;
  return raw;
};

const folderFilterToParam = (filter: FolderFilter): string | null => {
  if (filter === undefined) return null;
  if (filter === null) return 'null';
  return filter;
};

const collectDescendantIds = (folders: Folder[], rootId: string): string[] => {
  const result: string[] = [];
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const f of folders) {
      if (f.parentFolderId === current) {
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
};

export function WorkflowsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    workflows,
    status,
    error,
    fetch,
    create,
    remove,
    toggleActive,
    rename,
    moveToFolder,
    setTags,
    setDocumentationMeta,
    selectedFolderId,
    selectedTagIds,
    setSelectedFolderId,
    setSelectedTagIds,
  } = useWorkflowsStore();
  const folders = useFoldersStore((s) => s.folders);
  const fetchFolders = useFoldersStore((s) => s.fetch);
  const createFolder = useFoldersStore((s) => s.create);
  const removeFolder = useFoldersStore((s) => s.remove);
  const tags = useTagsStore((s) => s.tags);
  const fetchTags = useTagsStore((s) => s.fetch);
  const createTag = useTagsStore((s) => s.create);
  const updateTag = useTagsStore((s) => s.update);
  const deleteTag = useTagsStore((s) => s.remove);
  const toast = useToastStore((s) => s.show);

  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<WorkflowListItem | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [docsByWorkflow, setDocsByWorkflow] = useState<Record<string, RowDocsState>>({});
  const [docsModalId, setDocsModalId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  // Per-row poll generation. A newer regenerate/view supersedes any in-flight
  // poll loop for that workflow so stale results never clobber fresher state
  // (mirrors the activePoll token in documentationStore).
  const docsPollTokens = useRef<Record<string, number>>({});

  // Hydrate filter selections from URL on mount and when URL changes externally.
  useEffect(() => {
    const folderRaw = searchParams.get('folderId');
    const folder = parseFolderParam(folderRaw);
    const tagsParam = searchParams.get('tagIds');
    const tagIds = tagsParam ? tagsParam.split(',').filter(Boolean) : [];
    setSelectedFolderId(folder);
    setSelectedTagIds(tagIds);
    void fetch({ folderId: folder, tagIds });
  }, [searchParams, fetch, setSelectedFolderId, setSelectedTagIds]);

  useEffect(() => {
    void fetchFolders();
    void fetchTags();
  }, [fetchFolders, fetchTags]);

  const updateUrlFilters = useCallback(
    (folder: FolderFilter, tagIds: string[]): void => {
      const next = new URLSearchParams(searchParams);
      const folderParam = folderFilterToParam(folder);
      if (folderParam === null) next.delete('folderId');
      else next.set('folderId', folderParam);
      if (tagIds.length === 0) next.delete('tagIds');
      else next.set('tagIds', tagIds.join(','));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleSelectFolder = (folder: FolderFilter): void => {
    setSelectedFolderId(folder);
    updateUrlFilters(folder, selectedTagIds);
  };

  const handleToggleTag = (tagId: string): void => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    updateUrlFilters(selectedFolderId, next);
  };

  const handleClearTags = (): void => {
    setSelectedTagIds([]);
    updateUrlFilters(selectedFolderId, []);
  };

  const handleCreateFolder = async (name: string, parentFolderId: string | null): Promise<void> => {
    try {
      await createFolder({ name, parentFolderId });
      toast({ tone: 'success', message: 'Folder created' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create folder') });
    }
  };

  const folderDeleteCounts = useMemo(() => {
    if (!folderToDelete) return { childFolders: 0, workflows: 0 };
    const descendants = collectDescendantIds(folders, folderToDelete.id);
    const allIds = new Set<string>([folderToDelete.id, ...descendants]);
    const wfCount = workflows.filter((w) => w.folderId !== null && allIds.has(w.folderId)).length;
    return { childFolders: descendants.length, workflows: wfCount };
  }, [folderToDelete, folders, workflows]);

  const handleConfirmFolderDelete = async (): Promise<void> => {
    if (!folderToDelete) return;
    try {
      const result = await removeFolder(folderToDelete.id);
      // If the deleted folder was the active filter, return to "All".
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(undefined);
        updateUrlFilters(undefined, selectedTagIds);
      } else {
        // Refresh the workflow list since cascade may have deleted some.
        void fetch();
      }
      setFolderToDelete(null);
      toast({
        tone: 'success',
        message:
          result.deletedWorkflows > 0
            ? `Deleted ${result.deletedFolders} folder${result.deletedFolders === 1 ? '' : 's'} and ${result.deletedWorkflows} workflow${result.deletedWorkflows === 1 ? '' : 's'}`
            : 'Folder deleted',
      });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not delete folder') });
    }
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const workflowId = String(active.id);
    let folderId: string | null;
    if (overId === FOLDER_TREE_ROOT_DROP_ID) {
      folderId = null;
    } else if (overId === FOLDER_TREE_ALL_DROP_ID) {
      // Dropping on "All" doesn't make sense as a move target.
      return;
    } else {
      folderId = overId;
    }

    const wf = workflows.find((w) => w.id === workflowId);
    if (!wf || wf.folderId === folderId) return;

    void moveToFolder(workflowId, folderId)
      .then(() => {
        toast({ tone: 'success', message: 'Workflow moved' });
      })
      .catch((err: unknown) => {
        toast({ tone: 'error', message: errorMessage(err, 'Could not move workflow') });
      });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const updateRowDocs = (id: string, patch: Partial<RowDocsState>): void => {
    setDocsByWorkflow((prev) => ({
      ...prev,
      [id]: { ...emptyRowDocs, ...prev[id], ...patch },
    }));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((w) => w.name.toLowerCase().includes(q));
  }, [workflows, query]);

  // Prune selections to only IDs that are still in the current workflow list.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const liveIds = new Set(workflows.map((w) => w.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (liveIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [workflows]);

  // Indeterminate state on the select-all checkbox.
  useEffect(() => {
    if (!selectAllRef.current) return;
    const total = filtered.length;
    const sel = filtered.filter((w) => selectedIds.has(w.id)).length;
    selectAllRef.current.indeterminate = sel > 0 && sel < total;
  }, [filtered, selectedIds]);

  const toggleSelect = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((): void => {
    setSelectedIds((prev) => {
      const allIds = filtered.map((w) => w.id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of allIds) next.add(id);
      return next;
    });
  }, [filtered]);

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  const handleRename = useCallback(
    async (id: string, name: string): Promise<void> => {
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        toast({ tone: 'error', message: 'Workflow name cannot be empty' });
        throw new Error('Empty name');
      }
      try {
        await rename(id, trimmed);
        toast({ tone: 'success', message: 'Workflow renamed' });
      } catch (err) {
        toast({ tone: 'error', message: errorMessage(err, 'Could not rename workflow') });
        throw err;
      }
    },
    [rename, toast],
  );

  const runBulk = useCallback(
    async (
      successMessage: (count: number) => string,
      failurePrefix: string,
      action: (workflow: WorkflowListItem) => Promise<unknown>,
    ): Promise<void> => {
      const targets = workflows.filter((w) => selectedIds.has(w.id));
      if (targets.length === 0) return;
      setBulkBusy(true);
      try {
        const results = await Promise.allSettled(targets.map((wf) => action(wf)));
        const failedNames: string[] = [];
        results.forEach((r, idx) => {
          if (r.status === 'rejected') failedNames.push(targets[idx].name);
        });
        if (failedNames.length === 0) {
          toast({ tone: 'success', message: successMessage(targets.length) });
          clearSelection();
        } else {
          toast({
            tone: 'error',
            message: `${failurePrefix}: ${failedNames.join(', ')}`,
          });
        }
      } finally {
        setBulkBusy(false);
      }
    },
    [workflows, selectedIds, toast, clearSelection],
  );

  const handleBulkActivate = useCallback(async (): Promise<void> => {
    await runBulk(
      (n) => `Activated ${n} workflow${n === 1 ? '' : 's'}`,
      'Failed to activate',
      (wf) => toggleActive(wf.id, true),
    );
  }, [runBulk, toggleActive]);

  const handleBulkDeactivate = useCallback(async (): Promise<void> => {
    await runBulk(
      (n) => `Deactivated ${n} workflow${n === 1 ? '' : 's'}`,
      'Failed to deactivate',
      (wf) => toggleActive(wf.id, false),
    );
  }, [runBulk, toggleActive]);

  const handleBulkMove = useCallback(
    async (folderId: string | null): Promise<void> => {
      await runBulk(
        (n) => `Moved ${n} workflow${n === 1 ? '' : 's'}`,
        'Failed to move',
        (wf) => moveToFolder(wf.id, folderId),
      );
    },
    [runBulk, moveToFolder],
  );

  const handleSetTags = useCallback(
    async (id: string, tagIds: string[]): Promise<void> => {
      try {
        await setTags(id, tagIds);
      } catch (err) {
        toast({ tone: 'error', message: errorMessage(err, 'Could not update tags') });
      }
    },
    [setTags, toast],
  );

  const handleBulkAddTags = useCallback(
    async (tagIds: string[]): Promise<void> => {
      if (tagIds.length === 0) return;
      await runBulk(
        (n) => `Tagged ${n} workflow${n === 1 ? '' : 's'}`,
        'Failed to tag',
        (wf) => {
          // Union with existing tags so a bulk add never clobbers per-workflow tags.
          const existing = wf.tags.map((t) => t.id);
          const merged = [...existing, ...tagIds.filter((t) => !existing.includes(t))];
          return setTags(wf.id, merged);
        },
      );
    },
    [runBulk, setTags],
  );

  const handleBulkDeleteConfirm = useCallback(async (): Promise<void> => {
    await runBulk(
      (n) => `Deleted ${n} workflow${n === 1 ? '' : 's'}`,
      'Failed to delete',
      (wf) => remove(wf.id),
    );
    setBulkDeleteOpen(false);
  }, [runBulk, remove]);

  const handleOpen = (id: string): void => {
    navigate(`/workflows/${id}`, { state: { from: '/workflows' } });
  };

  const handleToggle = async (id: string, next: boolean): Promise<void> => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleActive(id, next);
      toast({ tone: 'success', message: 'Workflow updated' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not update workflow') });
    } finally {
      setTogglingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    }
  };

  const handleCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    try {
      const created = await create(body);
      toast({ tone: 'success', message: 'Workflow created' });
      setShowCreate(false);
      navigate(`/workflows/${created.id}`, { state: { from: '/workflows' } });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create workflow') });
      throw err;
    }
  };

  const handleImported = (created: WorkflowListItem): void => {
    void fetch();
    navigate(`/workflows/${created.id}`, { state: { from: '/workflows' } });
  };

  const handleDeleteConfirm = async (id: string): Promise<void> => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await remove(id);
      toast({ tone: 'success', message: 'Workflow deleted' });
      setToDelete(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not delete workflow') });
    } finally {
      setDeletingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    }
  };

  const regenerateDocs = async (id: string): Promise<void> => {
    // Generation runs in the background (it can exceed edge proxy timeouts on a
    // CPU-only model), so we kick it off and poll until a doc fresher than the
    // current one appears. Readiness is detected via generatedAt advancing.
    const token = (docsPollTokens.current[id] ?? 0) + 1;
    docsPollTokens.current[id] = token;
    const isCurrent = (): boolean => docsPollTokens.current[id] === token;

    const existing = workflows.find((w) => w.id === id)?.documentation?.generatedAt ?? null;
    const baselineIso = existing ? new Date(existing).toISOString() : null;
    updateRowDocs(id, { isGenerating: true, error: null });
    try {
      await startWorkflowDocsRegeneration(id);
      if (!isCurrent()) return;

      let fresh: WorkflowDocumentationResponse | null = null;
      for (let attempt = 0; attempt < DOC_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, DOC_POLL_INTERVAL_MS));
        if (!isCurrent()) return;
        let docResp: WorkflowDocumentationResponse | null = null;
        try {
          docResp = await getWorkflowDocs(id);
        } catch {
          continue;
        }
        if (!isCurrent()) return;
        if (docResp && (baselineIso === null || docResp.generatedAt > baselineIso)) {
          fresh = docResp;
          break;
        }
      }
      if (!isCurrent()) return;
      if (!fresh) {
        throw new Error('Documentation is taking longer than expected. Please try again.');
      }

      updateRowDocs(id, {
        isGenerating: false,
        content: fresh.documentation,
        error: null,
        isExpanded: true,
      });
      setDocumentationMeta(id, {
        generatedAt: new Date(fresh.generatedAt),
        version: fresh.version,
      });
    } catch (err) {
      if (!isCurrent()) return;
      updateRowDocs(id, {
        isGenerating: false,
        error: errorMessage(err, 'Could not generate documentation'),
        isExpanded: true,
      });
    }
  };

  const viewDocs = async (id: string): Promise<void> => {
    // Never interrupt an in-flight regeneration with a stale one-shot fetch.
    if (docsByWorkflow[id]?.isGenerating) return;
    updateRowDocs(id, { isGenerating: true, error: null });
    try {
      const response = await getWorkflowDocs(id);
      if (!response) {
        updateRowDocs(id, {
          isGenerating: false,
          content: null,
          error: 'Documentation not available yet. Click Generate to create it.',
          isExpanded: true,
        });
        return;
      }
      updateRowDocs(id, {
        isGenerating: false,
        content: response.documentation,
        error: null,
        isExpanded: true,
      });
      setDocumentationMeta(id, {
        generatedAt: new Date(response.generatedAt),
        version: response.version,
      });
    } catch (err) {
      updateRowDocs(id, {
        isGenerating: false,
        error: errorMessage(err, 'Could not load documentation'),
        isExpanded: true,
      });
    }
  };

  const handleOpenDocs = (id: string): void => {
    setDocsModalId(id);
    const state = docsByWorkflow[id];
    const hasDocs = workflows.find((w) => w.id === id)?.documentation != null;
    // Lazily load the cached doc the first time the pop-up opens (only when one
    // exists — otherwise the modal shows its "Generate" empty state). Never
    // interrupt an in-flight regeneration with a competing stale fetch.
    if (hasDocs && !state?.content && !state?.isGenerating) {
      void viewDocs(id);
    }
  };

  const handleSaveDocs = async (id: string, documentation: string): Promise<void> => {
    const saved = await saveWorkflowDocs(id, documentation);
    updateRowDocs(id, { isGenerating: false, content: saved.documentation, error: null });
    setDocumentationMeta(id, {
      generatedAt: new Date(saved.generatedAt),
      version: saved.version,
    });
  };

  const isFiltering = query.trim().length > 0;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col">
        <header className="border-b border-white/5 bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold">Workflows</h1>
              <p className="text-xs text-text-secondary">
                Build, automate, and monitor your integrations.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
          <FolderTree
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={handleSelectFolder}
            onCreateFolder={handleCreateFolder}
            onRequestDelete={(folder) => setFolderToDelete(folder)}
          />

          <main data-tour="workflows-list" className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="relative flex flex-1 items-center">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search workflows…"
                  aria-label="Search workflows"
                  className={cn(
                    'w-full rounded-md border border-white/5 bg-elevated py-2 pl-9 pr-3',
                    'text-sm text-text-primary placeholder:text-text-muted',
                    'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
                  )}
                />
              </label>
              <ImportWorkflowButton variant="secondary" onImported={handleImported} />
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                data-tour="workflows-new"
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition',
                  'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
                )}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                New workflow
              </button>
            </div>

            <div
              data-tour="workflows-tags"
              className="mb-6 rounded-md border border-white/5 bg-surface/40 px-3 py-2"
            >
              <TagFilter
                tags={tags}
                selectedIds={selectedTagIds}
                onToggle={handleToggleTag}
                onClear={handleClearTags}
                onManage={() => setShowTagManager(true)}
              />
            </div>

            {status === 'loading' && workflows.length === 0 && (
              <p className="text-sm text-text-secondary">Loading workflows…</p>
            )}

            {status === 'error' && (
              <div
                role="alert"
                className="flex flex-col items-start gap-2 rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
              >
                <p>{error ?? 'Something went wrong'}</p>
                <button
                  type="button"
                  onClick={() => void fetch()}
                  className="rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error transition hover:bg-error/30"
                >
                  Retry
                </button>
              </div>
            )}

            {status === 'ready' && workflows.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 bg-surface/40 p-12 text-center">
                <h2 className="text-base font-semibold text-text-primary">No workflows yet</h2>
                <p className="max-w-md text-sm text-text-secondary">
                  No workflows yet — start from the{' '}
                  <Link
                    to="/library"
                    className="font-semibold text-accent-teal hover:text-accent-teal-hover"
                  >
                    Library
                  </Link>{' '}
                  or build from scratch.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={cn(
                    'mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
                    'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
                  )}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create your first workflow
                </button>
              </div>
            )}

            {workflows.length > 0 && (
              <>
                {selectedIds.size > 0 && (
                  <BulkActionsToolbar
                    count={selectedIds.size}
                    busy={bulkBusy}
                    folders={folders}
                    tags={tags}
                    onActivate={handleBulkActivate}
                    onDeactivate={handleBulkDeactivate}
                    onMove={handleBulkMove}
                    onAddTags={handleBulkAddTags}
                    onManageTags={() => setShowTagManager(true)}
                    onDelete={() => setBulkDeleteOpen(true)}
                    onClear={clearSelection}
                  />
                )}
                {isFiltering && filtered.length === 0 && (
                  <p className="text-sm text-text-secondary">No workflows match “{query}”.</p>
                )}
                {filtered.length > 0 && (
                  <div className="mb-2 flex items-center gap-3 px-1 py-1 text-xs text-text-muted">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all workflows"
                      checked={filtered.length > 0 && filtered.every((w) => selectedIds.has(w.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer rounded border-white/20 bg-elevated text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
                    />
                    <span>Select all</span>
                  </div>
                )}
                <ul aria-label="Workflows" className="flex flex-col gap-3">
                  {filtered.map((wf) => {
                    return (
                      <DraggableWorkflowRow key={wf.id} workflowId={wf.id}>
                        <WorkflowRow
                          workflow={wf}
                          selected={selectedIds.has(wf.id)}
                          onOpen={handleOpen}
                          onToggleActive={handleToggle}
                          onDelete={(id) => {
                            const target = workflows.find((w) => w.id === id) ?? null;
                            setToDelete(target);
                          }}
                          onOpenDocs={handleOpenDocs}
                          onToggleSelect={toggleSelect}
                          onRename={handleRename}
                          availableTags={tags}
                          onSetTags={handleSetTags}
                          onManageTags={() => setShowTagManager(true)}
                          isToggling={togglingIds.has(wf.id)}
                          isDeleting={deletingIds.has(wf.id)}
                        />
                      </DraggableWorkflowRow>
                    );
                  })}
                </ul>
              </>
            )}
          </main>
        </div>

        {showCreate && (
          <NewWorkflowModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
        )}

        {toDelete && (
          <DeleteWorkflowDialog
            workflow={toDelete}
            onClose={() => setToDelete(null)}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {bulkDeleteOpen && (
          <BulkDeleteDialog
            count={selectedIds.size}
            onClose={() => setBulkDeleteOpen(false)}
            onConfirm={handleBulkDeleteConfirm}
          />
        )}

        {folderToDelete && (
          <FolderDeleteDialog
            folder={folderToDelete}
            counts={folderDeleteCounts}
            onConfirm={handleConfirmFolderDelete}
            onClose={() => setFolderToDelete(null)}
          />
        )}

        {showTagManager && (
          <TagManagerDialog
            tags={tags}
            onClose={() => setShowTagManager(false)}
            onCreate={async (name, color) => {
              try {
                await createTag({ name, color });
              } catch (err) {
                toast({ tone: 'error', message: errorMessage(err, 'Could not create tag') });
                throw err;
              }
            }}
            onUpdate={async (id, patch) => {
              try {
                await updateTag(id, patch);
              } catch (err) {
                toast({ tone: 'error', message: errorMessage(err, 'Could not update tag') });
              }
            }}
            onDelete={async (id) => {
              try {
                await deleteTag(id);
                if (selectedTagIds.includes(id)) {
                  const next = selectedTagIds.filter((t) => t !== id);
                  setSelectedTagIds(next);
                  updateUrlFilters(selectedFolderId, next);
                }
              } catch (err) {
                toast({ tone: 'error', message: errorMessage(err, 'Could not delete tag') });
              }
            }}
          />
        )}

        {docsModalId &&
          (() => {
            const wf = workflows.find((w) => w.id === docsModalId);
            const state = docsByWorkflow[docsModalId] ?? emptyRowDocs;
            const status: 'idle' | 'loading' | 'ready' | 'error' = state.isGenerating
              ? 'loading'
              : state.error
                ? 'error'
                : state.content
                  ? 'ready'
                  : 'idle';
            const docs: WorkflowDocumentationResponse | null = state.content
              ? {
                  workflowId: docsModalId,
                  version: wf?.documentation?.version ?? 1,
                  documentation: state.content,
                  sections: {},
                  model: '',
                  generatedAt: new Date(wf?.documentation?.generatedAt ?? Date.now()).toISOString(),
                }
              : null;
            return (
              <DocumentationModal
                workflowName={wf?.name ?? 'Workflow'}
                status={status}
                docs={docs}
                error={state.error}
                onRegenerate={() => void regenerateDocs(docsModalId)}
                onSave={(documentation) => handleSaveDocs(docsModalId, documentation)}
                onClose={() => setDocsModalId(null)}
              />
            );
          })()}
      </div>
    </DndContext>
  );
}

export default WorkflowsPage;
