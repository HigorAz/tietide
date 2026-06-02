import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { PillSampleField } from './PillSampleField';

const NODE_ID = 'node-1';

describe('PillSampleField', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders an existing sample as pretty-printed JSON', () => {
    render(<PillSampleField nodeId={NODE_ID} config={{ [PILL_SAMPLE_KEY]: { foo: 'bar' } }} />);
    const textarea = screen.getByTestId('pill-sample-field') as HTMLTextAreaElement;
    expect(textarea.value).toBe(JSON.stringify({ foo: 'bar' }, null, 2));
  });

  it('commits the parsed sample on blur when the JSON is valid', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<PillSampleField nodeId={NODE_ID} config={{}} />);
    const textarea = screen.getByTestId('pill-sample-field');
    fireEvent.change(textarea, { target: { value: '{"id": 42}' } });
    fireEvent.blur(textarea);

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { [PILL_SAMPLE_KEY]: { id: 42 } });
  });

  it('shows an error and does not commit when the JSON is invalid', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<PillSampleField nodeId={NODE_ID} config={{}} />);
    const textarea = screen.getByTestId('pill-sample-field');
    fireEvent.change(textarea, { target: { value: '{not json' } });
    fireEvent.blur(textarea);

    expect(screen.getByTestId('pill-sample-error')).toBeInTheDocument();
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it('clears the sample (undefined) on blur when emptied', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<PillSampleField nodeId={NODE_ID} config={{ [PILL_SAMPLE_KEY]: { foo: 'bar' } }} />);
    const textarea = screen.getByTestId('pill-sample-field');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.blur(textarea);

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { [PILL_SAMPLE_KEY]: undefined });
  });
});
