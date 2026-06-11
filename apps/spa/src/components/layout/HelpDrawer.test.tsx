import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelpDrawer } from './HelpDrawer';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';

const renderAt = (initial = '/dashboard'): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <HelpDrawer />
    </MemoryRouter>,
  );

describe('HelpDrawer', () => {
  beforeEach(() => {
    useOnboardingStore.setState(initialOnboardingState);
  });

  describe('visibility', () => {
    it('should not render when helpDrawerOpen is false', () => {
      renderAt();
      expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
    });

    it('should render when helpDrawerOpen is true', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    });
  });

  describe('Take the tour', () => {
    it('should re-trigger the tour for the current page on /dashboard', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ helpDrawerOpen: true, startTour });
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /take the tour/i }));
      expect(startTour).toHaveBeenCalledWith({ tourId: 'dashboard' });
    });

    it('should re-trigger the tour for the editor when on /workflows/:id', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ helpDrawerOpen: true, startTour });
      renderAt('/workflows/abc-123');
      await user.click(screen.getByRole('button', { name: /take the tour/i }));
      expect(startTour).toHaveBeenCalledWith({ tourId: 'editor' });
    });

    it('should be disabled on routes without a tour (so users do not click into nothing)', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt('/settings');
      expect(screen.getByRole('button', { name: /take the tour/i })).toBeDisabled();
    });

    it('should close the drawer after starting the tour', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /take the tour/i }));
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });
  });

  describe('Keyboard shortcuts button', () => {
    it('should open the cheat sheet', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(true);
    });
  });

  describe('quick links', () => {
    it('should render external links with rel="noopener noreferrer" and target="_blank"', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      const docs = screen.getByRole('link', { name: /documentation/i });
      const github = screen.getByRole('link', { name: /github/i });
      const support = screen.getByRole('link', { name: /contact support/i });
      for (const link of [docs, github, support]) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
        expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
      }
    });
  });

  describe('dismiss', () => {
    it('should close when the explicit close button is clicked', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /close help/i }));
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });

    it('should close when the backdrop is clicked', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByTestId('help-drawer-backdrop'));
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });
  });
});
