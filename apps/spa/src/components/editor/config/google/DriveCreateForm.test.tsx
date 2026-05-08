import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriveCreateForm } from './DriveCreateForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('DriveCreateForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for name', () => {
    seedConnection();
    render(<DriveCreateForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    expect(screen.getByTestId('drive-create-form')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / name / mimeType', () => {
    seedConnection();
    render(<DriveCreateForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('drive-create-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('drive-create-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('drive-create-mime-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<DriveCreateForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
