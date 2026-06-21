import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { NODE_OUTPUT_EXAMPLES } from '@/components/editor/preview/nodeOutputExamples';
import { TriggerSampleControls } from './TriggerSampleControls';

const toast = vi.fn();
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (sel: (s: { show: typeof toast }) => unknown) => sel({ show: toast }),
}));
vi.mock('../serialization', () => ({
  toWorkflowDefinition: () => ({ nodes: [], edges: [] }),
}));
vi.mock('@/api/executions', () => ({ getTriggerSample: vi.fn() }));
import { getTriggerSample } from '@/api/executions';

const mockedFetch = vi.mocked(getTriggerSample);

describe('TriggerSampleControls', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState, workflowId: 'wf-1' });
    vi.clearAllMocks();
  });

  it('captures the last run’s sample when one exists', async () => {
    const onCapture = vi.fn();
    mockedFetch.mockResolvedValue({ source: 'last-run', sample: { issue: { title: 'real' } } });

    render(
      <TriggerSampleControls nodeId="t1" nodeType="github-issue-opened" onCapture={onCapture} />,
    );
    fireEvent.click(screen.getByTestId('trigger-fetch-sample'));

    await waitFor(() => expect(onCapture).toHaveBeenCalledWith({ issue: { title: 'real' } }));
  });

  it('falls back to a built-in example when there is no prior run', async () => {
    const onCapture = vi.fn();
    mockedFetch.mockResolvedValue({ source: 'none', sample: null });

    render(
      <TriggerSampleControls nodeId="t1" nodeType="github-issue-opened" onCapture={onCapture} />,
    );
    fireEvent.click(screen.getByTestId('trigger-fetch-sample'));

    await waitFor(() =>
      expect(onCapture).toHaveBeenCalledWith(NODE_OUTPUT_EXAMPLES['github-issue-opened']),
    );
  });

  it('derives a sample from the trigger output schema when there is no run and no example', async () => {
    const onCapture = vi.fn();
    mockedFetch.mockResolvedValue({ source: 'none', sample: null });

    // airtable-record-created has a concrete output schema but no curated
    // NODE_OUTPUT_EXAMPLES entry, so it exercises the schema-derived fallback.
    expect(NODE_OUTPUT_EXAMPLES['airtable-record-created']).toBeUndefined();

    render(
      <TriggerSampleControls
        nodeId="t1"
        nodeType="airtable-record-created"
        onCapture={onCapture}
      />,
    );
    fireEvent.click(screen.getByTestId('trigger-fetch-sample'));

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const captured = onCapture.mock.calls[0][0] as Record<string, unknown>;
    // A field-bearing object the picker can derive `{{trigger.*}}` paths from.
    expect(captured).toBeTypeOf('object');
    expect(Object.keys(captured).length).toBeGreaterThan(0);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/generated example/i) }),
    );
  });

  it('does not capture when there is no run, no example, and no concrete schema', async () => {
    const onCapture = vi.fn();
    mockedFetch.mockResolvedValue({ source: 'none', sample: null });

    render(
      <TriggerSampleControls nodeId="t1" nodeType="some-unmapped-trigger" onCapture={onCapture} />,
    );
    fireEvent.click(screen.getByTestId('trigger-fetch-sample'));

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(onCapture).not.toHaveBeenCalled();
  });
});
