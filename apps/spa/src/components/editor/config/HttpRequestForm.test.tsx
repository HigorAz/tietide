import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { HttpRequestForm } from './HttpRequestForm';

const NODE_ID = 'node-http-1';

describe('HttpRequestForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
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
});
