import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useEditorStore } from '@/stores/editorStore';
import { OutlookMessageReceivedForm } from './OutlookMessageReceivedForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OutlookMessageReceivedForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the ConnectionPicker filtered to provider="microsoft"', () => {
    seedConnection();
    render(<OutlookMessageReceivedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-message-received-form')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Microsoft connections exist', () => {
    useConnectionsStore.setState({
      connections: [],
      status: 'ready',
      error: null,
      testingIds: {},
      deletingIds: {},
    });
    render(<OutlookMessageReceivedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('flags the missing connection as a required-field error', () => {
    seedConnection();
    render(<OutlookMessageReceivedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-message-received-connection-error')).toBeInTheDocument();
  });

  it('persists filter changes to the editor store', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <OutlookMessageReceivedForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />,
    );
    fireEvent.change(screen.getByLabelText(/OData \$filter/i), {
      target: { value: "from/emailAddress/address eq 'boss@example.com'" },
    });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
      filter: "from/emailAddress/address eq 'boss@example.com'",
    });
  });

  it('shows a newline error when filter contains CRLF', () => {
    seedConnection();
    render(
      <OutlookMessageReceivedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, filter: 'a\r\nb' }}
      />,
    );
    expect(screen.getByTestId('outlook-message-received-filter-error').textContent).toMatch(
      /newline/i,
    );
  });
});
