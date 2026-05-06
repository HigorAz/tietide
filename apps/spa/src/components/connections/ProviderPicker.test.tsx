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

  it('should render a card for every provider in the catalog (6)', () => {
    render(<ProviderPicker onPick={onPick} />);

    for (const label of ['Google', 'Microsoft', 'Slack', 'Notion', 'OpenAI', 'Anthropic']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('should distinguish OAuth vs API key providers in the card subtitle', () => {
    render(<ProviderPicker onPick={onPick} />);
    // Four OAuth + two API-key entries.
    expect(screen.getAllByText(/^OAuth$/).length).toBe(4);
    expect(screen.getAllByText(/^API key$/).length).toBe(2);
  });

  it('should call onPick with the provider entry when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<ProviderPicker onPick={onPick} />);

    await user.click(screen.getByTestId('provider-card-google'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe(ConnectionProvider.GOOGLE);
  });
});
