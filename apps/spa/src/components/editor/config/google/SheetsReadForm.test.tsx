import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SheetsReadForm } from './SheetsReadForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('SheetsReadForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for spreadsheetId', () => {
    seedConnection();
    render(<SheetsReadForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    expect(screen.getByTestId('sheets-read-form')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / spreadsheetId / range', () => {
    seedConnection();
    render(<SheetsReadForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('sheets-read-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-read-id-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-read-range-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<SheetsReadForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
