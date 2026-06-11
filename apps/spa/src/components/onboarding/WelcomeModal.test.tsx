import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ReactRouterDom;
  return { ...actual, useNavigate: () => mockNavigate };
});

import { WelcomeModal } from './WelcomeModal';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';
import { isWelcomeSeen, markWelcomeSeen, tourCompletedKey } from '@/utils/tourStorage';

const renderModal = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <WelcomeModal />
    </MemoryRouter>,
  );

const mockUser = (id: string): void => {
  useAuthStore.setState({
    user: {
      id,
      email: 't@t',
      name: 'T',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    token: 'jwt-test',
  });
};

describe('WelcomeModal', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null });
    useOnboardingStore.setState(initialOnboardingState);
  });

  describe('auto-open', () => {
    it('opens on first login when neither welcome nor tour has been seen', async () => {
      mockUser('u-1');
      renderModal();
      expect(
        await screen.findByRole('dialog', { name: /welcome to tietide/i }),
      ).toBeInTheDocument();
    });

    it('does not open if the welcome has already been seen', async () => {
      markWelcomeSeen('u-1');
      mockUser('u-1');
      renderModal();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not retroactively greet legacy users who already finished the tour', async () => {
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      mockUser('u-1');
      renderModal();
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does nothing without an authenticated user', async () => {
      renderModal();
      await act(async () => {
        await Promise.resolve();
      });
      expect(useOnboardingStore.getState().welcomeOpen).toBe(false);
    });
  });

  describe('choices', () => {
    it('"Take the guided tour" starts the first-access tour and marks welcome seen', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ startTour });
      mockUser('u-1');
      renderModal();
      await screen.findByRole('dialog', { name: /welcome to tietide/i });

      await user.click(screen.getByRole('button', { name: /take the guided tour/i }));

      expect(startTour).toHaveBeenCalledWith({ tourId: 'firstAccess' });
      expect(isWelcomeSeen('u-1')).toBe(true);
      expect(useOnboardingStore.getState().welcomeOpen).toBe(false);
    });

    it('"Start from a template" navigates to the library and marks welcome seen', async () => {
      const user = userEvent.setup();
      mockUser('u-1');
      renderModal();
      await screen.findByRole('dialog', { name: /welcome to tietide/i });

      await user.click(screen.getByRole('button', { name: /start from a template/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/library');
      expect(isWelcomeSeen('u-1')).toBe(true);
    });

    it('"Explore on my own" dismisses without starting any tour', async () => {
      const user = userEvent.setup();
      const startTour = vi.fn();
      useOnboardingStore.setState({ startTour });
      mockUser('u-1');
      renderModal();
      await screen.findByRole('dialog', { name: /welcome to tietide/i });

      await user.click(screen.getByRole('button', { name: /explore on my own/i }));

      expect(startTour).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(isWelcomeSeen('u-1')).toBe(true);
      expect(useOnboardingStore.getState().welcomeOpen).toBe(false);
    });
  });
});
