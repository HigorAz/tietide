import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { ConditionalForm } from './ConditionalForm';

const NODE_ID = 'node-cond-1';

describe('ConditionalForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('opens the structured builder for a parseable condition', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    expect(screen.getByTestId('conditional-structured')).toBeInTheDocument();
    expect((screen.getByTestId('conditional-operator') as HTMLSelectElement).value).toBe('>');
    expect(screen.getByDisplayValue('x')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
  });

  it('serializes a structured operator change back into the condition string', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    fireEvent.change(screen.getByTestId('conditional-operator'), { target: { value: 'contains' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
      conditionBuilder: { left: 'x', operator: 'contains', right: '0' },
      condition: 'x contains 0',
    });
  });

  it('switches to advanced mode and shows the raw condition', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    fireEvent.click(screen.getByTestId('conditional-mode-advanced'));
    const advanced = screen.getByTestId('conditional-advanced');
    expect((within(advanced).getByRole('combobox') as HTMLTextAreaElement).value).toBe('x > 0');
  });

  it('opens in advanced mode (structured disabled) for an unparseable expression', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'someFunc(1)' }} />);
    expect(screen.getByTestId('conditional-advanced')).toBeInTheDocument();
    expect(screen.getByTestId('conditional-mode-structured')).toBeDisabled();
  });

  it('clears the structured builder when editing in advanced mode', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: 'x > 0' }} />);
    fireEvent.click(screen.getByTestId('conditional-mode-advanced'));
    const advanced = screen.getByTestId('conditional-advanced');
    fireEvent.change(within(advanced).getByRole('combobox'), { target: { value: 'a === b' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
      condition: 'a === b',
      conditionBuilder: undefined,
    });
  });

  it('renders an inline error when the condition is empty', () => {
    render(<ConditionalForm nodeId={NODE_ID} config={{ condition: '' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
