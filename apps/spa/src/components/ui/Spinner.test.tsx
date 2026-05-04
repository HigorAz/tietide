import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  describe('accessibility', () => {
    it('should render with role="status" and a default sr-only label', () => {
      render(<Spinner />);

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(status).toHaveTextContent(/loading/i);
    });

    it('should accept a custom label rendered for screen readers', () => {
      render(<Spinner label="Saving workflow" />);

      expect(screen.getByRole('status')).toHaveTextContent('Saving workflow');
    });

    it('should expose data-testid="spinner" on the wrapper', () => {
      render(<Spinner />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  describe('sizing', () => {
    it('should default to size sm with a 16px icon', () => {
      render(<Spinner />);

      const icon = screen.getByTestId('spinner').querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('width', '16');
      expect(icon).toHaveAttribute('height', '16');
    });

    it('should render a 20px icon at size md', () => {
      render(<Spinner size="md" />);

      const icon = screen.getByTestId('spinner').querySelector('svg');
      expect(icon).toHaveAttribute('width', '20');
      expect(icon).toHaveAttribute('height', '20');
    });

    it('should render a 24px icon at size lg', () => {
      render(<Spinner size="lg" />);

      const icon = screen.getByTestId('spinner').querySelector('svg');
      expect(icon).toHaveAttribute('width', '24');
      expect(icon).toHaveAttribute('height', '24');
    });
  });

  describe('animation', () => {
    it('should apply animate-spin to the spinning icon', () => {
      render(<Spinner />);

      const icon = screen.getByTestId('spinner').querySelector('svg');
      expect(icon?.getAttribute('class') ?? '').toMatch(/animate-spin/);
    });
  });

  describe('className', () => {
    it('should merge a caller-provided className onto the wrapper', () => {
      render(<Spinner className="text-accent-teal" />);

      expect(screen.getByTestId('spinner').className).toMatch(/text-accent-teal/);
    });
  });
});
