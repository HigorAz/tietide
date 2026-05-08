import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { Folder, Workflow } from '@tietide/shared';
import { useWorkflowsStore, type FolderFilter } from '@/stores/workflowsStore';
import { useFoldersStore } from '@/stores/foldersStore';
import { useTagsStore } from '@/stores/tagsStore';
import { WorkflowRow } from '@/components/dashboard/WorkflowRow';
import { NewWorkflowModal } from '@/components/dashboard/NewWorkflowModal';
import { DeleteWorkflowDialog } from '@/components/dashboard/DeleteWorkflowDialog';
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
import { getWorkflowDocs, regenerateWorkflowDocs } from '@/api/ai';
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
    moveToFolder,
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
  const [toDelete, setToDelete] = useState<Workflow | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [docsByWorkflow, setDocsByWorkflow] = useState<Record<string, RowDocsState>>({});

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

  const handleImported = (created: Workflow): void => {
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
    updateRowDocs(id, { isGenerating: true, error: null });
    try {
      const response = await regenerateWorkflowDocs(id);
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
        error: errorMessage(err, 'Could not generate documentation'),
        isExpanded: true,
      });
    }
  };

  const viewDocs = async (id: string): Promise<void> => {
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

  const handleGenerateDocs = (id: string): void => {
    void regenerateDocs(id);
  };

  const handleToggleDocsExpanded = (id: string): void => {
    const state = docsByWorkflow[id] ?? emptyRowDocs;
    if (state.isExpanded) {
      updateRowDocs(id, { isExpanded: false });
      return;
    }
    updateRowDocs(id, { isExpanded: true });
    if (!state.content) {
      void viewDocs(id);
    }
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

        <div className="mx-auto flex w-full max-w-6xl flex-1">
          <FolderTree
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={handleSelectFolder}
            onCreateFolder={handleCreateFolder}
            onRequestDelete={(folder) => setFolderToDelete(folder)}
          />

          <main className="flex-1 px-6 py-8">
            <div className="mb-4 flex items-center gap-3">
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
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition',
                  'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
                )}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                New workflow
              </button>
            </div>

            <div className="mb-6 rounded-md border border-white/5 bg-surface/40 px-3 py-2">
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
                {isFiltering && filtered.length === 0 && (
                  <p className="text-sm text-text-secondary">No workflows match “{query}”.</p>
                )}
                <ul aria-label="Workflows" className="flex flex-col gap-3">
                  {filtered.map((wf) => {
                    const docs = docsByWorkflow[wf.id] ?? emptyRowDocs;
                    return (
                      <DraggableWorkflowRow key={wf.id} workflowId={wf.id}>
                        <WorkflowRow
                          workflow={wf}
                          isExpanded={docs.isExpanded}
                          isGeneratingDocs={docs.isGenerating}
                          docsContent={docs.content}
                          docsError={docs.error}
                          onOpen={handleOpen}
                          onToggleActive={handleToggle}
                          onDelete={(id) => {
                            const target = workflows.find((w) => w.id === id) ?? null;
                            setToDelete(target);
                          }}
                          onGenerateDocs={handleGenerateDocs}
                          onToggleDocsExpanded={handleToggleDocsExpanded}
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
      </div>
    </DndContext>
  );
}

export default WorkflowsPage;
