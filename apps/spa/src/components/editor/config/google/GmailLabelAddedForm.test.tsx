import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GmailLabelAddedForm } from './GmailLabelAddedForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('GmailLabelAddedForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders the form', () => {
    seedConnection();
    render(
      <GmailLabelAddedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, labelId: 'INBOX' }}
      />,
    );
    expect(screen.getByTestId('gmail-label-added-form')).toBeInTheDocument();
  });

  it('shows required-field errors for missing connection / labelId', () => {
    seedConnection();
    render(<GmailLabelAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('gmail-label-added-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-label-added-label-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<GmailLabelAddedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
