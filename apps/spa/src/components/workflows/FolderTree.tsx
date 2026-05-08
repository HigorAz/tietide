import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderIcon,
  FolderOpen,
  Inbox,
  List,
  Plus,
  Trash2,
} from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type { Folder } from '@tietide/shared';
import { cn } from '@/utils/cn';
import type { FolderFilter } from '@/stores/workflowsStore';

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: FolderFilter;
  onSelect: (folderId: FolderFilter) => void;
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<void> | void;
  onRequestDelete: (folder: Folder) => void;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
}

const buildTree = (folders: Folder[]): TreeNode[] => {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentFolderId) ?? [];
    list.push(f);
    byParent.set(f.parentFolderId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const buildNodes = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((f) => ({
      folder: f,
      children: buildNodes(f.id),
    }));
  return buildNodes(null);
};

const ROOT_DROP_ID = '__root__';
const ALL_DROP_ID = '__all__';

interface DroppablePinProps {
  id: string;
  selected: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
}

function DroppablePin({ id, selected, onClick, icon, label }: DroppablePinProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition',
        selected ? 'bg-accent-teal/15 text-accent-teal' : 'text-text-secondary hover:bg-white/5',
        isOver && 'ring-1 ring-accent-teal',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

interface FolderNodeRowProps {
  node: TreeNode;
  selectedFolderId: FolderFilter;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onSelect: (id: string) => void;
  onRequestDelete: (folder: Folder) => void;
  onAddChild: (parentId: string) => void;
  depth: number;
}

function FolderNodeRow({
  node,
  selectedFolderId,
  expandedIds,
  toggleExpanded,
  onSelect,
  onRequestDelete,
  onAddChild,
  depth,
}: FolderNodeRowProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: node.folder.id });
  const isExpanded = expandedIds.has(node.folder.id);
  const isSelected = selectedFolderId === node.folder.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        ref={setNodeRef}
        className={cn(
          'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition',
          isSelected
            ? 'bg-accent-teal/15 text-accent-teal'
            : 'text-text-secondary hover:bg-white/5',
          isOver && 'ring-1 ring-accent-teal',
        )}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        <button
          type="button"
          onClick={() => toggleExpanded(node.folder.id)}
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          className="grid h-4 w-4 place-items-center text-text-muted hover:text-text-primary"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.folder.id)}
          className="flex flex-1 items-center gap-2 truncate text-left"
        >
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <FolderIcon className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="truncate">{node.folder.name}</span>
        </button>
        <button
          type="button"
          onClick={() => onAddChild(node.folder.id)}
          aria-label={`Add sub-folder under ${node.folder.name}`}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(node.folder)}
          aria-label={`Delete folder ${node.folder.name}`}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {isExpanded &&
        node.children.map((child) => (
          <FolderNodeRow
            key={child.folder.id}
            node={child}
            selectedFolderId={selectedFolderId}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onSelect={onSelect}
            onRequestDelete={onRequestDelete}
            onAddChild={onAddChild}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
  onCreateFolder,
  onRequestDelete,
}: FolderTreeProps): JSX.Element {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState<{ parentId: string | null } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleExpanded = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitCreate = async (): Promise<void> => {
    const name = draftName.trim();
    if (!name || !showCreate) return;
    setSubmitting(true);
    try {
      await onCreateFolder(name, showCreate.parentId);
      setDraftName('');
      setShowCreate(null);
      if (showCreate.parentId !== null) {
        setExpandedIds((prev) => new Set(prev).add(showCreate.parentId!));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside
      aria-label="Folders"
      className="flex w-60 shrink-0 flex-col gap-1 border-r border-white/5 bg-surface/40 p-3"
    >
      <DroppablePin
        id={ALL_DROP_ID}
        selected={selectedFolderId === undefined}
        onClick={() => onSelect(undefined)}
        icon={<List className="h-4 w-4" aria-hidden />}
        label="All workflows"
      />
      <DroppablePin
        id={ROOT_DROP_ID}
        selected={selectedFolderId === null}
        onClick={() => onSelect(null)}
        icon={<Inbox className="h-4 w-4" aria-hidden />}
        label="Unfiled"
      />

      <div className="my-2 h-px bg-white/5" />

      {tree.map((node) => (
        <FolderNodeRow
          key={node.folder.id}
          node={node}
          selectedFolderId={selectedFolderId}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
          onAddChild={(parentId) => setShowCreate({ parentId })}
          depth={0}
        />
      ))}

      {showCreate ? (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowCreate(null);
                setDraftName('');
              }
            }}
            placeholder="Folder name"
            aria-label="New folder name"
            className="w-full rounded-md border border-white/10 bg-elevated px-2 py-1 text-sm focus:border-accent-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !draftName.trim()}
            className="rounded-md bg-accent-teal px-2 py-1 text-xs font-semibold text-deep-blue disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate({ parentId: null })}
          className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> New folder
        </button>
      )}
    </aside>
  );
}

export const FOLDER_TREE_ROOT_DROP_ID = ROOT_DROP_ID;
export const FOLDER_TREE_ALL_DROP_ID = ALL_DROP_ID;
