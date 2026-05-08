import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { TwilioSendSmsForm } from './TwilioSendSmsForm';

const NODE_ID = 'node-twilio-1';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

const seedTwilioConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'twilio',
        name: 'Acme Twilio',
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

describe('TwilioSendSmsForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedTwilioConnection();
    render(
      <TwilioSendSmsForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          from: '+14155550100',
          to: '+14155550101',
          body: 'hi',
        }}
      />,
    );
    expect(screen.getByTestId('twilio-send-sms-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seedTwilioConnection();
    render(<TwilioSendSmsForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('twilio-send-sms-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('twilio-send-sms-from-error')).toBeInTheDocument();
    expect(screen.getByTestId('twilio-send-sms-to-error')).toBeInTheDocument();
    expect(screen.getByTestId('twilio-send-sms-body-error')).toBeInTheDocument();
  });

  it('shows an E.164 error when "to" is not E.164', () => {
    seedTwilioConnection();
    render(
      <TwilioSendSmsForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          from: '+14155550100',
          to: '4155550101',
          body: 'hi',
        }}
      />,
    );
    expect(screen.getByTestId('twilio-send-sms-to-error')).toBeInTheDocument();
  });
});
