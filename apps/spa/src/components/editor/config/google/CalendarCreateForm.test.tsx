import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarCreateForm } from './CalendarCreateForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('CalendarCreateForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders ConnectionPicker (provider=google) and DataPillInput for summary', () => {
    seedConnection();
    render(
      <CalendarCreateForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          calendarId: 'primary',
          summary: 'S',
          start: '2026-06-01T09:00:00Z',
          end: '2026-06-01T10:00:00Z',
        }}
      />,
    );
    expect(screen.getByTestId('calendar-create-form')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('shows required-field errors for missing connection / summary / start / end', () => {
    seedConnection();
    render(<CalendarCreateForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('calendar-create-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-create-summary-error')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-create-start-error')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-create-end-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<CalendarCreateForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
