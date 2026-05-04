import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheatSheet } from './CheatSheet';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';

describe('CheatSheet', () => {
  beforeEach(() => {
    useOnboardingStore.setState(initialOnboardingState);
  });

  it('should render nothing when cheatSheetOpen is false', () => {
    render(<CheatSheet />);
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).not.toBeInTheDocument();
  });

  it('should render the dialog when cheatSheetOpen is true', () => {
    useOnboardingStore.setState({ cheatSheetOpen: true });
    render(<CheatSheet />);
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it('should list at least the F8 and Escape shortcuts so the dialog is meaningfully populated', () => {
    useOnboardingStore.setState({ cheatSheetOpen: true });
    render(<CheatSheet />);
    expect(screen.getByText('F8')).toBeInTheDocument();
    expect(screen.getByText(/esc/i)).toBeInTheDocument();
  });

  it('should close when Escape is pressed inside the dialog', async () => {
    const user = userEvent.setup();
    useOnboardingStore.setState({ cheatSheetOpen: true });
    render(<CheatSheet />);
    const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
    dialog.focus();
    await user.keyboard('{Escape}');
    expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
  });
});
