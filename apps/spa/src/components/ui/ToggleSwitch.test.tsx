import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders a switch role with aria-checked matching the checked prop', () => {
    const { rerender } = render(
      <ToggleSwitch checked={false} onChange={vi.fn()} label="Mock on dry run" />,
    );
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');

    rerender(<ToggleSwitch checked onChange={vi.fn()} label="Mock on dry run" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the negated value when clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="Toggle" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="Toggle" disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the label and, when provided, the description', () => {
    render(
      <ToggleSwitch
        checked={false}
        onChange={vi.fn()}
        label="Add error handler"
        description="Reveals a red output handle"
      />,
    );
    expect(screen.getByText('Add error handler')).toBeInTheDocument();
    expect(screen.getByText('Reveals a red output handle')).toBeInTheDocument();
  });

  it('applies an accent-teal track class when checked', () => {
    const { container } = render(
      <ToggleSwitch checked onChange={vi.fn()} label="On" data-testid="t" />,
    );
    expect(container.innerHTML).toContain('accent-teal');
  });
});
