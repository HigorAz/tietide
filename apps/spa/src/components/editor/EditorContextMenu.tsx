import { useEffect, useRef } from 'react';
import { Clipboard, ClipboardCopy, ClipboardPaste, Code2, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EditorContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  canCopy: boolean;
  canDelete: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCopyAsJson: () => void;
  onPasteFromJson: () => void;
  onDelete: () => void;
}

interface ItemProps {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

const Item = ({ label, icon, disabled, onClick }: ItemProps): React.ReactElement => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-100 transition-colors',
      'hover:bg-accent-teal/15 focus:bg-accent-teal/20 focus:outline-none',
      'disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent',
    )}
  >
    <span className="flex h-3.5 w-3.5 items-center justify-center text-accent-teal">{icon}</span>
    {label}
  </button>
);

export function EditorContextMenu({
  open,
  x,
  y,
  canCopy,
  canDelete,
  onClose,
  onCopy,
  onPaste,
  onCopyAsJson,
  onPasteFromJson,
  onDelete,
}: EditorContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const handleMouseDown = (event: MouseEvent): void => {
      const node = menuRef.current;
      if (node && event.target instanceof globalThis.Node && node.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const select = (action: () => void): (() => void) => {
    return () => {
      action();
      onClose();
    };
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[10rem] rounded-md border border-white/10 bg-slate-800/95 py-1 shadow-xl backdrop-blur-sm"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <Item
        label="Copy"
        icon={<ClipboardCopy size={14} />}
        disabled={!canCopy}
        onClick={select(onCopy)}
      />
      <Item label="Paste" icon={<ClipboardPaste size={14} />} onClick={select(onPaste)} />
      <div className="my-1 h-px bg-white/10" />
      <Item
        label="Copy as JSON"
        icon={<Code2 size={14} />}
        disabled={!canCopy}
        onClick={select(onCopyAsJson)}
      />
      <Item
        label="Paste from JSON"
        icon={<Clipboard size={14} />}
        onClick={select(onPasteFromJson)}
      />
      <div className="my-1 h-px bg-white/10" />
      <Item
        label="Delete"
        icon={<Trash2 size={14} />}
        disabled={!canDelete}
        onClick={select(onDelete)}
      />
    </div>
  );
}
