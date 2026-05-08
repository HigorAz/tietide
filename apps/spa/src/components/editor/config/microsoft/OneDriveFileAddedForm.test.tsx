import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { OneDriveFileAddedForm } from './OneDriveFileAddedForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OneDriveFileAddedForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with the Microsoft ConnectionPicker', () => {
    seedConnection();
    render(<OneDriveFileAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('onedrive-file-added-form')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('flags the missing connection as a required-field error', () => {
    seedConnection();
    render(<OneDriveFileAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('onedrive-file-added-connection-error')).toBeInTheDocument();
  });

  it('persists folderPath updates', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(<OneDriveFileAddedForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    fireEvent.change(screen.getByLabelText(/folder path/i), {
      target: { value: '/Documents/Inbox' },
    });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { folderPath: '/Documents/Inbox' });
  });

  it('rejects folderPath containing ".." traversal', () => {
    seedConnection();
    render(
      <OneDriveFileAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, folderPath: '/a/../b' }}
      />,
    );
    expect(screen.getByTestId('onedrive-file-added-folder-error').textContent).toMatch(/\.\./);
  });
});
