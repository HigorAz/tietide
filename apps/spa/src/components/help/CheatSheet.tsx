import { Modal } from '@/components/dashboard/Modal';
import { useOnboardingStore } from '@/stores/onboardingStore';

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'F8', description: 'Toggle this cheat sheet' },
  { keys: 'Esc', description: 'Close modal or dismiss tour' },
];

export function CheatSheet(): JSX.Element | null {
  const open = useOnboardingStore((s) => s.cheatSheetOpen);
  const close = useOnboardingStore((s) => s.closeCheatSheet);

  if (!open) return null;

  return (
    <Modal onClose={close} titleId="cheat-sheet-title" className="max-w-sm">
      <h2 id="cheat-sheet-title" className="text-base font-semibold text-text-primary">
        Keyboard shortcuts
      </h2>
      <ul className="mt-4 space-y-2">
        {SHORTCUTS.map((s) => (
          <li
            key={s.keys}
            className="flex items-center justify-between rounded border border-white/5 bg-elevated px-3 py-2 text-sm"
          >
            <span className="text-text-secondary">{s.description}</span>
            <kbd className="rounded bg-deep-blue px-2 py-0.5 font-mono text-xs text-text-primary">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default CheatSheet;
