import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ReactRouterDom;
  return { ...actual, useNavigate: () => mockNavigate };
});

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
    mockNavigate.mockClear();
    useOnboardingStore.setState(initialOnboardingState);
  });

  describe('visibility', () => {
    it('does not render when helpDrawerOpen is false', () => {
      renderAt();
      expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
    });

    it('renders when helpDrawerOpen is true', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    });
  });

  describe('quick actions', () => {
    it('replays the current page tour and closes the drawer', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ helpDrawerOpen: true, startTour });
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /take this page’s tour/i }));
      expect(startTour).toHaveBeenCalledWith({ tourId: 'dashboard' });
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });

    it('disables the current-page tour action on routes without a tour', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt('/settings');
      expect(screen.getByRole('button', { name: /take this page’s tour/i })).toBeDisabled();
    });

    it('restart onboarding reopens the welcome modal', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /restart onboarding/i }));
      expect(useOnboardingStore.getState().welcomeOpen).toBe(true);
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });

    it('opens the cheat sheet from the shortcuts action', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(true);
    });
  });

  describe('guided tours', () => {
    it('navigates to another area then starts that tour', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ helpDrawerOpen: true, startTour });
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: 'History' }));
      expect(mockNavigate).toHaveBeenCalledWith('/history');
      expect(startTour).toHaveBeenCalledWith({ tourId: 'history' });
    });

    it('disables the editor tour when not in an editor', () => {
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt('/dashboard');
      expect(screen.getByRole('button', { name: 'Workflow editor' })).toBeDisabled();
    });
  });

  describe('concepts', () => {
    it('expands a concept to reveal its explanation', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /data pills/i }));
      expect(screen.getByText(/type/i)).toBeInTheDocument();
      expect(screen.getByText(/steps\.trigger\.email/i)).toBeInTheDocument();
    });

    it('launches the linked tour from a concept "Show me"', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ helpDrawerOpen: true, startTour });
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /^templates$/i }));
      await user.click(screen.getByRole('button', { name: /show me/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/library');
      expect(startTour).toHaveBeenCalledWith({ tourId: 'library' });
    });
  });

  describe('search', () => {
    it('filters concepts and hides quick actions while searching', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.type(screen.getByRole('searchbox', { name: /search help/i }), 'data pill');
      expect(screen.getByRole('button', { name: /data pills/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /restart onboarding/i })).not.toBeInTheDocument();
    });

    it('shows an empty state when nothing matches', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.type(screen.getByRole('searchbox', { name: /search help/i }), 'zzzznomatch');
      expect(screen.getByText(/no help matches/i)).toBeInTheDocument();
    });
  });

  describe('resources', () => {
    it('renders external links with safe rel/target', () => {
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
    it('closes via the explicit close button', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByRole('button', { name: /close help/i }));
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });

    it('closes when the backdrop is clicked', async () => {
      const user = userEvent.setup();
      useOnboardingStore.setState({ helpDrawerOpen: true });
      renderAt();
      await user.click(screen.getByTestId('help-drawer-backdrop'));
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });
  });

  // Guards against a tour/label appearing twice and breaking the unique-name
  // queries above (e.g. a concept titled identically to a tour row).
  it('keeps the guided-tour list labels distinct from rendered controls', () => {
    useOnboardingStore.setState({ helpDrawerOpen: true });
    renderAt('/dashboard');
    const dialog = screen.getByRole('dialog', { name: /help/i });
    expect(within(dialog).getByRole('button', { name: 'History' })).toBeInTheDocument();
  });
});
