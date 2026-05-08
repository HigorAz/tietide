import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { ExcelAppendForm } from './ExcelAppendForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('ExcelAppendForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders form with all fields', () => {
    seedConnection();
    render(
      <ExcelAppendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          workbookId: 'wb-1',
          worksheet: 'Sheet1',
          values: [['a', 'b']],
        }}
      />,
    );
    expect(screen.getByTestId('excel-append-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/worksheet name/i)).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / workbookId / worksheet / values', () => {
    seedConnection();
    render(<ExcelAppendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('excel-append-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-append-workbook-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-append-sheet-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-append-values-error')).toBeInTheDocument();
  });

  it('parses JSON values on blur and calls updateNodeConfig with the matrix', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <ExcelAppendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          workbookId: 'wb-1',
          worksheet: 'Sheet1',
          values: [['a']],
        }}
      />,
    );
    const textarea = screen.getByLabelText(/values \(json array of rows\)/i);
    fireEvent.change(textarea, { target: { value: '[["x", 1]]' } });
    fireEvent.blur(textarea);
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { values: [['x', 1]] });
  });

  it('shows JSON parse error on invalid input', () => {
    seedConnection();
    render(
      <ExcelAppendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          workbookId: 'wb-1',
          worksheet: 'Sheet1',
          values: [['a']],
        }}
      />,
    );
    const textarea = screen.getByLabelText(/values \(json array of rows\)/i);
    fireEvent.change(textarea, { target: { value: 'not json' } });
    fireEvent.blur(textarea);
    expect(screen.getByTestId('excel-append-values-error').textContent).toMatch(/json/i);
  });
});
