import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { InteractionModeToggle } from './InteractionModeToggle';

beforeEach(() => {
  useEditorStore.setState({ ...initialEditorState });
});

describe('InteractionModeToggle', () => {
  it('marks Pan mode active by default', () => {
    render(<InteractionModeToggle />);
    expect(screen.getByRole('button', { name: /pan mode/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /select mode/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches the store to select mode when Select is clicked', async () => {
    render(<InteractionModeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /select mode/i }));
    expect(useEditorStore.getState().interactionMode).toBe('select');
    expect(screen.getByRole('button', { name: /select mode/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switches back to pan mode when Pan is clicked', async () => {
    useEditorStore.setState({ interactionMode: 'select' });
    render(<InteractionModeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /pan mode/i }));
    expect(useEditorStore.getState().interactionMode).toBe('pan');
  });
});
