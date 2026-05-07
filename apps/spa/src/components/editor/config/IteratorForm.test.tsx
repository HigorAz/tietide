import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { IteratorForm } from './IteratorForm';

const NODE_ID = 'iter-1';

describe('IteratorForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the array path input with the current config value', () => {
    render(<IteratorForm nodeId={NODE_ID} config={{ arrayPath: '{{trigger.items}}' }} />);
    const input = screen.getByLabelText(/array path/i) as HTMLInputElement;
    expect(input.value).toBe('{{trigger.items}}');
  });

  it('should call updateNodeConfig with the new arrayPath when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<IteratorForm nodeId={NODE_ID} config={{ arrayPath: '' }} />);
    fireEvent.change(screen.getByLabelText(/array path/i), {
      target: { value: '{{http_1.body}}' },
    });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { arrayPath: '{{http_1.body}}' });
  });

  it('should toggle continueOnError via the checkbox', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(
      <IteratorForm
        nodeId={NODE_ID}
        config={{ arrayPath: '{{trigger.items}}', continueOnError: false }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/continue on error/i));

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { continueOnError: true });
  });

  it('should clear maxItems when the input is emptied', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<IteratorForm nodeId={NODE_ID} config={{ arrayPath: '{{x.y}}', maxItems: 50 }} />);
    fireEvent.change(screen.getByLabelText(/max items/i), { target: { value: '' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { maxItems: undefined });
  });

  it('should accept a positive integer for maxItems', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<IteratorForm nodeId={NODE_ID} config={{ arrayPath: '{{x.y}}' }} />);
    fireEvent.change(screen.getByLabelText(/max items/i), { target: { value: '25' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { maxItems: 25 });
  });

  it('should render an inline error for an empty arrayPath', () => {
    render(<IteratorForm nodeId={NODE_ID} config={{ arrayPath: '' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
