import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SheetsRowAddedForm } from './SheetsRowAddedForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('SheetsRowAddedForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders the form with ConnectionPicker filtered to google', () => {
    seedConnection();
    render(<SheetsRowAddedForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    expect(screen.getByTestId('sheets-row-added-form')).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / spreadsheetId / range', () => {
    seedConnection();
    render(<SheetsRowAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('sheets-row-added-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-row-added-id-error')).toBeInTheDocument();
    expect(screen.getByTestId('sheets-row-added-range-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<SheetsRowAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('hides errors when all required fields are filled', () => {
    seedConnection();
    render(
      <SheetsRowAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, spreadsheetId: 'sheet-1', range: 'Sheet1!A:Z' }}
      />,
    );
    expect(screen.queryByTestId('sheets-row-added-connection-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sheets-row-added-id-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sheets-row-added-range-error')).not.toBeInTheDocument();
  });
});
