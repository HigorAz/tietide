import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useEditorStore } from '@/stores/editorStore';
import { OutlookSearchForm } from './OutlookSearchForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OutlookSearchForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders form + ConnectionPicker(provider=microsoft)', () => {
    seedConnection();
    render(
      <OutlookSearchForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, query: 'subject:test' }}
      />,
    );
    expect(screen.getByTestId('outlook-search-form')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / query', () => {
    seedConnection();
    render(<OutlookSearchForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-search-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('outlook-search-query-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig with maxResults as a number when typed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <OutlookSearchForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID, query: 'a' }} />,
    );
    const max = screen.getByLabelText(/^max results/i) as HTMLInputElement;
    fireEvent.change(max, { target: { value: '25' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { maxResults: 25 });
  });

  it('shows the empty-state CTA when no Microsoft connections exist', () => {
    useConnectionsStore.setState({
      connections: [],
      status: 'ready',
      error: null,
      testingIds: {},
      deletingIds: {},
    });
    render(<OutlookSearchForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
