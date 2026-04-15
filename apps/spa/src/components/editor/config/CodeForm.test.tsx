import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { CodeForm } from './CodeForm';

const NODE_ID = 'node-code-1';

describe('CodeForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the code textarea with the current config value', () => {
    render(
      <CodeForm nodeId={NODE_ID} config={{ code: 'return input;', language: 'javascript' }} />,
    );
    const textarea = screen.getByLabelText(/code/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('return input;');
  });

  it('should call updateNodeConfig with the new code when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<CodeForm nodeId={NODE_ID} config={{ code: '', language: 'javascript' }} />);
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: 'return 42;' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { code: 'return 42;' });
  });

  it('should render the language select fixed to javascript', () => {
    render(<CodeForm nodeId={NODE_ID} config={{ code: 'x', language: 'javascript' }} />);
    const select = screen.getByLabelText(/language/i) as HTMLSelectElement;
    expect(select.value).toBe('javascript');
  });

  it('should render an inline error when the code is empty', () => {
    render(<CodeForm nodeId={NODE_ID} config={{ code: '', language: 'javascript' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should render an inline error when the code exceeds 10000 characters', () => {
    const huge = 'a'.repeat(10001);
    render(<CodeForm nodeId={NODE_ID} config={{ code: huge, language: 'javascript' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
