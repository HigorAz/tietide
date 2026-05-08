import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useEditorStore } from '@/stores/editorStore';
import { OutlookSendForm } from './OutlookSendForm';
import {
  CONNECTION_ID,
  NODE_ID,
  resetMicrosoftFormState,
  seedConnection,
} from './__test__/fixtures';

describe('OutlookSendForm', () => {
  beforeEach(() => resetMicrosoftFormState());

  it('renders the form with current config values', () => {
    seedConnection();
    render(
      <OutlookSendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          to: 'recipient@example.com',
          subject: 'Hello',
          body: 'Greetings',
        }}
      />,
    );
    expect(screen.getByTestId('outlook-send-form')).toBeInTheDocument();
    expect((screen.getByLabelText(/^body$/i) as HTMLTextAreaElement).value).toBe('Greetings');
  });

  it('renders the ConnectionPicker filtered to provider="microsoft"', () => {
    seedConnection();
    render(<OutlookSendForm nodeId={NODE_ID} config={{}} />);
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
    render(<OutlookSendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('calls updateNodeConfig with new body when the user types in the body textarea', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <OutlookSendForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, to: 'r@e.com', subject: 'S', body: '' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: 'New body' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { body: 'New body' });
  });

  it('shows required-field errors for missing connection / to / subject / body', () => {
    seedConnection();
    render(<OutlookSendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('outlook-send-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('outlook-send-to-error')).toBeInTheDocument();
    expect(screen.getByTestId('outlook-send-subject-error')).toBeInTheDocument();
    expect(screen.getByTestId('outlook-send-body-error')).toBeInTheDocument();
  });

  it('shows a header-injection error when To contains CR/LF', () => {
    seedConnection();
    render(
      <OutlookSendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          to: 'recipient@example.com\r\nBcc: evil@e.com',
          subject: 'Hi',
          body: 'B',
        }}
      />,
    );
    expect(screen.getByTestId('outlook-send-to-error').textContent).toMatch(/newline/i);
  });

  it('renders DataPillInput (role=combobox) for the To field', () => {
    seedConnection();
    render(<OutlookSendForm nodeId={NODE_ID} config={{}} />);
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('toggles isHtml when its checkbox is clicked', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <OutlookSendForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, to: 'r@e.com', subject: 'S', body: 'B' }}
      />,
    );
    const htmlCheckbox = screen.getByLabelText(/Body is HTML/i);
    fireEvent.click(htmlCheckbox);
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { isHtml: true });
  });
});
