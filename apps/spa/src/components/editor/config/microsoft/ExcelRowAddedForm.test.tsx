import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { ExcelRowAddedForm } from './ExcelRowAddedForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('ExcelRowAddedForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with the Microsoft ConnectionPicker', () => {
    seedConnection();
    render(<ExcelRowAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('excel-row-added-form')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('shows required-field errors for connection / workbookId / worksheet', () => {
    seedConnection();
    render(<ExcelRowAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('excel-row-added-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-row-added-workbook-error')).toBeInTheDocument();
    expect(screen.getByTestId('excel-row-added-worksheet-error')).toBeInTheDocument();
  });

  it('persists workbookId, worksheet, and tableName updates', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <ExcelRowAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, workbookId: 'wb1', worksheet: 'Sheet1' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Workbook/i), { target: { value: 'wb-2' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { workbookId: 'wb-2' });
    fireEvent.change(screen.getByLabelText(/Worksheet/i), { target: { value: 'Data' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { worksheet: 'Data' });
    fireEvent.change(screen.getByLabelText(/Table name/i), { target: { value: 'Orders' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { tableName: 'Orders' });
  });

  it('persists the optional poll interval as a number', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <ExcelRowAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, workbookId: 'wb1', worksheet: 'Sheet1' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Poll interval/i), { target: { value: '600' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { intervalSeconds: 600 });
  });

  it('mentions the Excel Table requirement', () => {
    seedConnection();
    render(<ExcelRowAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByText(/real Excel Table object/i)).toBeInTheDocument();
  });
});
