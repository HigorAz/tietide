import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileTopBar } from './MobileTopBar';

describe('MobileTopBar', () => {
  it('should render the wordmark and a hamburger button', () => {
    render(<MobileTopBar onOpenNav={vi.fn()} />);
    expect(screen.getByText('TieTide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument();
  });

  it('should call onOpenNav when the hamburger is clicked', async () => {
    const user = userEvent.setup();
    const onOpenNav = vi.fn();
    render(<MobileTopBar onOpenNav={onOpenNav} />);
    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    expect(onOpenNav).toHaveBeenCalledTimes(1);
  });
});
