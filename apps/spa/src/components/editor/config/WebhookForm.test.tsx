import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { WebhookForm } from './WebhookForm';

const NODE_ID = 'node-webhook-1';

describe('WebhookForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the path input with the current config value', () => {
    render(<WebhookForm nodeId={NODE_ID} config={{ path: 'incoming-order' }} />);
    const input = screen.getByLabelText(/path/i) as HTMLInputElement;
    expect(input.value).toBe('incoming-order');
  });

  it('should render an empty path input when no value is configured', () => {
    render(<WebhookForm nodeId={NODE_ID} config={{}} />);
    const input = screen.getByLabelText(/path/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should call updateNodeConfig with the new path when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<WebhookForm nodeId={NODE_ID} config={{}} />);
    fireEvent.change(screen.getByLabelText(/path/i), { target: { value: 'my-hook' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { path: 'my-hook' });
  });

  it('should commit undefined when the input is cleared', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<WebhookForm nodeId={NODE_ID} config={{ path: 'something' }} />);
    fireEvent.change(screen.getByLabelText(/path/i), { target: { value: '' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { path: undefined });
  });

  it('should render an inline error when the path exceeds 255 characters', () => {
    const longPath = 'a'.repeat(256);
    render(<WebhookForm nodeId={NODE_ID} config={{ path: longPath }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
