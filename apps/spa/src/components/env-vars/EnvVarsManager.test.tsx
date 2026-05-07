import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvVarsManager } from './EnvVarsManager';
import type { EnvVarView } from '@/api/envVars';

const sample = (overrides: Partial<EnvVarView> = {}): EnvVarView => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  key: 'API_BASE_URL',
  scope: 'USER',
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  ...overrides,
});

describe('EnvVarsManager', () => {
  let api: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
  });

  const renderManager = () =>
    render(<EnvVarsManager title="Test env vars" description="desc" api={api} />);

  describe('list rendering', () => {
    it('should render the title and description', async () => {
      api.list.mockResolvedValue([]);
      renderManager();
      expect(await screen.findByText('Test env vars')).toBeInTheDocument();
      expect(screen.getByText('desc')).toBeInTheDocument();
    });

    it('should render an empty state when there are no env vars', async () => {
      api.list.mockResolvedValue([]);
      renderManager();
      expect(await screen.findByText(/no env vars yet/i)).toBeInTheDocument();
    });

    it('should render existing env var rows by key', async () => {
      api.list.mockResolvedValue([
        sample({ id: 'a', key: 'API_BASE_URL' }),
        sample({ id: 'b', key: 'SLACK_WEBHOOK_URL' }),
      ]);
      renderManager();
      const list = await screen.findByRole('list', { name: /env vars/i });
      expect(within(list).getAllByTestId('env-var-row')).toHaveLength(2);
      expect(within(list).getByText('API_BASE_URL')).toBeInTheDocument();
      expect(within(list).getByText('SLACK_WEBHOOK_URL')).toBeInTheDocument();
    });

    it('should NEVER render a value/valueEnc/valueNonce field even if present in the response', async () => {
      // Even if the API mistakenly returned `value`, the UI never reads it.
      const leakyRow = {
        ...sample(),
        value: 'should-not-appear',
        valueEnc: 'X',
        valueNonce: 'Y',
      } as unknown as EnvVarView;
      api.list.mockResolvedValue([leakyRow]);
      renderManager();
      await screen.findByText('API_BASE_URL');
      expect(screen.queryByText(/should-not-appear/)).toBeNull();
    });

    it('should show an error state and allow retry when list fails', async () => {
      api.list.mockRejectedValueOnce(new Error('boom'));
      renderManager();
      expect(await screen.findByRole('alert')).toHaveTextContent(/boom/i);
      api.list.mockResolvedValueOnce([]);
      await userEvent.click(screen.getByRole('button', { name: /retry/i }));
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    });
  });

  describe('create flow', () => {
    it('should open the form when clicking New env var', async () => {
      api.list.mockResolvedValue([]);
      renderManager();
      await screen.findByText(/no env vars yet/i);
      await userEvent.click(screen.getByRole('button', { name: /new env var/i }));
      expect(screen.getByRole('dialog', { name: /create env var/i })).toBeInTheDocument();
    });

    it('should reject lowercase keys before calling the API', async () => {
      api.list.mockResolvedValue([]);
      renderManager();
      await screen.findByText(/no env vars yet/i);
      await userEvent.click(screen.getByRole('button', { name: /new env var/i }));
      // The Key input force-uppercases on change, so we set value via fireEvent-style
      // by typing something the regex rejects (leading digit).
      const keyInput = screen.getByLabelText('Key');
      await userEvent.type(keyInput, '1BAD');
      const valueInput = screen.getByLabelText('Value');
      await userEvent.type(valueInput, 'v');
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
      expect(api.create).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Key must start with an uppercase letter/,
      );
    });

    it('should call create with the entered key/value and add the row', async () => {
      api.list.mockResolvedValue([]);
      const created = sample({ id: 'new', key: 'API_BASE_URL' });
      api.create.mockResolvedValue(created);

      renderManager();
      await screen.findByText(/no env vars yet/i);
      await userEvent.click(screen.getByRole('button', { name: /new env var/i }));
      await userEvent.type(screen.getByLabelText('Key'), 'API_BASE_URL');
      await userEvent.type(screen.getByLabelText('Value'), 'sk-live-abc');
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() =>
        expect(api.create).toHaveBeenCalledWith({ key: 'API_BASE_URL', value: 'sk-live-abc' }),
      );
      expect(await screen.findByText('API_BASE_URL')).toBeInTheDocument();
    });

    it('should surface a server-returned error message in the form', async () => {
      api.list.mockResolvedValue([]);
      api.create.mockRejectedValue({
        response: { data: { message: 'Env var "API_BASE_URL" already exists in USER scope' } },
      });
      renderManager();
      await screen.findByText(/no env vars yet/i);
      await userEvent.click(screen.getByRole('button', { name: /new env var/i }));
      await userEvent.type(screen.getByLabelText('Key'), 'API_BASE_URL');
      await userEvent.type(screen.getByLabelText('Value'), 'x');
      await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    });
  });

  describe('edit flow', () => {
    it('should open the edit form without showing the value field by default', async () => {
      const row = sample({ id: 'a', key: 'API_BASE_URL' });
      api.list.mockResolvedValue([row]);
      renderManager();
      await screen.findByText('API_BASE_URL');
      await userEvent.click(screen.getByRole('button', { name: /edit API_BASE_URL/i }));
      expect(screen.getByRole('dialog', { name: /edit env var/i })).toBeInTheDocument();
      expect(screen.queryByLabelText('Value')).toBeNull();
      expect(screen.getByRole('button', { name: /rotate value/i })).toBeInTheDocument();
    });

    it('should call update with only changed fields', async () => {
      const row = sample({ id: 'a', key: 'API_BASE_URL' });
      api.list.mockResolvedValue([row]);
      api.update.mockResolvedValue({ ...row, key: 'API_URL' });

      renderManager();
      await screen.findByText('API_BASE_URL');
      await userEvent.click(screen.getByRole('button', { name: /edit API_BASE_URL/i }));
      const keyInput = screen.getByLabelText('Key');
      await userEvent.clear(keyInput);
      await userEvent.type(keyInput, 'API_URL');
      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(api.update).toHaveBeenCalledWith('a', { key: 'API_URL' }));
    });

    it('should send only value when the user rotates value without renaming', async () => {
      const row = sample({ id: 'a', key: 'API_BASE_URL' });
      api.list.mockResolvedValue([row]);
      api.update.mockResolvedValue(row);

      renderManager();
      await screen.findByText('API_BASE_URL');
      await userEvent.click(screen.getByRole('button', { name: /edit API_BASE_URL/i }));
      await userEvent.click(screen.getByRole('button', { name: /rotate value/i }));
      await userEvent.type(screen.getByLabelText('Value'), 'rotated-value');
      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(api.update).toHaveBeenCalledWith('a', { value: 'rotated-value' }));
    });
  });

  describe('delete flow', () => {
    it('should ask for confirmation before deleting', async () => {
      const row = sample({ id: 'a', key: 'API_BASE_URL' });
      api.list.mockResolvedValue([row]);
      renderManager();
      await screen.findByText('API_BASE_URL');
      await userEvent.click(screen.getByRole('button', { name: /delete API_BASE_URL/i }));
      expect(screen.getByRole('alertdialog', { name: /delete API_BASE_URL/i })).toBeInTheDocument();
      expect(api.remove).not.toHaveBeenCalled();
    });

    it('should call remove and drop the row on confirm', async () => {
      const row = sample({ id: 'a', key: 'API_BASE_URL' });
      api.list.mockResolvedValue([row]);
      api.remove.mockResolvedValue(undefined);

      renderManager();
      await screen.findByText('API_BASE_URL');
      await userEvent.click(screen.getByRole('button', { name: /delete API_BASE_URL/i }));
      await userEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: /^delete$/i }),
      );

      await waitFor(() => expect(api.remove).toHaveBeenCalledWith('a'));
      expect(screen.queryByText('API_BASE_URL')).toBeNull();
    });
  });
});
