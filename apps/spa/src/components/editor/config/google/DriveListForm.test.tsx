import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriveListForm } from './DriveListForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('DriveListForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for folderId', () => {
    seedConnection();
    render(<DriveListForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    expect(screen.getByTestId('drive-list-form')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / folderId', () => {
    seedConnection();
    render(<DriveListForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('drive-list-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('drive-list-folder-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<DriveListForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
