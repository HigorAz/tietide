import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { ReturnForm } from './ReturnForm';

const NODE_ID = 'ret-1';

describe('ReturnForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the value input with the current config value', () => {
    render(<ReturnForm nodeId={NODE_ID} config={{ value: '{{http_1.body}}' }} />);
    const input = screen.getByLabelText(/return value/i) as HTMLInputElement;
    expect(input.value).toBe('{{http_1.body}}');
  });

  it('should leave the input empty when no value is configured (passthrough mode)', () => {
    render(<ReturnForm nodeId={NODE_ID} config={{}} />);
    const input = screen.getByLabelText(/return value/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should call updateNodeConfig when the user types into the value input', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<ReturnForm nodeId={NODE_ID} config={{}} />);
    fireEvent.change(screen.getByLabelText(/return value/i), {
      target: { value: '{{trigger.x}}' },
    });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { value: '{{trigger.x}}' });
  });
});
