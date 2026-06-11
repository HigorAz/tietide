import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OptionsSection } from './OptionsSection';

describe('OptionsSection', () => {
  it('is collapsed by default: header + meta visible, children absent', () => {
    render(
      <OptionsSection meta="2 options · defaults">
        <p>hidden child</p>
      </OptionsSection>,
    );
    expect(screen.getByText(/Options/)).toBeInTheDocument();
    expect(screen.getByText('2 options · defaults')).toBeInTheDocument();
    expect(screen.queryByText('hidden child')).toBeNull();
  });

  it('expands on header click and collapses again', () => {
    render(
      <OptionsSection meta="2 options · defaults">
        <p>hidden child</p>
      </OptionsSection>,
    );
    const header = screen.getByRole('button');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('hidden child')).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('hidden child')).toBeNull();
  });

  it('renders the full meta string verbatim', () => {
    render(
      <OptionsSection meta="2 options · defaults">
        <p>x</p>
      </OptionsSection>,
    );
    expect(screen.getByText('2 options · defaults')).toBeInTheDocument();
  });
});
