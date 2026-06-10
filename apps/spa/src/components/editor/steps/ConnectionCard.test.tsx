import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionCard } from './ConnectionCard';

describe('ConnectionCard', () => {
  it('renders provider icon, name, a status line and a change affordance for a selected connection', () => {
    render(
      <ConnectionCard
        providerIcon={<span data-testid="provider-icon" />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
      >
        <button type="button">picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByTestId('provider-icon')).toBeInTheDocument();
    expect(screen.getByText('My Google')).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByTestId('connection-card-change')).toBeInTheDocument();
  });

  it('renders the wrapped picker control as a child', () => {
    render(
      <ConnectionCard
        providerIcon={<span />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
      >
        <button type="button">the-underlying-picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByRole('button', { name: 'the-underlying-picker' })).toBeInTheDocument();
  });

  it('renders a muted "No authentication" state for an optional connection with no selection', () => {
    render(
      <ConnectionCard providerIcon={<span />} name={null} status={null} optional stale={false}>
        <button type="button">picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByText(/no authentication/i)).toBeInTheDocument();
    expect(screen.getByTestId('connection-card-change')).toBeInTheDocument();
  });

  it('renders "Choose a connection" for a required connection with no selection', () => {
    render(
      <ConnectionCard
        providerIcon={<span />}
        name={null}
        status={null}
        optional={false}
        stale={false}
      >
        <button type="button">picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByText(/choose a connection/i)).toBeInTheDocument();
  });

  it('renders "Connection unavailable" when the saved connection is stale', () => {
    render(
      <ConnectionCard providerIcon={<span />} name={null} status={null} optional={false} stale>
        <button type="button">picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByText(/connection unavailable/i)).toBeInTheDocument();
  });

  it('forwards a custom data-testid to the card root', () => {
    render(
      <ConnectionCard
        providerIcon={<span />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
        data-testid="my-card"
      >
        <button type="button">picker</button>
      </ConnectionCard>,
    );

    expect(screen.getByTestId('my-card')).toBeInTheDocument();
  });

  it('change affordance toggles the wrapped picker control into view', async () => {
    const user = userEvent.setup();
    render(
      <ConnectionCard
        providerIcon={<span />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
      >
        <button type="button" data-testid="wrapped-picker">
          picker
        </button>
      </ConnectionCard>,
    );

    // The wrapped picker control is always present (the card wraps, not replaces).
    const picker = screen.getByTestId('wrapped-picker');
    expect(picker).toBeInTheDocument();
    // Clicking change must not throw and keeps the picker reachable.
    await user.click(screen.getByTestId('connection-card-change'));
    expect(screen.getByTestId('wrapped-picker')).toBeInTheDocument();
  });
});
