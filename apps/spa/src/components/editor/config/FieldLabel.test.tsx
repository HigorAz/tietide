import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it('renders the label text without an uppercase class', () => {
    render(<FieldLabel htmlFor="f1" label="Query" />);
    const label = screen.getByText('Query');
    expect(label.className).not.toContain('uppercase');
  });

  it('renders a required dot when required', () => {
    render(<FieldLabel htmlFor="f1" label="Query" required />);
    expect(screen.getByTestId('field-label-required-dot')).toBeInTheDocument();
  });

  it('does not render a required dot when not required', () => {
    render(<FieldLabel htmlFor="f1" label="Query" />);
    expect(screen.queryByTestId('field-label-required-dot')).toBeNull();
  });

  it('renders an info trigger and shows the help text on focus when help is provided', async () => {
    render(
      <FieldLabel htmlFor="f1" label="Max results" help="The maximum number of items to return." />,
    );
    const trigger = screen.getByTestId('field-label-help');
    expect(trigger).toBeInTheDocument();
    fireEvent.focus(trigger);
    expect(await screen.findByText('The maximum number of items to return.')).toBeInTheDocument();
  });

  it('does not render an info trigger when no help is provided', () => {
    render(<FieldLabel htmlFor="f1" label="Query" />);
    expect(screen.queryByTestId('field-label-help')).toBeNull();
  });
});
