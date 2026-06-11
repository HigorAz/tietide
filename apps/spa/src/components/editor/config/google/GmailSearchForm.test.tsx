import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GmailSearchForm } from './GmailSearchForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('GmailSearchForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for query', () => {
    seedConnection();
    render(<GmailSearchForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID }} />);
    expect(screen.getByTestId('gmail-search-form')).toBeInTheDocument();
    // ConnectionPicker + DataPillInput each render role=combobox.
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / query', () => {
    seedConnection();
    render(<GmailSearchForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('gmail-search-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-search-query-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<GmailSearchForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('renders the dry-run mock setting as a shared ToggleSwitch (role=switch)', () => {
    seedConnection();
    render(
      <GmailSearchForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, query: 'is:unread', mockOnDryRun: true }}
      />,
    );
    const toggle = screen.getByRole('switch', {
      name: /skip gmail call on test runs/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
