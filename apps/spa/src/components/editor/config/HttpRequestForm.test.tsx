import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { HttpRequestForm } from './HttpRequestForm';

const NODE_ID = 'node-http-1';

const makeHttpConnection = (overrides: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'http-1',
  type: ConnectionType.CUSTOM,
  provider: 'http',
  name: 'My API',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...overrides,
});

const seedConnections = (connections: ConnectionView[]): void => {
  useConnectionsStore.setState({
    connections,
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('HttpRequestForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    // Seed the connections store to 'ready' so ConnectionPicker doesn't fire a
    // network fetch on mount in these unit tests.
    resetConnectionsStore();
    seedConnections([]);
  });

  it('should render method, url, and timeout fields with current config values', () => {
    render(
      <HttpRequestForm
        nodeId={NODE_ID}
        config={{
          method: 'POST',
          url: 'https://api.example.com/orders',
          timeout: 5000,
        }}
      />,
    );

    expect((screen.getByLabelText(/method/i) as HTMLSelectElement).value).toBe('POST');
    expect((screen.getByLabelText(/url/i) as HTMLInputElement).value).toBe(
      'https://api.example.com/orders',
    );
    expect((screen.getByLabelText(/timeout/i) as HTMLInputElement).value).toBe('5000');
  });

  it('should call updateNodeConfig with the new method when the user changes the select', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'https://x.com' }} />);

    fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'POST' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { method: 'POST' });
  });

  it('should call updateNodeConfig with the new url when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: '' }} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://new.example.com' },
    });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { url: 'https://new.example.com' });
  });

  it('should render an inline error when the URL is invalid', () => {
    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'not-a-url' }} />);
    expect(screen.getByTestId('http-url-error')).toBeInTheDocument();
  });

  it('should commit timeout as a number when the user types digits', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'https://x.com' }} />);

    fireEvent.change(screen.getByLabelText(/timeout/i), { target: { value: '3000' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { timeout: 3000 });
  });

  it('should commit timeout as undefined when the field is cleared', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(
      <HttpRequestForm
        nodeId={NODE_ID}
        config={{ method: 'GET', url: 'https://x.com', timeout: 3000 }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/timeout/i), { target: { value: '' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { timeout: undefined });
  });

  it('should commit parsed JSON body on blur when the body is valid JSON', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'POST', url: 'https://x.com' }} />);

    const textarea = screen.getByLabelText(/body/i);
    fireEvent.change(textarea, { target: { value: '{"hello":"world"}' } });
    fireEvent.blur(textarea);

    const lastCall = updateNodeConfig.mock.calls.at(-1);
    expect(lastCall).toEqual([NODE_ID, { body: { hello: 'world' } }]);
  });

  it('should render a body error when invalid JSON is entered', () => {
    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'POST', url: 'https://x.com' }} />);

    const textarea = screen.getByLabelText(/body/i);
    fireEvent.change(textarea, { target: { value: '{not-json' } });
    fireEvent.blur(textarea);

    expect(screen.getByTestId('http-body-error')).toBeInTheDocument();
  });

  it('should commit undefined body when the textarea is empty on blur', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(
      <HttpRequestForm
        nodeId={NODE_ID}
        config={{ method: 'POST', url: 'https://x.com', body: { a: 1 } }}
      />,
    );

    const textarea = screen.getByLabelText(/body/i);
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.blur(textarea);

    const lastCall = updateNodeConfig.mock.calls.at(-1);
    expect(lastCall).toEqual([NODE_ID, { body: undefined }]);
  });

  it('should render the HeadersEditor so the user can manage request headers', () => {
    render(
      <HttpRequestForm
        nodeId={NODE_ID}
        config={{ method: 'GET', url: 'https://x.com', headers: { 'X-Foo': 'bar' } }}
      />,
    );

    expect(screen.getByTestId('headers-editor')).toBeInTheDocument();
  });

  it('should forward HeadersEditor changes into updateNodeConfig under the headers key', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(
      <HttpRequestForm
        nodeId={NODE_ID}
        config={{ method: 'GET', url: 'https://x.com', headers: {} }}
      />,
    );

    const keyInput = screen.getAllByPlaceholderText(/key/i)[0];
    fireEvent.change(keyInput, { target: { value: 'X-Foo' } });

    const lastCall = updateNodeConfig.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(NODE_ID);
    expect(lastCall?.[1]).toEqual({ headers: { 'X-Foo': '' } });
  });

  it('should render the output-sample (data-pill) field', () => {
    render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'https://x.com' }} />);
    expect(screen.getByTestId('pill-sample-field')).toBeInTheDocument();
  });

  describe('optional HTTP connection', () => {
    it('should render an HTTP connection picker that lists http connections', async () => {
      const user = userEvent.setup();
      seedConnections([makeHttpConnection({ id: 'http-1', name: 'My API' })]);

      render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'https://x.com' }} />);

      const picker = screen.getByRole('combobox', { name: /connection/i });
      expect(picker).toBeInTheDocument();
      await user.click(picker);
      expect(await screen.findByRole('option', { name: /my api/i })).toBeInTheDocument();
    });

    it('should write config.connectionId when a connection is selected', async () => {
      const user = userEvent.setup();
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });
      seedConnections([makeHttpConnection({ id: 'http-1', name: 'My API' })]);

      render(<HttpRequestForm nodeId={NODE_ID} config={{ method: 'GET', url: 'https://x.com' }} />);

      await user.click(screen.getByRole('combobox', { name: /connection/i }));
      await user.click(await screen.findByRole('option', { name: /my api/i }));

      expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { connectionId: 'http-1' });
    });

    it('should clear config.connectionId when None is selected', async () => {
      const user = userEvent.setup();
      const updateNodeConfig = vi.fn();
      useEditorStore.setState({ updateNodeConfig });
      seedConnections([makeHttpConnection({ id: 'http-1', name: 'My API' })]);

      render(
        <HttpRequestForm
          nodeId={NODE_ID}
          config={{ method: 'GET', url: 'https://x.com', connectionId: 'http-1' }}
        />,
      );

      await user.click(screen.getByRole('combobox', { name: /connection/i }));
      await user.click(await screen.findByRole('option', { name: /no authentication/i }));

      expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { connectionId: null });
    });
  });
});
