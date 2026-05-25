import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialExecutionLiveState, useExecutionLiveStore } from '@/stores/executionLiveStore';
import { EditorViewTabs } from './EditorViewTabs';

describe('EditorViewTabs', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
  });

  it('should not render when no execution is loaded', () => {
    render(<EditorViewTabs />);
    expect(screen.queryByTestId('editor-view-tabs')).not.toBeInTheDocument();
  });

  it('should render Configure and Result tabs when an execution is loaded', () => {
    useExecutionLiveStore.setState({ executionId: 'exec-1' });
    render(<EditorViewTabs />);
    expect(screen.getByTestId('editor-view-tabs')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Configure' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Result' })).toBeInTheDocument();
  });

  it('should mark the tab matching the current viewMode as selected', () => {
    useExecutionLiveStore.setState({ executionId: 'exec-1' });
    useEditorStore.setState({ viewMode: 'result' });
    render(<EditorViewTabs />);
    expect(screen.getByRole('tab', { name: 'Result' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Configure' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('should switch viewMode to result when the Result tab is clicked', async () => {
    const user = userEvent.setup();
    useExecutionLiveStore.setState({ executionId: 'exec-1' });
    render(<EditorViewTabs />);
    await user.click(screen.getByRole('tab', { name: 'Result' }));
    expect(useEditorStore.getState().viewMode).toBe('result');
  });

  it('should switch viewMode back to configure when the Configure tab is clicked', async () => {
    const user = userEvent.setup();
    useExecutionLiveStore.setState({ executionId: 'exec-1' });
    useEditorStore.setState({ viewMode: 'result' });
    render(<EditorViewTabs />);
    await user.click(screen.getByRole('tab', { name: 'Configure' }));
    expect(useEditorStore.getState().viewMode).toBe('configure');
  });
});
