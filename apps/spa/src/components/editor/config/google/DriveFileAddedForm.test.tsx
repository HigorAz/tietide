import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriveFileAddedForm } from './DriveFileAddedForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('DriveFileAddedForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders the form', () => {
    seedConnection();
    render(
      <DriveFileAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, parentFolderId: 'folder-A' }}
      />,
    );
    expect(screen.getByTestId('drive-file-added-form')).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / parentFolderId', () => {
    seedConnection();
    render(<DriveFileAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('drive-file-added-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('drive-file-added-folder-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<DriveFileAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
