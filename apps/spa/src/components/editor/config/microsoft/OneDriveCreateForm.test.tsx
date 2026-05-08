import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { OneDriveCreateForm } from './OneDriveCreateForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OneDriveCreateForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with current config values', () => {
    seedConnection();
    const helloB64 = Buffer.from('hello', 'utf8').toString('base64');
    render(
      <OneDriveCreateForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          name: 'a.txt',
          mimeType: 'text/plain',
          contentBase64: helloB64,
        }}
      />,
    );
    expect(screen.getByTestId('onedrive-create-form')).toBeInTheDocument();
    // Content textarea should show decoded UTF-8.
    expect((screen.getByLabelText(/^content/i) as HTMLTextAreaElement).value).toBe('hello');
  });

  it('shows required-field errors for missing fields', () => {
    seedConnection();
    render(<OneDriveCreateForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('onedrive-create-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('onedrive-create-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('onedrive-create-mime-error')).toBeInTheDocument();
    expect(screen.getByTestId('onedrive-create-content-error')).toBeInTheDocument();
  });

  it('rejects names with path separators (path-traversal defense)', () => {
    seedConnection();
    render(
      <OneDriveCreateForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          name: 'evil/path.txt',
          mimeType: 'text/plain',
          contentBase64: 'aGVsbG8=',
        }}
      />,
    );
    expect(screen.getByTestId('onedrive-create-name-error').textContent).toMatch(/path/i);
  });

  it('encodes UTF-8 content as base64 on textarea blur', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <OneDriveCreateForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          name: 'a.txt',
          mimeType: 'text/plain',
          contentBase64: 'aGVsbG8=',
        }}
      />,
    );
    const textarea = screen.getByLabelText(/^content/i);
    fireEvent.change(textarea, { target: { value: 'world' } });
    fireEvent.blur(textarea);
    const expected = Buffer.from('world', 'utf8').toString('base64');
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { contentBase64: expected });
  });
});
