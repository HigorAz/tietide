import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { DiscordReplyToCommandForm } from './DiscordReplyToCommandForm';

const NODE_ID = 'node-discord-reply-1';

describe('DiscordReplyToCommandForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    render(<DiscordReplyToCommandForm nodeId={NODE_ID} config={{ content: 'Hello!' }} />);
    expect(screen.getByTestId('discord-reply-to-command-form')).toBeInTheDocument();
  });

  it('shows a required-field error when content is empty', () => {
    render(<DiscordReplyToCommandForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('discord-reply-to-command-content-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when the message is typed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    render(<DiscordReplyToCommandForm nodeId={NODE_ID} config={{ content: '' }} />);
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'hi there' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { content: 'hi there' });
  });
});
