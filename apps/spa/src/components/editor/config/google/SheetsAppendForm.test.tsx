import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SheetsAppendForm } from './SheetsAppendForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('SheetsAppendForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for spreadsheetId', () => {
    seedConnection();
    render(
      <SheetsAppendForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, spreadsheetId: 'sid', sheet: 'S', values: [['a']] }}
      />,
    );
    expect(screen.getByTestId('sheets-append-form')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / spreadsheetId / sheet', () => {
    seedConnection();
    render(<SheetsAppendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('sheets-append-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-append-id-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-append-sheet-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<SheetsAppendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
