import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { HubspotCreateContactForm } from './HubspotCreateContactForm';

const NODE_ID = 'node-hs-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seedHubspotConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'hubspot',
        name: 'My HubSpot',
        status: ConnectionStatus.ACTIVE,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('HubspotCreateContactForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedHubspotConnection();
    render(
      <HubspotCreateContactForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, email: 'jane@example.com' }}
      />,
    );
    expect(screen.getByTestId('hubspot-create-contact-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seedHubspotConnection();
    render(<HubspotCreateContactForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('hubspot-create-contact-form-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('hubspot-create-contact-form-email-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when first name is typed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedHubspotConnection();
    render(
      <HubspotCreateContactForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, email: 'a@b.com' }}
      />,
    );
    // "First name" is optional, so it lives inside the collapsed Options section.
    fireEvent.click(screen.getByText(/Options/));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { firstName: 'Jane' });
  });
});
