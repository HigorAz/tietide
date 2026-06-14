import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionProvider } from '@tietide/shared';
import { ProviderPicker } from './ProviderPicker';

describe('ProviderPicker', () => {
  const onPick = vi.fn();

  beforeEach(() => {
    onPick.mockReset();
  });

  it('should render a card for every provider in the catalog', () => {
    render(<ProviderPicker onPick={onPick} />);

    for (const label of [
      'Google',
      'Microsoft',
      'Slack',
      'Notion',
      'OpenAI',
      'Anthropic',
      'Discord (Webhook)',
      'Discord (Bot)',
      'Twilio',
      'Telegram',
      'Trello',
      'Airtable',
      'Linear',
      'GitHub',
      'Ollama',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('should distinguish OAuth vs other providers in the card subtitle', () => {
    render(<ProviderPicker onPick={onPick} />);
    // OAuth: Google, Microsoft, Slack, Notion, HubSpot, GitHub = 6.
    // The picker labels both API_KEY and CUSTOM types as "API key" since users
    // see only one form-from-schema flow either way: OpenAI, Anthropic, Ollama,
    // Twilio, Telegram, Discord (Webhook), Discord (Bot), Trello, Airtable,
    // Linear, Stripe, Mailchimp, Calendly, Postgres, MySQL, S3, HTTP = 17.
    expect(screen.getAllByText(/^OAuth$/).length).toBe(6);
    expect(screen.getAllByText(/^API key$/).length).toBe(17);
  });

  it('should call onPick with the provider entry when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<ProviderPicker onPick={onPick} />);

    await user.click(screen.getByTestId('provider-card-google'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe(ConnectionProvider.GOOGLE);
  });
});
