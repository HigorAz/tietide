import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShortcutCheatsheet } from './ShortcutCheatsheet';
import { SHORTCUTS, SHORTCUT_CATEGORIES } from './shortcutDefinitions';

describe('ShortcutCheatsheet', () => {
  it('should render nothing when open is false', () => {
    const { container } = render(<ShortcutCheatsheet open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render a dialog when open is true', () => {
    render(<ShortcutCheatsheet open onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should list every shortcut with its description and key combo', () => {
    render(<ShortcutCheatsheet open onClose={vi.fn()} />);
    for (const s of SHORTCUTS) {
      expect(screen.getByText(s.description)).toBeInTheDocument();
      expect(screen.getAllByText(s.displayKeys).length).toBeGreaterThan(0);
    }
  });

  it('should render a heading for every category that has shortcuts', () => {
    render(<ShortcutCheatsheet open onClose={vi.fn()} />);
    const present = new Set(SHORTCUTS.map((s) => s.category));
    for (const c of SHORTCUT_CATEGORIES) {
      if (!present.has(c)) continue;
      expect(screen.getByRole('heading', { name: c })).toBeInTheDocument();
    }
  });

  it('includes the completed Copy / Paste / multi-select / box-select entries', () => {
    render(<ShortcutCheatsheet open onClose={vi.fn()} />);
    expect(screen.getByText('Copy selected nodes')).toBeInTheDocument();
    expect(screen.getByText('Paste nodes')).toBeInTheDocument();
    expect(screen.getByText('Add or remove a node from the selection')).toBeInTheDocument();
    expect(screen.getByText('Box-select nodes')).toBeInTheDocument();
  });

  it('should call onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<ShortcutCheatsheet open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutCheatsheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
