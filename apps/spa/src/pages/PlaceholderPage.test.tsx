import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderPage } from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('should render the provided title as a heading', () => {
    render(<PlaceholderPage title="Library" />);
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });

  it('should render the coming-soon copy', () => {
    render(<PlaceholderPage title="Settings" />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('should reflect the title prop dynamically', () => {
    const { rerender } = render(<PlaceholderPage title="Library" />);
    expect(screen.getByRole('heading')).toHaveTextContent('Library');
    rerender(<PlaceholderPage title="Connections" />);
    expect(screen.getByRole('heading')).toHaveTextContent('Connections');
  });
});
