import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { ConditionalForm } from './ConditionalForm';

const NODE_ID = 'node-cond-1';

describe('ConditionalForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the condition input with the current config value', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    const input = screen.getByLabelText(/condition/i) as HTMLInputElement;
    expect(input.value).toBe('x > 0');
  });

  it('should call updateNodeConfig with the new condition when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: '' }} />);
    fireEvent.change(screen.getByLabelText(/condition/i), { target: { value: 'a === b' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { condition: 'a === b' });
  });

  it('should render an inline error when the condition is empty', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: '' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should not render an error for a non-empty condition', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
