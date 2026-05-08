import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarEventCreatedForm } from './CalendarEventCreatedForm';
import { CONNECTION_ID, NODE_ID, resetGoogleFormState, seedConnection } from './__test__/fixtures';

describe('CalendarEventCreatedForm', () => {
  beforeEach(() => resetGoogleFormState());

  it('renders the form', () => {
    seedConnection();
    render(
      <CalendarEventCreatedForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, calendarId: 'primary' }}
      />,
    );
    expect(screen.getByTestId('calendar-event-created-form')).toBeInTheDocument();
  });

  it('shows the connection error when no connection is set', () => {
    seedConnection();
    render(<CalendarEventCreatedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('calendar-event-created-connection-error')).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    render(<CalendarEventCreatedForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });
});
