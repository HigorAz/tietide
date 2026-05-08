import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExcelReadForm } from './ExcelReadForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('ExcelReadForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with current config values', () => {
    seedConnection();
    render(
      <ExcelReadForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          workbookId: 'wb-1',
          worksheet: 'Sheet1',
          range: 'A1:C5',
        }}
      />,
    );
    expect(screen.getByTestId('excel-read-form')).toBeInTheDocument();
    expect((screen.getByLabelText(/range \(a1 notation\)/i) as HTMLInputElement).value).toBe(
      'A1:C5',
    );
  });

  it('shows required-field errors for missing fields', () => {
    seedConnection();
    render(<ExcelReadForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('excel-read-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-read-workbook-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-read-sheet-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-read-range-error')).toBeInTheDocument();
  });

  it('shows a range-pattern error for malformed range', () => {
    seedConnection();
    render(
      <ExcelReadForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          workbookId: 'wb-1',
          worksheet: 'Sheet1',
          range: "A1:C5')/foo",
        }}
      />,
    );
    expect(screen.getByTestId('excel-read-range-error').textContent).toMatch(/A1 notation/i);
  });
});
