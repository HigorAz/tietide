import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { OutlookMessageFlaggedForm } from './OutlookMessageFlaggedForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OutlookMessageFlaggedForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with the Microsoft ConnectionPicker', () => {
    seedConnection();
    render(<OutlookMessageFlaggedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-message-flagged-form')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('flags the missing connection as a required-field error', () => {
    seedConnection();
    render(<OutlookMessageFlaggedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-message-flagged-connection-error')).toBeInTheDocument();
  });

  it('persists the optional filter to the editor store', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(<OutlookMessageFlaggedForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    fireEvent.change(screen.getByLabelText(/Extra OData \$filter/i), {
      target: { value: "importance eq 'high'" },
    });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { filter: "importance eq 'high'" });
  });

  it('explains that the flagged condition is pre-applied', () => {
    seedConnection();
    render(<OutlookMessageFlaggedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByText(/flag\/flagStatus eq 'flagged'/i)).toBeInTheDocument();
  });
});
