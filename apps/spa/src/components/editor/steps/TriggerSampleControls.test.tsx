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

  it('does not capture when there is no run and no example for the type', async () => {
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
