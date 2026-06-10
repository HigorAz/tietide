import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';

vi.mock('@/api/connections', () => ({
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  testConnection: vi.fn(),
  startOAuth: vi.fn(),
}));

import * as connectionsApi from '@/api/connections';
import type { ConnectionView } from '@/api/connections';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { useToastStore } from '@/stores/toastStore';
import { ConnectionsPage } from './ConnectionsPage';

const mockedList = vi.mocked(connectionsApi.listConnections);
const mockedCreate = vi.mocked(connectionsApi.createConnection);
const mockedDelete = vi.mocked(connectionsApi.deleteConnection);
const mockedTest = vi.mocked(connectionsApi.testConnection);
const mockedStartOAuth = vi.mocked(connectionsApi.startOAuth);

const make = (overrides: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'c-1',
  type: ConnectionType.API_KEY,
  provider: 'openai',
  name: 'My OpenAI',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-06T00:00:00Z',
  updatedAt: '2026-05-06T00:00:00Z',
  ...overrides,
});

describe('ConnectionsPage', () => {
  const originalOpen = window.open;
  const openMock = vi.fn();

  beforeEach(() => {
    resetConnectionsStore();
    useToastStore.setState({ toasts: [] });
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedDelete.mockReset();
    mockedTest.mockReset();
    mockedStartOAuth.mockReset();
    openMock.mockReset();
    window.open = openMock as unknown as typeof window.open;
    // Ensure the SPA does not detect a popup-bridge when the test page mounts.
    Object.defineProperty(window, 'opener', { value: null, configurable: true, writable: true });
    window.history.replaceState({}, '', '/connections');
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  // Providers live in the "Available Connections" tab. Activate it first.
  const openAvailableTab = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('tab', { name: /available connections/i }));
  };

  it('should render all 6 providers in the picker', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);

    render(<ConnectionsPage />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    await openAvailableTab(user);

    for (const label of ['Google', 'Microsoft', 'Slack', 'Notion', 'OpenAI', 'Anthropic']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('should show empty state when no connections exist', async () => {
    mockedList.mockResolvedValueOnce([]);

    render(<ConnectionsPage />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    expect(screen.getByText(/no connections yet/i)).toBeInTheDocument();
  });

  it('should list existing connections with their status badge', async () => {
    mockedList.mockResolvedValueOnce([
      make({ id: 'a', name: 'Prod OpenAI', status: ConnectionStatus.ACTIVE }),
      make({ id: 'b', name: 'Old Slack', provider: 'slack', status: ConnectionStatus.EXPIRED }),
    ]);

    render(<ConnectionsPage />);

    await waitFor(() => expect(screen.getByText('Prod OpenAI')).toBeInTheDocument());
    expect(screen.getByText('Old Slack')).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Expired/i)).toBeInTheDocument();
  });

  it('should open a popup with about:blank when the OAuth modal Connect button is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([]);
    // Never resolve startOAuth — we're only verifying the synchronous popup open.
    mockedStartOAuth.mockReturnValueOnce(new Promise(() => {}));
    const fakePopup = { closed: false, location: { href: '' }, close: vi.fn() };
    openMock.mockReturnValueOnce(fakePopup as unknown as Window);

    render(<ConnectionsPage />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    await openAvailableTab(user);

    await user.click(screen.getByTestId('provider-card-google'));
    // OAuth modal opens first; popup is opened from the Connect button inside it.
    expect(openMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /connect with google/i }));

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock.mock.calls[0][0]).toBe('about:blank');
    expect(mockedStartOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', label: 'My Google' }),
    );
  });

  it('should refetch connections and toast on a postMessage success from the popup', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]); // initial fetch (empty)
    mockedList.mockResolvedValueOnce([make({ id: 'new', name: 'My Google', provider: 'google' })]);
    mockedStartOAuth.mockResolvedValueOnce({ redirectUrl: 'https://x', state: 's' });
    const fakePopup = { closed: false, location: { href: '' }, close: vi.fn() };
    openMock.mockReturnValueOnce(fakePopup as unknown as Window);

    render(<ConnectionsPage />);
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    await openAvailableTab(user);

    await user.click(screen.getByTestId('provider-card-google'));
    await user.click(await screen.findByRole('button', { name: /connect with google/i }));

    // Simulate the popup posting back.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'tietide:oauth:done', status: 'success', connectionId: 'new' },
      }),
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(useToastStore.getState().toasts.some((t) => t.tone === 'success')).toBe(true);
  });

  it('should open the API-key modal for OpenAI and POST a created connection on submit', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValueOnce(
      make({ id: 'created', provider: 'openai', name: 'My OpenAI' }),
    );

    render(<ConnectionsPage />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    await openAvailableTab(user);

    await user.click(screen.getByTestId('provider-card-openai'));

    const apiKeyInput = await screen.findByLabelText(/api key/i);
    await user.type(apiKeyInput, 'sk-abc');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][0]).toMatchObject({
      provider: 'openai',
      type: ConnectionType.API_KEY,
      config: { apiKey: 'sk-abc' },
    });
  });

  it('should call testConnection and toast the latency when Test is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([make({ id: 'a' })]);
    mockedTest.mockResolvedValueOnce({ ok: true, latencyMs: 142 });

    render(<ConnectionsPage />);
    await waitFor(() => expect(screen.getByText('My OpenAI')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^test$/i }));

    await waitFor(() => expect(mockedTest).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message.includes('142ms'))).toBe(true),
    );
  });

  it('should show a confirmation dialog and DELETE on confirm', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([make({ id: 'a' })]);
    mockedDelete.mockResolvedValueOnce(undefined);

    render(<ConnectionsPage />);
    await waitFor(() => expect(screen.getByText('My OpenAI')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /revoke/i }));
    expect(await screen.findByRole('dialog', { name: /revoke connection/i })).toBeInTheDocument();

    // Click the destructive button (label "Revoke") inside the dialog.
    const dialog = screen.getByRole('dialog', { name: /revoke connection/i });
    const confirmBtn = dialog.querySelector('button.bg-error') as HTMLButtonElement;
    await user.click(confirmBtn);

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('a'));
    expect(useConnectionsStore.getState().connections.find((c) => c.id === 'a')).toBeUndefined();
  });

  it('should toast an error when fetch fails and offer a retry', async () => {
    mockedList.mockRejectedValueOnce(new Error('forbidden'));

    render(<ConnectionsPage />);

    await waitFor(() =>
      expect(screen.getByText(/Could not load connections/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  describe('deep-link auto-connect (?provider=X&connect=true)', () => {
    it('should auto-open the OAuth modal for the provider in the query string', async () => {
      mockedList.mockResolvedValue([]);

      window.history.replaceState({}, '', '/connections?provider=google&connect=true');

      render(<ConnectionsPage />);

      // Modal opens for naming + scope selection — popup is launched from the
      // Connect button inside, not auto-fired.
      expect(
        await screen.findByRole('button', { name: /connect with google/i }),
      ).toBeInTheDocument();
      expect(mockedStartOAuth).not.toHaveBeenCalled();
      // Query params should be stripped after handling so a refresh doesn't re-fire.
      expect(window.location.search).toBe('');
    });

    it('should NOT auto-open when the provider is unknown', async () => {
      mockedList.mockResolvedValue([]);

      window.history.replaceState({}, '', '/connections?provider=bogus&connect=true');

      render(<ConnectionsPage />);

      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      expect(mockedStartOAuth).not.toHaveBeenCalled();
      expect(openMock).not.toHaveBeenCalled();
    });

    it('should NOT auto-open without connect=true', async () => {
      mockedList.mockResolvedValue([]);

      window.history.replaceState({}, '', '/connections?provider=google');

      render(<ConnectionsPage />);

      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      expect(mockedStartOAuth).not.toHaveBeenCalled();
      expect(openMock).not.toHaveBeenCalled();
    });

    it('should open the OAuth modal exactly once even under React.StrictMode', async () => {
      mockedList.mockResolvedValue([]);

      window.history.replaceState({}, '', '/connections?provider=google&connect=true');

      render(
        <StrictMode>
          <ConnectionsPage />
        </StrictMode>,
      );

      // Modal Connect button should be rendered exactly once.
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: /connect with google/i })).toHaveLength(1),
      );
      // Give StrictMode's second effect pass a chance to misfire.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getAllByRole('button', { name: /connect with google/i })).toHaveLength(1);
      expect(mockedStartOAuth).not.toHaveBeenCalled();
    });

    it('should auto-open the API-key modal when the provider is API_KEY-typed', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue([]);

      window.history.replaceState({}, '', '/connections?provider=openai&connect=true');

      render(<ConnectionsPage />);

      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      expect(await screen.findByLabelText(/api key/i)).toBeInTheDocument();
      // Cleanup: close modal so subsequent state remains tidy.
      await user.click(screen.getByRole('button', { name: /cancel/i }));
    });
  });

  describe('tabs and search', () => {
    it('renders My Connections and Available Connections tabs', async () => {
      mockedList.mockResolvedValueOnce([]);

      render(<ConnectionsPage />);
      await waitFor(() => expect(mockedList).toHaveBeenCalled());

      expect(screen.getByRole('tab', { name: /my connections/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /available connections/i })).toBeInTheDocument();
    });

    it('filters My Connections by name', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([
        make({ id: 'a', name: 'Prod OpenAI', provider: 'openai' }),
        make({ id: 'b', name: 'Team Slack', provider: 'slack' }),
      ]);

      render(<ConnectionsPage />);
      await waitFor(() => expect(screen.getByText('Prod OpenAI')).toBeInTheDocument());

      await user.type(screen.getByRole('searchbox', { name: /search your connections/i }), 'Prod');

      expect(screen.getByText('Prod OpenAI')).toBeInTheDocument();
      expect(screen.queryByText('Team Slack')).not.toBeInTheDocument();
    });

    it('filters My Connections by application', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([
        make({ id: 'a', name: 'Prod OpenAI', provider: 'openai' }),
        make({ id: 'b', name: 'Team Slack', provider: 'slack' }),
      ]);

      render(<ConnectionsPage />);
      await waitFor(() => expect(screen.getByText('Prod OpenAI')).toBeInTheDocument());

      await user.type(screen.getByRole('searchbox', { name: /search your connections/i }), 'slack');

      expect(screen.getByText('Team Slack')).toBeInTheDocument();
      expect(screen.queryByText('Prod OpenAI')).not.toBeInTheDocument();
    });

    it('filters Available Connections by application', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);

      render(<ConnectionsPage />);
      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      await user.click(screen.getByRole('tab', { name: /available connections/i }));

      await user.type(
        screen.getByRole('searchbox', { name: /search available connections/i }),
        'slack',
      );

      expect(screen.getByTestId('provider-card-slack')).toBeInTheDocument();
      expect(screen.queryByTestId('provider-card-google')).not.toBeInTheDocument();
    });

    it('opens the HTTP modal from the HTTP provider card', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);

      render(<ConnectionsPage />);
      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      await user.click(screen.getByRole('tab', { name: /available connections/i }));

      await user.click(screen.getByTestId('provider-card-http'));

      expect(await screen.findByLabelText(/authentication method/i)).toBeInTheDocument();
    });
  });
});
