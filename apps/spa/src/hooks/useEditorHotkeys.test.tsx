import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { useEditorHotkeys } from './useEditorHotkeys';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const saveWorkflowMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/editor/saveWorkflow', () => ({
  saveWorkflow: (id: string) => saveWorkflowMock(id),
}));

const executeWorkflowMock = vi.fn().mockResolvedValue({ id: 'exec-1' });
vi.mock('@/api/executions', () => ({
  executeWorkflow: (id: string) => executeWorkflowMock(id),
}));

interface HostProps {
  workflowId?: string;
  onShowCheatsheet?: () => void;
  withInput?: boolean;
}

function Host({ workflowId = 'wf-1', onShowCheatsheet = vi.fn(), withInput = false }: HostProps) {
  useEditorHotkeys({ workflowId, onShowCheatsheet });
  return (
    <div>
      <span data-testid="host">host</span>
      {withInput && <input data-testid="probe" type="text" />}
    </div>
  );
}

const renderHost = (props: HostProps = {}) =>
  render(
    <MemoryRouter>
      <Host {...props} />
    </MemoryRouter>,
  );

const KEY_TO_CODE: Record<string, string> = {
  s: 'KeyS',
  z: 'KeyZ',
  d: 'KeyD',
  t: 'KeyT',
  '/': 'Slash',
  Enter: 'Enter',
  Delete: 'Delete',
  Backspace: 'Backspace',
};

const fireKey = (
  key: string,
  extra: Partial<KeyboardEventInit> & { useDispatch?: boolean } = {},
): KeyboardEvent | null => {
  const init: KeyboardEventInit = {
    key,
    code: KEY_TO_CODE[key] ?? key,
    bubbles: true,
    cancelable: true,
    ...extra,
  };
  if (extra.useDispatch) {
    const event = new KeyboardEvent('keydown', init);
    document.body.dispatchEvent(event);
    return event;
  }
  fireEvent.keyDown(document.body, init);
  return null;
};

const fireMod = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
  fireKey(key, { ctrlKey: true, ...extra });

describe('useEditorHotkeys', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useToastStore.setState({ ...initialToastState });
    saveWorkflowMock.mockClear();
    executeWorkflowMock.mockClear();
    navigateMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Cmd+S triggers save when the editor is dirty', async () => {
    useEditorStore.setState({ isDirty: true });
    renderHost();

    fireMod('s');
    await Promise.resolve();
    await Promise.resolve();

    expect(saveWorkflowMock).toHaveBeenCalledWith('wf-1');
  });

  it('Cmd+S does NOT save when the editor is clean (avoids toast spam)', () => {
    useEditorStore.setState({ isDirty: false });
    renderHost();

    fireMod('s');

    expect(saveWorkflowMock).not.toHaveBeenCalled();
  });

  it('Cmd+Z calls editorStore.undo', () => {
    const undo = vi.fn();
    useEditorStore.setState({ undo });
    renderHost();

    fireMod('z');

    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+Z calls editorStore.redo', () => {
    const redo = vi.fn();
    useEditorStore.setState({ redo });
    renderHost();

    fireMod('z', { shiftKey: true });

    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('Delete calls editorStore.deleteSelected', () => {
    const deleteSelected = vi.fn();
    useEditorStore.setState({ deleteSelected });
    renderHost();

    fireKey('Delete');

    expect(deleteSelected).toHaveBeenCalledTimes(1);
  });

  it('Backspace calls editorStore.deleteSelected', () => {
    const deleteSelected = vi.fn();
    useEditorStore.setState({ deleteSelected });
    renderHost();

    fireKey('Backspace');

    expect(deleteSelected).toHaveBeenCalledTimes(1);
  });

  it('Cmd+D calls editorStore.duplicateSelected and prevents default', () => {
    const duplicateSelected = vi.fn();
    useEditorStore.setState({ duplicateSelected });
    renderHost();

    const event = fireKey('d', { ctrlKey: true, useDispatch: true });

    expect(duplicateSelected).toHaveBeenCalledTimes(1);
    expect(event?.defaultPrevented).toBe(true);
  });

  it('Cmd+/ calls editorStore.toggleSkipOnSelected', () => {
    const toggleSkipOnSelected = vi.fn();
    useEditorStore.setState({ toggleSkipOnSelected });
    renderHost();

    fireMod('/');

    expect(toggleSkipOnSelected).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Enter executes the workflow', async () => {
    renderHost();

    fireMod('Enter');
    await Promise.resolve();
    await Promise.resolve();

    expect(executeWorkflowMock).toHaveBeenCalledWith('wf-1');
  });

  it('Cmd+T is a no-op that warns instead of opening a new tab', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderHost();

    const event = fireKey('t', { ctrlKey: true, useDispatch: true });

    expect(warnSpy).toHaveBeenCalled();
    expect(executeWorkflowMock).not.toHaveBeenCalled();
    expect(saveWorkflowMock).not.toHaveBeenCalled();
    expect(event?.defaultPrevented).toBe(true);
  });

  it('? (Shift+/) calls onShowCheatsheet', () => {
    const onShowCheatsheet = vi.fn();
    renderHost({ onShowCheatsheet });

    fireKey('/', { shiftKey: true });

    expect(onShowCheatsheet).toHaveBeenCalledTimes(1);
  });

  it('does not fire shortcuts when focus is in a text input (enableOnFormTags=false)', () => {
    const undo = vi.fn();
    useEditorStore.setState({ undo, isDirty: true });
    renderHost({ withInput: true });

    const input = screen.getByTestId('probe');
    input.focus();
    fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(input, { key: 's', code: 'KeyS', ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(saveWorkflowMock).not.toHaveBeenCalled();
  });
});
