export type ShortcutCategory = 'General' | 'Edit' | 'Selection' | 'Run' | 'Canvas';

export type ShortcutId =
  | 'save'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'toggleSkip'
  | 'run'
  | 'test'
  | 'pan'
  | 'cheatsheet';

export interface ShortcutDefinition {
  id: ShortcutId;
  category: ShortcutCategory;
  description: string;
  displayKeys: string;
  hotkey: string | null;
  preventDefault: boolean;
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  'General',
  'Edit',
  'Selection',
  'Run',
  'Canvas',
];

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'save',
    category: 'General',
    description: 'Save workflow',
    displayKeys: 'Ctrl/⌘ + S',
    hotkey: 'mod+s',
    preventDefault: true,
  },
  {
    id: 'cheatsheet',
    category: 'General',
    description: 'Open keyboard shortcut cheat sheet',
    displayKeys: '?',
    hotkey: 'shift+slash',
    preventDefault: true,
  },
  {
    id: 'undo',
    category: 'Edit',
    description: 'Undo last change',
    displayKeys: 'Ctrl/⌘ + Z',
    hotkey: 'mod+z',
    preventDefault: true,
  },
  {
    id: 'redo',
    category: 'Edit',
    description: 'Redo last undone change',
    displayKeys: 'Ctrl/⌘ + Shift + Z',
    hotkey: 'mod+shift+z',
    preventDefault: true,
  },
  {
    id: 'delete',
    category: 'Selection',
    description: 'Delete selected nodes and their edges',
    displayKeys: 'Delete / Backspace',
    hotkey: 'delete, backspace',
    preventDefault: false,
  },
  {
    id: 'duplicate',
    category: 'Selection',
    description: 'Duplicate selected nodes',
    displayKeys: 'Ctrl/⌘ + D',
    hotkey: 'mod+d',
    preventDefault: true,
  },
  {
    id: 'toggleSkip',
    category: 'Selection',
    description: 'Toggle skip on selected nodes',
    displayKeys: 'Ctrl/⌘ + /',
    hotkey: 'mod+slash',
    preventDefault: true,
  },
  {
    id: 'run',
    category: 'Run',
    description: 'Run workflow',
    displayKeys: 'Ctrl/⌘ + Enter',
    hotkey: 'mod+enter',
    preventDefault: true,
  },
  {
    id: 'test',
    category: 'Run',
    description: 'Test workflow without saving',
    displayKeys: 'Ctrl/⌘ + T',
    hotkey: 'mod+t',
    preventDefault: true,
  },
  {
    id: 'pan',
    category: 'Canvas',
    description: 'Pan canvas (hold Space, then drag)',
    displayKeys: 'Space + drag',
    hotkey: null,
    preventDefault: false,
  },
] as const;

export const SHORTCUTS_BY_ID: Readonly<Record<ShortcutId, ShortcutDefinition>> = SHORTCUTS.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<ShortcutId, ShortcutDefinition>,
);

export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutDefinition[]> {
  const grouped = SHORTCUT_CATEGORIES.reduce(
    (acc, c) => {
      acc[c] = [];
      return acc;
    },
    {} as Record<ShortcutCategory, ShortcutDefinition[]>,
  );
  for (const s of SHORTCUTS) grouped[s.category].push(s);
  return grouped;
}
