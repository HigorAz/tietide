import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { FxField } from './FxField';

beforeEach(() => {
  // DataPillInput (rendered in expression mode) reads the real editor store.
  useEditorStore.setState({ ...initialEditorState });
});

const base = {
  fieldId: 'f1',
  testId: 'fld',
  nodeId: 'n1',
  label: 'Issue number',
};

describe('FxField', () => {
  it('renders a native number input in literal mode', () => {
    render(<FxField {...base} kind="number" value={42} onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('42') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('starts in expression mode when the value is a template string', () => {
    render(<FxField {...base} kind="number" value="{{trigger.issue.number}}" onChange={vi.fn()} />);
    // The fx toggle reflects expression mode.
    expect(screen.getByTestId('fld-fx-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles a literal number field into expression mode, preserving the value as text', () => {
    const onChange = vi.fn();
    render(<FxField {...base} kind="number" value={7} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('fld-fx-toggle'));
    // The literal 7 is preserved as its string form so it isn't lost.
    expect(onChange).toHaveBeenCalledWith('7');
  });

  it('clears a template value when toggling a NUMBER field back to literal', () => {
    const onChange = vi.fn();
    render(<FxField {...base} kind="number" value="{{x}}" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('fld-fx-toggle'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('keeps a template value when toggling a TEXT field back to literal (no data loss)', () => {
    const onChange = vi.fn();
    render(
      <FxField {...base} kind="text" label="Email" value="{{trigger.email}}" onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('fld-fx-toggle')); // expr → literal
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stays in expression mode after a template value is cleared (no remount → keeps keyboard focus)', () => {
    // Regression: emptying a {{pill}} used to flip the field back to a literal
    // input, unmounting the DataPillInput mid-edit. Focus then fell to <body>
    // and the next Backspace deleted the selected node. The field must stay an
    // expression input once it has been one.
    const { rerender } = render(
      <FxField {...base} kind="text" label="Email" value="{{trigger.email}}" onChange={vi.fn()} />,
    );
    // Expression mode renders the DataPillInput (a combobox textarea).
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    // The user deletes every character — value collapses to empty.
    rerender(<FxField {...base} kind="text" label="Email" value="" onChange={vi.fn()} />);

    // Still an expression input (not swapped to a literal <input type="text">).
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByTestId('fld-fx-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a select in literal mode with the provided options', () => {
    render(
      <FxField
        {...base}
        kind="select"
        value="merge"
        options={[
          { value: 'merge', label: 'Merge' },
          { value: 'squash', label: 'Squash' },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByDisplayValue('Merge') as HTMLSelectElement).tagName).toBe('SELECT');
  });
});
