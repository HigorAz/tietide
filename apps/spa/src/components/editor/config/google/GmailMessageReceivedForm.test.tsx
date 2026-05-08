import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GmailMessageReceivedForm } from './GmailMessageReceivedForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('GmailMessageReceivedForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders the form with ConnectionPicker filtered to google', () => {
    seedConnection();
    render(
      <GmailMessageReceivedForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          topicName: 'projects/p/topics/t',
        }}
      />,
    );
    expect(screen.getByTestId('gmail-message-received-form')).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / topicName', () => {
    seedConnection();
    render(<GmailMessageReceivedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('gmail-message-received-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-message-received-topic-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<GmailMessageReceivedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('rejects malformed Pub/Sub topic names', () => {
    seedConnection();
    render(
      <GmailMessageReceivedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, topicName: 'not-a-valid-topic' }}
      />,
    );
    expect(screen.getByTestId('gmail-message-received-topic-error')).toBeInTheDocument();
  });
});
